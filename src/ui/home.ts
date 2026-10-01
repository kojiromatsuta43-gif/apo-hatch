// ホームとキャンペーン一覧
import { STATUS_LABEL, OUTCOME_LABEL, CHANNEL_LABEL, channelMode, jst, type Campaign, type Job, type SenderProfile, type JobStatus } from "../db.js";
import { AI_MODELS, type Lint } from "../message.js";
import { TEMPLATE_LIBRARY } from "../templates.js";
import { esc, layout, n, type NavUser } from "./layout.js";
import { MODE_LABEL, campaignStatusTag, post } from "./parts.js";

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

export function homeCard(h: HomeSummary): string {
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

export type CampaignRow = Campaign & { sender_label: string; total: number; sent: number; queued: number; reactions: number; last_sent: string | null; is_running?: boolean };

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
