// フォームの項目を見つけて入力し、確認画面を経て送信し、結果を判定する。
import type { Page, Frame } from "playwright";
import type { SenderProfile } from "./db.js";

export type FieldInfo = {
  idx: number;
  tag: "input" | "textarea" | "select";
  type: string;
  name: string;
  id: string;
  sig: string; // ラベル・placeholder・name・id・周辺テキストを連結した判定用文字列
  required: boolean;
  options: { value: string; text: string }[];
  checked: boolean;
  formIndex: number;
  maxlength: number;
  placeholder: string;
  inputmode: string;
  pattern: string;
};

export type Category =
  | "message" | "company" | "department" | "name" | "name_last" | "name_first"
  | "kana" | "kana_last" | "kana_first" | "email" | "email_confirm" | "tel"
  | "postal" | "address" | "prefecture" | "url" | "subject" | "agree" | "type" | "position" | "ignore";

// 順番に意味がある（先に当たったものが勝つ）
const RULES: [Category, RegExp][] = [
  ["ignore", /(fax|ファックス|ファクス|password|パスワード|search|検索|captcha|認証コード|画像の文字|クーポン|coupon)/i],
  ["email_confirm", /((メール|mail).{0,12}(確認|再入力|confirm)|(確認|confirm|re-?enter).{0,12}(メール|mail))/i],
  ["email", /(メール|e-?mail|mail)/i],
  ["kana_last", /((フリガナ|ふりがな|カナ|kana|セイ)(.{0,6})?(姓|せい|セイ|苗字|last|sei\b)|(姓|せい|苗字).{0,6}(フリガナ|ふりがな|カナ|kana)|kana_sei|sei_kana|kana_last|last_kana|lastkana)/i],
  ["kana_first", /((フリガナ|ふりがな|カナ|kana|メイ)(.{0,6})?(名|めい|メイ|first|mei\b)|(名|めい).{0,6}(フリガナ|ふりがな|カナ|kana)|kana_mei|mei_kana|kana_first|first_kana|firstkana)/i],
  ["kana", /(フリガナ|ふりがな|カナ|kana|furigana|よみ|ヨミ|ruby|phonetic)/i],
  ["name_last", /(姓|苗字|名字|lastname|last_name|last-name|family|\bsei\b|surname)/i],
  ["name_first", /(^|[^氏会社品件題法人職媒])名(?![前称刺簿])|firstname|first_name|first-name|given|\bmei\b/i],
  ["company", /(会社|企業|法人|社名|貴社|御社|団体|組織|屋号|店舗名|店名|company|corp|organization|organisation|firm)/i],
  ["department", /(部署|部門|department|division)/i],
  ["position", /(役職|職位|position|title.*役)/i],
  ["name", /(氏名|お名前|名前|担当者|ご担当|your-name|\bname\b|fullname|full_name|full-name)/i],
  ["tel", /(電話|tel|phone|携帯|mobile|連絡先番号)/i],
  ["postal", /(郵便|〒|zip|postal|postcode)/i],
  ["prefecture", /(都道府県|prefecture|pref\b)/i],
  ["address", /(住所|所在地|address|addr|市区町村|番地|建物)/i],
  ["url", /(url|ホームページ|hp|サイト|website|web\s*site|ウェブ)/i],
  ["subject", /(件名|題名|タイトル|subject|your-subject|\btitle\b)/i],
  ["agree", /(同意|承諾|了承|agree|accept|consent|privacy|プライバシー|個人情報|規約|policy|確認しました)/i],
  ["type", /(種別|種類|区分|カテゴリ|category|type|項目|目的|about|ご用件|用件|内容を選択|お問い?合わ?せ内容$)/i],
  ["message", /(内容|本文|メッセージ|message|comment|コメント|備考|詳細|ご要望|ご相談|ご質問|お問い?合わ?せ|問合せ|inquiry|body|detail|remarks|note)/i],
];

export function classify(f: FieldInfo): Category {
  if (f.tag === "textarea") {
    // textarea は原則メッセージ。住所欄などの例外だけ弾く
    if (/(住所|address)/i.test(f.sig) && !/(内容|message|本文)/i.test(f.sig)) return "address";
    return "message";
  }
  if (f.type === "email") return /(確認|confirm|re-?enter)/i.test(f.sig) ? "email_confirm" : "email";
  if (f.type === "tel") return "tel";
  if (f.type === "url") return "url";
  if (["file", "hidden", "submit", "button", "reset", "image", "password", "search", "color", "range"].includes(f.type)) return "ignore";
  const [own, ctx = ""] = f.sig.split(" || ");
  if (f.type === "radio" || f.type === "checkbox") {
    // 選択肢のラベル（「メール」「電話」など）は項目名ではないので、同意だけ自分のラベルで判定し、あとは設問側の見出しで判定
    if (RULES.find(([c]) => c === "agree")![1].test(own)) return "agree";
    for (const [cat, re] of RULES) if (cat !== "ignore" && cat !== "message" && re.test(ctx)) return cat === "email" || cat === "tel" || cat === "name" ? "type" : cat;
    return "type";
  }
  // まず要素自身の手がかり（name/id/placeholder/ラベル/直前テキスト）だけで判定し、決まらなければ周辺テキストも含めて判定
  const fix = (cat: Category): Category => (cat === "type" && f.tag === "input" && /(内容|本文|message|ご相談|ご質問|ご要望)/i.test(f.sig) ? "message" : cat);
  for (const [cat, re] of RULES) if (re.test(own)) return fix(cat);
  for (const [cat, re] of RULES) if (re.test(f.sig)) return fix(cat);
  if (f.tag === "select") return "type";
  return "ignore";
}

// ページ内の入力項目を収集し、各要素に data-fo-idx を振る
const COLLECT_SCRIPT = `
(() => {
  const isVisible = (el) => {
    const st = getComputedStyle(el);
    if (el.type === 'radio' || el.type === 'checkbox') {
      // カスタムデザインで本体が隠れている（opacity:0 / 画面外）ことが多いので、ラベルの可視性で判断
      const lab = el.closest('label') || (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
      if (lab) { const lr = lab.getBoundingClientRect(); const ls = getComputedStyle(lab); return lr.width > 0 && lr.height > 0 && ls.display !== 'none' && ls.visibility !== 'hidden'; }
    }
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const r = el.getBoundingClientRect();
    // 画面外に飛ばしてあるハニーポット（left:-9999px 等）は触らない
    if (r.right <= 0 || r.bottom <= 0) return false;
    // 親が画面外・高さゼロで隠しているケース
    let p = el.parentElement; let hops = 0;
    while (p && hops < 4) { const pr = p.getBoundingClientRect(); const ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden' || (pr.width === 0 && pr.height === 0 && ps.overflow === 'hidden') || pr.right <= 0) return false; p = p.parentElement; hops++; }
    if (el.type === 'radio' || el.type === 'checkbox') return r.width > 0 || r.height > 0;
    return r.width > 0 && r.height > 0;
  };
  // 要素自身に近い手がかり（ラベル・直前のテキスト）。周辺テキストより優先して判定に使う
  const ownText = (el) => {
    const parts = [];
    if (el.id) document.querySelectorAll('label[for="' + CSS.escape(el.id) + '"]').forEach(l => parts.push(l.innerText));
    const wrap = el.closest('label'); if (wrap) parts.push(wrap.innerText);
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    if (el.getAttribute('aria-labelledby')) { const l = document.getElementById(el.getAttribute('aria-labelledby')); if (l) parts.push(l.innerText); }
    let prev = el.previousSibling; let hops = 0;
    while (prev && hops < 3) { const t = (prev.textContent || '').trim(); if (t) { if (t.length <= 12) parts.push(t); break; } prev = prev.previousSibling; hops++; }
    return parts.join(' ');
  };
  // 周辺の見出し。確度の高い順に見て、最初に見つかったものだけ使う（複数を混ぜると別の欄の言葉を拾う）
  const labelText = (el) => {
    // テーブル型フォーム: 同じ行の th / 先頭 td
    const tr = el.closest('tr'); if (tr) { const th = tr.querySelector('th, td'); if (th && !th.contains(el)) { const t = (th.innerText || '').trim(); if (t) return t; } }
    // dl 型: 直前の dt
    const dd = el.closest('dd'); if (dd) { let p = dd.previousElementSibling; while (p && p.tagName !== 'DT') p = p.previousElementSibling; if (p) { const t = (p.innerText || '').trim(); if (t) return t; } }
    // 直前の兄弟ブロック（<p>会社名</p><input> や <div class=label>）
    let sib = el.previousElementSibling; let hops = 0;
    while (sib && hops < 2) { const t = (sib.innerText || '').trim(); if (t && t.length <= 40 && !sib.querySelector('input,textarea,select')) return t; sib = sib.previousElementSibling; hops++; }
    // 汎用: 親ブロック内のテキスト（短いもの）
    let box = el.parentElement; hops = 0;
    while (box && hops < 3) {
      const t = (box.innerText || '').trim();
      if (t && t.length < 60 && box.querySelectorAll('input,textarea,select').length <= 2) return t;
      box = box.parentElement; hops++;
    }
    return '';
  };
  // 前回の採番を消す（段階式フォームで古い要素と番号が重なるのを防ぐ）
  document.querySelectorAll('[data-fo-idx]').forEach((e) => e.removeAttribute('data-fo-idx'));
  const forms = Array.from(document.querySelectorAll('form'));
  const els = Array.from(document.querySelectorAll('input, textarea, select'));
  const out = [];
  let i = 0;
  for (const el of els) {
    const type = (el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : 'text')).toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') continue;
    if (!isVisible(el)) continue;
    const nm = ((el.getAttribute('name') || '') + ' ' + (el.id || '') + ' ' + (el.className || '')).toLowerCase();
    if (/honeypot|honey_pot|hp_field|_hp\b|bot-?field|botcheck|nospam|do-?not-?fill|leave-?blank|website2|url2/.test(nm)) continue;
    el.setAttribute('data-fo-idx', String(i));
    const own = [ownText(el), el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.getAttribute('autocomplete'), el.getAttribute('title')].filter(Boolean).join(' | ').replace(/\\s+/g, ' ').slice(0, 200);
    const sig = own + ' || ' + labelText(el).replace(/\\s+/g, ' ').slice(0, 200);
    const required = el.required || el.getAttribute('aria-required') === 'true' || /必須|required|\\*/.test(labelText(el).slice(0, 60)) || /required|必須/i.test(el.className);
    const options = el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({ value: o.value, text: (o.textContent || '').trim() })) : [];
    out.push({ idx: i, tag: el.tagName.toLowerCase(), type, name: el.getAttribute('name') || '', id: el.id || '', sig, required, options, checked: !!el.checked, formIndex: forms.indexOf(el.closest('form')), maxlength: Number(el.getAttribute('maxlength') || 0), placeholder: el.getAttribute('placeholder') || '', inputmode: el.getAttribute('inputmode') || '', pattern: el.getAttribute('pattern') || '' });
    i++;
  }
  return out;
})()`;

/** 見えていない textarea（段階式フォームの2ページ目など）があるか */
export async function hasHiddenTextarea(target: Page | Frame): Promise<boolean> {
  return target.evaluate(() => Array.from(document.querySelectorAll("form textarea")).some((t) => { const r = t.getBoundingClientRect(); return r.width === 0 || r.height === 0; })).catch(() => false);
}

export async function collectFields(target: Page | Frame): Promise<FieldInfo[]> {
  return (await target.evaluate(COLLECT_SCRIPT)) as FieldInfo[];
}

export type FillValues = {
  sender: SenderProfile;
  subject: string;
  message: string;
};

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/[\s　]+/);
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(" ")];
  const n = full.trim();
  if (n.length >= 3) return [n.slice(0, Math.min(2, n.length - 1)), n.slice(Math.min(2, n.length - 1))];
  return [n, n];
}
function splitTel(tel: string): string[] {
  const digits = tel.replace(/[^\d]/g, "");
  if (tel.includes("-")) return tel.split("-");
  if (digits.length === 11) return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  if (digits.length === 10) return digits.startsWith("03") || digits.startsWith("06") ? [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6)] : [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  return [digits];
}
function splitPostal(p: string): string[] {
  const d = p.replace(/[^\d]/g, "");
  return d.length === 7 ? [d.slice(0, 3), d.slice(3)] : [d];
}
const PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
function prefectureOf(address: string): string {
  return PREFS.find((p) => address.startsWith(p) || address.startsWith(p.replace(/[都府県]$/, ""))) ?? "";
}

export type FillReport = { filled: string[]; unfilled: string[]; hasMessage: boolean; log: string[] };

/** 電話・郵便番号を「ハイフン無しの数字だけ」で入れるべき欄か（maxlength / pattern / inputmode / placeholder / ラベルから判断） */
function wantsDigitsOnly(f: FieldInfo, hyphenLen: number): boolean {
  if (f.placeholder.includes("-") || f.placeholder.includes("－")) return false;
  if (f.maxlength > 0 && f.maxlength < hyphenLen) return true;
  if (f.inputmode === "numeric" || f.inputmode === "tel" && f.maxlength > 0 && f.maxlength < hyphenLen) return true;
  if (f.pattern && /^\^?\[?0-9\]?[\d\\{},+*]*\$?$/.test(f.pattern) && !f.pattern.includes("-")) return true;
  if (/(半角数字のみ|ハイフンなし|ハイフン無し|ハイフン不要|数字のみ)/.test(f.sig)) return true;
  return false;
}

/** textarea の maxlength に収まるように、段落の切れ目で短くする */
function fitMessage(message: string, max: number): string {
  if (!max || message.length <= max) return message;
  const cut = message.slice(0, max);
  const at = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf("。"));
  return (at > max * 0.5 ? cut.slice(0, at + 1) : cut).trim();
}

/** 収集した項目に値を入れる。戻り値は入力レポート */
export async function fillFields(target: Page | Frame, fields: FieldInfo[], v: FillValues, opts: { requireMessage?: boolean } = {}): Promise<FillReport> {
  const s = v.sender;
  const [lastName, firstName] = splitName(s.person);
  const [lastKana, firstKana] = splitName(s.person_kana || "");
  const email = s.email;
  const tels = splitTel(s.tel);
  const postals = splitPostal(s.postal);
  const report: FillReport = { filled: [], unfilled: [], hasMessage: false, log: [] };

  // メッセージ欄を含むフォームだけを対象にする（検索フォームやニュースレター欄を誤って埋めない）
  const msgField = fields.find((f) => classify(f) === "message" && f.tag === "textarea") ?? fields.find((f) => classify(f) === "message");
  if (!msgField && opts.requireMessage !== false) return report;
  // 段階式フォームの1ページ目（本文欄はまだ出ていない）は、見えている欄を全部対象にする
  const scoped = msgField ? fields.filter((f) => f.formIndex === msgField.formIndex) : fields;

  const counters: Record<string, number> = {};
  const loc = (f: FieldInfo) => target.locator(`[data-fo-idx="${f.idx}"]`);
  const setText = async (f: FieldInfo, value: string) => {
    if (!value) return false;
    try {
      await loc(f).fill(value, { timeout: 4000 });
      return true;
    } catch (e) {
      report.log.push(`fill失敗 idx=${f.idx}: ${String(e).slice(0, 80)}`);
      return false;
    }
  };

  // ラジオ・チェックボックスは name ごとにまとめて扱う
  const radioGroups = new Map<string, FieldInfo[]>();
  for (const f of scoped) {
    if (f.type === "radio") {
      const k = f.name || `r${f.idx}`;
      radioGroups.set(k, [...(radioGroups.get(k) ?? []), f]);
    }
  }
  const handledRadio = new Set<string>();

  for (const f of scoped) {
    const cat = classify(f);
    if (cat === "ignore") continue;
    const nth = (counters[cat] = (counters[cat] ?? 0) + 1);
    let ok = false;

    if (f.type === "radio") {
      const key = f.name || `r${f.idx}`;
      if (handledRadio.has(key)) continue;
      handledRadio.add(key);
      const group = radioGroups.get(key) ?? [f];
      const pick = pickOption(group.map((g) => ({ f: g, text: g.sig.split(" || ")[0] })), cat);
      if (pick) ok = await ensureChecked(target, pick.f);
    } else if (f.type === "checkbox") {
      const shouldCheck = cat === "agree" || f.required || (cat === "type" && nth === 1);
      if (shouldCheck && !f.checked) ok = await ensureChecked(target, f);
      else ok = f.checked;
    } else if (f.tag === "select") {
      let value: string | undefined;
      if (cat === "prefecture") {
        const pref = prefectureOf(s.address);
        value = f.options.find((o) => o.text === pref || o.value === pref)?.value;
      } else {
        const pick = pickOption(f.options.map((o) => ({ f: o, text: o.text + " " + o.value })), cat);
        value = pick?.f.value;
      }
      if (value !== undefined) {
        try { await loc(f).selectOption(value, { timeout: 3000 }); ok = true; } catch { report.log.push(`select失敗 idx=${f.idx}`); }
      }
    } else {
      switch (cat) {
        case "message": {
          const msg = fitMessage(v.message, f.maxlength);
          if (msg.length < v.message.length) report.log.push(`本文を${f.maxlength}文字に短縮`);
          ok = await setText(f, msg); if (ok) report.hasMessage = true; break;
        }
        case "subject": ok = await setText(f, v.subject); break;
        case "company": ok = await setText(f, s.company); break;
        case "department": ok = await setText(f, "営業部"); break;
        case "position": ok = await setText(f, "担当"); break;
        case "name": ok = await setText(f, s.person); break;
        case "name_last": ok = await setText(f, lastName); break;
        case "name_first": ok = await setText(f, firstName); break;
        case "kana": ok = await setText(f, s.person_kana || s.person); break;
        case "kana_last": ok = await setText(f, lastKana || lastName); break;
        case "kana_first": ok = await setText(f, firstKana || firstName); break;
        case "email": case "email_confirm": ok = await setText(f, email); break;
        case "tel": {
          const split = tels.length > 1 && countOf(scoped, "tel") >= 3;
          const val = split ? tels[nth - 1] ?? "" : wantsDigitsOnly(f, s.tel.length) ? s.tel.replace(/[^\d]/g, "") : s.tel;
          ok = await setText(f, val); break;
        }
        case "postal": {
          const split = countOf(scoped, "postal") >= 2;
          const val = split ? postals[nth - 1] ?? "" : wantsDigitsOnly(f, s.postal.length) ? s.postal.replace(/[^\d]/g, "") : s.postal;
          ok = await setText(f, val); break;
        }
        case "prefecture": ok = await setText(f, prefectureOf(s.address)); break;
        case "address": ok = await setText(f, nth === 1 ? s.address : ""); break;
        case "url": ok = await setText(f, s.url); break;
        case "type": case "agree": break;
      }
    }
    (ok ? report.filled : report.unfilled).push(`${cat}#${f.idx}${f.required ? "*" : ""}`);
  }
  return report;

  function countOf(list: FieldInfo[], cat: Category) {
    return list.filter((x) => x.tag === "input" && classify(x) === cat).length;
  }
}

/** チェックボックス／ラジオを確実にONにする（カスタムデザインで本体が隠れている場合はラベルクリック→JS） */
async function ensureChecked(target: Page | Frame, f: FieldInfo): Promise<boolean> {
  const el = target.locator(`[data-fo-idx="${f.idx}"]`).first();
  const isOn = () => el.evaluate((e) => (e as HTMLInputElement).checked).catch(() => false);
  try { await el.check({ timeout: 2500, force: true }); } catch {}
  if (await isOn()) return true;
  if (f.id) { try { await target.locator(`label[for="${f.id}"]`).first().click({ timeout: 2000, force: true }); } catch {} }
  if (await isOn()) return true;
  try { await el.evaluate((e) => { const i = e as HTMLInputElement; const lab = i.closest("label"); if (lab) lab.click(); if (!i.checked) { i.checked = true; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); } }); } catch {}
  return isOn();
}

/** ラジオ／セレクトの選択肢から「営業の問い合わせ」に一番近いものを選ぶ */
function pickOption<T>(opts: { f: T; text: string }[], cat: Category): { f: T; text: string } | undefined {
  const valid = opts.filter((o) => o.text.trim() && !/(選択してください|選んでください|please select|^-+$|^選択$|^未選択$)/i.test(o.text.trim()));
  if (!valid.length) return undefined;
  if (cat === "agree") return valid.find((o) => /(同意する|同意します|agree|はい|yes)/i.test(o.text)) ?? valid[0];
  if (cat === "prefecture") return valid[0];
  const prefer = [/その他/, /(サービス|商品|製品).{0,6}(について|に関する|案内)/, /(ご提案|提案|協業|パートナー|取引|business)/i, /(お問い?合わ?せ|general|other)/i];
  for (const re of prefer) {
    const hit = valid.find((o) => re.test(o.text));
    if (hit) return hit;
  }
  // 明らかに違うもの（採用・資料請求・クレーム等）は避ける
  const neutral = valid.filter((o) => !/(採用|求人|エントリー|resume|苦情|クレーム|返品|修理|不具合|解約|退会)/.test(o.text));
  return neutral[0] ?? valid[0];
}

// ---- ボタン ----
const SUBMIT_RE = /(送信|送る|申し?込|送付|submit|send|完了する|確定|この内容で)/i;
const CONFIRM_RE = /(確認|次へ|進む|confirm|next|preview|入力内容)/i;
const BACK_RE = /(戻る|修正|back|edit|訂正|キャンセル|cancel|リセット|reset|clear|クリア)/i;

const BUTTONS_SCRIPT = `
(() => {
  document.querySelectorAll('[data-fo-btn]').forEach((e) => e.removeAttribute('data-fo-btn'));
  const els = Array.from(new Set(Array.from(document.querySelectorAll('button, input[type=submit], input[type=button], input[type=image], a[role=button], [role=button], [onclick], [class*="submit"], [id*="submit"], [class*="btn"]'))));
  const out = [];
  let i = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || st.display === 'none' || st.visibility === 'hidden') continue;
    // div等をボタン扱いするのは、テキストが短い（=ボタンらしい）ものだけ。大きなコンテナを誤クリックしない
    if (!/^(BUTTON|INPUT|A)$/.test(el.tagName) && ((el.innerText || '').trim().length > 40 || el.querySelector('input,textarea,select'))) continue;
    const text = (el.innerText || el.value || el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title') || el.className || '').trim().replace(/\\s+/g,' ').slice(0, 60);
    el.setAttribute('data-fo-btn', String(i));
    out.push({ idx: i, text, type: (el.getAttribute('type') || el.tagName).toLowerCase(), inForm: !!el.closest('form'), disabled: !!el.disabled });
    i++;
  }
  return out;
})()`;

type Btn = { idx: number; text: string; type: string; inForm: boolean; disabled: boolean };

export async function clickNextButton(target: Page | Frame, page: Page, log: string[]): Promise<"confirm" | "submit" | "none"> {
  const btns = (await target.evaluate(BUTTONS_SCRIPT)) as Btn[];
  const usable = btns.filter((b) => !BACK_RE.test(b.text) && !b.disabled);
  const confirm = usable.find((b) => CONFIRM_RE.test(b.text) && !SUBMIT_RE.test(b.text));
  const submit = usable.find((b) => SUBMIT_RE.test(b.text)) ?? usable.find((b) => b.type === "submit" && b.inForm);
  const target_ = confirm ?? submit;
  if (!target_) {
    // ボタンが見つからないとき: 入力済みフォームを JS で直接 submit する（SPA やアイコンだけのボタンへの最後の手段）
    const ok = await target.evaluate(() => {
      const f = document.querySelector("[data-fo-idx]")?.closest("form");
      if (!f) return false;
      if (f.requestSubmit) f.requestSubmit(); else f.submit();
      return true;
    }).catch(() => false);
    if (ok) {
      log.push("送信ボタン不検出 → form.requestSubmit() で送信");
      await page.waitForTimeout(2500);
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      return "submit";
    }
    return "none";
  }
  const kind = confirm ? "confirm" : "submit";
  log.push(`click[${kind}] "${target_.text}"`);
  const before = page.url();
  try {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}),
      target.locator(`[data-fo-btn="${target_.idx}"]`).first().click({ timeout: 5000 }),
    ]);
  } catch (e) {
    log.push(`click失敗: ${String(e).slice(0, 100)}`);
    // JS で submit を試す
    try { await target.locator(`[data-fo-btn="${target_.idx}"]`).first().evaluate((el: Element) => { const b = el as HTMLButtonElement; if (b.form) { if (b.form.requestSubmit) b.form.requestSubmit(); else b.form.submit(); } else b.click(); }); } catch {}
  }
  await page.waitForTimeout(2500);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  if (page.url() !== before) log.push(`url→ ${page.url()}`);
  return kind;
}

// ---- 結果判定 ----
const SUCCESS_RE = /(送信(が|は)?(完了|されました|いたしました|しました|致しました)|送信ありがとう|お問い?合わ?せ(を)?(ありがとう|受け付け|承り|受付)|ありがとうございま(す|した)。?(お問い?合わ?せ|送信|受付)|受け付けました|受付(が)?完了|承りました|thank you for (contacting|your (message|inquiry|submission))|(message|inquiry|form)( has been| was)? (sent|submitted|received)|submitted successfully|successfully sent)/i;
const SUCCESS_URL_RE = /(thanks|thank-?you|complete|completed|done|sent|success|finish|kanryo|kanryou|touroku_kanryo)/i;
const ERROR_RE = /(入力してください|必須項目|未入力|正しく入力|形式が|不正|エラーが|error(s)? (occurred|found)|is required|invalid|入力内容に誤り|確認してください)/i;

export type Outcome = { status: "sent" | "failed" | "unsure"; detail: string };

export async function pageText(page: Page): Promise<string> {
  const texts: string[] = [];
  for (const fr of page.frames()) {
    try { texts.push(await fr.evaluate(() => document.body?.innerText ?? "")); } catch { /* cross-origin */ }
  }
  return texts.join("\n");
}

export async function judgeOutcome(page: Page, hadFieldsBefore: number, afterSubmit = true, beforeText = ""): Promise<Outcome> {
  // 本体＋埋め込みフレームの文章をまとめて見る（完了文言が iframe の中に出ることがある）
  const texts: string[] = [];
  for (const fr of page.frames()) {
    try {
      texts.push(await fr.evaluate(() => document.body?.innerText ?? ""));
    } catch {
      /* cross-origin */
    }
  }
  const text = texts.join("\n");
  const compact = text.replace(/\s+/g, "");
  const url = page.url();
  // 送信前から同じ完了っぽい文言があるページ（「お問い合わせありがとうございます。下記フォームから…」）は、文言だけでは完了とみなさない
  const beforeCompact = beforeText.replace(/\s+/g, "");
  const hadBefore = beforeCompact && (SUCCESS_RE.test(beforeCompact) || SUCCESS_RE.test(beforeText));
  if ((SUCCESS_RE.test(compact) || SUCCESS_RE.test(text)) && !hadBefore) return { status: "sent", detail: "完了文言を検知" };
  if (SUCCESS_URL_RE.test(new URL(url).pathname)) return { status: "sent", detail: `完了URLへ遷移 (${url})` };
  // エラー表示の抽出（表示中のものだけ）
  const visibleErrors: string[] = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[class*='error'], [class*='invalid'], [role='alert'], .wpcf7-not-valid-tip, .wpcf7-response-output"))) {
      const r = el.getBoundingClientRect();
      const t = (el as HTMLElement).innerText?.trim();
      if (r.width > 0 && r.height > 0 && t) out.push(t.slice(0, 80));
    }
    return out.slice(0, 5);
  }).catch(() => []);
  if (visibleErrors.length && visibleErrors.some((e) => ERROR_RE.test(e))) return { status: "failed", detail: `入力エラー: ${visibleErrors.join(" / ")}` };
  const fieldsNow = (await collectFields(page)).length;
  if (afterSubmit && hadFieldsBefore > 0 && fieldsNow === 0) return { status: "sent", detail: "フォームが消えた（完了文言なし・要確認）" };
  // エラー語の前後を切り出して見せる（「エラー文言を検知」だけでは、利用者がどの欄を直せばいいか分からない）。
  // ただし送信前から同じ文言があるものは、フォームの説明文（「※は必須項目です」「必須項目をご入力ください」等）なので無視する
  const errG = new RegExp(ERROR_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = errG.exec(text))) {
    const key = text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).replace(/\s+/g, "");
    if (beforeCompact && key && beforeCompact.includes(key)) continue;
    const around = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 80).replace(/\s+/g, " ").trim();
    return { status: "failed", detail: `エラー文言を検知: 「${around}」\nスクリーンショットで該当の入力欄を確認してください` };
  }
  return { status: "unsure", detail: "完了もエラーも検知できず" };
}
