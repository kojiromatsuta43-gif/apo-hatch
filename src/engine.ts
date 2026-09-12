// 1社分の送信を実行する（ブラウザ起動〜結果判定〜スクショ）。
import { chromium, type Browser, type BrowserContext, type Page, type Frame } from "playwright";
import path from "node:path";
import { SCREENSHOT_DIR, type SenderProfile, type JobStatus } from "./db.js";
import { detectRefusal, CAPTCHA_CHECK_SCRIPT, CHALLENGE_RE } from "./detect.js";
import { findContactForm } from "./formFinder.js";
import { collectFields, fillFields, clickNextButton, judgeOutcome, classify, hasHiddenTextarea, pageText, unknownRequiredFields, aiAnswerUnknownFields } from "./formFiller.js";
import { llm } from "./message.js";

export type SubmitInput = {
  jobId: number;
  formUrl: string;
  siteUrl: string;
  sender: SenderProfile;
  subject: string;
  message: string;
  dryRun?: boolean; // 入力だけしてスクショを撮り、送信はしない
  ignoreRefusal?: boolean; // 営業お断り文言があっても送る（キャンペーン設定）
  aiMode?: boolean; // 全文AI生成モード: 想定外の必須項目をAIに回答させる（決められなければ要確認へ）
  company?: string; // AI回答の文脈用（宛先の会社名）
};

export type SubmitResult = {
  status: JobStatus;
  detail: string;
  finalUrl: string;
  screenshot: string;
  log: string[];
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: process.env.HEADLESS !== "0",
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ userAgent: UA, locale: "ja-JP", viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  ctx.setDefaultTimeout(15000);
  return ctx;
}

export async function submitToCompany(browser: Browser, input: SubmitInput): Promise<SubmitResult> {
  const log: string[] = [];
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const shot = path.join(SCREENSHOT_DIR, `job-${input.jobId}.png`);
  const done = async (status: JobStatus, detail: string): Promise<SubmitResult> => {
    let screenshot = "";
    try {
      await page.screenshot({ path: shot, fullPage: false });
      screenshot = shot;
    } catch {}
    const finalUrl = page.url();
    await ctx.close().catch(() => {});
    return { status, detail, finalUrl, screenshot, log };
  };

  try {
    const formPage = await findContactForm(page, input.formUrl, input.siteUrl);
    if (!formPage) return done("skip_no_form", "問い合わせフォームが見つからない");
    log.push(`form: ${formPage}`);

    const textBefore = await pageText(page);
    if (CHALLENGE_RE.test(textBefore.slice(0, 3000))) return done("skip_captcha", "ブラウザ確認ページ（自動アクセス遮断）");
    const refusal = detectRefusal(textBefore);
    if (refusal && !input.ignoreRefusal) return done("skip_refused", `営業お断り文言: 「${refusal}」`);

    const captcha = await page.evaluate(CAPTCHA_CHECK_SCRIPT).catch(() => null);
    if (captcha) return done("skip_captcha", `CAPTCHAあり (${captcha})`);

    // フォーム本体があるフレームを選ぶ（埋め込みフォーム対応）
    let target: Page | Frame = page;
    let fields = await collectFields(page);
    if (!fields.some((f) => classify(f) === "message")) {
      for (const fr of page.frames()) {
        if (fr === page.mainFrame()) continue;
        try {
          const ff = await collectFields(fr);
          if (ff.some((f) => classify(f) === "message")) { target = fr; fields = ff; log.push(`iframe: ${fr.url()}`); break; }
        } catch {}
      }
    }
    // 段階式フォーム: 本文欄が2ページ目にある → 1ページ目を埋めて「次へ」を押してから本題へ（最大2段）
    for (let step = 0; step < 2 && !fields.some((f) => classify(f) === "message"); step++) {
      if (!(await hasHiddenTextarea(target))) break;
      const pre = await fillFields(target, fields, { sender: input.sender, subject: input.subject, message: input.message }, { requireMessage: false });
      log.push(`step${step + 1} filled: ${pre.filled.join(",")}`);
      const k = await clickNextButton(target, page, log);
      if (k === "none") break;
      fields = await collectFields(target);
    }
    if (!fields.some((f) => classify(f) === "message")) return done("skip_no_form", "本文（textarea）欄が無い");

    const report = await fillFields(target, fields, { sender: input.sender, subject: input.subject, message: input.message });
    log.push(`filled: ${report.filled.join(",")}`);
    if (report.unfilled.length) log.push(`unfilled: ${report.unfilled.join(",")}`);
    log.push(...report.log);
    if (!report.hasMessage) return done("failed", "本文欄への入力に失敗");

    // 全文AI生成モード: 種類を判定できなかった必須項目（想定外の質問）をAIに読ませて回答する。
    // AIが決められない項目が残る場合は、無理に送らず「要確認」として手動送信リストに回す。
    if (input.aiMode) {
      const unknowns = unknownRequiredFields(fields);
      if (unknowns.length) {
        const r = await aiAnswerUnknownFields(target, unknowns, { company: input.company || "", sender: input.sender, message: input.message }, llm);
        if (r.answered.length) log.push(`AIが回答した項目: ${r.answered.join(" / ")}`);
        log.push(...r.log);
        if (r.unsure.length) {
          return done("failed", `要確認: 想定外の項目にAIが回答を決められないため送信していません（${r.unsure.join(" / ")}）\n手動送信リストからご対応ください`);
        }
      }
    }

    if (input.dryRun) return done("queued", "テスト入力のみ（送信していない）");

    const fieldCountBefore = fields.length;
    let refilled = false; // 入力エラー後の埋め直しは1回だけ
    for (let round = 0; round < 3; round++) {
      const kind = await clickNextButton(target, page, log);
      if (kind === "none") return done("failed", "送信ボタンが見つからない");
      // 確認画面で CAPTCHA が出る場合
      const cap2 = await page.evaluate(CAPTCHA_CHECK_SCRIPT).catch(() => null);
      if (cap2) return done("skip_captcha", `確認画面にCAPTCHA (${cap2})`);
      const outcome = await judgeOutcome(page, fieldCountBefore, kind === "submit", textBefore);
      log.push(`judge[${round}]: ${outcome.status} ${outcome.detail}`);
      if (outcome.status === "sent") return done("sent", outcome.detail);
      if (outcome.status === "failed") {
        // バリデーションエラーなら、カナのスペース除去などの修正ルールを通して集め直し、埋め直して1回だけ再送する
        if (!refilled && round < 2 && /入力エラー/.test(outcome.detail)) {
          refilled = true;
          const again = await collectFields(target);
          // どの必須項目が空のまま弾かれたか（次のエラー表示に併記する）
          const emptyRequired = again.filter((f) => f.required && classify(f) !== "ignore" && !f.checked);
          if (again.length) {
            const r3 = await fillFields(target, again, { sender: input.sender, subject: input.subject, message: input.message }, { normalize: true });
            log.push(`エラー後の自動修正・埋め直し: ${r3.filled.join(",") || "なし"}`);
            if (r3.filled.length) continue;
          }
          if (emptyRequired.length) {
            const names = emptyRequired.map((f) => (f.sig.split(" || ")[0] || f.name || "項目").slice(0, 16)).slice(0, 4);
            return done("failed", `${outcome.detail}\n未入力の必須項目の可能性: ${names.join(" / ")}（この欄が必須で、値を用意できず送信できませんでした）`);
          }
        }
        return done("failed", `${outcome.detail}\n※ 入力しないと出るエラーは、その項目が必須になっていることが多いです。`);
      }
      // 確認画面なら次のラウンドで送信ボタンを押す。確認画面の項目は再収集
      if (kind === "confirm") {
        // 確認画面に未入力の必須項目（同意チェック等）が残っていれば埋める
        const more = await collectFields(target);
        if (more.length) {
          const r2 = await fillFields(target, more, { sender: input.sender, subject: input.subject, message: input.message });
          if (r2.filled.length) log.push(`confirm-page filled: ${r2.filled.join(",")}`);
        }
        continue;
      }
      // submit を押したのに判定不能 → もう一度だけ待って判定
      await page.waitForTimeout(3000);
      const again = await judgeOutcome(page, fieldCountBefore, true, textBefore);
      if (again.status === "sent") return done("sent", again.detail);
      return done("failed", `送信後の判定不能: ${again.detail}`);
    }
    return done("failed", "確認画面を抜けられない");
  } catch (e) {
    log.push(`exception: ${String(e).slice(0, 200)}`);
    return done("failed", `例外: ${String((e as Error).message ?? e).slice(0, 120)}`);
  }
}

/** 企業HPのテキストを取得（AI個別化用）。失敗時は空文字 */
export async function fetchSiteText(browser: Browser, siteUrl: string): Promise<{ title: string; text: string }> {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  try {
    const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(500);
    const title = await page.title();
    const text: string = await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll("script, style, nav, footer, header, noscript"))) el.remove();
      return (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
    });
    return { title, text: text.slice(0, 3000) };
  } catch {
    return { title: "", text: "" };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export type ScanResult = {
  formUrl: string | null;
  refused: string | null;
  captcha: string | null;
  emails: string[];
  note: string;
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BAD_EMAIL_RE = /(noreply|no-reply|example\.|sentry|wixpress|@[0-9.]+$|\.png$|\.jpg$|\.gif$|\.svg$|\.webp$)/i;

async function collectEmails(page: Page): Promise<string[]> {
  const found: string[] = await page.evaluate(() => {
    const out: string[] = [];
    for (const a of Array.from(document.querySelectorAll("a[href^='mailto:']"))) out.push((a.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0]);
    out.push(document.body?.innerText ?? "");
    return out;
  }).catch(() => []);
  const set = new Set<string>();
  for (const t of found) for (const m of t.match(EMAIL_RE) ?? []) {
    const e = m.toLowerCase();
    if (!BAD_EMAIL_RE.test(e)) set.add(e);
  }
  // 代表窓口っぽいものを先頭に
  const score = (e: string) => (/^(info|contact|inquiry|sales|eigyo|support|office|mail|toiawase|otoiawase)@/.test(e) ? 0 : /^(recruit|saiyo|jinji|hr)@/.test(e) ? 2 : 1);
  return Array.from(set).sort((a, b) => score(a) - score(b)).slice(0, 5);
}

/** 送信せずに、フォームの有無・お断り・CAPTCHA・メールアドレスを調べる（事前チェック） */
export async function scanCompany(browser: Browser, input: { formUrl: string; siteUrl: string }): Promise<ScanResult> {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const r: ScanResult = { formUrl: null, refused: null, captcha: null, emails: [], note: "" };
  try {
    // トップページからメールを拾う
    const site = input.siteUrl || input.formUrl;
    if (site) {
      try {
        await page.goto(site.startsWith("http") ? site : `https://${site}`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(400);
        r.emails = await collectEmails(page);
      } catch {
        r.note = "サイトにアクセスできない";
      }
    }
    const formPage = await findContactForm(page, input.formUrl, input.siteUrl);
    if (formPage) {
      r.formUrl = formPage;
      const text: string = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      r.refused = detectRefusal(text);
      r.captcha = (await page.evaluate(CAPTCHA_CHECK_SCRIPT).catch(() => null)) as string | null;
      for (const e of await collectEmails(page)) if (!r.emails.includes(e)) r.emails.push(e);
    } else if (!r.note) r.note = "フォームが見つからない";
  } catch (e) {
    r.note = `例外: ${String((e as Error).message ?? e).slice(0, 100)}`;
  } finally {
    await ctx.close().catch(() => {});
  }
  return r;
}
