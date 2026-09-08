// アポハッチくんの起動役。アップデート後に自分で再起動できるよう、終了コード75なら立ち上げ直す。
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESTART = 75;

function start() {
  const p = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "src/server.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  p.on("close", (code) => {
    if (code === RESTART) {
      console.log("\n--- アップデートを適用して再起動します ---\n");
      start();
    } else {
      process.exit(code ?? 0);
    }
  });
  const stop = () => p.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

start();
