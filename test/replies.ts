// 返信の自動振り分け（受信箱は使わず、届いたメールを直接渡して確認する）。`npm test` の最初に流れる
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fo-replies-"));

const { getDb } = await import("../src/db.js");
const { applyIncomingMail, classifyReply, stripQuoted, imapHostFor } = await import("../src/replies.js");

const db = getDb();
const MAILBOX = "sales@biz-labo.com";
const senderId = db.prepare(`INSERT INTO sender_profiles(label,company,person,email,smtp_user,smtp_pass) VALUES(?,?,?,?,?,?)`)
  .run("営業", "株式会社BizLabo", "田中 太郎", MAILBOX, MAILBOX, "abcdefghijklmnop").lastInsertRowid as number;
const otherSender = db.prepare(`INSERT INTO sender_profiles(label,company,person,email,smtp_user,smtp_pass) VALUES(?,?,?,?,?,?)`)
  .run("別アカウント", "株式会社BizLabo", "佐藤", "other@biz-labo.com", "other@biz-labo.com", "abcdefghijklmnop").lastInsertRowid as number;
const camp = db.prepare(`INSERT INTO form_campaigns(name,sender_id,mode,subject_text,template_text) VALUES(?,?,?,?,?)`).run("返信テスト", senderId, "template", "件名", "本文").lastInsertRowid as number;
const camp2 = db.prepare(`INSERT INTO form_campaigns(name,sender_id,mode,subject_text,template_text) VALUES(?,?,?,?,?)`).run("別アカウント", otherSender, "template", "件名", "本文").lastInsertRowid as number;

const SENT_MSG = "株式会社サンプル\nご担当者様\n\n人事担当者との商談機会についてご提案です。\n※本メッセージが不要な場合は、お手数ですが上記メールまでその旨ご連絡ください。以後のご連絡は控えさせていただきます。";
const job = (campaign: number, name: string, email: string, domain: string, channel = "email") =>
  db.prepare(`INSERT INTO form_jobs(campaign_id,company_name,email,domain,channel,status,sent_at,message_used) VALUES(?,?,?,?,?,'sent','2026-09-10 01:00:00',?)`)
    .run(campaign, name, email, domain, channel, SENT_MSG).lastInsertRowid as number;
const jA = job(camp, "アポ株式会社", "info@appo.co.jp", "appo.co.jp");
const jD = job(camp, "断り株式会社", "info@kotowari.jp", "kotowari.jp");
const jR = job(camp, "返信だけ株式会社", "", "henshin.com", "form");
const jQ = job(camp, "引用株式会社", "info@inyou.co.jp", "inyou.co.jp");
const jAuto = job(camp, "自動返信株式会社", "", "auto-reply.co.jp", "form");
const jManual = job(camp, "手動記録株式会社", "info@manual.co.jp", "manual.co.jp");
const jOther = job(camp2, "別受信箱株式会社", "info@other.co.jp", "other.co.jp");
db.prepare("UPDATE form_jobs SET outcome='replied', outcome_note='電話で話した' WHERE id=?").run(jManual);

const at = new Date("2026-09-12T03:00:00Z");
const get = (id: number) => db.prepare("SELECT outcome, outcome_note FROM form_jobs WHERE id=?").get(id) as { outcome: string; outcome_note: string };
const mail = (from: string, subject: string, text: string, autoHeader = false) => ({ from, subject, text, date: at, autoHeader });

// アポ: 日程の話 → アポ獲得
assert.equal(applyIncomingMail(MAILBOX, mail("tanaka@appo.co.jp", "Re: 人事担当者との商談機会について", "ご連絡ありがとうございます。\n一度お話を伺いたく、来週でご都合のよい日程をいくつかいただけますか。")), jA);
assert.equal(get(jA).outcome, "appointment", "日程・お話を伺いたい → アポ");
assert.ok(get(jA).outcome_note.startsWith("自動判定"), "メモに自動判定と残す");

// 断り: 別のアドレスでも同じドメイン（サブドメイン）なら同じ会社 → 断り＋今後送らない
assert.equal(applyIncomingMail(MAILBOX, mail("soumu@mail.kotowari.jp", "Re: ご提案", "弊社では現在検討しておりませんので、今後のご連絡は不要です。")), jD);
assert.equal(get(jD).outcome, "declined", "不要です → 断り");
assert.ok(db.prepare("SELECT 1 FROM form_suppressions WHERE domain='kotowari.jp'").get(), "断りは除外リストに入る");
assert.ok(db.prepare("SELECT 1 FROM email_optouts WHERE email='info@kotowari.jp'").get(), "断りは配信停止にも入る");

// 振り分けの言葉なし → 返信あり（フォーム送信の会社でも、受信箱に届いた返信で拾う）
assert.equal(applyIncomingMail(MAILBOX, mail("yamada@henshin.com", "お問い合わせの件", "山田です。社内で共有いたします。")), jR);
assert.equal(get(jR).outcome, "replied");

// 引用されたこちらの文面（「不要な場合は」「控えさせていただきます」）では断りにしない
assert.equal(applyIncomingMail(MAILBOX, mail("info@inyou.co.jp", "Re: ご提案", `承知しました。社内で確認します。\n\n2026年9月10日(水) 10:00 田中 太郎 <${MAILBOX}>:\n> ${SENT_MSG.split("\n").join("\n> ")}`)), jQ);
assert.equal(get(jQ).outcome, "replied", "引用部分の言葉は判定に使わない");
// その後にアポの返信が来たら、自動判定の「返信あり」を「アポ」に上げる
applyIncomingMail(MAILBOX, mail("info@inyou.co.jp", "Re: Re: ご提案", "オンラインでのお打ち合わせをお願いできますか。"));
assert.equal(get(jQ).outcome, "appointment", "自動の返信ありは、後から来たアポで上書きする");

// 自動返信・受付確認は数えない
assert.equal(applyIncomingMail(MAILBOX, mail("info@auto-reply.co.jp", "【自動返信】お問い合わせを受け付けました", "このメールは自動送信されています。")), null);
assert.equal(applyIncomingMail(MAILBOX, mail("info@auto-reply.co.jp", "お問い合わせありがとうございます", "以下の内容で受け付けました。")), null);
assert.equal(applyIncomingMail(MAILBOX, mail("info@auto-reply.co.jp", "Re: ご提案", "ありがとうございます", true)), null, "Auto-Submitted ヘッダー");
assert.equal(applyIncomingMail(MAILBOX, mail("mailer-daemon@googlemail.com", "Delivery Status Notification", "")), null);
assert.equal(get(jAuto).outcome, "", "自動返信では反応を付けない");

// 人が手で記録した反応は上書きしない
assert.equal(applyIncomingMail(MAILBOX, mail("info@manual.co.jp", "Re", "今回は見送りとさせていただきます。")), null);
assert.equal(get(jManual).outcome, "replied");

// 別の受信箱から送った会社は、この受信箱の返信では付けない。送る前に届いたメールも関係ない
assert.equal(applyIncomingMail(MAILBOX, mail("info@other.co.jp", "Re", "日程を調整させてください")), null);
assert.equal(applyIncomingMail(MAILBOX, { ...mail("info@appo.co.jp", "前のメール", "見送ります"), date: new Date("2026-09-01T00:00:00Z") }), null);
// フリーメールはドメインでは突き合わせない（アドレスが一致したときだけ）
assert.equal(applyIncomingMail(MAILBOX, mail("someone@gmail.com", "Re", "日程を調整させてください")), null);

// 判定単体
assert.equal(classifyReply("配信停止", "").outcome, "declined");
assert.equal(classifyReply("Re", "今回は見送りますが、また日程が合えばお話を伺いたいです").outcome, "replied", "断りとアポの両方 → 人に任せる");
assert.equal(stripQuoted("了解です\n-----Original Message-----\n不要です"), "了解です");
assert.equal(imapHostFor({ smtp_host: "smtp.gmail.com" } as never), "imap.gmail.com");
assert.equal(imapHostFor({ smtp_host: "smtp.office365.com" } as never), "outlook.office365.com");

// フォーム送信後の受付確認メール（こちらの文面を見出し付きで転記）は数えない
const jConf = job(camp, "受付確認株式会社", "", "uketsuke.co.jp", "form");
const LONG_MSG = "貴社にご貢献できるかと存じますので、詳細についてオンラインにてお話しさせていただけませんでしょうか。\n以下リンクからご予約お願いいたします。";
db.prepare("UPDATE form_jobs SET message_used=? WHERE id=?").run(LONG_MSG, jConf);
assert.equal(applyIncomingMail(MAILBOX, mail("info@uketsuke.co.jp", "送信ありがとうございました", `お名前：田中 太郎\nお問い合わせ内容：${LONG_MSG.split("\n")[0]}\n送信日時：2026/09/12 12:00`)), null, "件名「送信ありがとうございました」");
assert.equal(applyIncomingMail(MAILBOX, mail("info@uketsuke.co.jp", "株式会社受付 お問い合わせ", `担当より確認します。\nお問い合わせ内容：${LONG_MSG.split("\n")[0]}`)), jConf);
assert.equal(get(jConf).outcome, "replied", "転記されたこちらの文面（お話しさせて…）ではアポにしない");
assert.ok(get(jConf).outcome_note.includes("本文「"), "判定に使った本文の抜粋を残す");

// 引用記号なしで署名・配信停止の案内が引用されても、断りにしない。件名の「商談」でもアポにしない
const jFoot = job(camp, "署名引用株式会社", "info@foot.co.jp", "foot.co.jp");
assert.equal(applyIncomingMail(MAILBOX, mail("info@foot.co.jp", "Re: 【ご提案】人事担当者との商談機会について", "資料拝見しました。社内で検討します。\n\n今後このご案内が不要な場合は、お手数ですが本メールに「配信停止」とご返信ください（sales@biz-labo.com）。以後お送りしません。")), jFoot);
assert.equal(get(jFoot).outcome, "replied");
// 本当の配信停止の返信
const jStop = job(camp, "配信停止株式会社", "info@stop.co.jp", "stop.co.jp");
applyIncomingMail(MAILBOX, mail("info@stop.co.jp", "配信停止", ""));
assert.equal(get(jStop).outcome, "declined");

// HPのドメインと送信先メールのドメインが違う会社（送信先 ln-sales@lognavi.com、返信は担当者の k-kanou@lognavi.com）
const jDiff = job(camp, "別ドメイン株式会社", "ln-sales@lognavi.example", "aspark.example");
assert.equal(applyIncomingMail(MAILBOX, mail("k-kanou@lognavi.example", "Re: 【ご提案】人事担当者との商談機会について", "ぜひ1度お話の機会を頂戴できますと幸いです。9月18日(金)16:00～17:00にて登録させていただきました。")), jDiff, "送信先メールのドメインでも突き合わせる");
assert.equal(get(jDiff).outcome, "appointment");
// Apple Mail の配信停止（件名「配信停止」＋ Auto-Submitted）は断り
const jApple = job(camp, "アップルメール株式会社", "info@apple-unsub.jp", "apple-unsub.jp");
assert.equal(applyIncomingMail(MAILBOX, mail("yoshi@apple-unsub.jp", "配信停止", "このメールは“配信停止”というメッセージへの登録を解除するためにApple Mailから送信されました。", true)), jApple);
assert.equal(get(jApple).outcome, "declined");
// 返信本文の「配信停止をお願いいたします」は断り（件名の「商談」はアポにしない）
const jSenior = job(camp, "シニア株式会社", "info@senior.example", "corp.senior.example");
applyIncomingMail(MAILBOX, mail("info@senior.example", "Re: 【ご提案】人事担当者との商談機会について", "田中様 お世話になります。ご連絡有難うございます。下記件ですが、配信停止をお願いいたします。"));
assert.equal(get(jSenior).outcome, "declined");
// 受付確認メール（件名に「内容のご確認」「控え」、本文に「サイトより送信されています」）は数えない
const jCtrl = job(camp, "控え株式会社", "", "hikae.example", "form");
assert.equal(applyIncomingMail(MAILBOX, mail("support@hikae.example", "【株式会社控え】お問い合わせ 控え", "※本メールは(株)控え ウェブサイトより送信されています")), null);
assert.equal(applyIncomingMail(MAILBOX, mail("support@hikae.example", "お知らせ", "～このメールは、システムからの自動返信です～")), null);
assert.equal(get(jCtrl).outcome, "");

console.log("replies: ALL OK");

// 送信中に止まったメール: 送信済みフォルダの控えで判断
{
  const { decideInterrupted } = await import("../src/replies.js");
  const claim = new Date("2026-09-16T16:04:49Z");
  assert.equal(decideInterrupted([new Date("2026-09-16T16:04:51Z")], claim, true).verdict, "sent", "送信開始の直後に控えがある → 送信済み");
  assert.equal(decideInterrupted([new Date("2026-08-01T00:00:00Z")], claim, true).verdict, "not_sent", "前に送った別の控えだけ → Gmailなら未送信");
  assert.equal(decideInterrupted([], claim, false).verdict, "unknown", "控えが残らないサービスでは決めない");
  console.log("interrupted: ALL OK");
}
