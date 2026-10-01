// 画面のスモークテスト（#142）。
// テスト用のデータでアプリを起動し、すべての画面が開けること（白紙やエラーにならないこと）を確かめる。
// 送信はしない。実在の会社にも触れない。20秒ほどで終わる。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fo-smoke-"));
process.env.DATA_DIR = DATA_DIR;
const PORT = 39000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;

// ---- テスト用データを入れる（ダミーの会社だけ）----
const { getDb } = await import("../src/db.js");
const { createUser } = await import("../src/auth.js");
const db = getDb();
createUser("smoke", "smoke-pass-123", { role: "admin", displayName: "スモーク", mustChange: false });
db.prepare(`INSERT INTO sender_profiles(owner_user_id,label,company,person,email,address,tel,smtp_user,smtp_pass)
  VALUES(1,'テスト送信者','株式会社テスト','山田 太郎','a@example.test','東京都港区1-1-1','03-0000-0000','a@example.test','abcdabcdabcdabcd')`).run();
db.prepare(`INSERT INTO form_campaigns(owner_user_id,name,sender_id,mode,subject_text,template_text,status)
  VALUES(1,'スモーク用キャンペーン',1,'template','ご案内','{{会社名}} 本文','paused')`).run();
const ins = db.prepare(`INSERT INTO form_jobs(campaign_id,company_name,site_url,domain,industry,prefecture,channel,email,status,result_text,sent_at,outcome,outcome_note,scan_score)
  VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const rows: [string, string, string, string, string, string, string, string, string, string | null, string, string, number][] = [
  ["送信済み商事", "https://sent.example.test/", "sent.example.test", "製造", "東京都", "form", "", "sent", "完了文言を検知", "2026-09-30 01:00:00", "appointment", "自動判定（キーワード: 「日程」）2026-09-30 10:00 件名「Re: ご案内」 本文「…来週の日程をいただけますか…」", 90],
  ["断り工業", "https://no.example.test/", "no.example.test", "建設", "大阪府", "email", "info@no.example.test", "sent", "メール送信", "2026-09-30 02:00:00", "declined", "", -1],
  ["待機物産", "https://wait.example.test/", "wait.example.test", "卸売", "愛知県", "form", "", "queued", "", null, "", "", 70],
  ["認証株式会社", "https://cap.example.test/", "cap.example.test", "IT", "東京都", "form", "", "skip_captcha", "CAPTCHAあり", null, "", "", 30],
  ["失敗サービス", "https://fail.example.test/", "fail.example.test", "サービス", "福岡県", "form", "", "failed", "入力エラー: この質問は必須です", null, "", "", 60],
  ["設定ミス一号", "", "m1.example.test", "小売", "北海道", "email", "a@m1.example.test", "failed", "メール送信エラー: このアカウントは2段階認証が必要です", null, "", "", -1],
  ["設定ミス二号", "", "m2.example.test", "小売", "北海道", "email", "a@m2.example.test", "failed", "メール送信エラー: このアカウントは2段階認証が必要です", null, "", "", -1],
  ["フォーム無し建設", "https://nf.example.test/", "nf.example.test", "建設", "広島県", "form", "", "skip_no_form", "サイトにアクセスできない", null, "", "", 0],
];
for (const r of rows) ins.run(...r);
db.close();

// ---- アプリを起動 ----
const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  env: { ...process.env, PORT: String(PORT), CLEAN_PORT: "0", GAME: "0", DATA_DIR, FO_OPEN: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
const stop = () => { try { child.kill("SIGKILL"); } catch { /* すでに終了 */ } };
process.on("exit", stop);

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return; } catch { /* まだ */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`アプリが起動しませんでした:\n${out.slice(-800)}`);
}

let failed = 0;
const ng = (m: string) => { failed++; console.error(`NG: ${m}`); };

try {
  await waitUp();
  const login = await fetch(`${BASE}/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "username=smoke&password=smoke-pass-123" });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("ログインできませんでした");
  const get = (p: string) => fetch(`${BASE}${p}`, { headers: { cookie }, redirect: "manual" });

  // [経路, 含まれているべき文字]
  const pages: [string, string][] = [
    ["/", "ホーム"],
    ["/setup", "はじめの設定"],
    ["/todo", "要対応"],
    ["/todo?kind=captcha", "認証株式会社"],
    ["/todo?kind=failed", "失敗サービス"],
    ["/stats", "送信数"],
    ["/report", "週次レポート"],
    ["/health", "動作チェック"],
    ["/logs", "エラーログ"],
    ["/settings", "設定"],
    ["/senders", "テスト送信者"],
    ["/senders/1", "株式会社テスト"],
    ["/suppressions", "除外リスト"],
    ["/campaigns/new", "キャンペーン"],
    ["/campaigns/1", "スモーク用キャンペーン"],
    ["/campaigns/1?tab=send", "スモーク用キャンペーン"],
    ["/campaigns/1?tab=result", "送信済み商事"],
    ["/campaigns/1/edit", "スモーク用キャンペーン"],
    ["/jobs/1", "送信済み商事"],
    ["/guide", "ご利用ガイド"],
    ["/law", "特定電子メール法"],
    ["/users", "ユーザー管理"],
    ["/update", "アップデート"],
    ["/checklist", "チェックリスト"],
    ["/template.csv", "企業名"],
    ["/diagnostics.txt", "診断ファイル"],
  ];
  for (const [p, must] of pages) {
    const r = await get(p);
    const body = await r.text();
    if (r.status !== 200) { ng(`${p} → HTTP ${r.status}`); continue; }
    if (!body.includes(must)) ng(`${p} に「${must}」がありません`);
    if (/undefined|\[object Object\]|NaN(?![a-zA-Z])/.test(body.replace(/<script[\s\S]*?<\/script>/g, ""))) ng(`${p} に undefined / [object Object] / NaN が表示されています`);
  }
  // 無いページは、整ったエラーページで 404 を返す
  {
    const r = await get("/jobs/999999");
    const body = await r.text();
    if (r.status !== 404) ng(`/jobs/999999 → HTTP ${r.status}（404のはず）`);
    if (!body.includes("ホームに戻る")) ng("404ページに「ホームに戻る」がありません");
  }
  // 英語の内部値がそのまま出ていないこと（#102）
  {
    const body = await (await get("/")).text();
    if (/>\s*(paused|running|done|draft)\s*</.test(body)) ng("ホームに英語の状態（paused 等）がそのまま出ています");
    if (/>\s*(template|tpl_ai|hybrid)\s*</.test(body)) ng("ホームに英語のモード（template 等）がそのまま出ています");
  }
  // 起動中にエラーが出ていないこと
  if (/TypeError|ReferenceError|SqliteError/.test(out)) ng(`起動ログにエラー:\n${out.slice(-600)}`);
} catch (e) {
  ng(String((e as Error).message ?? e));
} finally {
  stop();
}

if (failed) { console.error(`\nsmoke: ${failed}件 失敗`); process.exit(1); }
console.log("smoke: ALL OK");
process.exit(0);
