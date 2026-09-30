// 送信が止まったときなどに、パソコンの通知（Macの通知センター／Windowsのトースト）で知らせる。
// 追加のソフトは使わず、OS標準のコマンドを呼ぶだけ。失敗しても送信には影響させない（best-effort）。
import { execFile } from "node:child_process";
import { getSetting } from "./db.js";

/** 直近に出した通知。同じ内容を何度も出さない（1時間に1回まで） */
const lastSent = new Map<string, number>();

export function notifyEnabled(): boolean {
  return getSetting("notify_desktop", "1") === "1";
}

/** パソコンに通知を出す。key が同じ通知は1時間に1回だけ。 */
export function notify(title: string, body: string, key = title): void {
  console.log(`[apo-hatch] お知らせ: ${title} — ${body}`);
  if (!notifyEnabled()) return;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < 60 * 60_000) return;
  lastSent.set(key, now);
  const t = title.replace(/["'\\]/g, " ").slice(0, 60);
  const b = body.replace(/["'\\]/g, " ").replace(/\s+/g, " ").slice(0, 180);
  try {
    if (process.platform === "darwin") {
      execFile("osascript", ["-e", `display notification "${b}" with title "アポハッチくん" subtitle "${t}" sound name "Submarine"`], () => {});
    } else if (process.platform === "win32") {
      // Windows 10/11 のトースト通知（PowerShell の標準機能だけで出す）
      const ps = `$ErrorActionPreference='SilentlyContinue';[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]>$null;` +
        `$x=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);` +
        `$n=$x.GetElementsByTagName('text');$n.Item(0).AppendChild($x.CreateTextNode('アポハッチくん: ${t}'))>$null;$n.Item(1).AppendChild($x.CreateTextNode('${b}'))>$null;` +
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('アポハッチくん').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
      execFile("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], () => {});
    }
  } catch {
    /* 通知が出せなくても送信は続ける */
  }
}
