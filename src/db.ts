// SQLite 永続層。BRIDGE HATCH 本体（better-sqlite3 / DATA_DIR）と同じ流儀にしてある。
// 組み込み時はこのファイルのテーブル定義を本体の schema に足し、getDb() を本体の db に差し替えるだけ。
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");
export const SCREENSHOT_DIR = path.join(DATA_DIR, "screenshots");
export const MATERIAL_DIR = path.join(DATA_DIR, "materials");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(MATERIAL_DIR, { recursive: true });
  _db = new Database(path.join(DATA_DIR, "form-outreach.db"));
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- 送信者プロフィール（社内用 / クライアントごと）。owner_user_id は本体組み込み時に users.id を入れる
  CREATE TABLE IF NOT EXISTS sender_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER,
    label TEXT NOT NULL,
    company TEXT NOT NULL,
    industry TEXT DEFAULT '',
    person TEXT NOT NULL,
    person_kana TEXT DEFAULT '',
    email TEXT NOT NULL,
    reply_email TEXT DEFAULT '',      -- フォームで返信を受けるメール（emailと分ける場合）
    tel TEXT DEFAULT '',
    postal TEXT DEFAULT '',
    address TEXT DEFAULT '',
    url TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS form_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER,
    name TEXT NOT NULL,
    sender_id INTEGER NOT NULL REFERENCES sender_profiles(id),
    mode TEXT NOT NULL DEFAULT 'hybrid',      -- template | ai | hybrid
    subject_text TEXT NOT NULL DEFAULT '',
    template_text TEXT NOT NULL DEFAULT '',
    ai_instruction TEXT NOT NULL DEFAULT '',
    daily_limit INTEGER NOT NULL DEFAULT 300,
    send_window_start INTEGER NOT NULL DEFAULT 9,
    send_window_end INTEGER NOT NULL DEFAULT 18,
    weekdays_only INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',     -- draft | running | paused | done
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS form_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES form_campaigns(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    form_url TEXT DEFAULT '',
    site_url TEXT DEFAULT '',
    industry TEXT DEFAULT '',
    sub_industry TEXT DEFAULT '',
    prefecture TEXT DEFAULT '',
    representative TEXT DEFAULT '',
    domain TEXT DEFAULT '',
    is_test INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
      -- queued | sending | sent | skip_no_form | skip_refused | skip_captcha | skip_suppressed | skip_duplicate | failed
    message_used TEXT DEFAULT '',
    result_text TEXT DEFAULT '',
    screenshot_path TEXT DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_form_jobs_campaign ON form_jobs(campaign_id, status);
  CREATE INDEX IF NOT EXISTS idx_form_jobs_domain ON form_jobs(domain, status);

  -- 全キャンペーン横断の除外リスト（お断り検知・返信で停止希望・手動DNC）
  CREATE TABLE IF NOT EXISTS form_suppressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- 企業HPの本文キャッシュ（AI個別化用。1社1回だけ取得）
  CREATE TABLE IF NOT EXISTS email_optouts (
    email TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS site_cache (
    domain TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    text TEXT DEFAULT '',
    fetched_at TEXT DEFAULT (datetime('now'))
  );
  `);
  const addCol = (table: string, col: string, def: string) => {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addCol("form_campaigns", "channel", "TEXT NOT NULL DEFAULT 'both'");
  addCol("form_campaigns", "email_daily_limit", "INTEGER NOT NULL DEFAULT 100");
  addCol("form_jobs", "channel", "TEXT NOT NULL DEFAULT 'form'");
  addCol("form_jobs", "email", "TEXT NOT NULL DEFAULT ''");
  addCol("form_jobs", "scanned_at", "TEXT");
  addCol("form_jobs", "scan_note", "TEXT NOT NULL DEFAULT ''");
  addCol("form_campaigns", "resend_days", "INTEGER NOT NULL DEFAULT 90");   // 同じ会社への再送禁止期間（0=制限なし）
  addCol("form_campaigns", "ignore_refusal", "INTEGER NOT NULL DEFAULT 0"); // 1=営業お断りのサイトにも送る（非推奨）

  // ---- ログイン（単体版）----
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',   -- admin | user
    active INTEGER NOT NULL DEFAULT 1,
    must_change INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  // 誰が登録したか（一覧表示の出し分け用。突合そのものは全体共通のまま＝安全側）
  addCol("form_suppressions", "owner_user_id", "INTEGER");

  // 除外リストに会社名・メール・電話を持たせる（ドメイン不明でメールだけ、という登録もあるため作り直す）
  {
    const cols = (db.prepare("PRAGMA table_info(form_suppressions)").all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes("company_name")) {
      db.exec(`
        CREATE TABLE form_suppressions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_name TEXT NOT NULL DEFAULT '',
          domain TEXT,
          email TEXT,
          tel TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          owner_user_id INTEGER,
          created_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO form_suppressions_new(id, domain, reason, owner_user_id, created_at)
          SELECT id, NULLIF(domain,''), reason, owner_user_id, created_at FROM form_suppressions;
        DROP TABLE form_suppressions;
        ALTER TABLE form_suppressions_new RENAME TO form_suppressions;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_supp_domain ON form_suppressions(domain) WHERE domain IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_supp_email ON form_suppressions(email);
      `);
    }
  }
  addCol("email_optouts", "owner_user_id", "INTEGER");
  addCol("form_jobs", "outcome", "TEXT NOT NULL DEFAULT ''");
  addCol("form_jobs", "outcome_note", "TEXT NOT NULL DEFAULT ''");
  addCol("sender_profiles", "from_email", "TEXT NOT NULL DEFAULT ''");
  addCol("sender_profiles", "smtp_host", "TEXT NOT NULL DEFAULT 'smtp.gmail.com'");
  addCol("sender_profiles", "smtp_port", "INTEGER NOT NULL DEFAULT 465");
  addCol("sender_profiles", "smtp_user", "TEXT NOT NULL DEFAULT ''");
  addCol("sender_profiles", "smtp_pass", "TEXT NOT NULL DEFAULT ''");
  // リトライで送信済みになったとき、直前の失敗ステータスを覚えておく（履歴表示用）
  addCol("form_jobs", "prev_status", "TEXT NOT NULL DEFAULT ''");
  addCol("form_jobs", "prev_result", "TEXT NOT NULL DEFAULT ''");
  // 資料添付（メールは添付ファイル、フォームは本文にリンク）
  addCol("form_campaigns", "material_url", "TEXT NOT NULL DEFAULT ''");
  addCol("form_campaigns", "attach_path", "TEXT NOT NULL DEFAULT ''");
  addCol("form_campaigns", "attach_name", "TEXT NOT NULL DEFAULT ''");
  // 要確認: 回答を決められなかった質問（JSON）と、画面で利用者が選んだ回答（JSON）
  addCol("form_jobs", "pending_questions", "TEXT NOT NULL DEFAULT ''");
  addCol("form_jobs", "manual_answers", "TEXT NOT NULL DEFAULT ''");
  // 1=フォームで電話番号が必須の欄にだけ入力する（任意の欄には書かない。電話を載せたくない人向け）
  addCol("sender_profiles", "tel_required_only", "INTEGER NOT NULL DEFAULT 0");
  // キャンペーンのグループ名。同じグループ内では同じ会社に重ねて送らない（フォーム用とメール用で分けた場合など）。空=グループなし
  addCol("form_campaigns", "group_name", "TEXT NOT NULL DEFAULT ''");

  // v0.3.51 で「送信後の判定不能」を一律「送信済み（完了画面を確認できず・要確認）」に書き換えたが、
  // 届いたかは会社によって違うため取り消した。その書き換えを元の「失敗（送信後の判定不能）」に戻す。
  // v0.3.51〜0.3.53 の送信で付いた同じ文言も対象（当時の判定ロジックでは失敗だったもの）。
  // 一致するのは書き換え済みの行だけなので、毎回起動時に流しても結果は変わらない。配布先もアップデート後の起動で戻る。
  db.prepare(`UPDATE form_jobs
    SET status='failed',
        sent_at=NULL,
        result_text='送信後の判定不能: ' || substr(result_text, length('送信済み（完了画面を確認できず・要確認）: ') + 1)
    WHERE is_test=0 AND status='sent' AND result_text LIKE '送信済み（完了画面を確認できず・要確認）: %'`).run();
}

export type Channel = "form" | "email" | "both";

export type SenderProfile = {
  id: number;
  owner_user_id: number | null;
  label: string;
  company: string;
  industry: string;
  person: string;
  person_kana: string;
  email: string;
  reply_email: string;
  tel: string;
  postal: string;
  address: string;
  url: string;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  tel_required_only: number;
};

export type User = {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: "admin" | "user";
  active: number;
  must_change: number;
  last_login_at: string | null;
  created_at: string;
};

export type Campaign = {
  id: number;
  owner_user_id: number | null;
  name: string;
  sender_id: number;
  mode: "template" | "ai" | "hybrid" | "tpl_ai";
  subject_text: string;
  template_text: string;
  ai_instruction: string;
  daily_limit: number;
  send_window_start: number;
  send_window_end: number;
  weekdays_only: number;
  channel: Channel;
  email_daily_limit: number;
  resend_days: number;
  ignore_refusal: number;
  status: "draft" | "running" | "paused" | "done";
  material_url: string;   // フォーム送信で本文に載せる資料の公開リンク
  attach_path: string;    // メール添付する資料ファイルの保存先（DATA_DIR/materials 配下）
  attach_name: string;    // 添付時に見せるファイル名
  group_name: string;     // 同じグループ内では同じ会社に重ねて送らない。空=グループなし
};

// フリーメールはドメインが同じでも別の会社。グループ内の重複判定ではドメインではなくメールアドレスで比べる
export const FREE_MAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.co.jp", "ymail.ne.jp", "yahoo.com", "outlook.jp", "outlook.com", "hotmail.com", "hotmail.co.jp", "live.jp", "live.com", "icloud.com", "me.com", "mac.com", "aol.com", "docomo.ne.jp", "ezweb.ne.jp", "au.com", "softbank.ne.jp", "i.softbank.jp", "nifty.com", "biglobe.ne.jp", "ocn.ne.jp", "so-net.ne.jp", "excite.co.jp", "goo.jp", "infoseek.jp"]);

/** 同じグループの別キャンペーンで、この会社（ドメイン／フリーメールならアドレス）がすでに対象になっているか。
 *  statuses に含まれる状態のジョブがあれば、そのキャンペーン名を返す。グループなしなら常に null */
export function findGroupDuplicate(db: Database.Database, opts: { groupName: string; campaignId: number; domain: string; email: string; statuses: string[]; excludeJobId?: number }): string | null {
  if (!opts.groupName || !opts.domain) return null;
  const ph = opts.statuses.map(() => "?").join(",");
  const byEmail = FREE_MAIL_DOMAINS.has(opts.domain);
  if (byEmail && !opts.email) return null;
  const row = db.prepare(`SELECT c.name FROM form_jobs j JOIN form_campaigns c ON c.id=j.campaign_id
    WHERE c.group_name=? AND j.campaign_id<>? AND j.is_test=0 AND j.status IN (${ph}) AND j.id<>?
      AND ${byEmail ? "lower(j.email)=lower(?)" : "j.domain=?"} LIMIT 1`)
    .get(opts.groupName, opts.campaignId, ...opts.statuses, opts.excludeJobId ?? -1, byEmail ? opts.email : opts.domain) as { name: string } | undefined;
  return row?.name ?? null;
}

export type JobStatus =
  | "queued"
  | "sending"
  | "sent"
  | "skip_no_form"
  | "skip_refused"
  | "skip_captcha"
  | "skip_suppressed"
  | "skip_duplicate"
  | "skip_optout"
  | "skip_cancelled"
  | "failed";

export type Job = {
  id: number;
  campaign_id: number;
  company_name: string;
  form_url: string;
  site_url: string;
  industry: string;
  sub_industry: string;
  prefecture: string;
  representative: string;
  domain: string;
  is_test: number;
  channel: "form" | "email";
  email: string;
  scanned_at: string | null;
  scan_note: string;
  outcome: string;
  outcome_note: string;
  status: JobStatus;
  message_used: string;
  result_text: string;
  screenshot_path: string;
  attempts: number;
  sent_at: string | null;
  updated_at: string;
  prev_status: string;
  prev_result: string;
  pending_questions: string;
  manual_answers: string;
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "待機中",
  sending: "送信中",
  sent: "送信済み",
  skip_no_form: "フォーム無し",
  skip_refused: "営業お断り",
  skip_captcha: "CAPTCHA",
  skip_suppressed: "除外リスト",
  skip_duplicate: "90日以内に送信済",
  skip_optout: "配信停止済",
  skip_cancelled: "キャンセル",
  failed: "失敗",
};

// 配信チャネルの4モード。旧値（both/form/email）も受け取れるように正規化する。
export type ChannelMode = "form_first" | "email_first" | "email_only" | "form_only";
export function channelMode(raw: string | null | undefined): ChannelMode {
  switch (raw) {
    case "form_first": case "both": return "form_first";
    case "email_first": return "email_first";
    case "email_only": case "email": return "email_only";
    case "form_only": case "form": return "form_only";
    default: return "form_first";
  }
}
export const CHANNEL_LABEL: Record<ChannelMode, string> = {
  form_first: "フォーム優先（無ければメール）",
  email_first: "メール優先（無ければフォーム）",
  email_only: "メールのみ",
  form_only: "フォームのみ",
};
/** このモードで、フォームが無い会社をメールに切り替えてよいか（事前チェックで使う） */
export const allowsEmailFallback = (raw: string) => { const m = channelMode(raw); return m === "form_first" || m === "email_first"; };

export function domainOf(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// 官公庁・学校・医療機関など既定で除外するドメイン
export const EXCLUDED_DOMAIN_SUFFIXES = [".go.jp", ".lg.jp", ".ac.jp", ".ed.jp"];

export function isExcludedDomain(domain: string): boolean {
  return EXCLUDED_DOMAIN_SUFFIXES.some((s) => domain.endsWith(s));
}

export function getSetting(key: string, fallback = ""): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}
export function setSetting(key: string, value: string) {
  getDb().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

export const OUTCOME_LABEL: Record<string, string> = { "": "—", replied: "返信あり", appointment: "アポ獲得", declined: "断り・不要" };
