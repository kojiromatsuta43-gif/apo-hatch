// 文面生成: テンプレート差し込み / AI個別生成 / ハイブリッド（テンプレの骨格＋冒頭だけAI）
// AIプロバイダは本体の src/lib/server/llm.ts と同じ考え方（ANTHROPIC_API_KEY があれば Claude、無ければ Gemini、どちらも無ければテンプレのみ）
import type { Campaign, Job, SenderProfile } from "./db.js";
import { getDb } from "./db.js";

export type Vars = Record<string, string>;

export function buildVars(job: Pick<Job, "company_name" | "industry" | "sub_industry" | "prefecture" | "representative">, sender: SenderProfile): Vars {
  return {
    会社名: job.company_name,
    企業名: job.company_name,
    業種: job.sub_industry || job.industry,
    大業界: job.industry,
    小業界: job.sub_industry,
    都道府県: job.prefecture,
    代表者名: job.representative,
    代表者: job.representative ? `${job.representative}様` : "ご担当者様",
    自社名: sender.company,
    担当者: sender.person,
    自社メール: sender.email,
    自社電話: sender.tel,
    自社URL: sender.url,
  };
}

export function renderTemplate(tpl: string, vars: Vars): string {
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

// ---- LLM ----
export type Provider = "anthropic" | "gemini" | "none";
export function activeProvider(): Provider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "none";
}

export async function llm(system: string, user: string, maxTokens = 600): Promise<string> {
  const p = activeProvider();
  if (p === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { content: { type: string; text?: string }[] };
    return j.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  }
  if (p === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
  }
  throw new Error("AIのAPIキーが設定されていません（ANTHROPIC_API_KEY または GEMINI_API_KEY）");
}

const SYSTEM_BASE = `あなたは日本のBtoB営業担当のアシスタントです。企業の問い合わせフォームに送る営業メッセージを書きます。
守ること:
- 丁寧なビジネス日本語。誇張・断定・虚偽の実績は書かない。絵文字・記号装飾は使わない
- 相手企業の情報に触れるときは、渡された情報にある事実だけを使う。無い情報は推測で書かない
- 「お忙しいところ恐れ入ります」等の定型は最小限。相手にとっての具体的なメリットを1つに絞る
- 末尾に必ず連絡先（送信者名・メール）を入れる。返信不要・配信停止の一文を添える`;

/** ハイブリッド: テンプレの {{AI冒頭}} 部分だけを企業ごとに生成 */
export async function generateOpening(job: Job, sender: SenderProfile, campaign: Campaign, site: { title: string; text: string }): Promise<string> {
  const info = [`会社名: ${job.company_name}`, job.industry && `業種: ${job.industry}${job.sub_industry ? ` / ${job.sub_industry}` : ""}`, job.prefecture && `所在地: ${job.prefecture}`, site.title && `サイトタイトル: ${site.title}`, site.text && `サイト本文（抜粋）: ${site.text.slice(0, 2000)}`]
    .filter(Boolean)
    .join("\n");
  const user = `次の企業に送る営業メッセージの「冒頭の1〜2文」だけを書いてください。この後にこちらのサービス紹介文が続きます。
相手企業の事業内容やサイトの内容に具体的に触れ、「なぜ貴社に連絡したか」が伝わるようにしてください。挨拶（突然のご連絡失礼いたします 等）は不要で、いきなり本題の1〜2文だけを出力してください。60〜120文字。

【相手企業】
${info}

【こちらのサービス（参考）】
${campaign.template_text.slice(0, 800)}

${campaign.ai_instruction ? `【追加指示】\n${campaign.ai_instruction}` : ""}`;
  const out = await llm(SYSTEM_BASE, user, 300);
  return out.replace(/^["「]|["」]$/g, "").trim();
}

/** 全文AI生成 */
export async function generateFullMessage(job: Job, sender: SenderProfile, campaign: Campaign, site: { title: string; text: string }): Promise<string> {
  const info = [`会社名: ${job.company_name}`, job.industry && `業種: ${job.industry}${job.sub_industry ? ` / ${job.sub_industry}` : ""}`, job.prefecture && `所在地: ${job.prefecture}`, site.title && `サイトタイトル: ${site.title}`, site.text && `サイト本文（抜粋）: ${site.text.slice(0, 2500)}`]
    .filter(Boolean)
    .join("\n");
  const user = `次の企業の問い合わせフォームに送る営業メッセージ全文を書いてください。400〜600文字。冒頭で相手企業の事業に具体的に触れ、こちらのサービスが相手にどう役立つかを1点に絞って伝え、最後に「ご興味があればご返信ください」と連絡先で締めてください。

【相手企業】
${info}

【こちらのサービス・伝えたいこと】
${campaign.template_text}

【送信者】
${sender.company} ${sender.person}
メール: ${sender.email}${sender.tel ? ` / 電話: ${sender.tel}` : ""}${sender.url ? ` / ${sender.url}` : ""}

${campaign.ai_instruction ? `【追加指示】\n${campaign.ai_instruction}` : ""}`;
  return llm(SYSTEM_BASE, user, 900);
}

/** キャンペーンのモードに応じて最終文面を作る */
export async function composeMessage(job: Job, sender: SenderProfile, campaign: Campaign, site: { title: string; text: string }): Promise<{ subject: string; message: string; aiUsed: boolean }> {
  const vars = buildVars(job, sender);
  const subject = renderTemplate(campaign.subject_text || "サービスのご案内", vars);
  let message: string;
  let aiUsed = false;
  const canAi = activeProvider() !== "none";

  if (campaign.mode === "ai" && canAi) {
    message = await generateFullMessage(job, sender, campaign, site);
    aiUsed = true;
  } else if (campaign.mode === "hybrid" && canAi && campaign.template_text.includes("{{AI冒頭}}")) {
    let opening = "";
    try { opening = await generateOpening(job, sender, campaign, site); } catch { opening = ""; }
    const weak = opening.replace(/\s/g, "").length < 25 || /^(申し訳|すみません|I |As an AI)/.test(opening) || /\{\{/.test(opening);
    if (weak) opening = vars.業種 ? `${vars.業種}の事業を展開されている貴社に、ぜひご案内したいサービスがありご連絡いたしました。` : "貴社のホームページを拝見し、ぜひご案内したいサービスがありご連絡いたしました。";
    else aiUsed = true;
    message = renderTemplate(campaign.template_text, { ...vars, AI冒頭: opening });
  } else {
    // テンプレのみ（AI不可の場合のフォールバックも兼ねる）
    const fallbackOpening = vars.業種 ? `${vars.業種}の事業を展開されている貴社に、ぜひご案内したいサービスがありご連絡いたしました。` : "貴社のホームページを拝見し、ぜひご案内したいサービスがありご連絡いたしました。";
    message = renderTemplate(campaign.template_text, { ...vars, AI冒頭: fallbackOpening });
  }
  return { subject, message: message.trim(), aiUsed };
}

// ---- NGワード ----
export function loadNgWords(): string[] {
  try {
    const rows = getDb().prepare("SELECT value FROM settings WHERE key='ng_words'").get() as { value: string } | undefined;
    return rows ? (JSON.parse(rows.value) as string[]) : [];
  } catch {
    return [];
  }
}
export function findNgWords(text: string, words = loadNgWords()): string[] {
  return words.filter((w) => w && text.includes(w));
}

export const DEFAULT_TEMPLATE = `{{会社名}}
{{代表者}}

突然のご連絡失礼いたします。{{自社名}}の{{担当者}}と申します。

{{AI冒頭}}

弊社は、TikTok・Instagram向けのショート動画を「平日は毎日1本」制作するサービス「BRIDGE HATCH」を運営しております。
台本作成から編集まで一括でお任せいただけ、採用・集客どちらの用途にも対応しております。IT導入補助金の対象ツールのため、実質1/3のご負担で導入いただけます。

もしご興味がございましたら、本メールへのご返信、または下記までご連絡いただけますと幸いです。
サービス資料をお送りいたします。

{{自社名}} {{担当者}}
メール: {{自社メール}}
電話: {{自社電話}}
{{自社URL}}

※本メッセージが不要な場合は、お手数ですが上記メールまでその旨ご連絡ください。以後のご連絡は控えさせていただきます。`;

export type Lint = { level: "error" | "warn"; text: string };

/** 送る前の文面チェック。error は送信を止める、warn は注意表示 */
export function lintMessage(message: string, subject: string, channel: "form" | "email" | "both" = "both"): Lint[] {
  const out: Lint[] = [];
  if (/【ここに/.test(message)) out.push({ level: "error", text: "【ここに…】の部分が未記入です" });
  const leftover = message.match(/\{\{[^}]+\}\}/g);
  if (leftover) out.push({ level: "error", text: `差し込みが置き換わっていません: ${Array.from(new Set(leftover)).join(" ")}` });
  const len = message.replace(/\s/g, "").length;
  if (len < 120) out.push({ level: "warn", text: `本文が短すぎます（${len}文字）。200〜500文字が目安です` });
  if (len > 1200) out.push({ level: "warn", text: `本文が長すぎます（${len}文字）。600文字以内が目安です` });
  const spam = ["無料", "今すぐ", "限定", "絶対", "100%", "必ず", "儲か", "保証", "激安", "格安", "最安", "驚き", "秘密", "緊急", "先着", "当選", "お金", "稼げ", "!!", "！！", "★", "☆", "■■"];
  const hits = spam.filter((w) => message.includes(w) || subject.includes(w));
  if (hits.length) out.push({ level: "warn", text: `迷惑メール判定されやすい語: ${hits.join("、")}` });
  const urls = message.match(/https?:\/\/\S+/g) ?? [];
  if (urls.length > 2) out.push({ level: "warn", text: `URLが${urls.length}個あります。2個以内が安全です` });
  if (!/(@|メール|mail)/i.test(message)) out.push({ level: "warn", text: "連絡先（メールアドレス）が本文にありません" });
  if (channel !== "form" && !/(不要|停止|配信|ご連絡は控え)/.test(message)) out.push({ level: "warn", text: "「不要な場合はご連絡ください」の一文がありません" });
  if (!subject.trim()) out.push({ level: "warn", text: "件名が空です" });
  return out;
}
