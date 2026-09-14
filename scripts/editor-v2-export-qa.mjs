import { mkdir } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-export";
const fixture = "output/playwright/editor-v2-audio-source/video-with-audio.mp4";
const exported = `${output}/editor-v2-browser-export.mp4`;
const baseUrl = process.env.EDITOR_V2_URL ?? "http://127.0.0.1:5173/editor-v2";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "commit", timeout: 90_000 });
  await page.locator(".editor-v2-shell").waitFor({ timeout: 90_000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))),
    null,
    { timeout: 90_000 },
  );
  await page.locator('input[type="file"][multiple]').setInputFiles(fixture);
  await page.locator('[data-track-id="track-video"] [data-clip-id]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);

  // Keep this browser smoke deliberately small while exercising the production export button.
  await page.evaluate(() => {
    const key = "vaiviral.editor-v2.project.editor-v2-local";
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Projeto importado nÃ£o foi persistido");
    const project = JSON.parse(raw);
    project.settings.width = 360;
    project.settings.height = 640;
    project.settings.fps = 15;
    project.settings.duration = 2;
    localStorage.setItem(key, JSON.stringify(project));
  });
  await page.reload({ waitUntil: "commit", timeout: 90_000 });
  await page.locator(".editor-v2-shell").waitFor({ timeout: 90_000 });
  await page.locator('[data-track-id="track-video"] [data-clip-id]').waitFor({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(exported);
  await page.getByRole("button", { name: "Exportar", exact: true }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${output}/export-complete.png`, fullPage: true });
  console.log(JSON.stringify({ passed: consoleErrors.length === 0, exported, suggestedFilename: download.suggestedFilename(), consoleErrors }, null, 2));
  if (consoleErrors.length) process.exitCode = 1;
} catch (error) {
  await page.screenshot({ path: `${output}/export-failure.png`, fullPage: true }).catch(() => undefined);
  console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error), consoleErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
