// 画面のHTML。BRIDGE HATCH の配色（honey-400 #FFC62E / hive-900 #1C1710）に合わせてある。
import { STATUS_LABEL, OUTCOME_LABEL, type Campaign, type Job, type SenderProfile, type JobStatus } from "./db.js";
import type { Lint } from "./message.js";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function layout(title: string, body: string, flash = ""): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | アポハッチくん</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2048%22%3E%3Crect%20width%3D%2248%22%20height%3D%2248%22%20rx%3D%2210%22%20fill%3D%22%23FFF8E1%22%2F%3E%3Cpath%20d%3D%22M20%2015C18.5%2010%2016%208.5%2013.5%208%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%222.2%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%2F%3E%3Cpath%20d%3D%22M28%2015C29.5%2010%2032%208.5%2034.5%208%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%222.2%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%2F%3E%3Ccircle%20cx%3D%2212.8%22%20cy%3D%227.4%22%20r%3D%222.4%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2235.2%22%20cy%3D%227.4%22%20r%3D%222.4%22%20fill%3D%22%231C1710%22%2F%3E%3Cellipse%20cx%3D%229.5%22%20cy%3D%2221%22%20rx%3D%227.6%22%20ry%3D%225.3%22%20fill%3D%22%23fff%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%221.6%22%20transform%3D%22rotate%28-24%209.5%2021%29%22%2F%3E%3Cellipse%20cx%3D%2238.5%22%20cy%3D%2221%22%20rx%3D%227.6%22%20ry%3D%225.3%22%20fill%3D%22%23fff%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%221.6%22%20transform%3D%22rotate%2824%2038.5%2021%29%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2214%22%20width%3D%2222%22%20height%3D%2229%22%20rx%3D%2211%22%20fill%3D%22%23FFC62E%22%20stroke%3D%22%231C1710%22%20stroke-width%3D%222%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2228.5%22%20width%3D%2222%22%20height%3D%224.6%22%20fill%3D%22%231C1710%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2237%22%20width%3D%2222%22%20height%3D%224.6%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2219.6%22%20cy%3D%2222.5%22%20r%3D%222.3%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2228.4%22%20cy%3D%2222.5%22%20r%3D%222.3%22%20fill%3D%22%231C1710%22%2F%3E%3Ccircle%20cx%3D%2220.4%22%20cy%3D%2221.7%22%20r%3D%22.8%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2229.2%22%20cy%3D%2221.7%22%20r%3D%22.8%22%20fill%3D%22%23fff%22%2F%3E%3C%2Fsvg%3E">
<style>
:root{--honey:#FFC62E;--honey-50:#FFF8E1;--honey-100:#FFEDB3;--hive:#1C1710;--hive-600:#4A4237;--hive-200:#D9D4CC;--bg:#FAF8F3;--ok:#2E7D32;--ng:#C62828;--warn:#B26A00}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:var(--bg);color:var(--hive);font-size:14px}
header{background:var(--hive);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:18px}header a{color:#fff;text-decoration:none}header .logo{background:var(--honey);color:var(--hive);font-weight:700;padding:4px 12px 4px 8px;border-radius:8px;display:inline-flex;align-items:center;gap:6px}header .logo .hatch{display:block;flex:none}header .brandsub{font-size:11px;letter-spacing:.06em;color:#C9C1B4;margin-left:-10px;align-self:center}
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
</style></head><body>
<header><a class="logo" href="/"><svg class="hatch" viewBox="0 0 48 48" width="22" height="22" role="img" aria-label="ハッチくん"><path d="M20 14C18.5 9 16 7.5 13.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28 14C29.5 9 32 7.5 34.5 7" stroke="#1C1710" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.8" cy="6.4" r="2.4" fill="#1C1710"/><circle cx="35.2" cy="6.4" r="2.4" fill="#1C1710"/><ellipse cx="9.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(-24 9.5 20)"/><ellipse cx="38.5" cy="20" rx="8" ry="5.6" fill="#fff" stroke="#1C1710" stroke-width="1.6" transform="rotate(24 38.5 20)"/><rect x="13" y="13" width="22" height="29" rx="11" fill="#FFC62E" stroke="#1C1710" stroke-width="2"/><rect x="13" y="27.5" width="22" height="4.6" fill="#1C1710"/><rect x="13" y="36" width="22" height="4.6" fill="#1C1710"/><circle cx="19.6" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="28.4" cy="21.5" r="2.3" fill="#1C1710"/><circle cx="20.4" cy="20.7" r=".8" fill="#fff"/><circle cx="29.2" cy="20.7" r=".8" fill="#fff"/></svg> アポハッチくん</a><span class="brandsub">フォーム＆メール営業</span><a href="/">キャンペーン</a><a href="/senders">送信者</a><a href="/suppressions">除外リスト</a><a href="/settings">設定</a></header>
<main>${flash ? `<div class="flash">${esc(flash)}</div>` : ""}${body}</main></body></html>`;
}

export function statusTag(s: JobStatus) {
  const cls = s === "sent" ? "sent" : s === "failed" ? "failed" : s === "queued" ? "queued" : s === "sending" ? "sending" : "skip";
  return `<span class="tag ${cls}">${STATUS_LABEL[s] ?? s}</span>`;
}

export function campaignListView(rows: (Campaign & { sender_label: string; total: number; sent: number; queued: number })[], provider: string) {
  return `<h1>キャンペーン</h1>
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

export function campaignView(c: Campaign & { sender: SenderProfile }, jobs: Job[], counts: Record<string, number>, running: boolean, provider: string, extra: { preview?: { job: Job; subject: string; message: string; aiUsed: boolean; lint?: Lint[] } | null; windowOk: boolean; sentToday: number; emailSentToday: number; scanning: boolean; unscanned: number; outcomes: Record<string, number> }) {
  const cnt = (s: string) => counts[s] ?? 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return `<h1>${esc(c.name)} <span class="tag">${c.status}</span> ${running ? '<span class="tag sending">実行中</span>' : ""}</h1>
<p class="muted">送信者: ${esc(c.sender.company)} ${esc(c.sender.person)} / チャネル: ${c.channel === "both" ? "フォーム優先＋メール" : c.channel === "email" ? "メールのみ" : "フォームのみ"} / モード: ${c.mode} / AI: ${esc(provider)} / 時間帯 ${c.send_window_start}〜${c.send_window_end}時${c.weekdays_only ? "（平日）" : ""} / 上限 フォーム${c.daily_limit}・メール${c.email_daily_limit}/日（本日 ${extra.sentToday}・${extra.emailSentToday}） ${extra.windowOk ? "" : "<b style='color:var(--warn)'>いまは送信時間帯外</b>"}</p>
<div class="stats"><div class="stat">全件<b>${total}</b></div><div class="stat">待機<b>${cnt("queued")}</b></div><div class="stat">送信済<b style="color:var(--ok)">${cnt("sent")}</b></div><div class="stat">失敗<b style="color:var(--ng)">${cnt("failed")}</b></div><div class="stat">フォーム無し<b>${cnt("skip_no_form")}</b></div><div class="stat">お断り<b>${cnt("skip_refused")}</b></div><div class="stat">CAPTCHA<b>${cnt("skip_captcha")}</b></div><div class="stat">除外/重複<b>${cnt("skip_suppressed") + cnt("skip_duplicate") + cnt("skip_optout")}</b></div><div class="stat">反応<b class="small">返信${extra.outcomes.replied ?? 0}／アポ${extra.outcomes.appointment ?? 0}／断り${extra.outcomes.declined ?? 0}</b>${cnt("sent") ? `<span class="muted">反応率 ${((((extra.outcomes.replied ?? 0) + (extra.outcomes.appointment ?? 0)) / cnt("sent")) * 100).toFixed(1)}%</span>` : ""}</div></div>

<div class="card"><h2 style="margin-top:0">1. リストを取り込む</h2>
<form method="post" action="/campaigns/${c.id}/import" enctype="multipart/form-data"><input type="file" name="csv" accept=".csv,text/csv" required> <button class="btn sub">CSVを取り込む</button>
<p class="muted">企業DBの書き出し（企業名 / 問い合わせフォーム / 企業URL / 大業界 / 小業界 / 都道府県 / 代表者名）をそのまま読めます。同一ドメイン・90日以内送信済み・除外リスト・官公庁等は自動で振り分けます。</p></form></div>

<div class="card"><h2 style="margin-top:0">1-b. 事前チェック（送る前に連絡先を確認）${extra.scanning ? '<span class="tag sending">チェック中</span>' : ""}</h2>
<p class="muted">送らずに各社のサイトを見て、フォームの有無・営業お断り・CAPTCHAを先に判定し、サイトのメールアドレスを拾います。フォームが無い会社はメールに自動で切り替わります（チャネルが「フォーム優先＋メール」のとき）。1社5〜10秒。</p>
${extra.scanning ? `<form method="post" action="/campaigns/${c.id}/stop-scan" class="inline"><button class="btn danger">チェックを止める</button></form>` : `<form method="post" action="/campaigns/${c.id}/scan" class="inline"><button class="btn sub" ${extra.unscanned === 0 || running ? "disabled" : ""}>事前チェックを実行（未チェック ${extra.unscanned}社）</button></form>`}</div>

<div class="card"><h2 style="margin-top:0">2. 文面を確認する</h2>
<form method="post" action="/campaigns/${c.id}/preview" class="inline"><button class="btn sub">先頭の1社で文面をプレビュー</button></form>
${extra.preview ? `<p class="muted">${esc(extra.preview.job.company_name)}（${esc(extra.preview.job.industry)}）向け ${extra.preview.aiUsed ? "・AI生成あり" : "・テンプレのみ"}</p><p><b>件名:</b> ${esc(extra.preview.subject)}</p>${(extra.preview.lint ?? []).map((l) => `<div class="small" style="color:${l.level === "error" ? "var(--ng)" : "var(--warn)"}">${l.level === "error" ? "✕" : "△"} ${esc(l.text)}</div>`).join("")}<pre>${esc(extra.preview.message)}</pre>` : ""}
</div>

<div class="card"><h2 style="margin-top:0">3. テスト送信（自社のフォームに送って動作確認）</h2>
<form method="post" action="/campaigns/${c.id}/test"><div class="row"><div><label>テスト先フォームURL</label><input type="url" name="url" required placeholder="https://自社サイト/contact/"></div><div><label>会社名（差し込み確認用）</label><input type="text" name="company" value="テスト株式会社"></div></div>
<p><button class="btn sub" name="dry" value="1">入力だけ試す（送信しない）</button> <button class="btn">実際に送信する</button></p></form>
${c.channel !== "form" ? `<form method="post" action="/campaigns/${c.id}/test"><label>メールのテスト（自分のアドレスに1通送る）</label><div class="row"><input type="email" name="email" placeholder="自分のメールアドレス"><button class="btn">テストメールを送る</button></div></form>` : ""}</div>

<div class="card"><h2 style="margin-top:0">4. 本送信</h2>
${running ? `<form method="post" action="/campaigns/${c.id}/pause" class="inline"><button class="btn danger">一時停止</button></form>` : `<form method="post" action="/campaigns/${c.id}/start" class="inline"><button class="btn">開始する（${cnt("queued")}件）</button> <label class="inline small"><input type="checkbox" name="ignore_window" value="1"> 時間帯を無視して今すぐ送る</label></form>`}
<a class="btn sub" href="/campaigns/${c.id}/export.csv">結果をCSVで書き出す</a> <a class="btn sub" href="/campaigns/${c.id}/manual.csv">手動送信リスト（CAPTCHA・失敗分をURL＋文面つきで）</a>
<p class="muted">このページは実行中10秒ごとに自動更新されます。ワーカーを別プロセスで動かす場合は <code>npm run worker</code>。</p></div>

<h2>送信一覧（最新200件）</h2>
<table><tr><th>ID</th><th>会社</th><th>送り方</th><th>業種</th><th>状態</th><th>結果</th><th>反応</th><th>更新</th><th></th></tr>
${jobs.map((j) => `<tr><td>${j.id}${j.is_test ? " <span class='tag'>test</span>" : ""}</td><td><a href="/jobs/${j.id}">${esc(j.company_name)}</a><br><span class="muted">${esc(j.domain)}</span></td><td class="small">${j.channel === "email" ? "✉ メール" : "📝 フォーム"}</td><td class="small">${esc(j.sub_industry || j.industry)}</td><td>${statusTag(j.status)}</td><td class="small">${esc((j.result_text || "").split("\n")[0].slice(0, 70))}</td><td class="small">${j.outcome ? `<b>${esc(OUTCOME_LABEL[j.outcome] ?? j.outcome)}</b>` : ""}</td><td class="small">${esc(j.sent_at ?? "")}</td><td>${j.status === "failed" || j.status === "skip_no_form" ? `<form method="post" action="/jobs/${j.id}/retry" class="inline"><button class="btn sub small">再試行</button></form>` : ""}</td></tr>`).join("")}
</table>
${running ? "<script>setTimeout(()=>location.reload(),10000)</script>" : ""}`;
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

export function suppressionsView(rows: { id: number; domain: string; reason: string; created_at: string }[], optouts: { email: string; reason: string; created_at: string }[] = []) {
  return `<h1>除外リスト</h1><p class="muted">ここにあるドメインには全キャンペーンで送りません。営業お断りを検知したものは自動で追加されます。返信で「今後不要」と言われた先も必ず追加してください。</p>
<div class="card"><form method="post" action="/suppressions"><div class="row"><div><label>ドメイン（例: example.co.jp）</label><input type="text" name="domain" required></div><div><label>理由</label><input type="text" name="reason"></div></div><p><button class="btn">追加</button></p></form></div>
<table><tr><th>ドメイン</th><th>理由</th><th>登録</th><th></th></tr>${rows.map((r) => `<tr><td>${esc(r.domain)}</td><td>${esc(r.reason)}</td><td class="small">${esc(r.created_at)}</td><td><form method="post" action="/suppressions/${r.id}/delete" class="inline"><button class="btn sub small">削除</button></form></td></tr>`).join("")}</table>
<h2>メール配信停止（アドレス単位）</h2><p class="muted">上の欄にメールアドレスを入れて追加すると、そのアドレス宛てのメールを停止します。返信で「配信停止」と言われた相手は必ず入れてください。</p>
<table><tr><th>メール</th><th>理由</th><th>登録</th></tr>${optouts.map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.reason)}</td><td class="small">${esc(r.created_at)}</td></tr>`).join("")}</table>`;
}

export function settingsView(ngWords: string[], provider: string) {
  return `<h1>設定</h1>
<div class="card"><h2 style="margin-top:0">AIプロバイダ</h2><p>現在: <b>${esc(provider)}</b></p><p class="muted">環境変数で切り替えます。<code>ANTHROPIC_API_KEY</code> があれば Claude（既定 claude-haiku-4-5）、無ければ <code>GEMINI_API_KEY</code> で Gemini（既定 gemini-3.6-flash）。モデルは <code>ANTHROPIC_MODEL</code> / <code>GEMINI_MODEL</code> で変更。</p></div>
<div class="card"><h2 style="margin-top:0">NGワード（1行1語）</h2><form method="post" action="/settings"><textarea name="ng_words">${esc(ngWords.join("\n"))}</textarea><p><button class="btn">保存</button></p></form></div>`;
}
