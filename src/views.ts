// 画面のHTML。BRIDGE HATCH の配色（honey-400 #FFC62E / hive-900 #1C1710）に合わせてある。
import { STATUS_LABEL, OUTCOME_LABEL, CHANNEL_LABEL, channelMode, jst, type Campaign, type Job, type SenderProfile, type JobStatus } from "./db.js";
import { AI_MODELS, type Lint } from "./message.js";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type NavUser = { username: string; display_name: string; role: string; gameOn?: boolean } | null;

export function layout(title: string, body: string, flash = "", user: NavUser = null, updateReady = false): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | アポハッチくん</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2048%22%3E%3Crect%20width%3D%2248%22%20height%3D%2248%22%20rx%3D%2210%22%20fill%3D%22%23FFF8E1%22%2F%3E%3Cpath%20d%3D%22M20%2015C18.5%2010%2016%208.5%2013.5%208%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%222.2%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%2F%3E%3Cpath%20d%3D%22M28%2015C29.5%2010%2032%208.5%2034.5%208%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%222.2%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%2F%3E%3Ccircle%20cx%3D%2212.8%22%20cy%3D%227.4%22%20r%3D%222.4%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2235.2%22%20cy%3D%227.4%22%20r%3D%222.4%22%20fill%3D%22%231C1710%22%2F%3E%3Cellipse%20cx%3D%229.5%22%20cy%3D%2221%22%20rx%3D%227.6%22%20ry%3D%225.3%22%20fill%3D%22%23fff%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%221.6%22%20transform%3D%22rotate%28-24%209.5%2021%29%22%2F%3E%3Cellipse%20cx%3D%2238.5%22%20cy%3D%2221%22%20rx%3D%227.6%22%20ry%3D%225.3%22%20fill%3D%22%23fff%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%221.6%22%20transform%3D%22rotate%2824%2038.5%2021%29%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2214%22%20width%3D%2222%22%20height%3D%2229%22%20rx%3D%2211%22%20fill%3D%22%23FFC62E%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%222%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2228.5%22%20width%3D%2222%22%20height%3D%224.6%22%20fill%3D%22%231C1710%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2237%22%20width%3D%2222%22%20height%3D%224.6%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2219.6%22%20cy%3D%2222.5%22%20r%3D%222.3%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2228.4%22%20cy%3D%2222.5%22%20r%3D%222.3%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2220.4%22%20cy%3D%2221.7%22%20r%3D%22.8%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2229.2%22%20cy%3D%2221.7%22%20r%3D%22.8%22%20fill%3D%22%23fff%22%2F%3E%3C%2Fsvg%3E">
<style>
:root{--honey:#FFC62E;--honey-50:#FFF8E1;--honey-100:#FFEDB3;--hive:#1C1710;--hive-600:#4A4237;--hive-200:#D9D4CC;--bg:#FAF8F3;--ok:#2E7D32;--ng:#C62828;--warn:#B26A00}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:var(--bg);color:var(--hive);font-size:14px}
header{background:var(--hive);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:18px}header a{color:#fff;text-decoration:none}header .logo{background:var(--honey);color:var(--hive);font-weight:700;padding:4px 12px 4px 8px;border-radius:8px;display:inline-flex;align-items:center;gap:6px}header .logo .hatch{display:block;flex:none}header .brandsub{font-size:11px;letter-spacing:.06em;color:#C9C1B4;margin-left:-10px;align-self:center}header .who{margin-left:auto;color:#C9C1B4;font-size:12px}header a.sub{color:#C9C1B4;font-size:12px}header a.upd{background:var(--honey);color:var(--hive);font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px}
main{max-width:1100px;margin:0 auto;padding:20px}h1{font-size:20px;margin:0 0 14px}h2{font-size:16px;margin:22px 0 8px}
.card{background:#fff;border:1px solid var(--hive-200);border-radius:12px;padding:16px;margin-bottom:16px}
label{display:block;font-weight:600;margin:10px 0 4px}input[type=text],input[type=number],input[type=url],input[type=email],textarea,select{width:100%;padding:8px;border:1px solid var(--hive-200);border-radius:8px;font:inherit}textarea{min-height:140px}
.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.btn{display:inline-block;background:var(--honey);color:var(--hive);border:0;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer;text-decoration:none;font:inherit}.btn.sub{background:#fff;border:1px solid var(--hive-200)}.btn.danger{background:#fff;border:1px solid var(--ng);color:var(--ng)}
table{width:100%;border-collapse:collapse;background:#fff}th,td{border-bottom:1px solid var(--hive-200);padding:7px 8px;text-align:left;vertical-align:top}th{background:var(--honey-50);font-size:12px}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:#eee}.tag.sent{background:#E8F5E9;color:var(--ok)}.tag.failed{background:#FFEBEE;color:var(--ng)}.tag.queued{background:var(--honey-100)}.tag.sending{background:#E3F2FD}.tag.skip{background:#F3E5F5;color:#6A1B9A}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{background:#fff;border:1px solid var(--hive-200);border-radius:10px;padding:10px 14px;min-width:110px}.stat b{display:block;font-size:22px}
.flash{background:var(--honey-100);padding:10px 14px;border-radius:8px;margin-bottom:14px}.muted{color:var(--hive-600);font-size:12px}pre{white-space:pre-wrap;background:#faf7ef;padding:10px;border-radius:8px;font-size:12px}
.inline{display:inline}.small{font-size:12px}
.spin{display:inline-block;width:11px;height:11px;border:2px solid #90CAF9;border-top-color:#1565C0;border-radius:50%;animation:sp .9s linear infinite;vertical-align:-1px;margin-right:5px}@keyframes sp{to{transform:rotate(360deg)}}
.bar{height:16px;background:var(--honey-50);border:1px solid var(--hive-200);border-radius:999px;overflow:hidden;margin:8px 0 4px;max-width:560px}.bar i{display:block;height:100%;background:var(--honey);border-radius:999px;transition:width .6s ease}
tr.hl td{background:var(--honey-50)}tr.hl td:first-child{box-shadow:inset 3px 0 0 var(--honey)}
.histbtn{background:none;border:1px solid var(--hive-200);border-radius:999px;padding:1px 8px;font-size:11px;color:var(--hive-600);cursor:pointer;margin-top:3px}
tr.histrow td{background:#FCFAF4;border-bottom:1px dashed var(--hive-200)}
.card.testcard{background:var(--honey-50);border-color:var(--honey)}
.errkind{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;background:#FFF3E0;color:#B26A00;margin-right:4px;white-space:nowrap}
#fo-chara{position:fixed;right:18px;bottom:16px;display:flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:999px;background:transparent;transition:background .35s;pointer-events:none;z-index:50}
#fo-chara.hopper-mode{background:#8BC34A;box-shadow:0 3px 10px rgba(0,0,0,.18)}
#fo-chara .icon{position:relative;width:52px;height:52px;flex:none}
#fo-chara svg{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .25s}
#fo-chara .on{opacity:1}
#fo-chara .bee.on{animation:fo-buzz 1.1s ease-in-out infinite}
#fo-chara .hopper.on{animation:fo-hop 1.6s ease-in-out infinite}
#fo-chara .name{font-weight:700;color:#1C1710;font-size:13px;white-space:nowrap;max-width:0;overflow:hidden;opacity:0;transition:max-width .35s,opacity .35s}
#fo-chara.hopper-mode .name{max-width:120px;opacity:1}
#fo-chara.morph .icon{animation:fo-morph .6s ease}
@keyframes fo-buzz{0%,100%{transform:translateY(0) rotate(-3deg)}25%{transform:translateY(-5px) rotate(2deg)}50%{transform:translateY(-2px) rotate(-2deg)}75%{transform:translateY(-6px) rotate(3deg)}}
@keyframes fo-hop{0%,55%,100%{transform:translateY(0) scaleY(1)}60%{transform:translateY(1px) scaleY(.88)}70%{transform:translateY(-16px) scaleY(1.04)}80%{transform:translateY(-20px)}90%{transform:translateY(1px) scaleY(.9)}95%{transform:translateY(0) scaleY(1)}}
@keyframes fo-morph{0%{transform:scale(1);filter:brightness(1)}40%{transform:scale(1.35) rotate(10deg);filter:brightness(1.9) drop-shadow(0 0 10px var(--honey))}100%{transform:scale(1);filter:brightness(1)}}
</style></head><body>
<header><a class="logo" href="/"><svg class="hatch" viewBox="0 0 48 48" width="22" height="22" role="img" aria-label="ハッチくん"><path d="M20 14C18.5 9 16 7.5 13.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28 14C29.5 9 32 7.5 34.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.8" cy="6.4" r="2.4" fill="#1C1710"/><circle cx="35.2" cy="6.4" r="2.4" fill="#1C1710"/><ellipse cx="9.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(-24 9.5 20)"/><ellipse cx="38.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(24 38.5 20)"/><rect x="13" y="13" width="22" height="29" rx="11" fill="#FFC62E" stroke="#1C1710" stroke-width="2"/><rect x="13" y="27.5" width="22" height="4.6" fill="#1C1710"/><rect x="13" y="36" width="22" height="4.6" fill="#1C1710"/><circle cx="19.6" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="28.4" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="20.4" cy="20.7" r=".8" fill="#fff"/><circle cx="29.2" cy="20.7" r=".8" fill="#fff"/></svg> アポハッチくん</a><span class="brandsub">フォーム＆メール営業</span>${user ? `<a href="/">キャンペーン</a><a href="/senders">送信者</a><a href="/suppressions">除外リスト</a><a href="/settings">設定</a>${user.role === "admin" ? `<a href="/users">ユーザー管理</a>` : ""}${user.gameOn ? `<a href="/game" title="待ち時間の息抜きに">🎰 ゲーム</a>` : ""}${user.role === "admin" && updateReady ? `<a class="upd" href="/update">新しい版があります</a>` : ""}<span class="who">${esc(user.display_name || user.username)}${user.role === "admin" ? "（管理者）" : ""}</span><a class="sub" href="/password">パスワード</a><a class="sub" href="/logout">ログアウト</a>` : ""}</header>
<main>${flash ? `<div class="flash">${esc(flash)}</div>` : ""}${body}</main>
<script>
// 送信系フォームの送信中スピナー＋二重送信防止（既存 .spin スタイルを流用）
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (!(f instanceof HTMLFormElement) || !f.hasAttribute("data-busy")) return;
  const btn = f.querySelector('button[type=submit], button:not([type])');
  if (btn) {
    if (btn.dataset.clicked === "1") { e.preventDefault(); return; }
    btn.dataset.clicked = "1"; btn.disabled = true;
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span>' + (btn.dataset.busytext || "処理中…");
  }
}, true);
</script>
<div id="fo-chara" aria-hidden="true">
<div class="icon">
<svg class="bee on" viewBox="0 0 48 48"><path d="M20 14C18.5 9 16 7.5 13.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28 14C29.5 9 32 7.5 34.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.8" cy="6.4" r="2.4" fill="#1C1710"/><circle cx="35.2" cy="6.4" r="2.4" fill="#1C1710"/><ellipse cx="9.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(-24 9.5 20)"/><ellipse cx="38.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(24 38.5 20)"/><rect x="13" y="13" width="22" height="29" rx="11" fill="#FFC62E" stroke="#1C1710" stroke-width="2"/><rect x="13" y="27.5" width="22" height="4.6" fill="#1C1710"/><rect x="13" y="36" width="22" height="4.6" fill="#1C1710"/><circle cx="19.6" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="28.4" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="20.4" cy="20.7" r=".8" fill="#fff"/><circle cx="29.2" cy="20.7" r=".8" fill="#fff"/><circle cx="16.8" cy="24.6" r="1.5" fill="#F4A7A3"/><circle cx="31.2" cy="24.6" r="1.5" fill="#F4A7A3"/><path d="M21.5 25.8Q24 27.6 26.5 25.8" stroke="#1C1710" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
<svg class="hopper" viewBox="0 0 48 48"><path d="M20 12C18 7.5 15.5 6 13 5.5" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28 12C30 7.5 32.5 6 35 5.5" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.4" cy="5" r="2.2" fill="#1C1710"/><circle cx="35.6" cy="5" r="2.2" fill="#1C1710"/><path d="M12 22L6 15" stroke="#1C1710" stroke-width="3" stroke-linecap="round"/><path d="M36 22L42 15" stroke="#1C1710" stroke-width="3" stroke-linecap="round"/><path d="M10 20 14 26" stroke="#7CB342" stroke-width="4" stroke-linecap="round"/><path d="M38 20 34 26" stroke="#7CB342" stroke-width="4" stroke-linecap="round"/><path d="M12 32L7 40M36 32L41 40" stroke="#1C1710" stroke-width="3" stroke-linecap="round"/><rect x="13" y="12" width="22" height="30" rx="11" fill="#9CCC65" stroke="#1C1710" stroke-width="2"/><rect x="13" y="28" width="22" height="4" fill="#7CB342"/><rect x="13" y="35" width="22" height="4" fill="#7CB342"/><circle cx="19.6" cy="20.5" r="2.3" fill="#1C1710"/><circle cx="28.4" cy="20.5" r="2.3" fill="#1C1710"/><circle cx="20.4" cy="19.7" r=".8" fill="#fff"/><circle cx="29.2" cy="19.7" r=".8" fill="#fff"/><circle cx="16.8" cy="23.6" r="1.5" fill="#F4A7A3"/><circle cx="31.2" cy="23.6" r="1.5" fill="#F4A7A3"/><path d="M21.5 24.8Q24 26.6 26.5 24.8" stroke="#1C1710" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
</div>
<span class="name">アポバッタくん</span>
</div>
<script>
// 蜂とバッタを10秒ごとに交互に変身させる（送信の進捗とは無関係の演出）。
// バッタのときだけ緑の背景と「アポバッタくん」の名前を表示する。
(()=>{const box=document.getElementById("fo-chara");if(!box)return;
const bee=box.querySelector(".bee"),hop=box.querySelector(".hopper");
const t=setInterval(()=>{box.classList.remove("morph");void box.offsetWidth;box.classList.add("morph");
setTimeout(()=>{const toHopper=!hop.classList.contains("on");bee.classList.toggle("on");hop.classList.toggle("on");box.classList.toggle("hopper-mode",toHopper);},240);},10000);
addEventListener("pagehide",()=>clearInterval(t),{once:true});})();
</script>
</body></html>`;
}

export function statusTag(s: JobStatus) {
  const cls = s === "sent" ? "sent" : s === "failed" ? "failed" : s === "queued" ? "queued" : s === "sending" ? "sending" : "skip";
  return `<span class="tag ${cls}">${STATUS_LABEL[s] ?? s}</span>`;
}

/** 失敗理由を「何のエラーか」ひと目で分かる種類に分類する */
export function errKind(j: Pick<Job, "status" | "result_text">): string {
  if (j.status === "skip_captcha") return "CAPTCHA検出（要手動対応）";
  if (j.status !== "failed") return "";
  const t = j.result_text || "";
  if (/^要確認/.test(t)) return "要確認（AIが回答を決められない項目）";
  if (/入力エラー|未入力|入力してください|必須項目/.test(t)) return "必須項目未入力";
  if (/送信ボタンが見つからない/.test(t)) return "送信ボタン未検出";
  if (/timeout|タイムアウト/i.test(t)) return "タイムアウト";
  if (/net::|ECONN|ERR_|getaddrinfo|dns/i.test(t)) return "ネットワークエラー";
  if (/本文欄への入力に失敗|本文（textarea）/.test(t)) return "本文欄に入力できず";
  if (/エラー文言/.test(t)) return "サイト側のエラー表示";
  return "その他";
}
function errKindTag(j: Pick<Job, "status" | "result_text">): string {
  const k = errKind(j);
  return k ? `<span class="errkind">${esc(k)}</span>` : "";
}

/** 一覧の状態セル。リトライで送信済みになった会社は、過去の失敗をグレーアウトし ↓ で「N回目で送信済み」を見せる */
function statusCell(j: Job): string {
  if (j.status === "sent" && j.prev_status && j.attempts > 1) {
    return `<span class="tag" style="background:#eee;color:#999;text-decoration:line-through">${STATUS_LABEL[j.prev_status as JobStatus] ?? j.prev_status}</span>`
      + `<div class="small" style="color:var(--hive-600);margin:2px 0">↓</div>`
      + `${statusTag(j.status)}<div class="small muted">${j.attempts}回目の送信で送信済み</div>`;
  }
  return statusTag(j.status);
}

export function campaignListView(rows: (Campaign & { sender_label: string; total: number; sent: number; queued: number; reactions: number; last_sent: string | null })[], provider: string) {
  // 最終送信からの経過を「今日／昨日／N日前」で表す（放置ぎみのキャンペーンに気づける）。消しても一覧は成立する
  const sinceLabel = (ts: string | null): string => {
    if (!ts) return "";
    const t = Date.parse(String(ts).replace(" ", "T") + "Z"); // DBは世界標準時
    if (Number.isNaN(t)) return "";
    // カレンダー日（時刻を切り捨て）で比べる。夕方に送って翌朝見ても「昨日」と出るように
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(new Date()) - startOf(new Date(t))) / 86400000);
    if (days <= 0) return "今日";
    if (days === 1) return "昨日";
    return `${days}日前`;
  };
  return `<h1>キャンペーン</h1>
<p class="muted"><b>キャンペーン</b>＝「この文面で、この会社たちに、この送り方で送る」という送信のまとまり1件です。商材ごと・ターゲットごとに分けて作ると、反応率を比べられます。</p>
<p class="muted">AIプロバイダ: <b>${esc(provider)}</b>${provider === "none" ? "（APIキー未設定。テンプレートのみで動きます）" : ""}</p>
<p><a class="btn" href="/campaigns/new">＋ 新しいキャンペーン</a></p>
${(() => {
    // 全キャンペーン横断のサマリー。rows から集計するだけなので、この即時関数を消せば丸ごと外せる
    if (rows.length === 0) return "";
    const totSent = rows.reduce((a, c) => a + c.sent, 0);
    const totReact = rows.reduce((a, c) => a + c.reactions, 0);
    const totQueued = rows.reduce((a, c) => a + c.queued, 0);
    const inProgress = rows.filter((c) => c.queued > 0).length;
    const rate = totSent ? ((totReact / totSent) * 100).toFixed(1) : "0.0";
    return `<div class="stats"><div class="stat">キャンペーン<b>${rows.length}<span style="font-size:12px;font-weight:400">件</span></b>${inProgress ? `<span class="muted small">未送信あり ${inProgress}</span>` : ""}</div><div class="stat">送信済<b style="color:var(--ok)">${totSent}<span style="font-size:12px;font-weight:400">社</span></b></div><div class="stat">待機<b>${totQueued}<span style="font-size:12px;font-weight:400">社</span></b></div><div class="stat">反応<b>${totReact}</b><span class="muted small">全体 ${rate}%</span></div></div>`;
  })()}
${rows.length === 0 ? `<div class="card" style="background:var(--honey-50)"><h2 style="margin-top:0">はじめての方へ（3ステップ）</h2>
<ol style="margin:0;padding-left:1.2em;line-height:1.9">
<li><b>送信者</b>を登録（会社名・担当者・メール・電話）→ <a href="/senders">送信者ページ</a></li>
<li><b>新しいキャンペーン</b>を作成（送り方・文面を設定）→ <a href="/campaigns/new">作成する</a></li>
<li>会社リスト（CSV / Excel / スプレッドシート）を<b>取り込み</b>、テスト送信で確認してから開始</li>
</ol>
<p class="muted small">まずは送信者の登録からどうぞ。迷ったら各画面の説明書きを読めば進められます。</p></div>` : `
<table><tr><th>ID</th><th>名前</th><th>送信者</th><th>モード</th><th>状態</th><th>件数</th><th>送信済</th><th>待機</th><th>反応率</th><th>最終送信</th><th></th></tr>
${rows.map((c) => `<tr><td>${c.id}</td><td><a href="/campaigns/${c.id}">${esc(c.name)}</a>${c.group_name ? `<br><span class="tag">グループ: ${esc(c.group_name)}</span>` : ""}</td><td>${esc(c.sender_label)}</td><td>${c.mode}</td><td>${c.status}</td><td>${c.total}</td><td>${c.sent}</td><td>${c.queued}</td><td class="small">${c.sent ? `${((c.reactions / c.sent) * 100).toFixed(1)}%<br><span class="muted">${c.reactions}/${c.sent}</span>` : "-"}</td><td class="small muted">${c.last_sent ? `${esc(jst(c.last_sent))}<br><span style="opacity:.8">${sinceLabel(c.last_sent)}</span>` : "-"}</td><td><a class="btn sub small" href="/campaigns/${c.id}">開く</a> <a class="btn sub small" href="/campaigns/${c.id}/edit">編集</a> <form method="post" action="/campaigns/${c.id}/duplicate" class="inline"><button class="btn sub small">複製</button></form> <form method="post" action="/campaigns/${c.id}/delete" class="inline" data-n="${esc(c.name)}" onsubmit="return confirm('キャンペーン「' + this.dataset.n + '」を削除します。\\n取り込んだ会社 ${c.total} 件・送信済み ${c.sent} 件の記録もすべて消え、元に戻せません。${c.sent ? "\\n送信済みの会社への再送防止も効かなくなります。" : ""}\\nよろしいですか？')"><button class="btn sub small" style="color:var(--ng)">削除</button></form></td></tr>`).join("")}
</table>`}`;
}

export function senderForm(s?: Partial<SenderProfile>) {
  const v = (k: keyof SenderProfile) => esc(s?.[k] ?? "");
  return `<form method="post" action="/senders${s?.id ? `/${s.id}` : ""}">
<div class="row"><div><label>ラベル（管理用）</label><input type="text" name="label" value="${v("label")}" placeholder="社内用 / ○○社用" required></div><div><label>会社名 *</label><input type="text" name="company" value="${v("company")}" required></div></div>
<div class="row"><div><label>業種</label><input type="text" name="industry" value="${v("industry")}"></div><div><label>担当者名 *（姓と名の間にスペース）</label><input type="text" name="person" value="${v("person")}" placeholder="田中 太郎" required></div></div>
<div class="row"><div><label>担当者名フリガナ</label><input type="text" name="person_kana" value="${v("person_kana")}" placeholder="タナカ タロウ"></div><div><label>メール *（フォームに入力するアドレス）</label><input type="email" name="email" value="${v("email")}" required></div></div>
<div class="row"><div><label>返信受付メール（本文に載せる。空なら上と同じ）</label><input type="email" name="reply_email" value="${v("reply_email")}"></div><div><label>電話（ハイフン区切り）</label><input type="text" name="tel" value="${v("tel")}" placeholder="03-1234-5678"><p class="muted" style="color:var(--ng)">⚠ フォームでは電話番号が必須になっていることが多く、未入力のままだとかなりの確率で送信エラーになります。必ず入力してください。</p>
<label class="inline small" style="display:flex;gap:6px;align-items:flex-start;margin-top:6px;font-weight:400"><input type="checkbox" name="tel_required_only" value="1" ${s?.tel_required_only ? "checked" : ""} style="width:auto;margin-top:3px"> <span><b>電話番号が必須の欄にだけ入力する</b>（任意の欄には書かない）<br><span class="muted">電話番号を相手に伝えたくない場合に。サイト側で必須だった場合は、弾かれた後の埋め直しで入力して再送します。</span></span></label></div></div>
<div class="row3"><div><label>郵便番号</label><input type="text" name="postal" value="${v("postal")}" placeholder="114-0001"></div><div><label>住所（都道府県から）</label><input type="text" name="address" value="${v("address")}"></div><div><label>自社URL</label><input type="url" name="url" value="${v("url")}"></div></div>
<h2>メールで送る場合の設定（任意。フォームだけなら不要）</h2>
<p class="muted">Googleアカウントで2段階認証をオンにし「アプリパスワード」を発行して貼り付けてください。営業専用のアドレスを使うのが安全です（無料Gmailは1日500通、Workspaceは2,000通まで）。</p>
<div class="row3"><div><label>送信用メールアドレス（Gmail等）</label><input type="text" name="smtp_user" value="${v("smtp_user")}" placeholder="sales@example.co.jp"></div><div><label>アプリパスワード（保存済みなら空のまま）</label><input type="password" name="smtp_pass" value="" placeholder="xxxx xxxx xxxx xxxx" autocomplete="off"></div><div><label>差出人として表示するアドレス（空なら左と同じ）</label><input type="text" name="from_email" value="${v("from_email")}"></div></div>
<details class="small muted"><summary>Gmail以外のメールサーバー</summary><div class="row"><div><label>SMTPホスト</label><input type="text" name="smtp_host" value="${esc(s?.smtp_host ?? "smtp.gmail.com")}" placeholder="smtp.gmail.com"></div><div><label>ポート（465 or 587）</label><input type="number" name="smtp_port" value="${esc(s?.smtp_port ?? 465)}" placeholder="465"></div></div>
<p class="muted small" style="margin:6px 0 0"><b>SMTPホストとは：</b>メールを送り出すサーバーのアドレスです。プロバイダごとに決まっています。<br>
例）Gmail・Google Workspace＝<code>smtp.gmail.com</code>／Outlook・Microsoft365＝<code>smtp.office365.com</code>／Yahoo!メール＝<code>smtp.mail.yahoo.co.jp</code>／iCloud＝<code>smtp.mail.me.com</code><br>
<b>確認方法：</b>お使いのメールの設定画面で「送信サーバー（SMTP）」の欄を見るか、「（プロバイダ名） SMTP 設定」で検索してください。分からなければ、送信専用に無料のGmailを1つ作るのが一番かんたんです（その場合はこの欄は変更不要）。</p></details>
<p><button class="btn">保存</button>${s?.id ? ` <button class="btn sub" formaction="/senders/${s.id}/test" formmethod="post">メール設定を確認</button>` : ""}</p></form>`;
}

export function sendersView(list: SenderProfile[], usage: Record<number, number> = {}) {
  return `<h1>送信者プロフィール</h1><p class="muted">フォームに入力される「差出人」です。クライアントの送信はクライアント自身の名義で行います。</p>
<table><tr><th>ID</th><th>ラベル</th><th>会社</th><th>担当者</th><th>メール</th><th>メール送信</th><th>利用中</th><th></th></tr>
${list.map((s) => `<tr><td>${s.id}</td><td>${esc(s.label)}</td><td>${esc(s.company)}</td><td>${esc(s.person)}</td><td>${esc(s.email)}</td><td class="small">${s.smtp_user && s.smtp_pass ? `Gmail等（${esc(s.smtp_user)}）` : "未設定（フォームのみ）"}</td><td class="small">${usage[s.id] ? `${usage[s.id]} キャンペーン` : '<span class="muted">未使用</span>'}</td><td><a class="btn sub small" href="/senders/${s.id}">編集</a></td></tr>`).join("")}
</table><h2>新規追加</h2><div class="card">${senderForm()}</div>`;
}

export function campaignForm(senders: SenderProfile[], defaults: Partial<Campaign>, provider: string, editId?: number, groups: string[] = [], others: { id: number; name: string; group_name: string }[] = []) {
  const d = (k: keyof Campaign, fb: unknown = "") => esc(defaults[k] ?? fb);
  return `<h1>${editId ? `キャンペーンを編集: ${d("name")}` : "新しいキャンペーン"}</h1>
${editId ? `<p><a href="/campaigns/${editId}">← キャンペーンに戻る</a></p><p class="muted">配信チャネルの変更は、<b>これから取り込む会社</b>に適用されます（取り込み済みの会社の振り分けは変わりません）。</p>` : ""}
<form method="post" action="${editId ? `/campaigns/${editId}/edit` : "/campaigns"}" class="card" enctype="multipart/form-data">
<label>グループ（任意）</label><input type="text" name="group_name" value="${d("group_name")}" list="fo-groups" placeholder="例：福岡 飲食 9月（空欄なら自動で決めます）" style="max-width:420px"><datalist id="fo-groups">${groups.map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
<p class="muted small" style="margin:4px 0 6px">同じグループのキャンペーン同士では、<b>同じ会社に重ねて送りません</b>（フォーム用とメール用に分けたときなど）。別のキャンペーンで<b>待機中・送信済み</b>の会社は取り込み時に除外し、送信直前にも確認します。<b>フォーム無し・失敗・CAPTCHA</b>だった会社は連絡できていないので、同じグループの別キャンペーンで送れます。</p>
${(() => {
    const list = others.filter((o) => o.id !== editId);
    if (!list.length) return "";
    const mine = String(defaults.group_name ?? "");
    return `<details ${mine ? "open" : ""} style="margin:0 0 12px"><summary style="cursor:pointer;font-weight:700">同じグループに入れるキャンペーンを選ぶ（昔のキャンペーンも選べます）</summary>
<div style="max-height:220px;overflow:auto;border:1px solid var(--line,#e5e0d5);border-radius:8px;padding:8px 10px;margin-top:6px">${list.map((o) => `<label class="inline small" style="display:flex;gap:6px;align-items:center;font-weight:400;margin:3px 0"><input type="checkbox" name="group_members" value="${o.id}" ${mine && o.group_name === mine ? "checked" : ""} style="width:auto"> ${esc(o.name)}${o.group_name ? ` <span class="tag">グループ: ${esc(o.group_name)}</span>` : ` <span class="muted">（グループなし）</span>`}</label>`).join("")}</div>
<p class="muted small" style="margin:4px 0 0">チェックしたキャンペーンをこのキャンペーンと同じグループにします。チェックを外したキャンペーンはこのグループから外れます。グループ名が空欄なら、チェックした中のグループ名、無ければこのキャンペーンの名前をグループ名にします。</p></details>`;
  })()}
<div class="row"><div><label>キャンペーン名</label><input type="text" name="name" value="${d("name")}" required placeholder="福岡 飲食 9月"></div>
<div><label>送信者</label><select name="sender_id" required>${senders.map((s) => `<option value="${s.id}" ${defaults.sender_id === s.id ? "selected" : ""}>${esc(s.label)}（${esc(s.company)} ${esc(s.person)}）</option>`).join("")}</select>${senders.length ? "" : '<p class="muted">先に<a href="/senders">送信者</a>を登録してください</p>'}</div></div>
<label>配信チャネル</label>
<select name="channel">
<option value="form_first" ${channelMode(String(defaults.channel ?? "")) === "form_first" ? "selected" : ""}>フォーム優先（フォームが無ければメール）— おすすめ</option>
<option value="email_first" ${channelMode(String(defaults.channel ?? "")) === "email_first" ? "selected" : ""}>メール優先（メールが無ければフォーム）</option>
<option value="email_only" ${channelMode(String(defaults.channel ?? "")) === "email_only" ? "selected" : ""}>メールのみ（メールがある会社だけ）</option>
<option value="form_only" ${channelMode(String(defaults.channel ?? "")) === "form_only" ? "selected" : ""}>フォームのみ（フォームがある会社だけ）</option>
</select>
<label>文面モード</label>
<select name="mode">
<option value="ai" ${provider === "none" && defaults.mode !== "ai" ? "disabled" : ""} ${defaults.mode === "ai" || (provider !== "none" && !defaults.mode) ? "selected" : ""}>全文AI生成 — 成功率は最高。想定外の質問欄にもAIが回答${provider === "none" ? "（AI設定が必要）" : ""}</option>
<option value="tpl_ai" ${provider === "none" && defaults.mode !== "tpl_ai" ? "disabled" : ""} ${defaults.mode === "tpl_ai" ? "selected" : ""}>テンプレ＋質問だけAI — おすすめ。文面はテンプレ(0円)、想定外の質問欄だけAIが回答。安くて成功率が高い${provider === "none" ? "（AI設定が必要）" : ""}</option>
<option value="hybrid" ${provider === "none" && defaults.mode !== "hybrid" ? "disabled" : ""} ${defaults.mode === "hybrid" ? "selected" : ""}>ハイブリッド — 冒頭だけAI生成で安いが、想定外の質問欄には対応できない${provider === "none" ? "（AI設定が必要）" : ""}</option>
<option value="template" ${defaults.mode === "template" || (provider === "none" && defaults.mode !== "ai" && defaults.mode !== "hybrid") ? "selected" : ""}>テンプレートのみ（差し込みだけ・AI不使用・0円）</option>
</select>
<p class="muted small">
<b>全文AI生成:</b> 企業ごとに全文を書き、「ご予算」「何で知りましたか」など想定外の質問欄にもAIが回答するため、送信が成功しやすくなります。料金は1件あたり約0.5〜0.8円（Haiku）。月1,000件で約400〜800円。<br>
<b>テンプレ＋質問だけAI（おすすめ）:</b> 文面はテンプレ（0円）のまま、想定外の質問欄が出たときだけAIが回答します。全文生成をしないぶん<b>全文AIの1/5〜1/10の費用</b>で、成功率はテンプレのみより大きく上がります（AIを呼ぶのは想定外の質問が出た一部の会社だけ）。<br>
<b>ハイブリッド:</b> 冒頭1〜2文だけAIが書くので安い（約0.2円/件）ぶん、想定外の質問欄には対応できず、そのフォームは失敗になりやすくなります。<br>
※ チェック欄・選択肢はどのモードでも自動対応します。CAPTCHAはどのモードでも突破しません。</p>
${provider === "none" ? '<p class="muted">⚠ AIを使うモードは、先に<a href="/settings"><b>設定画面でAPIキーの登録</b></a>が必要です（管理者のみ）。料金の目安や取得手順も設定画面に書いてあります。未設定のままではテンプレートのみで送られます。</p>' : ""}
<label>件名（件名欄があるフォーム用）</label><input type="text" name="subject_text" value="${d("subject_text", "ショート動画制作サービスのご案内")}">
<label>本文テンプレート</label>
<p class="muted">使える差し込み: {{会社名}} {{代表者}}（無ければ「ご担当者様」） {{業種}} {{都道府県}} {{自社名}} {{担当者}} {{自社メール}} {{自社電話}} {{自社URL}} {{AI冒頭}} {{資料リンク}}</p>
<div style="margin-bottom:6px"><label class="inline small">例文を挿入:
<select id="tplpreset" style="width:auto;padding:4px 8px"><option value="">選ぶと本文欄に入ります…</option><option value="standard">標準（サービス案内）</option><option value="hybrid">ハイブリッド用（冒頭AI＋本文）</option><option value="short">短め（要点だけ）</option></select></label>
<span class="muted small">※ 今の本文がある場合は置き換わります</span></div>
<textarea name="template_text" id="tpltext" style="min-height:320px">${d("template_text")}</textarea>
<script>
(() => {
  const T = {
    standard: "{{会社名}}\\n{{代表者}}\\n\\nはじめてご連絡いたします。{{自社名}}の{{担当者}}と申します。\\n{{業種}}に役立つサービスをご案内できればと存じ、ご連絡しました。\\n\\n（ここに、提供内容・相手にとってのメリットを1〜2行で具体的に）\\n\\nご興味があれば、下記までご返信ください。資料の送付や簡単なご説明も可能です。\\n\\n{{自社名}} {{担当者}}\\nメール: {{自社メール}}\\n電話: {{自社電話}}\\n{{自社URL}}\\n\\n※ ご不要の場合は、お手数ですが本メールにご返信ください。以後のご連絡は控えます。",
    hybrid: "{{会社名}}\\n{{代表者}}\\n\\n{{AI冒頭}}\\n\\n{{自社名}}の{{担当者}}と申します。（ここに、提供内容・相手にとってのメリットを1〜2行で）\\n\\nご興味があればご返信ください。\\n\\n{{自社名}} {{担当者}}\\nメール: {{自社メール}} / 電話: {{自社電話}}\\n{{自社URL}}\\n\\n※ ご不要の場合はご返信ください。以後の連絡は控えます。",
    short: "{{会社名}} {{代表者}}\\n\\n{{自社名}}の{{担当者}}と申します。{{業種}}向けの（サービス名）についてご案内です。\\n（要点を1行）\\n\\nご興味があればご返信ください。{{自社メール}} / {{自社電話}}\\n※不要な場合はご返信ください。",
  };
  const sel = document.getElementById("tplpreset"), ta = document.getElementById("tpltext");
  if (sel && ta) sel.addEventListener("change", () => { const v = T[sel.value]; if (v && (!ta.value.trim() || confirm("本文を例文で置き換えますか？（今の内容は消えます）"))) ta.value = v; sel.value = ""; });
})();
</script>
<label>AIへの追加指示（任意）</label><input type="text" name="ai_instruction" value="${d("ai_instruction")}" placeholder="例: 採用課題に寄せる／飲食店向けに集客の話をする">
<div class="row3"><div><label>1日の上限（フォーム／メール）</label><div class="row"><input type="number" name="daily_limit" value="${d("daily_limit", 300)}"><input type="number" name="email_daily_limit" value="${d("email_daily_limit", 100)}"></div></div><div><label>送信時間帯（開始・終了 時）</label><div class="row"><input type="number" name="send_window_start" value="${d("send_window_start", 9)}" min="0" max="23"><input type="number" name="send_window_end" value="${d("send_window_end", 18)}" min="1" max="24"></div></div><div><label>平日のみ</label><select name="weekdays_only"><option value="1" ${Number(defaults.weekdays_only ?? 1) ? "selected" : ""}>はい</option><option value="0" ${defaults.weekdays_only !== undefined && !Number(defaults.weekdays_only) ? "selected" : ""}>土日も送る</option></select></div></div>
<div class="row3"><div><label>同じ会社への再送を止める期間（日・0で制限なし）</label><input type="number" name="resend_days" value="${d("resend_days", 90)}" min="0"></div><div><label>「営業お断り」のサイト</label><select name="ignore_refusal"><option value="0" ${Number(defaults.ignore_refusal ?? 0) ? "" : "selected"}>送らない（推奨）</option><option value="1" ${Number(defaults.ignore_refusal ?? 0) ? "selected" : ""}>送る（クレームの恐れあり）</option></select></div><div></div></div>
<h2>資料の添付（任意）</h2>
<p class="muted">メール送信では下のファイルを添付します。フォーム送信ではファイルを添付できないため、代わりに「資料の公開リンク」を本文末尾に自動で載せます（本文に {{資料リンク}} を書けばその位置に入ります）。</p>
<div class="row"><div><label>資料ファイル（メール添付用・PDF等）</label><input type="file" name="material_file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg">${defaults.attach_name ? `<p class="muted small">現在の添付: <b>${d("attach_name")}</b>（新しいファイルを選ぶと置き換わります）</p>` : ""}</div><div><label>資料の公開リンク（フォーム本文用・URL）</label><input type="url" name="material_url" value="${d("material_url")}" placeholder="https://（Googleドライブ等の共有リンク）"><p class="muted small">このアプリは各自のPCで動くため、アップロードしたファイルに外部から見えるURLは付けられません。フォーム用にはドライブ等で共有した公開リンクを貼ってください。</p></div></div>
<p><button class="btn">${editId ? "保存する" : "作成する"}</button></p></form>
${editId ? `<div class="card" style="border-color:var(--ng);margin-top:18px"><h2 style="margin-top:0;color:var(--ng)">キャンペーンを削除</h2>
<p class="muted small">このキャンペーンと、取り込んだ会社・送信履歴・スクリーンショット・添付資料をすべて削除します。<b>元に戻せません。</b><br>送信済みの記録も消えるため、その会社への「再送を止める期間」のチェックが効かなくなります。除外リスト（営業お断り等）は全キャンペーン共通なので残ります。</p>
<form method="post" action="/campaigns/${editId}/delete" data-n="${d("name")}" onsubmit="return confirm('キャンペーン「' + this.dataset.n + '」を削除します。取り込んだ会社・送信履歴もすべて消え、元に戻せません。よろしいですか？')"><button class="btn danger">このキャンペーンを削除する</button></form></div>` : ""}`;
}

/** CSV取込の結果。何件入ったかだけでなく、除外された会社名まで出す */
function importReport(r: import("./csv.js").ImportSummary): string {
  const skipped = r.excludedRows;
  return `<div class="flash" style="margin-top:12px">登録 <b>${r.added}</b>件（フォーム${r.addedForm}・メール${r.addedEmail}） / 送らない <b>${r.excluded + r.suppressed + r.duplicated + r.noUrl}</b>件${r.noEntity && r.noEntity.length ? `<br><span style="color:var(--warn)">⚠ 法人格（株式会社など）が無い社名 ${r.noEntity.length}社。事前チェックでHPから自動補完します。</span>` : ""}</div>
${skipped.length ? `<details open style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">送らない会社 ${skipped.length}件の内訳</summary>
<table style="margin-top:6px"><tr><th>会社名</th><th>理由</th><th>送信先</th></tr>
${skipped.map((x) => `<tr><td>${esc(x.company)}</td><td class="small">${esc(x.reason)}</td><td class="small">${esc((x.where || "").slice(0, 60))}</td></tr>`).join("")}
</table></details>` : ""}`;
}

export function campaignView(c: Campaign & { sender: SenderProfile }, jobs: Job[], counts: Record<string, number>, running: boolean, provider: string, extra: { preview?: { job: Job; subject: string; message: string; aiUsed: boolean; lint?: Lint[] } | null; windowOk: boolean; sentToday: number; emailSentToday: number; scanning: boolean; unscanned: number; scanned: number; statusFilter?: string; qFilter?: string; outcomeFilter?: string; impFilter?: string; matched?: { n: number; sent: number }; attempts?: Record<string, number>; outcomes: Record<string, number>; lastImport?: import("./csv.js").ImportSummary | null; retryTargets?: { id: number; company_name: string; status: string; result_text: string }[]; emailQueued?: number; imports?: { key: string; label: string; at: string; total: number; sent: number; queued: number }[]; replyScan?: { enabled: boolean; checkedAt: string | null; error: string; checking: boolean } }) {
  // 「反応」欄の下に出す、返信の自動確認の状態（送信用メールの受信箱を15分ごとに読んで反応を自動記録している）
  const replyScanLine = () => {
    const r = extra.replyScan;
    if (!r) return "";
    if (!r.enabled) return `<p class="muted small" style="margin:4px 0 0">反応（返信／アポ／断り）は、送信者プロフィールに送信用メールアカウント（アプリパスワード）を設定すると、受信箱から自動で記録されます。今は会社の詳細画面のボタンで手動記録です。</p>`;
    const when = r.checkedAt ? new Date(r.checkedAt.replace(" ", "T") + "Z").toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだ";
    return `<form method="post" action="/replies/check" style="margin:4px 0 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="hidden" name="back" value="/campaigns/${c.id}"><span class="muted small">✉ 反応は受信箱の返信から自動で記録（15分ごと・キーワードで振り分け。最終確認: ${esc(when)}）。違っていたら会社の詳細画面で直せます</span><button class="btn sub small" ${r.checking ? "disabled" : ""}>${r.checking ? "確認中…" : "今すぐ返信を確認"}</button></form>${r.error ? `<p class="small" style="margin:4px 0 0;color:var(--ng)">${esc(r.error)}</p>` : ""}`;
  };
  const cnt = (s: string) => counts[s] ?? 0;
  const nRetry = extra.retryTargets?.length ?? 0; // 「失敗した会社を再送信」の対象数（会社単位・最新の結果が失敗のものだけ）
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // 進捗バー用: 事前チェックは「チェック済み/対象」、本送信は「処理済み/全件」
  const scanTotal = extra.scanned + extra.unscanned;
  const scanPct = scanTotal ? Math.round((extra.scanned / scanTotal) * 100) : 0;
  const processed = total - cnt("queued");
  const sendPct = total ? Math.round((processed / total) * 100) : 0;
  return `<h1>${esc(c.name)} <span class="tag">${c.status}</span> ${running ? '<span class="tag sending">実行中</span>' : ""} <a class="btn sub small" href="/campaigns/${c.id}/edit" style="vertical-align:middle">✏️ 編集</a></h1>
<p class="muted">${c.group_name ? `グループ: <b>${esc(c.group_name)}</b>（同じグループの別キャンペーンと送り先が重ならないようにしています） / ` : ""}送信者: ${esc(c.sender.company)} ${esc(c.sender.person)} / チャネル: ${CHANNEL_LABEL[channelMode(c.channel)]} / モード: ${({ template: "テンプレのみ", ai: "全文AI", hybrid: "ハイブリッド", tpl_ai: "テンプレ＋質問AI" } as Record<string, string>)[c.mode] ?? c.mode} / AI: ${esc(provider)} / 時間帯 ${c.send_window_start}〜${c.send_window_end}時${c.weekdays_only ? "（平日）" : ""} / 上限 フォーム${c.daily_limit}・メール${c.email_daily_limit}/日（本日 ${extra.sentToday}・${extra.emailSentToday}） ${extra.windowOk ? "" : "<b style='color:var(--warn)'>いまは送信時間帯外</b>"}</p>
${(() => {
    const att = extra.attempts ?? {};
    // 「確定件数（会社の重複を除いた実数）」を大きく、試行回数が上回るときだけ「試行 N回」を併記する
    // 件数は会社（ドメイン）単位の重複を除いた実数＝「社」、送信の試行は「回」で併記する
    const tile = (label: string, keys: string[], color = "") => {
      const n = keys.reduce((a, k) => a + cnt(k), 0);
      const a = keys.reduce((s, k) => s + (att[k] ?? 0), 0);
      const sub = a > n ? `<span class="muted small">試行 ${a}回</span>` : "";
      return `<div class="stat">${label}<b${color ? ` style="color:${color}"` : ""}>${n}<span style="font-size:12px;font-weight:400">社</span></b>${sub}</div>`;
    };
    return `<div class="stats"><div class="stat">全件<b>${total}<span style="font-size:12px;font-weight:400">社</span></b><span class="muted small">重複除く</span></div>${tile("待機", ["queued"])}${tile("送信済", ["sent"], "var(--ok)")}${tile("失敗", ["failed"], "var(--ng)")}${tile("フォーム無し", ["skip_no_form"])}${tile("お断り", ["skip_refused"])}${tile("CAPTCHA", ["skip_captcha"])}${tile("除外/重複", ["skip_suppressed", "skip_duplicate", "skip_optout"])}<div class="stat">反応<b class="small">返信${extra.outcomes.replied ?? 0}／アポ${extra.outcomes.appointment ?? 0}／断り${extra.outcomes.declined ?? 0}</b>${cnt("sent") ? `<span class="muted">反応率 ${((((extra.outcomes.replied ?? 0) + (extra.outcomes.appointment ?? 0)) / cnt("sent")) * 100).toFixed(1)}%</span>` : ""}</div></div>${replyScanLine()}`;
  })()}

<div class="card testcard"><h2 style="margin-top:0">🧪 テスト送信（本送信とは別）</h2>
<p class="muted">自社のフォームや自分のメール宛てに動作を試すための機能です。営業リストには送られず、下の送信フローとも無関係です。送信前に一度だけ確認しておくと安心です。</p>
<a class="btn" href="/campaigns/${c.id}/test">テスト送信ページを開く</a></div>

<div class="card"><h2 style="margin-top:0">1. リストを取り込む</h2>
<p class="muted"><b>最低限、企業名と企業URL（HP）の2列があれば取り込めます。</b>問い合わせフォームは、HPから自動で探して送信します（AIは不要）。<br>使える見出し: 企業名 / 企業URL / 問い合わせフォーム / メール / 大業界 / 小業界 / 都道府県 / 代表者名（順不同・必要な列だけでOK）。問い合わせフォームのURLも入れておくと成功率が上がります。同一ドメイン・再送禁止期間内・除外リスト・官公庁等は自動で振り分けます。</p>
<form method="post" action="/campaigns/${c.id}/import" enctype="multipart/form-data">
<label>① ファイルから（CSV / Excel .xlsx）</label>
<input type="file" name="csv" accept=".csv,.xlsx,text/csv">
<label>② スプレッドシート・Excelからコピーして貼り付け（1行目は見出し）</label>
<textarea name="pasted" style="min-height:90px" placeholder="企業名（タブ区切り）問い合わせフォーム 企業URL メール …"></textarea>
<label>③ または Google スプレッドシートのURL</label>
<input type="url" name="sheet_url" placeholder="https://docs.google.com/spreadsheets/d/…">
<p class="muted small">URLで取り込むには、スプレッドシートの共有を「リンクを知っている全員（閲覧可）」にしてください。</p>
<p><button class="btn">取り込む</button></p></form>
${extra.lastImport ? importReport(extra.lastImport) : ""}
${(() => {
    // 取り込み履歴。間違えて取り込んだ分を、取り込み1回ぶん丸ごと消せる（一覧は200件までなので、選択削除では消しきれない）
    const list = extra.imports ?? [];
    if (!list.length) return "";
    const busy = running || extra.scanning;
    const allTotal = list.reduce((a, b) => a + b.total, 0);
    const allSent = list.reduce((a, b) => a + b.sent, 0);
    const warnSent = (n: number) => (n ? `\\n\\n※ うち送信済み ${n}件の記録も消えます。消すとその会社への「${c.resend_days}日以内の再送防止」が効かなくなります。` : "");
    const when = (at: string) => { const d = new Date(String(at).replace(" ", "T") + "Z"); return isNaN(d.getTime()) ? esc(at) : d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
    return `<p style="margin:14px 0 0"><a class="btn sub small" href="/campaigns/${c.id}?imp=${encodeURIComponent(list[0].key)}#list">前回の取り込み（${when(list[0].at)}・${list[0].total}件）を一覧で見る・まとめて削除</a></p>
<details style="margin-top:10px" ${list.length ? "open" : ""}><summary style="cursor:pointer;font-weight:700">取り込み履歴（${list.length}回・${allTotal}件）</summary>
<p class="muted small" style="margin:6px 0">間違えて取り込んだ場合は、その回の「全件削除」で、その取り込みで入った会社をまとめて消せます（送信一覧・全件の数からも消えます）。${busy ? "<b>送信中・事前チェック中は削除できません。先に止めてください。</b>" : ""}</p>
<div style="overflow-x:auto"><table><tr><th>取り込んだ日時</th><th>取り込み元</th><th>件数</th><th>送信済</th><th>待機</th><th></th></tr>
${list.map((b) => `<tr><td class="small">${when(b.at)}</td><td class="small">${esc(b.label)}</td><td>${b.total}</td><td>${b.sent}</td><td>${b.queued}</td><td><a class="btn sub small" href="/campaigns/${c.id}?imp=${encodeURIComponent(b.key)}#list">一覧を見る</a> <form method="post" action="/campaigns/${c.id}/imports/delete" class="inline" onsubmit="return confirm('${when(b.at)} に取り込んだ ${b.total}件を全件削除します（取り消せません）。${warnSent(b.sent)}\\n\\nよろしいですか？')"><input type="hidden" name="key" value="${esc(b.key)}"><button class="btn danger small" ${busy ? "disabled" : ""}>全件削除</button></form></td></tr>`).join("")}
</table></div>
<form method="post" action="/campaigns/${c.id}/jobs/delete-all" style="margin-top:8px" onsubmit="return confirm('このキャンペーンの会社 ${allTotal}件をすべて削除します（キャンペーンの設定・文面は残ります。取り消せません）。${warnSent(allSent)}\\n\\nよろしいですか？')"><button class="btn sub small" ${busy ? "disabled" : ""}>このキャンペーンの会社を全件削除（${allTotal}件）</button></form></details>`;
  })()}</div>

<div class="card"><h2 style="margin-top:0">1-b. 事前チェック（送る前に連絡先を確認）${extra.scanning ? '<span class="tag sending"><span class="spin"></span>チェック中</span>' : extra.unscanned === 0 && extra.scanned > 0 ? '<span class="tag sent">チェック完了</span>' : ""}</h2>
<p class="muted">送らずに各社のサイトを見て、フォームの有無・営業お断り・CAPTCHAを先に判定し、サイトのメールアドレスを拾います。フォームが無い会社はメールに自動で切り替わります（チャネルが「フォーム優先＋メール」のとき）。1社5〜10秒。</p>
${extra.emailQueued ? `<p class="small" style="margin:6px 0 10px;padding:8px 10px;background:var(--honey-50);border-radius:8px">✉ <b>メールで送る会社 ${extra.emailQueued}社</b>は事前チェックの対象外です（フォームを探す機能のため、下の件数には含まれません）。メールはそのまま「3. 本送信」の「開始」で送れます。1日に送る数は「1日の上限（メール）」までです。</p>` : ""}
${scanTotal > 0 ? `<div class="bar"><i id="scanfill" style="width:${scanPct}%"></i></div><div class="small muted" id="scantext">${extra.scanned} / ${scanTotal} 社チェック済み（${scanPct}%）</div>` : ""}
${extra.scanning ? `<form method="post" action="/campaigns/${c.id}/stop-scan" class="inline"><button class="btn danger">チェックを止める</button></form>` : `<form method="post" action="/campaigns/${c.id}/scan" class="inline"><button class="btn sub" ${extra.unscanned === 0 || running ? "disabled" : ""}>事前チェックを実行（未チェック ${extra.unscanned}社）</button></form>`}</div>

<div class="card"><h2 style="margin-top:0">2. 文面を確認する</h2>
<form method="post" action="/campaigns/${c.id}/preview" class="inline" data-busy onsubmit="foPreviewProgress(${(c.mode === "ai" || c.mode === "hybrid") && provider !== "none"})"><button class="btn sub" data-busytext="文面を作成中…">先頭の1社で文面をプレビュー</button></form>
<div id="prevprog" hidden style="margin-top:10px"><div class="bar"><i id="prevfill" style="width:0%"></i></div><div class="small muted" id="prevpct">文面を作成しています… 0%</div></div>
<script>
function foPreviewProgress(useAi){
  if(!useAi) return; // テンプレのみは一瞬なので進捗は出さない
  const box=document.getElementById("prevprog"),fill=document.getElementById("prevfill"),pct=document.getElementById("prevpct");
  box.hidden=false; let p=0;
  // AI生成中は実測トークンが取れないため、なめらかに進めて完了間際で止める推定表示（ページ遷移で100%）
  const t=setInterval(()=>{p=Math.min(92,p+Math.max(1,(92-p)*0.08));fill.style.width=p+"%";pct.textContent="文面を作成しています… "+Math.round(p)+"%";},250);
  addEventListener("pagehide",()=>clearInterval(t),{once:true});
}
</script>
${extra.preview ? `<p class="muted">${esc(extra.preview.job.company_name)}（${esc(extra.preview.job.industry)}）向け ${extra.preview.aiUsed ? "・AI生成あり" : "・テンプレのみ"}</p><p><b>件名:</b> ${esc(extra.preview.subject)}</p>${(extra.preview.lint ?? []).map((l) => `<div class="small" style="color:${l.level === "error" ? "var(--ng)" : "var(--warn)"}">${l.level === "error" ? "✕" : "△"} ${esc(l.text)}</div>`).join("")}<pre>${esc(extra.preview.message)}</pre>` : ""}
</div>

<div class="card"><h2 style="margin-top:0">3. 本送信</h2>
${total > 0 ? `<div class="bar"><i id="sendfill" style="width:${sendPct}%"></i></div><div class="small muted" id="sendtext">処理済み ${processed} / ${total} 社（${sendPct}%）</div>` : ""}
${running ? `<form method="post" action="/campaigns/${c.id}/pause" class="inline"><button class="btn danger">一時停止</button></form>` : `<form method="post" action="/campaigns/${c.id}/start" class="inline" data-busy><button class="btn" data-busytext="送信を開始しています…">開始する（${cnt("queued")}件）</button> <label class="inline small"><input type="checkbox" name="ignore_window" value="1"> 時間帯を無視して今すぐ送る</label></form>`}
${nRetry > 0 ? `<form method="post" action="/campaigns/${c.id}/requeue-failed" class="inline" onsubmit="return confirm('失敗・フォーム無しの ${nRetry} 社を待機中に戻します（会社ごとに最新の結果が失敗のものだけ）。このあと「開始」で再送信できます。よろしいですか？')"><button class="btn sub">失敗した会社を再送信（${nRetry}社）</button></form> ${extra.retryTargets && extra.retryTargets.length ? `<details class="small" style="display:inline-block;vertical-align:middle;margin-right:8px"><summary style="cursor:pointer;color:var(--ng)">対象の会社を見る（${extra.retryTargets.length}社）</summary><ul style="margin:6px 0 0;padding-left:1.2em;max-height:220px;overflow:auto;text-align:left">${extra.retryTargets.map((t) => `<li><a href="/jobs/${t.id}">${esc(t.company_name)}</a> <span class="muted">${(STATUS_LABEL as Record<string, string>)[t.status] ?? t.status}：${esc((t.result_text || "").split("\n")[0].slice(0, 50))}</span></li>`).join("")}</ul></details>` : ""}` : ""}${cnt("queued") > 0 ? `<form method="post" action="/campaigns/${c.id}/cancel-queued" class="inline" onsubmit="return confirm('待機中の ${cnt("queued")} 件をすべてキャンセルします。よろしいですか？（送信済みには影響しません）')"><button class="btn danger">待機中を一括キャンセル（${cnt("queued")}件）</button></form> ` : ""}<button class="btn sub" id="csvbtn" onclick="foExportCsv()">結果をCSVで書き出す</button> <a class="btn sub" href="/campaigns/${c.id}/manual.csv">手動送信リスト（CAPTCHA・失敗分をURL＋文面つきで）</a>
<p class="muted">実行中は進捗バーが自動で動き、終わると自動でページが切り替わります。</p></div>

<h2 id="list">送信一覧${extra.matched ? `（${extra.matched.n > 200 ? `${extra.matched.n}件中 最新200件を表示` : `${extra.matched.n}件`}）` : "（最新200件）"}</h2>
<form method="get" action="/campaigns/${c.id}#list" class="inline" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
<label class="inline small">状態:
<select name="status" onchange="this.form.submit()" style="width:auto;padding:4px 8px">
<option value="">すべて</option>
${(Object.entries(STATUS_LABEL) as [string, string][]).map(([k, l]) => `<option value="${k}" ${extra.statusFilter === k ? "selected" : ""}>${l}</option>`).join("")}
</select></label>
<label class="inline small">反応:
<select name="outcome" onchange="this.form.submit()" style="width:auto;padding:4px 8px">
<option value="">すべて</option>
<option value="replied" ${extra.outcomeFilter === "replied" ? "selected" : ""}>返信あり</option>
<option value="appointment" ${extra.outcomeFilter === "appointment" ? "selected" : ""}>アポ獲得</option>
<option value="declined" ${extra.outcomeFilter === "declined" ? "selected" : ""}>断り</option>
<option value="none" ${extra.outcomeFilter === "none" ? "selected" : ""}>反応なし</option>
</select></label>
${(extra.imports ?? []).length ? `<label class="inline small">取り込み:
<select name="imp" onchange="this.form.submit()" style="width:auto;padding:4px 8px">
<option value="">すべて</option>
${(extra.imports ?? []).map((b, i) => { const d = new Date(String(b.at).replace(" ", "T") + "Z"); const w = isNaN(d.getTime()) ? b.at : d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); return `<option value="${esc(b.key)}" ${extra.impFilter === b.key ? "selected" : ""}>${i === 0 ? "前回の取り込み：" : ""}${esc(w)} ${esc(b.label)}（${b.total}件）</option>`; }).join("")}
</select></label>` : ""}
<label class="inline small">会社名: <input type="text" name="q" value="${esc(extra.qFilter ?? "")}" placeholder="会社名・ドメイン" style="width:180px;padding:4px 8px"></label>
<button class="btn sub small">絞り込む</button>
${extra.statusFilter || extra.outcomeFilter || extra.qFilter || extra.impFilter ? `<a class="btn sub small" href="/campaigns/${c.id}#list">解除</a>` : ""}
</form>
<form id="bulkdel" method="post" action="/campaigns/${c.id}/bulk-delete" class="inline" style="margin:10px 0 4px;display:block" onsubmit="return confirm(document.querySelectorAll('input[name=ids][form=bulkdel]:checked').length + ' 社を送信一覧から削除します（取り消せません。送信済みの記録も消え、その会社への再送防止は効かなくなります）。よろしいですか？')"><button class="btn danger small" id="bulkbtn" disabled>選択した会社を削除（0件）</button> <span class="muted small">左端のチェックで選択（見出しのチェックで全選択）</span></form>
${extra.matched && extra.matched.n > 0 ? (() => {
    // 表示中の200件に限らず、いまの絞り込み条件に一致する全件を消す（条件なしなら全件）
    const filtered = Boolean(extra.statusFilter || extra.outcomeFilter || extra.qFilter || extra.impFilter);
    const busy = running || extra.scanning;
    const label = filtered ? `この絞り込みに一致する全件を削除（${extra.matched.n}件）` : `送信一覧の全件を削除（${extra.matched.n}件）`;
    const warn = extra.matched.sent ? `\\n\\n※ うち送信済み ${extra.matched.sent}件の記録も消えます。消すとその会社への「${c.resend_days}日以内の再送防止」が効かなくなります。` : "";
    return `<form method="post" action="/campaigns/${c.id}/delete-filtered" class="inline" style="margin:0 0 8px;display:block" onsubmit="return confirm('${filtered ? "いまの絞り込みに一致する" : "このキャンペーンの"}会社 ${extra.matched.n}件をすべて削除します（表示されていない分も含みます。取り消せません）。${warn}\\n\\nよろしいですか？')">
<input type="hidden" name="status" value="${esc(extra.statusFilter ?? "")}"><input type="hidden" name="outcome" value="${esc(extra.outcomeFilter ?? "")}"><input type="hidden" name="q" value="${esc(extra.qFilter ?? "")}"><input type="hidden" name="imp" value="${esc(extra.impFilter ?? "")}">
<button class="btn danger small" ${busy ? "disabled" : ""}>${label}</button>${busy ? ' <span class="muted small">送信中・事前チェック中は削除できません</span>' : ""}</form>`;
  })() : ""}
<p class="muted">背景が黄色の行は、前回このページを見たあとに状況が更新された会社です。失敗行の橙色ラベルはエラーの種類です。</p>
<table><tr><th><input type="checkbox" title="全選択" onchange="foSelAll(this)"></th><th>ID</th><th>会社</th><th>送り方</th><th>業種</th><th>状態</th><th>結果</th><th>反応</th><th>更新</th><th></th></tr>
${(() => {
    // 同じ「会社名＋送信先」への複数回の送信は、最新の1行だけを代表として表示し、
    // 古い履歴は ▽(N件) の折りたたみに集約する（一覧は updated_at 降順なので先頭が最新）
    type G = { rep: Job; hist: Job[] };
    const byKey = new Map<string, G>();
    const groups: G[] = [];
    for (const j of jobs) {
      // 同じ会社（ドメイン）はフォームURLやメールが違っても1行にまとめる（最新を代表・古い試行は▽に折りたたむ）
      const key = j.is_test ? `test-${j.id}` : (j.domain || j.company_name);
      const g = byKey.get(key);
      if (!g) { const ng = { rep: j, hist: [] as Job[] }; byKey.set(key, ng); groups.push(ng); }
      else g.hist.push(j);
    }
    const repRow = (j: Job, hist: Job[]) => `<tr data-u="${esc(j.updated_at ?? "")}"><td>${j.is_test ? "" : `<input type="checkbox" name="ids" value="${j.id}" form="bulkdel" onchange="foBulkCount()">`}</td><td>${j.id}${j.is_test ? " <span class='tag'>test</span>" : ""}</td><td><a href="/jobs/${j.id}">${esc(j.company_name)}</a><br><span class="muted">${esc(j.domain)}</span></td><td class="small">${j.channel === "email" ? "✉ メール" : "📝 フォーム"}</td><td class="small">${esc(j.sub_industry || j.industry)}</td><td>${statusCell(j)}${hist.length ? `<br><button type="button" class="histbtn" data-t="${j.id}" data-n="${hist.length}" onclick="foHist(this)">▽(${hist.length}件)</button>` : ""}</td><td class="small">${errKindTag(j)}${esc((j.result_text || "").split("\n")[0].slice(0, 70))}</td><td class="small">${j.outcome ? `<b>${esc(OUTCOME_LABEL[j.outcome] ?? j.outcome)}</b>` : ""}</td><td class="small">${esc(jst(j.updated_at))}</td><td>${j.status === "queued" ? `<form method="post" action="/jobs/${j.id}/cancel" class="inline"><button class="btn sub small">キャンセル</button></form>` : j.status === "failed" || j.status === "skip_no_form" ? `<a class="btn sub small" href="/jobs/${j.id}#fix">修正して再送信</a>` : ""} ${j.is_test ? "" : `<form method="post" action="/jobs/${j.id}/delete" class="inline" data-n="${esc(j.company_name)}" onsubmit="return confirm(this.dataset.n + ' の記録${hist.length ? `（履歴${hist.length}件を含む）` : ""}をすべて送信一覧から削除します（取り消せません）${j.status === "sent" || hist.some((h) => h.status === "sent") ? "。送信済みの記録も消え、この会社への再送防止が効かなくなります" : ""}。よろしいですか？')"><button class="btn sub small" title="この会社の記録をすべて削除">削除</button></form>`}</td></tr>`;
    const histRow = (repId: number, h: Job) => `<tr class="histrow hist-${repId}" hidden><td></td><td></td><td colspan="8" class="small muted">└ ${esc(jst(h.updated_at))} ${statusTag(h.status)} ${errKindTag(h)}${esc((h.result_text || "").split("\n")[0].slice(0, 60))} <a href="/jobs/${h.id}">詳細</a></td></tr>`;
    return groups.map((g) => repRow(g.rep, g.hist) + g.hist.map((h) => histRow(g.rep.id, h)).join("")).join("");
  })()}
</table>
<script>
function foBulkCount(){var n=document.querySelectorAll('input[name=ids][form=bulkdel]:checked').length;var b=document.getElementById('bulkbtn');if(!b)return;b.disabled=!n;b.textContent='選択した会社を削除（'+n+'件）';}
function foSelAll(cb){document.querySelectorAll('input[name=ids][form=bulkdel]').forEach(function(x){x.checked=cb.checked;});foBulkCount();}
async function foExportCsv(){
  const b=document.getElementById("csvbtn");if(b.disabled)return;
  const orig=b.textContent;b.disabled=true;b.textContent="書き出し中…";
  try{
    const r=await fetch("/campaigns/${c.id}/export.csv");
    if(!r.ok)throw new Error("HTTP "+r.status);
    const blob=await r.blob();
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="campaign-${c.id}-results.csv";a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    b.textContent="書き出し済みです ✓";
  }catch(e){b.textContent="書き出しに失敗しました";}
  setTimeout(()=>{b.textContent=orig;b.disabled=false;},4000);
}
</script>
<script>
// ▽(N件): 同じ送信先への過去の送信履歴を開閉する（開閉状態は保存しない）
function foHist(btn){
  const open = btn.classList.toggle("open");
  document.querySelectorAll(".hist-" + btn.dataset.t).forEach((r) => { r.hidden = !open; });
  btn.textContent = (open ? "△(" : "▽(") + btn.dataset.n + "件)";
}
// 前回表示から更新された行をハイライト（ブラウザごとに localStorage で覚える）
(()=>{try{
  const key="fo_seen_${c.id}";const last=localStorage.getItem(key)||"";let max=last;
  document.querySelectorAll("tr[data-u]").forEach(tr=>{const u=tr.getAttribute("data-u")||"";if(u>max)max=u;if(last&&u>last)tr.classList.add("hl");});
  if(max)localStorage.setItem(key,max);
}catch(e){}})();
</script>
${extra.scanning || running ? `<script>
// 実行中: 2.5秒ごとに進捗を取り、バーを動かす。状態が変わったら（完了・停止）ページを更新する。
const wasScanning=${extra.scanning},wasRunning=${running};
async function foPoll(){try{
  const r=await fetch("/campaigns/${c.id}/progress");if(!r.ok)return;const p=await r.json();
  const sf=document.getElementById("scanfill"),st=document.getElementById("scantext");
  if(sf&&p.scanTotal){const pct=Math.round(p.scanDone/p.scanTotal*100);sf.style.width=pct+"%";if(st)st.textContent=p.scanDone+" / "+p.scanTotal+" 社チェック済み（"+pct+"%）";}
  const ef=document.getElementById("sendfill"),et=document.getElementById("sendtext");
  if(ef&&p.total){const pct=Math.round(p.processed/p.total*100);ef.style.width=pct+"%";if(et)et.textContent="処理済み "+p.processed+" / "+p.total+" 社（"+pct+"%）";}
  if(p.scanning!==wasScanning||p.running!==wasRunning)location.reload();
}catch(e){}}
setInterval(foPoll,2500);
setTimeout(()=>location.reload(),15000); // 一覧の中身も15秒ごとに更新
</script>` : ""}`;
}

/** テスト送信の専用ページ。自社フォーム宛ての動作確認と、テスト履歴 */
/** 取り込みプレビュー: 実際に登録する前に、先頭数行と件数内訳を見せて確認してもらう */
export function importPreviewView(c: Campaign & { sender: SenderProfile }, rows: import("./csv.js").CompanyRow[], summary: import("./csv.js").ImportSummary, srcLabel: string): string {
  const sample = rows.slice(0, 8);
  const cell = (v: string) => `<td class="small">${esc((v || "").slice(0, 40)) || '<span class="muted">―</span>'}</td>`;
  const willSend = summary.added, willSkip = summary.excluded + summary.suppressed + summary.duplicated + summary.noUrl;
  return `<h1>取り込みプレビュー <span class="tag">${esc(srcLabel)}</span></h1>
<p><a href="/campaigns/${c.id}">← ${esc(c.name)}</a></p>
<div class="card"><h2 style="margin-top:0">この内容で取り込みますか？</h2>
<p>読み込んだ行数: <b>${rows.length}</b>件　→　登録予定: <b style="color:var(--ok)">${willSend}</b>件（フォーム${summary.addedForm}・メール${summary.addedEmail}）／ 送らない: <b>${willSkip}</b>件</p>
<p class="muted small">送らない内訳: 除外/官公庁 ${summary.excluded} ・ 除外リスト ${summary.suppressed} ・ 重複/再送禁止 ${summary.duplicated} ・ 送信先なし ${summary.noUrl}</p>
${summary.noEntity && summary.noEntity.length ? `<p class="small" style="color:var(--warn)">⚠ 「株式会社」などの法人格が無い社名 <b>${summary.noEntity.length}</b>社：${esc(summary.noEntity.slice(0, 12).join("、"))}${summary.noEntity.length > 12 ? " ほか" : ""}<br><span class="muted">事前チェックのときに各社のHPの表記（フッター・会社概要）から正式名称を自動で補います（AI不要・無料）。HPで確認できなかった社は、取り込み後に社名をご確認ください。</span></p>` : ""}
<form method="post" action="/campaigns/${c.id}/import-confirm" class="inline" data-busy><button class="btn" data-busytext="取り込み中…">この内容で取り込む（${rows.length}行）</button></form>
<form method="post" action="/campaigns/${c.id}/import-cancel" class="inline"><button class="btn sub">やめる</button></form>
</div>
<h2>先頭 ${sample.length} 行の読み取り結果（列がずれていないか確認してください）</h2>
<p class="muted small">下の各列に正しい値が入っていれば、見出しの対応は合っています。ずれている場合は、取り込み元の1行目の見出し（企業名 / 企業URL / 問い合わせフォーム / メール …）をご確認ください。</p>
<div style="overflow-x:auto"><table><tr><th>企業名</th><th>問い合わせフォーム</th><th>企業URL</th><th>メール</th><th>業種</th><th>都道府県</th><th>代表者</th></tr>
${sample.map((r) => `<tr>${cell(r.company_name)}${cell(r.form_url)}${cell(r.site_url)}${cell(r.email)}${cell(r.sub_industry || r.industry)}${cell(r.prefecture)}${cell(r.representative)}</tr>`).join("")}
</table></div>
${summary.excludedRows.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">送らない会社 ${summary.excludedRows.length}件の内訳を見る</summary>
<table style="margin-top:6px"><tr><th>会社名</th><th>理由</th><th>送信先</th></tr>
${summary.excludedRows.slice(0, 200).map((x) => `<tr><td>${esc(x.company)}</td><td class="small">${esc(x.reason)}</td><td class="small">${esc((x.where || "").slice(0, 60))}</td></tr>`).join("")}
</table></details>` : ""}`;
}

export function testView(c: Campaign & { sender: SenderProfile }, tests: Job[]) {
  return `<h1>テスト送信 <span class="tag">${esc(c.name)}</span></h1>
<p><a href="/campaigns/${c.id}">← キャンペーンに戻る</a></p>
<div class="card"><h2 style="margin-top:0">自社のフォームに送って動作確認</h2>
<p class="muted">実在の他社には送らないでください。テスト送信は本送信の件数・履歴とは別に記録されます。</p>
<form method="post" action="/campaigns/${c.id}/test"><div class="row"><div><label>テスト先フォームURL</label><input type="url" name="url" required placeholder="https://自社サイト/contact/"></div><div><label>会社名（差し込み確認用）</label><input type="text" name="company" value="テスト株式会社"></div></div>
<p><button class="btn sub" name="dry" value="1">入力だけ試す（送信しない）</button> <button class="btn">実際に送信する</button></p></form>
${channelMode(c.channel) !== "form_only" ? `<form method="post" action="/campaigns/${c.id}/test"><label>メールのテスト（自分のアドレスに1通送る）</label><div class="row"><input type="email" name="email" placeholder="自分のメールアドレス"><button class="btn">テストメールを送る</button></div></form>` : ""}</div>
<h2>テスト履歴（最新20件）</h2>
${tests.length ? `<table><tr><th>ID</th><th>宛先</th><th>送り方</th><th>状態</th><th>結果</th><th>日時</th></tr>
${tests.map((j) => `<tr><td><a href="/jobs/${j.id}">${j.id}</a></td><td>${esc(j.company_name)}<br><span class="muted small">${esc(j.form_url || j.email)}</span></td><td class="small">${j.channel === "email" ? "✉ メール" : "📝 フォーム"}</td><td>${statusTag(j.status)}</td><td class="small">${esc((j.result_text || "").split("\n")[0].slice(0, 70))}</td><td class="small">${esc(jst(j.updated_at))}</td></tr>`).join("")}
</table>` : '<p class="muted">まだテストしていません。</p>'}`;
}

export function jobView(j: Job, c: Campaign) {
  return `<h1>${esc(j.company_name)} ${statusTag(j.status)}</h1>
<p><a href="/campaigns/${c.id}">← ${esc(c.name)}</a></p>
<div class="row"><div class="card"><b>フォームURL:</b> <a href="${esc(j.form_url)}" target="_blank">${esc(j.form_url)}</a><br><b>企業URL:</b> ${esc(j.site_url)}<br><b>業種:</b> ${esc(j.industry)} / ${esc(j.sub_industry)}<br><b>試行:</b> ${j.attempts}回 <b>送信:</b> ${esc(jst(j.sent_at) || "-")}
<h2>結果・ログ ${errKind(j) ? `<span class="errkind">${esc(errKind(j))}</span>` : ""}</h2><pre>${esc(j.result_text)}</pre>
<form method="post" action="/jobs/${j.id}/retry" class="inline" data-busy><button class="btn sub" data-busytext="再試行中…">再試行</button></form>
<form method="post" action="/jobs/${j.id}/assist" class="inline" data-busy><button class="btn sub" data-busytext="ブラウザで入力中…" title="このパソコンにブラウザを開き、フォームを入力した状態で止めます（送信は押しません）">ブラウザで開いて自動入力（送信しない）</button></form>
${j.status !== "sent" ? `<form method="post" action="/jobs/${j.id}/mark-sent" class="inline" onsubmit="return confirm('この会社を「送信済み（手動）」にします。手動で送った分の消し込みに使ってください。よろしいですか？')"><button class="btn sub">手動で送信済みにする</button></form>` : ""}
${j.status === "failed" || j.status === "skip_no_form" || j.status === "skip_captcha" ? `
<div class="card" id="fix" style="margin-top:14px;background:var(--honey-50)"><h2 style="margin-top:0">修正して再送信</h2>
<p class="muted">フォームURLの間違い（別ページに正しいフォームがある等）を直して、その場で送り直せます。</p>
<form method="post" action="/jobs/${j.id}/fix" data-busy>
<div class="row"><div><label>フォームURL</label><input type="url" name="form_url" value="${esc(j.form_url)}"></div><div><label>企業URL</label><input type="url" name="site_url" value="${esc(j.site_url)}"></div></div>
<div class="row"><div><label>会社名</label><input type="text" name="company_name" value="${esc(j.company_name)}"></div><div><label>メール（メール送信に切り替える場合）</label><input type="email" name="email" value="${esc(j.email)}"></div></div>
<p><button class="btn">修正して再送信</button> <span class="muted small">送信には10〜30秒かかります</span></p></form></div>` : ""}
<form method="post" action="/suppressions" class="inline"><input type="hidden" name="domain" value="${esc(j.domain)}"><input type="hidden" name="reason" value="手動（${esc(j.company_name)}）"><button class="btn danger">このドメインを除外</button></form>
${j.status === "sent" ? `<h2>反応を記録</h2><form method="post" action="/jobs/${j.id}/outcome"><p>${[["replied", "返信あり"], ["appointment", "アポ獲得"], ["declined", "断り・不要（今後送らない）"], ["", "取り消し"]].map(([k, l]) => `<button class="btn ${j.outcome === k && k ? "" : "sub"} small" name="outcome" value="${k}">${l}</button>`).join(" ")}</p><input type="text" name="note" value="${esc(j.outcome_note)}" placeholder="メモ（返信内容・次のアクション）"></form>` : ""}
<h2>送った文面</h2><pre>${esc(j.message_used)}</pre></div>
<div class="card"><h2 style="margin-top:0">スクリーンショット</h2>${j.screenshot_path ? `<img src="/screenshots/${esc(j.screenshot_path.split("/").pop())}" style="max-width:100%;border:1px solid #ddd">` : '<p class="muted">なし</p>'}
${(() => {
    if (j.status === "sent") return "";
    let qs: { label: string; kind: string; multiple?: boolean; options?: string[] }[] = [];
    try { qs = JSON.parse(j.pending_questions || "[]"); } catch { qs = []; }
    if (!qs.length) return "";
    return `<div style="margin-top:14px;background:var(--honey-50);border:1px solid var(--honey);border-radius:10px;padding:12px">
<h2 style="margin-top:0">📝 未回答の質問に答えて再送信</h2>
<p class="muted small">フォームにあった質問に自動で回答を決められませんでした。上のスクリーンショットを見ながら選ぶか記入してください。再送信時にこの回答をフォームへ入力します。</p>
<form method="post" action="/jobs/${j.id}/answer" data-busy>
${qs.slice(0, 30).map((q, i) => `<input type="hidden" name="q_label_${i}" value="${esc(q.label)}">
<label>${esc(q.label)}${q.multiple ? '<span class="muted small">（複数選べます）</span>' : ""}</label>
${q.kind === "choice" && q.options?.length
      ? `<div class="small" style="display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0 10px">${q.options.map((o) => `<label class="inline" style="font-weight:400;display:inline-flex;align-items:center;gap:4px"><input type="${q.multiple ? "checkbox" : "radio"}" name="q_ans_${i}" value="${esc(o)}">${esc(o)}</label>`).join("")}</div>`
      : `<input type="text" name="q_ans_${i}" style="margin-bottom:10px" placeholder="回答を記入">`}`).join("")}
<p><button class="btn">回答して再送信</button> <span class="muted small">10〜30秒かかります</span></p></form></div>`;
  })()}</div></div>`;
}

export function suppressionsView(
  rows: { id: number; company_name: string; domain: string | null; email: string | null; tel: string; reason: string; created_at: string }[],
  optouts: { email: string; reason: string; created_at: string }[] = [],
  imported?: { added: number; already: number; noKey: number; noKeyNames: string[] }
) {
  return `<h1>除外リスト</h1><p class="muted">ここに登録した会社には、全キャンペーンで送りません。営業お断りを検知した先は自動で追加されます。返信で「今後不要」と言われた先も必ず追加してください。</p>
${imported ? `<div class="flash">CSVを取り込みました: 追加 ${imported.added}件 / 登録済み ${imported.already}件${imported.noKey ? ` / 登録できず ${imported.noKey}件（ドメインもメールも無いため）: ${esc(imported.noKeyNames.join("、"))}` : ""}</div>` : ""}
<div class="card"><h2 style="margin-top:0">1件ずつ追加</h2>
<form method="post" action="/suppressions"><div class="row3">
<div><label>会社名</label><input type="text" name="company_name" placeholder="株式会社○○"></div>
<div><label>ドメイン または メールアドレス</label><input type="text" name="domain" placeholder="example.co.jp / info@example.co.jp" required></div>
<div><label>理由</label><input type="text" name="reason" placeholder="先方より連絡不要のご依頼"></div>
</div><p><button class="btn">追加</button></p></form></div>

<div class="card"><h2 style="margin-top:0">まとめて追加（貼り付け・スプレッドシート・CSV）</h2>
<p class="muted">1行1社。<b>URL・ドメインやメールアドレスだけを縦に貼るだけでOK</b>です（会社名は無くても登録できます）。<br>スプレッドシートからコピーした複数列（会社名・URL・メール・電話）もそのまま貼れます。1行目が見出し（会社名／ドメイン／メール 等）ならその列で読み、見出しが無ければ中身で自動判別します。<br>ドメインもメールも無い行（会社名だけ）は、送信を止める手がかりが無いため登録できません（その場合は会社名を一覧で出します）。</p>
<form method="post" action="/suppressions/import" enctype="multipart/form-data">
<label>① 貼り付け（スプレッドシート・Excel・メモ帳からコピー）</label>
<textarea name="pasted" style="min-height:120px" placeholder="example.co.jp&#10;https://www.sample.jp/&#10;info@test.co.jp&#10;株式会社○○	https://maru.co.jp"></textarea>
<div class="row"><div><label>② または Google スプレッドシートのURL</label><input type="url" name="sheet_url" placeholder="https://docs.google.com/spreadsheets/d/…"><p class="muted small">共有を「リンクを知っている全員（閲覧可）」にしてください。</p></div><div><label>③ または CSVファイル</label><input type="file" name="csv" accept=".csv,text/csv"></div></div>
<label>理由（理由の列が無い行に付けます）</label><input type="text" name="reason" placeholder="取引先のため送信対象外">
<p><button class="btn">取り込む</button></p></form>
<p class="muted small">除外リストはPCごとに独立しています。別のメンバーと共有したいときは、下のボタンでCSVに書き出し、相手はこの「CSVでまとめて追加」から取り込めます（列はそのまま合います）。</p>
${rows.length ? '<a class="btn sub" href="/suppressions/export.csv">除外リストをCSVで書き出す</a>' : ""}</div>

<table><tr><th>会社名</th><th>ドメイン</th><th>メール</th><th>電話</th><th>理由</th><th>登録</th><th></th></tr>${rows.length ? rows.map((r) => `<tr><td>${esc(r.company_name || "―")}</td><td>${esc(r.domain ?? "―")}</td><td class="small">${esc(r.email ?? "―")}</td><td class="small">${esc(r.tel || "―")}</td><td class="small">${esc(r.reason)}</td><td class="small">${esc(jst(r.created_at))}</td><td><form method="post" action="/suppressions/${r.id}/delete" class="inline"><button class="btn sub small">削除</button></form></td></tr>`).join("") : `<tr><td colspan="7" class="muted">まだ登録がありません。</td></tr>`}</table>
<h2>メール配信停止（アドレス単位）</h2><p class="muted">上の欄にメールアドレスを入れて追加すると、そのアドレス宛てのメールを停止します。返信で「配信停止」と言われた相手は必ず入れてください。</p>
<table><tr><th>メール</th><th>理由</th><th>登録</th></tr>${optouts.map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.reason)}</td><td class="small">${esc(jst(r.created_at))}</td></tr>`).join("")}</table>`;
}

export function settingsView(ngWords: string[], ai: import("./message.js").AiConfig, stats?: { senders: number; campaigns: number; companies: number; sent: number; suppressions: number; optouts: number }) {
  const configured = ai.provider !== "none";
  // データの概要: 集計して表示するだけの追加カード。このブロックを消せば丸ごと外せる
  const overview = stats
    ? `<div class="card"><h2 style="margin-top:0">データの概要</h2>
<p class="muted">このPCに保存されている件数のまとめです（あなたが見られる範囲）。</p>
<div class="stats"><div class="stat">送信者<b>${stats.senders}</b></div><div class="stat">キャンペーン<b>${stats.campaigns}</b></div><div class="stat">登録企業<b>${stats.companies}<span style="font-size:12px;font-weight:400">社</span></b></div><div class="stat">送信済<b style="color:var(--ok)">${stats.sent}</b></div><div class="stat">除外リスト<b>${stats.suppressions}</b></div><div class="stat">配信停止<b>${stats.optouts}</b></div></div></div>`
    : "";
  const models = (p: "anthropic" | "gemini") => AI_MODELS[p].map((m) => `<option value="${m.id}" data-p="${p}" ${ai.model === m.id ? "selected" : ""}>${esc(m.label)}</option>`).join("");
  return `<h1>設定</h1>
${overview}
<div class="card"><h2 style="margin-top:0">AIモード設定</h2>
<p>現在: ${configured ? `<span class="tag sent">設定済み</span> <b>${ai.provider === "anthropic" ? "Claude" : "Gemini"} / ${esc(ai.model)}</b>${ai.source === "env" ? ' <span class="muted small">（環境変数から読み込み）</span>' : ""}` : '<span class="tag">未設定（AI: none）</span> <span class="muted">テンプレートのみで動いています。AIを使わなくても送信はできます。</span>'}</p>

<details ${configured ? "" : "open"} style="margin:10px 0"><summary style="cursor:pointer;font-weight:700">はじめての方へ: APIキーとは？ 料金はいくら？（クリックで開く）</summary>
<div style="padding:10px 4px">
<p><b>APIキーとは。</b> ChatGPTやClaude.aiのように「会員登録して画面から使う」サービスとは別に、このツールが直接AIを呼び出すための<b>利用者ごとの認証キー</b>です。長い文字列で、発行した本人（または会社）の支払い方法に、<b>使った分だけ課金</b>されます。月額ではなく従量課金です。</p>
<p><b>料金の目安。</b> フォーム1件あたり入力1,000トークン＋出力300トークン程度を想定した概算です。</p>
<table style="max-width:560px"><tr><th>モデル</th><th>1件あたり</th><th>月1,000件</th><th>月10,000件</th></tr>
<tr><td>Claude Haiku</td><td>約0.4円</td><td>約400円</td><td>約4,000円</td></tr>
<tr><td>Claude Sonnet</td><td>約0.8円</td><td>約800円</td><td>約8,000円</td></tr>
<tr><td>Gemini Flash-Lite</td><td>約0.2円</td><td>約200円</td><td>約2,000円</td></tr>
<tr><td>Gemini Flash</td><td>約0.3円</td><td>約300円</td><td>約3,000円</td></tr></table>
<p class="muted small">2026年9月時点の各社公式レート・1ドル=154円換算の概算です。実際の送信件数やフォームの複雑さで変動します。</p>
<p><b>キーの取得手順。</b></p>
<ul class="small">
<li><b>Claude:</b> <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> でアカウント作成 → 支払い方法を登録 → 左メニュー「API Keys」から発行（<code>sk-ant-</code>で始まる文字列）</li>
<li><b>Gemini:</b> <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a> にGoogleアカウントでログイン →「Get API key」から発行（<code>AIza</code>で始まる文字列）</li>
</ul>
<p><b>⚠ 注意。</b></p>
<ul class="small">
<li>キーは<b>他人・他の拠点と共有しない</b>でください。共有相手の利用分もあなたに課金されます。拠点ごとに各自のキーを発行してください</li>
<li>各社の管理画面で<b>利用上限（スペンドリミット）</b>を設定できます。使いすぎ防止に、最初に設定しておくのがおすすめです</li>
<li>キーはこのPCの <code>data/</code> フォルダ内にだけ保存され、配布物やGitHubには含まれません</li>
</ul>
</div></details>

<form method="post" action="/settings/ai">
<div class="row3">
<div><label>AIプロバイダ</label><select name="provider" id="ai-provider" onchange="foAiModels()">
<option value="anthropic" ${ai.provider !== "gemini" ? "selected" : ""}>Claude（Anthropic）</option>
<option value="gemini" ${ai.provider === "gemini" ? "selected" : ""}>Gemini（Google）</option>
</select></div>
<div><label>モデル</label><select name="model" id="ai-model">${models("anthropic")}${models("gemini")}</select></div>
<div><label>APIキー ${configured && ai.source === "settings" ? '<span class="muted small">（保存済み。変えるときだけ入力）</span>' : ""}</label><input type="password" name="api_key" placeholder="${configured && ai.source === "settings" ? "••••••••（保存済み）" : "sk-ant-… / AIza…"}" autocomplete="off"></div>
</div>
<p><button class="btn">保存して接続テスト</button> <span class="muted small">保存すると、実際にAIを1回呼んで接続を確認します</span></p>
</form>
${configured && ai.source === "settings" ? `<form method="post" action="/settings/ai/delete" class="inline" onsubmit="return confirm('AI設定を削除しますか？ テンプレートのみの動作に戻ります')"><button class="btn danger small">AI設定を削除する</button></form>` : ""}
<script>
function foAiModels(){const p=document.getElementById("ai-provider").value;const sel=document.getElementById("ai-model");let first=null;let cur=sel.selectedOptions[0];
for(const o of sel.options){const show=o.dataset.p===p;o.hidden=!show;o.disabled=!show;if(show&&!first)first=o;}
if(!cur||cur.dataset.p!==p)sel.value=first.value;}
foAiModels();
</script></div>

<div class="card"><h2 style="margin-top:0">NGワード（1行1語）</h2><form method="post" action="/settings"><textarea name="ng_words">${esc(ngWords.join("\n"))}</textarea><p><button class="btn">保存</button></p></form></div>

<div class="card"><h2 style="margin-top:0">データのバックアップ</h2>
<p class="muted">送信者・キャンペーン・送信履歴を1つのファイル（JSON）に書き出します。PCの買い替え前や、記録の保管にどうぞ。安全のため、SMTPのアプリパスワードとAIのAPIキーは含みません。<b>書き出しのみで、読み込み（復元）機能はありません。</b></p>
<a class="btn sub" href="/backup.json">バックアップを書き出す</a></div>`;
}

// ================= ログイン関連の画面 =================

/** ログイン画面（ヘッダー無しの独立レイアウト） */
export function loginPage(opts: { error?: string; next?: string } = {}): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン | アポハッチくん</title>
<style>
body{margin:0;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#FAF8F3;color:#1C1710;display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:14px}
.box{background:#fff;border:1px solid #E6DFCF;border-radius:14px;padding:32px 30px;width:340px;box-shadow:0 2px 16px rgba(28,23,16,.06)}
h1{font-size:19px;margin:14px 0 4px;text-align:center}
.sub{text-align:center;color:#6E6558;font-size:12px;margin:0 0 22px}
label{display:block;font-size:12px;color:#6E6558;margin:12px 0 4px}
input{width:100%;padding:10px 12px;border:1px solid #D9D4CC;border-radius:8px;font-size:14px}
button{width:100%;margin-top:20px;padding:11px;background:#FFC62E;color:#1C1710;border:0;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer}
.err{background:#FDECEA;color:#C62828;border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:6px}
.mark{display:block;margin:0 auto}
</style></head><body>
<form class="box" method="post" action="/login">
<svg class="mark" viewBox="0 0 48 48" width="52" height="52" role="img" aria-label="ハッチくん"><path d="M20 14C18.5 9 16 7.5 13.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28 14C29.5 9 32 7.5 34.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.8" cy="6.4" r="2.4" fill="#1C1710"/><circle cx="35.2" cy="6.4" r="2.4" fill="#1C1710"/><ellipse cx="9.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(-24 9.5 20)"/><ellipse cx="38.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(24 38.5 20)"/><rect x="13" y="13" width="22" height="29" rx="11" fill="#FFC62E" stroke="#1C1710" stroke-width="2"/><rect x="13" y="27.5" width="22" height="4.6" fill="#1C1710"/><rect x="13" y="36" width="22" height="4.6" fill="#1C1710"/><circle cx="19.6" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="28.4" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="20.4" cy="20.7" r=".8" fill="#fff"/><circle cx="29.2" cy="20.7" r=".8" fill="#fff"/></svg>
<h1>アポハッチくん</h1><p class="sub">フォーム＆メール営業</p>
${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ""}
<input type="hidden" name="next" value="${esc(opts.next ?? "/")}">
<label>ログインID</label><input name="username" autocomplete="username" autofocus required>
<label>パスワード</label><input name="password" type="password" autocomplete="current-password" required>
<button>ログイン</button>
</form></body></html>`;
}

/** パスワード変更 */
export function passwordView(mustChange: boolean): string {
  return `<h1>パスワードの変更</h1>
${mustChange ? `<div class="flash">最初のログインです。ご自身のパスワードに変更してください。</div>` : ""}
<div class="card" style="max-width:460px">
<form method="post" action="/password">
${mustChange ? "" : `<label>いまのパスワード</label><input type="password" name="current" autocomplete="current-password" required>`}
<label>新しいパスワード（8文字以上）</label><input type="password" name="next1" autocomplete="new-password" required minlength="8">
<label>新しいパスワード（確認）</label><input type="password" name="next2" autocomplete="new-password" required minlength="8">
<p><button class="btn">変更する</button></p>
</form></div>`;
}

/** ユーザー管理（管理者のみ） */
/** 他の人のPCから開くURL（ユーザー管理に表示）。アドレス欄の localhost のリンクは相手のPCでは開けないため */
function shareUrlsCard(urls: string[]): string {
  if (!urls.length) return "";
  return `<div class="card"><h2 style="margin-top:0">他の人のPCから開くには</h2>
<p class="small" style="margin:0 0 4px">アドレス欄の <code>localhost</code> のリンクを送ると、相手のPCでは「サーバーに接続できません」になります。同じWi-Fi・社内ネットワークにいる人には、次のURLを伝えてください（おまけゲームは出ない版）。発行したログインIDと一緒に送ると便利です。</p>
${urls.map((u) => `<p style="margin:4px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><code style="user-select:all">${esc(u)}</code><button type="button" class="btn sub small" onclick="(navigator.clipboard?navigator.clipboard.writeText('${esc(u)}'):Promise.reject()).then(()=>{this.textContent='コピーしました'}).catch(()=>{prompt('このURLをコピーしてください','${esc(u)}')})">コピー</button></p>`).join("")}
<p class="muted small" style="margin:6px 0 0">※ このPCの電源が入っていて、アポハッチくんが起動している間だけ開けます。1つ目（PC名）のURLで開けない場合は、数字のURLを使ってください（数字はWi-Fiにつなぎ直すと変わることがあります）。社外の人や、別のネットワーク（ゲストWi-Fi・テザリング等）からは開けません。</p></div>`;
}

export function usersView(users: { id: number; username: string; display_name: string; role: string; active: number; last_login_at: string | null; created_at: string }[], issued?: { username: string; password: string }, shareUrls: string[] = []): string {
  return `<h1>ユーザー管理</h1>
${issued ? `<div class="card" style="border-color:var(--honey);background:var(--honey-50)">
<b>アカウントを発行しました。この内容をご本人に伝えてください（パスワードは今だけ表示されます）</b>
<table style="margin-top:8px"><tr><th>ログインID</th><td><code style="font-size:15px">${esc(issued.username)}</code></td></tr>
<tr><th>初期パスワード</th><td><code style="font-size:15px">${esc(issued.password)}</code></td></tr></table>
<p class="muted">初回ログイン時に本人がパスワードを変更する画面になります。</p></div>` : ""}
${shareUrlsCard(shareUrls)}
<div class="card"><h2 style="margin-top:0">＋ アカウントを発行する</h2>
<div class="muted small" style="background:var(--honey-50);border:1px solid var(--honey);border-radius:8px;padding:10px 12px;margin-bottom:12px">
<b>権限の違い</b><br>
・<b>一般</b>：自分が作った<b>キャンペーン・送信者・送信履歴だけ</b>が見え、操作できます。他の人のデータや、ユーザー管理・設定（AIキー／NGワード）は見えません。日々の営業担当はこちら。<br>
・<b>管理者</b>：<b>全ユーザーのデータ</b>が見え、<b>アカウントの発行・停止・パスワード再発行</b>や<b>設定（AIキー・NGワード）の変更</b>ができます。運用の責任者だけに付けてください。<br>
※「営業お断り」の除外リストは、事故防止のため<b>全員で共通に突合</b>されます（各自の画面に出るのは自分が登録した分だけです）。
</div>
<form method="post" action="/users">
<div class="row3">
<div><label>ログインID（半角英数字）</label><input name="username" placeholder="tanaka" required></div>
<div><label>表示名</label><input name="display_name" placeholder="田中商事 田中様"></div>
<div><label>権限</label><select name="role"><option value="user">一般（自分のデータだけ見える）</option><option value="admin">管理者（全部見える・ユーザー発行可）</option></select></div>
</div>
<label>初期パスワード（空欄なら自動生成）</label><input name="password" placeholder="空欄で自動生成">
<p><button class="btn">発行する</button></p>
</form></div>
<h2>アカウント一覧</h2>
<table><tr><th>ID</th><th>ログインID</th><th>表示名</th><th>権限</th><th>状態</th><th>最終ログイン</th><th></th></tr>
${users.map((u) => `<tr>
<td>${u.id}</td><td><code>${esc(u.username)}</code></td><td>${esc(u.display_name)}</td>
<td>${u.role === "admin" ? "管理者" : "一般"}</td>
<td>${u.active ? '<span class="tag sent">有効</span>' : '<span class="tag">停止中</span>'}</td>
<td class="small">${esc(jst(u.last_login_at) || "―")}</td>
<td class="small">
<form method="post" action="/users/${u.id}/reset" class="inline" onsubmit="return confirm('パスワードを再発行します。よろしいですか？')"><button class="btn sub small">パスワード再発行</button></form>
<form method="post" action="/users/${u.id}/toggle" class="inline"><button class="btn sub small">${u.active ? "停止する" : "再開する"}</button></form>
</td></tr>`).join("")}
</table>
<p class="muted">停止したアカウントはログインできなくなります（データは残ります）。一般ユーザーは自分が作ったキャンペーン・送信者・送信履歴だけが見えます。「営業お断り」の除外リストは安全のため全ユーザー共通で突合されます（画面に出るのは自分が登録した分だけです）。</p>`;
}

/** アップデート画面（管理者のみ） */
export function updateView(st: { current: string; latest?: string; notes?: string; available: boolean; configured: boolean; error?: string }, result?: { ok: boolean; log: string[]; version?: string; error?: string }): string {
  return `<h1>アップデート</h1>
${result ? `<div class="card" style="border-color:${result.ok ? "var(--ok)" : "var(--ng)"}">
<b>${result.ok ? `v${esc(result.version ?? "")} に更新しました` : `更新できませんでした: ${esc(result.error ?? "")}`}</b>
<pre style="white-space:pre-wrap;font-size:12px;margin:8px 0 0">${esc(result.log.join("\n"))}</pre>
${result.ok ? `<p class="muted">数秒後に自動で再起動します。画面が真っ白になったら、少し待ってから再読み込みしてください。</p>` : ""}
</div>` : ""}
<div class="card">
<table>
<tr><th style="width:170px">いま使っている版</th><td><b>v${esc(st.current)}</b></td></tr>
${st.configured ? `<tr><th>公開されている最新版</th><td>${st.latest ? `<b>v${esc(st.latest)}</b>` : "―"}</td></tr>` : ""}
${st.notes ? `<tr><th>更新内容</th><td>${esc(st.notes)}</td></tr>` : ""}
</table>
${st.error ? `<p style="color:var(--ng)">${esc(st.error)}</p>` : ""}
${!st.configured
  ? `<p class="muted">更新の確認先が設定されていません。配布元にお問い合わせください。<br>（設定する場合はフォルダ内の <code>update.json</code> の <code>manifest_url</code> を書き換えます）</p>`
  : st.available
    ? `<form method="post" action="/update"><p><button class="btn">v${esc(st.latest ?? "")} に更新する</button></p></form>
       <p class="muted">送信中のキャンペーンがあれば、先に一時停止してから実行してください。営業リスト・送信履歴・アカウントはそのまま残ります。</p>`
    : `<p class="muted">最新版です。</p>`}
<form method="post" action="/update/check" class="inline"><button class="btn sub">いま確認する</button></form>
</div>`;
}

/** ミニゲーム「アポスロット」＝ ネオアイムジャグラーEX 準拠のリール制御シミュレータ。
 *  利用者提供の筐体イラストを土台に、リール・停止ボタン・レバー・表示・GOGOランプを座標で重ねる
 *  （座標は元画像 967×1627 基準、--s で拡縮）。
 *  - 3リール各21コマ＝実機と同じ配列。最大4コマ引き込み・成立役以外は揃えない「蹴飛ばし」制御。
 *  - 図柄画像: 7=seven.png / BAR=bar.png / ベル=bell.png / ピエロ=pierrot.png（無い場合は絵文字で代替）。
 *    ブドウ🍇・チェリー🍒・リプレイ🔄 は絵文字（画像に差し替え可）。
 *  - GOGO!ランプが光ったら（ぺかったら）7を「目押し」で狙う。押し位置から4コマ以内なら引き込む。
 *  - BARと7が枠内に並べば「リーチ目」。BIG=7・7・7 / REG=7・7・BAR・BAR・BAR。
 *  - 内部抽選は設定6の65536分母テーブル。クレジットはフォーム送信数から（1送信=1枚、BET3）。 */
export function gameView(sentCount: number): string {
  return `<h1>🎰 アポスロット <span class="tag">おまけ</span></h1>
<p class="muted">フォーム送信が進むほどクレジットが貯まります（1送信=1枚・3枚で1回転）。仮想コインだけで、課金や実送信は一切ありません。ネオアイムジャグラーEX の配列・制御を再現した非公式ミニゲームです。</p>
<div id="cab">
  <img class="bg" src="/assets/game/cabinet.jpg" alt="" draggable="false">
  <div class="win">
    <div class="reel" id="r0"><div class="strip"></div></div>
    <div class="reel" id="r1"><div class="strip"></div></div>
    <div class="reel" id="r2"><div class="strip"></div></div>
    <div class="payline pl0"></div><div class="payline pl1"></div><div class="payline pl2"></div>
  </div>
  <div class="lamp" id="lamp"><img src="/assets/game/gogo.jpg" alt="GOGO!" draggable="false"></div>
  <div class="seg" id="credit" style="left:calc(322px*var(--s));width:calc(90px*var(--s))">0</div>
  <div class="seg" id="count" style="left:calc(432px*var(--s));width:calc(100px*var(--s))">0</div>
  <div class="seg" id="win" style="left:calc(552px*var(--s));width:calc(90px*var(--s))">0</div>
  <div class="betlamp" id="bl3" style="top:calc(476px*var(--s))"></div>
  <div class="betlamp" id="bl2" style="top:calc(542px*var(--s))"></div>
  <div class="betlamp" id="bl1" style="top:calc(607px*var(--s))"></div>
  <div class="replamp" id="replamp"></div>
  <button class="lever" id="lever" disabled title="レバー"></button>
  <button class="stopbtn" data-i="0" style="left:calc(339px*var(--s))" disabled></button>
  <button class="stopbtn" data-i="1" style="left:calc(444px*var(--s))" disabled></button>
  <button class="stopbtn" data-i="2" style="left:calc(546px*var(--s))" disabled></button>
</div>
<div class="gmsg" id="msg">…</div>
<div class="gctl"><button class="btn small" id="sync">送信数を反映</button> <span class="muted small">送信 <b id="sent">${sentCount}</b>件</span></div>
<div class="rules muted small" style="max-width:640px;margin:8px auto 0">
・BET 3枚／回・5ライン（上・中・下・斜め2本）・レバー＝左の黒いノブ、停止＝緑の3ボタン<br>
・<b>BIG</b> 7・7・7（純増+252）／<b>REG</b> 7・7・BAR または BAR・BAR・BAR（純増+96）<br>
・ブドウ×3=+8　・ベル×3=+10（要目押し）　・ピエロ×3=+10（要目押し）　・左リール🍒=角+2/中+1　・リプレイ×3=次回転BET不要<br>
・図柄は押した位置から<b>最大4コマ</b>まで滑って引き込む。成立していない役は揃わない。<br>
・<b>GOGO!ランプが光ったら（ぺかったら）7を目押し</b>で狙う。枠内に<b>BARと7が並んだらリーチ目</b>（ボーナス濃厚）。
</div>
<style>
#cab{position:relative;width:min(700px,100%);margin:0 auto;aspect-ratio:967/1627;user-select:none;--s:0.724}
#cab .bg{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:10px}
#cab .win{position:absolute;left:calc(183px*var(--s));top:calc(479px*var(--s));width:calc(607px*var(--s));height:calc(212px*var(--s));display:flex;gap:calc(10px*var(--s));background:#111;border-radius:calc(6px*var(--s));overflow:hidden}
#cab .reel{position:relative;flex:1;height:100%;overflow:hidden;background:#ffffff}
#cab .reel .strip{will-change:transform}
#cab .reel .cell{height:calc(70.67px*var(--s));display:flex;align-items:center;justify-content:center;font-size:calc(54px*var(--s));font-weight:900;line-height:1;color:#222}
#cab .reel .cell img{height:calc(62px*var(--s));width:auto;max-width:calc(180px*var(--s));object-fit:contain}
#cab .reel .cell img.s7{height:calc(70px*var(--s));width:auto;max-width:calc(140px*var(--s));object-fit:contain}
#cab .reel .cell img.sq{height:calc(70px*var(--s));width:auto;max-width:calc(74px*var(--s));object-fit:contain}
#cab .reel .cell img.bar{height:calc(58px*var(--s));width:auto;max-width:calc(165px*var(--s));object-fit:contain}
#cab .reel .cell img.bell{height:calc(50px*var(--s));width:auto;max-width:calc(96px*var(--s));object-fit:contain}
#cab .reel .cell .sbar{font-size:calc(22px*var(--s));letter-spacing:1px;background:#1c1c1c;color:#ff4a4a;padding:calc(6px*var(--s)) calc(12px*var(--s));border-radius:5px;font-weight:900}
#cab .reel.spinning .strip{filter:blur(1px)}
#cab .win .payline{position:absolute;left:0;right:0;height:calc(2px*var(--s));background:rgba(255,80,80,.0);pointer-events:none}
#cab .win .payline.pl0{top:calc(35px*var(--s))}#cab .win .payline.pl1{top:calc(106px*var(--s))}#cab .win .payline.pl2{top:calc(177px*var(--s))}
#cab .win.flash .payline{background:rgba(255,80,80,.85);box-shadow:0 0 calc(8px*var(--s)) #ff5050}
#cab .lamp{position:absolute;left:calc(84px*var(--s));top:calc(700px*var(--s));width:calc(156px*var(--s));height:calc(102px*var(--s));border-radius:calc(10px*var(--s));overflow:hidden;background:#000;border:calc(2px*var(--s)) solid #2a2a2a;transition:box-shadow .2s}
#cab .lamp img{width:100%;height:100%;object-fit:contain;filter:brightness(.16) saturate(.5) grayscale(.6);transition:filter .15s}
#cab .lamp.on{border-color:#ff5ce0;box-shadow:0 0 calc(22px*var(--s)) #ff5ce0,0 0 calc(50px*var(--s)) #6a5cff}
#cab .lamp.on img{filter:brightness(1.15) saturate(1.3);animation:lampflk .22s steps(2) infinite}
@keyframes lampflk{50%{filter:brightness(.65) saturate(1.2)}}
#cab .seg{position:absolute;top:calc(716px*var(--s));height:calc(46px*var(--s));background:#0b0b0d;border:calc(2px*var(--s)) solid #2b2b2b;border-radius:calc(6px*var(--s));display:flex;align-items:center;justify-content:center;font-family:"Menlo","Courier New",monospace;font-size:calc(30px*var(--s));color:#ff3b3b;text-shadow:0 0 calc(8px*var(--s)) #ff3b3b;font-variant-numeric:tabular-nums}
#cab .betlamp{position:absolute;left:calc(103px*var(--s));width:calc(46px*var(--s));height:calc(46px*var(--s));border-radius:50%;pointer-events:none;box-shadow:none;transition:box-shadow .15s}
#cab .betlamp.on{box-shadow:0 0 calc(18px*var(--s)) calc(6px*var(--s)) rgba(255,230,80,.85)}
#cab .replamp{position:absolute;left:calc(818px*var(--s));top:calc(536px*var(--s));width:calc(92px*var(--s));height:calc(36px*var(--s));border-radius:8px;pointer-events:none}
#cab .replamp.on{box-shadow:0 0 calc(16px*var(--s)) calc(4px*var(--s)) rgba(80,200,255,.9)}
#cab .lever{position:absolute;left:calc(201px*var(--s));top:calc(870px*var(--s));width:calc(70px*var(--s));height:calc(70px*var(--s));border-radius:50%;border:0;background:transparent;cursor:pointer;transition:transform .08s,box-shadow .15s}
#cab .lever:not(:disabled){box-shadow:0 0 calc(14px*var(--s)) calc(4px*var(--s)) rgba(255,255,140,.75);animation:leverpulse 1.2s ease-in-out infinite}
@keyframes leverpulse{50%{box-shadow:0 0 calc(6px*var(--s)) calc(2px*var(--s)) rgba(255,255,140,.4)}}
#cab .lever:active{transform:scale(.92)}
#cab .lever:disabled{cursor:default;background:rgba(0,0,0,.35);animation:none}
#cab .stopbtn{position:absolute;top:calc(864px*var(--s));width:calc(62px*var(--s));height:calc(62px*var(--s));border-radius:50%;border:0;background:transparent;cursor:pointer;transition:transform .08s,box-shadow .15s}
#cab .stopbtn:not(:disabled){box-shadow:0 0 calc(16px*var(--s)) calc(5px*var(--s)) rgba(90,255,120,.85)}
#cab .stopbtn:active{transform:scale(.9)}
#cab .stopbtn:disabled{cursor:default;background:rgba(0,0,0,.45)}
.gmsg{margin:10px 0 6px;text-align:center;font-weight:800;font-size:16px;min-height:22px;color:#1C1710}
.gmsg.eye{color:#c81e6e}.gmsg.big{color:#e11d48}
.gctl{text-align:center}
.rules .ico{width:18px;height:18px;vertical-align:-3px}
</style>
<script>
(() => {
  const cab = document.getElementById("cab");
  const setScale = () => cab.style.setProperty("--s", (cab.clientWidth / 967).toFixed(4));
  setScale(); addEventListener("resize", setScale);
  const N = 21, CELL = 70.67;

  // ===== リール配列（各21コマ, index0=コマ1）: 7/A(BAR)/G(ブドウ)/C(チェリー)/L(ベル)/P(ピエロ)/R(リプレイ) =====
  const REELS = [
    ["G","R","G","A","C","G","R","G","P","7","G","R","G","C","A","G","R","G","R","7","L"],
    ["P","C","G","A","R","C","G","L","R","C","G","A","R","C","G","L","R","C","G","7","R"],
    ["R","L","P","G","R","L","P","G","R","L","P","G","R","L","P","G","R","L","A","7","G"]
  ];
  const symAt = (reel, koma) => REELS[reel][((koma - 1) % N + N) % N];
  const winAt = (reel, pos) => [symAt(reel, pos), symAt(reel, pos - 1), symAt(reel, pos - 2)]; // [上,中,下]

  // ===== 役・ライン・配当 =====
  const LINES = { "上段":[0,0,0], "中段":[1,1,1], "下段":[2,2,2], "右下がり":[0,1,2], "右上がり":[2,1,0] };
  const PAY = { GR:8, BE:10, PI:10, CH:1, MC:1, RE:0, BIG:0, REG:0 };
  const PRIORITY = ["RE","GR","MC","BIG","REG","CH","BE","PI"];
  function evalWindow(a, b, c) {
    const wa = winAt(0,a), wb = winAt(1,b), wc = winAt(2,c), out = [];
    for (const name in LINES) {
      const ln = LINES[name], L = wa[ln[0]], M = wb[ln[1]], R = wc[ln[2]];
      if (L === "C") out.push([name === "中段" ? "MC" : "CH", name]);
      else if (L === "7" && M === "7" && R === "7") out.push(["BIG", name]);
      else if (L === "7" && M === "7" && R === "A") out.push(["REG", name]); // REGは7・7・BARのみ（BAR3つはボーナスにしない）
      else if (L === M && M === R && L === "G") out.push(["GR", name]);
      else if (L === M && M === R && L === "L") out.push(["BE", name]);
      else if (L === M && M === R && L === "P") out.push(["PI", name]);
      else if (L === M && M === R && L === "R") out.push(["RE", name]);
    }
    return out;
  }

  // ===== 逐次リール制御（最大4コマ・蹴飛ばし・先読み） =====
  const MAX_SLIP = 4;
  function makeSpin(allowed) {
    const set = {}; allowed.forEach((r) => set[r] = true);
    const goals = PRIORITY.filter((r) => set[r]);
    const stopped = [null, null, null], slip = [null, null, null];
    const legalFull = (a, b, c) => evalWindow(a, b, c).every((e) => set[e[0]]);
    function exists(fixed, pred) {
      const rem = [0,1,2].filter((i) => fixed[i] == null), pos = fixed.slice();
      const rec = (k) => {
        if (k === rem.length) return legalFull(pos[0], pos[1], pos[2]) && pred(pos);
        for (let q = 1; q <= N; q++) { pos[rem[k]] = q; if (rec(k + 1)) return true; }
        pos[rem[k]] = null; return false;
      };
      return rec(0);
    }
    function stop(reel, press) {
      let best = null;
      for (let s = 0; s <= MAX_SLIP; s++) {
        const q = ((press - 1 + s) % N) + 1, fixed = stopped.slice(); fixed[reel] = q;
        const feas = exists(fixed, () => true) ? 1 : 0;
        const rc = goals.map((g) => exists(fixed, (f) => evalWindow(f[0], f[1], f[2]).some((e) => e[0] === g)) ? 1 : 0);
        const score = [feas].concat(rc).concat([-s]);
        if (best === null || cmpArr(score, best.score) > 0) best = { score: score, q: q, s: s };
      }
      stopped[reel] = best.q; slip[reel] = best.s; return best.q;
    }
    return { stop: stop, stopped: stopped, slip: slip, result: () => ({ final: stopped.slice(), formed: evalWindow(stopped[0], stopped[1], stopped[2]) }) };
  }
  function cmpArr(x, y) { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; }

  // ===== 設定6 内部抽選（65536分母） =====
  const LOT = [["BIG",171],["CH_BIG",84],["MID_BIG",2],["REG",180],["CH_REG",77],["GRAPE",11338],["CHERRY",1840],["PIERROT",60],["BELL",60],["REPLAY",8980]];
  const FLAG = { BIG:["BIG"], CH_BIG:["CH","BIG"], MID_BIG:["MC","BIG"], REG:["REG"], CH_REG:["CH","REG"], GRAPE:["GR"], CHERRY:["CH"], PIERROT:["PI"], BELL:["BE"], REPLAY:["RE"], HAZURE:[] };
  function drawFlag() {
    let r = Math.floor(Math.random() * 65536), acc = 0;
    for (const [k, n] of LOT) { acc += n; if (r < acc) return k; }
    return "HAZURE";
  }

  // ===== 図柄描画（画像・無ければ絵文字） =====
  function draw(code) {
    if (code === "7") return '<img class="s7" src="/assets/game/seven.png" alt="7" data-fb="7" onerror="sfb(this)" draggable="false">';
    if (code === "A") return '<img class="bar" src="/assets/game/bar.png" alt="BAR" data-fb="BAR" onerror="sfb(this)" draggable="false">';
    if (code === "L") return '<img class="bell" src="/assets/game/bell.png" alt="ベル" data-fb="🔔" onerror="sfb(this)" draggable="false">';
    if (code === "P") return '<img src="/assets/game/pierrot.png" alt="ピエロ" data-fb="🤡" onerror="sfb(this)" draggable="false">';
    if (code === "G") return '<img class="sq" src="/assets/game/batta.png" alt="ブドウ" draggable="false">'; // ブドウ図柄は従来どおり batta.png（四角図柄は大きめ表示）
    if (code === "C") return "🍒"; return '<img class="sq" src="/assets/game/hatch.png" alt="リプレイ" draggable="false">'; // R=リプレイ（従来の蜂図柄）
  }
  window.sfb = function (img) { const fb = img.getAttribute("data-fb"); const sp = document.createElement("span"); sp.className = fb === "BAR" ? "sbar" : "fb"; sp.textContent = fb; img.replaceWith(sp); };

  // ===== クレジット =====
  const KEY = "aposlot-nij1";
  const sent = ${Number(sentCount) || 0};
  let st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  let credit = Number(st.credit) || 0, synced = Number(st.synced) || 0, games = Number(st.games) || 0, freeSpin = false;
  const FREE_PLAY = true; // テスト中: クレジット無限（本番に戻すときは false）
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ credit: credit, synced: synced, games: games })); } catch {} };
  const syncSends = () => { if (sent > synced) { const d = sent - synced; credit += d; synced = sent; save(); return d; } return 0; };

  const $ = (id) => document.getElementById(id);
  const reels = [0,1,2].map((i) => $("r" + i));
  const strips = reels.map((r) => r.querySelector(".strip"));
  const stopBtns = [].slice.call(document.querySelectorAll(".stopbtn"));

  // ===== 音（Web Audio・先頭無音カット） =====
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = AC ? new AC() : null, bufs = {};
  async function loadSnd(name, url) {
    if (!actx) return;
    try { const buf = await actx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const ch = buf.getChannelData(0); let i = 0; while (i < ch.length && Math.abs(ch[i]) < 0.02) i++;
      bufs[name] = { buf: buf, off: Math.max(0, i / buf.sampleRate - 0.005) };
    } catch (e) {}
  }
  function play(name) { const b = bufs[name]; if (!actx || !b) return; if (actx.state === "suspended") actx.resume();
    const src = actx.createBufferSource(); src.buffer = b.buf; src.connect(actx.destination); src.start(0, b.off); }
  ["spin","stop","bonus","bgm","grape","replay","tenpai","cherry"].forEach((n) => loadSnd(n, "/assets/game/" + n + ".mp3"));
  let loopSrc = null;
  function stopLoop() { if (loopSrc) { try { loopSrc.stop(); } catch (e) {} loopSrc = null; } }
  document.addEventListener("pointerdown", () => { if (actx && actx.state === "suspended") actx.resume(); }, { once: true });

  // ===== リール描画（下ほどコマ番号が小さい＝上→下に流れる） =====
  const s = () => parseFloat(getComputedStyle(cab).getPropertyValue("--s")) || 0.724;
  const topK = [21, 14, 7];        // 各リールの現在の上段コマ番号（float）
  const spinning = [false,false,false], targetK = [null,null,null];
  function buildStrip(i) { let h = ""; for (let j = 0; j < N * 2; j++) { const koma = N - (j % N); h += '<div class="cell">' + draw(symAt(i, koma)) + "</div>"; } strips[i].innerHTML = h; }
  function render(i) { const f = ((topK[i] % N) + N) % N; const off = ((N - f) % N) * CELL * s(); strips[i].style.transform = "translateY(" + (-off) + "px)"; }
  [0,1,2].forEach((i) => { buildStrip(i); render(i); });
  let last = 0;
  function loop(t) {
    const dt = Math.min(40, t - last) / 1000; last = t;
    for (let i = 0; i < 3; i++) {
      if (!spinning[i]) continue;
      if (targetK[i] === null) { topK[i] += (24 + i * 2) * dt; }         // 自由回転（上→下, 目押しと滑りの見え方のバランス）
      else {
        const goal = targetK[i]; let cur = topK[i];
        const dist = ((goal - cur) % N + N) % N;                        // 下方向に進んで目標へ
        const step = Math.max(16, dist * 24) * dt;                      // キビキビ止める（引き込みを素早く）
        if (dist <= step || dist < 0.02) { topK[i] = goal; spinning[i] = false; reels[i].classList.remove("spinning"); render(i); onStopped(); continue; }
        topK[i] = cur + step;
      }
      topK[i] = ((topK[i] % N) + N) % N; if (topK[i] === 0) topK[i] = N;
      render(i);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ===== 進行 =====
  let spin = null, pending = null, lampOn = false, lastWin = 0;
  const say = (m, cls) => { const el = $("msg"); el.textContent = m; el.className = "gmsg" + (cls ? " " + cls : ""); };
  const betLamps = (on) => ["bl1","bl2","bl3"].forEach((id) => $(id).classList.toggle("on", on));
  function paint() {
    $("credit").textContent = FREE_PLAY ? "∞" : credit; $("count").textContent = games; $("win").textContent = lastWin; $("sent").textContent = sent;
    $("lever").disabled = spinning.some(Boolean) || (!FREE_PLAY && !freeSpin && credit < 3);
    $("replamp").classList.toggle("on", freeSpin);
    $("lamp").classList.toggle("on", lampOn);
  }
  $("sync").onclick = () => { const d = syncSends(); paint(); say(d > 0 ? "送信 " + d + " 件ぶんのクレジットを追加しました" : "新しい送信はありません（送信すると1件=1枚貯まります）"); };
  const first = syncSends(); paint();
  say(FREE_PLAY ? "テストモード: 無限に回せます。レバー（左の黒いノブ）で回そう！" : "レバー（左の黒いノブ）で回そう！");

  $("lever").onclick = () => {
    if (spinning.some(Boolean)) return;
    if (!FREE_PLAY && !freeSpin) { if (credit < 3) { say("クレジット不足。フォーム送信3件で1回転です"); return; } credit -= 3; }
    stopLoop(); freeSpin = false; lastWin = 0; games++; save(); betLamps(true);
    $("cab").querySelector(".win").classList.remove("flash");

    // 内部抽選（持ち越し中はボーナス抽選しない）
    let flag = drawFlag(); let roles = FLAG[flag].slice();
    let cherryPeka = false;
    if (pending) { roles = roles.filter((r) => r !== "BIG" && r !== "REG"); if (roles.length === 1 && roles[0] === "MC") roles = ["CH"]; }
    // チェリー重複・中段チェリーはボーナス確定＝ペカリ確定（先ペカ）。単独ボーナスは25%で先告知
    else if (flag === "BIG" || flag === "CH_BIG" || flag === "MID_BIG") { pending = "BIG"; cherryPeka = (flag === "CH_BIG" || flag === "MID_BIG"); lampOn = cherryPeka || Math.random() < 0.25; }
    else if (flag === "REG" || flag === "CH_REG") { pending = "REG"; cherryPeka = (flag === "CH_REG"); lampOn = cherryPeka || Math.random() < 0.25; }
    const allowed = roles.concat(pending ? [pending] : []);
    spin = makeSpin(allowed);

    paint();
    if (lampOn && cherryPeka) say("🍒✨ チェリー重複！ ペカリ確定！ 7を目押しで狙え", "big");
    else if (lampOn) say("✨ GOGO!ランプ点灯！ 7を目押しで狙え（左は7を上段、中・右は7を中段あたり）", "big");
    else if (pending) say("… なにか引いたかも？ 緑ボタンで止めよう");
    else say("緑のボタンで止めよう");
    play("spin");
    for (let i = 0; i < 3; i++) { targetK[i] = null; spinning[i] = true; reels[i].classList.add("spinning"); }
    stopBtns.forEach((b) => (b.disabled = false));
    $("lever").disabled = true;
  };

  stopBtns.forEach((btn) => btn.onclick = () => {
    const i = Number(btn.dataset.i);
    if (!spinning[i] || targetK[i] !== null) return;
    btn.disabled = true; play("stop");
    const press = ((Math.round(topK[i]) - 1) % N + N) % N + 1; // 押した瞬間の上段コマ
    targetK[i] = spin.stop(i, press);
  });

  function onStopped() {
    const done = [0,1,2].every((i) => !spinning[i] && targetK[i] !== null);
    // 7テンパイ音: 止まった2リールが「同じ有効ライン上で」ともに7のときだけ（残り1リールで777が狙える形）
    const stoppedIdx = [0,1,2].filter((i) => !spinning[i] && targetK[i] !== null);
    if (!done && stoppedIdx.length === 2) {
      const i = stoppedIdx[0], j = stoppedIdx[1]; let sevenTenpai = false;
      for (const name in LINES) { const ln = LINES[name];
        if (winAt(i, targetK[i])[ln[i]] === "7" && winAt(j, targetK[j])[ln[j]] === "7") { sevenTenpai = true; break; } }
      if (sevenTenpai) play("tenpai");
    }
    if (done) judge();
  }

  function judge() {
    const res = spin.result(), formed = res.formed;
    let payout = 0, rep = false, notes = [];
    const label = { GR:"ブドウ", BE:"ベル", PI:"ピエロ", CH:"🍒チェリー", MC:"🍒中段チェリー" };
    for (const [role, line] of formed) {
      if (role === "RE") { rep = true; }
      else if (role === "BIG" || role === "REG") { /* ボーナス揃いは下で処理 */ }
      else { payout += PAY[role]; if (label[role] && notes.indexOf(label[role]) < 0) notes.push(label[role]); }
    }
    // リーチ目: 同じ有効ライン上に7とBARが「並んだ」とき（枠内にバラバラにあるだけでは出さない）
    let hasEye = false;
    for (const name in LINES) { const ln = LINES[name];
      const line = [winAt(0, targetK[0])[ln[0]], winAt(1, targetK[1])[ln[1]], winAt(2, targetK[2])[ln[2]]];
      if (line.indexOf("7") >= 0 && line.indexOf("A") >= 0) { hasEye = true; break; } }

    const bonusHit = pending && formed.some((e) => e[0] === pending);
    if (bonusHit) {
      const net = pending === "BIG" ? 252 : 96;
      payout += net; lastWin = payout; credit += payout;
      $("cab").querySelector(".win").classList.add("flash"); play("bonus");
      say((pending === "BIG" ? "🎉 BIG BONUS！ 純増+252" : "🎉 REG BONUS！ 純増+96") + (notes.length ? "（" + notes.join("・") + "）" : ""), "big");
      pending = null; lampOn = false;
    } else {
      lastWin = payout; credit += payout; if (rep) freeSpin = true;
      if (pending) {
        // 内部中でボーナスは未揃い
        if (!lampOn) lampOn = true; // 後告知: 全停止後に点灯
        if (hasEye) { say("👀 リーチ目！ BARと7が並んだ…ボーナス濃厚！ 次回転から7を目押し", "eye"); }
        else if (notes.length) say(notes.join("・") + " ＋" + payout + "　（GOGO!点灯中：7を狙え）", "big");
        else say("リーチ目っぽい…（GOGO!点灯中：7を目押しで狙え）", "eye");
      } else {
        say(notes.length ? "🎉 " + notes.join(" / ") + "　＋" + payout + (rep ? "" : "枚") : "ハズレ… 次いこう");
      }
    }
    save(); paint(); betLamps(false);
    // 効果音
    if (bonusHit) play("bgm");
    else if (notes.some((n) => n.indexOf("ブドウ") >= 0)) play("grape");
    else if (rep) play("replay");
    else if (notes.some((n) => n.indexOf("チェリー") >= 0)) play("cherry");
  }
})();
</script>`;
}
