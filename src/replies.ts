// 返信の自動確認。送信用メールアカウントの受信箱（IMAP）を定期的に読み、送った会社から届いたメールを
// キーワードで「返信あり／アポ／断り」に振り分けて、反応（form_jobs.outcome）に自動で記録する。
// AIは使わない（費用をかけない方針）。判定は外れることがあるので、メモに「自動判定」と根拠を残し、人が直せるようにする。
// 人が手で記録した反応は上書きしない。
import { ImapFlow } from "imapflow";
import type { Readable } from "node:stream";
import { getDb, FREE_MAIL_DOMAINS, jst, type SenderProfile } from "./db.js";
import { optOut } from "./email.js";

export type IncomingMail = {
  from: string; // 差出人アドレス
  subject: string;
  text: string; // 本文（プレーンテキスト）
  date: Date;
  autoHeader: boolean; // Auto-Submitted 等の自動送信ヘッダーがあった
};

export type ReplyVerdict = { outcome: "replied" | "appointment" | "declined"; reason: string };

// 自動返信・受付確認・エラーメール。フォーム送信後に届く「お問い合わせを受け付けました」は会社のドメインから来るが、人の返信ではない
const AUTO_SUBJECT_RE = /(自動返信|自動応答|自動送信|自動配信|auto[- ]?reply|automatic reply|out of office|不在|受付完了|受け付けました|受付のお知らせ|受付確認|送信完了|お問い?合わ?せ(を)?(受け付け|受付|承り|ありがとう)|お問い?合わ?せ内容の確認|(お問い?合わ?せ|ご連絡|ご送信|送信|ご依頼|ご相談)(を)?(いただき|頂き)?(まして)?[、,]?(誠に|大変)?(ありがとう|有難う|有り難う)|フォーム(より|から)|受付番号|お問い?合わ?せ内容の?(ご)?確認|お問い?合わ?せ確認|お問い?合わ?せ\s*控え|登録(いただき|頂き)?ありがとう|Undeliver|Delivery Status|Mail Delivery|配信(に)?失敗|配信不能|returned mail|failure notice)/i;
const AUTO_BODY_RE = /(このメールは(自動|送信専用)|本メールは(自動|送信専用|システム)|(自動|システム)(で|により)?(送信|配信|返信)(され|して|いた|しており|しています)|送信専用(アドレス|メール)|(返信|ご返信)(いただいても|されても|頂いても)[^。\n]{0,20}(お答え|回答|対応|返答)(でき|いたしかね|致しかね)|以下の内容で(受け付け|受付|承り|送信)|下記の内容で(受け付け|受付|承り|送信)|自動送信した|自動返信です|(ウェブサイト|ホームページ|webサイト|WEBサイト|サイト)(より|から)(自動)?送信されて|(お送り|送信)(頂|いただ)きました内容)/;
const AUTO_FROM_RE = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|noreply|bounce)/i;

// 断り（今後送らない）。「本メッセージが不要な場合は…」等、こちらの文面の引用は本文から取り除いてから見る
const DECLINE_RE = /(不要です|不要でございます|必要(は|も)?(ござい|あり)ません|お断り|見送(り|らせ|ります|ることに)|遠慮(いた|致|させ|し|くだ|下さ)|控えさせ|差し控え|配信(を)?停止|送らないで|送付(は|を)?(不要|ご遠慮|お控え)|ご連絡(は|を)?(不要|結構|お控え|ご遠慮)|(今後|以後)[^。\n]{0,15}(不要|ご遠慮|お控え|控えて|送らない|結構)|検討(は|を)?(して)?(おりません|いたしかね|致しかね|できかね)|予定(は|が)?(ござい|あり)ません|間に合って|結構です|対応(いた|致)しかね|お受け(でき|いたし|致し)かね|(リスト|名簿)から(外|削除|除外)|営業(メール|のご連絡)?(は|を)?(お断り|禁止|受け付けて))/;
// アポ・前向き（日程調整や話を聞きたい）
const APPO_RE = /(日程|日時|候補日|ご都合|打ち?合わ?せ|面談|ミーティング|商談|お時間(を)?(いただ|頂|取|作|頂戴)|お話(を)?(伺|お聞き|聞かせ|聞き)|詳しく(伺|お聞き|聞きた|教えて|知りた)|zoom|teams|google\s*meet|オンライン(で|会議|面談|ミーティング)|ご来社|ご訪問|(資料|詳細|見積|お見積)(を|も)?(送|お送り|いただ|頂|ご送付|ください|下さい)|ご説明(を)?(いただ|頂|お願い)|お話(の|する)?(機会|場|時間)|機会を(頂戴|いただ|頂)|(予約|登録)(させて)?(いただ|頂)きました|予約(いた|致)しました|\d{1,2}月\d{1,2}日[^。\n]{0,12}\d{1,2}[:：]\d{2}|\d{1,2}\/\d{1,2}[^。\n]{0,12}\d{1,2}[:：]\d{2})/i;

/** 返信本文から、こちらが送った文面の引用・署名より下の部分を取り除く（引用内の「不要な場合は」等で誤判定しないため） */
const norm = (s: string) => s.replace(/[\s　▪️・■□●○◆◇▼▶︎*＊\-ー―─_=＝:：|｜>＞「」【】()（）]/g, "");

export function stripQuoted(text: string, sentMessage = ""): string {
  const sentLines = new Set(sentMessage.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 8));
  // フォーム送信後の受付確認メール等は「お問い合わせ内容：（こちらの文面）」のように見出し付きで転記するため、
  // 行がこちらの文面に含まれる／行がこちらの文面の1行を含む場合も、こちらの文章とみなして除く
  const sentNorm = norm(sentMessage);
  const sentNormLines = sentMessage.split(/\r?\n/).map(norm).filter((l) => l.length >= 12);
  const isEcho = (line: string) => {
    const n = norm(line);
    if (n.length >= 10 && sentNorm.includes(n)) return true;
    return sentNormLines.some((l) => n.includes(l));
  };
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // 引用の開始行が来たら、そこから下は全部引用とみなして打ち切る
    if (/^-{2,}\s*(Original Message|元のメッセージ|Forwarded message|転送)/i.test(line)) break;
    if (/^On .{5,200}wrote:$/i.test(line)) break;
    if (/^\d{4}(年|\/|-)\d{1,2}(月|\/|-)\d{1,2}日?.{0,80}(<|＜|&lt;)[^>＞]+@[^>＞]+(>|＞|&gt;).{0,10}[:：]?$/.test(line)) break;
    if (/^(差出人|From)\s*[:：]/i.test(line) && out.length > 0) break;
    if (/^(>|＞)/.test(line)) continue;
    if (/^\[?メール配信停止\]?(\s*<mailto:[^>]*>)?$/.test(line)) continue; // こちらの署名の配信停止リンクの文字
    if (sentLines.has(line) || (sentMessage && isEcho(line))) continue;
    out.push(raw);
  }
  return out.join("\n").trim();
}

/** 自動返信・受付確認・エラーメールなら true（反応として数えない） */
export function isAutoMail(m: IncomingMail): boolean {
  if (m.autoHeader) return true;
  if (AUTO_FROM_RE.test(m.from.split("@")[0] ?? "")) return true;
  if (AUTO_SUBJECT_RE.test(m.subject)) return true;
  return AUTO_BODY_RE.test(m.text.replace(/[ \t　]+/g, ""));
}

/** 返信をキーワードで振り分ける。断りとアポの両方の言葉がある場合は決めつけず「返信あり」にして人に任せる */
export function classifyReply(subject: string, body: string): ReplyVerdict & { excerpt: string } {
  // 件名は「Re: こちらの件名（商談機会について 等）」なので、キーワード判定には本文だけを使う（件名の「商談」でアポにしないため）
  const s = body.replace(/[ \t　]+/g, "");
  const around = (idx: number, len: number) => s.slice(Math.max(0, idx - 30), idx + len + 30).replace(/\s+/g, " ").trim();
  const dec = DECLINE_RE.exec(s);
  const app = APPO_RE.exec(s);
  // 配信停止の返信（本メールの案内どおり件名や本文の先頭に「配信停止」とだけ書いたもの）
  if (/^\s*(re:|RE:|Re:|fw:|Fwd:)?\s*配信停止/.test(subject) || /^配信停止/.test(s)) return { outcome: "declined", reason: "「配信停止」の返信", excerpt: around(0, 20) || subject.slice(0, 60) };
  if (dec && !app) return { outcome: "declined", reason: `「${dec[0]}」`, excerpt: around(dec.index, dec[0].length) };
  if (app && !dec) return { outcome: "appointment", reason: `「${app[0]}」`, excerpt: around(app.index, app[0].length) };
  if (app && dec) return { outcome: "replied", reason: `「${dec[0]}」「${app[0]}」の両方があり判断できず`, excerpt: around(dec.index, dec[0].length) };
  return { outcome: "replied", reason: "振り分けの言葉なし", excerpt: s.slice(0, 60).replace(/\s+/g, " ") };
}

type SentJob = { id: number; company_name: string; email: string; domain: string; sent_at: string; outcome: string; outcome_note: string; message_used: string; owner_user_id: number | null };

// こちらのメールの署名・配信停止の案内（email.ts の buildEmailBody）。返信に引用されて「配信停止」で断りにならないよう除く
const FOOTER_ECHO = "今後このご案内が不要な場合は、お手数ですが本メールに「配信停止」とご返信ください\n以後お送りしません。\n今後このご案内が不要な場合は、以下のリンクからお手続きください。";

const RANK: Record<string, number> = { "": 0, replied: 1, appointment: 2, declined: 2 };

/** 届いた1通を、その受信箱から送った会社と突き合わせて反応を記録する。記録したら job id を返す */
export function applyIncomingMail(mailbox: string, m: IncomingMail): number | null {
  const db = getDb();
  const from = m.from.trim().toLowerCase();
  const fromDomain = from.split("@")[1] ?? "";
  if (!fromDomain || from === mailbox.toLowerCase()) return null;
  // 本メールの「配信停止」案内（List-Unsubscribe）を相手のメールソフトから押すと、件名「配信停止」・自動送信ヘッダー付きで届く。
  // これは相手の意思表示なので自動返信扱いにしない
  const unsubscribe = /^\s*配信停止/.test(m.subject);
  if (!unsubscribe && (m.autoHeader || AUTO_FROM_RE.test(from.split("@")[0] ?? ""))) return null;
  const at = m.date.toISOString().replace("T", " ").slice(0, 19);
  // この受信箱（送信用アカウント）を使う送信者から、このメールより前に送った会社（直近90日）
  const base = `SELECT j.id, j.company_name, j.email, j.domain, j.sent_at, j.outcome, j.outcome_note, j.message_used, s.owner_user_id
    FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id JOIN sender_profiles s ON s.id=c.sender_id
    WHERE j.is_test=0 AND j.status='sent' AND j.sent_at IS NOT NULL AND j.sent_at <= ? AND j.sent_at >= datetime(?, '-90 days')
      AND lower(s.smtp_user)=?`;
  let job = db.prepare(`${base} AND lower(j.email)=? ORDER BY j.sent_at DESC LIMIT 1`).get(at, at, mailbox.toLowerCase(), from) as SentJob | undefined;
  // アドレスが違っても、同じ会社のドメイン（サブドメイン含む）からの返信なら同じ会社とみなす。フリーメールは別人の可能性があるので除く
  if (!job && !FREE_MAIL_DOMAINS.has(fromDomain)) {
    const parts = fromDomain.split(".");
    const cands = parts.map((_, i) => parts.slice(i).join(".")).filter((d) => d.includes(".") && !/^(co|ne|or|ac|go|com|net|org)\.[a-z]{2}$/.test(d));
    const ph = cands.map(() => "?").join(",");
    if (cands.length) job = db.prepare(`${base} AND (lower(j.domain) IN (${ph}) OR (j.email<>'' AND lower(substr(j.email, instr(j.email,'@')+1)) IN (${ph}))) ORDER BY j.sent_at DESC LIMIT 1`).get(at, at, mailbox.toLowerCase(), ...cands, ...cands) as SentJob | undefined;
  }
  // 「メール配信停止」リンクから作られたメールは、本文に送信先アドレスが入っている（転送先や個人アドレスから送られても特定できる）
  if (!job && unsubscribe) {
    const target = m.text.match(/対象アドレス[:：]\s*([^\s<>]+@[^\s<>]+)/)?.[1]?.toLowerCase();
    if (target) job = db.prepare(`${base} AND lower(j.email)=? ORDER BY j.sent_at DESC LIMIT 1`).get(at, at, mailbox.toLowerCase(), target) as SentJob | undefined;
  }
  if (!job) return null;
  const body = stripQuoted(m.text, `${job.message_used}\n${FOOTER_ECHO}`);
  // 自動返信の判定は引用を除いた本文で行う（引用されたこちらの文面の言葉で誤判定しないため）
  if (!unsubscribe && isAutoMail({ ...m, text: body })) return null;
  const v = classifyReply(m.subject, body);
  // 人が手で付けた反応は触らない。自動で付けたものは、より強い判定（アポ・断り）が来たときだけ上げる
  const auto = job.outcome === "" || job.outcome_note.startsWith("自動判定");
  if (!auto || RANK[v.outcome] <= (RANK[job.outcome] ?? 0)) return null;
  // 一覧で「どこを見て判定したか」が分かるよう、判定に使った言葉の前後の本文を残す（時刻は東京時間）
  const note = `自動判定（キーワード: ${v.reason}）${jst(at)} 件名「${m.subject.slice(0, 50)}」 本文「…${v.excerpt.slice(0, 90)}…」`.slice(0, 300);
  db.prepare("UPDATE form_jobs SET outcome=?, outcome_note=?, updated_at=datetime('now') WHERE id=?").run(v.outcome, note, job.id);
  if (v.outcome === "declined") {
    // 手で「断り」を押したときと同じく、今後この会社には送らない（誤判定でも送らない側に倒す）
    if (job.domain) db.prepare("INSERT OR IGNORE INTO form_suppressions(domain, reason) VALUES(?,?)").run(job.domain, `断り・返信から自動判定（${job.company_name}）`);
    if (job.email) optOut(job.email, `断り・返信から自動判定（${job.company_name}）`, job.owner_user_id ?? undefined);
  }
  return job.id;
}

/** SMTPホストから受信用（IMAP）ホストを推定する */
export function imapHostFor(sender: SenderProfile): string {
  const h = (sender.smtp_host || "smtp.gmail.com").trim().toLowerCase();
  if (/office365|outlook|hotmail|live\.com/.test(h)) return "outlook.office365.com";
  return h.replace(/^smtp(-mail)?\./, "imap.");
}

type ScanState = { mailbox: string; uidvalidity: string; last_uid: number; checked_at: string | null; error: string; found: number };

function ensureTable() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS reply_scans (
    mailbox TEXT PRIMARY KEY,
    uidvalidity TEXT NOT NULL DEFAULT '',
    last_uid INTEGER NOT NULL DEFAULT 0,
    checked_at TEXT,
    error TEXT NOT NULL DEFAULT '',
    found INTEGER NOT NULL DEFAULT 0
  )`);
}

async function readStream(s: Readable, max = 200_000): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of s) { const b = Buffer.isBuffer(c) ? c : Buffer.from(c); chunks.push(b); n += b.length; if (n > max) break; }
  return Buffer.concat(chunks).toString("utf8");
}

type Node = { part?: string; type: string; disposition?: string; childNodes?: Node[] };
function findTextPart(n: Node | undefined, type: string): Node | undefined {
  if (!n) return undefined;
  if (n.type === type && n.disposition !== "attachment") return n;
  for (const c of n.childNodes ?? []) { const f = findTextPart(c, type); if (f) return f; }
  return undefined;
}

let checking = false;

/** 送信用アカウントごとに受信箱を1回確認する。戻り値は記録した件数 */
export async function checkReplies(): Promise<{ recorded: number; errors: string[] }> {
  if (checking) return { recorded: 0, errors: [] };
  checking = true;
  ensureTable();
  const db = getDb();
  let recorded = 0;
  const errors: string[] = [];
  try {
    // 直近90日に送信済みがある送信用アカウントだけ見る（受信箱ごとに1回）
    const senders = db.prepare(`SELECT s.* FROM sender_profiles s WHERE s.smtp_user<>'' AND s.smtp_pass<>''
      AND EXISTS (SELECT 1 FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id WHERE c.sender_id=s.id AND j.status='sent' AND j.is_test=0 AND j.sent_at >= datetime('now','-90 days'))
      ORDER BY s.id`).all() as SenderProfile[];
    const seen = new Set<string>();
    for (const s of senders) {
      const mailbox = s.smtp_user.trim().toLowerCase();
      if (seen.has(mailbox)) continue;
      seen.add(mailbox);
      const state = (db.prepare("SELECT * FROM reply_scans WHERE mailbox=?").get(mailbox) as ScanState | undefined) ?? { mailbox, uidvalidity: "", last_uid: 0, checked_at: null, error: "", found: 0 };
      const client = new ImapFlow({ host: imapHostFor(s), port: 993, secure: true, auth: { user: s.smtp_user, pass: s.smtp_pass.replace(/^([a-z]{4}) ([a-z]{4}) ([a-z]{4}) ([a-z]{4})$/i, "$1$2$3$4") }, logger: false, socketTimeout: 60_000 });
      client.on("error", () => { /* 切断等。下の catch で拾う */ });
      let found = 0;
      try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          const mb = client.mailbox;
          const validity = mb && typeof mb === "object" ? String(mb.uidValidity) : "";
          let uids: number[];
          if (state.uidvalidity === validity && state.last_uid > 0) {
            uids = ((await client.search({ uid: `${state.last_uid + 1}:*` }, { uid: true })) || []).filter((u) => u > state.last_uid);
          } else {
            // 初回（または受信箱が作り直された）: 最初の送信の前日以降に届いたメールを見る
            const first = db.prepare(`SELECT MIN(j.sent_at) t FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id JOIN sender_profiles s ON s.id=c.sender_id
              WHERE lower(s.smtp_user)=? AND j.status='sent' AND j.is_test=0 AND j.sent_at >= datetime('now','-90 days')`).get(mailbox) as { t: string | null };
            const since = new Date(new Date((first.t ?? "").replace(" ", "T") + "Z").getTime() - 86400_000);
            uids = (await client.search({ since: isNaN(since.getTime()) ? new Date(Date.now() - 7 * 86400_000) : since }, { uid: true })) || [];
          }
          let maxUid = state.uidvalidity === validity ? state.last_uid : 0;
          for (const uid of uids.sort((a, b) => a - b).slice(0, 2000)) {
            maxUid = Math.max(maxUid, uid);
            const msg = await client.fetchOne(String(uid), { uid: true, envelope: true, bodyStructure: true, internalDate: true, headers: ["auto-submitted", "x-autoreply", "x-autorespond", "precedence", "x-auto-response-suppress"] }, { uid: true });
            if (!msg) continue;
            const addr = msg.envelope?.from?.[0]?.address ?? "";
            if (!addr) continue;
            const hdr = msg.headers ? msg.headers.toString("utf8") : "";
            const autoHeader = /auto-submitted:\s*auto-/i.test(hdr) || /x-autore(ply|spond):/i.test(hdr) || /precedence:\s*(auto_reply|bulk|junk)/i.test(hdr);
            let text = "";
            const node = findTextPart(msg.bodyStructure as Node | undefined, "text/plain") ?? findTextPart(msg.bodyStructure as Node | undefined, "text/html");
            if (node) {
              try {
                const dl = await client.download(String(uid), node.part || "1", { uid: true, maxBytes: 200_000 });
                text = await readStream(dl.content);
                if (node.type === "text/html") text = text.replace(/<br\s*\/?>|<\/(p|div|tr|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
              } catch { /* 本文が読めなくても件名だけで判定する */ }
            }
            const date = msg.internalDate ? new Date(msg.internalDate) : (msg.envelope?.date ? new Date(msg.envelope.date) : new Date());
            if (applyIncomingMail(mailbox, { from: addr, subject: msg.envelope?.subject ?? "", text, date, autoHeader }) != null) found++;
          }
          db.prepare(`INSERT INTO reply_scans(mailbox, uidvalidity, last_uid, checked_at, error, found) VALUES(?,?,?,datetime('now'),'',?)
            ON CONFLICT(mailbox) DO UPDATE SET uidvalidity=excluded.uidvalidity, last_uid=excluded.last_uid, checked_at=excluded.checked_at, error='', found=reply_scans.found+excluded.found`)
            .run(mailbox, validity, maxUid, found);
        } finally {
          lock.release();
        }
        await client.logout().catch(() => {});
        recorded += found;
      } catch (e) {
        const raw = String((e as Error)?.message ?? e);
        const msg = /auth|login|credentials|535|invalid/i.test(raw + String((e as { responseText?: string })?.responseText ?? ""))
          ? `受信箱（${mailbox}）にログインできませんでした。送信者プロフィールのアプリパスワードを確認してください`
          : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|timeout/i.test(raw)
            ? `受信箱（${imapHostFor(s)}）に接続できませんでした（ネットワーク、またはこのメールサービスが受信の読み取りに対応していない可能性）`
            : `受信箱（${mailbox}）の確認に失敗: ${raw.slice(0, 120)}`;
        errors.push(msg);
        db.prepare(`INSERT INTO reply_scans(mailbox, checked_at, error) VALUES(?,datetime('now'),?) ON CONFLICT(mailbox) DO UPDATE SET checked_at=excluded.checked_at, error=excluded.error`).run(mailbox, msg);
        try { client.close(); } catch { /* 既に閉じている */ }
      }
    }
  } finally {
    checking = false;
  }
  return { recorded, errors };
}

export function isCheckingReplies(): boolean {
  return checking;
}

/** キャンペーン画面に出す「返信の自動確認」の状態（このキャンペーンの送信用アカウント分） */
export function replyScanStatus(sender: SenderProfile | undefined): { enabled: boolean; checkedAt: string | null; error: string } {
  if (!sender || !sender.smtp_user || !sender.smtp_pass) return { enabled: false, checkedAt: null, error: "" };
  ensureTable();
  const r = getDb().prepare("SELECT checked_at, error FROM reply_scans WHERE mailbox=?").get(sender.smtp_user.trim().toLowerCase()) as { checked_at: string | null; error: string } | undefined;
  return { enabled: true, checkedAt: r?.checked_at ?? null, error: r?.error ?? "" };
}

// ---- 送信の途中でアプリが止まったメールの確認 ----
// 以前は「送信済みか不明・要確認」にして、利用者に Gmail の送信済みフォルダを見てもらっていた。
// 同じ受信箱の読み取り（IMAP）で送信済みフォルダを裏で確認し、送れていれば「送信済み」、
// 送れていなければ「待機」に戻して続きから自動で送る。

export const INTERRUPTED_PREFIX = "送信中にアプリが止まったため中断";

/** 送信済みフォルダにあった同じ宛先のメールの日時から判断する。
 *  中断した送信の開始時刻（claimAt）より少し前以降に送ったものがあれば送信済み。
 *  無い場合、Gmail（送信済みフォルダに必ず控えが残る）なら未送信と判断してよい。それ以外のサービスは控えが残らないことがあるので決めない */
export function decideInterrupted(sentDates: Date[], claimAt: Date, keepsSentCopy: boolean): { verdict: "sent"; at: Date } | { verdict: "not_sent" } | { verdict: "unknown" } {
  const hit = sentDates.filter((d) => d.getTime() >= claimAt.getTime() - 2 * 60_000).sort((a, b) => a.getTime() - b.getTime())[0];
  if (hit) return { verdict: "sent", at: hit };
  return keepsSentCopy ? { verdict: "not_sent" } : { verdict: "unknown" };
}

type InterruptedRow = { id: number; email: string; updated_at: string; sender_id: number };

/** 起動時に呼ぶ。送信中に止まったメールを送信済みフォルダで確認して、送信済み／待機に振り分ける。戻り値は振り分けた件数 */
export async function verifyInterruptedEmails(): Promise<{ sent: number; requeued: number; unknown: number }> {
  const db = getDb();
  const rows = db.prepare(`SELECT j.id, j.email, j.updated_at, c.sender_id FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id
    WHERE j.status='failed' AND j.channel='email' AND j.email<>'' AND j.result_text LIKE ?`).all(`${INTERRUPTED_PREFIX}%`) as InterruptedRow[];
  const out = { sent: 0, requeued: 0, unknown: 0 };
  const bySender = new Map<number, InterruptedRow[]>();
  for (const r of rows) bySender.set(r.sender_id, [...(bySender.get(r.sender_id) ?? []), r]);
  for (const [senderId, jobs] of bySender) {
    const s = db.prepare("SELECT * FROM sender_profiles WHERE id=?").get(senderId) as SenderProfile | undefined;
    if (!s || !s.smtp_user || !s.smtp_pass) { out.unknown += jobs.length; continue; }
    const keepsSentCopy = /gmail|google/i.test(s.smtp_host || "smtp.gmail.com");
    const client = new ImapFlow({ host: imapHostFor(s), port: 993, secure: true, auth: { user: s.smtp_user, pass: s.smtp_pass.replace(/^([a-z]{4}) ([a-z]{4}) ([a-z]{4}) ([a-z]{4})$/i, "$1$2$3$4") }, logger: false, socketTimeout: 60_000 });
    client.on("error", () => { /* 下の catch で拾う */ });
    try {
      await client.connect();
      const sentBox = (await client.list()).find((b) => b.specialUse === "\\Sent");
      if (!sentBox) { out.unknown += jobs.length; await client.logout().catch(() => {}); continue; }
      const lock = await client.getMailboxLock(sentBox.path);
      try {
        for (const j of jobs) {
          const claimAt = new Date(j.updated_at.replace(" ", "T") + "Z");
          const uids = (await client.search({ to: j.email, since: new Date(claimAt.getTime() - 86400_000) }, { uid: true })) || [];
          const dates: Date[] = [];
          for (const uid of uids) {
            const m = await client.fetchOne(String(uid), { uid: true, internalDate: true }, { uid: true });
            if (m && m.internalDate) dates.push(new Date(m.internalDate));
          }
          const d = decideInterrupted(dates, claimAt, keepsSentCopy);
          if (d.verdict === "sent") {
            db.prepare("UPDATE form_jobs SET status='sent', sent_at=?, result_text=?, updated_at=datetime('now') WHERE id=? AND status='failed'")
              .run(d.at.toISOString().replace("T", " ").slice(0, 19), `メール送信（${j.email}）※送信中にアプリが止まったが、送信済みフォルダで送信を確認`, j.id);
            out.sent++;
          } else if (d.verdict === "not_sent") {
            // 送れていなかったので待機に戻す（実行中のキャンペーンなら続きで自動送信される）
            db.prepare("UPDATE form_jobs SET status='queued', result_text=?, updated_at=datetime('now') WHERE id=? AND status='failed'")
              .run("再送信待ち: 送信中にアプリが止まったが、送信済みフォルダに無く未送信と確認", j.id);
            out.requeued++;
          } else out.unknown++;
        }
      } finally {
        lock.release();
      }
      await client.logout().catch(() => {});
    } catch {
      // つながらなければ「要確認」のまま（次の起動でもう一度確認する）
      out.unknown += jobs.length;
      try { client.close(); } catch { /* 既に閉じている */ }
    }
  }
  return out;
}
