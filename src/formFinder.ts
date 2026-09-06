// 問い合わせフォームのページを見つける。DBのフォームURL → 企業URL内のリンク → よくあるパス の順。
import type { Page } from "playwright";

const CONTACT_LINK_RE = /(お問い?合わ?せ|問合せ|ご相談|ご依頼|資料請求|contact|inquiry|inquire|toiawase|otoiawase|form)/i;
const NEGATIVE_LINK_RE = /(採用|recruit|entry|求人|faq|privacy|sitemap|login|mypage|cart)/i;
const COMMON_PATHS = ["/contact/", "/contact", "/contact.html", "/contact.php", "/inquiry/", "/inquiry", "/inquiry.html", "/otoiawase/", "/toiawase/", "/form/", "/contact-us/", "/contactus/", "/contact/index.html", "/inquiry/index.html", "/company/contact/", "/info/contact/", "/support/contact/"];

export const HAS_FORM_SCRIPT = `
(() => {
  const forms = Array.from(document.querySelectorAll('form'));
  const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const f of forms) {
    const ta = f.querySelector('textarea');
    const inputs = Array.from(f.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button])'));
    // 本文欄が2ページ目（最初は非表示）にある段階式フォームも拾う: textarea があり、見えている入力欄が1つ以上
    if (ta && inputs.some(isVisible)) return true;
    // textarea が無くても、メール欄＋3つ以上の入力欄＋送信ボタンがあれば問い合わせフォームとみなす
    const vis = inputs.filter(isVisible);
    const hasMail = vis.some((i) => /mail|メール/i.test((i.getAttribute('name') || '') + (i.getAttribute('type') || '') + (i.getAttribute('placeholder') || '') + (i.id || '')));
    const btn = f.querySelector('button, input[type=submit], input[type=image]');
    if (vis.length >= 3 && hasMail && btn && !/search|検索|login|ログイン|newsletter|メルマガ/i.test(f.outerHTML.slice(0, 2000))) return true;
  }
  // formタグ無しでもtextarea + 送信ボタンがあれば（SPA系）
  const ta = document.querySelector('textarea');
  if (ta && isVisible(ta)) {
    const btn = Array.from(document.querySelectorAll('button, input[type=submit]')).find(b => /送信|確認|submit|send|次へ/i.test((b.innerText || b.value || '')));
    if (btn) return true;
  }
  return false;
})()`;

export async function pageHasContactForm(page: Page): Promise<boolean> {
  // 本体 → 埋め込み iframe（Googleフォーム・フォーム作成サービス等）の順に見る
  for (const fr of page.frames()) {
    try {
      if (await fr.evaluate(HAS_FORM_SCRIPT)) return true;
    } catch {
      /* クロスオリジン等 */
    }
  }
  return false;
}

async function safeGoto(page: Page, url: string): Promise<boolean> {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    if (res && res.status() >= 400) return false;
    // JSで描画されるフォーム（SPA・埋め込み）を待つ
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  } catch {
    return false;
  }
}

function normalize(url: string): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `https://${url}`;
}

/** フォームのあるページへ遷移する。見つかれば最終URL、無ければ null */
export async function findContactForm(page: Page, formUrl: string, siteUrl: string): Promise<string | null> {
  const tried = new Set<string>();
  const tryUrl = async (u: string) => {
    if (!u || tried.has(u)) return false;
    tried.add(u);
    if (!(await safeGoto(page, u))) return false;
    return pageHasContactForm(page);
  };

  if (formUrl && (await tryUrl(normalize(formUrl)))) return page.url();

  const site = normalize(siteUrl || formUrl);
  if (!site) return null;
  let origin: string;
  try {
    origin = new URL(site).origin;
  } catch {
    return null;
  }

  // トップページ内のリンクから探す
  if (await safeGoto(page, site)) {
    if (await pageHasContactForm(page)) return page.url();
    const links: { href: string; text: string }[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: ((a as HTMLAnchorElement).innerText || a.getAttribute("title") || a.getAttribute("aria-label") || "").trim(),
      }))
    );
    const candidates = links
      .filter((l) => l.href.startsWith("http") && !NEGATIVE_LINK_RE.test(l.href + " " + l.text))
      .filter((l) => CONTACT_LINK_RE.test(l.text) || CONTACT_LINK_RE.test(l.href))
      .sort((a, b) => score(b) - score(a))
      .slice(0, 4);
    for (const c of candidates) {
      if (await tryUrl(c.href.split("#")[0])) return page.url();
    }
  }

  // よくあるパス
  for (const p of COMMON_PATHS) {
    if (await tryUrl(origin + p)) return page.url();
  }
  return null;

  function score(l: { href: string; text: string }) {
    let s = 0;
    if (/お問い?合わ?せ|contact/i.test(l.text)) s += 3;
    if (/contact|inquiry|toiawase/i.test(l.href)) s += 2;
    if (l.href.startsWith(origin)) s += 2;
    if (/form/i.test(l.href)) s += 1;
    return s;
  }
}
