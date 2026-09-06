// 企業DB（COMPANY_DB.md の列名）や任意のCSVを取り込む。列名の別名に対応。
import { parse } from "csv-parse/sync";
import { domainOf, getDb, isExcludedDomain } from "./db.js";

export type CompanyRow = {
  company_name: string;
  form_url: string;
  site_url: string;
  email: string;
  industry: string;
  sub_industry: string;
  prefecture: string;
  representative: string;
};

const ALIASES: Record<keyof CompanyRow, string[]> = {
  company_name: ["企業名", "会社名", "社名", "company", "company_name", "name"],
  form_url: ["問い合わせフォーム", "お問い合わせフォーム", "フォームURL", "form_url", "contact_url", "form"],
  site_url: ["企業URL", "URL", "ホームページ", "HP", "website", "site_url", "url"],
  email: ["メール", "メールアドレス", "email", "mail", "e-mail"],
  industry: ["大業界", "業界", "業種", "industry"],
  sub_industry: ["小業界", "小業種", "sub_industry"],
  prefecture: ["都道府県", "prefecture"],
  representative: ["代表者名", "代表者", "代表", "representative"],
};

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    for (const col of Object.keys(row)) {
      if (col.trim().toLowerCase() === k.toLowerCase()) return (row[col] ?? "").trim();
    }
  }
  return "";
}

export function parseCompanyCsv(buf: Buffer | string): CompanyRow[] {
  let text = typeof buf === "string" ? buf : buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Shift_JIS のExcel出力対策: 文字化けが目立つ場合は再デコード
  if (typeof buf !== "string" && /�/.test(text.slice(0, 2000))) {
    text = new TextDecoder("shift_jis").decode(buf);
  }
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true }) as Record<string, string>[];
  return rows
    .map((r) => ({
      company_name: pick(r, ALIASES.company_name),
      form_url: pick(r, ALIASES.form_url),
      site_url: pick(r, ALIASES.site_url),
      email: pick(r, ALIASES.email).toLowerCase(),
      industry: pick(r, ALIASES.industry),
      sub_industry: pick(r, ALIASES.sub_industry),
      prefecture: pick(r, ALIASES.prefecture),
      representative: pick(r, ALIASES.representative),
    }))
    .filter((r) => r.company_name && (r.form_url || r.site_url || r.email));
}

export type ImportSummary = { added: number; addedForm: number; addedEmail: number; excluded: number; suppressed: number; duplicated: number; noUrl: number };

/** 企業行をキャンペーンのジョブとして登録。チャネル（フォーム／メール）を振り分け、除外・重複は理由を残す */
export function importRowsToCampaign(campaignId: number, rows: CompanyRow[]): ImportSummary {
  const db = getDb();
  const campaign = db.prepare("SELECT channel FROM form_campaigns WHERE id=?").get(campaignId) as { channel: string } | undefined;
  const mode = (campaign?.channel ?? "both") as "form" | "email" | "both";
  const summary: ImportSummary = { added: 0, addedForm: 0, addedEmail: 0, excluded: 0, suppressed: 0, duplicated: 0, noUrl: 0 };
  const insert = db.prepare(`
    INSERT INTO form_jobs(campaign_id, company_name, form_url, site_url, industry, sub_industry, prefecture, representative, domain, channel, email, status, result_text)
    VALUES(@campaign_id, @company_name, @form_url, @site_url, @industry, @sub_industry, @prefecture, @representative, @domain, @channel, @email, @status, @result_text)`);
  const isSuppressed = db.prepare("SELECT 1 FROM form_suppressions WHERE domain=?");
  const isOptedOut = db.prepare("SELECT 1 FROM email_optouts WHERE email=?");
  const recentlySent = db.prepare("SELECT 1 FROM form_jobs WHERE domain=? AND status='sent' AND is_test=0 AND sent_at > datetime('now','-90 days')");
  const seen = new Set<string>();

  const tx = db.transaction(() => {
    for (const r of rows) {
      const hasForm = Boolean(r.form_url || r.site_url);
      const hasEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email);
      let channel: "form" | "email" | null = null;
      if (mode === "form" && hasForm) channel = "form";
      else if (mode === "email" && hasEmail) channel = "email";
      else if (mode === "both") channel = hasForm ? "form" : hasEmail ? "email" : null;
      if (!channel) { summary.noUrl++; continue; }
      const domain = channel === "form" ? domainOf(r.form_url || r.site_url) : domainOf(r.site_url) || r.email.split("@")[1];
      if (!domain) { summary.noUrl++; continue; }
      if (seen.has(domain)) { summary.duplicated++; continue; }
      seen.add(domain);
      let status = "queued";
      let reason = "";
      if (isExcludedDomain(domain)) { status = "skip_suppressed"; reason = "官公庁・学校等のドメインは既定で除外"; summary.excluded++; }
      else if (isSuppressed.get(domain)) { status = "skip_suppressed"; reason = "除外リストに登録済み"; summary.suppressed++; }
      else if (channel === "email" && isOptedOut.get(r.email)) { status = "skip_optout"; reason = "配信停止済みのアドレス"; summary.suppressed++; }
      else if (recentlySent.get(domain)) { status = "skip_duplicate"; reason = "90日以内に送信済み"; summary.duplicated++; }
      else { summary.added++; if (channel === "form") summary.addedForm++; else summary.addedEmail++; }
      insert.run({ ...r, campaign_id: campaignId, domain, channel, email: hasEmail ? r.email : "", status, result_text: reason });
    }
  });
  tx();
  return summary;
}
