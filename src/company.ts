// 社名の法人格（株式会社など）の判定と、企業HPの本文から正式名称（法人格つき）を読み取る。
// 「株式会社div」を「div」と取り込んでしまった等の取りこぼしを、AIを使わず会社自身の表記（フッター・会社概要・©）から補う。
const ENT = "株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|社会福祉法人|医療法人(?:社団|財団)?|学校法人|宗教法人|特定非営利活動法人|NPO法人|事業協同組合|協同組合";
const ENT_RE = new RegExp(`(?:${ENT}|㈱|㈲|\\(株\\)|（株）|\\(有\\)|（有）|\\bInc\\.?|\\bCo\\.,? ?Ltd\\.?|\\bLLC\\b|\\bCorp\\.?|\\bLtd\\.?|\\bK\\.K\\.)`, "i");

/** 社名に法人格が含まれているか */
export function hasEntity(name: string): boolean {
  return ENT_RE.test(name || "");
}

function normalize(s: string): string {
  return s.replace(/㈱|\(株\)|（株）/g, "株式会社").replace(/㈲|\(有\)|（有）/g, "有限会社").replace(/[\s　]+/g, " ");
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** HP本文から「法人格＋社名」または「社名＋法人格」を探し、見つかれば正式名称を返す（無ければ null）。
 *  社名に既に法人格があれば null（変更不要）。出現回数が多い形を採用し、同数なら前株（先に見つかった形）を優先。 */
export function extractLegalName(name: string, text: string): string | null {
  const core = (name || "").trim();
  if (!core || hasEntity(core)) return null;
  const t = normalize(text || "");
  const c = escapeRe(normalize(core));
  const pre = new RegExp(`(${ENT})\\s?(${c})(?![A-Za-z0-9])`, "gi");
  const suf = new RegExp(`(?<![A-Za-z0-9])(${c})\\s?(${ENT})`, "gi");
  const count = new Map<string, number>();
  for (const m of t.matchAll(pre)) { const k = `${m[1]}${m[2]}`; count.set(k, (count.get(k) ?? 0) + 1); }
  for (const m of t.matchAll(suf)) { const k = `${m[1]}${m[2]}`; count.set(k, (count.get(k) ?? 0) + 1); }
  if (!count.size) return null;
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
