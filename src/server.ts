// 管理画面（localhost）。BRIDGE HATCH 組み込み時はこのルーティングを Next.js の API / 画面に移す。
import express from "express";
import multer from "multer";
import path from "node:path";
import { getDb, SCREENSHOT_DIR, domainOf, STATUS_LABEL, OUTCOME_LABEL, type Campaign, type Job, type SenderProfile } from "./db.js";
import { parseCompanyCsv, importRowsToCampaign } from "./csv.js";
import { composeMessage, activeProvider, DEFAULT_TEMPLATE, loadNgWords, lintMessage } from "./message.js";
import { optOut, testSmtp } from "./email.js";
import { runCampaign, requestStop, isRunning, isScanning, scanCampaign, processJob, inSendWindow, sentToday } from "./worker.js";
import { launchBrowser } from "./engine.js";
import { layout, campaignListView, sendersView, senderForm, campaignForm, campaignView, jobView, suppressionsView, settingsView } from "./views.js";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/screenshots", express.static(SCREENSHOT_DIR));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const db = getDb();

const flashes = new Map<string, string>();
function redirectWith(res: express.Response, to: string, msg: string) {
  flashes.set(to, msg);
  res.redirect(to);
}
function takeFlash(req: express.Request) {
  const m = flashes.get(req.path) ?? "";
  flashes.delete(req.path);
  return m;
}

// ---- campaigns ----
app.get("/", (req, res) => {
  const rows = db.prepare(`SELECT c.*, s.label sender_label,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0) total,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='sent') sent,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='queued') queued
    FROM form_campaigns c JOIN sender_profiles s ON s.id=c.sender_id ORDER BY c.id DESC`).all() as any[];
  res.send(layout("キャンペーン", campaignListView(rows, activeProvider()), takeFlash(req)));
});

app.get("/campaigns/new", (req, res) => {
  const senders = db.prepare("SELECT * FROM sender_profiles ORDER BY id").all() as SenderProfile[];
  res.send(layout("新規キャンペーン", campaignForm(senders, { template_text: DEFAULT_TEMPLATE }, activeProvider()), takeFlash(req)));
});

app.post("/campaigns", (req, res) => {
  const b = req.body;
  const channel = ["form", "email", "both"].includes(b.channel) ? b.channel : "both";
  const r = db.prepare(`INSERT INTO form_campaigns(name, sender_id, mode, subject_text, template_text, ai_instruction, daily_limit, send_window_start, send_window_end, weekdays_only, channel, email_daily_limit, resend_days, ignore_refusal)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.name, Number(b.sender_id), b.mode, b.subject_text ?? "", b.template_text ?? "", b.ai_instruction ?? "", Number(b.daily_limit) || 300, Number(b.send_window_start) || 9, Number(b.send_window_end) || 18, Number(b.weekdays_only) ? 1 : 0, channel, Number(b.email_daily_limit) || 100, Math.max(0, Number(b.resend_days ?? 90) || 0), Number(b.ignore_refusal) ? 1 : 0);
  redirectWith(res, `/campaigns/${r.lastInsertRowid}`, "キャンペーンを作成しました。CSVを取り込んでください。");
});

function loadCampaignFull(id: number) {
  const c = db.prepare("SELECT * FROM form_campaigns WHERE id=?").get(id) as Campaign | undefined;
  if (!c) return null;
  const sender = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(c.sender_id) as SenderProfile;
  return { ...c, sender };
}

const previews = new Map<number, { job: Job; subject: string; message: string; aiUsed: boolean; lint?: import("./message.js").Lint[] }>();

app.get("/campaigns/:id", (req, res) => {
  const id = Number(req.params.id);
  const c = loadCampaignFull(id);
  if (!c) return res.status(404).send("not found");
  const jobs = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? ORDER BY updated_at DESC, id DESC LIMIT 200").all(id) as Job[];
  const counts: Record<string, number> = {};
  for (const r of db.prepare("SELECT status, COUNT(*) n FROM form_jobs WHERE campaign_id=? AND is_test=0 GROUP BY status").all(id) as { status: string; n: number }[]) counts[r.status] = r.n;
  const preview = previews.get(id) ?? null;
  previews.delete(id);
  const outcomes: Record<string, number> = {};
  for (const r of db.prepare("SELECT outcome, COUNT(*) n FROM form_jobs WHERE campaign_id=? AND is_test=0 AND outcome != '' GROUP BY outcome").all(id) as { outcome: string; n: number }[]) outcomes[r.outcome] = r.n;
  const unscanned = (db.prepare("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0 AND channel='form' AND scanned_at IS NULL").get(id) as { n: number }).n;
  res.send(layout(c.name, campaignView(c, jobs, counts, isRunning(id), activeProvider(), { preview, windowOk: inSendWindow(c), sentToday: sentToday(id, "form"), emailSentToday: sentToday(id, "email"), scanning: isScanning(id), unscanned, outcomes }), takeFlash(req)));
});

app.post("/campaigns/:id/import", upload.single("csv"), (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) return redirectWith(res, `/campaigns/${id}`, "CSVが選択されていません");
  try {
    const rows = parseCompanyCsv(req.file.buffer);
    const s = importRowsToCampaign(id, rows);
    redirectWith(res, `/campaigns/${id}`, `取り込み完了: 登録 ${s.added}件（フォーム${s.addedForm}・メール${s.addedEmail}） / 除外 ${s.excluded + s.suppressed} / 重複・90日以内 ${s.duplicated} / 連絡先無し ${s.noUrl}（CSV ${rows.length}行）`);
  } catch (e) {
    redirectWith(res, `/campaigns/${id}`, `取り込みエラー: ${String((e as Error).message)}`);
  }
});

app.post("/campaigns/:id/preview", async (req, res) => {
  const id = Number(req.params.id);
  const c = loadCampaignFull(id);
  if (!c) return res.status(404).send("not found");
  const job = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0 ORDER BY id LIMIT 1").get(id) as Job | undefined;
  if (!job) return redirectWith(res, `/campaigns/${id}`, "待機中の会社がありません。先にCSVを取り込んでください");
  try {
    let site = { title: "", text: "" };
    if (c.mode !== "template" && activeProvider() !== "none") {
      const cached = db.prepare("SELECT title,text FROM site_cache WHERE domain=?").get(job.domain) as any;
      if (cached) site = cached;
      else {
        const { fetchSiteText } = await import("./engine.js");
        const browser = await launchBrowser();
        try { site = await fetchSiteText(browser, job.site_url || job.form_url); } finally { await browser.close(); }
        db.prepare("INSERT OR REPLACE INTO site_cache(domain,title,text) VALUES(?,?,?)").run(job.domain, site.title, site.text);
      }
    }
    const composed = await composeMessage(job, c.sender, c, site);
    previews.set(id, { job, ...composed, lint: lintMessage(composed.message, composed.subject, c.channel) });
    res.redirect(`/campaigns/${id}`);
  } catch (e) {
    redirectWith(res, `/campaigns/${id}`, `プレビュー生成エラー: ${String((e as Error).message)}`);
  }
});

app.post("/campaigns/:id/test", async (req, res) => {
  const id = Number(req.params.id);
  const url = String(req.body.url ?? "").trim();
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const dry = req.body.dry === "1";
  const company = String(req.body.company || "テスト株式会社");
  if (!url && !email) return redirectWith(res, `/campaigns/${id}`, "テスト先のフォームURLか、自分のメールアドレスを入れてください");
  const r = email
    ? db.prepare("INSERT INTO form_jobs(campaign_id, company_name, form_url, site_url, industry, domain, is_test, channel, email) VALUES(?,?,?,?,?,?,1,'email',?)").run(id, company, "", "", "テスト業種", email.split("@")[1] ?? "", email)
    : db.prepare("INSERT INTO form_jobs(campaign_id, company_name, form_url, site_url, industry, domain, is_test) VALUES(?,?,?,?,?,?,1)").run(id, company, url, url, "テスト業種", domainOf(url));
  const browser = await launchBrowser();
  try {
    const j = await processJob(browser, Number(r.lastInsertRowid), { dryRun: dry });
    redirectWith(res, `/jobs/${j.id}`, dry ? "入力テストが終わりました。スクリーンショットで入力内容を確認してください" : `テスト送信の結果: ${j.status}`);
  } catch (e) {
    redirectWith(res, `/campaigns/${id}`, `テスト送信エラー: ${String((e as Error).message)}`);
  } finally {
    await browser.close().catch(() => {});
  }
});

app.post("/campaigns/:id/start", (req, res) => {
  const id = Number(req.params.id);
  if (isRunning(id)) return redirectWith(res, `/campaigns/${id}`, "すでに実行中です");
  db.prepare("UPDATE form_campaigns SET status='running' WHERE id=?").run(id);
  const ignoreWindow = req.body.ignore_window === "1";
  runCampaign(id, { ignoreWindow }).then((r) => console.log(`[campaign ${id}] ${r.processed}件処理 (${r.reason})`)).catch((e) => console.error(e));
  redirectWith(res, `/campaigns/${id}`, ignoreWindow ? "送信を開始しました（時間帯を無視）" : "送信を開始しました。送信時間帯外の場合は時間になると自動で始まります");
});

app.post("/campaigns/:id/scan", (req, res) => {
  const id = Number(req.params.id);
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "実行中です");
  scanCampaign(id).then((r) => console.log(`[scan ${id}] ${r.scanned}件 (${r.reason})`)).catch((e) => console.error(e));
  redirectWith(res, `/campaigns/${id}`, "事前チェックを始めました（1社5〜10秒）");
});
app.post("/campaigns/:id/stop-scan", (req, res) => {
  const id = Number(req.params.id);
  requestStop(-id);
  redirectWith(res, `/campaigns/${id}`, "事前チェックを止めます");
});

app.post("/jobs/:id/outcome", (req, res) => {
  const id = Number(req.params.id);
  const j = db.prepare("SELECT * FROM form_jobs WHERE id=?").get(id) as Job | undefined;
  if (!j) return res.status(404).send("not found");
  const outcome = ["", "replied", "appointment", "declined"].includes(req.body.outcome) ? req.body.outcome : j.outcome;
  db.prepare("UPDATE form_jobs SET outcome=?, outcome_note=?, updated_at=datetime('now') WHERE id=?").run(outcome, String(req.body.note ?? "").slice(0, 300), id);
  if (outcome === "declined") {
    if (j.domain) db.prepare("INSERT OR IGNORE INTO form_suppressions(domain, reason) VALUES(?,?)").run(j.domain, `断り（${j.company_name}）`);
    if (j.email) optOut(j.email, `断り（${j.company_name}）`);
  }
  redirectWith(res, `/jobs/${id}`, "反応を記録しました");
});

app.post("/senders/:id/test", async (req, res) => {
  const s = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(Number(req.params.id)) as SenderProfile | undefined;
  if (!s) return res.status(404).send("not found");
  try {
    if (!s.smtp_user || !s.smtp_pass) throw new Error("送信用メールアカウントが未設定です");
    await testSmtp(s);
    redirectWith(res, `/senders/${s.id}`, `メール送信OK（${s.smtp_user}）`);
  } catch (e) {
    redirectWith(res, `/senders/${s.id}`, `接続できませんでした: ${String((e as Error).message).slice(0, 150)}`);
  }
});

app.post("/campaigns/:id/pause", (req, res) => {
  const id = Number(req.params.id);
  requestStop(id);
  db.prepare("UPDATE form_campaigns SET status='paused' WHERE id=?").run(id);
  redirectWith(res, `/campaigns/${id}`, "一時停止を要求しました（処理中の1件が終わってから止まります）");
});

app.get("/campaigns/:id/export.csv", (req, res) => {
  const id = Number(req.params.id);
  const jobs = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? AND is_test=0 ORDER BY id").all(id) as Job[];
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["企業名,送り方,送信先,業種,状態,結果,反応,メモ,送信日時", ...jobs.map((j) => [j.company_name, j.channel === "email" ? "メール" : "フォーム", j.channel === "email" ? j.email : j.form_url, j.sub_industry || j.industry, STATUS_LABEL[j.status] ?? j.status, (j.result_text || "").split("\n")[0], OUTCOME_LABEL[j.outcome] ?? "", j.outcome_note, j.sent_at ?? ""].map(q).join(","))];
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename=campaign-${id}.csv`);
  res.send("﻿" + lines.join("\n"));
});

/** 手動送信リスト: CAPTCHA等で自動送信できなかった会社を、人が送るためのURL＋文面つきで書き出す */
app.get("/campaigns/:id/manual.csv", async (req, res) => {
  const id = Number(req.params.id);
  const c = loadCampaignFull(id);
  if (!c) return res.status(404).send("not found");
  const jobs = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? AND is_test=0 AND status IN ('skip_captcha','failed','skip_no_form') ORDER BY id").all(id) as Job[];
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["企業名,理由,フォームURL,企業URL,メール,件名,本文"];
  for (const j of jobs) {
    let message = j.message_used, subject = c.subject_text;
    if (!message) {
      try { const comp = await composeMessage(j, c.sender, { ...c, mode: "template" }, { title: "", text: "" }); message = comp.message; subject = comp.subject; } catch { message = ""; }
    }
    lines.push([j.company_name, (j.result_text || "").split("\n")[0], j.form_url, j.site_url, j.email, subject, message].map(q).join(","));
  }
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename=manual-${id}.csv`);
  res.send("\ufeff" + lines.join("\n"));
});

// ---- jobs ----
app.get("/jobs/:id", (req, res) => {
  const j = db.prepare("SELECT * FROM form_jobs WHERE id=?").get(Number(req.params.id)) as Job | undefined;
  if (!j) return res.status(404).send("not found");
  const c = db.prepare("SELECT * FROM form_campaigns WHERE id=?").get(j.campaign_id) as Campaign;
  res.send(layout(j.company_name, jobView(j, c), takeFlash(req)));
});
app.post("/jobs/:id/retry", async (req, res) => {
  const id = Number(req.params.id);
  const browser = await launchBrowser();
  try {
    const j = await processJob(browser, id);
    redirectWith(res, `/jobs/${id}`, `再試行の結果: ${j.status}`);
  } finally {
    await browser.close().catch(() => {});
  }
});

// ---- senders ----
app.get("/senders", (req, res) => {
  const list = db.prepare("SELECT * FROM sender_profiles ORDER BY id").all() as SenderProfile[];
  res.send(layout("送信者", sendersView(list), takeFlash(req)));
});
app.get("/senders/:id", (req, res) => {
  const s = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(Number(req.params.id)) as SenderProfile | undefined;
  if (!s) return res.status(404).send("not found");
  res.send(layout("送信者を編集", `<h1>送信者を編集</h1><div class="card">${senderForm(s)}</div>`, takeFlash(req)));
});
const SENDER_COLS = ["label", "company", "industry", "person", "person_kana", "email", "reply_email", "tel", "postal", "address", "url", "from_email", "smtp_user", "smtp_host", "smtp_port"];
app.post("/senders", (req, res) => {
  const vals = SENDER_COLS.map((k) => String(req.body[k] ?? "").trim());
  db.prepare(`INSERT INTO sender_profiles(${SENDER_COLS.join(",")}, smtp_pass) VALUES(${SENDER_COLS.map(() => "?").join(",")}, ?)`).run(...vals, String(req.body.smtp_pass ?? "").trim());
  redirectWith(res, "/senders", "送信者を追加しました");
});
app.post("/senders/:id", (req, res) => {
  const vals = SENDER_COLS.map((k) => String(req.body[k] ?? "").trim());
  const pass = String(req.body.smtp_pass ?? "").trim();
  db.prepare(`UPDATE sender_profiles SET ${SENDER_COLS.map((c) => `${c}=?`).join(",")}${pass ? ", smtp_pass=?" : ""} WHERE id=?`).run(...vals, ...(pass ? [pass] : []), Number(req.params.id));
  redirectWith(res, "/senders", "保存しました");
});

// ---- suppressions / settings ----
app.get("/suppressions", (req, res) => {
  const rows = db.prepare("SELECT * FROM form_suppressions ORDER BY id DESC").all() as any[];
  const optouts = db.prepare("SELECT * FROM email_optouts ORDER BY created_at DESC LIMIT 500").all() as any[];
  res.send(layout("除外リスト", suppressionsView(rows, optouts), takeFlash(req)));
});
app.post("/suppressions", (req, res) => {
  const raw = String(req.body.domain ?? "").trim();
  if (raw.includes("@")) { optOut(raw, String(req.body.reason ?? "") || "手動"); return redirectWith(res, "/suppressions", `${raw} を配信停止に追加しました`); }
  const domain = domainOf(raw) || raw.toLowerCase();
  if (domain) db.prepare("INSERT OR IGNORE INTO form_suppressions(domain, reason) VALUES(?,?)").run(domain, String(req.body.reason ?? ""));
  redirectWith(res, "/suppressions", `${domain} を除外リストに追加しました`);
});
app.post("/suppressions/:id/delete", (req, res) => {
  db.prepare("DELETE FROM form_suppressions WHERE id=?").run(Number(req.params.id));
  redirectWith(res, "/suppressions", "削除しました");
});
app.get("/settings", (req, res) => res.send(layout("設定", settingsView(loadNgWords(), activeProvider()), takeFlash(req))));
app.post("/settings", (req, res) => {
  const words = String(req.body.ng_words ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  db.prepare("INSERT INTO settings(key,value) VALUES('ng_words',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(words));
  redirectWith(res, "/settings", "保存しました");
});

// ---- 簡易スケジューラ: running のキャンペーンを送信時間帯に自動再開 ----
setInterval(() => {
  const ids = db.prepare("SELECT id FROM form_campaigns WHERE status='running'").all() as { id: number }[];
  for (const { id } of ids) if (!isRunning(id)) runCampaign(id).catch((e) => console.error(e));
}, 60000);

const PORT = Number(process.env.PORT ?? 3210);
app.listen(PORT, () => console.log(`【フォーム＆メール】アポハッチくん: http://localhost:${PORT}  (AI: ${activeProvider()}, data: ${path.resolve(process.env.DATA_DIR ?? "data")})`));
