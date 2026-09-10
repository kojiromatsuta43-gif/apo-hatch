// 画面のHTML。BRIDGE HATCH の配色（honey-400 #FFC62E / hive-900 #1C1710）に合わせてある。
import { STATUS_LABEL, OUTCOME_LABEL, type Campaign, type Job, type SenderProfile, type JobStatus } from "./db.js";
import type { Lint } from "./message.js";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type NavUser = { username: string; display_name: string; role: string } | null;

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
.bar{height:16px;background:var(--honey-50);border:1px solid var(--hive-200);border-radius:999px;overflow:hidden;margin:8px 0 4px;max-width:560px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--honey),#7CB342);border-radius:999px;transition:width .6s ease}
tr.hl td{background:var(--honey-50)}tr.hl td:first-child{box-shadow:inset 3px 0 0 var(--honey)}
</style></head><body>
<header><a class="logo" href="/"><svg class="hatch" viewBox="0 0 48 48" width="22" height="22" role="img" aria-label="ハッチくん"><path d="M20 14C18.5 9 16 7.5 13.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28 14C29.5 9 32 7.5 34.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.8" cy="6.4" r="2.4" fill="#1C1710"/><circle cx="35.2" cy="6.4" r="2.4" fill="#1C1710"/><ellipse cx="9.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(-24 9.5 20)"/><ellipse cx="38.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(24 38.5 20)"/><rect x="13" y="13" width="22" height="29" rx="11" fill="#FFC62E" stroke="#1C1710" stroke-width="2"/><rect x="13" y="27.5" width="22" height="4.6" fill="#1C1710"/><rect x="13" y="36" width="22" height="4.6" fill="#1C1710"/><circle cx="19.6" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="28.4" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="20.4" cy="20.7" r=".8" fill="#fff"/><circle cx="29.2" cy="20.7" r=".8" fill="#fff"/></svg> アポハッチくん</a><span class="brandsub">フォーム＆メール営業</span>${user ? `<a href="/">キャンペーン</a><a href="/senders">送信者</a><a href="/suppressions">除外リスト</a><a href="/settings">設定</a>${user.role === "admin" ? `<a href="/users">ユーザー管理</a>` : ""}${user.role === "admin" && updateReady ? `<a class="upd" href="/update">新しい版があります</a>` : ""}<span class="who">${esc(user.display_name || user.username)}${user.role === "admin" ? "（管理者）" : ""}</span><a class="sub" href="/password">パスワード</a><a class="sub" href="/logout">ログアウト</a>` : ""}</header>
<main>${flash ? `<div class="flash">${esc(flash)}</div>` : ""}${body}</main></body></html>`;
}

export function statusTag(s: JobStatus) {
  const cls = s === "sent" ? "sent" : s === "failed" ? "failed" : s === "queued" ? "queued" : s === "sending" ? "sending" : "skip";
  return `<span class="tag ${cls}">${STATUS_LABEL[s] ?? s}</span>`;
}

export function campaignListView(rows: (Campaign & { sender_label: string; total: number; sent: number; queued: number })[], provider: string) {
  return `<h1>キャンペーン</h1>
<p class="muted"><b>キャンペーン</b>＝「この文面で、この会社たちに、この送り方で送る」という送信のまとまり1件です。商材ごと・ターゲットごとに分けて作ると、反応率を比べられます。</p>
<p class="muted">AIプロバイダ: <b>${esc(provider)}</b>${provider === "none" ? "（APIキー未設定。テンプレートのみで動きます）" : ""}</p>
<p><a class="btn" href="/campaigns/new">＋ 新しいキャンペーン</a></p>
<table><tr><th>ID</th><th>名前</th><th>送信者</th><th>モード</th><th>状態</th><th>件数</th><th>送信済</th><th>待機</th><th></th></tr>
${rows.map((c) => `<tr><td>${c.id}</td><td><a href="/campaigns/${c.id}">${esc(c.name)}</a></td><td>${esc(c.sender_label)}</td><td>${c.mode}</td><td>${c.status}</td><td>${c.total}</td><td>${c.sent}</td><td>${c.queued}</td><td><a class="btn sub small" href="/campaigns/${c.id}">開く</a></td></tr>`).join("")}
</table>`;
}

export function senderForm(s?: Partial<SenderProfile>) {
  const v = (k: keyof SenderProfile) => esc(s?.[k] ?? "");
  return `<form method="post" action="/senders${s?.id ? `/${s.id}` : ""}">
<div class="row"><div><label>ラベル（管理用）</label><input type="text" name="label" value="${v("label")}" placeholder="社内用 / ○○社用" required></div><div><label>会社名 *</label><input type="text" name="company" value="${v("company")}" required></div></div>
<div class="row"><div><label>業種</label><input type="text" name="industry" value="${v("industry")}"></div><div><label>担当者名 *（姓と名の間にスペース）</label><input type="text" name="person" value="${v("person")}" placeholder="松田 幸次郎" required></div></div>
<div class="row"><div><label>担当者名ふりがな（カタカナ、姓 名）</label><input type="text" name="person_kana" value="${v("person_kana")}" placeholder="マツダ コウジロウ"></div><div><label>メール *（フォームに入力するアドレス）</label><input type="email" name="email" value="${v("email")}" required></div></div>
<div class="row"><div><label>返信受付メール（本文に載せる。空なら上と同じ）</label><input type="email" name="reply_email" value="${v("reply_email")}"></div><div><label>電話（ハイフン区切り）</label><input type="text" name="tel" value="${v("tel")}" placeholder="03-1234-5678"></div></div>
<div class="row3"><div><label>郵便番号</label><input type="text" name="postal" value="${v("postal")}" placeholder="114-0001"></div><div><label>住所（都道府県から）</label><input type="text" name="address" value="${v("address")}"></div><div><label>自社URL</label><input type="url" name="url" value="${v("url")}"></div></div>
<h2>メールで送る場合の設定（任意。フォームだけなら不要）</h2>
<p class="muted">Googleアカウントで2段階認証をオンにし「アプリパスワード」を発行して貼り付けてください。営業専用のアドレスを使うのが安全です（無料Gmailは1日500通、Workspaceは2,000通まで）。</p>
<div class="row3"><div><label>送信用メールアドレス（Gmail等）</label><input type="text" name="smtp_user" value="${v("smtp_user")}" placeholder="sales@example.co.jp"></div><div><label>アプリパスワード（保存済みなら空のまま）</label><input type="password" name="smtp_pass" value="" placeholder="xxxx xxxx xxxx xxxx" autocomplete="off"></div><div><label>差出人として表示するアドレス（空なら左と同じ）</label><input type="text" name="from_email" value="${v("from_email")}"></div></div>
<details class="small muted"><summary>Gmail以外のメールサーバー</summary><div class="row"><div><label>SMTPホスト</label><input type="text" name="smtp_host" value="${esc(s?.smtp_host ?? "smtp.gmail.com")}"></div><div><label>ポート（465 or 587）</label><input type="number" name="smtp_port" value="${esc(s?.smtp_port ?? 465)}"></div></div></details>
<p><button class="btn">保存</button>${s?.id ? ` <button class="btn sub" formaction="/senders/${s.id}/test" formmethod="post">メール設定を確認</button>` : ""}</p></form>`;
}

export function sendersView(list: SenderProfile[]) {
  return `<h1>送信者プロフィール</h1><p class="muted">フォームに入力される「差出人」です。クライアントの送信はクライアント自身の名義で行います。</p>
<table><tr><th>ID</th><th>ラベル</th><th>会社</th><th>担当者</th><th>メール</th><th>メール送信</th><th></th></tr>
${list.map((s) => `<tr><td>${s.id}</td><td>${esc(s.label)}</td><td>${esc(s.company)}</td><td>${esc(s.person)}</td><td>${esc(s.email)}</td><td class="small">${s.smtp_user && s.smtp_pass ? `Gmail等（${esc(s.smtp_user)}）` : "未設定（フォームのみ）"}</td><td><a class="btn sub small" href="/senders/${s.id}">編集</a></td></tr>`).join("")}
</table><h2>新規追加</h2><div class="card">${senderForm()}</div>`;
}

export function campaignForm(senders: SenderProfile[], defaults: Partial<Campaign>, provider: string) {
  const d = (k: keyof Campaign, fb: unknown = "") => esc(defaults[k] ?? fb);
  return `<h1>新しいキャンペーン</h1>
<form method="post" action="/campaigns" class="card">
<div class="row"><div><label>キャンペーン名</label><input type="text" name="name" required placeholder="福岡 飲食 9月"></div>
<div><label>送信者</label><select name="sender_id" required>${senders.map((s) => `<option value="${s.id}">${esc(s.label)}（${esc(s.company)} ${esc(s.person)}）</option>`).join("")}</select>${senders.length ? "" : '<p class="muted">先に<a href="/senders">送信者</a>を登録してください</p>'}</div></div>
<label>配信チャネル</label>
<select name="channel">
<option value="both" ${d("channel") === "form" || d("channel") === "email" ? "" : "selected"}>フォーム優先、フォームが無い会社にはメール（おすすめ）</option>
<option value="form" ${d("channel") === "form" ? "selected" : ""}>フォームのみ</option>
<option value="email" ${d("channel") === "email" ? "selected" : ""}>メールのみ</option>
</select>
<label>文面モード</label>
<select name="mode">
<option value="hybrid" ${d("mode") === "ai" || d("mode") === "template" ? "" : "selected"}>ハイブリッド（テンプレの {{AI冒頭}} だけ企業ごとにAI生成）— おすすめ</option>
<option value="template">テンプレートのみ（差し込みだけ・AI不使用）</option>
<option value="ai">全文AI生成（テンプレは「伝えたいこと」として参照）</option>
</select>
${provider === "none" ? '<p class="muted">AIのAPIキーが無いので、ハイブリッド／AIを選んでもテンプレートとして送られます。</p>' : ""}
<label>件名（件名欄があるフォーム用）</label><input type="text" name="subject_text" value="${d("subject_text", "ショート動画制作サービスのご案内")}">
<label>本文テンプレート</label>
<p class="muted">使える差し込み: {{会社名}} {{代表者}}（無ければ「ご担当者様」） {{業種}} {{都道府県}} {{自社名}} {{担当者}} {{自社メール}} {{自社電話}} {{自社URL}} {{AI冒頭}}</p>
<textarea name="template_text" style="min-height:320px">${d("template_text")}</textarea>
<label>AIへの追加指示（任意）</label><input type="text" name="ai_instruction" value="${d("ai_instruction")}" placeholder="例: 採用課題に寄せる／飲食店向けに集客の話をする">
<div class="row3"><div><label>1日の上限（フォーム／メール）</label><div class="row"><input type="number" name="daily_limit" value="${d("daily_limit", 300)}"><input type="number" name="email_daily_limit" value="${d("email_daily_limit", 100)}"></div></div><div><label>送信時間帯（開始・終了 時）</label><div class="row"><input type="number" name="send_window_start" value="${d("send_window_start", 9)}" min="0" max="23"><input type="number" name="send_window_end" value="${d("send_window_end", 18)}" min="1" max="24"></div></div><div><label>平日のみ</label><select name="weekdays_only"><option value="1">はい</option><option value="0">土日も送る</option></select></div></div>
<div class="row3"><div><label>同じ会社への再送を止める期間（日・0で制限なし）</label><input type="number" name="resend_days" value="${d("resend_days", 90)}" min="0"></div><div><label>「営業お断り」のサイト</label><select name="ignore_refusal"><option value="0">送らない（推奨）</option><option value="1">送る（クレームの恐れあり）</option></select></div><div></div></div>
<p><button class="btn">作成する</button></p></form>`;
}

/** CSV取込の結果。何件入ったかだけでなく、除外された会社名まで出す */
function importReport(r: import("./csv.js").ImportSummary): string {
  const skipped = r.excludedRows;
  return `<div class="flash" style="margin-top:12px">登録 <b>${r.added}</b>件（フォーム${r.addedForm}・メール${r.addedEmail}） / 送らない <b>${r.excluded + r.suppressed + r.duplicated + r.noUrl}</b>件</div>
${skipped.length ? `<details open style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">送らない会社 ${skipped.length}件の内訳</summary>
<table style="margin-top:6px"><tr><th>会社名</th><th>理由</th><th>送信先</th></tr>
${skipped.map((x) => `<tr><td>${esc(x.company)}</td><td class="small">${esc(x.reason)}</td><td class="small">${esc((x.where || "").slice(0, 60))}</td></tr>`).join("")}
</table></details>` : ""}`;
}

export function campaignView(c: Campaign & { sender: SenderProfile }, jobs: Job[], counts: Record<string, number>, running: boolean, provider: string, extra: { preview?: { job: Job; subject: string; message: string; aiUsed: boolean; lint?: Lint[] } | null; windowOk: boolean; sentToday: number; emailSentToday: number; scanning: boolean; unscanned: number; scanned: number; outcomes: Record<string, number>; lastImport?: import("./csv.js").ImportSummary | null }) {
  const cnt = (s: string) => counts[s] ?? 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // 進捗バー用: 事前チェックは「チェック済み/対象」、本送信は「処理済み/全件」
  const scanTotal = extra.scanned + extra.unscanned;
  const scanPct = scanTotal ? Math.round((extra.scanned / scanTotal) * 100) : 0;
  const processed = total - cnt("queued");
  const sendPct = total ? Math.round((processed / total) * 100) : 0;
  return `<h1>${esc(c.name)} <span class="tag">${c.status}</span> ${running ? '<span class="tag sending">実行中</span>' : ""}</h1>
<p class="muted">送信者: ${esc(c.sender.company)} ${esc(c.sender.person)} / チャネル: ${c.channel === "both" ? "フォーム優先＋メール" : c.channel === "email" ? "メールのみ" : "フォームのみ"} / モード: ${c.mode} / AI: ${esc(provider)} / 時間帯 ${c.send_window_start}〜${c.send_window_end}時${c.weekdays_only ? "（平日）" : ""} / 上限 フォーム${c.daily_limit}・メール${c.email_daily_limit}/日（本日 ${extra.sentToday}・${extra.emailSentToday}） ${extra.windowOk ? "" : "<b style='color:var(--warn)'>いまは送信時間帯外</b>"}</p>
<div class="stats"><div class="stat">全件<b>${total}</b></div><div class="stat">待機<b>${cnt("queued")}</b></div><div class="stat">送信済<b style="color:var(--ok)">${cnt("sent")}</b></div><div class="stat">失敗<b style="color:var(--ng)">${cnt("failed")}</b></div><div class="stat">フォーム無し<b>${cnt("skip_no_form")}</b></div><div class="stat">お断り<b>${cnt("skip_refused")}</b></div><div class="stat">CAPTCHA<b>${cnt("skip_captcha")}</b></div><div class="stat">除外/重複<b>${cnt("skip_suppressed") + cnt("skip_duplicate") + cnt("skip_optout")}</b></div><div class="stat">反応<b class="small">返信${extra.outcomes.replied ?? 0}／アポ${extra.outcomes.appointment ?? 0}／断り${extra.outcomes.declined ?? 0}</b>${cnt("sent") ? `<span class="muted">反応率 ${((((extra.outcomes.replied ?? 0) + (extra.outcomes.appointment ?? 0)) / cnt("sent")) * 100).toFixed(1)}%</span>` : ""}</div></div>

<div class="card"><h2 style="margin-top:0">1. リストを取り込む</h2>
<form method="post" action="/campaigns/${c.id}/import" enctype="multipart/form-data"><input type="file" name="csv" accept=".csv,text/csv" required> <button class="btn sub">CSVを取り込む</button>
<p class="muted">企業DBの書き出し（企業名 / 問い合わせフォーム / 企業URL / 大業界 / 小業界 / 都道府県 / 代表者名）をそのまま読めます。同一ドメイン・再送禁止期間内・除外リスト・官公庁等は自動で振り分けます。</p></form>
${extra.lastImport ? importReport(extra.lastImport) : ""}</div>

<div class="card"><h2 style="margin-top:0">1-b. 事前チェック（送る前に連絡先を確認）${extra.scanning ? '<span class="tag sending"><span class="spin"></span>チェック中</span>' : extra.unscanned === 0 && extra.scanned > 0 ? '<span class="tag sent">チェック完了</span>' : ""}</h2>
<p class="muted">送らずに各社のサイトを見て、フォームの有無・営業お断り・CAPTCHAを先に判定し、サイトのメールアドレスを拾います。フォームが無い会社はメールに自動で切り替わります（チャネルが「フォーム優先＋メール」のとき）。1社5〜10秒。</p>
${scanTotal > 0 ? `<div class="bar"><i id="scanfill" style="width:${scanPct}%"></i></div><div class="small muted" id="scantext">${extra.scanned} / ${scanTotal} 社チェック済み（${scanPct}%）</div>` : ""}
${extra.scanning ? `<form method="post" action="/campaigns/${c.id}/stop-scan" class="inline"><button class="btn danger">チェックを止める</button></form>` : `<form method="post" action="/campaigns/${c.id}/scan" class="inline"><button class="btn sub" ${extra.unscanned === 0 || running ? "disabled" : ""}>事前チェックを実行（未チェック ${extra.unscanned}社）</button></form>`}</div>

<div class="card"><h2 style="margin-top:0">2. 文面を確認する</h2>
<form method="post" action="/campaigns/${c.id}/preview" class="inline"><button class="btn sub">先頭の1社で文面をプレビュー</button></form>
${extra.preview ? `<p class="muted">${esc(extra.preview.job.company_name)}（${esc(extra.preview.job.industry)}）向け ${extra.preview.aiUsed ? "・AI生成あり" : "・テンプレのみ"}</p><p><b>件名:</b> ${esc(extra.preview.subject)}</p>${(extra.preview.lint ?? []).map((l) => `<div class="small" style="color:${l.level === "error" ? "var(--ng)" : "var(--warn)"}">${l.level === "error" ? "✕" : "△"} ${esc(l.text)}</div>`).join("")}<pre>${esc(extra.preview.message)}</pre>` : ""}
</div>

<div class="card"><h2 style="margin-top:0">3. テスト送信（自社のフォームに送って動作確認）</h2>
<p class="muted">テストの入力欄と履歴は専用ページに分けました。テスト送信は本送信の件数には含まれません。</p>
<a class="btn sub" href="/campaigns/${c.id}/test">テスト送信ページを開く</a></div>

<div class="card"><h2 style="margin-top:0">4. 本送信</h2>
${total > 0 ? `<div class="bar"><i id="sendfill" style="width:${sendPct}%"></i></div><div class="small muted" id="sendtext">処理済み ${processed} / ${total} 社（${sendPct}%）</div>` : ""}
${running ? `<form method="post" action="/campaigns/${c.id}/pause" class="inline"><button class="btn danger">一時停止</button></form>` : `<form method="post" action="/campaigns/${c.id}/start" class="inline"><button class="btn">開始する（${cnt("queued")}件）</button> <label class="inline small"><input type="checkbox" name="ignore_window" value="1"> 時間帯を無視して今すぐ送る</label></form>`}
<a class="btn sub" href="/campaigns/${c.id}/export.csv">結果をCSVで書き出す</a> <a class="btn sub" href="/campaigns/${c.id}/manual.csv">手動送信リスト（CAPTCHA・失敗分をURL＋文面つきで）</a>
<p class="muted">実行中は進捗バーが自動で動き、終わると自動でページが切り替わります。ワーカーを別プロセスで動かす場合は <code>npm run worker</code>。</p></div>

<h2>送信一覧（最新200件）</h2>
<p class="muted">背景が黄色の行は、前回このページを見たあとに状況が更新された会社です。</p>
<table><tr><th>ID</th><th>会社</th><th>送り方</th><th>業種</th><th>状態</th><th>結果</th><th>反応</th><th>更新</th><th></th></tr>
${jobs.map((j) => `<tr data-u="${esc(j.updated_at ?? "")}"><td>${j.id}${j.is_test ? " <span class='tag'>test</span>" : ""}</td><td><a href="/jobs/${j.id}">${esc(j.company_name)}</a><br><span class="muted">${esc(j.domain)}</span></td><td class="small">${j.channel === "email" ? "✉ メール" : "📝 フォーム"}</td><td class="small">${esc(j.sub_industry || j.industry)}</td><td>${statusTag(j.status)}</td><td class="small">${esc((j.result_text || "").split("\n")[0].slice(0, 70))}</td><td class="small">${j.outcome ? `<b>${esc(OUTCOME_LABEL[j.outcome] ?? j.outcome)}</b>` : ""}</td><td class="small">${esc(j.sent_at ?? "")}</td><td>${j.status === "failed" || j.status === "skip_no_form" ? `<form method="post" action="/jobs/${j.id}/retry" class="inline"><button class="btn sub small">再試行</button></form>` : ""}</td></tr>`).join("")}
</table>
<script>
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
export function testView(c: Campaign & { sender: SenderProfile }, tests: Job[]) {
  return `<h1>テスト送信 <span class="tag">${esc(c.name)}</span></h1>
<p><a href="/campaigns/${c.id}">← キャンペーンに戻る</a></p>
<div class="card"><h2 style="margin-top:0">自社のフォームに送って動作確認</h2>
<p class="muted">実在の他社には送らないでください。テスト送信は本送信の件数・履歴とは別に記録されます。</p>
<form method="post" action="/campaigns/${c.id}/test"><div class="row"><div><label>テスト先フォームURL</label><input type="url" name="url" required placeholder="https://自社サイト/contact/"></div><div><label>会社名（差し込み確認用）</label><input type="text" name="company" value="テスト株式会社"></div></div>
<p><button class="btn sub" name="dry" value="1">入力だけ試す（送信しない）</button> <button class="btn">実際に送信する</button></p></form>
${c.channel !== "form" ? `<form method="post" action="/campaigns/${c.id}/test"><label>メールのテスト（自分のアドレスに1通送る）</label><div class="row"><input type="email" name="email" placeholder="自分のメールアドレス"><button class="btn">テストメールを送る</button></div></form>` : ""}</div>
<h2>テスト履歴（最新20件）</h2>
${tests.length ? `<table><tr><th>ID</th><th>宛先</th><th>送り方</th><th>状態</th><th>結果</th><th>日時</th></tr>
${tests.map((j) => `<tr><td><a href="/jobs/${j.id}">${j.id}</a></td><td>${esc(j.company_name)}<br><span class="muted small">${esc(j.form_url || j.email)}</span></td><td class="small">${j.channel === "email" ? "✉ メール" : "📝 フォーム"}</td><td>${statusTag(j.status)}</td><td class="small">${esc((j.result_text || "").split("\n")[0].slice(0, 70))}</td><td class="small">${esc(j.updated_at ?? "")}</td></tr>`).join("")}
</table>` : '<p class="muted">まだテストしていません。</p>'}`;
}

export function jobView(j: Job, c: Campaign) {
  return `<h1>${esc(j.company_name)} ${statusTag(j.status)}</h1>
<p><a href="/campaigns/${c.id}">← ${esc(c.name)}</a></p>
<div class="row"><div class="card"><b>フォームURL:</b> <a href="${esc(j.form_url)}" target="_blank">${esc(j.form_url)}</a><br><b>企業URL:</b> ${esc(j.site_url)}<br><b>業種:</b> ${esc(j.industry)} / ${esc(j.sub_industry)}<br><b>試行:</b> ${j.attempts}回 <b>送信:</b> ${esc(j.sent_at ?? "-")}
<h2>結果・ログ</h2><pre>${esc(j.result_text)}</pre>
<form method="post" action="/jobs/${j.id}/retry" class="inline"><button class="btn sub">再試行</button></form>
<form method="post" action="/suppressions" class="inline"><input type="hidden" name="domain" value="${esc(j.domain)}"><input type="hidden" name="reason" value="手動（${esc(j.company_name)}）"><button class="btn danger">このドメインを除外</button></form>
${j.status === "sent" ? `<h2>反応を記録</h2><form method="post" action="/jobs/${j.id}/outcome"><p>${[["replied", "返信あり"], ["appointment", "アポ獲得"], ["declined", "断り・不要（今後送らない）"], ["", "取り消し"]].map(([k, l]) => `<button class="btn ${j.outcome === k && k ? "" : "sub"} small" name="outcome" value="${k}">${l}</button>`).join(" ")}</p><input type="text" name="note" value="${esc(j.outcome_note)}" placeholder="メモ（返信内容・次のアクション）"></form>` : ""}
<h2>送った文面</h2><pre>${esc(j.message_used)}</pre></div>
<div class="card"><h2 style="margin-top:0">スクリーンショット</h2>${j.screenshot_path ? `<img src="/screenshots/${esc(j.screenshot_path.split("/").pop())}" style="max-width:100%;border:1px solid #ddd">` : '<p class="muted">なし</p>'}</div></div>`;
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

<div class="card"><h2 style="margin-top:0">CSVでまとめて追加</h2>
<p class="muted">列は <b>会社名</b>（必須）と、<b>メール</b>・<b>ドメイン（企業URL）</b>・<b>電話番号</b>（いずれも任意・あれば拾います）。1行1社。<br>ドメインもメールも無い行は、送信を止める手がかりが無いため登録できません（その場合は会社名を一覧で出します）。</p>
<form method="post" action="/suppressions/import" enctype="multipart/form-data">
<div class="row"><div><label>CSVファイル</label><input type="file" name="csv" accept=".csv" required></div><div><label>理由（CSVに理由列が無い行に付けます）</label><input type="text" name="reason" placeholder="取引先のため送信対象外"></div></div>
<p><button class="btn">取り込む</button></p></form></div>

<table><tr><th>会社名</th><th>ドメイン</th><th>メール</th><th>電話</th><th>理由</th><th>登録</th><th></th></tr>${rows.length ? rows.map((r) => `<tr><td>${esc(r.company_name || "―")}</td><td>${esc(r.domain ?? "―")}</td><td class="small">${esc(r.email ?? "―")}</td><td class="small">${esc(r.tel || "―")}</td><td class="small">${esc(r.reason)}</td><td class="small">${esc(r.created_at)}</td><td><form method="post" action="/suppressions/${r.id}/delete" class="inline"><button class="btn sub small">削除</button></form></td></tr>`).join("") : `<tr><td colspan="7" class="muted">まだ登録がありません。</td></tr>`}</table>
<h2>メール配信停止（アドレス単位）</h2><p class="muted">上の欄にメールアドレスを入れて追加すると、そのアドレス宛てのメールを停止します。返信で「配信停止」と言われた相手は必ず入れてください。</p>
<table><tr><th>メール</th><th>理由</th><th>登録</th></tr>${optouts.map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.reason)}</td><td class="small">${esc(r.created_at)}</td></tr>`).join("")}</table>`;
}

export function settingsView(ngWords: string[], provider: string) {
  return `<h1>設定</h1>
<div class="card"><h2 style="margin-top:0">AIプロバイダ</h2><p>現在: <b>${esc(provider)}</b></p><p class="muted">環境変数で切り替えます。<code>ANTHROPIC_API_KEY</code> があれば Claude（既定 claude-haiku-4-5）、無ければ <code>GEMINI_API_KEY</code> で Gemini（既定 gemini-3.6-flash）。モデルは <code>ANTHROPIC_MODEL</code> / <code>GEMINI_MODEL</code> で変更。</p></div>
<div class="card"><h2 style="margin-top:0">NGワード（1行1語）</h2><form method="post" action="/settings"><textarea name="ng_words">${esc(ngWords.join("\n"))}</textarea><p><button class="btn">保存</button></p></form></div>`;
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
export function usersView(users: { id: number; username: string; display_name: string; role: string; active: number; last_login_at: string | null; created_at: string }[], issued?: { username: string; password: string }): string {
  return `<h1>ユーザー管理</h1>
${issued ? `<div class="card" style="border-color:var(--honey);background:var(--honey-50)">
<b>アカウントを発行しました。この内容をご本人に伝えてください（パスワードは今だけ表示されます）</b>
<table style="margin-top:8px"><tr><th>ログインID</th><td><code style="font-size:15px">${esc(issued.username)}</code></td></tr>
<tr><th>初期パスワード</th><td><code style="font-size:15px">${esc(issued.password)}</code></td></tr></table>
<p class="muted">初回ログイン時に本人がパスワードを変更する画面になります。</p></div>` : ""}
<div class="card"><h2 style="margin-top:0">＋ アカウントを発行する</h2>
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
<td class="small">${esc(u.last_login_at ?? "―")}</td>
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
