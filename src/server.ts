// 管理画面（localhost）。BRIDGE HATCH 組み込み時はこのルーティングを Next.js の API / 画面に移す。
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getDb, getSetting, setSetting as saveSetting, SCREENSHOT_DIR, MATERIAL_DIR, domainOf, jst, channelMode, STATUS_LABEL, OUTCOME_LABEL, type Campaign, type Job, type SenderProfile } from "./db.js";
import { parseCompanyCsv, parseCompanyXlsx, importRowsToCampaign, parseSuppressionCsv, parseSuppressionText, importSuppressions, type ImportSummary, type CompanyRow } from "./csv.js";
import { composeMessage, activeProvider, activeAiConfig, aiStatusLabel, testAiConnection, AI_MODELS, DEFAULT_TEMPLATE, loadNgWords, lintMessage } from "./message.js";
import { optOut, testSmtp, explainSmtpError, checkSmtpPassword, emailPause, clearEmailPause, senderEmailOk, buildEmailBody } from "./email.js";
import { logError, logInfo, recentLogs, clearLogs, logCounts } from "./applog.js";
import { jpError } from "./jp.js";
import { healthChecks, diagnosticsText } from "./health.js";
import { createBackup, listBackups, requestRestore, autoBackupIfDue, backupLabel, BACKUP_DIR } from "./backup.js";
import { autostartEnabled, autostartSupported, enableAutostart, disableAutostart, autostartPath } from "./autostart.js";
import { releaseAwakeAll, AWAKE_NOTE } from "./awake.js";
import { drainForShutdown, clearStaleRuns, runCampaign, requestStop, isRunning, isScanning, scanCampaign, processJob, inSendWindow, sentToday } from "./worker.js";
import { launchBrowser, openAndFill } from "./engine.js";
import { checkReplies, isCheckingReplies, replyScanStatus, verifyInterruptedEmails, learnFromCorrection, loadReplyRules, clearReplyRulesCache } from "./replies.js";
import { notify, notifyEnabled } from "./notify.js";
import { checkUpdate, applyUpdate, requestRestart, currentVersion } from "./update.js";
import { esc, layout, lawView, todoView, setupView, campaignListView, sendersView, senderForm, campaignForm, campaignView, jobView, suppressionsView, settingsView, loginPage, passwordView, usersView, updateView, testView, gameView, guideView, statsView, importPreviewView, logsView, healthView, errKind, type NavUser } from "./views.js";
import { authMiddleware, renameUser, requireAdmin, startSession, endSession, findUser, verifyPassword, createUser, setPassword, listUsers, ensureFirstAdmin, randomPassword, cleanupSessions, type AuthedRequest } from "./auth.js";

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
  if (getSetting("game_enabled", "0") !== "1") return false; // 設定画面でオンにしたときだけ（新しく入れたPCは最初オフ）
  return req.socket.localPort !== CLEAN_PORT; // CLEAN_PORT 以外（＝メイン）ではON
}
function navUser(req: express.Request): NavUser {
  const u = (req as AuthedRequest).user;
  if (!u) return null;
  // 上の帯に「要対応 N」を出す（対応が必要な会社があることに気づけるように）
  let todo = 0;
  try {
    const sc = scope(req);
    todo = (db.prepare(`SELECT COUNT(*) n FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id
      WHERE j.is_test=0 AND ${sc.sql.replace("owner_user_id", "c.owner_user_id")} AND ${TODO_ALL}`).get(...sc.args) as { n: number }).n;
  } catch { /* 起動直後など */ }
  return { username: u.username, display_name: u.display_name, role: u.role, gameOn: gameOnFor(req), todo };
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
const TODO_WHERE: Record<string, string> = {
  captcha: "j.status='skip_captcha'",
  check: "j.status='failed' AND j.result_text LIKE '要確認%'",
  failed: "j.status='failed' AND j.result_text NOT LIKE '要確認%'",
  noform: "j.status='skip_no_form'",
};
const TODO_ALL = `(${Object.values(TODO_WHERE).join(" OR ")})`;

const DENIED = "この画面を見る権限がありません";
/** グループの選択肢に出すキャンペーン（昔のキャンペーンも含む全件） */
function groupCandidates(req: express.Request): { id: number; name: string; group_name: string }[] {
  const sc = scope(req);
  return db.prepare(`SELECT id, name, group_name FROM form_campaigns WHERE ${sc.sql} ORDER BY id DESC`).all(...sc.args) as { id: number; name: string; group_name: string }[];
}
/** グループのメンバーを保存する。チェックしたキャンペーンを同じグループにし、
 *  以前このグループにいてチェックを外したキャンペーンはグループから外す。
 *  グループ名が空でチェックがあれば、チェックした中の既存グループ名 → このキャンペーン名 の順で決める */
function applyGroupMembers(req: express.Request, selfId: number, prevGroup: string, body: Record<string, unknown>) {
  const raw = body.group_members;
  const own = new Map(groupCandidates(req).map((c) => [c.id, c]));
  const ids = (Array.isArray(raw) ? raw : raw != null ? [raw] : []).map((v) => Number(v)).filter((n) => n !== selfId && own.has(n));
  const self = own.get(selfId);
  let g = String(body.group_name ?? "").trim();
  if (!g && ids.length) g = ids.map((i) => own.get(i)!.group_name).find((x) => x) || self?.name || "";
  db.prepare("UPDATE form_campaigns SET group_name=? WHERE id=?").run(g, selfId);
  for (const i of ids) db.prepare("UPDATE form_campaigns SET group_name=? WHERE id=?").run(g, i);
  if (prevGroup) {
    for (const c of own.values()) {
      if (c.id !== selfId && !ids.includes(c.id) && c.group_name === prevGroup) db.prepare("UPDATE form_campaigns SET group_name='' WHERE id=?").run(c.id);
    }
  }
}

/** 既存のキャンペーングループ名（入力候補用） */
function groupNames(req: express.Request): string[] {
  const sc = scope(req);
  return (db.prepare(`SELECT DISTINCT group_name FROM form_campaigns WHERE group_name<>'' AND ${sc.sql} ORDER BY group_name`).all(...sc.args) as { group_name: string }[]).map((r) => r.group_name);
}

/** 「失敗した会社を再送信」の対象＝会社（ドメイン）ごとに最新のジョブが 失敗／フォーム無し のもの。
 *  同じ会社の古い試行（その後に成功・別状態になった行）は含めない。一覧・件数・再送信の3か所で共通に使う。 */
function retryTargetJobs(campaignId: number): { id: number; company_name: string; status: string; result_text: string }[] {
  return db.prepare(`SELECT j.id, j.company_name, j.status, j.result_text FROM form_jobs j
    WHERE j.campaign_id=? AND j.is_test=0
      AND j.id = (SELECT x.id FROM form_jobs x WHERE x.campaign_id=j.campaign_id AND x.is_test=0
                  AND COALESCE(NULLIF(x.domain,''),CAST(x.id AS TEXT)) = COALESCE(NULLIF(j.domain,''),CAST(j.id AS TEXT))
                  ORDER BY x.updated_at DESC, x.id DESC LIMIT 1)
      AND j.status IN ('failed','skip_no_form')
    ORDER BY j.company_name`).all(campaignId) as { id: number; company_name: string; status: string; result_text: string }[];
}

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
// ログインの失敗回数制限。同じWi-Fi等にいる人が、他のPCから開けるURLでパスワードを何度も試せないようにする。
// 同じ接続元から15分に5回（どのIDでも合計10回）間違えたら、15分ログインを受け付けない。PCの中だけで数える（再起動でリセット）
const loginFails = new Map<string, number[]>();
const LOGIN_WINDOW = 15 * 60_000;
function recentFails(key: string): number[] {
  const now = Date.now();
  const list = (loginFails.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW);
  if (list.length) loginFails.set(key, list); else loginFails.delete(key);
  return list;
}
app.post("/login", (req, res) => {
  const next = String(req.body.next || "/");
  const ip = String(req.socket.remoteAddress ?? "");
  const name = String(req.body.username ?? "").trim().toLowerCase();
  const keyUser = `${ip}|${name}`, keyIp = `${ip}|*`;
  const userFails = recentFails(keyUser), ipFails = recentFails(keyIp);
  if (userFails.length >= 5 || ipFails.length >= 10) {
    const oldest = (userFails.length >= 5 ? userFails : ipFails)[0];
    const mins = Math.max(1, Math.ceil((oldest + LOGIN_WINDOW - Date.now()) / 60_000));
    return res.status(429).send(loginPage({ error: `ログインに続けて失敗したため、しばらくログインできません（約${mins}分後にもう一度お試しください）。パスワードが分からない場合は管理者に再発行を依頼してください`, next }));
  }
  const u = findUser(String(req.body.username ?? ""));
  if (!u || !u.active || !verifyPassword(String(req.body.password ?? ""), u.password_hash)) {
    const now = Date.now();
    loginFails.set(keyUser, [...userFails, now]);
    loginFails.set(keyIp, [...ipFails, now]);
    return res.status(401).send(loginPage({ error: "ログインIDかパスワードが違います", next }));
  }
  loginFails.delete(keyUser);
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
  res.send(layout("ユーザー管理", usersView(listUsers(), issued, shareUrls()), takeFlash(req), navUser(req), updateReady));
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
// ログインIDの変更（管理者のみ）。全員が admin だと誰のアカウントか分からず、狙われやすいため変えられるようにする
app.post("/users/:id/username", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  try {
    const before = db.prepare("SELECT username FROM users WHERE id=?").get(id) as { username: string } | undefined;
    if (!before) return redirectWith(res, "/users", "そのアカウントが見つかりません");
    renameUser(id, String(req.body.username ?? ""));
    redirectWith(res, "/users", `ログインIDを「${before.username}」→「${String(req.body.username).trim().toLowerCase()}」に変更しました。本人に伝えてください`);
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
/** 他のPC（同じWi-Fi・社内LAN）から開くためのURL。
 *  画面のアドレス欄の http://localhost:… は「自分のPC」の意味なので、そのまま人に送ると相手のPCでは「サーバーに接続できません」になる。
 *  このPCの名前（.local）とIPアドレスでのURLを出す。IPはWi-Fiにつなぎ直すと変わることがあるので、名前のURLを先に出す */
function shareUrls(): string[] {
  const port = process.env.GAME !== "0" && process.env.GAME !== "off" && CLEAN_PORT !== Number(process.env.PORT ?? 3210) ? CLEAN_PORT : Number(process.env.PORT ?? 3210);
  const urls: string[] = [];
  const host = os.hostname();
  if (/\.local$/i.test(host)) urls.push(`http://${host}:${port}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) urls.push(`http://${a.address}:${port}`);
    }
  }
  return urls;
}

app.get("/", (req, res) => {
  const rows = db.prepare(`SELECT c.*, s.label sender_label,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0) total,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='sent') sent,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='queued') queued,
      (SELECT COUNT(*) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.outcome IN ('replied','appointment')) reactions,
      (SELECT MAX(sent_at) FROM form_jobs j WHERE j.campaign_id=c.id AND j.is_test=0 AND j.status='sent') last_sent
    FROM form_campaigns c JOIN sender_profiles s ON s.id=c.sender_id WHERE ${scope(req).sql.replace("owner_user_id", "c.owner_user_id")} ORDER BY c.group_name='' , c.group_name, c.id DESC`).all(...scope(req).args) as any[];
  const sc2 = scope(req);
  const senderRows = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc2.sql} ORDER BY id`).all(...sc2.args) as SenderProfile[];
  // ホーム上部のまとめ（#49）。今日・今月の送信、反応、要対応、止まっている理由を1画面に
  const jobsWhere = `FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id WHERE j.is_test=0 AND ${sc2.sql.replace("owner_user_id", "c.owner_user_id")}`;
  const num = (sql: string, ...more: (string | number)[]) => (db.prepare(sql).get(...sc2.args, ...more) as { n: number }).n;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const counts = todoCounts(req);
  const openCampaigns = rows.filter((r) => r.status === "running");
  const home = {
    todayForm: num(`SELECT COUNT(*) n ${jobsWhere} AND j.status='sent' AND j.channel='form' AND date(j.sent_at,'+9 hours')=?`, today),
    todayEmail: num(`SELECT COUNT(*) n ${jobsWhere} AND j.status='sent' AND j.channel='email' AND date(j.sent_at,'+9 hours')=?`, today),
    monthForm: num(`SELECT COUNT(*) n ${jobsWhere} AND j.status='sent' AND j.channel='form' AND strftime('%Y-%m', j.sent_at,'+9 hours')=?`, month),
    monthEmail: num(`SELECT COUNT(*) n ${jobsWhere} AND j.status='sent' AND j.channel='email' AND strftime('%Y-%m', j.sent_at,'+9 hours')=?`, month),
    appointments: num(`SELECT COUNT(*) n ${jobsWhere} AND j.outcome='appointment'`),
    replies: num(`SELECT COUNT(*) n ${jobsWhere} AND j.outcome='replied'`),
    declines: num(`SELECT COUNT(*) n ${jobsWhere} AND j.outcome='declined'`),
    queued: num(`SELECT COUNT(*) n ${jobsWhere} AND j.status='queued'`),
    runningNames: openCampaigns.filter((r) => isRunning(r.id)).map((r) => r.name),
    windowOk: openCampaigns.length ? openCampaigns.some((r) => inSendWindow(r)) : rows.length ? inSendWindow(rows[0]) : true,
    windowText: rows.length ? `${rows[0].send_window_start}〜${rows[0].send_window_end}時${rows[0].weekdays_only ? "・平日" : ""}` : "",
    todo: counts.all ?? 0,
    todoCaptcha: counts.captcha ?? 0,
    emailPaused: senderRows.map((sd) => { const p = emailPause(sd); return p ? { label: sd.label || sd.company, until: p.until, reason: p.reason } : null; }).filter(Boolean) as { label: string; until: number; reason: string }[],
    senders: senderRows.length,
    campaigns: rows.length,
  };
  res.send(layout("ホーム", campaignListView(rows, aiStatusLabel(), senderRows.map((x) => ({ id: x.id, label: x.label, company: x.company, person: x.person })), home), takeFlash(req), navUser(req), updateReady));
});

app.get("/campaigns/new", (req, res) => {
  const sc = scope(req);
  const senders = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as SenderProfile[];
  res.send(layout("新規キャンペーン", campaignForm(senders, { template_text: DEFAULT_TEMPLATE }, activeProvider(), undefined, groupNames(req), groupCandidates(req)), takeFlash(req), navUser(req), updateReady));
});

app.post("/campaigns", upload.single("material_file"), (req, res) => {
  const b = req.body;
  const channel = ["form_first", "email_first", "email_only", "form_only", "form", "email", "both"].includes(b.channel) ? b.channel : "form_first";
  if (!ownedSender(req, Number(b.sender_id))) return redirectWith(res, "/campaigns/new", "送信者を選び直してください");
  const materialUrl = String(b.material_url ?? "").trim();
  const r = db.prepare(`INSERT INTO form_campaigns(owner_user_id, name, sender_id, mode, subject_text, template_text, ai_instruction, daily_limit, send_window_start, send_window_end, weekdays_only, channel, email_daily_limit, resend_days, ignore_refusal, material_url, group_name, material_url_in_email, email_warmup, email_sender_ids)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(me(req).id, b.name, Number(b.sender_id), b.mode, b.subject_text ?? "", b.template_text ?? "", b.ai_instruction ?? "", Number(b.daily_limit) || 300, Number(b.send_window_start) || 9, Number(b.send_window_end) || 18, Number(b.weekdays_only) ? 1 : 0, channel, Number(b.email_daily_limit) || 100, Math.max(0, Number(b.resend_days ?? 90) || 0), Number(b.ignore_refusal) ? 1 : 0, materialUrl, String(b.group_name ?? "").trim(), b.material_url_in_email === "1" ? 1 : 0, b.email_warmup === "1" ? 1 : 0, extraSenderIds(req, b));
  const cid = Number(r.lastInsertRowid);
  // 資料ファイル（メール添付用）を保存する
  const warn = req.file ? saveMaterial(cid, req.file) : "";
  applyGroupMembers(req, cid, "", b);
  redirectWith(res, `/campaigns/${cid}`, `キャンペーンを作成しました。CSVを取り込んでください。${warn ? `／⚠ ${warn}` : ""}`);
});

/** メールで使う追加の送信アカウント（#24）。自分が使えるアカウントだけを受け付ける */
function extraSenderIds(req: express.Request, b: Record<string, unknown>): string {
  const raw = b.email_sender_ids;
  const ids = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((x) => Number(x)).filter((n) => n > 0);
  return ids.filter((id) => ownedSender(req, id)).join(",");
}

// ---- キャンペーン編集 ----
app.get("/campaigns/:id/edit", (req, res) => {
  const id = Number(req.params.id);
  const c = ownedCampaign(req, id);
  if (!c) return res.status(404).send("not found");
  const sc = scope(req);
  const senders = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as SenderProfile[];
  res.send(layout(`編集 | ${c.name}`, campaignForm(senders, c, activeProvider(), id, groupNames(req), groupCandidates(req)), takeFlash(req), navUser(req), updateReady));
});
app.post("/campaigns/:id/edit", upload.single("material_file"), (req, res) => {
  const id = Number(req.params.id);
  const before = ownedCampaign(req, id);
  if (!before) return res.status(404).send("not found");
  const prevGroupName = before.group_name || "";
  const b = req.body;
  const channel = ["form_first", "email_first", "email_only", "form_only", "form", "email", "both"].includes(b.channel) ? b.channel : "form_first";
  if (!ownedSender(req, Number(b.sender_id))) return redirectWith(res, `/campaigns/${id}/edit`, "送信者を選び直してください");
  db.prepare(`UPDATE form_campaigns SET name=?, sender_id=?, mode=?, subject_text=?, template_text=?, ai_instruction=?, daily_limit=?, send_window_start=?, send_window_end=?, weekdays_only=?, channel=?, email_daily_limit=?, resend_days=?, ignore_refusal=?, material_url=?, group_name=?, material_url_in_email=?, email_warmup=?, email_sender_ids=? WHERE id=?`)
    .run(b.name, Number(b.sender_id), b.mode, b.subject_text ?? "", b.template_text ?? "", b.ai_instruction ?? "", Number(b.daily_limit) || 300, Number(b.send_window_start) || 9, Number(b.send_window_end) || 18, Number(b.weekdays_only) ? 1 : 0, channel, Number(b.email_daily_limit) || 100, Math.max(0, Number(b.resend_days ?? 90) || 0), Number(b.ignore_refusal) ? 1 : 0, String(b.material_url ?? "").trim(), String(b.group_name ?? "").trim(), b.material_url_in_email === "1" ? 1 : 0, b.email_warmup === "1" ? 1 : 0, extraSenderIds(req, b), id);
  const attachWarn = req.file ? saveMaterial(id, req.file) : "";
  if (req.file) { /* 保存済み。注意文は下の完了メッセージに付ける */ }
  else if (b.remove_attach === "1" && before.attach_path) {
    // 添付を外す。複製したキャンペーンは同じファイルを指していることがあるので、他に使っていなければファイルも消す
    db.prepare("UPDATE form_campaigns SET attach_path='', attach_name='' WHERE id=?").run(id);
    removeMaterialFileIfUnused(before.attach_path);
    applyGroupMembers(req, id, prevGroupName, b);
    return redirectWith(res, `/campaigns/${id}/edit`, `添付ファイル「${before.attach_name}」を削除しました（メールは添付なしで送られます）`);
  }
  applyGroupMembers(req, id, prevGroupName, b);
  redirectWith(res, `/campaigns/${id}`, `キャンペーンを保存しました${attachWarn ? `／⚠ ${attachWarn}` : ""}`);
});

// 添付ファイルの大きさの目安。重い添付はGmail側で止まる（実例: 13MBの添付で送信が止まった）
const ATTACH_WARN_MB = 5;
const ATTACH_MAX_MB = 10;

// 資料ファイルを DATA_DIR/materials に保存し、キャンペーンに紐づける。
// 戻り値は利用者に見せる注意文（問題なければ空文字）
function saveMaterial(campaignId: number, file: Express.Multer.File): string {
  const mb = file.size / 1024 / 1024;
  if (mb > ATTACH_MAX_MB) {
    return `添付ファイル（${mb.toFixed(1)}MB）が大きすぎるため登録しませんでした。${ATTACH_MAX_MB}MB以下にしてください（重い添付はメールが送れなくなります）。資料は公開リンクで送る方法もおすすめです`;
  }
  const safeExt = path.extname(file.originalname).replace(/[^.\w]/g, "").slice(0, 10) || ".pdf";
  const dest = path.join(MATERIAL_DIR, `campaign-${campaignId}${safeExt}`);
  fs.writeFileSync(dest, file.buffer);
  const name = Buffer.from(file.originalname, "latin1").toString("utf8"); // multer は元名を latin1 で持つ
  db.prepare("UPDATE form_campaigns SET attach_path=?, attach_name=? WHERE id=?").run(dest, name || `資料${safeExt}`, campaignId);
  return mb > ATTACH_WARN_MB
    ? `添付ファイルは ${mb.toFixed(1)}MB です。${ATTACH_WARN_MB}MBを超える添付は届かないことがあるため、できれば圧縮するか、公開リンクで送ることをおすすめします`
    : "";
}

/** 資料ファイルを、どのキャンペーンからも使われていなければ消す（アプリの資料フォルダ内のものだけ） */
function removeMaterialFileIfUnused(p: string) {
  if (!p || !path.resolve(p).startsWith(path.resolve(MATERIAL_DIR))) return;
  const used = db.prepare("SELECT 1 FROM form_campaigns WHERE attach_path=? LIMIT 1").get(p);
  if (!used) fs.rmSync(p, { force: true });
}

function loadCampaignFull(req: express.Request, id: number) {
  const c = ownedCampaign(req, id);
  if (!c) return null;
  const sender = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(c.sender_id) as SenderProfile;
  return { ...c, sender };
}

const lastImports = new Map<number, ImportSummary>();
const pendingImports = new Map<number, { rows: CompanyRow[]; srcLabel: string }>();
const previews = new Map<number, { job: Job; subject: string; message: string; aiUsed: boolean; lint?: import("./message.js").Lint[]; emailHtml?: string }>();

app.get("/campaigns/:id", (req, res) => {
  const id = Number(req.params.id);
  const c = loadCampaignFull(req, id);
  if (!c) return res.status(404).send("not found");
  const { statusFilter, qFilter, outcomeFilter, impFilter, sortKey, orderBy, sql: fSql, args: fArgs } = jobFilter(req.query as Record<string, unknown>);
  const jobs = db.prepare(`SELECT * FROM form_jobs WHERE campaign_id=? AND ${fSql} ORDER BY ${orderBy} LIMIT 200`).all(id, ...fArgs) as Job[];
  // 絞り込み条件に一致する件数（一覧は200件までしか出ないので、全件の数と送信済みの数を別に数える）
  const matched = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(status='sent'),0) sent FROM form_jobs WHERE campaign_id=? AND is_test=0 AND ${fSql}`).get(id, ...fArgs) as { n: number; sent: number };
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
  // 「失敗した会社を再送信」の対象を一覧で見せる（どの会社が対象か分かるように）
  const retryTargets = retryTargetJobs(id);
  // 今日・今月の送信数（東京時間で数える）。キャンペーン画面でもすぐ分かるように
  const period = db.prepare(`SELECT
      COALESCE(SUM(date(sent_at,'+9 hours')=date('now','+9 hours') AND channel='form'),0) todayForm,
      COALESCE(SUM(date(sent_at,'+9 hours')=date('now','+9 hours') AND channel='email'),0) todayEmail,
      COALESCE(SUM(strftime('%Y-%m',sent_at,'+9 hours')=strftime('%Y-%m','now','+9 hours') AND channel='form'),0) monthForm,
      COALESCE(SUM(strftime('%Y-%m',sent_at,'+9 hours')=strftime('%Y-%m','now','+9 hours') AND channel='email'),0) monthEmail
    FROM form_jobs WHERE campaign_id=? AND is_test=0 AND status='sent' AND sent_at IS NOT NULL`).get(id) as { todayForm: number; todayEmail: number; monthForm: number; monthEmail: number };
  // 事前チェックの対象外（メールで送る会社）の件数。事前チェック欄に「なぜ件数に入らないか」を出すため
  const emailQueued = (db.prepare("SELECT COUNT(*) n FROM form_jobs WHERE campaign_id=? AND is_test=0 AND status='queued' AND channel='email'").get(id) as { n: number }).n;
  // 残り時間の目安（#55）。直近の送信ペースから、いつ終わりそうかを出す
  const pace = db.prepare(`SELECT (julianday(MAX(sent_at)) - julianday(MIN(sent_at))) * 86400 secs, COUNT(*) n
    FROM (SELECT sent_at FROM form_jobs WHERE campaign_id=? AND status='sent' AND is_test=0 AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 50)`).get(id) as { secs: number | null; n: number };
  const perJob = pace && pace.n >= 5 && pace.secs ? Math.max(1, pace.secs / (pace.n - 1)) : 10; // 実績が少ないうちは1社10秒とみなす
  const queuedNow = counts.queued ?? 0;
  let eta = "";
  if (queuedNow > 0) {
    const leftToday = Math.max(0, (c.daily_limit + c.email_daily_limit) - (sentToday(id, "form") + sentToday(id, "email")));
    const doable = Math.min(queuedNow, leftToday);
    const minutes = Math.round((doable * perJob) / 60);
    const end = new Date(Date.now() + minutes * 60_000 + 9 * 3600_000).toISOString();
    eta = doable === 0
      ? `本日の上限に達しています。残り ${queuedNow}社は翌営業日の送信時間帯に続きます（1社あたり約${Math.round(perJob)}秒）`
      : `残り ${queuedNow}社 ／ このペース（1社あたり約${Math.round(perJob)}秒）だと、きょう送れる ${doable}社で約${minutes}分（${end.slice(11, 16)}ごろ）${doable < queuedNow ? `。残りの ${queuedNow - doable}社は翌営業日に続きます` : ""}`;
  }
  res.send(layout(c.name, campaignView(c, jobs, counts, isRunning(id), aiStatusLabel(), { preview, windowOk: inSendWindow(c), sentToday: sentToday(id, "form"), emailSentToday: sentToday(id, "email"), scanning: isScanning(id), unscanned, scanned, statusFilter, qFilter, outcomeFilter, impFilter, sortKey, eta, undo: recentUndo(id, me(req).id), matched, attempts, outcomes, lastImport: consumedImport, retryTargets, emailQueued, period, emailPaused: emailPause(c.sender), imports: importHistory(id), reactions: db.prepare("SELECT id, company_name, domain, email, channel, outcome, outcome_note, updated_at FROM form_jobs WHERE campaign_id=? AND is_test=0 AND outcome<>'' ORDER BY updated_at DESC").all(id) as ReactionRow[], replyScan: { ...replyScanStatus(db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(c.sender_id) as SenderProfile | undefined), checking: isCheckingReplies() } }), takeFlash(req), navUser(req), updateReady));
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
  const importId = db.prepare("INSERT INTO form_imports(campaign_id, src_label, rows_count) VALUES(?,?,?)").run(id, pending.srcLabel, pending.rows.length).lastInsertRowid as number;
  const s = importRowsToCampaign(id, pending.rows, { importId });
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
  // 実測: export は「存在しないgid」だと400を返す（URLに #gid= が無いとき gid=0 を決め打ちすると、
  // 先頭タブのgidが0でないシートで400になる）。gid不明なら gid を付けずに先頭シートを取る。
  const base = `https://docs.google.com/spreadsheets/d/${id}`;
  const candidates = gid
    ? [`${base}/export?format=csv&gid=${gid}`, `${base}/gviz/tq?tqx=out:csv&gid=${gid}`, `${base}/export?format=csv`, `${base}/gviz/tq?tqx=out:csv`]
    : [`${base}/export?format=csv`, `${base}/gviz/tq?tqx=out:csv`];
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
    // メールでの見え方（#70）も作っておく（実際に送る本文と同じ関数で組み立てる）
    const emailHtml = channelMode(c.channel) !== "form_only" ? buildEmailBody(composed.message, c.sender, job.email).html : "";
    previews.set(id, { job, ...composed, lint: lintMessage(composed.message, composed.subject, c.channel), emailHtml });
    res.redirect(`/campaigns/${id}`);
  } catch (e) {
    redirectWith(res, `/campaigns/${id}`, `プレビュー生成エラー: ${jpError(e, 160)}`);
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

app.post("/campaigns/:id/start", async (req, res) => {
  const id = Number(req.params.id);
  const camp = ownedCampaign(req, id);
  if (!camp) return res.status(403).send(DENIED);
  if (isRunning(id)) return redirectWith(res, `/campaigns/${id}`, "すでに実行中です");
  const only = ["email", "form"].includes(String(req.body.only)) ? String(req.body.only) : "";

  // 開始前に、送信用メールの設定を1回だけ確かめる。
  // 以前は設定不備のまま走り出し、メールの会社を次々と失敗にしていた（実例: 「2段階認証が必要」で180件が失敗）。
  // フォームだけ送る場合は確認しない（メールを使わないので）
  const willSendEmail = only !== "form" && channelMode(camp.channel) !== "form_only";
  // 営業メールの表示義務の確認を、最初の1回だけ見てもらう（#85）
  if (willSendEmail && !getSetting(lawKey(me(req).id), "")) {
    flashes.set("/law", "営業メールを送る前に、法律で必要な表示（名称・住所・配信停止の連絡先）をご確認ください。確認は最初の1回だけです");
    return res.redirect("/law");
  }
  if (willSendEmail) {
    const sender = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(camp.sender_id) as SenderProfile | undefined;
    if (!sender) return redirectWith(res, `/campaigns/${id}`, "送信者が見つかりません");
    const chk = senderEmailOk(sender);
    if (!chk.ok) {
      logError("start", `開始前チェックで中止: ${chk.reason}`);
      return redirectWith(res, `/campaigns/${id}`, `メールの設定が足りないため開始していません: ${chk.reason}／「送信者」の画面で登録してから開始してください（フォームだけ送るなら「対象: フォームの会社だけ」で開始できます）`);
    }
    try {
      // 返ってこない環境で画面が固まらないよう20秒で見切る
      await Promise.race([
        testSmtp(sender),
        new Promise((_, rej) => setTimeout(() => rej(new Error("ETIMEDOUT 接続の確認が20秒で終わりませんでした")), 20_000)),
      ]);
      clearEmailPause(sender); // 設定し直して通ったのなら、前の一時停止は解除する
    } catch (e) {
      const why = explainSmtpError(e, sender);
      const hint = checkSmtpPassword(sender);
      logError("start", `開始前のメール接続テストに失敗: ${why}`);
      return redirectWith(res, `/campaigns/${id}`, `メールを送れない状態のため開始していません: ${why}${hint ? `／${hint}` : ""}（フォームだけ送るなら「対象: フォームの会社だけ」で開始できます）`);
    }
  }
  db.prepare("UPDATE form_campaigns SET status='running', send_only=? WHERE id=?").run(only, id);
  const ignoreWindow = req.body.ignore_window === "1";
  runCampaign(id, { ignoreWindow }).then((r) => console.log(`[campaign ${id}] ${r.processed}件処理 (${r.reason})`)).catch((e) => { console.error(e); logError("worker", `送信を開始できませんでした: ${jpError(e)}`); });
  const onlyLabel = only === "email" ? "メールの会社だけ" : only === "form" ? "フォームの会社だけ" : "すべて";
  redirectWith(res, `/campaigns/${id}`, `送信を開始しました（対象: ${onlyLabel}${ignoreWindow ? "・時間帯を無視" : ""}）${ignoreWindow ? "" : "。送信時間帯外の場合は時間になると自動で始まります"}`);
});

app.post("/campaigns/:id/scan", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "実行中です");
  scanCampaign(id).then((r) => console.log(`[scan ${id}] ${r.scanned}件 (${r.reason})`)).catch((e) => { console.error(e); logError("scan", `事前チェックを開始できませんでした: ${jpError(e)}`); });
  redirectWith(res, `/campaigns/${id}`, "事前チェックを始めました（1社5〜10秒）");
});
// 「フォーム無し」になった会社を、もう一度 事前チェックの対象に戻す（#8）。
// フォームの探し方（サイトマップ・フッター・会社概要経由・外部フォームサービス・URLの言い換え）を強化したので、
// 以前の判定をやり直せるようにする
app.post("/campaigns/:id/rescan-noform", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "実行中です。先に止めてください");
  const n = db.prepare(`UPDATE form_jobs SET status='queued', channel='form', scanned_at=NULL, scan_score=-1,
      result_text='フォームをもう一度探します（探し方を強化した版で再チェック）'
    WHERE campaign_id=? AND is_test=0 AND status='skip_no_form'`).run(id).changes;
  logInfo("scan", `フォーム無しの ${n}件を再チェック対象に戻しました`);
  redirectWith(res, `/campaigns/${id}`, `${n}社を再チェックの対象に戻しました。「事前チェックを実行」を押してください`);
});

app.post("/campaigns/:id/stop-scan", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  requestStop(-id);
  redirectWith(res, `/campaigns/${id}`, "事前チェックを止めます");
});

// 返信の自動確認を今すぐ実行（ふだんは15分ごとに裏で動く）
app.post("/replies/check", async (req, res) => {
  const back = /^\/campaigns\/\d+$/.test(String(req.body.back ?? "")) ? String(req.body.back) : "/";
  const r = await checkReplies().catch((e) => ({ recorded: 0, errors: [String((e as Error)?.message ?? e)] }));
  redirectWith(res, back, r.errors.length ? `返信の確認でエラー: ${r.errors.join(" / ")}` : `返信を確認しました（新しく記録した反応 ${r.recorded}件）`);
});

export type ReactionRow = { id: number; company_name: string; domain: string; email: string; channel: string; outcome: string; outcome_note: string; updated_at: string };

// 反応の一覧から、判定（返信あり・アポ・断り）を取り消す。会社そのもの・送信記録は消さない。
// 自動判定の「断り」で自動登録した除外リスト・配信停止も一緒に外す（手で登録した分は残す）
app.post("/campaigns/:id/outcomes/clear", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  const raw = req.body.ids;
  const ids = (Array.isArray(raw) ? raw : raw != null ? [raw] : []).map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0);
  if (!ids.length) return redirectWith(res, `/campaigns/${id}#reactions`, "取り消す会社が選択されていません");
  const rows = db.prepare(`SELECT id, company_name, domain, email, outcome, outcome_note FROM form_jobs WHERE campaign_id=? AND is_test=0 AND outcome<>'' AND id IN (${ids.map(() => "?").join(",")})`).all(id, ...ids) as ReactionRow[];
  db.transaction(() => {
    for (const r of rows) {
      db.prepare("UPDATE form_jobs SET outcome='', outcome_note='', updated_at=datetime('now') WHERE id=?").run(r.id);
      if (r.outcome === "declined" && r.outcome_note.startsWith("自動判定")) {
        const reason = `断り・返信から自動判定（${r.company_name}）`;
        if (r.domain) db.prepare("DELETE FROM form_suppressions WHERE domain=? AND reason=?").run(r.domain, reason);
        if (r.email) db.prepare("DELETE FROM email_optouts WHERE email=? AND reason=?").run(r.email.trim().toLowerCase(), reason);
      }
    }
  })();
  redirectWith(res, `/campaigns/${id}#reactions`, `${rows.length}社の反応の判定を取り消しました`);
});

app.post("/jobs/:id/outcome", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  const outcome = ["", "replied", "appointment", "declined"].includes(req.body.outcome) ? req.body.outcome : j.outcome;
  // 自動判定を人が直したときは、その返信に出てきた言い回しを覚えて次から同じように振り分ける（#25）
  let learned = 0;
  if (outcome && outcome !== j.outcome && j.outcome_note.startsWith("自動判定")) {
    const body = (j.outcome_note.match(/本文「…([\s\S]*?)…」/)?.[1] ?? "").trim();
    if (body) learned = learnFromCorrection(body, outcome as "replied" | "appointment" | "declined", j.company_name);
  }
  db.prepare("UPDATE form_jobs SET outcome=?, outcome_note=?, updated_at=datetime('now') WHERE id=?").run(outcome, String(req.body.note ?? "").slice(0, 300), id);
  if (outcome === "declined") {
    if (j.domain) db.prepare("INSERT OR IGNORE INTO form_suppressions(domain, reason) VALUES(?,?)").run(j.domain, `断り（${j.company_name}）`);
    if (j.email) optOut(j.email, `断り（${j.company_name}）`, me(req).id);
  }
  redirectWith(res, `/jobs/${id}`, `反応を記録しました${learned ? `／この返信の言い回し ${learned}件を覚えました（次から同じ言い回しは「${OUTCOME_LABEL[outcome] ?? outcome}」に振り分けます。設定画面で確認・削除できます）` : ""}`);
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
  const lines = ["企業名,送り方,送信先,業種,状態,結果,反応,メモ,送信日時", ...jobs.map((j) => [j.company_name, j.channel === "email" ? "メール" : "フォーム", j.channel === "email" ? j.email : j.form_url, j.sub_industry || j.industry, STATUS_LABEL[j.status] ?? j.status, (j.result_text || "").split("\n")[0], OUTCOME_LABEL[j.outcome] ?? "", j.outcome_note, jst(j.sent_at)].map(q).join(","))];
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
  // この会社とのやり取りの履歴（#56）。ドメインが無い会社は社名で突き合わせる
  const sc = scope(req);
  const history = db.prepare(`SELECT j.id, c.name campaign_name, j.channel, j.status, j.result_text, j.sent_at, j.updated_at, j.outcome, j.outcome_note
    FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id
    WHERE j.is_test=0 AND ${sc.sql.replace("owner_user_id", "c.owner_user_id")} AND ${j.domain ? "j.domain=?" : "j.company_name=?"}
    ORDER BY COALESCE(j.sent_at, j.updated_at) DESC LIMIT 30`).all(...sc.args, j.domain || j.company_name) as import("./views.js").JobHistory[];
  res.send(layout(j.company_name, jobView(j, c, history), takeFlash(req), navUser(req), updateReady));
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
// キャンペーンを削除（取り込んだ会社・送信履歴・スクリーンショット・添付資料も）。除外リストは共通なので残す。
// 送信中・事前チェック中は、途中の処理と食い違わないよう削除させない
app.post("/campaigns/:id/delete", (req, res) => {
  const id = Number(req.params.id);
  const c = ownedCampaign(req, id);
  if (!c) return res.status(404).send("not found");
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "送信中・事前チェック中のキャンペーンは削除できません。先に止めてから削除してください");
  const jobIds = (db.prepare("SELECT id FROM form_jobs WHERE campaign_id=?").all(id) as { id: number }[]).map((r) => r.id);
  db.transaction(() => {
    db.prepare("DELETE FROM form_jobs WHERE campaign_id=?").run(id);
    db.prepare("DELETE FROM form_campaigns WHERE id=?").run(id);
  })();
  for (const jid of jobIds) fs.rmSync(path.join(SCREENSHOT_DIR, `job-${jid}.png`), { force: true });
  if (c.attach_path) removeMaterialFileIfUnused(c.attach_path); // 複製したキャンペーンが同じファイルを使っていれば残す
  pendingImports.delete(id);
  lastImports.delete(id);
  redirectWith(res, "/", `キャンペーン「${c.name}」を削除しました（取り込んだ会社 ${jobIds.length} 件の記録も削除）`);
});

app.post("/campaigns/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const c = ownedCampaign(req, id);
  if (!c) return res.status(404).send("not found");
  const r = db.prepare(`INSERT INTO form_campaigns(owner_user_id, name, sender_id, mode, subject_text, template_text, ai_instruction, daily_limit, send_window_start, send_window_end, weekdays_only, channel, email_daily_limit, resend_days, ignore_refusal, material_url, attach_path, attach_name, status, group_name, material_url_in_email)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)`).run(me(req).id, c.name + " のコピー", c.sender_id, c.mode, c.subject_text, c.template_text, c.ai_instruction, c.daily_limit, c.send_window_start, c.send_window_end, c.weekdays_only, c.channel, c.email_daily_limit, c.resend_days, c.ignore_refusal, c.material_url, c.attach_path, c.attach_name, c.group_name, c.material_url_in_email ?? 0); // 複製は同じグループのまま
  redirectWith(res, `/campaigns/${Number(r.lastInsertRowid)}`, "キャンペーンを複製しました。会社リストは空なので、CSVを取り込んでください");
});

// 失敗した会社をまとめて「待機中」に戻す（このあと「開始」で再送信）
app.post("/campaigns/:id/requeue-failed", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  // 会社単位・最新の結果が失敗のものだけを戻す（古い失敗行まで戻すと同じ会社に何度も送ってしまうため）
  const targets = retryTargetJobs(id);
  if (!targets.length) return redirectWith(res, `/campaigns/${id}`, "再送信の対象がありません");
  const ph = targets.map(() => "?").join(",");
  const r = db.prepare(`UPDATE form_jobs SET status='queued', result_text='', updated_at=datetime('now') WHERE id IN (${ph})`).run(...targets.map((t) => t.id));
  redirectWith(res, `/campaigns/${id}`, `失敗していた ${r.changes} 社を待機中に戻しました。「開始」で再送信できます`);
});

// 手動で送れた会社を「送信済み（手動）」にする（手動送信リストの消し込み用）
// 間違って取り込んだ会社などを送信一覧から完全に消す（記録ごと削除。送信済みを消すとその会社への再送防止は効かなくなる）
/** 送信一覧の絞り込み条件（状態・反応・会社名・取り込み）。一覧の表示と「条件に一致する全件を削除」で同じ条件を使う */
function jobFilter(q: Record<string, unknown>) {
  const statusFilter = typeof q.status === "string" && q.status in STATUS_LABEL ? q.status : "";
  const qFilter = typeof q.q === "string" ? q.q.trim().slice(0, 60) : "";
  const outcomeFilter = ["replied", "appointment", "declined", "none"].includes(String(q.outcome)) ? String(q.outcome) : "";
  const impRaw = String(q.imp ?? "");
  const impFilter = /^(i\d+|r\d+-\d+)$/.test(impRaw) ? impRaw : "";
  const where: string[] = ["1=1"];
  const args: (string | number)[] = [];
  if (statusFilter) { where.push("status=?"); args.push(statusFilter); }
  if (qFilter) { where.push("(company_name LIKE ? OR domain LIKE ?)"); args.push(`%${qFilter}%`, `%${qFilter}%`); }
  if (outcomeFilter === "none") where.push("outcome=''");
  else if (outcomeFilter) { where.push("outcome=?"); args.push(outcomeFilter); }
  let m: RegExpMatchArray | null;
  if ((m = impFilter.match(/^i(\d+)$/))) { where.push("import_id=?"); args.push(Number(m[1])); }
  else if ((m = impFilter.match(/^r(\d+)-(\d+)$/))) { where.push("import_id IS NULL AND id BETWEEN ? AND ?"); args.push(Number(m[1]), Number(m[2])); }
  // 並び替え（#51）。件数が増えると目的の会社を探しにくいので、列の見出しから切り替えられるようにする
  const SORTS: Record<string, string> = {
    "": "updated_at DESC, id DESC",
    updated: "updated_at DESC, id DESC",
    updated_asc: "updated_at ASC, id ASC",
    company: "company_name COLLATE NOCASE ASC, id DESC",
    company_desc: "company_name COLLATE NOCASE DESC, id DESC",
    status: "status ASC, updated_at DESC",
    score: "scan_score DESC, updated_at DESC",
    id: "id ASC",
  };
  const sortKey = typeof q.sort === "string" && q.sort in SORTS ? q.sort : "";
  return { statusFilter, qFilter, outcomeFilter, impFilter, sortKey, orderBy: SORTS[sortKey], sql: where.join(" AND "), args };
}

// ---- キャンペーンの設定をファイルで渡す ----
// 別のPCのアポハッチくんに同じ文面・設定を用意するための書き出し／読み込み。
// 会社リスト・送信履歴・送信者（メールのパスワード）は含めない（設定と文面だけ）
const CAMPAIGN_EXPORT_COLS = ["name", "mode", "subject_text", "template_text", "ai_instruction", "channel", "daily_limit", "email_daily_limit", "send_window_start", "send_window_end", "weekdays_only", "resend_days", "ignore_refusal", "material_url", "material_url_in_email", "group_name"] as const;

app.get("/campaigns/:id/export.json", (req, res) => {
  const c = ownedCampaign(req, Number(req.params.id));
  if (!c) return res.status(404).send("not found");
  const settings: Record<string, unknown> = {};
  for (const k of CAMPAIGN_EXPORT_COLS) settings[k] = (c as unknown as Record<string, unknown>)[k];
  const out = { app: "apo-hatch", type: "campaign", version: currentVersion(), exported_at: new Date().toISOString(), note: "キャンペーンの設定と文面だけです（会社リスト・送信履歴・送信者は含みません）", campaign: settings };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="campaign-${c.id}.json"`);
  res.send(JSON.stringify(out, null, 2));
});

app.post("/campaigns/import", upload.single("file"), (req, res) => {
  try {
    const raw = req.file ? req.file.buffer.toString("utf8") : String(req.body.pasted ?? "");
    if (!raw.trim()) return redirectWith(res, "/", "キャンペーンのファイル（.json）を選ぶか、中身を貼り付けてください");
    const data = JSON.parse(raw) as { app?: string; type?: string; campaign?: Record<string, unknown> };
    const c = data.campaign;
    if (data.app !== "apo-hatch" || data.type !== "campaign" || !c) return redirectWith(res, "/", "アポハッチくんのキャンペーン設定ファイルではありません");
    const senderId = Number(req.body.sender_id);
    if (!ownedSender(req, senderId)) return redirectWith(res, "/", "送信者を選んでください（読み込んだ設定は、自分の送信者に結び付けます）");
    const str = (k: string, fb = "") => String(c[k] ?? fb);
    const num = (k: string, fb: number) => (Number.isFinite(Number(c[k])) ? Number(c[k]) : fb);
    const channel = ["form_first", "email_first", "email_only", "form_only"].includes(str("channel")) ? str("channel") : "form_first";
    const mode = ["template", "tpl_ai", "hybrid", "ai"].includes(str("mode")) ? str("mode") : "template";
    const r = db.prepare(`INSERT INTO form_campaigns(owner_user_id, name, sender_id, mode, subject_text, template_text, ai_instruction, daily_limit, send_window_start, send_window_end, weekdays_only, channel, email_daily_limit, resend_days, ignore_refusal, material_url, group_name, material_url_in_email, status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`)
      .run(me(req).id, str("name", "読み込んだキャンペーン"), senderId, mode, str("subject_text"), str("template_text"), str("ai_instruction"),
        num("daily_limit", 300), num("send_window_start", 9), num("send_window_end", 18), Number(c.weekdays_only) ? 1 : 0, channel,
        num("email_daily_limit", 100), num("resend_days", 90), Number(c.ignore_refusal) ? 1 : 0, str("material_url"), str("group_name"), Number(c.material_url_in_email) ? 1 : 0);
    redirectWith(res, `/campaigns/${r.lastInsertRowid}`, "キャンペーンの設定を読み込みました。会社リストを取り込んで開始してください");
  } catch (e) {
    redirectWith(res, "/", `読み込みエラー: ${String((e as Error).message).slice(0, 120)}`);
  }
});

// ---- 取り込み履歴と、取り込み単位・全件の削除 ----
// 一覧は200件までしか出ないため、2000件などを間違えて取り込むと「選択して削除」では消しきれなかった。
export type ImportBatch = { key: string; label: string; at: string; total: number; sent: number; queued: number };

/** このキャンペーンの取り込み履歴（新しい順）。取り込み記録がある分は1回ずつ、
 *  記録の無い昔の分は、登録時刻が2分以内に続いている会社を1回ぶんとしてまとめる */
function importHistory(campaignId: number): ImportBatch[] {
  const out: ImportBatch[] = [];
  for (const r of db.prepare(`SELECT i.id, i.src_label, i.created_at, COUNT(j.id) total, COALESCE(SUM(j.status='sent'),0) sent, COALESCE(SUM(j.status='queued'),0) queued
    FROM form_imports i JOIN form_jobs j ON j.import_id=i.id AND j.is_test=0 WHERE i.campaign_id=? GROUP BY i.id`).all(campaignId) as { id: number; src_label: string; created_at: string; total: number; sent: number; queued: number }[]) {
    out.push({ key: `i${r.id}`, label: r.src_label || "取り込み", at: r.created_at, total: r.total, sent: r.sent, queued: r.queued });
  }
  const legacy = db.prepare("SELECT id, status, created_at FROM form_jobs WHERE campaign_id=? AND is_test=0 AND import_id IS NULL ORDER BY id").all(campaignId) as { id: number; status: string; created_at: string }[];
  let cur: { from: number; to: number; at: string; last: number; total: number; sent: number; queued: number } | null = null;
  const flush = () => { if (cur) out.push({ key: `r${cur.from}-${cur.to}`, label: "取り込み（記録前）", at: cur.at, total: cur.total, sent: cur.sent, queued: cur.queued }); };
  for (const j of legacy) {
    const t = Date.parse(String(j.created_at).replace(" ", "T") + "Z");
    if (!cur || !(t - cur.last <= 120_000)) { flush(); cur = { from: j.id, to: j.id, at: j.created_at, last: t, total: 0, sent: 0, queued: 0 }; }
    cur.to = j.id; cur.last = t; cur.total++;
    if (j.status === "sent") cur.sent++;
    if (j.status === "queued") cur.queued++;
  }
  flush();
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** 削除する前に、消す行をそのまま控えておく（#60）。30分以内なら「元に戻す」で戻せる。
 *  誤って取り込み分や全件を消した事故があったため、取り返しがつくようにする（スクリーンショットは戻らない） */
function snapshotJobs(campaignId: number, userId: number, label: string, rows: Record<string, unknown>[]): number {
  if (!rows.length) return 0;
  // 控えは直近5件だけ残す（古いものと、30分より前のものは消す）
  db.prepare("DELETE FROM deleted_jobs WHERE created_at < datetime('now','-1 day')").run();
  const r = db.prepare("INSERT INTO deleted_jobs(campaign_id, user_id, label, rows_count, payload) VALUES(?,?,?,?,?)")
    .run(campaignId, userId, label.slice(0, 80), rows.length, JSON.stringify(rows));
  return Number(r.lastInsertRowid);
}

/** いま「元に戻す」ボタンを出すべき削除（30分以内・このキャンペーン） */
function recentUndo(campaignId: number, userId: number): { id: number; label: string; rows_count: number } | null {
  return (db.prepare(`SELECT id, label, rows_count FROM deleted_jobs
    WHERE campaign_id=? AND user_id=? AND created_at > datetime('now','-30 minutes') ORDER BY id DESC LIMIT 1`).get(campaignId, userId) as { id: number; label: string; rows_count: number } | undefined) ?? null;
}

function deleteJobsWhere(campaignId: number, sql: string, args: (string | number)[], undo?: { userId: number; label: string }): number {
  const rows = db.prepare(`SELECT * FROM form_jobs WHERE campaign_id=? AND is_test=0 AND ${sql}`).all(campaignId, ...args) as Record<string, unknown>[];
  const ids = rows.map((r) => Number(r.id));
  if (!ids.length) return 0;
  if (undo) snapshotJobs(campaignId, undo.userId, undo.label, rows);
  db.transaction(() => { for (let i = 0; i < ids.length; i += 500) { const part = ids.slice(i, i + 500); db.prepare(`DELETE FROM form_jobs WHERE id IN (${part.map(() => "?").join(",")})`).run(...part); } })();
  for (const jid of ids) fs.rmSync(path.join(SCREENSHOT_DIR, `job-${jid}.png`), { force: true });
  return ids.length;
}

// 削除を元に戻す（#60）
app.post("/undo/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM deleted_jobs WHERE id=? AND user_id=?").get(Number(req.params.id), me(req).id) as { id: number; campaign_id: number; payload: string; rows_count: number; label: string } | undefined;
  if (!row) return redirectWith(res, "/", "元に戻せる削除が見つかりませんでした（30分を過ぎたか、すでに戻しています）");
  let restored = 0;
  try {
    const rows = JSON.parse(row.payload) as Record<string, unknown>[];
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const stmt = db.prepare(`INSERT OR IGNORE INTO form_jobs(${cols.join(",")}) VALUES(${cols.map((c) => `@${c}`).join(",")})`);
    db.transaction(() => { for (const r of rows) restored += stmt.run(r).changes; })();
  } catch (e) {
    logError("undo", `削除の取り消しに失敗: ${jpError(e)}`);
    return redirectWith(res, `/campaigns/${row.campaign_id}`, `元に戻せませんでした: ${jpError(e, 120)}`);
  }
  db.prepare("DELETE FROM deleted_jobs WHERE id=?").run(row.id);
  redirectWith(res, `/campaigns/${row.campaign_id}`, `${restored}件を元に戻しました（${row.label}）。スクリーンショットの画像は戻りません`);
});

// 取り込み1回ぶんを全件削除
app.post("/campaigns/:id/imports/delete", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "送信中・事前チェック中は削除できません。先に止めてから削除してください");
  const key = String(req.body.key ?? "");
  let n = 0;
  let m: RegExpMatchArray | null;
  if ((m = key.match(/^i(\d+)$/))) {
    n = deleteJobsWhere(id, "import_id=?", [Number(m[1])], { userId: me(req).id, label: "取り込み1回ぶんの削除" });
    db.prepare("DELETE FROM form_imports WHERE id=? AND campaign_id=?").run(Number(m[1]), id);
  } else if ((m = key.match(/^r(\d+)-(\d+)$/))) {
    n = deleteJobsWhere(id, "import_id IS NULL AND id BETWEEN ? AND ?", [Number(m[1]), Number(m[2])], { userId: me(req).id, label: "取り込み1回ぶんの削除" });
  } else return redirectWith(res, `/campaigns/${id}`, "削除する取り込みが分かりませんでした");
  lastImports.delete(id);
  redirectWith(res, `/campaigns/${id}`, `取り込んだ会社 ${n} 件を削除しました`);
});

// メール送信の一時停止を手動で解除する（Gmail の停止が解けた・パスワードを直した後など）
app.post("/campaigns/:id/email-resume", (req, res) => {
  const c = loadCampaignFull(req, Number(req.params.id));
  if (!c) return res.status(404).send("not found");
  clearEmailPause(c.sender);
  redirectWith(res, `/campaigns/${c.id}`, "メール送信の一時停止を解除しました。実行中なら次の会社から送信を再開します");
});

// 送信一覧の絞り込み条件に一致する会社を全件削除（表示中の200件に限らない）。条件なしなら全件
app.post("/campaigns/:id/delete-filtered", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "送信中・事前チェック中は削除できません。先に止めてから削除してください");
  const f = jobFilter(req.body as Record<string, unknown>);
  const n = deleteJobsWhere(id, f.sql, f.args, { userId: me(req).id, label: "絞り込みに一致する会社の削除" });
  // 中身が空になった取り込み記録は履歴から消す
  db.prepare("DELETE FROM form_imports WHERE campaign_id=? AND NOT EXISTS (SELECT 1 FROM form_jobs j WHERE j.import_id=form_imports.id)").run(id);
  lastImports.delete(id);
  redirectWith(res, `/campaigns/${id}`, `条件に一致した会社 ${n} 件を削除しました`);
});

// このキャンペーンの会社を全件削除（キャンペーン自体と設定・文面は残す）
app.post("/campaigns/:id/jobs/delete-all", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  if (isRunning(id) || isScanning(id)) return redirectWith(res, `/campaigns/${id}`, "送信中・事前チェック中は削除できません。先に止めてから削除してください");
  const n = deleteJobsWhere(id, "1=1", [], { userId: me(req).id, label: "送信一覧の全件削除" });
  db.prepare("DELETE FROM form_imports WHERE campaign_id=?").run(id);
  lastImports.delete(id);
  redirectWith(res, `/campaigns/${id}`, `このキャンペーンの会社 ${n} 件をすべて削除しました（キャンペーンの設定・文面は残っています）`);
});

// 選択した会社をまとめて削除（記録ごと）。このキャンペーンに属するジョブだけを対象にする
app.post("/campaigns/:id/bulk-delete", (req, res) => {
  const id = Number(req.params.id);
  if (!ownedCampaign(req, id)) return res.status(403).send(DENIED);
  const raw = req.body.ids;
  const ids = (Array.isArray(raw) ? raw : raw != null ? [raw] : []).map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0);
  if (!ids.length) return redirectWith(res, `/campaigns/${id}`, "削除する会社が選択されていません");
  const ph = ids.map(() => "?").join(",");
  // 選んだ行の会社（ドメイン）ごと、履歴も含めてまとめて消す
  const doms = (db.prepare(`SELECT DISTINCT domain FROM form_jobs WHERE campaign_id=? AND is_test=0 AND id IN (${ph}) AND domain<>''`).all(id, ...ids) as { domain: string }[]).map((r) => r.domain);
  let changes = 0;
  const undo = { userId: me(req).id, label: `選択した ${ids.length}社の削除` };
  if (doms.length) changes += deleteJobsWhere(id, `domain IN (${doms.map(() => "?").join(",")})`, doms, undo);
  changes += deleteJobsWhere(id, `id IN (${ph})`, ids, undo); // ドメインが無い行
  redirectWith(res, `/campaigns/${id}`, `${changes} 件を送信一覧から削除しました（30分以内なら画面上部から元に戻せます）`);
});

app.post("/jobs/:id/delete", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  // 一覧では同じ会社（ドメイン）を1行にまとめているので、履歴もまとめて消す
  const n = j.domain
    ? deleteJobsWhere(j.campaign_id, "domain=?", [j.domain], { userId: me(req).id, label: `${j.company_name} の削除` })
    : deleteJobsWhere(j.campaign_id, "id=?", [id], { userId: me(req).id, label: `${j.company_name} の削除` });
  redirectWith(res, `/campaigns/${j.campaign_id}`, `${j.company_name} の記録 ${n} 件を送信一覧から削除しました（30分以内なら画面上部から元に戻せます）`);
});

app.post("/jobs/:id/mark-sent", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  db.prepare("UPDATE form_jobs SET status='sent', result_text='手動で送信済みにしました', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id);
  redirectWith(res, String(req.body.back ?? "") === "todo" ? "/todo" : `/jobs/${id}`, `${j.company_name} を「送信済み（手動）」にしました`);
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
  // 「メールで送信」ボタンなら、フォームURLが入っていてもメールに切り替える
  const via = String(req.body.via ?? "");
  if (via === "email" && !email) return redirectWith(res, `/jobs/${id}#fix`, "メールアドレスを入れてから「メールで送信」を押してください");
  const channel = via === "email" ? "email" : !formUrl && email ? "email" : j.channel === "email" && formUrl ? "form" : j.channel;
  const domain = domainOf(formUrl || siteUrl) || (email ? email.split("@")[1] ?? j.domain : j.domain);
  // status は変えない（直前の失敗ステータスを processJob が履歴として拾えるようにするため）
  db.prepare("UPDATE form_jobs SET form_url=?, site_url=?, company_name=?, email=?, channel=?, domain=?, updated_at=datetime('now') WHERE id=?")
    .run(formUrl, siteUrl, company, email, channel, domain, id);
  // メール送信ではブラウザを使わないので起動しない（そのぶん速く、古いOSでも動く）
  const browser = channel === "email" ? null : await launchBrowser();
  try {
    const r = await processJob(browser as never, id);
    redirectWith(res, `/jobs/${id}`, `${channel === "email" ? "メールで送信した結果" : "修正して再送信した結果"}: ${STATUS_LABEL[r.status] ?? r.status}${r.result_text ? `（${r.result_text.split("\n")[0].slice(0, 60)}）` : ""}`);
  } catch (e) {
    redirectWith(res, `/jobs/${id}`, `再送信エラー: ${String((e as Error).message)}`);
  } finally {
    await browser?.close().catch(() => {});
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

// 画面にブラウザを開いてフォームを入力した状態で止める（送信はしない）。人が確認して送るための補助
app.post("/jobs/:id/assist", async (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(403).send(DENIED);
  const c = loadCampaignFull(req, j.campaign_id);
  if (!c) return res.status(404).send("not found");
  try {
    // 文面は一度作ったもの（message_used）を優先。無ければ作る（HP本文はキャッシュがあれば使う）
    const site = (db.prepare("SELECT title, text FROM site_cache WHERE domain=?").get(j.domain) as { title: string; text: string } | undefined) ?? { title: "", text: "" };
    const comp = await composeMessage(j, c.sender, c, site);
    const message = j.message_used || comp.message;
    const r = await openAndFill({ formUrl: j.form_url, siteUrl: j.site_url, sender: c.sender, subject: comp.subject, message });
    const back = String(req.body.back ?? "") === "todo" ? "/todo" : `/jobs/${id}`;
    redirectWith(res, back, r.ok
      ? `ブラウザを開いて${r.detail}。送信したら「送信済みにする」を押してください`
      : `ブラウザを開きました：${r.detail}`);
  } catch (e) {
    redirectWith(res, String(req.body.back ?? "") === "todo" ? "/todo" : `/jobs/${id}`, `ブラウザを開けませんでした: ${jpError(e, 150)}`);
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
const SENDER_COLS = ["label", "company", "industry", "person", "person_kana", "email", "reply_email", "tel", "postal", "address", "url", "from_email", "smtp_user", "smtp_host", "smtp_port", "unsubscribe_url"];
// 送信者フォームの簡易チェック。問題があれば日本語メッセージ、無ければ null
const PREF_RE = /^(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/;
/** 住所が都道府県から始まっていないと、フォームの「都道府県」の選択肢を選べない（先頭の北海道のまま送られる事故があった） */
function prefWarning(address: string): string {
  const a = (address ?? "").trim();
  return a && !PREF_RE.test(a) ? "　※ 住所は都道府県から入力してください（フォームの都道府県の選択肢が正しく選べません）" : "";
}

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
  // チェックボックスは未チェックだと送られてこないので、値の有無で 0/1 にする
  const telReqOnly = req.body.tel_required_only ? 1 : 0;
  const replyCheck = req.body.reply_check ? 1 : 0;
  db.prepare(`INSERT INTO sender_profiles(owner_user_id, ${SENDER_COLS.join(",")}, smtp_pass, tel_required_only, reply_check, tls_insecure) VALUES(?, ${SENDER_COLS.map(() => "?").join(",")}, ?, ?, ?, ?)`).run(me(req).id, ...vals, String(req.body.smtp_pass ?? "").trim(), telReqOnly, replyCheck, req.body.tls_insecure ? 1 : 0);
  redirectWith(res, "/senders", `送信者を追加しました${prefWarning(String(req.body.address ?? ""))}`);
});
app.post("/senders/:id", (req, res) => {
  if (!ownedSender(req, Number(req.params.id))) return res.status(403).send(DENIED);
  const verr = validateSender(req.body);
  if (verr) return redirectWith(res, `/senders/${Number(req.params.id)}`, verr);
  const vals = SENDER_COLS.map((k) => String(req.body[k] ?? "").trim());
  const pass = String(req.body.smtp_pass ?? "").trim();
  const telReqOnly = req.body.tel_required_only ? 1 : 0;
  // 設定を直したら、メール送信の一時停止は解除する（直したのに止まったままにならないように）
  { const old = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(Number(req.params.id)) as SenderProfile | undefined; if (old) clearEmailPause(old); }
  db.prepare(`UPDATE sender_profiles SET ${SENDER_COLS.map((c) => `${c}=?`).join(",")}, tel_required_only=?, reply_check=?, tls_insecure=?${pass ? ", smtp_pass=?" : ""} WHERE id=?`).run(...vals, telReqOnly, req.body.reply_check ? 1 : 0, req.body.tls_insecure ? 1 : 0, ...(pass ? [pass] : []), Number(req.params.id));
  redirectWith(res, "/senders", `保存しました${prefWarning(String(req.body.address ?? ""))}`);
});

// ---- suppressions / settings ----
const suppImports = new Map<number, ReturnType<typeof importSuppressions>>();
app.get("/suppressions", (req, res) => {
  const sc = scope(req);
  const rows = db.prepare(`SELECT * FROM form_suppressions WHERE ${sc.sql} ORDER BY id DESC LIMIT 1000`).all(...sc.args) as any[];
  const optouts = db.prepare(`SELECT * FROM email_optouts WHERE ${sc.sql} ORDER BY created_at DESC LIMIT 500`).all(...sc.args) as any[];
  const imported = suppImports.get(me(req).id);
  suppImports.delete(me(req).id);
  res.send(layout("除外リスト", suppressionsView(rows, optouts, imported, loadSuppSync(me(req).id), {
    industries: getSetting("excluded_industries", ""),
    replyRules: loadReplyRules(),
  }), takeFlash(req), navUser(req), updateReady));
});

/** 除外リストをCSVで書き出す。列は取り込みと同じなので、別PCの「CSVでまとめて追加」にそのまま読み込める
    （除外リストはPCごとに独立のため、チーム内での手動共有に使う） */
app.get("/suppressions/export.csv", (req, res) => {
  const sc = scope(req);
  const rows = db.prepare(`SELECT * FROM form_suppressions WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as any[];
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["会社名,ドメイン,メール,電話,理由,登録日時", ...rows.map((r) => [r.company_name, r.domain, r.email, r.tel, r.reason, jst(r.created_at)].map(q).join(","))];
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", "attachment; filename=suppressions.csv");
  res.send("﻿" + lines.join("\n"));
});

// ---- 共有の除外リスト（スプレッドシート）を自動で取り込む ----
// チームで別々のPCに入れて使う場合、断りの会社を全員に行き渡らせる手段が無かった（PCごとに独立のため）。
// 1つのスプレッドシートを「共有NGリスト」にして、各自のアポハッチくんが1日1回そこから取り込む。
type SuppSync = { url: string; userId: number; lastAt?: string; lastResult?: string };
const suppSyncKey = (userId: number) => `supp_sync:${userId}`;
function loadSuppSync(userId: number): SuppSync | null {
  try { const v = JSON.parse(getSetting(suppSyncKey(userId), "null")) as SuppSync | null; return v?.url ? v : null; } catch { return null; }
}
function saveSuppSync(userId: number, v: SuppSync) { setSetting.run(suppSyncKey(userId), JSON.stringify(v)); }

/** 共有スプレッドシートから除外リストを取り込む。戻り値は画面に出す結果の文 */
async function syncSuppressionsFor(userId: number): Promise<string> {
  const cfg = loadSuppSync(userId);
  if (!cfg) return "共有リストのURLが設定されていません";
  try {
    const rows = parseSuppressionText(await fetchGoogleSheetCsv(cfg.url));
    if (!rows.length) return "取り込める行がありませんでした（1行目の見出しと、会社名・URL/ドメイン・メールの列を確認してください）";
    const r = importSuppressions(rows, userId, "共有リストから自動取り込み");
    const msg = `追加 ${r.added}件 / すでに登録済み ${r.already}件${r.noKey ? ` / 判別できず ${r.noKey}件` : ""}`;
    saveSuppSync(userId, { ...cfg, lastAt: new Date().toISOString(), lastResult: msg });
    return msg;
  } catch (e) {
    const msg = `エラー: ${String((e as Error).message).slice(0, 120)}`;
    saveSuppSync(userId, { ...cfg, lastAt: new Date().toISOString(), lastResult: msg });
    return msg;
  }
}

/** 設定されている全員ぶんを取り込む（1日1回・起動2分後にも1回） */
async function syncAllSuppressions() {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'supp_sync:%'").all() as { key: string; value: string }[];
  for (const r of rows) {
    const userId = Number(r.key.split(":")[1]);
    if (!Number.isInteger(userId)) continue;
    const msg = await syncSuppressionsFor(userId);
    console.log(`[apo-hatch] 共有除外リストの取り込み（ユーザー${userId}）: ${msg}`);
  }
}

// 共有リストのURLを保存する
app.post("/suppressions/sync-url", (req, res) => {
  const url = String(req.body.sheet_url ?? "").trim();
  const uid = me(req).id;
  if (!url) { db.prepare("DELETE FROM settings WHERE key=?").run(suppSyncKey(uid)); return redirectWith(res, "/suppressions", "共有リストの自動取り込みを解除しました"); }
  if (!/spreadsheets\/d\//.test(url)) return redirectWith(res, "/suppressions", "GoogleスプレッドシートのURL（/spreadsheets/d/… を含む）を貼ってください");
  saveSuppSync(uid, { url, userId: uid, ...(loadSuppSync(uid) ?? {}) , lastAt: loadSuppSync(uid)?.lastAt, lastResult: loadSuppSync(uid)?.lastResult });
  redirectWith(res, "/suppressions", "共有リストを登録しました。1日1回、自動で取り込みます（今すぐ取り込むこともできます）");
});

// 送りたくない業種・キーワード（#87）
app.post("/suppressions/industries", (req, res) => {
  const words = String(req.body.industries ?? "").split(/[\n,、，]/).map((w) => w.trim()).filter((w) => w.length >= 2);
  saveSetting("excluded_industries", words.join("\n"));
  redirectWith(res, "/suppressions", words.length ? `${words.length}件のキーワードを除外に設定しました（取り込み時と送信直前に確認します）` : "除外キーワードを解除しました");
});

// 返信の自動判定が覚えた言い回しを消す（#25）
app.post("/reply-rules/:id/delete", (req, res) => {
  db.prepare("DELETE FROM reply_rules WHERE id=?").run(Number(req.params.id));
  clearReplyRulesCache();
  redirectWith(res, "/suppressions", "覚えた言い回しを削除しました");
});

// 今すぐ取り込む
app.post("/suppressions/sync-now", async (req, res) => {
  const msg = await syncSuppressionsFor(me(req).id);
  redirectWith(res, "/suppressions", `共有リストから取り込みました: ${msg}`);
});

/** 除外リストをCSVでまとめて追加 */
app.post("/suppressions/import", upload.single("csv"), async (req, res) => {
  const pasted = String(req.body.pasted ?? "").trim();
  const sheetUrl = String(req.body.sheet_url ?? "").trim();
  try {
    let rows, src;
    if (req.file) { rows = parseSuppressionCsv(req.file.buffer); src = "CSV"; }
    else if (pasted) { rows = parseSuppressionText(pasted); src = "貼り付け"; }
    else if (sheetUrl) { rows = parseSuppressionText(await fetchGoogleSheetCsv(sheetUrl)); src = "スプレッドシート"; }
    else return redirectWith(res, "/suppressions", "貼り付け・スプレッドシートのURL・CSVファイルのいずれかを指定してください");
    if (!rows.length) return redirectWith(res, "/suppressions", "登録できる行がありませんでした（会社名・URL/ドメイン・メールのいずれかを1行1社で入れてください）");
    const r = importSuppressions(rows, me(req).id, String(req.body.reason ?? "").trim() || `${src}で一括登録`);
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
// おまけのゲームの表示オン／オフ（管理者のみ）
app.post("/settings/notify", (req, res) => {
  db.prepare("INSERT INTO settings(key,value) VALUES('notify_desktop',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(req.body.notify_desktop === "1" ? "1" : "0");
  redirectWith(res, "/settings", req.body.notify_desktop === "1" ? "送信が止まったときにパソコンへ通知します" : "パソコンへの通知をオフにしました");
});

// 通知の見え方を確認する
app.post("/settings/notify-test", (req, res) => {
  notify("テスト通知", "この通知が出れば設定はOKです（送信が止まったときにも同じように出ます）", `test:${Date.now()}`);
  redirectWith(res, "/settings", "テスト通知を送りました（画面の右上などに出ます。出ない場合はOS側の通知設定をご確認ください）");
});

app.post("/settings/game", requireAdmin, (req, res) => {
  const on = req.body.game_enabled === "1";
  db.prepare("INSERT INTO settings(key,value) VALUES('game_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(on ? "1" : "0");
  redirectWith(res, "/settings", on ? "おまけのゲームを表示します（共有用URLでは表示されません）" : "おまけのゲームを非表示にしました");
});

// ---- はじめの設定（#41）----
// 「どこから手を付ければいいか分からない」で止まるのを防ぐ、順番どおりの案内
app.get("/setup", (req, res) => {
  const sc = scope(req);
  const senders = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as SenderProfile[];
  const sender = senders[0];
  const camp = db.prepare(`SELECT * FROM form_campaigns c WHERE ${sc.sql.replace("owner_user_id", "c.owner_user_id")} ORDER BY id DESC LIMIT 1`).get(...sc.args) as Campaign | undefined;
  const jobsWhere = `FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id WHERE j.is_test=0 AND ${sc.sql.replace("owner_user_id", "c.owner_user_id")}`;
  const n = (sql: string) => (db.prepare(sql).get(...sc.args) as { n: number }).n;
  res.send(layout("はじめの設定", setupView({
    senderOk: Boolean(sender?.company?.trim()),
    senderLabel: sender ? `${sender.label || sender.company}` : "",
    addressOk: Boolean(sender?.address?.trim()),
    smtpOk: Boolean(sender?.smtp_user && sender?.smtp_pass),
    smtpTested: Boolean(sender && !emailPause(sender)),
    lawOk: Boolean(getSetting(lawKey(me(req).id), "")),
    campaignOk: Boolean(camp),
    campaignId: camp?.id ?? 0,
    listCount: n(`SELECT COUNT(*) n ${jobsWhere}`),
    scannedOk: n(`SELECT COUNT(*) n ${jobsWhere} AND j.scanned_at IS NOT NULL`) > 0,
    sentCount: n(`SELECT COUNT(*) n ${jobsWhere} AND j.status='sent'`),
  }), takeFlash(req), navUser(req), updateReady));
});

// ---- 要対応（#50 #10）----// ---- 要対応（#50 #10）----
// 失敗・要確認・CAPTCHA・フォーム無しを1画面でさばけるようにする。取りこぼしが実際の送信に変わるところ
function todoCounts(req: express.Request): Record<string, number> {
  const sc = scope(req);
  const base = `FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id WHERE j.is_test=0 AND ${sc.sql.replace("owner_user_id", "c.owner_user_id")}`;
  const out: Record<string, number> = {};
  out.all = (db.prepare(`SELECT COUNT(*) n ${base} AND ${TODO_ALL}`).get(...sc.args) as { n: number }).n;
  for (const [k, w] of Object.entries(TODO_WHERE)) out[k] = (db.prepare(`SELECT COUNT(*) n ${base} AND ${w}`).get(...sc.args) as { n: number }).n;
  return out;
}

app.get("/todo", (req, res) => {
  const kind = String(req.query.kind ?? "");
  const sc = scope(req);
  const where = TODO_WHERE[kind] ?? TODO_ALL;
  const rows = db.prepare(`SELECT j.*, c.name campaign_name FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id
    WHERE j.is_test=0 AND ${sc.sql.replace("owner_user_id", "c.owner_user_id")} AND ${where}
    ORDER BY j.updated_at DESC LIMIT 300`).all(...sc.args) as (Job & { campaign_name: string })[];
  res.send(layout("要対応", todoView(rows, kind, todoCounts(req)), takeFlash(req), navUser(req), updateReady));
});

// 1社だけ待機に戻す（もう一度自動で送る）
app.post("/jobs/:id/requeue", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  db.prepare("UPDATE form_jobs SET status='queued', result_text='待機に戻しました（手動）', updated_at=datetime('now') WHERE id=?").run(id);
  const back = String(req.body.back ?? "") === "todo" ? "/todo" : `/jobs/${id}`;
  redirectWith(res, back, `${j.company_name} を待機中に戻しました（キャンペーンを開始すると送信します）`);
});

// この会社を除外リストに入れる（今後すべてのキャンペーンで送らない）
app.post("/jobs/:id/suppress", (req, res) => {
  const id = Number(req.params.id);
  const j = ownedJob(req, id);
  if (!j) return res.status(404).send("not found");
  if (j.domain) db.prepare("INSERT OR IGNORE INTO form_suppressions(company_name, domain, reason, owner_user_id) VALUES(?,?,?,?)").run(j.company_name, j.domain, "要対応の画面から除外", me(req).id);
  if (j.email) optOut(j.email, `除外（${j.company_name}）`, me(req).id);
  db.prepare("UPDATE form_jobs SET status='skip_suppressed', result_text='除外リストに追加（手動）', updated_at=datetime(\'now\') WHERE id=?").run(id);
  const back = String(req.body.back ?? "") === "todo" ? "/todo" : `/jobs/${id}`;
  redirectWith(res, back, `${j.company_name} を除外リストに追加しました`);
});

// ---- 営業メールの法律チェック（#85）----// ---- 営業メールの法律チェック（#85）----
// 他社に渡すと、表示義務（名称・住所・配信停止の連絡先）を知らないまま送り始めてしまうため、最初の1回だけ確認してもらう
const lawKey = (userId: number) => `law_ack:${userId}`;
app.get("/law", (req, res) => {
  const sc = scope(req);
  const senders = db.prepare(`SELECT * FROM sender_profiles WHERE ${sc.sql} ORDER BY id`).all(...sc.args) as SenderProfile[];
  const acked = getSetting(lawKey(me(req).id), "");
  res.send(layout("営業メールの決まり", lawView(senders, acked ? jst(acked) : "", senders.some((s) => s.unsubscribe_url)), takeFlash(req), navUser(req), updateReady));
});
app.post("/law/ack", (req, res) => {
  if (!req.body.ack) return redirectWith(res, "/law", "チェックを入れてから進んでください");
  saveSetting(lawKey(me(req).id), new Date().toISOString().replace("T", " ").slice(0, 19));
  redirectWith(res, "/", "確認ありがとうございます。キャンペーンから送信を開始できます");
});

// ---- 動作チェック・エラーログ・診断ファイル・バックアップ ----// ---- 動作チェック・エラーログ・診断ファイル・バックアップ ----
// 「動かない」の原因を、聞き出すやり取りなしで利用者自身が切り分けられるようにするための画面。
app.get("/health", (req, res) => {
  const checks = healthChecks();
  const backups = listBackups();
  const state = {
    autostart: { supported: autostartSupported(), enabled: autostartEnabled(), path: autostartPath() },
    autoUpdate: getSetting("auto_update", "0") === "1",
    awakeNote: AWAKE_NOTE,
    logs: logCounts(),
    backups: backups.slice(0, 10).map((b) => ({ file: b.file, label: backupLabel(b) })),
    backupDir: BACKUP_DIR,
    isAdmin: me(req).role === "admin",
  };
  res.send(layout("動作チェック", healthView(checks, state), takeFlash(req), navUser(req), updateReady));
});

app.get("/logs", (req, res) => {
  const kind = ["error", "warn", "info"].includes(String(req.query.kind)) ? String(req.query.kind) : "";
  res.send(layout("エラーログ", logsView(recentLogs(200, kind), kind, logCounts()), takeFlash(req), navUser(req), updateReady));
});
app.post("/logs/clear", (req, res) => {
  const n = clearLogs();
  redirectWith(res, "/logs", `${n}件のログを消しました`);
});

// サポートに送ってもらう1ファイル（パスワード・APIキーは入っていない）
app.get("/diagnostics.txt", (req, res) => {
  const stamp = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace(/[:T]/g, "-");
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename=apo-hatch-shindan-${stamp}.txt`);
  res.send(diagnosticsText());
});

// 取り込み用CSVの見本（列名で迷わないように）
app.get("/template.csv", (req, res) => {
  const rows = [
    ["企業名", "企業URL", "問い合わせフォーム", "メール", "業界", "都道府県", "代表者名"],
    ["株式会社サンプル商事", "https://example.co.jp/", "https://example.co.jp/contact/", "info@example.co.jp", "製造", "東京都", "山田 太郎"],
    ["サンプル工業株式会社", "https://example2.co.jp/", "", "", "建設", "大阪府", ""],
  ];
  // Excelでそのまま開けるように BOM 付きUTF-8で返す
  const csv = "﻿" + rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n") + "\r\n";
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", "attachment; filename=apo-hatch-list-template.csv");
  res.send(csv);
});

app.post("/backup/create", async (req, res) => {
  try {
    const b = await createBackup("manual");
    redirectWith(res, "/health", `バックアップを作りました（${backupLabel(b)}）。保存先: ${BACKUP_DIR}`);
  } catch (e) {
    logError("backup", `手動バックアップに失敗: ${jpError(e)}`);
    redirectWith(res, "/health", `バックアップに失敗しました: ${jpError(e, 160)}`);
  }
});

// 復元は「予約 → 再起動時に入れ替え」。動いている最中にDBファイルを差し替えると壊れるため
app.post("/backup/restore", requireAdmin, async (req, res) => {
  const file = String(req.body.file ?? "");
  const r = requestRestore(file);
  if (!r.ok) return redirectWith(res, "/health", r.error ?? "復元できませんでした");
  logInfo("backup", `復元を予約: ${file}`);
  res.send(layout("復元します", `<div class="card"><h1>バックアップから復元します</h1>
    <p>「${esc(file)}」の内容に戻します。いまのデータは念のため <code>data/backups</code> に退避します。</p>
    <p class="muted">送信中の会社があれば、送り終わるのを待ってから再起動します（最大2分）。再起動後、この画面をもう一度開いてください。</p>
    <p><a class="btn" href="/">画面に戻る（30秒ほど待ってから）</a></p></div>`, "", navUser(req), updateReady));
  await drainForShutdown();
  requestRestart();
});

app.post("/settings/autostart", requireAdmin, (req, res) => {
  const on = req.body.autostart === "1";
  const r = on ? enableAutostart() : disableAutostart();
  redirectWith(res, "/health", r.message);
});

app.post("/settings/auto-update", requireAdmin, (req, res) => {
  const on = req.body.auto_update === "1";
  saveSetting("auto_update", on ? "1" : "0");
  redirectWith(res, "/health", on ? "新しい版が出たら、起動時に自動で更新します（送信中は送り終わってから）" : "自動更新をオフにしました（「新しい版があります」を押して更新してください）");
});

// ---- 送信数（日別・月別） ----
// 「今日は何件送ったか」「今月はどれくらいか」を見るための画面。日時は東京時間で数える（DBは世界標準時）
app.get("/stats", (req, res) => {
  const mode = String(req.query.mode) === "month" ? "month" : "day";
  const campaignId = Number(req.query.campaign) || 0;
  const sc = scope(req);
  const where = [`j.is_test=0`, `j.sent_at IS NOT NULL`, `j.status='sent'`, sc.sql.replace("owner_user_id", "c.owner_user_id")];
  const args: (string | number)[] = [...sc.args];
  if (campaignId) { where.push("c.id=?"); args.push(campaignId); }
  const bucket = mode === "month" ? "strftime('%Y-%m', j.sent_at, '+9 hours')" : "date(j.sent_at, '+9 hours')";
  const limit = mode === "month" ? 12 : 30;
  const rows = db.prepare(`SELECT ${bucket} period, SUM(j.channel='form') form, SUM(j.channel='email') email, COUNT(*) total
    FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id WHERE ${where.join(" AND ")}
    GROUP BY period ORDER BY period DESC LIMIT ${limit}`).all(...args) as { period: string; form: number; email: number; total: number }[];
  const campaigns = db.prepare(`SELECT id, name FROM form_campaigns c WHERE ${sc.sql.replace("owner_user_id", "c.owner_user_id")} ORDER BY id DESC`).all(...sc.args) as { id: number; name: string }[];
  // 合計は「いま表示している期間（直近30日／12か月）」の合計にする（全期間と混ざらないように）
  const totals = rows.reduce((a, r) => ({ total: a.total + r.total, form: a.form + r.form, email: a.email + r.email }), { total: 0, form: 0, email: 0 });
  res.send(layout("送信数", statsView(rows.reverse(), mode, campaigns, campaignId, totals), takeFlash(req), navUser(req), updateReady));
});

app.get("/guide", (req, res) => {
  res.send(layout("ご利用ガイド", guideView(me(req).role === "admin"), takeFlash(req), navUser(req), updateReady));
});

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
  res.send(layout("設定", settingsView(loadNgWords(), activeAiConfig(), stats, getSetting("game_enabled", "0") === "1", notifyEnabled()), takeFlash(req), navUser(req), updateReady));
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
    await drainForShutdown(); // 送信中の会社を途中で切らない
    requestRestart();   // npm start で起動していれば自動で立ち上がり直す
  }
  res.redirect("/update");
});

// ---- 起動時: 前回アプリが止まったときに「送信中」のまま残った会社 ----
// 送信の途中でアプリが止まると、そのまま「送信中」で永久に残り、再送信の対象にもならなかった。
// 送ったか送っていないか分からないため、いったん「失敗（要確認）」にする（そのまま送り直すと二重送信になり得る）。
// メールは続けて送信済みフォルダを裏で確認し、送れていれば「送信済み」、送れていなければ「待機」に自動で戻す。
// updated_at は送信を始めた時刻のまま残す（送信済みフォルダの照合に使う）
{
  const stuck = db.prepare(`UPDATE form_jobs SET status='failed',
    result_text=CASE WHEN channel='email'
      THEN '送信中にアプリが止まったため中断（送信済みか不明・要確認）: 送信済みフォルダを自動で確認します。確認できない場合は、送信用メールの「送信済み」フォルダに届いているか見て、無ければ再送信してください'
      ELSE '送信中にアプリが止まったため中断（送信済みか不明・要確認）: 相手先から受付メールが届いていないか確認し、無ければ再送信してください' END
    WHERE status='sending'`).run().changes;
  if (stuck) console.log(`[apo-hatch] 送信中のまま止まっていた ${stuck}件を「失敗（要確認）」にしました`);
  setTimeout(() => {
    verifyInterruptedEmails()
      .then((r) => { if (r.sent || r.requeued) console.log(`[apo-hatch] 中断したメールを送信済みフォルダで確認: 送信済み ${r.sent}件 / 未送信→待機に戻した ${r.requeued}件`); })
      .catch((e) => console.error("[interrupted]", e));
  }, 5_000);
}

// ---- 終了時（Ctrl+C・ターミナルを閉じる等）: 送信中の会社が終わるまで待ってから止める ----
// 2回目の Ctrl+C ならすぐ止める（待ちきれない場合用）
let stopping = 0;
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    // ターミナルの Ctrl+C はアプリと起動役（run.mjs）の両方に届き、起動役からも渡されるので、2秒以内の重複は同じ1回とみなす
    if (stopping && Date.now() - stopping > 2000) process.exit(130);
    if (stopping) return;
    stopping = Date.now();
    console.log("\n[apo-hatch] 送信中の会社があれば終わるまで待ってから終了します（すぐ止めるにはもう一度 Ctrl+C）");
    drainForShutdown().finally(() => { releaseAwakeAll(); process.exit(0); });
  });
}

// ---- 自動バックアップ: 起動から1分後に1回、以後は1日1回 ----
// フォルダを消してデータが無くなった実例があるため、DBファイルを data/backups に複製しておく（7世代）
setTimeout(() => { autoBackupIfDue().catch((e) => logError("backup", jpError(e))); }, 60_000);
setInterval(() => { autoBackupIfDue().catch((e) => logError("backup", jpError(e))); }, 6 * 60 * 60_000);

// ---- 自動更新（設定でオンにしたときだけ）----
// 起動から3分後と、以後6時間ごとに確認する。更新前にバックアップを取り、送信中の会社は送り終わってから再起動する
async function autoUpdateIfEnabled() {
  if (getSetting("auto_update", "0") !== "1") return;
  try {
    const st = await checkUpdate(true);
    if (!st.available) return;
    logInfo("update", `自動更新を開始: v${st.current} → v${st.latest}`);
    await autoBackupIfDue();
    const r = await applyUpdate();
    if (!r.ok) {
      logError("update", `自動更新に失敗: ${r.error ?? "原因不明"}`);
      notify("自動更新に失敗しました", `${r.error ?? "原因不明"}（アプリはそのまま使えます。画面右上の「新しい版があります」から手動で更新できます）`, "autoupdate-fail");
      return;
    }
    notify("新しい版に更新しました", `v${r.version} に更新し、再起動します`, `autoupdate:${r.version}`);
    logInfo("update", `自動更新 完了: v${r.version}`);
    await drainForShutdown();
    requestRestart();
  } catch (e) {
    logError("update", `自動更新の確認に失敗: ${jpError(e)}`);
  }
}
setTimeout(() => { autoUpdateIfEnabled().catch(() => {}); }, 3 * 60_000);
setInterval(() => { autoUpdateIfEnabled().catch(() => {}); }, 6 * 60 * 60_000);

// ---- 想定外のエラーもログに残す（黒い画面を閉じていても後から追えるように）----
process.on("uncaughtException", (e) => {
  console.error("[apo-hatch] 想定外のエラー:", e);
  logError("app", `想定外のエラー: ${jpError(e, 400)}`);
});
process.on("unhandledRejection", (e) => {
  console.error("[apo-hatch] 処理されなかったエラー:", e);
  logError("app", `処理されなかったエラー: ${jpError(e, 400)}`);
});

// ---- 返信の自動確認: 送信用メールの受信箱を15分ごとに見て、反応（返信／アポ／断り）を記録 ----
const onReplyErr = (e: unknown) => { console.error("[replies]", e); logError("replies", `受信箱の読み取りに失敗: ${jpError(e)}`); };
setTimeout(() => { checkReplies().catch(onReplyErr); }, 60_000);
setInterval(() => { checkReplies().catch(onReplyErr); }, 15 * 60_000);

// ---- 共有の除外リスト（スプレッドシート）を1日1回取り込む ----
const onSuppErr = (e: unknown) => { console.error("[supp-sync]", e); logError("supp-sync", `共有の除外リストの取り込みに失敗: ${jpError(e)}`); };
setTimeout(() => { syncAllSuppressions().catch(onSuppErr); }, 120_000);
setInterval(() => { syncAllSuppressions().catch(onSuppErr); }, 24 * 60 * 60_000);

// ---- 簡易スケジューラ: running のキャンペーンを送信時間帯に自動再開 ----
setInterval(() => {
  // 固まったまま「実行中」で残っているものがあれば解除してから、送信を再開する
  for (const id of clearStaleRuns()) {
    console.log(`[apo-hatch] キャンペーン ${id} の実行が止まったままだったので、再開できるようにしました`);
    notify("送信が止まっていたので再開します", `キャンペーン #${id} が15分以上動いていなかったため、自動で再開しました`, `stale:${id}`);
  }
  const ids = db.prepare("SELECT id FROM form_campaigns WHERE status='running'").all() as { id: number }[];
  for (const { id } of ids) if (!isRunning(id)) runCampaign(id).catch((e) => { console.error(`[campaign ${id}]`, e); logError("worker", `キャンペーン #${id} を再開できませんでした: ${jpError(e)}`); });
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
  // ダブルクリック起動（アポハッチくん起動.command / .bat）のときは、ブラウザも開く。
  // 「起動したのに、どこを開けばいいか分からない」をなくすため
  if (process.env.FO_OPEN === "1") {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    try { spawn(cmd, args, { stdio: "ignore", detached: true }).unref(); } catch { /* 開けなくても起動は続ける */ }
  }
});

// 共有用（おまけゲームを表示しない）URL。同じアプリ・同じデータ・同じログインで、別ポートから配信する。
// 人に画面を見せるときはこちらのURLを開けば、ゲームのリンクも /game も出ない。
if (process.env.GAME !== "0" && process.env.GAME !== "off" && CLEAN_PORT !== PORT) {
  const clean = app.listen(CLEAN_PORT, () => {
    console.log(`  ├ 共有用（ゲーム非表示）URL: http://localhost:${CLEAN_PORT}`);
    const lan = shareUrls();
    if (lan.length) console.log(`  ├ 他の人のPCから（同じWi-Fi・社内LAN）: ${lan.join("  /  ")}`);
  });
  clean.on("error", (e: NodeJS.ErrnoException) => {
    console.log(`  ※ 共有用URL(${CLEAN_PORT})は開けませんでした（${e.code}）。メインURLはそのまま使えます。`);
  });
}
