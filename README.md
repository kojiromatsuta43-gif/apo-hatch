# form-outreach — メール＆フォーム営業ツール（単体版）

営業リスト（CSV）の会社へ、お問い合わせフォームまたはメールで営業文を自動送信する。BRIDGE HATCH 本体に同じ機能が組み込まれている。

## 2026-09-08 の更新
- キャンペーンごとに **再送禁止期間**（日数、0で無制限）と **「営業お断り」サイトにも送るか** を設定できるように
- **手動送信リスト**（CAPTCHA・失敗・フォーム無しの会社を URL＋文面つき CSV で書き出し。人が送る用）

## 2026-09-06 の更新
- **メール送信**（自分のGmail / Google Workspace のアプリパスワードで送る。外部サービス不要）。チャネル「フォーム優先＋メール」でフォームが無い会社に自動でメール
- **事前チェック**（送らずにフォーム有無・お断り・CAPTCHA を判定し、サイトのメールアドレスを拾う → フォーム無しはメールに切替）
- **フォーム入力の精度**: 段階式・iframe埋め込み・SPA・カスタムチェックボックス・ハニーポット回避・textarea無しフォーム・Cookieバナー（E2E 13パターン）
- **文面チェック**（未記入・迷惑語・長さ・URL数・連絡先）、AI冒頭が弱いときの自動フォールバック
- **反応の記録**（返信／アポ／断り→除外）と反応率、結果CSVに反応列
- 一時的な失敗は1回自動リトライ

## 別のPCで動かす（はじめての人向け）

1. **Node.js 22（LTS）** を入れる → https://nodejs.org/ （「LTS」をダウンロードしてインストール）
2. この zip を解凍し、ターミナル（Windows は PowerShell、Mac はターミナル）でそのフォルダに移動
3. 下の「起動」の3行を順に実行（初回は `npm install` と `npx playwright install chromium` で数分かかる）
4. ブラウザで http://localhost:3210 を開く → 送信者を登録 → キャンペーン作成 → CSV取込 → テスト → 開始
5. 止めるときはターミナルで Ctrl+C。データは `data/` フォルダに残る（送信履歴・除外リスト・画面写真）

メール送信を使う場合は、送信者の画面で Gmail／Google Workspace の「アプリパスワード」を登録する（Googleアカウント → セキュリティ → 2段階認証をオン → アプリパスワード）。

## 起動

```bash
cd form-outreach          # zipを解凍したフォルダ
npm install
npx playwright install chromium     # 初回のみ（ブラウザ本体）
npm run dev                          # → http://localhost:3210
```

AIで文面を個別化する場合は環境変数を付ける（無ければテンプレートのみで動く）:

```bash
ANTHROPIC_API_KEY=sk-... npm run dev     # Claude（既定 claude-haiku-4-5）
GEMINI_API_KEY=...       npm run dev     # Gemini（既定 gemini-3.6-flash）
```

## 使い方（画面）

1. **送信者** — 会社名・担当者・メール・電話などを登録。メールでも送るなら「メールで送る場合の設定」に Gmail の送信用アドレスとアプリパスワード →「メール設定を確認」
2. **キャンペーン作成** — 配信チャネル（フォーム優先＋メール／フォームのみ／メールのみ）・文面モード（ハイブリッド / テンプレ / 全文AI）・本文テンプレ・1日上限（フォーム／メール）・送信時間帯
3. **CSVを取り込む** — 列: 企業名 / 問い合わせフォーム / 企業URL / メール / 大業界 / 小業界 / 都道府県 / 代表者名（企業DBの書き出しそのまま可）。同一ドメイン・再送禁止期間内（既定90日）・除外リスト・配信停止・官公庁は自動で振り分け
4. **事前チェック**（任意）— フォーム有無・お断り・CAPTCHA・メール発見。フォーム無しはメールに切替
5. **文面プレビュー**（自動チェック付き）→ **テスト**（自社フォームURLで「入力だけ」/「実送信」、メールは自分のアドレスに1通）
6. **開始** — 平日9〜18時のみ、上限まで、フォームは8〜15秒・メールは2〜5秒間隔。結果はスクショ付き
7. **反応を記録** — 送信済みの会社を開いて「返信あり／アポ獲得／断り」。断りは除外リスト・配信停止に自動登録

## 守っていること

- 「営業お断り」文言を検知したらスキップし、そのドメインを除外リストに自動登録（キャンペーン設定で「送る」に変更可・非推奨）
- 目に見える CAPTCHA（reCAPTCHA v2 / hCaptcha / Turnstile / 画像認証）があればスキップ。突破はしない
- 同一ドメインには再送禁止期間（既定90日・キャンペーンごとに変更可、0で無制限）は再送しない（全キャンペーン横断）
- 検索フォーム・ニュースレター欄など「本文欄のないフォーム」は触らない
- 送信結果はスクリーンショット付きで保存（クレーム対応・クライアント報告用）

## 構成

```
src/db.ts          テーブル定義（sender_profiles / form_campaigns / form_jobs / form_suppressions / site_cache）
src/csv.ts         CSV取り込み（列名の別名対応・振り分け）
src/formFinder.ts  フォームページ探索（DBのURL → トップのリンク → /contact 等）
src/detect.ts      営業お断り・CAPTCHA 検知
src/formFiller.ts  項目の判定と入力・確認画面・送信・結果判定
src/engine.ts      1社分の送信フロー（Playwright）
src/message.ts     文面生成（テンプレ差し込み / AI / ハイブリッド、NGワード）
src/worker.ts      キュー処理（時間帯・上限・並列・停止）
src/server.ts      管理画面（Express）
test/e2e.ts        ダミーサイトでの通しテスト（npm test）
```

## BRIDGE HATCH への組み込み方（Phase 2）

- `db.ts` のテーブルを本体の schema に追加し、`getDb()` を本体の DB に差し替える
- `message.ts` の `llm()` を本体の `src/lib/server/llm.ts` に置き換える
- `server.ts` のルートを Next.js の API Route / 画面に移す（営業リスト画面に「フォーム営業を作成」ボタン）
- `worker.ts` は Railway の別サービス（Chromium 入り Docker）として常駐させ、`form_campaigns.status='running'` を拾う
- 課金: admin は無料、クライアントは送信件数でハニー消費（単価は未決）

## 環境変数

| 変数 | 既定 | 用途 |
|---|---|---|
| PORT | 3210 | 管理画面のポート |
| DATA_DIR | ./data | DB・スクショの保存先 |
| HEADLESS | 1 | 0 でブラウザを表示して動かす（デバッグ用） |
| FO_CONCURRENCY | 2 | 同時送信数 |
| FO_MIN_WAIT_MS / FO_MAX_WAIT_MS | 8000 / 15000 | 送信間隔 |
| ANTHROPIC_API_KEY / GEMINI_API_KEY | — | AI個別化 |
| ANTHROPIC_MODEL / GEMINI_MODEL | claude-haiku-4-5 / gemini-3.6-flash | モデル |
