// キューを回すワーカー。server.ts から同一プロセスで呼ぶことも、`npm run worker` で単独起動もできる。
// 本体組み込み時は Railway の別サービス（form-worker）としてこのファイルを動かし、DBだけ共有／APIで取りに行く。
import fs from "node:fs";
import type { Browser } from "playwright";
import { getDb, allowsEmailFallback, type Campaign, type Job, type SenderProfile, type JobStatus } from "./db.js";
import { launchBrowser, submitToCompany, fetchSiteText, scanCompany } from "./engine.js";
import { composeMessage, findNgWords, activeProvider, lintMessage } from "./message.js";
import { hasEntity, extractLegalName } from "./company.js";
import { buildEmailBody, isOptedOut, sendEmail, senderEmailOk, explainSmtpError } from "./email.js";

const running = new Map<number, { stop: boolean }>();

/** 要確認画面で選ばれた回答（JSON）を安全に読む */
function parseManualAnswers(json: string): { label: string; answer: string }[] {
  try { const a = JSON.parse(json || "[]"); return Array.isArray(a) ? a.filter((x) => x && typeof x.label === "string" && typeof x.answer === "string") : []; } catch { return []; }
}
const CONCURRENCY = Number(process.env.FO_CONCURRENCY ?? 2);
const MIN_WAIT = Number(process.env.FO_MIN_WAIT_MS ?? 8000);
const MAX_WAIT = Number(process.env.FO_MAX_WAIT_MS ?? 15000);

export function isRunning(campaignId: number) {
  return running.has(campaignId);
}
export function requestStop(campaignId: number) {
  const r = running.get(campaignId);
  if (r) r.stop = true;
}

function nowJst(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
export function inSendWindow(c: Campaign): boolean {
  const d = nowJst();
  const h = d.getUTCHours();
  const wd = d.getUTCDay();
  if (c.weekdays_only && (wd === 0 || wd === 6)) return false;
  return h >= c.send_window_start && h < c.send_window_end;
}
export function sentToday(campaignId: number, channel?: "form" | "email"): number {
  const d = nowJst().toISOString().slice(0, 10);
  const r = getDb()
    .prepare(`SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND status='sent' AND is_test=0 AND substr(datetime(sent_at,'+9 hours'),1,10)=?${channel ? " AND channel=?" : ""}`)
    .get(...(channel ? [campaignId, d, channel] : [campaignId, d])) as { n: number };
  return r.n;
}
export const isScanning = (campaignId: number) => running.has(-campaignId);

function loadCampaign(id: number): { campaign: Campaign; sender: SenderProfile } {
  const db = getDb();
  const campaign = db.prepare("SELECT * FROM form_campaigns WHERE id=?").get(id) as Campaign | undefined;
  if (!campaign) throw new Error("campaign not found");
  const sender = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(campaign.sender_id) as SenderProfile;
  return { campaign, sender };
}

async function getSiteInfo(browser: Browser, job: Job, needed: boolean): Promise<{ title: string; text: string }> {
  if (!needed || !job.domain) return { title: "", text: "" };
  const db = getDb();
  const cached = db.prepare("SELECT title, text FROM site_cache WHERE domain=? AND fetched_at > datetime('now','-180 days')").get(job.domain) as { title: string; text: string } | undefined;
  if (cached) return cached;
  const info = await fetchSiteText(browser, job.site_url || job.form_url);
  db.prepare("INSERT INTO site_cache(domain,title,text) VALUES(?,?,?) ON CONFLICT(domain) DO UPDATE SET title=excluded.title,text=excluded.text,fetched_at=datetime('now')").run(job.domain, info.title, info.text);
  return info;
}

/** 1ジョブを処理して結果をDBに保存 */
export async function processJob(browser: Browser, jobId: number, opts: { dryRun?: boolean } = {}): Promise<Job> {
  const db = getDb();
  const job = db.prepare("SELECT * FROM form_jobs WHERE id=?").get(jobId) as Job;
  const { campaign, sender } = loadCampaign(job.campaign_id);
  // 事前チェックを通っていない場合の保険: 社名に法人格が無ければ、キャッシュ済みのHP本文から正式名称を補う（通信もAIも不要）
  if (!job.is_test && !hasEntity(job.company_name)) {
    const cached = db.prepare("SELECT title, text FROM site_cache WHERE domain=?").get(job.domain) as { title: string; text: string } | undefined;
    const legal = cached ? extractLegalName(job.company_name, `${cached.title}\n${cached.text}`) : null;
    if (legal) { db.prepare("UPDATE form_jobs SET company_name=? WHERE id=?").run(legal, jobId); job.company_name = legal; }
  }
  // 今回が再試行で、前回が失敗系だったら「直前の失敗」を覚えておく（送信済みになったとき履歴として見せる）
  const failLike = ["failed", "skip_no_form", "skip_captcha"];
  if (!job.is_test && failLike.includes(job.status)) {
    db.prepare("UPDATE form_jobs SET prev_status=?, prev_result=? WHERE id=?").run(job.status, (job.result_text || "").split("\n")[0].slice(0, 80), jobId);
  }
  db.prepare("UPDATE form_jobs SET status='sending', attempts=attempts+1, updated_at=datetime('now') WHERE id=?").run(jobId);

  const finish = (status: JobStatus, result: string, extra: Partial<Job> = {}) => {
    db.prepare(
      `UPDATE form_jobs SET status=@status, result_text=@result_text, message_used=COALESCE(@message_used, message_used),
        screenshot_path=COALESCE(@screenshot_path, screenshot_path), form_url=COALESCE(@form_url, form_url),
        pending_questions=CASE WHEN @status='sent' THEN '' ELSE COALESCE(@pending_questions, pending_questions) END,
        sent_at=CASE WHEN @status='sent' THEN datetime('now') ELSE sent_at END, updated_at=datetime('now') WHERE id=@id`
    ).run({ id: jobId, status, result_text: result, message_used: extra.message_used ?? null, screenshot_path: extra.screenshot_path ?? null, form_url: extra.form_url ?? null, pending_questions: extra.pending_questions ?? null });
    return db.prepare("SELECT * FROM form_jobs WHERE id=?").get(jobId) as Job;
  };

  // 除外リスト（送信直前にも確認）
  if (!job.is_test && db.prepare("SELECT 1 FROM form_suppressions WHERE domain=?").get(job.domain)) return finish("skip_suppressed", "除外リストに登録済み");

  // 文面
  let subject = "", message = "";
  try {
    // 企業HP本文が要るのは文面をAI生成するモードだけ。tpl_ai は文面テンプレなので取得不要（速く・安く）
    const needSite = (campaign.mode === "ai" || campaign.mode === "hybrid") && activeProvider() !== "none";
    const site = await getSiteInfo(browser, job, needSite);
    const composed = await composeMessage(job, sender, campaign, site);
    subject = composed.subject;
    message = composed.message;
  } catch (e) {
    return finish("failed", `文面生成エラー: ${String((e as Error).message ?? e).slice(0, 150)}`);
  }
  const ng = findNgWords(message);
  if (ng.length) return finish("failed", `NGワード検出: ${ng.join(", ")}`, { message_used: message });
  const errs = lintMessage(message, subject, campaign.channel).filter((l) => l.level === "error");
  if (errs.length) return finish("failed", `文面エラー: ${errs.map((e) => e.text).join(" / ")}`, { message_used: message });

  if (job.channel === "email") {
    if (!job.email) return finish("failed", "メールアドレスが無い", { message_used: message });
    if (isOptedOut(job.email)) return finish("skip_optout", "配信停止済みのアドレス", { message_used: message });
    const chk = senderEmailOk(sender);
    if (!chk.ok) return finish("failed", chk.reason ?? "差出人メールが使えません", { message_used: message });
    if (opts.dryRun) return finish("queued", "テスト（メールは送っていない）", { message_used: message });
    try {
      const body = buildEmailBody(message, sender);
      // 資料ファイルがあればメールに添付する（フォームは添付できないので本文リンクで対応済み）
      const attachments = campaign.attach_path && fs.existsSync(campaign.attach_path)
        ? [{ path: campaign.attach_path, filename: campaign.attach_name || "資料.pdf" }]
        : undefined;
      await sendEmail(sender, { from: chk.from, to: job.email, subject, ...body, attachments });
      return finish("sent", `メール送信（${job.email}）`, { message_used: message });
    } catch (e) {
      return finish("failed", `メール送信エラー: ${explainSmtpError(e, sender)}`, { message_used: message });
    }
  }

  const r = await submitToCompany(browser, { jobId, formUrl: job.form_url, siteUrl: job.site_url, sender, subject, message, dryRun: opts.dryRun, ignoreRefusal: Boolean(campaign.ignore_refusal), aiMode: (campaign.mode === "ai" || campaign.mode === "tpl_ai") && activeProvider() !== "none", company: job.company_name, manualAnswers: parseManualAnswers(job.manual_answers) });
  const detail = [r.detail, ...r.log].join("\n");
  if (r.status === "skip_refused" && job.domain && !campaign.ignore_refusal) {
    db.prepare("INSERT OR IGNORE INTO form_suppressions(domain, reason) VALUES(?,?)").run(job.domain, "営業お断り文言を検知（自動）");
  }
  const status: JobStatus = opts.dryRun ? "queued" : r.status;
  return finish(status, detail, { message_used: message, screenshot_path: r.screenshot, form_url: r.finalUrl && r.status !== "skip_no_form" ? r.finalUrl : undefined, pending_questions: r.pendingQuestions ? JSON.stringify(r.pendingQuestions) : undefined });
}

/** キャンペーンのキューを回す。停止要求・送信時間帯・日次上限を守る */
export async function runCampaign(campaignId: number, opts: { ignoreWindow?: boolean; onProgress?: (j: Job) => void } = {}): Promise<{ processed: number; reason: string }> {
  if (running.has(campaignId)) return { processed: 0, reason: "already running" };
  const state = { stop: false };
  running.set(campaignId, state);
  const db = getDb();
  db.prepare("UPDATE form_campaigns SET status='running' WHERE id=?").run(campaignId);
  let processed = 0;
  let reason = "queue empty";
  const browser = await launchBrowser();
  try {
    const worker = async () => {
      while (!state.stop) {
        const { campaign } = loadCampaign(campaignId);
        if (!opts.ignoreWindow && !inSendWindow(campaign)) { reason = "送信時間帯外"; return; }
        const formOk = sentToday(campaignId, "form") < campaign.daily_limit;
        const emailOk = sentToday(campaignId, "email") < campaign.email_daily_limit;
        if (!formOk && !emailOk) { reason = "本日の上限に到達"; return; }
        const channels = [formOk && "form", emailOk && "email"].filter(Boolean) as string[];
        const next = db.prepare(`SELECT id, channel FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0 AND channel IN (${channels.map(() => "?").join(",")}) ORDER BY id LIMIT 1`).get(campaignId, ...channels) as { id: number; channel: string } | undefined;
        if (!next) { reason = "queue empty or 本日の上限"; return; }
        // 取り合い防止（同一プロセス内の並列用）
        const claimed = db.prepare("UPDATE form_jobs SET status='sending' WHERE id=? AND status='queued'").run(next.id).changes;
        if (!claimed) continue;
        try {
          const j = await processJob(browser, next.id);
          processed++;
          opts.onProgress?.(j);
          // 自動再試行は「送信前の通信エラー」だけ。「送信後の判定不能」は送信ボタンを押し済みで、
          // 実際には届いていることが多い（例: 完了文言を知らなかっただけ）。再試行すると同じ会社に二重送信になるため除外する
          if (j.status === "failed" && j.attempts < 2 && !/送信後の判定不能/.test(j.result_text) && /(例外|timeout|Timeout|net::|ECONN|socket|接続)/.test(j.result_text)) {
            db.prepare("UPDATE form_jobs SET status='queued', result_text=? WHERE id=?").run(`再試行待ち: ${j.result_text.split("\n")[0]}`, j.id);
          }
        } catch (e) {
          db.prepare("UPDATE form_jobs SET status='failed', result_text=? WHERE id=?").run(`例外: ${String(e).slice(0, 150)}`, next.id);
        }
        const wait = next.channel === "email" ? 2000 + Math.random() * 3000 : MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
        await new Promise((r) => setTimeout(r, wait));
      }
      reason = "停止要求";
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    await browser.close().catch(() => {});
    running.delete(campaignId);
    const left = (db.prepare("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0").get(campaignId) as { n: number }).n;
    // 時間帯外・上限で止まった場合は running のまま残し、スケジューラが再開する
    db.prepare("UPDATE form_campaigns SET status=? WHERE id=?").run(left === 0 ? "done" : state.stop ? "paused" : "running", campaignId);
  }
  return { processed, reason };
}

/** 事前チェック: フォームの有無・お断り・CAPTCHA・メールを調べて振り分ける（フォーム無し→メールに切替） */
export async function scanCampaign(campaignId: number): Promise<{ scanned: number; reason: string }> {
  const key = -campaignId;
  if (running.has(key) || running.has(campaignId)) return { scanned: 0, reason: "already running" };
  const state = { stop: false };
  running.set(key, state);
  const db = getDb();
  let scanned = 0;
  let browser: Browser | null = null;
  try {
    const { campaign } = loadCampaign(campaignId);
    browser = await launchBrowser();
    for (;;) {
      if (state.stop) break;
      const job = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0 AND channel='form' AND scanned_at IS NULL ORDER BY id LIMIT 1").get(campaignId) as Job | undefined;
      if (!job) break;
      db.prepare("UPDATE form_jobs SET scanned_at=datetime('now') WHERE id=?").run(job.id);
      const r = await scanCompany(browser, { formUrl: job.form_url, siteUrl: job.site_url, companyName: job.company_name });
      // HPの表記から正式名称（法人格つき）が取れたら社名を補完する（「div」→「株式会社div」等。失礼を防ぐ）
      let nameNote = "";
      if (r.legalName && r.legalName !== job.company_name) {
        db.prepare("UPDATE form_jobs SET company_name=? WHERE id=?").run(r.legalName, job.id);
        nameNote = `／社名を補完: ${job.company_name} → ${r.legalName}`;
      }
      scanned++;
      const email = job.email || r.emails[0] || "";
      let status: JobStatus = "queued";
      let note = "";
      let channel: "form" | "email" = "form";
      if (r.refused && !campaign.ignore_refusal) {
        status = "skip_refused"; note = `営業お断り文言: 「${r.refused}」`;
        db.prepare("INSERT OR IGNORE INTO form_suppressions(domain, reason) VALUES(?,?)").run(job.domain, "営業お断り文言を検知（事前チェック）");
      } else if (r.captcha) { status = "skip_captcha"; note = `CAPTCHAあり (${r.captcha})`; }
      else if (r.formUrl) note = `フォームあり${r.emails.length ? `・メール発見 ${r.emails[0]}` : ""}`;
      else if (allowsEmailFallback(campaign.channel) && email && !isOptedOut(email)) { channel = "email"; note = `フォーム無し → メールに切替（${email}）`; }
      else { status = "skip_no_form"; note = r.note || "フォームが見つからない"; }
      if (nameNote) note += nameNote;
      db.prepare("UPDATE form_jobs SET status=?, channel=?, email=?, form_url=?, scan_note=?, result_text=?, updated_at=datetime('now') WHERE id=?")
        .run(status, channel, email, r.formUrl ?? job.form_url, note, status === "queued" ? `事前チェック: ${note}` : note, job.id);
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1500));
    }
    return { scanned, reason: state.stop ? "停止" : "done" };
  } catch (e) {
    return { scanned, reason: `エラー: ${String((e as Error).message ?? e).slice(0, 120)}` };
  } finally {
    await browser?.close().catch(() => {});
    running.delete(key);
  }
}

// 単独起動: 実行中(running)のキャンペーンを順に回し続ける（1分ごとに見直し）
if (process.argv[1] && /worker\.(ts|js)$/.test(process.argv[1])) {
  (async () => {
    console.log(`[form-worker] start provider=${activeProvider()} concurrency=${CONCURRENCY}`);
    for (;;) {
      const ids = getDb().prepare("SELECT id FROM form_campaigns WHERE status='running'").all() as { id: number }[];
      for (const { id } of ids) {
        const r = await runCampaign(id);
        if (r.processed) console.log(`[form-worker] campaign ${id}: ${r.processed}件 (${r.reason})`);
      }
      await new Promise((r) => setTimeout(r, 60000));
    }
  })();
}
