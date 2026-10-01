// 画面のHTML。BRIDGE HATCH の配色（honey-400 #FFC62E / hive-900 #1C1710）に合わせてある。
import { STATUS_LABEL, OUTCOME_LABEL, CHANNEL_LABEL, channelMode, jst, type Campaign, type Job, type SenderProfile, type JobStatus } from "./db.js";
import { AI_MODELS, type Lint } from "./message.js";
import { TEMPLATE_LIBRARY } from "./templates.js";



import { esc, layout, n, type NavUser } from "./ui/layout.js";
export { esc, layout, n, type NavUser };

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

/** 事前チェックで出した「送れそう度」（0〜100）。高いほど送れる見込みが高い。未計測は出さない */
function scoreTag(j: Job): string {
  const n = (j as Job & { scan_score?: number }).scan_score ?? -1;
  if (n < 0 || j.status === "sent") return "";
  const color = n >= 70 ? "var(--ok)" : n >= 40 ? "var(--warn)" : "var(--hive-600)";
  return `<br><span class="muted" style="color:${color}" title="事前チェックの結果から出した、送れる見込み（フォームの有無・メールの有無・CAPTCHA）">送れそう度 ${n}</span>`;
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

// ---- 表示用の日本語（#102）。内部の値（paused / template など）をそのまま画面に出さない ----
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { draft: "準備中", running: "送信中", paused: "一時停止", done: "完了" };
export const MODE_LABEL: Record<string, string> = { template: "テンプレート", ai: "全文AI", hybrid: "冒頭だけAI", tpl_ai: "テンプレート＋AI回答" };
export function campaignStatusTag(status: string, running = false): string {
  const cls = running || status === "running" ? "sending" : status === "done" ? "sent" : status === "paused" ? "queued" : "skip";
  return `<span class="tag ${cls}">${esc(running ? "送信中" : CAMPAIGN_STATUS_LABEL[status] ?? status)}</span>`;
}
/** 色の意味の凡例（#111）。どの画面でも同じ意味で使う */
export const STATUS_LEGEND = `<div class="legend"><span><i style="background:var(--c-ok)"></i>送れた</span><span><i style="background:var(--c-ng)"></i>手が必要</span><span><i style="background:#D9A400"></i>待ち</span><span><i style="background:var(--c-info)"></i>進行中</span><span><i style="background:#9A958C"></i>対象外</span></div>`;

/** ホーム上部の「今日やることが分かる1画面」（#49 #108 #132 #137） */
export type HomeSummary = {
  todayForm: number; todayEmail: number; monthForm: number; monthEmail: number;
  appointments: number; replies: number; declines: number;
  queued: number; runningNames: string[]; windowOk: boolean; windowText: string;
  todo: number; todoCaptcha: number;
  emailPaused: { label: string; until: number; reason: string }[];
  senders: number; campaigns: number;
  capForm: number; capEmail: number;   // 今日送れる上限（開始中のキャンペーンの合計）
  nextStart: string;                   // 時間帯外のとき、次に始まる時刻
  setupDone: number; setupTotal: number;
  newAppointments: { id: number; company: string; at: string }[]; // 直近3日のアポ
};

function homeCard(h: HomeSummary): string {
  const stat = (label: string, value: string, sub = "", href = "", color = "") => {
    const inner = `<div class="stat" style="min-width:140px"><span class="muted" data-nohelp>${label}</span><b${color ? ` style="color:${color}"` : ""}>${value}</b>${sub ? `<span class="muted" data-nohelp>${sub}</span>` : ""}</div>`;
    return href ? `<a href="${href}" style="text-decoration:none;color:inherit">${inner}</a>` : inner;
  };
  // いま一番やるべきことを1つだけ出す（最初の人が迷わないように）
  const next = !h.senders ? { t: "はじめの設定（6ステップ）から始めましょう", b: "はじめの設定を開く", href: "/setup" }
    : !h.campaigns ? { t: "キャンペーンを作って、会社リストを取り込みましょう", b: "はじめの設定を開く", href: "/setup" }
    : h.newAppointments.length ? { t: `アポ・前向きな返信が ${h.newAppointments.length}件あります: ${h.newAppointments.map((a) => a.company).join("、")}`, b: "内容を見る", href: `/jobs/${h.newAppointments[0].id}` }
    : h.queued > 0 && !h.runningNames.length ? { t: `送信待ちが ${n(h.queued)}社あります。開始すると送信時間帯に自動で送ります`, b: "キャンペーンを開く", href: "/campaigns" }
    : h.todo > 0 ? { t: `自動で送れなかった会社が ${n(h.todo)}社あります。まず「今日やる10件」から`, b: "要対応を見る", href: "/todo" }
    : h.runningNames.length ? { t: `送信中: ${h.runningNames.join("、")}`, b: "", href: "" }
    : { t: "いまやることはありません。お疲れさまでした", b: "", href: "" };
  const sentToday = h.todayForm + h.todayEmail;
  const cap = h.capForm + h.capEmail;
  const pct = cap ? Math.min(100, Math.round((sentToday / cap) * 100)) : 0;
  return `<div class="card">
  <p style="margin:0 0 14px;font-size:17px"><b>${esc(next.t)}</b>${next.b ? ` <a class="btn primary small" href="${next.href}" style="margin-left:8px">${esc(next.b)}</a>` : ""}</p>
  ${cap ? `<div style="margin:0 0 14px"><div style="display:flex;justify-content:space-between;max-width:620px" class="small"><span><b>今日の進み具合</b>　${n(sentToday)} / ${n(cap)}件</span><span class="muted" data-nohelp>${pct}%</span></div>
  <div class="bar"><i style="width:${pct}%"></i></div>
  <div class="muted" data-nohelp>${h.windowOk ? (h.runningNames.length ? "送信中です" : "送信できる時間帯です") : `いまは送信時間帯の外です。${esc(h.nextStart)}`}</div></div>`
    : h.windowOk ? "" : `<p class="muted" data-nohelp style="margin:0 0 14px">いまは送信時間帯の外です。${esc(h.nextStart)}</p>`}
  <div class="stats">
    ${stat("今日の送信", n(sentToday), `フォーム${n(h.todayForm)}・メール${n(h.todayEmail)}`, "/stats")}
    ${stat("今月の送信", n(h.monthForm + h.monthEmail), `フォーム${n(h.monthForm)}・メール${n(h.monthEmail)}`, "/stats?mode=month")}
    ${stat("アポ", n(h.appointments), `返信${n(h.replies)}・断り${n(h.declines)}`, "/stats#analysis", h.appointments ? "var(--c-ok)" : "")}
    ${stat("送信待ち", n(h.queued), "社", "/campaigns")}
    ${stat("要対応", n(h.todo), h.todoCaptcha ? `うち画像認証 ${n(h.todoCaptcha)}` : "社", "/todo", h.todo ? "var(--c-ng)" : "")}
  </div>
  ${h.emailPaused.length ? `<p class="small" style="margin:12px 0 0;color:var(--ng)">⚠ メール送信を一時停止中: ${h.emailPaused.map((p) => `${esc(p.label)}（${esc(p.reason.slice(0, 60))}／${new Date(p.until).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}に再開）`).join("、")}</p>` : ""}
  ${h.setupDone < h.setupTotal ? `<p class="small" style="margin:12px 0 0">はじめの設定: <b>${h.setupDone} / ${h.setupTotal}</b> 完了　<a href="/setup">続きを進める</a></p>` : ""}
</div>`;
}

type CampaignRow = Campaign & { sender_label: string; total: number; sent: number; queued: number; reactions: number; last_sent: string | null; is_running?: boolean };

/** キャンペーンの一覧。home を渡すとホーム画面（上にまとめを出す）、渡さなければ一覧だけ */
export function campaignListView(rows: CampaignRow[], provider: string, senders: { id: number; label: string; company: string; person: string }[] = [], home?: HomeSummary) {
  // 最終送信からの経過を「今日／昨日／N日前」で表す（放置ぎみのキャンペーンに気づける）
  const sinceLabel = (ts: string | null): string => {
    if (!ts) return "";
    const t = Date.parse(String(ts).replace(" ", "T") + "Z"); // DBは世界標準時
    if (Number.isNaN(t)) return "";
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(new Date()) - startOf(new Date(t))) / 86400000);
    return days <= 0 ? "今日" : days === 1 ? "昨日" : `${days}日前`;
  };
  const list = rows.length ? `<table class="resp">
<tr><th>キャンペーン</th><th style="width:110px">状態</th><th style="width:220px">進み具合</th><th style="width:90px">待機</th><th style="width:110px">反応</th><th style="width:130px">最後に送った日</th><th style="width:200px"></th></tr>
${rows.map((c) => {
    const pct = c.total ? Math.round((c.sent / c.total) * 100) : 0;
    return `<tr><td><a href="/campaigns/${c.id}"><b>${esc(c.name)}</b></a><div class="muted" data-nohelp>${esc(c.sender_label)}・${esc(MODE_LABEL[c.mode] ?? c.mode)}${c.group_name ? `・グループ: ${esc(c.group_name)}` : ""}</div></td>
<td>${campaignStatusTag(c.status, c.is_running)}</td>
<td><div class="bar" style="margin:4px 0"><i style="width:${pct}%"></i></div><span class="small">${n(c.sent)} / ${n(c.total)}社 送信済み</span></td>
<td>${n(c.queued)}<span class="muted" data-nohelp>社</span></td>
<td class="small">${c.sent ? `${n(c.reactions)}件<br><span class="muted" data-nohelp>${((c.reactions / c.sent) * 100).toFixed(1)}%</span>` : "—"}</td>
<td class="small">${c.last_sent ? `${esc(jst(c.last_sent).slice(5))}<br><span class="muted" data-nohelp>${sinceLabel(c.last_sent)}</span>` : "—"}</td>
<td style="white-space:nowrap"><a class="btn small" href="/campaigns/${c.id}">開く</a> <form method="post" action="/campaigns/${c.id}/duplicate" class="inline"><button class="btn small">複製</button></form></td></tr>`;
  }).join("")}
</table>
<div class="cards">${rows.map((c) => `<div class="c"><h3><a href="/campaigns/${c.id}">${esc(c.name)}</a></h3>${campaignStatusTag(c.status, c.is_running)}
<div class="small" style="margin-top:6px">送信済み ${n(c.sent)} / ${n(c.total)}社・待機 ${n(c.queued)}社・反応 ${n(c.reactions)}件</div>
<div class="acts"><a class="btn small" href="/campaigns/${c.id}">開く</a></div></div>`).join("")}</div>`
    : `<div class="card"><p>まだキャンペーンがありません。</p><p><a class="btn primary" href="/setup">はじめの設定を開く</a> <a class="btn" href="/campaigns/new">キャンペーンを作る</a></p></div>`;

  const importBox = senders.length && !home ? `<details class="card" style="padding:12px 16px;margin:14px 0 0"><summary style="cursor:pointer"><b>別のPCで書き出した設定ファイルから作る</b></summary>
<p class="muted" style="margin:8px 0">キャンペーン画面の「設定をファイルに書き出す」で作った .json を選ぶと、同じ文面・設定のキャンペーンが作られます（会社リスト・送信履歴・送信者は含まれません）。</p>
<form method="post" action="/campaigns/import" enctype="multipart/form-data" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
<input type="file" name="file" accept=".json,application/json" required style="max-width:320px">
<label class="inline small">送信者: <select name="sender_id" style="width:auto">${senders.map((s) => `<option value="${s.id}">${esc(s.label)}（${esc(s.company)} ${esc(s.person)}）</option>`).join("")}</select></label>
<button class="btn small">読み込む</button></form></details>` : "";

  if (home) {
    return `<h1>ホーム</h1>
${homeCard(home)}
${rows.length ? `<h2 id="list" style="display:flex;justify-content:space-between;align-items:center">キャンペーン <a class="btn small" href="/campaigns/new">＋ 新しいキャンペーン</a></h2>${list}` : ""}`;
  }
  return `<h1 style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">キャンペーン <a class="btn primary" href="/campaigns/new">＋ 新しいキャンペーン</a></h1>
<p class="muted">キャンペーン＝「この文面で、この会社たちに、この送り方で送る」という送信のまとまり1件です。商材ごと・ターゲットごとに分けて作ると、反応率を比べられます。AI: ${esc(provider === "none" ? "未設定（テンプレートのみで動きます）" : provider)}</p>
${list}
${importBox}`;
}

export function senderForm(s?: Partial<SenderProfile>) {
  const v = (k: keyof SenderProfile) => esc(s?.[k] ?? "");
  return `<form method="post" action="/senders${s?.id ? `/${s.id}` : ""}" data-draft="sender-${s?.id ?? "new"}">
<div class="row"><div><label>ラベル（管理用）</label><input type="text" name="label" value="${v("label")}" placeholder="社内用 / ○○社用" required></div><div><label>会社名 *</label><input type="text" name="company" value="${v("company")}" required></div></div>
<div class="row"><div><label>業種</label><input type="text" name="industry" value="${v("industry")}"></div><div><label>担当者名 *（姓と名の間にスペース）</label><input type="text" name="person" value="${v("person")}" placeholder="田中 太郎" required></div></div>
<div class="row"><div><label>担当者名フリガナ</label><input type="text" name="person_kana" value="${v("person_kana")}" placeholder="タナカ タロウ"></div><div><label>メール *（フォームに入力するアドレス）</label><input type="email" name="email" value="${v("email")}" required></div></div>
<div class="row"><div><label>返信受付メール（本文に載せる。空なら上と同じ）</label><input type="email" name="reply_email" value="${v("reply_email")}"></div><div><label>電話（ハイフン区切り）</label><input type="text" name="tel" value="${v("tel")}" placeholder="03-1234-5678"><p class="muted" style="color:var(--ng)">⚠ フォームでは電話番号が必須になっていることが多く、未入力のままだとかなりの確率で送信エラーになります。必ず入力してください。</p>
<label class="inline small" style="display:flex;gap:6px;align-items:flex-start;margin-top:6px;font-weight:400"><input type="checkbox" name="tel_required_only" value="1" ${s?.tel_required_only ? "checked" : ""} style="width:auto;margin-top:3px"> <span><b>電話番号が必須の欄にだけ入力する</b>（任意の欄には書かない）<br><span class="muted">電話番号を相手に伝えたくない場合に。サイト側で必須だった場合は、弾かれた後の埋め直しで入力して再送します。</span></span></label></div></div>
<div class="row3"><div><label>郵便番号</label><input type="text" name="postal" value="${v("postal")}" placeholder="114-0001"></div><div><label>住所（都道府県から）※メールで送る場合は必須</label><input type="text" name="address" value="${v("address")}"><p class="muted small" style="margin:2px 0 0">営業メールには送信者の名称・住所・配信停止の連絡先の表示が法律（特定電子メール法）で必要なため、メールの末尾に自動で載せます。</p></div><div><label>自社URL</label><input type="url" name="url" value="${v("url")}"></div></div>
<h2>メールで送る場合の設定（任意。フォームだけなら不要）</h2>
<p class="muted">Googleアカウントで<a href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noopener">2段階認証プロセス</a>をオンにし、<a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">アプリパスワード</a>を発行して貼り付けてください（リンクを押すと、いまブラウザでログイン中のGoogleアカウントの設定ページが別タブで開きます。送信に使うアカウントでログインしているか確認してください）。営業専用のアドレスを使うのが安全です（無料Gmailは1日500通、Workspaceは2,000通まで）。</p>
<div class="row3"><div><label>送信用メールアドレス（Gmail等）</label><input type="text" name="smtp_user" value="${v("smtp_user")}" placeholder="sales@example.co.jp"></div><div><label>アプリパスワード（保存済みなら空のまま）</label><input type="password" name="smtp_pass" value="" placeholder="xxxx xxxx xxxx xxxx" autocomplete="off"></div><div><label>差出人として表示するアドレス（空なら左と同じ）</label><input type="text" name="from_email" value="${v("from_email")}"></div></div>
<label class="inline small" style="display:flex;gap:6px;align-items:flex-start;margin:6px 0;font-weight:400"><input type="checkbox" name="reply_check" value="1" ${s?.reply_check === 0 ? "" : "checked"} style="width:auto;margin-top:3px"> <span><b>受信箱を読んで、返信（返信あり／アポ／断り）と届かなかったメールを自動で記録する</b><br><span class="muted">オンにすると、アポハッチくんが<b>この送信用メールアドレスの受信箱に届いたメールを15分ごとに読み取ります</b>（このPCの中だけで処理し、外部には送りません）。送った会社からのメール以外は記録しません。個人のメールと兼用していて読まれたくない場合はオフにしてください（反応は手動で記録）。</span></span></label>
<label>配信停止ページのURL（任意・入れておくと到達率が上がります）</label>
<input type="url" name="unsubscribe_url" value="${v("unsubscribe_url")}" placeholder="https://docs.google.com/forms/d/e/…/viewform">
<p class="muted small" style="margin:4px 0 10px">メールの末尾と「配信停止」ボタン（Gmail等が出すもの）に、このURLを使います。受け取った人が<b>1クリックで停止を申し出られる</b>ようになり、迷惑メール報告を押される代わりにこちらに届きます。<br>Googleフォームで「メールアドレス」を聞くだけの簡単なフォームを1つ作って、そのURLを貼ってください。空の場合は、これまでどおり「本メールに『配信停止』と返信」での受付になります。</p>
<label class="inline small" style="display:flex;gap:6px;align-items:flex-start;margin:6px 0;font-weight:400"><input type="checkbox" name="tls_insecure" value="1" ${s?.tls_insecure ? "checked" : ""} style="width:auto;margin-top:3px"> <span><b>セキュリティソフトの影響で送れない場合にチェック</b>（「self-signed certificate…」「certificate」を含むエラーが出るとき）<br><span class="muted">ESET・カスペルスキー等のメール保護や社内ネットワークが通信に割り込むと、証明書が差し替わって送信できません。チェックすると証明書の確認を省いて送れるようにします。<b>通信の安全性が下がる</b>ため、原因が分かっている場合だけにしてください（まずはセキュリティソフト側の「メール保護／SSLスキャン」をオフにする方が安全です）。</span></span></label>
<details class="small muted"><summary>Gmail以外のメールサーバー</summary><div class="row"><div><label>SMTPホスト</label><input type="text" name="smtp_host" value="${esc(s?.smtp_host ?? "smtp.gmail.com")}" placeholder="smtp.gmail.com"></div><div><label>ポート（465 or 587）</label><input type="number" name="smtp_port" value="${esc(s?.smtp_port ?? 465)}" placeholder="465"></div></div>
<p class="muted small" style="margin:6px 0 0"><b>SMTPホストとは：</b>メールを送り出すサーバーのアドレスです。プロバイダごとに決まっています。<br>
例）Gmail・Google Workspace＝<code>smtp.gmail.com</code>／Outlook・Microsoft365＝<code>smtp.office365.com</code>／Yahoo!メール＝<code>smtp.mail.yahoo.co.jp</code>／iCloud＝<code>smtp.mail.me.com</code><br>
<b>確認方法：</b>お使いのメールの設定画面で「送信サーバー（SMTP）」の欄を見るか、「（プロバイダ名） SMTP 設定」で検索してください。分からなければ、送信専用に無料のGmailを1つ作るのが一番かんたんです（その場合はこの欄は変更不要）。</p></details>
<p><button class="btn primary">保存</button>${s?.id ? ` <button class="btn sub" formaction="/senders/${s.id}/test" formmethod="post">メール設定を確認</button>` : ""}</p></form>`;
}

/** 送信者の一覧（#106 #130）。設定の足りないところを赤い札で出し、その場で編集できる。
 *  以前は「未設定」が薄い文字で、編集は別ページ、新規追加は一覧の下にあった */
export type SenderExtra = { sentToday: number; limit: number; note: string; paused: string };
export function sendersView(list: SenderProfile[], usage: Record<number, number> = {}, extra: Record<number, SenderExtra> = {}, openId = 0) {
  const issues = (s: SenderProfile): string[] => {
    const out: string[] = [];
    if (!s.address?.trim()) out.push("住所が未登録（メールを送れません）");
    if (!s.smtp_user || !s.smtp_pass) out.push("送信用メールが未設定");
    if (!s.tel?.trim()) out.push("電話が未登録（フォームで弾かれやすい）");
    return out;
  };
  return `<h1 style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">送信者 <a class="btn primary" href="#new" onclick="document.getElementById('newsender').open=true">＋ 送信者を追加</a></h1>
<p class="muted" data-nohelp>相手に表示される「差出人」です。会社名・担当者・住所と、メールで送る場合は送信用メールを登録します。</p>
${list.length ? list.map((s) => {
    const iss = issues(s);
    const ex = extra[s.id];
    const mailOk = Boolean(s.smtp_user && s.smtp_pass);
    return `<details class="card" style="padding:0" ${openId === s.id ? "open" : ""}>
<summary style="cursor:pointer;padding:16px 18px;display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap;list-style:none">
  <span style="min-width:200px"><b>${esc(s.label || s.company)}</b><br><span class="muted" data-nohelp>${esc(s.company)} ${esc(s.person)}</span></span>
  <span class="small" style="min-width:210px">${mailOk ? `✉ ${esc(s.smtp_user)}` : "📝 フォーム送信のみ"}</span>
  <span>${iss.length ? iss.map((i) => `<span class="tag failed" style="margin:2px 4px 2px 0">${esc(i)}</span>`).join("") : `<span class="tag sent">設定OK</span>`}${ex?.paused ? ` <span class="tag failed">メール一時停止中</span>` : ""}</span>
  ${mailOk && ex ? `<span class="small" style="margin-left:auto;text-align:right">今日のメール <b>${n(ex.sentToday)} / ${n(ex.limit)}通</b>${ex.note ? `<br><span class="muted" data-nohelp>${esc(ex.note)}</span>` : ""}</span>` : `<span style="margin-left:auto"></span>`}
  <span class="btn small">編集</span>
</summary>
<div style="padding:0 18px 18px;border-top:1px solid var(--c-line)">
${ex?.paused ? `<p class="small" style="color:var(--ng)">⚠ ${esc(ex.paused)}</p>` : ""}
<p class="muted" data-nohelp>利用中のキャンペーン: ${usage[s.id] ?? 0}件</p>
${senderForm(s)}
${mailOk ? `<form method="post" action="/senders/${s.id}/test" class="inline" data-busy data-busytext="接続を確認中…"><button class="btn small">メールの接続をテストする</button></form>` : ""}
</div></details>`;
  }).join("") : `<div class="card"><p>まだ送信者がありません。下のフォームから登録してください。</p></div>`}
<details class="card" id="newsender" ${list.length ? "" : "open"}><summary style="cursor:pointer;font-weight:700" id="new">＋ 新しい送信者を追加する</summary>
<div style="margin-top:12px">${senderForm()}</div></details>`;
}

export function campaignForm(senders: SenderProfile[], defaults: Partial<Campaign>, provider: string, editId?: number, groups: string[] = [], others: { id: number; name: string; group_name: string }[] = []) {
  const d = (k: keyof Campaign, fb: unknown = "") => esc(defaults[k] ?? fb);
  return `<h1>${editId ? `キャンペーンを編集: ${d("name")}` : "新しいキャンペーン"}</h1>
${editId ? `<p><a href="/campaigns/${editId}">← キャンペーンに戻る</a></p><p class="muted">配信チャネルの変更は、<b>これから取り込む会社</b>に適用されます（取り込み済みの会社の振り分けは変わりません）。</p>` : ""}
<form method="post" action="${editId ? `/campaigns/${editId}/edit` : "/campaigns"}" class="card" enctype="multipart/form-data" data-draft="campaign-${editId ?? "new"}">
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
<label>件名（件名欄があるフォーム用）</label><input type="text" name="subject_text" value="${d("subject_text", "【ここに件名】のご案内")}">
<label>本文テンプレート</label>
<p class="muted">使える差し込み: {{会社名}} {{代表者}}（無ければ「ご担当者様」） {{業種}} {{都道府県}} {{自社名}} {{担当者}} {{自社メール}} {{自社電話}} {{自社URL}} {{AI冒頭}} {{資料リンク}}</p>
<div style="margin-bottom:6px"><label class="inline small">例文を挿入:
<select id="tplpreset" style="width:auto;padding:4px 8px;max-width:360px"><option value="">業種・目的から選ぶと、件名と本文に入ります…</option>${TEMPLATE_LIBRARY.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}</select></label>
<span class="muted small">※ 今の本文がある場合は置き換わります。【 】の中だけ自分の言葉に書き換えてください</span>
<div id="tplnote" class="muted small" style="margin:4px 0 6px"></div></div>
<textarea name="template_text" id="tpltext" style="min-height:320px">${d("template_text")}</textarea>
<script>
(() => {
  // 業種別のひな形（#63）。選ぶと件名と本文に入る
  const T = ${JSON.stringify(Object.fromEntries(TEMPLATE_LIBRARY.map((t) => [t.id, { subject: t.subject, body: t.body, note: t.note }])))};
  const sel = document.getElementById("tplpreset"), ta = document.getElementById("tpltext"), note = document.getElementById("tplnote");
  const subj = document.querySelector("[name=subject_text]");
  if (sel && ta) sel.addEventListener("change", () => {
    const v = T[sel.value];
    if (!v) { if (note) note.textContent = ""; return; }
    if (note) note.textContent = v.note;
    if (!ta.value.trim() || confirm("件名と本文をひな形で置き換えますか？（今の内容は消えます）")) {
      ta.value = v.body;
      if (subj && (!subj.value.trim() || subj.value.indexOf("【ここに") >= 0)) subj.value = v.subject;
    }
  });
})();
</script>
<details style="margin:12px 0" ${Number(defaults.ab_enabled ?? 0) ? "open" : ""}><summary style="cursor:pointer;font-weight:700">文面のA/Bテスト・件名の使い分け（任意）</summary>
<div style="border:1px solid var(--hive-200);border-radius:8px;padding:10px 12px;margin-top:8px">
<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="ab_enabled" value="1" ${Number(defaults.ab_enabled ?? 0) ? "checked" : ""} style="width:auto">2つの文面を半分ずつ送って、反応を比べる（A/Bテスト）</label>
<p class="muted small" style="margin:4px 0 8px">会社ごとに交互にA・Bを割り当てて送り、キャンペーン画面に「どちらが返信・アポを取れたか」を表示します。文面Bが空のときはAだけを送ります。</p>
<label>件名（B）</label><input type="text" name="subject_b" value="${d("subject_b")}" placeholder="空ならAと同じ件名を使います">
<label>本文（B）</label><textarea name="template_b" style="min-height:220px" placeholder="Aとは別の切り口の文面を入れてください">${d("template_b")}</textarea>
<label>件名の別案（1行に1つ・任意）</label><textarea name="subject_alts" style="min-height:70px" placeholder="同じ件名を大量に送ると迷惑メール扱いされやすくなります。別案を入れると順番に使います">${d("subject_alts")}</textarea>
</div></details>
<label>AIへの追加指示（任意）</label><input type="text" name="ai_instruction" value="${d("ai_instruction")}" placeholder="例: 採用課題に寄せる／飲食店向けに集客の話をする">
<div class="row3"><div><label>1日の上限（フォーム／メール）</label><div class="row"><input type="number" name="daily_limit" value="${d("daily_limit", 300)}" title="フォーム" placeholder="フォーム"><input type="number" name="email_daily_limit" value="${d("email_daily_limit", 100)}" title="メール" placeholder="メール"></div></div><div><label>送信時間帯（開始・終了 時）</label><div class="row"><input type="number" name="send_window_start" value="${d("send_window_start", 9)}" min="0" max="23"><input type="number" name="send_window_end" value="${d("send_window_end", 18)}" min="1" max="24"></div></div><div><label>平日のみ</label><select name="weekdays_only"><option value="1" ${Number(defaults.weekdays_only ?? 1) ? "selected" : ""}>はい</option><option value="0" ${defaults.weekdays_only !== undefined && !Number(defaults.weekdays_only) ? "selected" : ""}>土日も送る</option></select></div></div>
<div class="small" style="margin:-4px 0 14px;padding:10px 12px;background:var(--honey-50);border:1px solid var(--honey);border-radius:8px;line-height:1.7">
<b>⚠ メールの上限は少なめに（Gmailのアカウント停止を防ぐため）</b><br>
短時間に大量に送ると、Googleに「普段と違う利用」と判断され、<b>アカウントが一時停止</b>されます（通常1時間〜最大24時間。停止中は送信も返信の確認もできません）。上限の数だけでなく、次の条件が重なると止められやすくなります。<br>
・<b>作ったばかりのアカウント</b>：最初の1週間は1日<b>50〜100通</b>、問題なければ2週目に200通…と少しずつ増やしてください（いきなり500通以上は危険）<br>
・<b>深夜・早朝の連続送信</b>：送信時間帯は平日の日中（例: 9〜18時）にしてください<br>
・<b>重い添付ファイル</b>：数MB以上のPDFを毎通添付すると負荷が大きく、受け取れずに戻ってくる会社もあります。資料は添付せず、本文にGoogleドライブ等のリンクを載せるのがおすすめです<br>
・<b>届かないアドレスが多い</b>：戻ってくるメール（アドレス不明など）が多いと迷惑メール送信者とみなされやすくなります。古いリストは送る前に見直してください<br>
<span class="muted">目安: Gmail（無料）は1日約500通、Google Workspace は1日約2,000通が Google 側の上限ですが、上の条件次第でそれよりずっと少ない数でも止まります。フォーム送信はメールアカウントを使わないため、この制限はありません。</span>
</div>
<label style="display:flex;align-items:center;gap:8px;margin:10px 0 2px"><input type="checkbox" name="email_warmup" value="1" ${Number(defaults.email_warmup ?? 1) ? "checked" : ""} style="width:auto">メールの送信数を少しずつ増やす（ウォームアップ・推奨）</label>
<p class="muted small" style="margin:0 0 10px">送り始めの数日は1日30〜50通に自動で抑え、問題がなければ2週間かけて上の上限まで引き上げます。新しいアカウントがGoogleに止められるのを防ぎます。途中で止められた場合は自動で1段階下げます。</p>
${senders.length > 1 ? `<label>メールで使う送信アカウントを増やす（任意）</label>
<p class="muted small" style="margin:0 0 6px">上限に達したアカウントの代わりに、ここで選んだアカウントから続けて送ります（1日に送れる数が増えます）。署名・住所も、実際に送ったアカウントのものになります。</p>
<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">${senders.filter((x) => x.id !== Number(defaults.sender_id ?? 0)).map((x) => `<label class="small" style="display:flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" name="email_sender_ids" value="${x.id}" ${String(defaults.email_sender_ids ?? "").split(",").includes(String(x.id)) ? "checked" : ""} style="width:auto">${esc(x.label || x.company)}（${esc(x.smtp_user || x.email)}）</label>`).join("")}</div>` : ""}
<div class="row3"><div><label>同じ会社への再送を止める期間（日・0で制限なし）</label><input type="number" name="resend_days" value="${d("resend_days", 90)}" min="0"></div><div><label>「営業お断り」のサイト</label><select name="ignore_refusal"><option value="0" ${Number(defaults.ignore_refusal ?? 0) ? "" : "selected"}>送らない（推奨）</option><option value="1" ${Number(defaults.ignore_refusal ?? 0) ? "selected" : ""}>送る（クレームの恐れあり）</option></select></div><div></div></div>
<h2>資料の添付（任意）</h2>
<p class="muted">メール送信では下のファイルを添付します。フォーム送信ではファイルを添付できないため、代わりに「資料の公開リンク」を本文末尾に自動で載せます（本文に {{資料リンク}} を書けばその位置に入ります）。</p>
<div class="row"><div><label>資料ファイル（メール添付用・PDF等）</label><input type="file" name="material_file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg">${defaults.attach_name ? `<p class="muted small" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">現在の添付: <b>${d("attach_name")}</b>（新しいファイルを選ぶと置き換わります）${editId ? `<input type="hidden" name="remove_attach" value="0"><button type="button" class="btn sub small" data-n="${d("attach_name")}" onclick="if(confirm('添付ファイル「' + this.dataset.n + '」を削除します。以後のメールは添付なしで送られます（画面のほかの変更も一緒に保存されます）。よろしいですか？')){var f=this.form;f.querySelector('input[name=remove_attach]').value='1';f.querySelectorAll('[required]').forEach(function(x){x.removeAttribute('required')});if(f.requestSubmit){f.requestSubmit()}else{f.submit()}}">添付を削除</button>` : ""}</p>` : ""}</div><div><label>資料の公開リンク（フォーム本文用・URL）</label><input type="url" name="material_url" value="${d("material_url")}" placeholder="https://（Googleドライブ等の共有リンク）"><label class="inline small" style="display:flex;gap:6px;align-items:center;margin-top:6px;font-weight:400"><input type="checkbox" name="material_url_in_email" value="1" style="width:auto" ${Number((defaults as { material_url_in_email?: number }).material_url_in_email ?? 0) ? "checked" : ""}> メールの本文にもこのリンクを載せる</label><p class="muted small" style="margin:2px 0 0">重い資料を添付すると、相手が受け取れずに戻ってきたり、Gmailが一時停止されやすくなります。メールでもリンクで送る場合は、ここにチェックを入れて上の添付を削除してください。</p><p class="muted small">このアプリは各自のPCで動くため、アップロードしたファイルに外部から見えるURLは付けられません。フォーム用にはドライブ等で共有した公開リンクを貼ってください。</p></div></div>
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

export function campaignView(c: Campaign & { sender: SenderProfile }, jobs: Job[], counts: Record<string, number>, running: boolean, provider: string, extra: { preview?: { job: Job; subject: string; message: string; aiUsed: boolean; lint?: Lint[]; emailHtml?: string } | null; windowOk: boolean; sentToday: number; emailSentToday: number; scanning: boolean; unscanned: number; scanned: number; statusFilter?: string; qFilter?: string; outcomeFilter?: string; impFilter?: string; sortKey?: string; eta?: string; ab?: { variant: string; sent: number; replied: number; appo: number }[]; undo?: { id: number; label: string; rows_count: number } | null; matched?: { n: number; sent: number }; attempts?: Record<string, number>; outcomes: Record<string, number>; lastImport?: import("./csv.js").ImportSummary | null; retryTargets?: { id: number; company_name: string; status: string; result_text: string }[]; emailQueued?: number; period?: { todayForm: number; todayEmail: number; monthForm: number; monthEmail: number }; emailPaused?: { until: number; reason: string } | null; reactions?: { id: number; company_name: string; domain: string; email: string; channel: string; outcome: string; outcome_note: string; updated_at: string }[]; imports?: { key: string; label: string; at: string; total: number; sent: number; queued: number }[]; replyScan?: { enabled: boolean; checkedAt: string | null; error: string; checking: boolean } }) {
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
  return `${extra.undo ? `<div class="card" style="background:#FFF3E0;border-color:var(--warn)"><b>直前の削除: ${esc(extra.undo.label)}（${extra.undo.rows_count}件）</b>
<form method="post" action="/undo/${extra.undo.id}" class="inline" style="margin-left:10px" data-busy><button class="btn">削除を元に戻す</button></form>
<p class="muted small" style="margin:6px 0 0">まちがえて消した場合は30分以内にここから戻せます（スクリーンショットの画像は戻りません）。</p></div>` : ""}
<h1>${esc(c.name)} <span class="tag">${c.status}</span> ${running ? '<span class="tag sending">実行中</span>' : ""} <a class="btn sub small" href="/campaigns/${c.id}/edit" style="vertical-align:middle">✏️ 編集</a></h1>
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
    return `<div class="stats"><div class="stat">全件<b>${total}<span style="font-size:12px;font-weight:400">社</span></b><span class="muted small">重複除く</span></div>${tile("待機", ["queued"])}${tile("送信済", ["sent"], "var(--ok)")}${tile("失敗", ["failed"], "var(--ng)")}${tile("フォーム無し", ["skip_no_form"])}${tile("お断り", ["skip_refused"])}${tile("CAPTCHA", ["skip_captcha"])}${tile("除外/重複", ["skip_suppressed", "skip_duplicate", "skip_optout"])}${(() => {
      // 「返信0／アポ1」だと、アポも返信の一種なのに別々に見えて分かりにくかった。合計と内訳で出す
      const app = extra.outcomes.appointment ?? 0, dec = extra.outcomes.declined ?? 0, other = extra.outcomes.replied ?? 0;
      const all = app + dec + other;
      const sent = cnt("sent");
      const rate = sent ? (all / sent) * 100 : 0;
      const rateText = !sent ? "" : all === 0 ? "返信率 0%" : rate < 0.1 ? "返信率 0.1%未満" : `返信率 ${rate.toFixed(1)}%`;
      // アポと断りが一番知りたい数字なので大きく出す（合計と返信率は下に小さく）
      return `<div class="stat"><a href="#reactions" style="color:inherit">反応</a><b style="font-size:24px;line-height:1.25">アポ <span style="color:var(--ok)">${app}</span><span style="font-weight:400;color:#bbb">／</span>断り <span style="color:var(--ng)">${dec}</span></b><span class="muted small">返信 合計${all}社（その他${other}）${rateText ? `／${rateText}` : ""}</span></div>`;
    })()}</div>
${(() => {
      // 今日・今月の送信数。ペースを把握して上限に当たる前に気づけるように（詳しい推移は「送信数」画面へ）
      const p = extra.period;
      if (!p) return "";
      const box = (label: string, form: number, email: number) => `<div class="stat">${label}の送信<b>${form + email}<span style="font-size:12px;font-weight:400">社</span></b><span class="muted small">フォーム${form}・メール${email}</span></div>`;
      return `<div class="stats" style="margin-top:0">${box("今日", p.todayForm, p.todayEmail)}${box("今月", p.monthForm, p.monthEmail)}</div>
<p class="small" style="margin:6px 0 0"><a href="/stats?campaign=${c.id}">日別・月別の推移を見る →</a></p>`;
    })()}${replyScanLine()}`;
  })()}

${(() => {
    // 反応（返信あり・アポ・断り）の一覧。自動判定は「どの言葉・本文のどこで判定したか」をメモから見せ、間違いはここから取り消せる
    const list = extra.reactions ?? [];
    if (!list.length) return "";
    const color: Record<string, string> = { appointment: "var(--ok)", declined: "var(--ng)", replied: "" };
    return `<div class="card" id="reactions"><details ${list.length <= 30 ? "open" : ""}><summary style="cursor:pointer"><h2 style="display:inline;margin:0">反応の一覧（${list.length}社）</h2></summary>
<p class="muted small" style="margin:8px 0">「自動」は受信箱の返信からキーワードで判定したものです。判定の根拠（キーワードと本文の該当部分）を確認し、間違っていたら選んで「判定を取り消す」を押してください（会社や送信記録は消えません。自動の「断り」で入った除外リストも外れます）。</p>
<form method="post" action="/campaigns/${c.id}/outcomes/clear" onsubmit="return confirm(this.querySelectorAll('input[name=ids]:checked').length + '社の反応の判定を取り消します。よろしいですか？')">
<p style="margin:0 0 6px"><button class="btn danger small">選択した判定を取り消す</button></p>
<div style="overflow-x:auto"><table><tr><th><input type="checkbox" title="全選択" onchange="this.closest('table').querySelectorAll('input[name=ids]').forEach(function(x){x.checked=event.target.checked})"></th><th>会社</th><th>反応</th><th>判定</th><th>根拠・メモ</th><th>更新</th></tr>
${list.map((r) => {
      const auto = r.outcome_note.startsWith("自動判定");
      // v0.3.63〜0.3.69 の自動判定メモは受信時刻が世界標準時（末尾に「違っていたら…」が付く）なので東京時刻に直して見せる
      const oldFmt = / 違っていたら下のボタンで直してください$/.test(r.outcome_note);
      const note = auto ? r.outcome_note.replace(/^自動判定（キーワード: /, "キーワード: ").replace(/）(\d{4}-\d\d-\d\d \d\d:\d\d)/, (_m: string, t: string) => ` ／ 受信 ${oldFmt ? jst(t + ":00") : t}`).replace(/ 違っていたら下のボタンで直してください$/, "") : r.outcome_note;
      return `<tr><td><input type="checkbox" name="ids" value="${r.id}"></td><td><a href="/jobs/${r.id}">${esc(r.company_name)}</a><br><span class="muted small">${esc(r.email || r.domain)}</span></td><td><b style="${color[r.outcome] ? `color:${color[r.outcome]}` : ""}">${esc(OUTCOME_LABEL[r.outcome] ?? r.outcome)}</b></td><td class="small">${auto ? '<span class="tag">自動</span>' : '<span class="tag">手動</span>'}</td><td class="small" style="min-width:260px">${esc(note) || '<span class="muted">―</span>'}</td><td class="small">${esc(jst(r.updated_at))}</td></tr>`;
    }).join("")}
</table></div></form></details></div>`;
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
<p><button class="btn primary">取り込む</button> <a class="btn sub small" href="/template.csv">見本のCSVをダウンロード</a> <a class="small" href="/guide#step-list" target="_blank" rel="noopener">フォーム無し・失敗を減らすには？（AIでリストを整えるプロンプト）</a></p></form>
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
${extra.scanning ? `<form method="post" action="/campaigns/${c.id}/stop-scan" class="inline"><button class="btn danger">チェックを止める</button></form>` : `<form method="post" action="/campaigns/${c.id}/scan" class="inline"><button class="btn sub" ${extra.unscanned === 0 || running ? "disabled" : ""}>事前チェックを実行（未チェック ${extra.unscanned}社）</button></form>`}
${cnt("skip_no_form") > 0 && !extra.scanning && !running ? `<form method="post" action="/campaigns/${c.id}/rescan-noform" class="inline" onsubmit="return confirm('「フォーム無し」の ${cnt("skip_no_form")} 社を、もう一度チェックし直します（サイトマップ・フッター・外部フォームサービスにも対応した探し方で探します）。このあと「事前チェックを実行」を押してください。よろしいですか？')"><button class="btn sub">フォーム無しの ${cnt("skip_no_form")} 社をもう一度チェックする</button></form>
<p class="muted small" style="margin:6px 0 0">フォームの探し方を強化しています（サイトマップ・フッターのリンク・会社概要ページ経由・外部フォームサービス・URLの言い換え）。以前「フォーム無し」になった会社も、もう一度探すと見つかることがあります。</p>` : ""}</div>

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
${extra.preview ? `<p class="muted">${esc(extra.preview.job.company_name)}（${esc(extra.preview.job.industry)}）向け ${extra.preview.aiUsed ? "・AI生成あり" : "・テンプレのみ"}</p><p><b>件名:</b> ${esc(extra.preview.subject)}</p>${(extra.preview.lint ?? []).map((l) => `<div class="small" style="color:${l.level === "error" ? "var(--ng)" : "var(--warn)"}">${l.level === "error" ? "✕" : "△"} ${esc(l.text)}</div>`).join("")}<pre>${esc(extra.preview.message)}</pre>
${extra.preview.emailHtml ? `<h2 style="font-size:14px;margin-top:16px">相手のメールソフトでの見え方（#70）</h2>
<div style="border:1px solid var(--hive-200);border-radius:10px;overflow:hidden;max-width:660px">
  <div style="background:#F5F2EA;padding:10px 12px;border-bottom:1px solid var(--hive-200);font-size:12px;line-height:1.8">
    <div><b>差出人:</b> ${esc(c.sender.company)} &lt;${esc(c.sender.from_email || c.sender.smtp_user || c.sender.email)}&gt;</div>
    <div><b>宛先:</b> ${esc(extra.preview.job.email || "（この会社のメールアドレス）")}</div>
    <div><b>件名:</b> ${esc(extra.preview.subject)}</div>
  </div>
  <div style="padding:14px;background:#fff">${extra.preview.emailHtml}</div>
</div>
<p class="muted small">署名・住所・配信停止の案内は、法律で必要なため自動で入ります。フォーム送信では本文だけが送られます。</p>` : ""}` : ""}
</div>

<div class="card"><h2 style="margin-top:0">3. 本送信${c.send_only ? ` <span class="tag">対象: ${c.send_only === "email" ? "メールの会社だけ" : "フォームの会社だけ"}</span>` : ""}</h2>
${extra.emailPaused ? `<div class="flash" style="border-color:var(--ng);margin:0 0 12px"><b>⏸ メール送信を一時停止中</b>（${esc(new Date(extra.emailPaused.until).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))} に自動で再開）<br><span class="small">${esc(extra.emailPaused.reason)}</span><br><span class="small muted">この送信者のメールの会社は「待機」のまま残しています（失敗にはしていません）。フォームの送信は続きます。原因を直したら「今すぐ再開」を押してください。Gmailが一時停止されている場合は、解除されるまで待ってから再開してください。</span>
<form method="post" action="/campaigns/${c.id}/email-resume" style="margin-top:6px"><button class="btn sub small">今すぐ再開</button></form></div>` : ""}
${total > 0 ? `<div class="bar"><i id="sendfill" style="width:${sendPct}%"></i></div><div class="small muted" id="sendtext">処理済み ${processed} / ${total} 社（${sendPct}%）</div>${extra.eta ? `<div class="small muted">${esc(extra.eta)}</div>` : ""}` : ""}
${running ? `<form method="post" action="/campaigns/${c.id}/pause" class="inline"><button class="btn danger">一時停止</button></form>` : `<form method="post" action="/campaigns/${c.id}/start" class="inline" data-busy><button class="btn" data-busytext="送信を開始しています…">開始する（${cnt("queued")}件）</button> <label class="inline small">対象: <select name="only" style="width:auto;padding:4px 8px"><option value="" ${c.send_only ? "" : "selected"}>すべて（フォーム＋メール）</option><option value="email" ${c.send_only === "email" ? "selected" : ""}>メールの会社だけ</option><option value="form" ${c.send_only === "form" ? "selected" : ""}>フォームの会社だけ</option></select></label> <label class="inline small"><input type="checkbox" name="ignore_window" value="1"> 時間帯を無視して今すぐ送る</label></form>
<p class="muted small" style="margin:6px 0 0">フォームは「1-b. 事前チェック」を済ませてから送ると、フォーム無しの会社に無駄な時間を使いません。<b>メールだけ先に送りたいときは「対象: メールの会社だけ」</b>を選んでください（この設定は次に開始し直すまで続きます）。</p>`}
${nRetry > 0 ? `<form method="post" action="/campaigns/${c.id}/requeue-failed" class="inline" onsubmit="return confirm('失敗・フォーム無しの ${nRetry} 社を待機中に戻します（会社ごとに最新の結果が失敗のものだけ）。このあと「開始」で再送信できます。よろしいですか？')"><button class="btn sub">失敗した会社を再送信（${nRetry}社）</button></form> ${extra.retryTargets && extra.retryTargets.length ? `<details class="small" style="display:inline-block;vertical-align:middle;margin-right:8px"><summary style="cursor:pointer;color:var(--ng)">対象の会社を見る（${extra.retryTargets.length}社）</summary><ul style="margin:6px 0 0;padding-left:1.2em;max-height:220px;overflow:auto;text-align:left">${extra.retryTargets.map((t) => `<li><a href="/jobs/${t.id}">${esc(t.company_name)}</a> <span class="muted">${(STATUS_LABEL as Record<string, string>)[t.status] ?? t.status}：${esc((t.result_text || "").split("\n")[0].slice(0, 50))}</span></li>`).join("")}</ul></details>` : ""}` : ""}${cnt("queued") > 0 ? `<form method="post" action="/campaigns/${c.id}/cancel-queued" class="inline" onsubmit="return confirm('待機中の ${cnt("queued")} 件をすべてキャンセルします。よろしいですか？（送信済みには影響しません）')"><button class="btn danger">待機中を一括キャンセル（${cnt("queued")}件）</button></form> ` : ""}<button class="btn sub" id="csvbtn" onclick="foExportCsv()">結果をCSVで書き出す</button> <a class="btn sub" href="/campaigns/${c.id}/export.json" title="別のPCのアポハッチくんで、同じ文面・設定のキャンペーンを作れます">設定をファイルに書き出す</a> <a class="btn sub" href="/campaigns/${c.id}/manual.csv">手動送信リスト（CAPTCHA・失敗分をURL＋文面つきで）</a>
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
${(extra.ab ?? []).length >= 2 ? `<div class="card"><h2 style="margin-top:0">A/Bテストの結果</h2>
<table><tr><th>文面</th><th>送信</th><th>返信＋アポ</th><th>アポ</th><th>反応率</th></tr>
${(extra.ab ?? []).map((r) => `<tr><td><b>${esc(r.variant)}</b>${r.variant === "A" ? "（本文）" : "（本文B）"}</td><td>${r.sent}</td><td>${r.replied}</td><td>${r.appo}</td><td>${r.sent ? `${((r.replied / r.sent) * 100).toFixed(1)}%` : "-"}</td></tr>`).join("")}
</table>
<p class="muted small" style="margin:8px 0 0">件数が少ないうちは差が出ても偶然のことがあります。目安として、どちらも100件以上送ってから比べてください。</p></div>` : ""}
<p class="muted">背景が黄色の行は、前回このページを見たあとに状況が更新された会社です。失敗行の橙色ラベルはエラーの種類です。</p>
${(() => {
    // 列の見出しから並び替え（#51）。いまの絞り込みは保ったまま sort だけ付け替える
    const base = `/campaigns/${c.id}?status=${encodeURIComponent(extra.statusFilter ?? "")}&outcome=${encodeURIComponent(extra.outcomeFilter ?? "")}&q=${encodeURIComponent(extra.qFilter ?? "")}&imp=${encodeURIComponent(extra.impFilter ?? "")}`;
    const link = (key: string, label: string) => `<a href="${base}&sort=${key}#list" style="color:inherit;text-decoration:${(extra.sortKey ?? "") === key ? "underline" : "none"}">${label}${(extra.sortKey ?? "") === key ? " ▾" : ""}</a>`;
    return `<table><tr><th><input type="checkbox" title="全選択" onchange="foSelAll(this)"></th><th>${link("id", "ID")}</th><th>${link("company", "会社")}</th><th>${link("score", "送り方")}</th><th>業種</th><th>${link("status", "状態")}</th><th>結果</th><th>反応</th><th>${link("updated", "更新")}</th><th></th></tr>`;
  })()}
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
    const repRow = (j: Job, hist: Job[]) => `<tr data-u="${esc(j.updated_at ?? "")}"><td>${j.is_test ? "" : `<input type="checkbox" name="ids" value="${j.id}" form="bulkdel" onchange="foBulkCount()">`}</td><td>${j.id}${j.is_test ? " <span class='tag'>test</span>" : ""}</td><td><a href="/jobs/${j.id}">${esc(j.company_name)}</a><br><span class="muted">${esc(j.domain)}</span></td><td class="small">${j.channel === "email" ? "✉ メール" : "📝 フォーム"}${scoreTag(j)}</td><td class="small">${esc(j.sub_industry || j.industry)}</td><td>${statusCell(j)}${hist.length ? `<br><button type="button" class="histbtn" data-t="${j.id}" data-n="${hist.length}" onclick="foHist(this)">▽(${hist.length}件)</button>` : ""}</td><td class="small">${errKindTag(j)}${esc((j.result_text || "").split("\n")[0].slice(0, 70))}</td><td class="small">${j.outcome ? `<b>${esc(OUTCOME_LABEL[j.outcome] ?? j.outcome)}</b>` : ""}</td><td class="small">${esc(jst(j.updated_at))}</td><td>${j.status === "queued" ? `<form method="post" action="/jobs/${j.id}/cancel" class="inline"><button class="btn sub small">キャンセル</button></form>` : j.status === "failed" || j.status === "skip_no_form" ? `<a class="btn sub small" href="/jobs/${j.id}#fix">修正して再送信</a>` : ""} ${j.is_test ? "" : `<form method="post" action="/jobs/${j.id}/delete" class="inline" data-n="${esc(j.company_name)}" onsubmit="return confirm(this.dataset.n + ' の記録${hist.length ? `（履歴${hist.length}件を含む）` : ""}をすべて送信一覧から削除します（取り消せません）${j.status === "sent" || hist.some((h) => h.status === "sent") ? "。送信済みの記録も消え、この会社への再送防止が効かなくなります" : ""}。よろしいですか？')"><button class="btn sub small" title="この会社の記録をすべて削除">削除</button></form>`}</td></tr>`;
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
<form method="post" action="/campaigns/${c.id}/import-confirm" class="inline" data-busy><button class="btn primary" data-busytext="取り込み中…">この内容で取り込む（${rows.length}行）</button></form>
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

/** この会社とのやり取りの履歴（#56）。同じ会社に別のキャンペーンから送った分も時系列で見せる。
 *  対応漏れや二重送信に気づけるようにするためのもの */
export type JobHistory = { id: number; campaign_name: string; channel: string; status: string; result_text: string; sent_at: string | null; updated_at: string; outcome: string; outcome_note: string };

export function jobView(j: Job, c: Campaign, history: JobHistory[] = []) {
  const timeline = history.length <= 1 ? "" : `<div class="card"><h2 style="margin-top:0">この会社とのやり取り（${history.length}件）</h2>
<p class="muted small" style="margin:0 0 10px">同じ会社に、別のキャンペーンから送ったぶんも含めて、新しい順に並べています。</p>
<ul style="list-style:none;padding:0;margin:0;border-left:2px solid var(--hive-200)">
${history.map((h) => `<li style="padding:6px 0 10px 14px;position:relative">
  <span style="position:absolute;left:-7px;top:12px;width:10px;height:10px;border-radius:50%;background:${h.status === "sent" ? "var(--ok)" : h.status === "failed" ? "var(--ng)" : "var(--honey)"}"></span>
  <span class="small muted">${esc(jst(h.sent_at || h.updated_at))}</span> ${statusTag(h.status as JobStatus)} <span class="small">${h.channel === "email" ? "✉ メール" : "📝 フォーム"}／${esc(h.campaign_name)}</span>
  ${h.id === j.id ? '<span class="tag">いま見ている記録</span>' : `<a class="small" href="/jobs/${h.id}">詳細</a>`}
  <div class="small muted">${esc((h.result_text || "").split("\n")[0].slice(0, 90))}</div>
  ${h.outcome ? `<div class="small"><b>反応: ${esc(OUTCOME_LABEL[h.outcome] ?? h.outcome)}</b> ${esc((h.outcome_note || "").slice(0, 80))}</div>` : ""}
</li>`).join("")}
</ul></div>`;
  return `<h1>${esc(j.company_name)} ${statusTag(j.status)}</h1>
<p><a href="/campaigns/${c.id}">← ${esc(c.name)}</a></p>
${timeline}
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
<p><button class="btn primary">修正して再送信</button> <button class="btn sub" name="via" value="email" formnovalidate>メールで送信</button> <span class="muted small">「メールで送信」は、フォームをあきらめて上のメール宛てに送ります。送信には10〜30秒かかります</span></p></form></div>` : ""}
<form method="post" action="/suppressions" class="inline"><input type="hidden" name="domain" value="${esc(j.domain)}"><input type="hidden" name="reason" value="手動（${esc(j.company_name)}）"><button class="btn danger">このドメインを除外</button></form>
${j.status === "sent" ? `<h2>反応を記録</h2><form method="post" action="/jobs/${j.id}/outcome"><p>${[["replied", "返信あり"], ["appointment", "アポ獲得"], ["declined", "断り・不要（今後送らない）"], ["", "取り消し"]].map(([k, l]) => `<button class="btn ${j.outcome === k && k ? "" : "sub"} small" name="outcome" value="${k}">${l}</button>`).join(" ")}</p><input type="text" name="note" value="${esc(j.outcome_note)}" placeholder="メモ（返信内容・次のアクション）"></form>` : ""}
<h2>送った文面</h2><pre>${esc(j.message_used)}</pre></div>
<div class="card"><h2 style="margin-top:0">スクリーンショット</h2>${j.screenshot_path ? `<img src="/screenshots/${esc(j.screenshot_path.split("/").pop())}" style="max-width:100%;border:1px solid #ddd;cursor:zoom-in" onclick="foZoom(this.src)" title="クリックで拡大">
<p class="muted small">画像をクリックすると大きく表示します。</p>
<div id="fozoom" hidden style="position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out" onclick="this.hidden=true"><img id="fozoomimg" style="max-width:100%;max-height:100%;box-shadow:0 10px 40px rgba(0,0,0,.5);background:#fff"></div>
<script>function foZoom(src){const b=document.getElementById("fozoom");document.getElementById("fozoomimg").src=src;b.hidden=false;}
addEventListener("keydown",(e)=>{if(e.key==="Escape"){const b=document.getElementById("fozoom");if(b)b.hidden=true;}});</script>` : '<p class="muted">なし</p>'}
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
  imported?: { added: number; already: number; noKey: number; noKeyNames: string[] },
  sync?: { url: string; lastAt?: string; lastResult?: string } | null,
  extra?: { industries: string; replyRules: { id: number; phrase: string; outcome: string; source: string }[]; share?: { sentPullUrl: string; pushUrl: string; member: string; lastPull: string; lastResult: string; sharedCount: number; configured: boolean; script: string } }
) {
  return `<h1>除外リスト</h1>
<div class="card"><h2 style="margin-top:0">送りたくない業種・キーワード</h2>
<p class="muted small" style="margin:0 0 8px">ここに書いた言葉が<b>会社名・業界・小業界</b>に含まれる会社には送りません（取り込みのときと、送信の直前に確認します）。1行に1つ、または読点区切り。例: 病院／クリニック／法律事務所／税理士／宗教／学校法人</p>
<form method="post" action="/suppressions/industries" data-busy>
<textarea name="industries" style="min-height:90px" placeholder="病院&#10;クリニック&#10;法律事務所">${esc(extra?.industries ?? "")}</textarea>
<p><button class="btn sub">保存する</button> <span class="muted small">官公庁・自治体・学校のドメイン（.go.jp / .lg.jp / .ac.jp / .ed.jp）は、設定に関係なく最初から除外しています。</span></p></form></div>
${extra?.replyRules?.length ? `<div class="card"><h2 style="margin-top:0">返信の自動判定が覚えた言い回し（${extra.replyRules.length}件）</h2>
<p class="muted small" style="margin:0 0 8px">自動判定を手で直したとき、その返信の言い回しを覚えています。次から同じ言い回しのメールは、直した側に振り分けます。おかしなものは削除してください。</p>
<table><tr><th>言い回し</th><th style="width:110px">振り分け</th><th style="width:160px">覚えた相手</th><th style="width:70px"></th></tr>
${extra.replyRules.map((r) => `<tr><td>${esc(r.phrase)}</td><td>${esc(OUTCOME_LABEL[r.outcome] ?? r.outcome)}</td><td class="small muted">${esc(r.source)}</td><td><form method="post" action="/reply-rules/${r.id}/delete" class="inline"><button class="btn sub small">削除</button></form></td></tr>`).join("")}
</table></div>` : ""}
${(() => {
    // チームで別々のPCに入れている場合、断りの会社を1つのスプレッドシートで共有して、各自が自動で取り込めるようにする
    const last = sync?.lastAt ? new Date(sync.lastAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    return `<div class="card" style="background:var(--honey-50)"><h2 style="margin-top:0">共有の除外リスト（チームで同じNGリストを使う）</h2>
<p class="muted small" style="margin:0 0 10px">Googleスプレッドシートを1つ「共有NGリスト」に決めて、そのURLを登録すると、<b>1日1回そこから自動で取り込みます</b>（起動から2分後にも1回）。チームの全員が同じURLを登録すれば、誰かが追加した断り先が全員に行き渡ります。<br>シートは「リンクを知っている全員（閲覧可）」にし、1行目を見出し（会社名 / ドメイン / メール など）にしてください。</p>
<form method="post" action="/suppressions/sync-url" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
<input type="url" name="sheet_url" value="${esc(sync?.url ?? "")}" placeholder="https://docs.google.com/spreadsheets/d/…" style="flex:1;min-width:320px">
<button class="btn sub small">保存</button></form>
${sync ? `<form method="post" action="/suppressions/sync-now" style="margin-top:8px" data-busy><button class="btn sub small" data-busytext="取り込み中…">今すぐ取り込む</button> <span class="muted small">${last ? `最終取り込み: ${esc(last)}` : "まだ取り込んでいません"}${sync.lastResult ? ` ／ ${esc(sync.lastResult)}` : ""}</span></form>
<p class="muted small" style="margin:6px 0 0">解除するには、URLを空にして「保存」を押してください。</p>` : ""}</div>`;
  })()}
${extra?.share ? `<div class="card" style="background:var(--honey-50)"><h2 style="margin-top:0">チームで共有する（送信済み・除外の双方向）</h2>
<p class="muted small" style="margin:0 0 10px">
  <b>送信済みの共有</b>（#78）: 誰かが送った会社には、ほかのメンバーは送らなくなります（取り込み時と送信直前に確認）。<br>
  <b>除外の書き戻し</b>（#79）: 自分が追加した断り先を、共有シートへ自動で書き出します。<br>
  1つのGoogleスプレッドシートをチームで共有し、全員が同じURLを登録してください。1日1回（起動から3分後にも1回）同期します。
</p>
<form method="post" action="/share/settings">
<label>① 共有シートの「送信済み」を読むURL（スプレッドシートの共有URL）</label>
<input type="url" name="sent_pull_url" value="${esc(extra.share.sentPullUrl)}" placeholder="https://docs.google.com/spreadsheets/d/…">
<label>② 書き込み用のURL（Apps Script のウェブアプリURL）</label>
<input type="url" name="push_url" value="${esc(extra.share.pushUrl)}" placeholder="https://script.google.com/macros/s/…/exec">
<label>③ あなたの名前（誰が送ったか分かるように）</label>
<input type="text" name="member" value="${esc(extra.share.member)}" placeholder="例: 田中" style="max-width:260px">
<p style="margin-top:10px"><button class="btn sub">保存する</button>
${extra.share.configured ? `</form><form method="post" action="/share/sync-now" class="inline" data-busy><button class="btn sub" data-busytext="同期中…">今すぐ同期する</button></form>` : "</form>"}
</p>
${extra.share.lastResult ? `<p class="muted small">最終同期: ${esc(extra.share.lastPull)} ／ ${esc(extra.share.lastResult)}</p>` : ""}
${extra.share.sharedCount ? `<p class="small">共有リストに入っている「送信済みの会社」: <b>${extra.share.sharedCount}社</b></p>` : ""}
<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">書き込み用URLの作り方（Apps Script のコード）</summary>
<ol class="small" style="line-height:1.9">
<li>共有に使うスプレッドシートを開き、「拡張機能 → Apps Script」を選ぶ</li>
<li>出てきたコード欄を全部消して、下のコードを貼り付けて保存する</li>
<li>右上の「デプロイ → 新しいデプロイ → 種類: ウェブアプリ」を選び、<b>アクセスできるユーザー: 全員</b> にしてデプロイ</li>
<li>表示された <code>https://script.google.com/macros/s/…/exec</code> を、上の②に貼る（チーム全員が同じURLを使います）</li>
</ol>
<textarea readonly style="min-height:220px;font-family:monospace;font-size:11px">${esc(extra.share.script)}</textarea>
</details></div>` : ""}
<p class="muted">ここに登録した会社には、全キャンペーンで送りません。営業お断りを検知した先は自動で追加されます。返信で「今後不要」と言われた先も必ず追加してください。</p>
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
<p><button class="btn primary">取り込む</button></p></form>
<p class="muted small">除外リストはPCごとに独立しています。別のメンバーと共有したいときは、下のボタンでCSVに書き出し、相手はこの「CSVでまとめて追加」から取り込めます（列はそのまま合います）。</p>
${rows.length ? '<a class="btn sub" href="/suppressions/export.csv">除外リストをCSVで書き出す</a>' : ""}</div>

<table><tr><th>会社名</th><th>ドメイン</th><th>メール</th><th>電話</th><th>理由</th><th>登録</th><th></th></tr>${rows.length ? rows.map((r) => `<tr><td>${esc(r.company_name || "―")}</td><td>${esc(r.domain ?? "―")}</td><td class="small">${esc(r.email ?? "―")}</td><td class="small">${esc(r.tel || "―")}</td><td class="small">${esc(r.reason)}</td><td class="small">${esc(jst(r.created_at))}</td><td><form method="post" action="/suppressions/${r.id}/delete" class="inline"><button class="btn sub small">削除</button></form></td></tr>`).join("") : `<tr><td colspan="7" class="muted">まだ登録がありません。</td></tr>`}</table>
<h2>メール配信停止（アドレス単位）</h2><p class="muted">上の欄にメールアドレスを入れて追加すると、そのアドレス宛てのメールを停止します。返信で「配信停止」と言われた相手は必ず入れてください。</p>
<table><tr><th>メール</th><th>理由</th><th>登録</th></tr>${optouts.map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.reason)}</td><td class="small">${esc(jst(r.created_at))}</td></tr>`).join("")}</table>`;
}

export function settingsView(ngWords: string[], ai: import("./message.js").AiConfig, stats?: { senders: number; campaigns: number; companies: number; sent: number; suppressions: number; optouts: number }, gameEnabled = false, notifyOn = true, aiBudget?: { usage: import("./message.js").AiUsage; limit: number }, license?: { status: import("./license.js").LicenseStatus; key: string; enforce: boolean }, opts?: { effects: boolean; notifyReply: boolean; dailySummary: boolean }) {
  // ライセンス（#90）
  const licenseCard = license ? `<div class="card"><h2 style="margin-top:0">ライセンス</h2>
<p>${license.status.state === "valid" ? `<span class="tag sent">有効</span>` : license.status.state === "expired" ? `<span class="tag failed">期限切れ</span>` : license.status.state === "invalid" ? `<span class="tag failed">キーが不正</span>` : `<span class="tag queued">未登録</span>`} ${esc(license.status.label)}</p>
<form method="post" action="/settings/license">
<label>ライセンスキー（配布元から受け取った APO1… で始まる1行）</label>
<input type="text" name="key" value="${esc(license.key)}" placeholder="APO1.xxxxx.xxxxx">
<p style="margin-top:8px"><button class="btn sub">保存する</button></p></form>
<form method="post" action="/settings/license-enforce" style="margin-top:6px">
<label style="display:flex;align-items:center;gap:8px;font-weight:400"><input type="checkbox" name="enforce" value="1" ${license.enforce ? "checked" : ""} onchange="this.form.submit()" style="width:auto">
ライセンスが無い・期限切れのときは、1日50件までに制限する</label></form>
<p class="muted small" style="margin:6px 0 0">チェックを外していれば、ライセンスの状態にかかわらず制限なく動きます（既定）。<br>キーには「宛先の会社名・台数・期限」だけが入っており、通信は行いません（オフラインで確認します）。</p></div>` : "";

  // AIの使用量と上限（#66）。「いくらかかるか読めない」のが不安でAIを使えない、という状態をなくす
  const budgetCard = aiBudget ? `<div class="card"><h2 style="margin-top:0">AIの利用料と上限</h2>
<div class="stats"><div class="stat"><span class="muted small">今月の目安</span><b>${Math.round(aiBudget.usage.jpy).toLocaleString("ja-JP")}円</b></div>
<div class="stat"><span class="muted small">呼び出し回数</span><b>${aiBudget.usage.calls.toLocaleString("ja-JP")}</b></div>
<div class="stat"><span class="muted small">入力トークン</span><b>${Math.round(aiBudget.usage.input / 1000).toLocaleString("ja-JP")}k</b></div>
<div class="stat"><span class="muted small">出力トークン</span><b>${Math.round(aiBudget.usage.output / 1000).toLocaleString("ja-JP")}k</b></div></div>
<form method="post" action="/settings/ai-budget" style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
<label style="margin:0">今月の上限（円・0で制限なし）</label>
<input type="number" name="limit" value="${aiBudget.limit}" min="0" step="100" style="width:140px">
<button class="btn sub small">保存</button></form>
<p class="muted small" style="margin:8px 0 0">上限に達すると、AIを使わずテンプレートの文面で送り続けます（送信は止まりません）。金額は1Mトークンあたりの目安単価から計算した<b>概算</b>です。正確な請求額は各社の管理画面でご確認ください。</p></div>` : "";
  const configured = ai.provider !== "none";
  // データの概要: 集計して表示するだけの追加カード。このブロックを消せば丸ごと外せる
  const overview = stats
    ? `<div class="card"><h2 style="margin-top:0">データの概要</h2>
<p class="muted">このPCに保存されている件数のまとめです（あなたが見られる範囲）。</p>
<div class="stats"><div class="stat">送信者<b>${stats.senders}</b></div><div class="stat">キャンペーン<b>${stats.campaigns}</b></div><div class="stat">登録企業<b>${stats.companies}<span style="font-size:12px;font-weight:400">社</span></b></div><div class="stat">送信済<b style="color:var(--ok)">${stats.sent}</b></div><div class="stat">除外リスト<b>${stats.suppressions}</b></div><div class="stat">配信停止<b>${stats.optouts}</b></div></div></div>`
    : "";
  const models = (p: "anthropic" | "gemini") => AI_MODELS[p].map((m) => `<option value="${m.id}" data-p="${p}" ${ai.model === m.id ? "selected" : ""}>${esc(m.label)}</option>`).join("");
  return `<h1>設定</h1>
${overview}${budgetCard}${licenseCard}
<div class="card"><h2 style="margin-top:0">送信が止まったときの通知</h2>
<p class="muted small">メール送信が一時停止したとき・送信が全部終わったとき・止まっていた送信を自動再開したときに、<b>パソコンの通知</b>（Macは通知センター、Windowsはトースト）でお知らせします。画面を見ていなくても気づけます。</p>
<form method="post" action="/settings/notify" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select name="notify_desktop" style="width:auto"><option value="1" ${notifyOn ? "selected" : ""}>通知する</option><option value="0" ${notifyOn ? "" : "selected"}>通知しない</option></select><button class="btn sub small">保存</button></form>
<form method="post" action="/settings/notify-test" style="margin-top:8px"><button class="btn sub small">テスト通知を出す</button></form>
<form method="post" action="/settings/notify-kinds" style="margin-top:14px;border-top:1px solid var(--c-line);padding-top:12px">
<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:4px 0"><input type="checkbox" name="notify_reply" value="1" ${opts?.notifyReply ? "checked" : ""} style="width:auto">アポ・返信が来たら、すぐに知らせる</label>
<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:4px 0"><input type="checkbox" name="daily_summary" value="1" ${opts?.dailySummary ? "checked" : ""} style="width:auto">1日の終わり（送信時間帯の終了時）に、その日のまとめを知らせる</label>
<button class="btn small" style="margin-top:6px">保存</button></form></div>
<div class="card"><h2 style="margin-top:0">画面の演出</h2>
<p class="muted">右下で動くキャラクター（ハッチくん・バッタくん）と、おまけのゲームの表示です。他社の方に使っていただく場合は、どちらも「表示しない」がおすすめです。</p>
<form method="post" action="/settings/effects" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><span style="min-width:150px">キャラクター</span><select name="effects_enabled" style="width:auto"><option value="0" ${opts?.effects ? "" : "selected"}>表示しない</option><option value="1" ${opts?.effects ? "selected" : ""}>表示する</option></select><button class="btn small">保存</button></form>
<div hidden><h2>おまけのゲーム</h2>
<p class="muted small">送信の待ち時間用のスロットゲームです。上のメニューに「🎰 ゲーム」を出すかどうかを選べます（人に画面を見せるときは共有用URLを使えば、オンでも表示されません）。</p>
</div><form method="post" action="/settings/game" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="min-width:150px">おまけのゲーム</span><select name="game_enabled" style="width:auto"><option value="0" ${gameEnabled ? "" : "selected"}>表示しない</option><option value="1" ${gameEnabled ? "selected" : ""}>表示する</option></select><button class="btn sub small">保存</button></form></div>
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

<div class="card"><h2 style="margin-top:0">NGワード（1行1語）</h2><form method="post" action="/settings"><textarea name="ng_words">${esc(ngWords.join("\n"))}</textarea><p><button class="btn primary">保存</button></p></form></div>

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
<p><button class="btn primary">変更する</button></p>
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
<p><button class="btn primary">発行する</button></p>
</form></div>
<h2>アカウント一覧</h2>
<table><tr><th>ID</th><th>ログインID</th><th>表示名</th><th>権限</th><th>状態</th><th>最終ログイン</th><th></th></tr>
${users.map((u) => `<tr>
<td>${u.id}</td>
<td><form method="post" action="/users/${u.id}/username" class="inline" style="display:flex;gap:4px;align-items:center" onsubmit="return confirm('ログインIDを変更します。本人に新しいIDを伝えてください。よろしいですか？')"><input type="text" name="username" value="${esc(u.username)}" pattern="[a-zA-Z0-9._-]{3,32}" title="半角英数字・._- の3〜32文字" style="width:150px;padding:3px 6px;font-family:inherit"><button class="btn sub small">変更</button></form></td>
<td>${esc(u.display_name)}</td>
<td>${u.role === "admin" ? "管理者" : "一般"}</td>
<td>${u.active ? '<span class="tag sent">有効</span>' : '<span class="tag">停止中</span>'}</td>
<td class="small">${esc(jst(u.last_login_at) || "―")}</td>
<td class="small">
<form method="post" action="/users/${u.id}/reset" class="inline" onsubmit="return confirm('パスワードを再発行します。よろしいですか？')"><button class="btn sub small">パスワード再発行</button></form>
<form method="post" action="/users/${u.id}/toggle" class="inline"><button class="btn sub small">${u.active ? "停止する" : "再開する"}</button></form>
</td></tr>`).join("")}
</table>
<p class="muted">ログインIDは、その場で書き換えて「変更」を押せば変えられます（本人に新しいIDを伝えてください。パスワードとデータはそのままです）。停止したアカウントはログインできなくなります（データは残ります）。一般ユーザーは自分が作ったキャンペーン・送信者・送信履歴だけが見えます。「営業お断り」の除外リストは安全のため全ユーザー共通で突合されます（画面に出るのは自分が登録した分だけです）。</p>`;
}

/** アップデート画面（管理者のみ） */
export function updateView(st: { current: string; latest?: string; notes?: string; available: boolean; configured: boolean; error?: string }, result?: { ok: boolean; log: string[]; version?: string; error?: string }, channel: "stable" | "beta" = "stable"): string {
  return `<h1>アップデート</h1>
<div class="card"><h2 style="margin-top:0">受け取る版</h2>
<form method="post" action="/settings/update-channel" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
<label class="inline" style="font-weight:400"><input type="radio" name="channel" value="stable" ${channel === "stable" ? "checked" : ""} onchange="this.form.submit()" style="width:auto"> 安定版（おすすめ）</label>
<label class="inline" style="font-weight:400"><input type="radio" name="channel" value="beta" ${channel === "beta" ? "checked" : ""} onchange="this.form.submit()" style="width:auto"> 先行版（新しい機能を先に試す）</label>
</form>
<p class="muted small" style="margin:8px 0 0">配布元は、まず先行版で出して問題がないことを確かめてから安定版にします。他社に渡したPCは「安定版」のままにしてください。</p></div>
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
/** 初めて使う人向けの「ご利用ガイド」。上から順に進めれば送信まで行けるようにする。
 *  画面のボタン名・見出しと言葉をそろえること（違うと探せない） */
export function guideView(isAdmin: boolean): string {
  const step = (n: string, title: string, body: string, link = "") => `<div class="card" id="step-${title === "営業リストを取り込む" ? "list" : n}" style="position:relative;padding-left:64px"><div style="position:absolute;left:16px;top:16px;width:34px;height:34px;border-radius:50%;background:var(--honey);color:#1C1710;font-weight:800;display:flex;align-items:center;justify-content:center">${n}</div><h2 style="margin-top:0">${title}</h2>${body}${link}</div>`;
  // ガイドを見ながら操作できるよう、ガイド内のリンクは別タブで開く
  const go = (href: string, label: string) => `<p style="margin:10px 0 0"><a class="btn sub small" href="${href}" target="_blank" rel="noopener">${label} ↗</a></p>`;
  return `<h1>ご利用ガイド</h1>
<div class="card" style="background:var(--honey-50);border-color:var(--honey)">
<b>初めての方へ</b>：<a href="/setup" target="_blank" rel="noopener">はじめの設定（6ステップ）↗</a> を上から順に進めれば、送信を開始できます。
うまく動かないときは <a href="/health" target="_blank" rel="noopener">動作チェック ↗</a>、送れなかった会社は <a href="/todo" target="_blank" rel="noopener">要対応 ↗</a> にまとまっています。
</div>
<p class="muted">アポハッチくんは、問い合わせフォームとメールへの営業送信を自動で行うツールです。初めての方は、<b>上から順番に</b>進めてください。各画面にも説明が書いてあります。</p>
<div class="card" style="background:var(--honey-50)"><b>全体の流れ</b>
<ol style="margin:6px 0 0;padding-left:1.3em;line-height:1.9"><li>送信者を登録</li><li>（任意）除外リストを登録</li><li>キャンペーンを作る</li><li>営業リストを取り込む</li><li>本送信を開始</li><li>結果と反応を確認</li></ol></div>

${step("1", "送信者を登録する", `<p>フォームに入力する「あなたの会社・担当者の情報」です。キャンペーンを作る前に必ず登録します。</p>
<ul style="line-height:1.8;margin:0;padding-left:1.2em"><li>会社名・担当者名（例: 田中 太郎）・担当者名フリガナ（例: タナカ タロウ）・メール・電話・住所・会社URL</li>
<li><b>メールでも送る場合</b>は「メールで送る場合の設定」に、送信用のGmail（Google Workspace）アドレスと<b>アプリパスワード</b>を入れ、「メール設定を確認」でOKになるか確かめます。<br><span class="muted small">アプリパスワードは <a href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noopener">2段階認証プロセス</a>（オンにする）→ <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">アプリパスワード</a> で作る英小文字16文字です（普段のログインパスワードではありません）。リンクは別タブで開きます。Google Workspace で「アプリパスワード」が出ない場合は、会社の管理者に2段階認証の許可を依頼してください。</span></li>
<li>メールで送る場合は<b>住所が必須</b>です（営業メールには送信者の名称・住所・配信停止の連絡先の表示が法律で必要なため、メールの末尾に自動で載ります）</li>
<li>「受信箱を読んで…自動で記録する」をオンにすると、送信用メールの受信箱を15分ごとに読み、返信や届かなかったメールを自動で記録します。個人のメールと兼用している場合はオフに</li>
<li>電話番号をフォームの必須欄だけに入れたい場合は、チェックで選べます</li></ul>`, go("/senders", "送信者ページを開く"))}

${step("2", "（任意）除外リストを登録する", `<p>既存のお客様や「送ってはいけない会社」を先に登録しておくと、取り込んでも送られません。スプレッドシートからの貼り付け・URL・CSVでまとめて登録できます。</p>
<p class="muted small">「営業お断り」と書かれたサイトや、配信停止・断りの返信があった会社は、自動でここに追加されます。</p>`, go("/suppressions", "除外リストを開く"))}

${step("3", "キャンペーンを作る", `<p>「この文面で、この会社たちに、この送り方で送る」という送信のまとまりです。</p>
<ul style="line-height:1.8;margin:0;padding-left:1.2em"><li><b>送信者</b>：手順1で登録したもの。メールの差出人・フォームの入力内容はこの送信者になります</li>
<li><b>送り方</b>：フォーム優先（無ければメール）／メール優先（無ければフォーム）／メールのみ／フォームのみ</li>
<li><b>文面</b>：「テンプレートのみ」は無料。AIを使うモードは設定画面でAIキーを登録した場合だけ選べ、AIの料金がかかります</li>
<li><b>1日の上限・送信時間帯</b>：メールは少なめに（作ったばかりのGmailは1日50〜100通から）。深夜の連続送信はアカウント停止の原因になります</li>
<li><b>資料</b>：重いPDFの添付より、Googleドライブ等の公開リンクがおすすめ（「メールの本文にもこのリンクを載せる」にチェック）</li>
<li><b>グループ</b>：フォーム用とメール用などに分けたキャンペーンで、同じ会社に重ねて送らないようにできます</li></ul>`, go("/campaigns/new", "新しいキャンペーンを作る"))}

${step("4", "営業リストを取り込む", `<p>キャンペーン画面の「1. リストを取り込む」から、CSV・Excel・貼り付け・Googleスプレッドシートのどれかで取り込みます。<b>最低限「企業名」と「企業URL」の2列</b>があればOKです（メールで送るなら「メール」列も）。</p>
<ul style="line-height:1.8;margin:0;padding-left:1.2em"><li>取り込む前にプレビューが出ます。列がずれていないか確認して「この内容で取り込む」</li>
<li>除外リストの会社・90日以内に送った会社・同じグループで登録済みの会社は、自動で「送らない」に振り分けられます</li>
<li>社名に「株式会社」などが無い場合は、送る直前に会社のHPから自動で補います（無料）</li>
<li>間違えて取り込んだら、「取り込み履歴」の「全件削除」でその回の分をまとめて消せます</li>
<li>フォームで送る場合は「事前チェックを実行」で、フォームの有無・営業お断り・画像認証を送る前に確認できます（任意）</li></ul>
<div style="margin-top:14px;padding:12px 14px;background:var(--honey-50);border:1px solid var(--honey);border-radius:10px">
<b>📋 取り込む前に、AIでリストを整える（おすすめ）</b>
<p class="small" style="margin:6px 0">リストのURLが古い・トップページしか無い・営業お断りの会社が混ざっている、などが原因で「フォーム無し」「失敗」が多くなります。<b>ChatGPT・Claude・Gemini など、Webを閲覧できるAI</b>に、下の文章と営業リスト（ファイル添付か貼り付け）を一緒に入力してください。出てきた表をスプレッドシートに貼り付けて、そのまま取り込めます。</p>
<textarea id="fo-listprompt" readonly style="min-height:220px;font-size:12px;line-height:1.6">あなたは営業リストの整備担当です。添付（または下に貼り付けた）企業リストを、問い合わせフォーム・メールへの営業送信に使えるように整えてください。

【必ず守ること】
・各社の公式サイトを実際に開いて確認してください。確認できなかった項目は推測で埋めず、空欄にしてください（存在しないURLやメールアドレスを作らないこと）。
・件数が多い場合は50社ずつ処理し、途中で止まったら続きから再開してください。

【各社について確認・修正すること】
1. 企業名：正式な社名にする（「株式会社」「有限会社」「合同会社」などの法人格を省略しない。前株・後株も公式の表記どおり）。
2. 企業URL：その会社の公式サイトのトップページ（https:// から始まるURL）。求人サイト・ポータルサイト・SNS・地図サイトのURLは使わない。
3. 問い合わせフォーム：公式サイト内の、実際に入力欄がある「お問い合わせ」ページのURL。
　・採用応募・資料請求専用・個人向けサポート・FAQ・ログインが必要なページは不可。
　・フォームが外部サービス（Googleフォーム、formrun など）に置かれている場合は、そのURLでよい。
　・フォームが見つからなければ空欄。
4. メール：公式サイトに掲載されている問い合わせ用・代表のメールアドレス（info@ など）。個人のアドレスや採用専用のアドレスは避ける。無ければ空欄。
5. 大業界・小業界・都道府県・代表者名：公式サイトの会社概要で分かれば入れる。

【リストから除外する会社（表に出さない）】
・サイトやフォームに「営業目的のお問い合わせはご遠慮ください」「営業お断り」などと書かれている会社
・閉業・倒産している会社、公式サイトが存在しない会社
・官公庁・自治体・学校（ドメインが go.jp / lg.jp / ac.jp / ed.jp）
・同じ会社の重複（同じドメインは1行にまとめる）

【出力形式】
・次の見出しの表を、タブ区切り（スプレッドシートにそのまま貼り付けられる形）で出力してください。見出しの文字は変えないでください。
企業名	企業URL	問い合わせフォーム	メール	大業界	小業界	都道府県	代表者名	備考
・「備考」には、除外はしなかったが注意が必要な点（例：フォームに画像認証あり、フォームが2ページ構成、電話番号が必須 など）を短く書いてください。
・最後に、除外した会社の一覧と除外の理由を、別の表で出してください。</textarea>
<p style="margin:6px 0 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn small" onclick="var t=document.getElementById('fo-listprompt');var b=this;(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(function(){b.textContent='コピーしました ✓'}).catch(function(){t.select();document.execCommand('copy');b.textContent='コピーしました ✓'})">プロンプトをコピー</button><span class="muted small">AIは間違えることがあります。取り込み後のプレビューで列がずれていないか確認してください。件数が多いときは50社ずつ頼むと精度が上がります。Webを閲覧できないAIはURLを作り話することがあるので使わないでください。</span></p>
</div>`)}

${step("5", "本送信を開始する", `<p>キャンペーン画面の「3. 本送信」で「開始する」を押すと、送信時間帯・1日の上限を守りながら自動で送ります。</p>
<ul style="line-height:1.8;margin:0;padding-left:1.2em"><li>途中で止めるときは「一時停止」</li>
<li>送信は<b>このPCの中で</b>動きます。PCがスリープしたり、ふたを閉じたり、アプリを終了すると止まります（起動すると続きから再開）。長時間送るときは電源につなぎ、自動でスリープしない設定に</li>
<li>フォームが見つからない・画像認証がある・営業お断りのサイトには、安全のため送りません</li></ul>`)}

${step("6", "結果と反応を確認する", `<ul style="line-height:1.8;margin:0;padding-left:1.2em"><li><b>送信一覧</b>：会社ごとの状態（送信済・失敗・フォーム無し等）とスクリーンショット。失敗した会社は「修正して再送信」や「失敗した会社を再送信」、手で送った場合は「手動で送信済みにする」</li>
<li><b>反応の一覧</b>：送信用メールの受信箱を15分ごとに読み、返信を「返信あり／アポ獲得／断り」に自動で記録します（受付確認の自動メールは数えません）。判定の根拠を見て、間違っていれば取り消せます</li>
<li>メールの末尾には「メール配信停止」リンクが入り、送られてきた配信停止は自動で除外リストに入ります</li>
<li>「結果をCSVで書き出す」で一覧を保存できます</li></ul>`)}

<div class="card"><h2 style="margin-top:0">よくある質問</h2>
<p><b>Q. 料金はかかりますか？</b><br>テンプレートでの送信・社名の自動補完・返信の自動確認は無料です。AIを使う送り方を選んだ場合だけ、AIの料金がかかります。</p>
<p><b>Q. 他の人のPCから画面を開けますか？</b><br>同じWi-Fi・社内ネットワークなら開けます。アドレス欄の localhost のリンクは他のPCでは開けないので、${isAdmin ? `<a href="/users" target="_blank" rel="noopener">ユーザー管理</a>に表示されるURLを伝えてください` : "管理者に共有用のURLを聞いてください"}。</p>
<p><b>Q. Gmailが「一時的に停止」されました</b><br>短時間に大量に送ったことが原因です。通常1時間〜24時間で戻ります。戻るまで送信を止め、1日の上限を下げ、日中に少しずつ送るようにしてください。</p>
<p style="margin-bottom:0"><b>Q. 同じ会社に二重に送ってしまいませんか？</b><br>90日以内に送った会社（期間はキャンペーンで変更可）と、同じグループで登録済みの会社には送りません。送ったか判断できなかった会社は「失敗（要確認）」になるので、スクリーンショットで確認してから再送信してください。</p></div>
<h2 id="words">言葉の意味（用語集）</h2>
<div class="card">
<table>
<tr><th style="width:170px">画面の言葉</th><th>意味</th></tr>
<tr><td><b>キャンペーン</b></td><td>「誰に・どんな文面で送るか」のひとまとまり（送信プロジェクト）。リストと文面と設定がセットになっています。</td></tr>
<tr><td><b>送信者</b></td><td>相手に表示される差出人。会社名・担当者名・住所・送信用メールを登録します。複数登録して使い分けられます。</td></tr>
<tr><td><b>事前チェック</b></td><td>送らずに各社のサイトを見て、問い合わせフォームの有無・営業お断り・画像認証・メールアドレスを調べる下見のことです。</td></tr>
<tr><td><b>本送信</b></td><td>実際に送ること。「開始」を押すと、送信時間帯の中で1社ずつ送っていきます。</td></tr>
<tr><td><b>待機中</b></td><td>これから送る順番待ちの会社です。</td></tr>
<tr><td><b>要対応</b></td><td>自動では送れなかった会社（画像認証・失敗・フォーム無し）。専用の画面で1件ずつ対応できます。</td></tr>
<tr><td><b>フォーム無し</b></td><td>問い合わせフォームを見つけられなかった会社。メールアドレスがあれば自動でメール送信に切り替えます。</td></tr>
<tr><td><b>CAPTCHA（キャプチャ）</b></td><td>「私はロボットではありません」の画像認証。自動では突破しない方針なので、人が送る形になります。</td></tr>
<tr><td><b>除外リスト</b></td><td>今後いっさい送らない会社の一覧。営業お断りの検知や、断りの返信で自動的に追加されます。</td></tr>
<tr><td><b>配信停止</b></td><td>相手から「もう送らないで」と言われた状態。以後そのアドレスには送りません。</td></tr>
<tr><td><b>反応</b></td><td>送ったあとの相手の反応（返信あり／アポ獲得／断り）。受信箱を読んで自動で記録します。</td></tr>
<tr><td><b>ウォームアップ</b></td><td>新しいメールアカウントで、1日に送る数を少しずつ増やすこと。Googleに止められるのを防ぎます。</td></tr>
<tr><td><b>送れそう度</b></td><td>事前チェックの結果から出した、その会社に送れる見込み（0〜100）。</td></tr>
</table>
</div>
`;
}

/** 送信数（日別・月別）。棒グラフはCSSだけで描く（ライブラリは増やさない） */
export function statsView(
  rows: { period: string; form: number; email: number; total: number }[],
  mode: "day" | "month",
  campaigns: { id: number; name: string }[],
  campaignId: number,
  totals: { total: number; form: number; email: number },
  analysis?: Analysis,
): string {
  const max = Math.max(1, ...rows.map((r) => r.total));
  const label = (p: string) => (mode === "month" ? p.replace("-", "/") : `${Number(p.slice(5, 7))}/${Number(p.slice(8, 10))}`);
  const weekday = (p: string) => (mode === "day" ? ["日", "月", "火", "水", "木", "金", "土"][new Date(`${p}T00:00:00+09:00`).getDay()] : "");
  const q = (m: string, c: number) => `/stats?mode=${m}${c ? `&campaign=${c}` : ""}`;
  return `<h1>送信数</h1>
<p class="muted">送信できた件数を、東京時間の日付で数えています（フォームとメールの合計）。</p>
<form method="get" action="/stats" class="inline" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
<label class="inline small">表示: <select name="mode" onchange="this.form.submit()" style="width:auto;padding:4px 8px"><option value="day" ${mode === "day" ? "selected" : ""}>日別（直近30日）</option><option value="month" ${mode === "month" ? "selected" : ""}>月別（直近12か月）</option></select></label>
<label class="inline small">キャンペーン: <select name="campaign" onchange="this.form.submit()" style="width:auto;padding:4px 8px"><option value="">すべて</option>${campaigns.map((c) => `<option value="${c.id}" ${campaignId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
<a class="btn sub small" href="${q(mode, campaignId)}">更新</a>
</form>
<div class="stats"><div class="stat">この期間の合計<b>${totals.total ?? 0}<span style="font-size:12px;font-weight:400">件</span></b></div><div class="stat">フォーム<b>${totals.form ?? 0}<span style="font-size:12px;font-weight:400">件</span></b></div><div class="stat">メール<b>${totals.email ?? 0}<span style="font-size:12px;font-weight:400">件</span></b></div></div>
${rows.length === 0 ? `<div class="card"><p class="muted">この条件では送信の記録がありません。</p></div>` : `<div class="card" style="overflow-x:auto">
<table style="width:100%"><tr><th style="width:110px">${mode === "month" ? "月" : "日付"}</th><th style="width:60%">件数</th><th style="width:70px">フォーム</th><th style="width:70px">メール</th><th style="width:70px">合計</th></tr>
${rows.map((r) => {
    const fw = Math.round((r.form / max) * 100), ew = Math.round((r.email / max) * 100);
    return `<tr><td class="small">${esc(label(r.period))}${weekday(r.period) ? `<span class="muted">（${weekday(r.period)}）</span>` : ""}</td>
<td><div style="display:flex;height:16px;background:#f1efe9;border-radius:3px;overflow:hidden;min-width:120px"><div title="フォーム ${r.form}件" style="width:${fw}%;background:var(--honey)"></div><div title="メール ${r.email}件" style="width:${ew}%;background:#4A5387"></div></div></td>
<td class="small">${r.form}</td><td class="small">${r.email}</td><td><b>${r.total}</b></td></tr>`;
  }).join("")}
</table>
<p class="muted small" style="margin:8px 0 0"><span style="display:inline-block;width:12px;height:10px;background:var(--honey);vertical-align:-1px"></span> フォーム　<span style="display:inline-block;width:12px;height:10px;background:#4A5387;vertical-align:-1px"></span> メール</p></div>`}${analysis ? analysisSection(analysis) : ""}
`;
}

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

// ---- 動作チェック（#42）----
// 「動かない」の原因を利用者自身が切り分けられる画面。ここからエラーログ・診断ファイル・バックアップにも行ける
export type HealthCheck = { level: "ok" | "warn" | "ng"; label: string; detail: string; fix?: string };
export type HealthState = {
  autostart: { supported: boolean; enabled: boolean; path: string };
  autoUpdate: boolean;
  awakeNote: string;
  logs: { errors24h: number; total: number };
  backups: { file: string; label: string }[];
  backupDir: string;
  isAdmin: boolean;
};

export function healthView(checks: HealthCheck[], st: HealthState): string {
  const mark = (l: HealthCheck["level"]) =>
    l === "ok" ? `<span class="tag sent">○ 問題なし</span>` : l === "warn" ? `<span class="tag queued">△ 確認</span>` : `<span class="tag failed">× 要対応</span>`;
  const ng = checks.filter((c) => c.level === "ng").length;
  const warn = checks.filter((c) => c.level === "warn").length;
  return `<h1>動作チェック</h1>
<div class="card">
  <p>${ng ? `<b style="color:var(--ng)">要対応が ${ng}件</b>あります。` : warn ? `すぐ使えますが、確認した方がよい項目が ${warn}件あります。` : "すべて問題ありません。"}
  うまく動かないときは、この画面と<a href="/logs">エラーログ</a>を見てください。</p>
  <p class="muted">解決しない場合は、<a href="/diagnostics.txt">診断ファイルをダウンロード</a>して配布元に送ってください（パスワード・APIキーは入っていません）。</p>
</div>
<table>
  <tr><th style="width:110px">結果</th><th style="width:200px">項目</th><th>状態</th></tr>
  ${checks.map((c) => `<tr><td>${mark(c.level)}</td><td><b>${esc(c.label)}</b></td><td>${esc(c.detail)}${c.fix ? `<div class="muted">→ ${esc(c.fix)}</div>` : ""}</td></tr>`).join("")}
</table>

<h2>止まらないようにする設定</h2>
<div class="card">
  <form method="post" action="/settings/autostart" class="inline" data-busy>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600">
      <input type="checkbox" name="autostart" value="1" ${st.autostart.enabled ? "checked" : ""} onchange="this.form.submit()" ${st.autostart.supported && st.isAdmin ? "" : "disabled"} style="width:auto">
      パソコンのログイン時に自動で起動する
    </label>
  </form>
  <p class="muted">オンにすると、パソコンを起動・再起動したあとに自分で立ち上げる必要がなくなります（起動し忘れ・黒い画面を閉じて止まる事故を防げます）。${st.autostart.supported ? "" : "このOSでは対応していません。"}${st.autostart.enabled && st.autostart.path ? `<br>設定ファイル: <code>${esc(st.autostart.path)}</code>` : ""}</p>
  <p class="muted">スリープ対策: ${esc(st.awakeNote)}</p>
  <hr style="border:0;border-top:1px solid var(--hive-200);margin:12px 0">
  <form method="post" action="/settings/auto-update" class="inline" data-busy>
    <label style="display:flex;align-items:center;gap:8px;font-weight:600">
      <input type="checkbox" name="auto_update" value="1" ${st.autoUpdate ? "checked" : ""} onchange="this.form.submit()" ${st.isAdmin ? "" : "disabled"} style="width:auto">
      新しい版が出たら自動で更新する
    </label>
  </form>
  <p class="muted">オンにすると、起動時と6時間ごとに確認して自動で最新にします（送信中の会社は送り終わってから。更新前にバックアップを取ります）。オフの場合は、画面右上の「新しい版があります」を押して更新してください。</p>
</div>

<h2>バックアップ</h2>
<div class="card">
  <p>1日1回、送信履歴やリストを含むデータを自動で複製しています（7世代）。保存先: <code>${esc(st.backupDir)}</code></p>
  <form method="post" action="/backup/create" class="inline" data-busy data-busytext="作成中…"><button class="btn sub">いますぐバックアップを取る</button></form>
  <a class="btn sub" href="/backup.json">閲覧用の書き出し（JSON）</a>
  ${st.backups.length ? `
  <h2 style="font-size:14px">復元</h2>
  <form method="post" action="/backup/restore" data-busy data-busytext="復元の準備中…" onsubmit="return confirm('選んだバックアップの内容に戻します。いまのデータは data/backups に退避します。よろしいですか？')">
    <select name="file">${st.backups.map((b) => `<option value="${esc(b.file)}">${esc(b.label)}</option>`).join("")}</select>
    <p class="muted">復元すると、いまの送信履歴・リストはバックアップ時点の内容に置き換わります。押すとアプリが再起動します（送信中の会社は送り終わってから）。</p>
    <button class="btn danger" ${st.isAdmin ? "" : "disabled"}>選んだバックアップから復元する</button>
    ${st.isAdmin ? "" : `<span class="muted">復元は管理者のみ</span>`}
  </form>` : `<p class="muted">まだバックアップがありません。</p>`}
</div>

<h2>困ったときの道具</h2>
<div class="card">
  <p><a class="btn sub" href="/logs">エラーログを見る${st.logs.errors24h ? `（24時間で ${st.logs.errors24h}件）` : ""}</a>
  <a class="btn sub" href="/diagnostics.txt">診断ファイルをダウンロード</a>
  <a class="btn sub" href="/template.csv">リストの見本CSV</a>
  <a class="btn sub" href="/guide">ご利用ガイド</a></p>
  <p class="muted">診断ファイルには、版・OS・設定の有無・直近のエラーが入ります。パスワードやAPIキー、送信先の会社名以外の個人情報は含みません。</p>
</div>`;
}

// ---- エラーログ（#33）----
// これまでは黒い画面を見るしかなく、閉じてしまうと何が起きたか分からなかった
export type LogRow = { id: number; at: string; kind: string; source: string; company: string; text: string };
export function logsView(rows: LogRow[], kind: string, counts: { errors24h: number; total: number }): string {
  const tab = (k: string, label: string) => `<a class="btn ${kind === k ? "" : "sub"}" href="/logs${k ? `?kind=${k}` : ""}">${label}</a>`;
  const kindTag = (k: string) => k === "error" ? `<span class="tag failed">エラー</span>` : k === "warn" ? `<span class="tag queued">注意</span>` : `<span class="tag">記録</span>`;
  return `<h1>エラーログ</h1>
<div class="card">
  <p>アプリの中で起きたことを、新しい順に最大500件まで残しています（直近24時間のエラー: <b>${counts.errors24h}</b>件）。</p>
  <p>${tab("", "すべて")} ${tab("error", "エラーだけ")} ${tab("warn", "注意だけ")}
    <a class="btn sub" href="/health">動作チェックに戻る</a>
    <a class="btn sub" href="/diagnostics.txt">診断ファイル</a></p>
  <p class="muted">原因が分からないときは、診断ファイルをダウンロードして配布元に送ってください。ここの内容もその中に入ります。</p>
</div>
${rows.length ? `<table>
  <tr><th style="width:120px">日時</th><th style="width:80px">種類</th><th style="width:90px">場所</th><th>内容</th></tr>
  ${rows.map((r) => `<tr><td class="small">${esc(jst(r.at))}</td><td>${kindTag(r.kind)}</td><td class="small">${esc(r.source)}</td><td>${r.company ? `<b>${esc(r.company)}</b>: ` : ""}${esc(r.text)}</td></tr>`).join("")}
</table>
<form method="post" action="/logs/clear" style="margin-top:12px" onsubmit="return confirm('ログを全部消します。よろしいですか？')"><button class="btn sub small">ログを消す</button></form>`
  : `<div class="card"><p>まだ記録はありません。問題なく動いています。</p></div>`}`;
}

// ---- 特定電子メール法のチェックリスト（#85）----
// 他社に渡すと、法律上の表示義務を知らないまま送り始めてしまう。最初の1回だけ、実際の登録内容を見せて確認してもらう。
export function lawView(senders: SenderProfile[], acked: string, unsubscribeOk: boolean): string {
  const ok = (b: boolean) => (b ? `<span class="tag sent">○</span>` : `<span class="tag failed">×</span>`);
  const rows = senders.map((s) => `<tr>
    <td><b>${esc(s.label || s.company)}</b></td>
    <td>${ok(Boolean(s.company?.trim()))} ${esc(s.company || "未登録")}</td>
    <td>${ok(Boolean(s.address?.trim()))} ${esc(s.address || "未登録")}</td>
    <td>${ok(Boolean(s.reply_email || s.email))} ${esc(s.reply_email || s.email || "未登録")}</td>
    <td>${s.unsubscribe_url ? `<span class="tag sent">○</span> 停止ページあり` : `<span class="tag queued">△</span> 返信で受付`}</td>
  </tr>`).join("");
  return `<h1>営業メールを送る前に（特定電子メール法）</h1>
<div class="card">
  <p>広告・宣伝を目的とするメールには、法律（特定電子メール法）で次の表示が必要です。アポハッチくんは、下の内容を<b>自動で本文の末尾に入れます</b>。登録が足りないとメールは送れません。</p>
  <ol style="line-height:2;margin:8px 0 4px">
    <li><b>送信者の名称</b>（会社名）— 送信者プロフィールの「会社名」</li>
    <li><b>送信者の住所</b> — 送信者プロフィールの「住所」。<b>未登録だと送信できません</b></li>
    <li><b>受信拒否（配信停止）の連絡先</b> — 返信で受け付け。停止ページのURLを登録すると1クリックで済みます</li>
    <li><b>問い合わせを受け付けるメールアドレス</b> — 返信受付メール</li>
  </ol>
  <p class="muted">送らない方がよい相手: 配信停止を申し出た相手（自動で除外します）、個人のアドレス（BtoBの業務用アドレスを前提にしてください）、官公庁・学校（既定で除外）。</p>
</div>

<h2>いまの登録内容</h2>
<table>
  <tr><th>送信者</th><th>①名称</th><th>②住所</th><th>③④連絡先</th><th>配信停止</th></tr>
  ${rows || `<tr><td colspan="5">送信者がまだ登録されていません</td></tr>`}
</table>
<p class="muted">× がある送信者は、<a href="/senders">送信者</a>の画面で登録してください。${unsubscribeOk ? "" : "配信停止ページのURL（Googleフォーム等）を登録すると、相手が1クリックで停止でき、迷惑メール報告をされにくくなります。"}</p>

<div class="card" style="background:var(--honey-50);border-color:var(--honey)">
  <h2 style="margin-top:0">送る内容についての注意</h2>
  <ul style="line-height:1.9;margin:0">
    <li>件名に「広告」などの偽りがないこと（送信者を偽らない）</li>
    <li>相手が「不要」と言ったら、以後送らないこと（返信から自動で除外リストに入りますが、見落としに注意）</li>
    <li>「営業お断り」と書いてあるサイトには送らないこと（自動で検知してスキップします）</li>
    <li>送信記録は残しておくこと（アポハッチくんが保存しています）</li>
  </ul>
</div>

<form method="post" action="/law/ack" data-busy>
  <label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" name="ack" value="1" required style="width:auto">上の内容を確認しました</label>
  <p class="muted small">確認すると、この画面は次から出ません（${acked ? `前回の確認: ${esc(acked)}` : "まだ未確認"}）。</p>
  <button class="btn primary">確認して送信に進む</button>
</form>`;
}

// ---- 要対応（#50 #10 → #113〜#118 #124 で作り直し）----
// 最初の版は2,000件超が同じ重さで並ぶだけで、開いた瞬間に閉じたくなる画面だった。
//  ・「今日やる10件」を先頭に出す（送れそう度と新しさで選ぶ）
//  ・同じ原因はまとめて1行にし、1回の操作で片づける
//  ・理由によって出すボタンを変える（開けないサイトに「開いて入力」を出さない）
//  ・古いものは自動で「見送り」に回す
export type TodoRow = Job & { campaign_name: string; prio?: number };
export type TodoGroup = { key: string; label: string; n: number; advice: string; action: "requeue" | "dismiss" | "to_email"; actionLabel: string; link?: string; linkLabel?: string };
export type TodoKind = "" | "captcha" | "check" | "failed" | "noform" | "dismissed";

/** その会社が「何で止まっているか」。出すボタンを決めるのに使う（#116） */
export function todoReason(j: Pick<Job, "status" | "result_text" | "channel">): "captcha" | "check" | "mailconfig" | "input" | "unreachable" | "noform" | "network" | "unsure" | "other" {
  const t = j.result_text || "";
  if (j.status === "skip_captcha") return "captcha";
  if (j.status === "skip_no_form") return /アクセスできない|接続を拒否|見つかりません（ドメイン|応答がありません/.test(t) ? "unreachable" : "noform";
  if (/^要確認/.test(t)) return "check";
  if (/メール送信エラー|ログインを拒否|2段階認証|アプリパスワード|送信用メール/.test(t)) return "mailconfig";
  if (/送信後の判定不能/.test(t)) return "unsure";
  if (/入力エラー|必須|送信ボタンが有効になりません|本文欄/.test(t)) return "input";
  if (/時間切れ|タイムアウト|timeout|net::|通信|接続/i.test(t)) return "network";
  return "other";
}

const post = (action: string, label: string, extra = "", cls = "", confirmMsg = "") =>
  `<form method="post" action="${action}" class="inline"${confirmMsg ? ` onsubmit="return confirm('${confirmMsg}')"` : ""}>${extra}<button class="btn small ${cls}">${label}</button></form>`;

/** 理由ごとに、意味のある操作だけを出す（#116） */
function todoActions(j: TodoRow, back: string): string {
  const b = `<input type="hidden" name="back" value="${esc(back)}">`;
  const open = post(`/jobs/${j.id}/assist`, "開いて入力", b + "", "primary").replace('class="inline"', 'class="inline" data-busy data-busytext="ブラウザを開いています…"');
  const sent = post(`/jobs/${j.id}/mark-sent`, "送信済みにする", b);
  const requeue = post(`/jobs/${j.id}/requeue`, "もう一度送る", b);
  const dismiss = post(`/jobs/${j.id}/dismiss`, "見送る", b);
  const toEmail = j.email ? post(`/jobs/${j.id}/to-email`, "メールで送る", b) : "";
  const fix = `<a class="btn small" href="/jobs/${j.id}#fix">URLを直す</a>`;
  switch (todoReason(j)) {
    case "captcha": return `${open} ${sent} ${toEmail} ${dismiss}`;
    case "check": return `<a class="btn small primary" href="/jobs/${j.id}#answer">質問に答える</a> ${dismiss}`;
    case "mailconfig": return `<a class="btn small primary" href="/senders">送信者の設定を直す</a> ${requeue}`;
    case "input": return `${open} ${requeue} ${toEmail} ${dismiss}`;
    case "unsure": return `${sent} ${requeue} ${dismiss}`;
    case "unreachable": return `${fix} ${toEmail} ${dismiss}`;
    case "noform": return `${fix} ${toEmail} ${requeue} ${dismiss}`;
    case "network": return `${requeue} ${dismiss}`;
    default: return `${requeue} ${sent} ${dismiss}`;
  }
}

const REASON_LABEL: Record<string, string> = { captcha: "画像認証", check: "質問への回答待ち", mailconfig: "メールの設定", input: "入力エラー", unreachable: "サイトを開けない", noform: "フォームが無い", network: "通信エラー", unsure: "届いたか不明", other: "その他" };

function thumb(j: Pick<Job, "id" | "screenshot_path">): string {
  if (!j.screenshot_path) return "";
  const f = esc(j.screenshot_path.split("/").pop());
  return `<img src="/screenshots/${f}" alt="" loading="lazy" onclick="foZoom(this.src)" title="クリックで拡大" style="width:92px;height:62px;object-fit:cover;object-position:top;border:1px solid var(--c-line);border-radius:6px;cursor:zoom-in;display:block">`;
}
export const ZOOM_SNIPPET = `<div id="fozoom" hidden style="position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out" onclick="this.hidden=true"><img id="fozoomimg" style="max-width:100%;max-height:100%;background:#fff"></div>
<script>function foZoom(src){const b=document.getElementById("fozoom");document.getElementById("fozoomimg").src=src;b.hidden=false;}
addEventListener("keydown",(e)=>{if(e.key==="Escape"){const b=document.getElementById("fozoom");if(b)b.hidden=true;}});</script>`;

export function todoView(rows: TodoRow[], kind: TodoKind, counts: Record<string, number>, opts: { today: TodoRow[]; groups: TodoGroup[]; hideDays: number; page: number; pageSize: number; total: number }): string {
  const KINDS: [TodoKind, string][] = [["", "すべて"], ["captcha", "画像認証"], ["check", "回答待ち"], ["failed", "失敗"], ["noform", "フォーム無し"], ["dismissed", "見送り"]];
  const back = `/todo${kind ? `?kind=${kind}` : ""}`;
  const tab = (k: TodoKind, label: string) => `<a class="${kind === k ? "on" : ""}" href="/todo${k ? `?kind=${k}` : ""}">${label}<span class="cnt">${n(counts[k || "all"] ?? 0)}</span></a>`;
  const row = (j: TodoRow) => `<tr>
<td><input type="checkbox" name="ids" value="${j.id}" form="todobulk" onchange="foTodoCount()"></td>
<td>${thumb(j)}</td>
<td><a href="/jobs/${j.id}"><b>${esc(j.company_name)}</b></a><div class="muted" data-nohelp>${esc(j.domain || j.email)}・${esc(j.campaign_name)}</div></td>
<td><span class="tag ${j.status === "skip_captcha" ? "queued" : "failed"}">${esc(REASON_LABEL[todoReason(j)])}</span><div class="small" style="margin-top:4px">${esc((j.result_text || "").split("\n")[0].slice(0, 70))}</div></td>
<td class="small">${esc(jst(j.updated_at).slice(5))}</td>
<td style="white-space:nowrap">${kind === "dismissed" ? post(`/jobs/${j.id}/undismiss`, "要対応に戻す", `<input type="hidden" name="back" value="${esc(back)}">`) : todoActions(j, back)}</td></tr>`;
  const card = (j: TodoRow) => `<div class="c"><h3><a href="/jobs/${j.id}">${esc(j.company_name)}</a></h3>
<span class="tag ${j.status === "skip_captcha" ? "queued" : "failed"}">${esc(REASON_LABEL[todoReason(j)])}</span>
<div class="small" style="margin-top:6px">${esc((j.result_text || "").split("\n")[0].slice(0, 80))}</div>
<div class="acts">${kind === "dismissed" ? post(`/jobs/${j.id}/undismiss`, "要対応に戻す", `<input type="hidden" name="back" value="${esc(back)}">`) : todoActions(j, back)}</div></div>`;
  const pages = Math.max(1, Math.ceil(opts.total / opts.pageSize));
  const pager = pages > 1 ? `<div class="pager">${opts.page > 1 ? `<a class="btn small" href="${back}${back.includes("?") ? "&" : "?"}page=${opts.page - 1}">← 前へ</a>` : ""}<span>${opts.page} / ${pages} ページ（${n(opts.total)}社）</span>${opts.page < pages ? `<a class="btn small" href="${back}${back.includes("?") ? "&" : "?"}page=${opts.page + 1}">次へ →</a>` : ""}</div>` : "";

  return `<h1>要対応</h1>
<p class="muted" data-nohelp>自動で送れなかった会社です。${opts.hideDays}日たったものは自動で「見送り」に移します（設定で変更できます）。</p>

${kind === "" && opts.today.length ? `<div class="card" style="border-color:var(--c-brand);border-width:2px">
<h2 style="margin-top:0">今日やる${opts.today.length}件</h2>
<p class="muted" data-nohelp>送れる見込みが高く、新しいものから選んでいます。ここだけ片づければ十分です。</p>
<table class="resp"><tr><th style="width:100px"></th><th>会社</th><th>理由</th><th style="width:360px">対応</th></tr>
${opts.today.map((j) => `<tr><td>${thumb(j)}</td><td><a href="/jobs/${j.id}"><b>${esc(j.company_name)}</b></a><div class="muted" data-nohelp>${esc(j.domain || j.email)}</div></td><td><span class="tag ${j.status === "skip_captcha" ? "queued" : "failed"}">${esc(REASON_LABEL[todoReason(j)])}</span><div class="small" style="margin-top:4px">${esc((j.result_text || "").split("\n")[0].slice(0, 60))}</div></td><td style="white-space:nowrap">${todoActions(j, "/todo")}</td></tr>`).join("")}
</table><div class="cards">${opts.today.map(card).join("")}</div>
${(counts.captcha ?? 0) > 0 ? `<p style="margin:12px 0 0"><a class="btn" href="/todo/run?kind=captcha">画像認証の会社を続けて処理する（${n(counts.captcha)}社）→</a></p>` : ""}
</div>` : ""}

${kind === "" && opts.groups.length ? `<div class="card"><h2 style="margin-top:0">同じ原因のまとめ</h2>
<p class="muted" data-nohelp>原因が同じものは、1回の操作でまとめて片づけられます。</p>
<table><tr><th>原因</th><th style="width:90px">件数</th><th>どうすればよいか</th><th style="width:260px"></th></tr>
${opts.groups.map((g) => `<tr><td><b>${esc(g.label)}</b></td><td><b>${n(g.n)}</b>社</td><td class="small">${esc(g.advice)}</td>
<td style="white-space:nowrap">${g.link ? `<a class="btn small primary" href="${g.link}">${esc(g.linkLabel ?? "開く")}</a> ` : ""}<form method="post" action="/todo/group" class="inline" onsubmit="return confirm('${n(g.n)}社をまとめて「${esc(g.actionLabel)}」にします。よろしいですか？')"><input type="hidden" name="key" value="${esc(g.key)}"><input type="hidden" name="action" value="${g.action}"><button class="btn small">${esc(g.actionLabel)}（${n(g.n)}社）</button></form></td></tr>`).join("")}
</table></div>` : ""}

<div class="tabs">${KINDS.map(([k, label]) => tab(k, label)).join("")}</div>
${kind === "captcha" && rows.length ? `<p><a class="btn primary" href="/todo/run?kind=captcha">続けて処理する（1社ずつ順番に）→</a></p>` : ""}
${rows.length ? `
<form id="todobulk" method="post" action="/todo/bulk" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px" onsubmit="return foTodoConfirm(this)">
<input type="hidden" name="back" value="${esc(back)}">
<span class="small" id="todosel">選択 0社</span>
<select name="action" style="width:auto"><option value="">まとめて操作…</option>${kind === "dismissed" ? `<option value="undismiss">要対応に戻す</option>` : `<option value="requeue">もう一度送る（待機に戻す）</option><option value="to_email">メールで送る（アドレスがある会社）</option><option value="mark_sent">送信済みにする</option><option value="dismiss">見送る</option>`}<option value="suppress">除外リストに入れる（今後送らない）</option></select>
<button class="btn small">実行</button>
<label class="small" style="display:inline-flex;gap:6px;align-items:center;font-weight:400;margin:0"><input type="checkbox" name="all" value="1" style="width:auto" onchange="foTodoCount()">このタブの全 ${n(opts.total)}社を対象にする</label>
<input type="hidden" name="kind" value="${esc(kind)}">
</form>
<table class="resp"><tr><th style="width:34px"><input type="checkbox" title="このページを全選択" onchange="document.querySelectorAll('input[name=ids][form=todobulk]').forEach(c=>c.checked=this.checked);foTodoCount()"></th><th style="width:100px"></th><th>会社</th><th>理由</th><th style="width:80px">更新</th><th style="width:380px">対応</th></tr>
${rows.map(row).join("")}
</table>
<div class="cards">${rows.map(card).join("")}</div>
${pager}
<script>
function foTodoCount(){const all=document.querySelector('#todobulk input[name=all]');const k=document.querySelectorAll('input[name=ids][form=todobulk]:checked').length;document.getElementById("todosel").textContent=all&&all.checked?"このタブの全件":"選択 "+k+"社";}
function foTodoConfirm(f){const a=f.action.value;if(!a){alert("操作を選んでください");return false;}const all=f.all&&f.all.checked;const k=document.querySelectorAll('input[name=ids][form=todobulk]:checked').length;if(!all&&!k){alert("会社を選んでください");return false;}const label=f.action.options[f.action.selectedIndex].text;return confirm((all?"このタブの全件":k+"社")+" を「"+label+"」にします。よろしいですか？");}
</script>` : `<div class="card"><p>${kind === "dismissed" ? "見送った会社はありません。" : "対応が必要な会社はありません。"}</p></div>`}
${ZOOM_SNIPPET}`;
}

/** 画像認証などを1社ずつ続けて処理する画面（#118）。一覧に戻らずに「次へ」で進める */
export function todoRunView(j: TodoRow | null, kind: string, left: number, skip: string, doneMsg = ""): string {
  if (!j) return `<h1>続けて処理する</h1><div class="card" style="text-align:center;padding:40px"><h2 style="margin-top:0">${left === 0 ? "すべて終わりました" : "対象がありません"}</h2><p><a class="btn primary" href="/todo">要対応に戻る</a></p></div>`;
  const hid = `<input type="hidden" name="back" value="/todo/run?kind=${esc(kind)}&skip=${esc(skip)}">`;
  return `<h1>続けて処理する <span class="tag queued">残り ${n(left)}社</span></h1>
<p><a href="/todo?kind=${esc(kind)}">← 一覧に戻る</a></p>
<div class="card">
<h2 style="margin-top:0">${esc(j.company_name)}</h2>
<p class="small">${esc(j.domain)}・${esc(j.campaign_name)}<br>${esc((j.result_text || "").split("\n")[0].slice(0, 100))}</p>
<ol style="line-height:2.1">
<li><form method="post" action="/jobs/${j.id}/assist" class="inline" data-busy data-busytext="ブラウザを開いています…">${hid}<button class="btn primary">① ブラウザを開いて入力する</button></form> <span class="muted" data-nohelp>文面まで入力した状態で開きます</span></li>
<li>開いたブラウザで、画像認証を入力して「送信」を押す</li>
<li><form method="post" action="/jobs/${j.id}/mark-sent" class="inline">${hid}<button class="btn">③ 送信済みにして次へ</button></form>
 <form method="post" action="/jobs/${j.id}/dismiss" class="inline">${hid}<button class="btn">送れなかったので見送って次へ</button></form>
 <a class="btn" href="/todo/run?kind=${esc(kind)}&skip=${esc(skip ? `${skip},${j.id}` : String(j.id))}">あとで（とばす）</a></li>
</ol>
${j.screenshot_path ? `<p>${thumb(j)}</p>` : ""}
</div>
${ZOOM_SNIPPET}`;
}

// ---- 初回セットアップ（#41）----
// 送信者 → メール設定 → 法令確認 → キャンペーン → リスト → 開始 の順に、1画面ずつ案内する。
// 「どこから手を付ければいいか分からない」で止まるのを防ぐ。
export type SetupState = {
  senderOk: boolean; senderLabel: string; addressOk: boolean; smtpOk: boolean; smtpTested: boolean;
  lawOk: boolean; campaignOk: boolean; campaignId: number; listCount: number; scannedOk: boolean; sentCount: number;
};
export function setupView(st: SetupState): string {
  const step = (n: number, done: boolean, title: string, body: string) => `<div class="card" style="${done ? "opacity:.75" : "border-color:var(--honey);border-width:2px"}">
  <h2 style="margin-top:0">${done ? "✅" : `${n}.`} ${esc(title)}</h2>${body}</div>`;
  const next = !st.senderOk ? 1 : !st.smtpOk ? 2 : !st.lawOk ? 3 : !st.campaignOk ? 4 : !st.listCount ? 5 : 6;
  return `<h1>はじめの設定</h1>
<div class="card" style="background:var(--honey-50)">
  <p>この6つを上から順に済ませれば、送信を始められます。<b>いまは ${next} 番</b>です。途中でやめても、ここに戻れば続きから進められます。</p>
  <p class="muted small">用意するもの: ①営業用のメールアドレス ②そのアドレスの2段階認証（アプリパスワード） ③自社の住所（営業メールには法律で必要です）</p>
</div>
${step(1, st.senderOk, "送信者を登録する（会社名・担当者・住所）", `
  <p class="muted">相手に表示される差出人です。住所が無いとメールは送れません。</p>
  ${st.senderOk ? `<p>登録済み: <b>${esc(st.senderLabel)}</b>${st.addressOk ? "" : ` <span style="color:var(--ng)">住所が未登録です</span>`}</p>` : ""}
  <a class="btn ${st.senderOk ? "sub" : ""}" href="/senders">${st.senderOk ? "送信者を見る・直す" : "送信者を登録する"}</a>`)}
${step(2, st.smtpOk, "送信用メールを設定する（Gmailのアプリパスワード）", `
  <p class="muted">Googleアカウント → セキュリティ → 2段階認証プロセス → アプリパスワード で16文字のパスワードを作り、送信者の画面に貼り付けてください。フォームだけ送る場合は飛ばせます。</p>
  ${st.smtpOk ? `<p>設定済み${st.smtpTested ? "（接続テストに成功しています）" : ""}</p>` : ""}
  <a class="btn ${st.smtpOk ? "sub" : ""}" href="/senders">${st.smtpOk ? "設定を見る" : "メールを設定する"}</a>`)}
${step(3, st.lawOk, "営業メールの決まりを確認する", `
  <p class="muted">名称・住所・配信停止の連絡先の表示が法律で必要です。アポハッチくんが自動で入れますが、1回だけ内容をご確認ください。</p>
  <a class="btn ${st.lawOk ? "sub" : ""}" href="/law">${st.lawOk ? "もう一度見る" : "確認する"}</a>`)}
${step(4, st.campaignOk, "キャンペーン（送信プロジェクト）を作る", `
  <p class="muted">「誰に・どんな文面で送るか」のひとまとまりです。文面のひな形から選べます。</p>
  <a class="btn ${st.campaignOk ? "sub" : ""}" href="${st.campaignOk ? `/campaigns/${st.campaignId}` : "/campaigns/new"}">${st.campaignOk ? "キャンペーンを開く" : "キャンペーンを作る"}</a>`)}
${step(5, st.listCount > 0, "会社リストを取り込む", `
  <p class="muted">企業名と企業URL（ホームページ）の2列があれば取り込めます。見本のCSVも用意しています。</p>
  ${st.listCount ? `<p>取り込み済み: <b>${st.listCount}社</b></p>` : ""}
  <a class="btn ${st.listCount ? "sub" : ""}" href="${st.campaignId ? `/campaigns/${st.campaignId}` : "/campaigns/new"}">リストを取り込む</a>
  <a class="btn sub" href="/template.csv">見本のCSV</a>`)}
${step(6, st.sentCount > 0, "事前チェックして、送信を始める", `
  <p class="muted">事前チェックでフォームの有無・営業お断り・画像認証を先に判定します（任意）。そのあと「開始」で送信が始まります。</p>
  ${st.sentCount ? `<p>送信済み: <b>${st.sentCount}件</b>。おつかれさまでした。あとは<a href="/todo">要対応</a>と<a href="/stats">送信数</a>を見ていけば大丈夫です。</p>` : ""}
  <a class="btn ${st.sentCount ? "sub" : ""}" href="${st.campaignId ? `/campaigns/${st.campaignId}` : "/"}">キャンペーンを開く</a>`)}
<p><a href="/guide">くわしい使い方（ご利用ガイド）</a> ／ <a href="/health">動作チェック</a></p>`;
}

// ---- 分析（#71 #72 #73 #75）----
// 「どのリストが当たりだったか」「何で失敗しているか」を、手で数えなくても分かるようにする。
export type Analysis = {
  byIndustry: { key: string; sent: number; replied: number; appo: number }[];
  byPref: { key: string; sent: number; replied: number; appo: number }[];
  byChannel: { channel: string; sent: number; failed: number; replied: number; appo: number }[];
  byHour: { hour: string; sent: number; replied: number }[];
  failures: { label: string; n: number; hint: string }[];
  totalTried: number;
};

function rateTable(title: string, note: string, rows: { key: string; sent: number; replied: number; appo: number }[]): string {
  if (!rows.length) return "";
  const max = Math.max(1, ...rows.map((r) => r.sent));
  return `<div class="card"><h2 style="margin-top:0">${esc(title)}</h2>
<p class="muted small" style="margin:0 0 8px">${esc(note)}</p>
<table><tr><th>${esc(title.replace("別の反応", ""))}</th><th style="width:34%">送信数</th><th style="width:70px">返信+アポ</th><th style="width:60px">アポ</th><th style="width:70px">反応率</th></tr>
${rows.map((r) => `<tr><td>${esc(r.key || "（未設定）")}</td>
<td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:14px;background:#f1efe9;border-radius:3px;overflow:hidden;min-width:80px"><div style="width:${Math.round((r.sent / max) * 100)}%;height:100%;background:var(--honey)"></div></div><span class="small">${r.sent}</span></div></td>
<td class="small">${r.replied}</td><td class="small"><b>${r.appo}</b></td>
<td class="small">${r.sent >= 10 ? `${((r.replied / r.sent) * 100).toFixed(1)}%` : `<span class="muted">—</span>`}</td></tr>`).join("")}
</table>
<p class="muted small" style="margin:8px 0 0">送信10件未満は、反応率が偶然に左右されるため「—」にしています。</p></div>`;
}

export function analysisSection(a: Analysis): string {
  return `
<h2 id="analysis" style="margin-top:28px">反応の分析</h2>
<p class="muted">送信済みの会社について、どこからの反応が多いかを集計しています。次に買うリスト・送る時間帯を決める材料にしてください。</p>

${a.byChannel.length ? `<div class="card"><h2 style="margin-top:0">フォームとメールの比較</h2>
<table><tr><th>送り方</th><th>送信</th><th>失敗・送れず</th><th>返信+アポ</th><th>アポ</th><th>反応率</th></tr>
${a.byChannel.map((r) => `<tr><td>${r.channel === "email" ? "✉ メール" : "📝 フォーム"}</td><td>${r.sent}</td><td>${r.failed}</td><td>${r.replied}</td><td><b>${r.appo}</b></td><td>${r.sent >= 10 ? `${((r.replied / r.sent) * 100).toFixed(1)}%` : "—"}</td></tr>`).join("")}
</table></div>` : ""}

${rateTable("業種別の反応", "送信数の多い順。反応率が高い業種に絞ると、同じ手間でアポが増えます。", a.byIndustry)}
${rateTable("都道府県別の反応", "地域によって反応が変わることがあります。", a.byPref)}

${a.byHour.length ? `<div class="card"><h2 style="margin-top:0">送信した時間帯と反応</h2>
<table><tr><th style="width:90px">時間帯</th><th>送信数</th><th style="width:90px">返信+アポ</th><th style="width:80px">反応率</th></tr>
${a.byHour.map((r) => `<tr><td>${esc(r.hour)}時台</td><td>${r.sent}</td><td>${r.replied}</td><td class="small">${r.sent >= 10 ? `${((r.replied / r.sent) * 100).toFixed(1)}%` : "—"}</td></tr>`).join("")}
</table>
<p class="muted small" style="margin:8px 0 0">反応率が高い時間帯に送信時間帯（キャンペーンの設定）を寄せると、反応が増えることがあります。</p></div>` : ""}

${a.failures.length ? `<div class="card"><h2 style="margin-top:0">送れなかった理由（多い順）</h2>
<p class="muted small" style="margin:0 0 8px">全 ${a.totalTried.toLocaleString("ja-JP")}件のうち、送れなかったもの。上から順に手を打つと、送信数が増えます。</p>
<table><tr><th>理由</th><th style="width:80px">件数</th><th>打てる手</th></tr>
${a.failures.map((f) => `<tr><td>${esc(f.label)}</td><td><b>${f.n}</b></td><td class="small">${f.hint}</td></tr>`).join("")}
</table></div>` : ""}

<p><a class="btn sub" href="/report">週次レポートを見る（印刷できます）</a></p>`;
}

// ---- 週次レポート（#74）----
export type WeeklyReport = {
  from: string; to: string;
  sentForm: number; sentEmail: number; replied: number; appo: number; declined: number;
  failed: number; captcha: number; noForm: number;
  prevSent: number;
  topIndustries: { key: string; sent: number; replied: number; appo: number }[];
  campaigns: { name: string; sent: number; replied: number; appo: number }[];
  appointments: { company: string; at: string; note: string }[];
};
export function reportView(r: WeeklyReport): string {
  const sent = r.sentForm + r.sentEmail;
  const diff = r.prevSent ? Math.round(((sent - r.prevSent) / r.prevSent) * 100) : 0;
  return `<h1>週次レポート</h1>
<p class="muted">${esc(r.from)} 〜 ${esc(r.to)}（東京時間）。この画面はそのまま印刷・PDF保存できます（ブラウザの印刷メニュー）。</p>
<div class="stats">
  <div class="stat"><span class="muted small">送信</span><b>${sent}</b><span class="muted small">フォーム${r.sentForm}・メール${r.sentEmail}</span></div>
  <div class="stat"><span class="muted small">前の週と比べて</span><b>${r.prevSent ? `${diff >= 0 ? "+" : ""}${diff}%` : "—"}</b><span class="muted small">前週 ${r.prevSent}件</span></div>
  <div class="stat"><span class="muted small">アポ</span><b>${r.appo}</b><span class="muted small">返信 ${r.replied}・断り ${r.declined}</span></div>
  <div class="stat"><span class="muted small">送れなかった</span><b>${r.failed + r.captcha + r.noForm}</b><span class="muted small">失敗${r.failed}・認証${r.captcha}・フォーム無${r.noForm}</span></div>
</div>
${r.appointments.length ? `<div class="card"><h2 style="margin-top:0">今週のアポ・前向きな返信</h2>
<table><tr><th>会社</th><th style="width:120px">日時</th><th>メモ</th></tr>
${r.appointments.map((a) => `<tr><td><b>${esc(a.company)}</b></td><td class="small">${esc(a.at)}</td><td class="small">${esc(a.note.slice(0, 120))}</td></tr>`).join("")}
</table></div>` : ""}
${r.campaigns.length ? `<div class="card"><h2 style="margin-top:0">キャンペーン別</h2>
<table><tr><th>キャンペーン</th><th style="width:80px">送信</th><th style="width:90px">返信+アポ</th><th style="width:70px">アポ</th></tr>
${r.campaigns.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.sent}</td><td>${c.replied}</td><td><b>${c.appo}</b></td></tr>`).join("")}
</table></div>` : ""}
${r.topIndustries.length ? `<div class="card"><h2 style="margin-top:0">業種別（今週）</h2>
<table><tr><th>業種</th><th style="width:80px">送信</th><th style="width:90px">返信+アポ</th><th style="width:70px">アポ</th></tr>
${r.topIndustries.map((c) => `<tr><td>${esc(c.key || "（未設定）")}</td><td>${c.sent}</td><td>${c.replied}</td><td><b>${c.appo}</b></td></tr>`).join("")}
</table></div>` : ""}
<p class="muted small">※ 反応（返信・アポ・断り）は、送信用メールの受信箱を読んで自動で記録したものと、手で記録したものの合計です。</p>
<p><a class="btn sub" href="/stats">送信数の画面に戻る</a></p>
<style>@media print{header,.btn{display:none!important}main{padding:0}.card{break-inside:avoid}}</style>`;
}

// ---- 導入チェックリスト（#138）----
// 渡すときの説明資料を毎回手で作っていたので、画面から1枚で出せるようにする。
// PDFにしたい場合は、ブラウザの印刷から「PDFとして保存」を選ぶ（追加のソフトは入れない方針）。
export function checklistView(st: SetupState, version: string): string {
  const box = (done: boolean) => `<span style="display:inline-block;width:18px;height:18px;border:2px solid var(--c-ink);border-radius:4px;text-align:center;line-height:15px;font-weight:800;margin-right:8px;vertical-align:-3px">${done ? "✓" : ""}</span>`;
  const item = (done: boolean, title: string, note: string) => `<li style="margin:0 0 12px;list-style:none">${box(done)}<b>${esc(title)}</b><div class="small" style="margin-left:30px;color:var(--c-ink-2)">${esc(note)}</div></li>`;
  return `<h1>導入チェックリスト</h1>
<p class="small">アポハッチくん v${esc(version)}　／　このページは印刷できます（ブラウザの印刷 →「PDFとして保存」でPDFにもなります）。 <button class="btn small" onclick="window.print()">印刷する</button></p>
<div class="card"><h2 style="margin-top:0">はじめる前に用意するもの</h2>
<ul style="padding:0;margin:0">
${item(false, "営業用のメールアドレス", "ふだん使いとは分けることをおすすめします（Gmail / Google Workspace）")}
${item(false, "そのアドレスの2段階認証とアプリパスワード", "Googleアカウント → セキュリティ → 2段階認証プロセス → アプリパスワード（16文字）")}
${item(false, "自社の住所", "営業メールには住所の表示が法律で必要です。未登録だとメールは送れません")}
${item(false, "送り先の会社リスト", "企業名と企業URLの2列があれば取り込めます（見本CSVあり）")}
</ul></div>
<div class="card"><h2 style="margin-top:0">設定の手順（6ステップ）</h2>
<ul style="padding:0;margin:0">
${item(st.senderOk && st.addressOk, "1. 送信者を登録する", "会社名・担当者・住所・電話。設定 → 送信者")}
${item(st.smtpOk, "2. 送信用メールを設定する", "アプリパスワードを貼り付けて保存すると、接続テストが自動で走ります")}
${item(st.lawOk, "3. 営業メールの決まりを確認する", "名称・住所・配信停止の連絡先の表示（自動で入ります）")}
${item(st.campaignOk, "4. キャンペーンを作る", "文面はひな形から選んで【 】の中を書き換えます")}
${item(st.listCount > 0, "5. 会社リストを取り込む", "CSV / Excel / スプレッドシート")}
${item(st.sentCount > 0, "6. 事前チェックをして、送信を始める", "開始を押すと、送信時間帯の中で自動で送ります")}
</ul></div>
<div class="card"><h2 style="margin-top:0">毎日見るところ</h2>
<ul style="padding:0;margin:0">
${item(false, "ホーム", "今日の進み具合・アポ・要対応・次にやること")}
${item(false, "要対応 →「今日やる10件」", "自動で送れなかった会社のうち、手を打つ価値の高いものから")}
${item(false, "成果", "業種別・時間帯別の反応率、週次レポート")}
</ul></div>
<div class="card"><h2 style="margin-top:0">気をつけること</h2>
<ul class="small" style="line-height:2;margin:0">
<li>黒い画面（ターミナル）は閉じない。閉じると送信が止まります（設定 → 動作チェックで「ログイン時に自動で起動」をオンにできます）</li>
<li>新しいメールアカウントは、最初の2週間は送信数が自動で抑えられます（ウォームアップ）</li>
<li>「不要」と言われた相手には以後送りません（自動で除外リストに入ります）</li>
<li>うまく動かないときは、設定 → 動作チェック →「診断ファイル」を配布元に送ってください</li>
</ul></div>`;
}
