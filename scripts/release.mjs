// 更新版を配るための release.json を作る。
//   npm version patch   → package.json のバージョンを上げる
//   npm run release -- "直した内容"  → release.json を書き出す
//   git add -A && git commit -m "v0.1.2" && git push
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const cfg = JSON.parse(fs.readFileSync(path.join(root, "update.json"), "utf8"));

const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(cfg.manifest_url ?? "");
if (!m) {
  console.error("update.json の manifest_url を、自分のGitHubリポジトリのURLに書き換えてください。");
  console.error("  例: https://raw.githubusercontent.com/あなたのID/apo-hatch/main/release.json");
  process.exit(1);
}
const [, owner, repo, branch] = m;

const release = {
  version: pkg.version,
  notes: process.argv.slice(2).join(" ") || "細かな改善",
  zip: `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`,
  published_at: new Date().toISOString(),
};
fs.writeFileSync(path.join(root, "release.json"), JSON.stringify(release, null, 2) + "\n");
console.log("release.json を書き出しました:");
console.log(JSON.stringify(release, null, 2));
console.log("\nこのあと git でプッシュすると、配布済みの全員が更新できるようになります:");
console.log(`  git add -A && git commit -m "v${pkg.version}" && git push`);
