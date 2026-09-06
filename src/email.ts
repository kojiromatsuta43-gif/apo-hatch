// メール送信（自分のGmail / Google Workspace 等のSMTP）。差出人はクライアント自身のアカウント。
import nodemailer from "nodemailer";
import { getDb, type SenderProfile } from "./db.js";

export function senderEmailOk(sender: SenderProfile): { ok: boolean; reason?: string; from: string } {
  if (!sender.smtp_user || !sender.smtp_pass) return { ok: false, reason: "送信用メールアカウント（ユーザー名・アプリパスワード）が未設定です", from: "" };
  return { ok: true, from: (sender.from_email || sender.smtp_user).trim().toLowerCase() };
}

function transport(sender: SenderProfile) {
  const port = sender.smtp_port || 465;
  return nodemailer.createTransport({ host: sender.smtp_host || "smtp.gmail.com", port, secure: port === 465, auth: { user: sender.smtp_user, pass: sender.smtp_pass } });
}

export async function testSmtp(sender: SenderProfile): Promise<void> {
  await transport(sender).verify();
}

export function isOptedOut(email: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM email_optouts WHERE email=?").get(email.trim().toLowerCase()));
}
export function optOut(email: string, reason: string) {
  const e = email.trim().toLowerCase();
  if (e) getDb().prepare("INSERT OR IGNORE INTO email_optouts (email, reason) VALUES (?,?)").run(e, reason);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 本文に法定の署名・停止案内を付けてテキスト/HTMLを作る（単体版は停止リンクが無いので「返信で停止」） */
export function buildEmailBody(message: string, sender: SenderProfile): { text: string; html: string } {
  const replyTo = sender.reply_email || sender.email;
  const footer = [
    "──────────",
    `${sender.company}${sender.person ? ` ${sender.person}` : ""}`,
    sender.address ? `${sender.postal ? `〒${sender.postal} ` : ""}${sender.address}` : "",
    sender.tel ? `TEL: ${sender.tel}` : "",
    `メール: ${replyTo}`,
    sender.url || "",
    "",
    `今後このご案内が不要な場合は、お手数ですが本メールに「配信停止」とご返信ください（${replyTo}）。以後お送りしません。`,
  ].filter((l) => l !== "");
  const text = `${message.trim()}\n\n${footer.join("\n")}`;
  const paras = message.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em;line-height:1.7">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<div style="font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;font-size:14px;color:#1C1710;max-width:640px">${paras}<hr style="border:0;border-top:1px solid #ddd;margin:20px 0"><p style="font-size:12px;color:#555;line-height:1.7;margin:0">${footer.slice(1).map(esc).join("<br>")}</p></div>`;
  return { text, html };
}

export async function sendEmail(sender: SenderProfile, input: { from: string; to: string; subject: string; text: string; html: string }): Promise<string> {
  const replyTo = sender.reply_email || sender.email;
  const r = await transport(sender).sendMail({
    from: { name: sender.company, address: input.from },
    to: input.to,
    replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: { "List-Unsubscribe": `<mailto:${replyTo}?subject=配信停止>` },
  });
  return r.messageId ?? "";
}
