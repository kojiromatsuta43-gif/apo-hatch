// 管理画面（localhost）。BRIDGE HATCH 組み込み時はこのルーティングを Next.js の API / 画面に移す。
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb, SCREENSHOT_DIR, MATERIAL_DIR, domainOf, STATUS_LABEL, OUTCOME_LABEL, type Campaign, type Job, type SenderProfile } from "./db.js";
import { parseCompanyCsv, parseCompanyXlsx, importRowsToCampaign, parseSuppressionCsv, importSuppressions, type ImportSummary, type CompanyRow } from "./csv.js";
import { composeMessage, activeProvider, activeAiConfig, aiStatusLabel, testAiConnection, AI_MODELS, DEFAULT_TEMPLATE, loadNgWords, lintMessage } from "./message.js";
import { optOut, testSmtp, explainSmtpError, checkSmtpPassword } from "./email.js";
import { runCampaign, requestStop, isRunning, isScanning, scanCampaign, processJob, inSendWindow, sentToday } from "./worker.js";
import { launchBrowser } from "./engine.js";
import { checkUpdate, applyUpdate, requestRestart, currentVersion } from "./update.js";
import { layout, campaignListView, sendersView, senderForm, campaignForm, campaignView, jobView, suppressionsView, settingsView, loginPage, passwordView, usersView, updateView, testView, gameView, importPreviewView, errKind, type NavUser } from "./views.js";
import { authMiddleware, requireAdmin, startSession, endSession, findUser, verifyPassword, createUser, setPassword, listUsers, ensureFirstAdmin, randomPassword, cleanupSessions, type AuthedRequest } from "./auth.js";

const app = express();
app.use(express.urlencoded({ extended: false }));
// ゲームの音声など静的アセット（src の1つ上の assets/ を配信）
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
app.use("/assets", express.static(ASSETS_DIR, { maxAge: "1h" }));
app.use(authMiddleware);
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

// ---- ログイン中のユーザー ----
function me(req: express.Request) {
  const u = (req as AuthedRequest).user;
  if (!u) throw new Error("not authenticated");
  return u;
}
let updateReady = false;
function refreshUpdateFlag() {
  checkUpdate().then((st) => { updateReady = st.available; }).catch(() => {});
}

// おまけゲームは「メインのポート」でだけ表示する。別ポート(=CLEAN_PORT)で開くとゲームが一切出ない
// ＝人に画面を見せるときはそちらのURLを使う（同じデータ・同じログイン）。
const GAME_PORT = Number(process.env.PORT ?? 3210);
const CLEAN_PORT = Number(process.env.CLEAN_PORT ?? GAME_PORT + 1);
function gameOnFor(req: express.Request): boolean {
  if (process.env.GAME === "0" || process.env.GAME === "off") return false; // 完全に無効化したいとき
  return req.socket.localPort !== CLEAN_PORT; // CLEAN_PORT 以外（＝メイン）ではON
}
function navUser(req: express.Request): NavUser {
  const u = (req as AuthedRequest).user;
  return u ? { username: u.username, display_name: u.display_name, role: u.role, gameOn: gameOnFor(req) } : null;
}
/** 管理者は全部、一般ユーザーは自分のものだけ */
function scope(req: express.Request): { sql: string; args: number[] } {
  const u = me(req);
  return u.role === "admin" ? { sql: "1=1", args: [] } : { sql: "owner_user_id=?", args: [u.id] };
}
function ownedCampaign(req: express.Request, id: number): Campaign | undefined {
  const sc = scope(req);
  return db.prepare(`SELECT * FROM form_campaigns WHERE id=? AND ${sc.sql}`).get(id, ...sc.args) as Campaign | undefined;
}
function ownedSender(req: express.Request, id: number): SenderProfile | undefined {
  const sc = scope(req);
  return db.prepare(`SELECT * FROM sender_profiles WHERE id=? AND ${sc.sql}`).get(id, ...sc.args) as SenderProfile | undefined;
}
/** ジョブは所属キャンペーン経由で権限を見る */
function ownedJob(req: express.Request, id: number): Job | undefined {
  const j = db.prepare("SELECT * FROM form_jobs WHERE id=?").get(id) as Job | undefined;
  if (!j) return undefined;
  return ownedCampaign(req, j.campaign_id) ? j : undefined;
}
const DENIED = "この画面を見る権限がありません";

/** スクリーンショットは自分のジョブのものだけ見せる（ファイル名 job-<id>.png） */
app.get("/screenshots/:file", (req, res) => {
  const file = String(req.params.file);
  const m = /^job-(\d+)\.png$/.exec(file);
  if (!m || !ownedJob(req, Number(m[1]))) return res.status(404).send("not found");
  res.sendFile(path.join(SCREENSHOT_DIR, file));
});

// ---- ログイン画面 ----
app.get("/login", (req, res) => {
  if ((req as AuthedRequest).user) return res.redirect("/");
  res.send(loginPage({ next: String(req.query.next ?? "/") }));
});
app.post("/login", (req, res) => {
  const next = String(req.body.next || "/");
  const u = findUser(String(req.body.username ?? ""));
  if (!u || !u.active || !verifyPassword(String(req.body.password ?? ""), u.password_hash)) {
    return res.status(401).send(loginPage({ error: "ログインIDかパスワードが違います", next }));
  }
  startSession(res, u.id);
  res.redirect(next.startsWith("/") ? next : "/");
});
app.get("/logout", (req, res) => {
  endSession(req, res);
  res.redirect("/login");
});

// ---- パスワード変更（本人）----
app.get("/password", (req, res) => res.send(layout("パスワードの変更", passwordView(Boolean(me(req).must_change)), takeFlash(req), navUser(req), updateReady)));
app.post("/password", (req, res) => {
  const u = me(req);
  const cur = String(req.body.current ?? "");
  const n1 = String(req.body.next1 ?? ""), n2 = String(req.body.next2 ?? "");
  if (!u.must_change && !verifyPassword(cur, u.password_hash)) return redirectWith(res, "/password", "いまのパスワードが違います");
  if (n1 !== n2) return redirectWith(res, "/password", "新しいパスワードが一致しません");
  try {
    setPassword(u.id, n1, false);
    redirectWith(res, "/", "パスワードを変更しました");
  } catch (e) {
    redirectWith(res, "/password", String((e as Error).message));
  }
});

// ---- ユーザー管理（管理者のみ）----
const issuedOnce = new Map<number, { username: string; password: string }>();
app.get("/users", requireAdmin, (req, res) => {
  const issued = issuedOnce.get(me(req).id);
  issuedOnce.delete(me(req).id);
  res.send(layout("ユーザー管理", usersView(listUsers(), issued), takeFlash(req), navUser(req), updateReady));
});
app.post("/users", requireAdmin, (req, res) => {
  const password = String(req.body.password ?? "").trim() || randomPassword();
  try {
    const u = createUser(String(req.body.username ?? ""), password, {
      role: req.body.role === "admin" ? "admin" : "user",
      displayName: String(req.body.display_name ?? "").trim(),
      mustChange: true,
    });
    issuedOnce.set(me(req).id, { username: u.username, password });
    res.redirect("/users");
  } catch (e) {
    redirectWith(res, "/users", String((e as Error).message));
  }
});
app.post("/users/:id/reset", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id) as { username: string } | undefined;
  if (!u) return redirectWith(res, "/users", "見つかりません");
  const password = randomPassword();
  setPassword(id, password, true);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  issuedOnce.set(me(req).id, { username: u.username, password });
  res.redirect("/users");
});
app.post("/users/:id/toggle", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === me(req).id) return redirectWith(res, "/users", "自分自身は停止できません");
  db.prepare("UPDATE users SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?").run(id);
  db.prepare("DELETE FROM sessions WHERE user_id=? AND (SELECT active FROM users WHERE id=?)=0").run(id, id);
  redirectWith(res, "/users", "変更しました");
});

// ---- campaigns ----
app.get("/", (req, res) => {
  const rows = db.prepare(`SELECT c.*, s.label sender_label,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0) total,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='sent') sent,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='queued') queued,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.outcome IN ('replied','appointment')) reactions,
      (SELECT MAX(sent_at) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='sent') last_sent
    FROM form_campaigns c JOIN sender_profiles s ON s.id=c.sender_id WHERE ${scope(req).sql.replace("owner_user_id", "c.owner_user_id")} ORDER BY c.id DESC`).all(...scope(req).args) as any[];
  res.send(layout("キャンペーン", campaignListView(rows, aiStatusLabel()), takeFlash(req), navUser(req), updateReady));
});

app.get("/campaigns/new", (req, res) => {
  const sc = scope(req);
  const senders = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as SenderProfile[];
  res.send(layout("新規キャンペーン", campaignForm(senders, { template_text: DEFAULT_TEMPLATE }, activeProvider()), takeFlash(req), navUser(req), updateReady));
});

app.post("/campaigns", upload.single("material_file"), (req, res) => {
  const b = req.body;
  const channel = ["form_first", "email_first", "email_only", "form_only", "form", "email", "both"].includes(b.channel) ? b.channel : "form_first";
  if (!ownedSender(req, Number(b.sender_id))) return redirectWith(res, "/campaigns/new", "送信者を選び直してください");
  const materialUrl = String(b.material_url ?? "").trim();
  const r = db.prepare(`INSERT INTO form_campaigns(owner_user_id, name, sender_id, mode, subject_text, template_text, ai_instruction, daily_limit, send_window_start, send_window_end, weekdays_only, channel, email_daily_limit, resend_days, ignore_refusal, material_url)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(me(req).id, b.name, Number(b.sender_id), b.mode, b.subject_text ?? "", b.template_text ?? "", b.ai_instruction ?? "", Number(b.daily_limit) || 300, Number(b.send_window_start) || 9, Number(b.send_window_end) || 18, Number(b.weekdays_only) ? 1 : 0, channel, Number(b.email_daily_limit) || 100, Math.max(0, Number(b.resend_days ?? 90) || 0), Number(b.ignore_refusal) ? 1 : 0, materialUrl);
  const cid = Number(r.lastInsertRowid);
  // 資料ファイル（メール添付用）を保存する
  if (req.file) saveMaterial(cid, req.file);
  redirectWith(res, `/campaigns/${cid}`, "キャンペーンを作成しました。CSVを取り込んでください。");
});

// ---- キャンペーン編集 ----
app.get("/campaigns/:id/edit", (req, res) => {
  const id = Number(req.params.id);
  const c = ownedCampaign(req, id);
  if (!c) return res.status(404).send("not found");
  const sc = scope(req);
  const senders = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as SenderProfile[];
  res.send(layout(`編集 | ${c.name}`, campaignForm(senders, c, activeProvider(), id), takeFlash(req), navUser(req), updateReady));
});
app.post("/campaigns/:id/edit", upload.single("material_file"), (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(404).send("not found");
  const b = req.body;
  const channel = ["form_first", "email_first", "email_only", "form_only", "form", "email", "both"].includes(b.channel) ? b.channel : "form_first";
  if (!ownedSender(req, Number(b.sender_id))) return redirectWith(res, `/campaigns/${id}/edit`, "送信者を選び直してください");
  db.prepare(`UPDATE form_campaigns SET name=?, sender_id=?, mode=?, subject_text=?, template_text=?, ai_instruction=?, daily_limit=?, send_window_start=?, send_window_end=?, weekdays_only=?, channel=?, email_daily_limit=?, resend_days=?, ignore_refusal=?, material_url=? WHERE id=?`)
    .run(b.name, Number(b.sender_id), b.mode, b.subject_text ?? "", b.template_text ?? "", b.ai_instruction ?? "", Number(b.daily_limit) || 300, Number(b.send_window_start) || 9, Number(b.send_window_end) || 18, Number(b.weekdays_only) ? 1 : 0, channel, Number(b.email_daily_limit) || 100, Math.max(0, Number(b.resend_days ?? 90) || 0), Number(b.ignore_refusal) ? 1 : 0, String(b.material_url ?? "").trim(), id);
  if (req.file) saveMaterial(id, req.file);
  redirectWith(res, `/campaigns/${id}`, "キャンペーンを保存しました");
});

// 資料ファイルを DATA_DIR/materials に保存し、キャンペーンに紐づける
function saveMaterial(campaignId: number, file: Express.Multer.File) {
  const safeExt = path.extname(file.originalname).replace(/[^.\w]/g, "").slice(0, 10) || ".pdf";
  const dest = path.join(MATERIAL_DIR, `campaign-${campaignId}${safeExt}`);
  fs.writeFileSync(dest, file.buffer);
  const name = Buffer.from(file.originalname, "latin1").toString("utf8"); // multer は元名を latin1 で持つ
  db.prepare("UPDATE form_campaigns SET attach_path=?, attach_name=? WHERE id=?").run(dest, name || `資料${safeExt}`, campaignId);
}

function loadCampaignFull(req: express.Request, id: number) {
  const c = ownedCampaign(req, id);
  if (!c) return null;
  const sender = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(c.sender_id) as SenderProfile;
  return { ...c, sender };
}

const lastImports = new Map<number, ImportSummary>();
const pendingImports = new Map<number, { rows: CompanyRow[]; srcLabel: string }>();
const previews = new Map<number, { job: Job; subject: string; message: string; aiUsed: boolean; lint?: import("./message.js").Lint[] }>();

app.get("/campaigns/:id", (req, res) => {
  const id = Number(req.params.id);
  const c = loadCampaignFull(req, id);
  if (!c) return res.status(404).send("not found");
  const statusFilter = typeof req.query.status === "string" && req.query.status in STATUS_LABEL ? req.query.status : "";
  const qFilter = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
  const outcomeFilter = ["replied", "appointment", "declined", "none"].includes(String(req.query.outcome)) ? String(req.query.outcome) : "";
  const where = ["campaign_id=?"];
  const args: (string | number)[] = [id];
  if (statusFilter) { where.push("status=?"); args.push(statusFilter); }
  if (qFilter) { where.push("(company_name LIKE ? OR domain LIKE ?)"); args.push(`%${qFilter}%`, `%${qFilter}%`); }
  if (outcomeFilter === "none") where.push("outcome=''");
  else if (outcomeFilter) { where.push("outcome=?"); args.push(outcomeFilter); }
  const jobs = db.prepare(`SELECT * FROM form_jobs WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT 200`).all(...args) as Job[];
  const counts: Record<string, number> = {};
  // 会社（ドメイン）単位で重複を除いた実数と、試行回数の合計を状態ごとに集計する
  const attempts: Record<string, number> = {};
  for (const r of db.prepare("SELECT status, COUNT(DISTINCT COALESCE(NULLIF(domain,''), CAST(id AS TEXT))) n, SUM(attempts) a FROM form_jobs WHERE campaign_id=? AND is_test=0 GROUP BY status").all(id) as { status: string; n: number; a: number }[]) { counts[r.status] = r.n; attempts[r.status] = r.a ?? 0; }
  const preview = previews.get(id) ?? null;
  previews.delete(id);
  const consumedImport = lastImports.get(id) ?? null;
  lastImports.delete(id);
  const outcomes: Record<string, number> = {};
  for (const r of db.prepare("SELECT outcome, COUNT(*) n FROM form_jobs WHERE campaign_id=? AND is_test=0 AND outcome != '' GROUP BY outcome").all(id) as { outcome: string; n: number }[]) outcomes[r.outcome] = r.n;
  const unscanned = (db.prepare("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0 AND channel='form' AND scanned_at IS NULL").get(id) as { n: number }).n;
  const scanned = (db.prepare("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND is_test=0 AND scanned_at IS NOT NULL").get(id) as { n: number }).n;
  res.send(layout(c.name, campaignView(c, jobs, counts, isRunning(id), aiStatusLabel(), { preview, windowOk: inSendWindow(c), sentToday: sentToday(id, "form"), emailSentToday: sentToday(id, "email"), scanning: isScanning(id), unscanned, scanned, statusFilter, qFilter, outcomeFilter, attempts, outcomes, lastImport: consumedImport }), takeFlash(req), navUser(req), updateReady));
});

// 実行中の画面が2.5秒ごとに見る進捗API。バーの更新と「終わったら自動でページ更新」に使う
app.get("/campaigns/:id/progress", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).json({ error: "denied" });
  const n = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  const unscanned = n("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0 AND channel='form' AND scanned_at IS NULL");
  const scanDone = n("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND is_test=0 AND scanned_at IS NOT NULL");
  const total = n("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND is_test=0");
  const queued = n("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0");
  res.json({ scanning: isScanning(id), running: isRunning(id), scanDone, scanTotal: scanDone + unscanned, total, processed: total - queued });
});

// テスト送信の専用ページ（入力と履歴をキャンペーン画面から分離）
app.get("/campaigns/:id/test", (req, res) => {
  const id = Number(req.params.id);
  const c = loadCampaignFull(req, id);
  if (!c) return res.status(404).send("not found");
  const tests = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? AND is_test=1 ORDER BY id DESC LIMIT 20").all(id) as Job[];
  res.send(layout(`テスト送信 | ${c.name}`, testView(c, tests), takeFlash(req), navUser(req), updateReady));
});

app.post("/campaigns/:id/import", upload.single("csv"), async (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  const pasted = String(req.body.pasted ?? "").trim();
  const sheetUrl = String(req.body.sheet_url ?? "").trim();
  try {
    let rows;
    let srcLabel = "";
    if (req.file && /\.xlsx$/i.test(req.file.originalname)) {
      rows = await parseCompanyXlsx(req.file.buffer); srcLabel = "Excel";
    } else if (req.file) {
      rows = parseCompanyCsv(req.file.buffer); srcLabel = "CSV";
    } else if (pasted) {
      rows = parseCompanyCsv(pasted); srcLabel = "貼り付け";
    } else if (sheetUrl) {
      const csv = await fetchGoogleSheetCsv(sheetUrl); rows = parseCompanyCsv(csv); srcLabel = "スプレッドシート";
    } else {
      return redirectWith(res, `/campaigns/${id}`, "ファイル・貼り付け・スプレッドシートURLのいずれかを指定してください");
    }
    if (!rows.length) return redirectWith(res, `/campaigns/${id}`, "取り込める行がありませんでした。1行目に見出し（企業名・企業URL 等）があるか確認してください");
    // すぐには登録せず、まずプレビュー（先頭行・件数内訳）を見せて確定してもらう
    pendingImports.set(id, { rows, srcLabel });
    const dry = importRowsToCampaign(id, rows, { dryRun: true });
    const c = loadCampaignFull(req, id)!;
    res.send(layout(`取り込みプレビュー | ${c.name}`, importPreviewView(c, rows, dry, srcLabel), takeFlash(req), navUser(req), updateReady));
  } catch (e) {
    redirectWith(res, `/campaigns/${id}`, `取り込みエラー: ${String((e as Error).message)}`);
  }
});
// プレビューを確認して実際に取り込む
app.post("/campaigns/:id/import-confirm", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  const pending = pendingImports.get(id);
  if (!pending) return redirectWith(res, `/campaigns/${id}`, "プレビューの有効期限が切れました。もう一度取り込んでください");
  const s = importRowsToCampaign(id, pending.rows);
  pendingImports.delete(id);
  lastImports.set(id, s);
  redirectWith(res, `/campaigns/${id}`, `${pending.srcLabel}から ${pending.rows.length}行を取り込みました`);
});
// プレビューを取り消す
app.post("/campaigns/:id/import-cancel", (req, res) => {
  const id = Number(req.params.id);
  pendingImports.delete(id);
  redirectWith(res, `/campaigns/${id}`, "取り込みを取り消しました");
});

// GoogleスプレッドシートのURLをCSVで取得する（共有＝リンクを知っている全員が閲覧可、が前提）。
// Googleはサーバーからの素の要求（User-Agent無し）を400で弾くことがあるためUAを付け、
// export で失敗しても gviz 方式にフォールバックする（一部シートで export が400/HTMLを返すため）。
async function fetchGoogleSheetCsv(url: string): Promise<string> {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error("GoogleスプレッドシートのURLではありません。ブラウザのアドレスバーのURL（/spreadsheets/d/… を含む）を貼ってください");
  const id = m[1];
  const gid = (url.match(/[#&?]gid=(\d+)/) ?? [])[1];
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; apo-hatch/1.0)", Accept: "text/csv,*/*" };
  const candidates = [
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid ?? "0"}`,
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ""}`,
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`, // gid不明なら先頭シート
  ];
  let lastStatus = 0, sawLogin = false;
  for (const u of candidates) {
    let r: Response;
    try { r = await fetch(u, { redirect: "follow", headers }); } catch { continue; }
    const finalUrl = (r as any).url || "";
    if (/accounts\.google\.com|ServiceLogin/i.test(finalUrl)) { sawLogin = true; continue; }
    if (!r.ok) { lastStatus = r.status; continue; }
    const text = await r.text();
    if (/^\s*<(!doctype|html)/i.test(text.slice(0, 200))) { sawLogin = true; continue; } // ログイン/エラーHTML
    if (text.trim()) return text;
  }
  if (sawLogin) throw new Error("スプレッドシートが非公開のようです。共有を「リンクを知っている全員（閲覧可）」にしてから、対象タブを開いた状態のURL（末尾に #gid=… が付きます）を貼ってください");
  throw new Error(`スプレッドシートを取得できません（${lastStatus || "不明"}）。共有を「リンクを知っている全員（閲覧可）」にし、対象タブを開いた状態のURL（末尾 #gid=… 付き）を貼ってください。うまくいかない場合はCSV書き出し（ファイル→ダウンロード→CSV）でも取り込めます`);
}

app.post("/campaigns/:id/preview", async (req, res) => {
  const id = Number(req.params.id);
  const c = loadCampaignFull(req, id);
  if (!c) return res.status(404).send("not found");
  const job = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? AND status='queued' AND is_test=0 ORDER BY id LIMIT 1").get(id) as Job | undefined;
  if (!job) return redirectWith(res, `/campaigns/${id}`, "待機中の会社がありません。先にCSVを取り込んでください");
  try {
    let site = { title: "", text: "" };
    if ((c.mode === "ai" || c.mode === "hybrid") && activeProvider() !== "none") {
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
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  const url = String(req.body.url ?? "").trim();
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const dry = req.body.dry === "1";
  const company = String(req.body.company || "テスト株式会社");
  if (!url && !email) return redirectWith(res, `/campaigns/${id}/test`, "テスト先のフォームURLか、自分のメールアドレスを入れてください");
  const r = email
    ? db.prepare("INSERT INTO form_jobs(campaign_id, company_name, form_url, site_url, industry, domain, is_test, channel, email) VALUES(?,?,?,?,?,?,1,'email',?)").run(id, company, "", "", "テスト業種", email.split("@")[1] ?? "", email)
    : db.prepare("INSERT INTO form_jobs(campaign_id, company_name, form_url, site_url, industry, domain, is_test) VALUES(?,?,?,?,?,?,1)").run(id, company, url, url, "テスト業種", domainOf(url));
  const browser = await launchBrowser();
  try {
    const j = await processJob(browser, Number(r.lastInsertRowid), { dryRun: dry });
    redirectWith(res, `/jobs/${j.id}`, dry ? "入力テストが終わりました。スクリーンショットで入力内容を確認してください" : `テスト送信の結果: ${j.status}`);
  } catch (e) {
    redirectWith(res, `/campaigns/${id}/test`, `テスト送信エラー: ${String((e as Error).message)}`);
  } finally {
    await browser.close().catch(() => {});
  }
});

app.post("/campaigns/:id/start", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  if (isRunning(id)) return redirectWith(res, `/campaigns/${id}`, "すでに実行中です");
  db.prepare("UPDATE form_campaigns SET status='running' WHERE id=?").run(id);
  const ignoreWindow = req.body.ignore_window === "1";
  runCampaign(id, { ignoreWindow }).then((r) => console.log(`[campaign ${id}] ${r.processed}件処理 (${r.reason})`)).catch((e) => console.error(e));
  redirectWith(res, `/campaigns/${id}`, ignoreWindow ? "送信を開始しました（時間帯を無視）" : "送信を開始しました。送信時間帯外の場合は時間になると自動で始まります");
});

app.post("/campaigns/:id/scan", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "実行中です");
  scanCampaign(id).then((r) => console.log(`[scan ${id}] ${r.scanned}件 (${r.reason})`)).catch((e) => console.error(e));
  redirectWith(res, `/campaigns/${id}`, "事前チェックを始めました（1社5〜10秒）");
});
app.post("/campaigns/:id/stop-scan", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  requestStop(-id);
  redirectWith(res, `/campaigns/${id}`, "事前チェックを止めます");
});

app.post("/jobs/:id/outcome", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  const outcome = ["", "replied", "appointment", "declined"].includes(req.body.outcome) ? req.body.outcome : j.outcome;
  db.prepare("UPDATE form_jobs SET outcome=?, outcome_note=?, updated_at=datetime('now') WHERE id=?").run(outcome, String(req.body.note ?? "").slice(0, 300), id);
  if (outcome === "declined") {
    if (j.domain) db.prepare("INSERT OR IGNORE INTO form_suppressions(domain, reason) VALUES(?,?)").run(j.domain, `断り（${j.company_name}）`);
    if (j.email) optOut(j.email, `断り（${j.company_name}）`, me(req).id);
  }
  redirectWith(res, `/jobs/${id}`, "反応を記録しました");
});

app.post("/senders/:id/test", async (req, res) => {
  const s = ownedSender(req, Number(req.params.id));
  if (!s) return res.status(404).send("not found");
  try {
    if (!s.smtp_user || !s.smtp_pass) throw new Error("送信用メールアカウントが未設定です");
    const bad = checkSmtpPassword(s);
    if (bad) throw new Error(bad);
    await testSmtp(s);
    redirectWith(res, `/senders/${s.id}`, `メール送信OK（${s.smtp_user}）`);
  } catch (e) {
    redirectWith(res, `/senders/${s.id}`, `接続できませんでした: ${explainSmtpError(e, s)}`);
  }
});

app.post("/campaigns/:id/pause", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  requestStop(id);
  db.prepare("UPDATE form_campaigns SET status='paused' WHERE id=?").run(id);
  redirectWith(res, `/campaigns/${id}`, "一時停止を要求しました（処理中の1件が終わってから止まります）");
});

app.get("/campaigns/:id/export.csv", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
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
  const c = loadCampaignFull(req, id);
  if (!c) return res.status(404).send("not found");
  const jobs = db.prepare("SELECT * FROM form_jobs WHERE campaign_id=? AND is_test=0 AND status IN ('skip_captcha','failed','skip_no_form') ORDER BY id").all(id) as Job[];
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["企業名,理由,フォームURL,企業URL,メール,件名,本文"];
  for (const j of jobs) {
    let message = j.message_used, subject = c.subject_text;
    if (!message) {
      try { const comp = await composeMessage(j, c.sender, { ...c, mode: "template" }, { title: "", text: "" }); message = comp.message; subject = comp.subject; } catch { message = ""; }
    }
    lines.push([j.company_name, (errKind(j) ? errKind(j) + ": " : "") + (j.result_text || "").split("\n")[0], j.form_url, j.site_url, j.email, subject, message].map(q).join(","));
  }
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename=manual-${id}.csv`);
  res.send("\ufeff" + lines.join("\n"));
});

// ---- jobs ----
app.get("/jobs/:id", (req, res) => {
  const j = ownedJob(req, Number(req.params.id));
  if (!j) return res.status(404).send("not found");
  const c = db.prepare("SELECT * FROM form_campaigns WHERE id=?").get(j.campaign_id) as Campaign;
  res.send(layout(j.company_name, jobView(j, c), takeFlash(req), navUser(req), updateReady));
});
// 待機中の1社をキャンセル（本送信の対象から外す）
app.post("/jobs/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  if (j.status === "queued") db.prepare("UPDATE form_jobs SET status='skip_cancelled', result_text='キャンセルしました', updated_at=datetime('now') WHERE id=?").run(id);
  redirectWith(res, `/campaigns/${j.campaign_id}`, `${j.company_name} をキャンセルしました`);
});
// キャンペーンを複製（設定・文面をコピー。会社リストや送信履歴はコピーしない）
app.post("/campaigns/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const c = ownedCampaign(req, id);
  if (!c) return res.status(404).send("not found");
  const r = db.prepare(`INSERT INTO form_campaigns(owner_user_id, name, sender_id, mode, subject_text, template_text, ai_instruction, daily_limit, send_window_start, send_window_end, weekdays_only, channel, email_daily_limit, resend_days, ignore_refusal, material_url, attach_path, attach_name, status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`).run(me(req).id, c.name + " のコピー", c.sender_id, c.mode, c.subject_text, c.template_text, c.ai_instruction, c.daily_limit, c.send_window_start, c.send_window_end, c.weekdays_only, c.channel, c.email_daily_limit, c.resend_days, c.ignore_refusal, c.material_url, c.attach_path, c.attach_name);
  redirectWith(res, `/campaigns/${Number(r.lastInsertRowid)}`, "キャンペーンを複製しました。会社リストは空なので、CSVを取り込んでください");
});

// 失敗した会社をまとめて「待機中」に戻す（このあと「開始」で再送信）
app.post("/campaigns/:id/requeue-failed", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  const r = db.prepare("UPDATE form_jobs SET status='queued', result_text='', updated_at=datetime('now') WHERE campaign_id=? AND is_test=0 AND status IN ('failed','skip_no_form')").run(id);
  redirectWith(res, `/campaigns/${id}`, `失敗していた ${r.changes} 件を待機中に戻しました。「開始」で再送信できます`);
});

// 手動で送れた会社を「送信済み（手動）」にする（手動送信リストの消し込み用）
app.post("/jobs/:id/mark-sent", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  db.prepare("UPDATE form_jobs SET status='sent', result_text='手動で送信済みにしました', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id);
  redirectWith(res, `/jobs/${id}`, `${j.company_name} を「送信済み（手動）」にしました`);
});

// 待機中の全社を一括キャンセル
app.post("/campaigns/:id/cancel-queued", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  const r = db.prepare("UPDATE form_jobs SET status='skip_cancelled', result_text='一括キャンセル', updated_at=datetime('now') WHERE campaign_id=? AND status='queued' AND is_test=0").run(id);
  redirectWith(res, `/campaigns/${id}`, `待機中 ${r.changes} 件をキャンセルしました`);
});

// 失敗ジョブの宛先・会社名を直して、その場で送り直す（一覧・詳細の「修正して再送信」）
app.post("/jobs/:id/fix", async (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  const formUrl = String(req.body.form_url ?? "").trim();
  const siteUrl = String(req.body.site_url ?? "").trim();
  const company = String(req.body.company_name ?? "").trim() || j.company_name;
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const channel = !formUrl && email ? "email" : j.channel === "email" && formUrl ? "form" : j.channel;
  const domain = domainOf(formUrl || siteUrl) || (email ? email.split("@")[1] ?? j.domain : j.domain);
  // status は変えない（直前の失敗ステータスを processJob が履歴として拾えるようにするため）
  db.prepare("UPDATE form_jobs SET form_url=?, site_url=?, company_name=?, email=?, channel=?, domain=?, updated_at=datetime('now') WHERE id=?")
    .run(formUrl, siteUrl, company, email, channel, domain, id);
  const browser = await launchBrowser();
  try {
    const r = await processJob(browser, id);
    redirectWith(res, `/jobs/${id}`, `修正して再送信した結果: ${STATUS_LABEL[r.status] ?? r.status}`);
  } catch (e) {
    redirectWith(res, `/jobs/${id}`, `再送信エラー: ${String((e as Error).message)}`);
  } finally {
    await browser.close().catch(() => {});
  }
});

// 要確認の質問に画面で回答して、その回答でその場で送り直す
app.post("/jobs/:id/answer", async (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  const answers: { label: string; answer: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const label = String(req.body[`q_label_${i}`] ?? "").trim();
    if (!label) continue;
    const raw = req.body[`q_ans_${i}`];
    const answer = (Array.isArray(raw) ? raw.map(String) : raw !== undefined ? [String(raw)] : []).map((s) => s.trim()).filter(Boolean).join("／");
    if (answer) answers.push({ label: label.slice(0, 80), answer: answer.slice(0, 200) });
  }
  if (!answers.length) return redirectWith(res, `/jobs/${id}`, "回答が選ばれていません");
  db.prepare("UPDATE form_jobs SET manual_answers=?, updated_at=datetime('now') WHERE id=?").run(JSON.stringify(answers), id);
  const browser = await launchBrowser();
  try {
    const r = await processJob(browser, id);
    redirectWith(res, `/jobs/${id}`, `回答を反映して再送信した結果: ${STATUS_LABEL[r.status] ?? r.status}`);
  } catch (e) {
    redirectWith(res, `/jobs/${id}`, `再送信エラー: ${String((e as Error).message)}`);
  } finally {
    await browser.close().catch(() => {});
  }
});

app.post("/jobs/:id/retry", async (req, res) => {
  const id = Number(req.params.id);
  if (!ownedJob(req, id)) return res.status(403).send(DENIED);
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
  const sc = scope(req);
  const list = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as SenderProfile[];
  // 各送信者を使っているキャンペーン数（編集・使い回しの判断材料。集計するだけの追加表示）
  const usage: Record<number, number> = {};
  for (const r of db.prepare(`SELECT sender_id, COUNT(*) n FROM form_campaigns WHERE ${sc.sql} GROUP BY sender_id`).all(...sc.args) as { sender_id: number; n: number }[]) usage[r.sender_id] = r.n;
  res.send(layout("送信者", sendersView(list, usage), takeFlash(req), navUser(req), updateReady));
});
app.get("/senders/:id", (req, res) => {
  const s = ownedSender(req, Number(req.params.id));
  if (!s) return res.status(404).send("not found");
  res.send(layout("送信者を編集", `<h1>送信者を編集</h1><div class="card">${senderForm(s)}</div>`, takeFlash(req), navUser(req), updateReady));
});
const SENDER_COLS = ["label", "company", "industry", "person", "person_kana", "email", "reply_email", "tel", "postal", "address", "url", "from_email", "smtp_user", "smtp_host", "smtp_port"];
// 送信者フォームの簡易チェック。問題があれば日本語メッセージ、無ければ null
function validateSender(body: Record<string, unknown>): string | null {
  const g = (k: string) => String(body[k] ?? "").trim();
  if (!g("company")) return "会社名を入力してください";
  if (!g("person")) return "担当者名を入力してください";
  const email = g("email");
  if (!email) return "メールを入力してください";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "メールアドレスの形式が正しくありません（例: sales@example.co.jp）";
  const re = g("reply_email");
  if (re && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(re)) return "返信受付メールの形式が正しくありません";
  const tel = g("tel");
  if (tel && !/^[0-9０-９\-ー－()（） 　]+$/.test(tel)) return "電話番号は数字とハイフンで入力してください";
  return null;
}
app.post("/senders", (req, res) => {
  const err = validateSender(req.body);
  if (err) return redirectWith(res, "/senders", err);
  const vals = SENDER_COLS.map((k) => String(req.body[k] ?? "").trim());
  db.prepare(`INSERT INTO sender_profiles(owner_user_id, ${SENDER_COLS.join(",")}, smtp_pass) VALUES(?, ${SENDER_COLS.map(() => "?").join(",")}, ?)`).run(me(req).id, ...vals, String(req.body.smtp_pass ?? "").trim());
  redirectWith(res, "/senders", "送信者を追加しました");
});
app.post("/senders/:id", (req, res) => {
  if (!ownedSender(req, Number(req.params.id))) return res.status(403).send(DENIED);
  const verr = validateSender(req.body);
  if (verr) return redirectWith(res, `/senders/${Number(req.params.id)}`, verr);
  const vals = SENDER_COLS.map((k) => String(req.body[k] ?? "").trim());
  const pass = String(req.body.smtp_pass ?? "").trim();
  db.prepare(`UPDATE sender_profiles SET ${SENDER_COLS.map((c) => `${c}=?`).join(",")}${pass ? ", smtp_pass=?" : ""} WHERE id=?`).run(...vals, ...(pass ? [pass] : []), Number(req.params.id));
  redirectWith(res, "/senders", "保存しました");
});

// ---- suppressions / settings ----
const suppImports = new Map<number, ReturnType<typeof importSuppressions>>();
app.get("/suppressions", (req, res) => {
  const sc = scope(req);
  const rows = db.prepare(`SELECT * FROM form_suppressions WHERE ${sc.sql} ORDER BY id DESC LIMIT 1000`).all(...sc.args) as any[];
  const optouts = db.prepare(`SELECT * FROM email_optouts WHERE ${sc.sql} ORDER BY created_at DESC LIMIT 500`).all(...sc.args) as any[];
  const imported = suppImports.get(me(req).id);
  suppImports.delete(me(req).id);
  res.send(layout("除外リスト", suppressionsView(rows, optouts, imported), takeFlash(req), navUser(req), updateReady));
});

/** 除外リストをCSVで書き出す。列は取り込みと同じなので、別PCの「CSVでまとめて追加」にそのまま読み込める
    （除外リストはPCごとに独立のため、チーム内での手動共有に使う） */
app.get("/suppressions/export.csv", (req, res) => {
  const sc = scope(req);
  const rows = db.prepare(`SELECT * FROM form_suppressions WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as any[];
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["会社名,ドメイン,メール,電話,理由,登録日時", ...rows.map((r) => [r.company_name, r.domain, r.email, r.tel, r.reason, r.created_at].map(q).join(","))];
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", "attachment; filename=suppressions.csv");
  res.send("﻿" + lines.join("\n"));
});

/** 除外リストをCSVでまとめて追加 */
app.post("/suppressions/import", upload.single("csv"), (req, res) => {
  if (!req.file) return redirectWith(res, "/suppressions", "CSVが選択されていません");
  try {
    const rows = parseSuppressionCsv(req.file.buffer);
    if (!rows.length) return redirectWith(res, "/suppressions", "会社名の列が見つかりませんでした（列名を「会社名」または「企業名」にしてください）");
    const r = importSuppressions(rows, me(req).id, String(req.body.reason ?? "").trim() || "CSVで一括登録");
    suppImports.set(me(req).id, r);
    res.redirect("/suppressions");
  } catch (e) {
    redirectWith(res, "/suppressions", `取り込みエラー: ${String((e as Error).message)}`);
  }
});
app.post("/suppressions", (req, res) => {
  const raw = String(req.body.domain ?? "").trim();
  const company = String(req.body.company_name ?? "").trim();
  const reason = String(req.body.reason ?? "").trim() || "手動で追加";
  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    optOut(email, company ? `${company}（${reason}）` : reason, me(req).id);
    db.prepare("INSERT INTO form_suppressions(company_name, domain, email, reason, owner_user_id) VALUES(?,NULL,?,?,?)").run(company, email, reason, me(req).id);
    return redirectWith(res, "/suppressions", `${company || email} を除外リストに追加しました`);
  }
  const domain = domainOf(raw) || raw.toLowerCase();
  if (!domain) return redirectWith(res, "/suppressions", "ドメインかメールアドレスを入れてください");
  const dup = db.prepare("SELECT 1 FROM form_suppressions WHERE domain=?").get(domain);
  if (dup) return redirectWith(res, "/suppressions", `${domain} はすでに登録されています`);
  db.prepare("INSERT INTO form_suppressions(company_name, domain, reason, owner_user_id) VALUES(?,?,?,?)").run(company, domain, reason, me(req).id);
  redirectWith(res, "/suppressions", `${company || domain} を除外リストに追加しました`);
});
app.post("/suppressions/:id/delete", (req, res) => {
  const sc = scope(req);
  db.prepare(`DELETE FROM form_suppressions WHERE id=? AND ${sc.sql}`).run(Number(req.params.id), ...sc.args);
  redirectWith(res, "/suppressions", "削除しました");
});
// データのバックアップ書き出し（自分の送信者・キャンペーン・送信履歴をJSONで。復元機能は付けない）
// 認証情報（SMTPアプリパスワード・AIキー）は安全のため含めない
app.get("/backup.json", (req, res) => {
  const sc = scope(req);
  const senders = db.prepare(`SELECT id, ${SENDER_COLS.join(", ")} FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args);
  const campaigns = db.prepare(`SELECT * FROM form_campaigns WHERE ${sc.sql} ORDER BY id`).all(...sc.args);
  const jobs = db.prepare(`SELECT j.* FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id WHERE ${sc.sql.replace("owner_user_id", "c.owner_user_id")} AND j.is_test=0 ORDER BY j.id`).all(...sc.args);
  const out = { app: "apo-hatch", version: currentVersion(), exported_at: new Date().toISOString(), note: "バックアップ（閲覧用）。SMTPパスワード・AIキーは含みません。復元機能はありません。", senders, campaigns, jobs };
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename=apo-hatch-backup-${stamp}.json`);
  res.send(JSON.stringify(out, null, 2));
});

// ミニゲーム（誰でも遊べる息抜き）。クレジットは「自分のキャンペーンでフォーム送信できた件数」から貯まる
app.get("/game", (req, res) => {
  if (!gameOnFor(req)) return res.redirect("/"); // 非表示ポートでは遊べない（人に見せる用のURL）
  const sc = scope(req);
  const sent = (db.prepare(`SELECT COUNT(*) n FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id WHERE j.status='sent' AND j.is_test=0 AND ${sc.sql.replace("owner_user_id", "c.owner_user_id")}`).get(...sc.args) as { n: number }).n;
  res.send(layout("アポスロット", gameView(sent), takeFlash(req), navUser(req), updateReady));
});

app.get("/settings", requireAdmin, (req, res) => {
  // 設定は管理者のみ（全体を見られる）なので、件数は全体の合計を出す。集計するだけの追加表示
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const stats = {
    senders: one("SELECT COUNT(*) n FROM sender_profiles"),
    campaigns: one("SELECT COUNT(*) n FROM form_campaigns"),
    // 会社（ドメイン）単位の重複を除いた実数＝「社」。ドメインが無い行はidで個別に数える
    companies: one("SELECT COUNT(DISTINCT COALESCE(NULLIF(domain,''), CAST(id AS TEXT))) n FROM form_jobs WHERE is_test=0"),
    sent: one("SELECT COUNT(DISTINCT COALESCE(NULLIF(domain,''), CAST(id AS TEXT))) n FROM form_jobs WHERE is_test=0 AND status='sent'"),
    suppressions: one("SELECT COUNT(*) n FROM form_suppressions"),
    optouts: one("SELECT COUNT(*) n FROM email_optouts"),
  };
  res.send(layout("設定", settingsView(loadNgWords(), activeAiConfig(), stats), takeFlash(req), navUser(req), updateReady));
});
app.post("/settings", requireAdmin, (req, res) => {
  const words = String(req.body.ng_words ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  db.prepare("INSERT INTO settings(key,value) VALUES('ng_words',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(words));
  redirectWith(res, "/settings", "保存しました");
});

// ---- AIモード設定（管理者のみ）。キーは data/ 内のDBに保存され、gitには載らない ----
const setSetting = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
app.post("/settings/ai", requireAdmin, async (req, res) => {
  const provider = req.body.provider === "gemini" ? "gemini" : "anthropic";
  const model = String(req.body.model ?? "").trim();
  const key = String(req.body.api_key ?? "").trim();
  const validModel = AI_MODELS[provider].some((m) => m.id === model) ? model : AI_MODELS[provider][0].id;
  // キー欄が空のままなら、保存済みのキーを使い続ける（マスク表示のため毎回入力させない）
  const existing = (db.prepare("SELECT value FROM settings WHERE key='ai_api_key'").get() as { value: string } | undefined)?.value ?? "";
  const apiKey = key || existing;
  if (!apiKey) return redirectWith(res, "/settings", "APIキーを入力してください");
  setSetting.run("ai_provider", provider);
  setSetting.run("ai_model", validModel);
  setSetting.run("ai_api_key", apiKey);
  const err = await testAiConnection();
  if (err) {
    redirectWith(res, "/settings", `保存しましたが、接続テストに失敗しました: ${err}`);
  } else {
    redirectWith(res, "/settings", `接続テスト成功。AIが使えるようになりました（${provider} / ${validModel}）`);
  }
});
app.post("/settings/ai/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM settings WHERE key IN ('ai_provider','ai_api_key','ai_model')").run();
  redirectWith(res, "/settings", "AI設定を削除しました。テンプレートのみで動きます（AI: none）");
});

// ---- アップデート（管理者のみ）----
const updateResults = new Map<number, Awaited<ReturnType<typeof applyUpdate>>>();
app.get("/update", requireAdmin, async (req, res) => {
  const st = await checkUpdate();
  updateReady = st.available;
  const result = updateResults.get(me(req).id);
  updateResults.delete(me(req).id);
  res.send(layout("アップデート", updateView(st, result), takeFlash(req), navUser(req), updateReady));
});
app.post("/update/check", requireAdmin, async (req, res) => {
  const st = await checkUpdate(true);
  updateReady = st.available;
  redirectWith(res, "/update", st.available ? `v${st.latest} が公開されています` : st.error ?? "最新版です");
});
app.post("/update", requireAdmin, async (req, res) => {
  const r = await applyUpdate();
  updateResults.set(me(req).id, r);
  if (r.ok) {
    updateReady = false;
    requestRestart();   // npm start で起動していれば自動で立ち上がり直す
  }
  res.redirect("/update");
});

// ---- 簡易スケジューラ: running のキャンペーンを送信時間帯に自動再開 ----
setInterval(() => {
  const ids = db.prepare("SELECT id FROM form_campaigns WHERE status='running'").all() as { id: number }[];
  for (const { id } of ids) if (!isRunning(id)) runCampaign(id).catch((e) => console.error(e));
}, 60000);

setInterval(cleanupSessions, 24 * 60 * 60 * 1000);
refreshUpdateFlag();
setInterval(refreshUpdateFlag, 6 * 60 * 60 * 1000);

const first = ensureFirstAdmin();
const PORT = Number(process.env.PORT ?? 3210);
app.listen(PORT, () => {
  if (first) {
    console.log("\n============================================================");
    console.log("  最初の管理者アカウントを作りました。控えておいてください。");
    console.log(`  ログインID : ${first.username}`);
    console.log(`  パスワード : ${first.password}`);
    console.log("  ※ 初回ログイン後にパスワード変更の画面が出ます");
    console.log("============================================================\n");
  }
  console.log(`【フォーム＆メール】アポハッチくん v${currentVersion()}: http://localhost:${PORT}  (AI: ${activeProvider()}, data: ${path.resolve(process.env.DATA_DIR ?? "data")})`);
});

// 共有用（おまけゲームを表示しない）URL。同じアプリ・同じデータ・同じログインで、別ポートから配信する。
// 人に画面を見せるときはこちらのURLを開けば、ゲームのリンクも /game も出ない。
if (process.env.GAME !== "0" && process.env.GAME !== "off" && CLEAN_PORT !== PORT) {
  const clean = app.listen(CLEAN_PORT, () => {
    console.log(`  ├ 共有用（ゲーム非表示）URL: http://localhost:${CLEAN_PORT}`);
  });
  clean.on("error", (e: NodeJS.ErrnoException) => {
    console.log(`  ※ 共有用URL(${CLEAN_PORT})は開けませんでした（${e.code}）。メインURLはそのまま使えます。`);
  });
}
