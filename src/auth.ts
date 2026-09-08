// ログイン（単体版）。ユーザーごとにアカウントを発行し、キャンペーン・送信者・送信履歴を分離する。
// BRIDGE HATCH に組み込む場合は本体の認証を使うので、このファイルは不要になる。
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getDb, type User } from "./db.js";

const SESSION_DAYS = 14;

// ---- パスワード（scrypt。外部ライブラリ不要）----
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const calc = crypto.scryptSync(plain, salt, 64);
  const want = Buffer.from(key, "hex");
  return calc.length === want.length && crypto.timingSafeEqual(calc, want);
}

/** 覚えやすく推測されにくい初期パスワードを作る */
export function randomPassword(len = 12): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(crypto.randomBytes(len), (b) => chars[b % chars.length]).join("");
}

// ---- ユーザー ----
export function createUser(username: string, password: string, opts: { role?: "admin" | "user"; displayName?: string; mustChange?: boolean } = {}): User {
  const db = getDb();
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) throw new Error("ログインIDは半角英数字・._- の3〜32文字にしてください");
  if (password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  if (db.prepare("SELECT 1 FROM users WHERE username=?").get(name)) throw new Error("そのログインIDはすでに使われています");
  const r = db.prepare("INSERT INTO users(username, display_name, password_hash, role, must_change) VALUES(?,?,?,?,?)")
    .run(name, opts.displayName ?? "", hashPassword(password), opts.role ?? "user", opts.mustChange ? 1 : 0);
  return db.prepare("SELECT * FROM users WHERE id=?").get(r.lastInsertRowid) as User;
}

export function setPassword(userId: number, password: string, mustChange = false) {
  if (password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  getDb().prepare("UPDATE users SET password_hash=?, must_change=? WHERE id=?").run(hashPassword(password), mustChange ? 1 : 0, userId);
}

export function findUser(username: string): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE username=?").get(username.trim().toLowerCase()) as User | undefined;
}

export function listUsers(): User[] {
  return getDb().prepare("SELECT * FROM users ORDER BY id").all() as User[];
}

/** 起動時: ユーザーが1人もいなければ管理者を作る。パスワードは ADMIN_PASSWORD か自動生成 */
export function ensureFirstAdmin(): { username: string; password: string } | null {
  const db = getDb();
  const n = (db.prepare("SELECT COUNT(*) n FROM users").get() as { n: number }).n;
  if (n > 0) return null;
  const username = (process.env.ADMIN_USER ?? "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? randomPassword();
  createUser(username, password, { role: "admin", displayName: "管理者", mustChange: !process.env.ADMIN_PASSWORD });
  return { username, password };
}

// ---- セッション ----
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function startSession(res: Response, userId: number) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token, user_id, expires_at) VALUES(?,?,datetime('now', ?))").run(token, userId, `+${SESSION_DAYS} days`);
  db.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").run(userId);
  const secure = process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `apohatch_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

export function endSession(req: Request, res: Response) {
  const token = parseCookies(req.headers.cookie)["apohatch_sid"];
  if (token) getDb().prepare("DELETE FROM sessions WHERE token=?").run(token);
  res.setHeader("Set-Cookie", "apohatch_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

export type AuthedRequest = Request & { user?: User };

/** 認証が要らないパス（ログイン画面・配信停止リンク） */
const PUBLIC_PATHS = [/^\/login$/, /^\/logout$/, /^\/unsubscribe\//, /^\/healthz$/];

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const db = getDb();
  const token = parseCookies(req.headers.cookie)["apohatch_sid"];
  if (token) {
    const row = db.prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > datetime('now') AND u.active=1"
    ).get(token) as User | undefined;
    if (row) req.user = row;
    else db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  }
  if (req.user) {
    // パスワード変更が必要なうちは、変更画面以外に進ませない
    if (req.user.must_change && !/^\/(password|logout)$/.test(req.path)) return res.redirect("/password");
    return next();
  }
  if (PUBLIC_PATHS.some((re) => re.test(req.path))) return next();
  const back = encodeURIComponent(req.originalUrl || "/");
  return res.redirect(`/login?next=${back}`);
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).send("管理者のみが使える画面です");
  next();
}

/** 期限切れセッションの掃除（1日1回） */
export function cleanupSessions() {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}
