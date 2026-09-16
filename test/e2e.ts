// ダミーサイトを立てて、送信エンジンを通しで検証する。`npm test`
import http from "node:http";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fo-test-"));

const { getDb } = await import("../src/db.js");
const { importRowsToCampaign } = await import("../src/csv.js");
const { launchBrowser, scanCompany } = await import("../src/engine.js");
const { processJob } = await import("../src/worker.js");
const { DEFAULT_TEMPLATE } = await import("../src/message.js");

const received: Record<string, Record<string, string>> = {};
const simpleHits: Record<string, string>[] = [];

const page = (title: string, body: string) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title></head><body><header><nav><a href="/">ホーム</a> <a href="/company">会社概要</a> <a href="/recruit">採用情報</a> <a href="/simple">お問い合わせ</a></nav></header>${body}<footer>© Test Co.</footer></body></html>`;

function parseBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(data))));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const send = (html: string, code = 200) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8" }); res.end(html); };
  const p = url.pathname;

  if (p === "/" || p === "/index.html") return send(page("テスト株式会社", `<h1>テスト株式会社</h1><p>私たちは福岡で飲食店を3店舗運営しています。</p><p><a href="/contact-page">お問い合わせはこちら</a></p><p>メール: <a href="mailto:info@test.co.jp">info@test.co.jp</a> / 採用: recruit@test.co.jp</p>`));
  if (p === "/contact-page") { res.writeHead(302, { location: "/simple" }); return res.end(); }

  // 1. 単一ページ型（Contact Form 7 風）
  if (p === "/simple" && req.method === "GET") return send(page("お問い合わせ", `
    <h1>お問い合わせ</h1><form method="post" action="/simple">
    <p><label>会社名 <input type="text" name="your-company"></label></p>
    <p><label>お名前 <span class="required">必須</span><input type="text" name="your-name" required></label></p>
    <p><label>フリガナ <input type="text" name="your-kana"></label></p>
    <p><label>メールアドレス <input type="email" name="your-email" required></label></p>
    <p><label>電話番号 <input type="tel" name="your-tel"></label></p>
    <p><label>件名 <input type="text" name="your-subject"></label></p>
    <p><label>お問い合わせ内容 <textarea name="your-message" required></textarea></label></p>
    <p><label><input type="checkbox" name="agree" value="1" required> 個人情報の取り扱いに同意する</label></p>
    <p><input type="submit" value="送信する"></p></form>
    <form action="/search"><input type="search" name="q" placeholder="サイト内検索"><button>検索</button></form>`));
  if (p === "/simple" && req.method === "POST") { received.simple = await parseBody(req); simpleHits.push(received.simple); return send(page("完了", `<h1>お問い合わせを受け付けました</h1><p>ありがとうございます。</p>`)); }

  // 2. 確認画面あり・テーブル型・分割項目
  if (p === "/confirm" && req.method === "GET") return send(page("お問い合わせフォーム", `
    <h1>お問い合わせフォーム</h1><form method="post" action="/confirm/check"><table>
    <tr><th>貴社名 <em>*</em></th><td><input type="text" name="company"></td></tr>
    <tr><th>ご担当者名 <em>*</em></th><td>姓 <input type="text" name="sei"> 名 <input type="text" name="mei"></td></tr>
    <tr><th>フリガナ</th><td>セイ <input type="text" name="sei_kana"> メイ <input type="text" name="mei_kana"></td></tr>
    <tr><th>メールアドレス</th><td><input type="text" name="email"></td></tr>
    <tr><th>メールアドレス（確認）</th><td><input type="text" name="email_confirm"></td></tr>
    <tr><th>電話番号</th><td><input type="text" name="tel1" size="4"> - <input type="text" name="tel2" size="4"> - <input type="text" name="tel3" size="4"></td></tr>
    <tr><th>郵便番号</th><td>〒 <input type="text" name="zip1" size="3"> - <input type="text" name="zip2" size="4"></td></tr>
    <tr><th>都道府県</th><td><select name="pref"><option value="">選択してください</option><option>東京都</option><option>福岡県</option></select></td></tr>
    <tr><th>ご住所</th><td><input type="text" name="address"></td></tr>
    <tr><th>お問い合わせ種別</th><td><label><input type="radio" name="kind" value="recruit">採用について</label><label><input type="radio" name="kind" value="service">サービスについて</label><label><input type="radio" name="kind" value="other">その他</label></td></tr>
    <tr><th>お問い合わせ内容</th><td><textarea name="body"></textarea></td></tr>
    </table><p><button type="button" onclick="history.back()">戻る</button> <button type="submit">確認画面へ</button></p></form>`));
  if (p === "/confirm/check" && req.method === "POST") {
    const b = await parseBody(req);
    const hidden = Object.entries(b).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}">`).join("");
    return send(page("入力内容の確認", `<h1>入力内容の確認</h1><table>${Object.entries(b).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>
      <form method="post" action="/confirm/send">${hidden}<button type="submit" name="back" value="1" formaction="/confirm">修正する</button> <button type="submit">送信する</button></form>`));
  }
  if (p === "/confirm/send" && req.method === "POST") { received.confirm = await parseBody(req); res.writeHead(302, { location: "/confirm/thanks" }); return res.end(); }
  if (p === "/confirm/thanks") return send(page("送信完了", `<h1>送信完了</h1><p>お問い合わせいただきありがとうございました。</p>`));

  // 3. 営業お断り
  if (p === "/refused") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><p class="note">※営業目的のお問い合わせはお断りしております。</p><form method="post"><input type="text" name="name" placeholder="お名前"><input type="email" name="email" placeholder="メール"><textarea name="msg"></textarea><button>送信</button></form>`));

  // 4. CAPTCHA
  if (p === "/captcha") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><form method="post"><input type="text" name="name" placeholder="お名前"><input type="email" name="email" placeholder="メール"><textarea name="msg"></textarea><div class="g-recaptcha" data-sitekey="x" style="width:304px;height:78px;background:#eee">reCAPTCHA</div><button>送信</button></form>`));

  // 5. 入力エラーで弾かれる
  if (p === "/strict" && req.method === "GET") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><form method="post" action="/strict"><p><label>お名前 <input type="text" name="name"></label></p><p><label>メール <input type="email" name="email"></label></p><p><label>ご希望の来店日 <input type="text" name="visit_date"></label></p><p><label>内容 <textarea name="msg"></textarea></label></p><button>送信</button></form>`));
  if (p === "/strict" && req.method === "POST") { const b = await parseBody(req); return send(page("お問い合わせ", `<h1>お問い合わせ</h1><p class="error">ご希望の来店日を入力してください</p><form method="post" action="/strict"><input type="text" name="name" value="${b.name ?? ""}"><textarea name="msg">${b.msg ?? ""}</textarea><button>送信</button></form>`)); }


  // 7. dl型 + placeholderのみ + 埋め込みiframe の親ページ
  if (p === "/embed") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><p>下のフォームからどうぞ</p><iframe src="/embed-form" style="width:100%;height:600px;border:0"></iframe>`));
  if (p === "/embed-form" && req.method === "GET") return send(`<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body><form method="post" action="/embed-form"><dl>
    <dt>会社名</dt><dd><input type="text" name="f1" placeholder="例）株式会社◯◯"></dd>
    <dt>お名前</dt><dd><input type="text" name="f2"></dd>
    <dt>メールアドレス</dt><dd><input type="text" name="f3"></dd>
    <dt>ご質問・ご相談内容</dt><dd><textarea name="f4"></textarea></dd></dl>
    <button type="submit">送信</button></form></body></html>`);
  if (p === "/embed-form" && req.method === "POST") { received.embed = await parseBody(req); return send(`<!doctype html><html><body><p>送信が完了しました。</p></body></html>`); }

  // 8. SPA風: formタグ無し、JSで送信、画面遷移なしで完了メッセージ。ハニーポット付き
  if (p === "/spa") return send(page("Contact", `<h1>Contact</h1>
    <div id="app">
      <label for="c">貴社名</label><input id="c">
      <label for="n">ご担当者名</label><input id="n">
      <label for="e">Email</label><input id="e" type="email">
      <label for="t">お電話番号</label><input id="t" type="tel">
      <label for="m">お問い合わせ内容</label><textarea id="m"></textarea>
      <input type="text" name="website2" style="position:absolute;left:-9999px" tabindex="-1" autocomplete="off">
      <input type="text" name="fax" placeholder="FAX番号">
      <label><input type="checkbox" id="ag"> プライバシーポリシーに同意する</label>
      <button id="go" type="button">送信する</button>
      <div id="done" style="display:none"></div>
    </div>
    <script>
      document.getElementById('go').onclick = async () => {
        if (!document.getElementById('ag').checked) { alert('同意が必要です'); return; }
        const hp = document.querySelector('[name=website2]').value;
        const body = new URLSearchParams({ c: c.value, n: n.value, e: e.value, t: t.value, m: m.value, hp });
        const r = await fetch('/spa/submit', { method: 'POST', body });
        document.getElementById('app').innerHTML = '<p>' + (await r.text()) + '</p>';
      };
    </script>`));
  if (p === "/spa/submit" && req.method === "POST") { const b = await parseBody(req); if (b.hp) { res.writeHead(400); return res.end("エラーが発生しました"); } received.spa = b; res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); return res.end("お問い合わせありがとうございます。送信完了しました。"); }

  // 9. 2段階（JSで次へ）: step1 会社・名前・メール → 次へ → step2 内容・連絡方法(必須ラジオ)・件名(select) → 送信 → /thanks へ（完了文言なし・URLで判定）
  if (p === "/steps" && req.method === "GET") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><form method="post" action="/steps" id="f">
    <div id="s1"><p>会社名<br><input name="company"></p><p>お名前<br><input name="name"></p><p>メール<br><input name="email"></p><button type="button" id="next">次へ</button></div>
    <div id="s2" style="display:none">
      <p>件名<br><select name="subject"><option value="">選択してください</option><option>採用について</option><option>製品について</option><option>その他</option></select></p>
      <p>ご希望の連絡方法（必須）<br><label><input type="radio" name="how" value="mail" required>メール</label> <label><input type="radio" name="how" value="tel">電話</label></p>
      <p>内容<br><textarea name="body"></textarea></p>
      <button type="submit">送信</button></div>
    <script>document.getElementById('next').onclick=()=>{document.getElementById('s1').style.display='none';document.getElementById('s2').style.display='block';};</script></form>`));
  if (p === "/steps" && req.method === "POST") { received.steps = await parseBody(req); res.writeHead(302, { location: "/steps/thanks" }); return res.end(); }
  if (p === "/steps/thanks") return send(page("Thanks", `<h1>Thanks</h1><p>Your message has been received.</p>`));

  // 10. トップに英語の CONTACT リンクだけ（/inquiry）、カスタムチェックボックス（inputは非表示・ラベルクリック）
  if (p === "/en") return send(`<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body><h1>EN Corp</h1><footer><a href="/inquiry">CONTACT</a></footer></body></html>`);
  if (p === "/inquiry" && req.method === "GET") return send(page("INQUIRY", `<h1>INQUIRY</h1><form method="post" action="/inquiry">
    <table><tr><th>Company</th><td><input name="company"></td></tr><tr><th>Name</th><td><input name="name"></td></tr><tr><th>E-mail</th><td><input name="email"></td></tr><tr><th>Message</th><td><textarea name="message"></textarea></td></tr></table>
    <style>.cb input{position:absolute;opacity:0;width:0;height:0}.cb label{display:inline-block;padding:4px 8px;border:1px solid #333}</style>
    <div class="cb"><input type="checkbox" id="agree" name="agree" value="yes"><label for="agree">利用規約に同意する</label></div>
    <button type="submit">Send</button></form>`));
  if (p === "/inquiry" && req.method === "POST") { received.en = await parseBody(req); return send(page("Sent", `<h1>Thank you for contacting us!</h1>`)); }

  // 11. 必須の都道府県select + 「お問い合わせ種別」チェックボックス群 + 完了はページ内テキスト差し替え（同URL）
  if (p === "/multi" && req.method === "GET") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><form method="post" action="/multi">
    <p>会社名 <input name="co" required></p><p>担当者 <input name="nm" required></p><p>メール <input name="ml" required></p>
    <p>都道府県 <select name="pref" required><option value="">--</option><option>東京都</option><option>大阪府</option></select></p>
    <p>お問い合わせ種別 <label><input type="checkbox" name="kind[]" value="a">資料請求</label><label><input type="checkbox" name="kind[]" value="b">お見積り</label><label><input type="checkbox" name="kind[]" value="c">その他</label></p>
    <p>内容 <textarea name="msg" required></textarea></p><button>送信する</button></form>`));
  if (p === "/multi" && req.method === "POST") { received.multi = await parseBody(req); return send(page("お問い合わせ", `<h1>お問い合わせ</h1><div class="done">お問い合わせを送信しました。担当者よりご連絡いたします。</div>`)); }


  // 12. 本文が input[type=text]、送信は input[type=image]、reCAPTCHA v3（invisible）、Cookieバナーが送信ボタンに被さる
  if (p === "/overlay" && req.method === "GET") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><form method="post" action="/overlay">
    <p>会社名 <input name="company"></p><p>お名前 <input name="name"></p><p>メール <input name="email"></p>
    <p>お問い合わせ内容 <input type="text" name="naiyo"></p>
    <div class="g-recaptcha" data-size="invisible" data-sitekey="x"></div>
    <input type="image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="送信する"></form>
    <div id="cookie" style="position:fixed;left:0;right:0;bottom:0;height:120px;background:#333;color:#fff;z-index:9999">Cookieを使用しています <button type="button" onclick="this.parentNode.remove()">OK</button></div>`));
  if (p === "/overlay" && req.method === "POST") { received.overlay = await parseBody(req); return send(page("完了", `<h1>送信完了しました</h1>`)); }


  // 13. 電話は半角数字のみ（maxlength=11）、本文は maxlength=120、フォームページに「ありがとうございます」が最初からある
  if (p === "/strictnum" && req.method === "GET") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><p>いつもご利用ありがとうございます。お問い合わせは下記フォームからお願いします。</p><form method="post" action="/strictnum">
    <p>会社名 <input name="company"></p><p>お名前 <input name="name"></p><p>メール <input name="email"></p>
    <p>電話番号（半角数字のみ） <input name="tel" maxlength="11" inputmode="numeric"></p>
    <p>内容 <textarea name="msg" maxlength="120"></textarea></p><button>送信</button></form>`));
  if (p === "/strictnum" && req.method === "POST") { const b = await parseBody(req); if (!/^\d+$/.test(b.tel ?? "")) return send(page("お問い合わせ", `<h1>お問い合わせ</h1><p>いつもご利用ありがとうございます。</p><p class="error">電話番号は半角数字で入力してください</p>`)); received.strictnum = b; return send(page("完了", `<h1>送信完了</h1>`)); }

  // 15. 「姓・名」ラベル1つに入力欄2つ（di-v.co.jp の実例）＋「フリガナ（セイ・メイ）」も同じ形。
  //     欄を単独判定すると2欄とも「姓」になり「松田 松田」と入る事故があった。同じ値ならエラーにする
  if (p === "/seimei" && req.method === "GET") return send(page("お問い合わせ", `<h1>お問い合わせ</h1><form method="post" action="/seimei"><table>
    <tr><th>会社名</th><td><input type="text" name="co"></td></tr>
    <tr><th>姓・名</th><td><input type="text" name="nm1"> <input type="text" name="nm2"></td></tr>
    <tr><th>フリガナ（セイ・メイ）</th><td><input type="text" name="kn1"> <input type="text" name="kn2"></td></tr>
    <tr><th>メールアドレス</th><td><input type="email" name="mail"></td></tr>
    <tr><th>お問い合わせ内容</th><td><textarea name="msg"></textarea></td></tr></table><button>送信</button></form>`));
  if (p === "/seimei" && req.method === "POST") { const b = await parseBody(req); if (!b.nm1 || !b.nm2 || b.nm1 === b.nm2 || (b.kn1 && b.kn1 === b.kn2)) return send(page("お問い合わせ", `<h1>お問い合わせ</h1><p class="error">姓と名を正しく入力してください</p>`)); received.seimei = b; return send(page("完了", `<h1>送信完了</h1><p>お問い合わせを受け付けました。</p>`)); }

  // 14. Cloudflare 風のブラウザ確認ページ
  if (p === "/challenge") return send(`<!doctype html><html><head><meta charset="utf-8"><title>Just a moment...</title></head><body><h1>Checking your browser before accessing the site.</h1><form><textarea name="x"></textarea><input name="y"><button>Continue</button></form></body></html>`);

  if (p === "/company") return send(page("会社概要", `<h1>会社概要</h1>`));
  if (p === "/recruit") return send(page("採用情報", `<h1>採用情報</h1><form method="post" action="/recruit"><input name="name"><textarea name="pr"></textarea><button>応募する</button></form>`));
  send(page("404", "<h1>Not Found</h1>"), 404);
});

await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
console.log("dummy site:", base);

const db = getDb();
const senderId = db.prepare(`INSERT INTO sender_profiles(label,company,industry,person,person_kana,email,tel,postal,address,url) VALUES(?,?,?,?,?,?,?,?,?,?)`)
  .run("test", "株式会社ブリッジハッチ", "動画制作", "松田 幸次郎", "マツダ コウジロウ", "sales@example.com", "03-1234-5678", "114-0001", "東京都北区1-2-3", "https://example.com").lastInsertRowid;
const campaignId = db.prepare(`INSERT INTO form_campaigns(name,sender_id,mode,subject_text,template_text) VALUES(?,?,?,?,?)`)
  .run("e2e", senderId, "template", "{{会社名}}様へ ショート動画のご案内", DEFAULT_TEMPLATE).lastInsertRowid as number;

const rows: import("../src/csv.js").CompanyRow[] = [
  { company_name: "シンプル商事", form_url: `${base}/simple`, site_url: base, email: "", industry: "飲食", sub_industry: "居酒屋", prefecture: "福岡県", representative: "山田太郎" },
  { company_name: "確認画面工業", form_url: `${base}/confirm`, site_url: "", email: "", industry: "製造", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "お断り物産", form_url: `${base}/refused`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "キャプチャ株式会社", form_url: `${base}/captcha`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "厳格クリニック", form_url: `${base}/strict`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "リンク探索社", form_url: "", site_url: base, email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "役所", form_url: "https://www.city.example.lg.jp/contact", site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "埋め込みフォーム社", form_url: `${base}/embed`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "SPA株式会社", form_url: `${base}/spa`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "二段階商会", form_url: `${base}/steps`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "EN Corp", form_url: "", site_url: `${base}/en`, email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "マルチ選択社", form_url: `${base}/multi`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "オーバーレイ社", form_url: `${base}/overlay`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "半角数字社", form_url: `${base}/strictnum`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "チャレンジ社", form_url: `${base}/challenge`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
  { company_name: "姓名一体社", form_url: `${base}/seimei`, site_url: "", email: "", industry: "", sub_industry: "", prefecture: "", representative: "" },
];
// 同一ドメインは1件に寄せられるため、ドメイン重複を避けるために localhost 名を変えて登録
rows[5].site_url = `http://localhost:${port}/`;
const alias = (i: number, host: string) => { rows[i].form_url = rows[i].form_url.replace("127.0.0.1", host); };
// 以前は 127.0.0.2〜14 を使っていたが、macOSでは sudo ifconfig lo0 alias が必要で再起動のたびに消えるため、
// 何も設定しなくても 127.0.0.1 に解決される <名前>.localhost 方式に変更した。
alias(1, "e2.localhost"); alias(2, "e3.localhost"); alias(3, "e4.localhost"); alias(4, "e5.localhost");
alias(7, "e7.localhost"); alias(8, "e8.localhost"); alias(9, "e9.localhost"); rows[10].site_url = rows[10].site_url.replace("127.0.0.1", "e10.localhost"); alias(11, "e11.localhost"); alias(12, "e12.localhost"); alias(13, "e13.localhost"); alias(14, "e14.localhost"); alias(15, "e15.localhost");

const summary = importRowsToCampaign(campaignId, rows);
console.log("import:", summary);
assert.equal(summary.added, 15);
assert.equal(summary.excluded, 1);

const browser = await launchBrowser();
const results: Record<string, string> = {};
try {
  const jobs = db.prepare("SELECT id, company_name FROM form_jobs WHERE campaign_id=? AND status='queued'").all(campaignId) as { id: number; company_name: string }[];
  for (const j of jobs) {
    const r = await processJob(browser, j.id);
    results[j.company_name] = r.status;
    console.log(`- ${j.company_name}: ${r.status} | ${r.result_text.split("\n")[0]}`); if (process.env.FO_DEBUG) console.log(r.result_text);
  }
} finally {
  await browser.close();
}

assert.equal(results["シンプル商事"], "sent");
assert.ok(simpleHits.length >= 2);
received.simple = simpleHits[0];
assert.equal(received.simple["your-company"], "株式会社ブリッジハッチ");
assert.equal(received.simple["your-name"], "松田 幸次郎");
assert.equal(received.simple["your-kana"], "マツダ コウジロウ");
assert.equal(received.simple["your-email"], "sales@example.com");
assert.equal(received.simple["your-tel"], "03-1234-5678");
assert.equal(received.simple["your-subject"], "シンプル商事様へ ショート動画のご案内");
assert.ok(received.simple["your-message"].includes("シンプル商事") && received.simple["your-message"].includes("山田太郎様"), "差し込み");
assert.ok(received.simple["your-message"].includes("居酒屋の事業"), "AI冒頭のフォールバック");
assert.equal(received.simple.agree, "1");
assert.equal(received.simple.q, undefined, "検索フォームは触らない");

assert.equal(results["確認画面工業"], "sent");
assert.equal(received.confirm.company, "株式会社ブリッジハッチ");
assert.equal(received.confirm.sei, "松田"); assert.equal(received.confirm.mei, "幸次郎");
assert.equal(received.confirm.sei_kana, "マツダ"); assert.equal(received.confirm.mei_kana, "コウジロウ");
assert.equal(received.confirm.email, "sales@example.com"); assert.equal(received.confirm.email_confirm, "sales@example.com");
assert.deepEqual([received.confirm.tel1, received.confirm.tel2, received.confirm.tel3], ["03", "1234", "5678"]);
assert.deepEqual([received.confirm.zip1, received.confirm.zip2], ["114", "0001"]);
assert.equal(received.confirm.pref, "東京都");
assert.equal(received.confirm.address, "東京都北区1-2-3");
assert.equal(received.confirm.kind, "other");
assert.ok(received.confirm.body.includes("確認画面工業") && received.confirm.body.includes("ご担当者様"));

assert.equal(results["お断り物産"], "skip_refused");
assert.ok(db.prepare("SELECT 1 FROM form_suppressions WHERE domain='e3.localhost'").get(), "お断りは除外リストに入る");
assert.equal(results["キャプチャ株式会社"], "skip_captcha");
assert.equal(results["厳格クリニック"], "failed");
assert.equal(results["リンク探索社"], "sent", "トップページのリンクからフォームを探索");

assert.equal(results["埋め込みフォーム社"], "sent", "iframe埋め込み");
assert.equal(received.embed.f1, "株式会社ブリッジハッチ"); assert.equal(received.embed.f2, "松田 幸次郎"); assert.equal(received.embed.f3, "sales@example.com"); assert.ok(received.embed.f4.includes("埋め込みフォーム社"));

assert.equal(results["SPA株式会社"], "sent", "SPA（formタグ無し・JS送信）");
assert.equal(received.spa.c, "株式会社ブリッジハッチ"); assert.equal(received.spa.e, "sales@example.com"); assert.equal(received.spa.t, "03-1234-5678"); assert.ok(received.spa.m.includes("SPA株式会社"));
assert.equal(received.spa.hp, "", "ハニーポットは空のまま");

assert.equal(results["二段階商会"], "sent", "2段階フォーム → /thanks URL判定");
assert.equal(received.steps.company, "株式会社ブリッジハッチ"); assert.equal(received.steps.subject, "その他"); assert.equal(received.steps.how, "mail"); assert.ok(received.steps.body.includes("二段階商会"));

assert.equal(results["EN Corp"], "sent", "英語CONTACTリンク探索 + カスタムチェックボックス");
assert.equal(received.en.company, "株式会社ブリッジハッチ"); assert.equal(received.en.agree, "yes");

assert.equal(results["マルチ選択社"], "sent", "必須select + チェック群 + 同URL完了");
assert.equal(received.multi.pref, "東京都"); assert.ok(received.multi["kind[]"], "種別チェック"); assert.ok(received.multi.msg.includes("マルチ選択社"));

assert.equal(results["オーバーレイ社"], "sent", "input本文 + image送信 + invisible reCAPTCHA + Cookieバナー");
assert.ok(received.overlay.naiyo.includes("オーバーレイ社"), "本文がinputでも入る");

assert.equal(results["半角数字社"], "sent", "半角数字のみの電話 + maxlength本文");
assert.equal(received.strictnum.tel, "0312345678");
assert.ok(received.strictnum.msg.length <= 120 && received.strictnum.msg.length > 40, "本文がmaxlengthに収まる");
assert.equal(results["チャレンジ社"], "skip_captcha", "ブラウザ確認ページはスキップ");
assert.equal(results["姓名一体社"], "sent", "「姓・名」ラベル1つに欄2つ");
assert.equal(received.seimei.nm1, "松田", "左の欄は姓"); assert.equal(received.seimei.nm2, "幸次郎", "右の欄は名");
assert.equal(received.seimei.kn1, "マツダ", "左のカナはセイ"); assert.equal(received.seimei.kn2, "コウジロウ", "右のカナはメイ");

// 事前チェック（フォーム探索・お断り・メール発見）
{
  const b2 = await launchBrowser();
  try {
    const sc = await scanCompany(b2, { formUrl: "", siteUrl: base });
    assert.ok(sc.formUrl && sc.formUrl.endsWith("/simple"), "フォーム発見");
    assert.deepEqual(sc.emails.slice(0, 2), ["info@test.co.jp", "recruit@test.co.jp"], "メール発見（代表窓口が先頭）");
    const sc2 = await scanCompany(b2, { formUrl: `${base}/refused`, siteUrl: "" });
    assert.ok(sc2.refused, "お断り検知");
    const sc3 = await scanCompany(b2, { formUrl: `${base}/captcha`, siteUrl: "" });
    assert.ok(sc3.captcha, "CAPTCHA検知");
  } finally { await b2.close(); }
}

// 90日重複チェック
const again = importRowsToCampaign(campaignId, [rows[0]]);
assert.equal(again.duplicated, 1);

server.close();
console.log("\nALL OK");
