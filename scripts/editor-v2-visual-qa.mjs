import { mkdir } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-visual-refresh";
const baseUrl = process.env.EDITOR_V2_URL ?? "http://127.0.0.1:5173/editor-v2";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const failures = [];
const consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

async function inspect(viewport, name) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${name}: ${message.text()}`); });
  page.on("pageerror", (error) => consoleErrors.push(`${name}: ${error.message}`));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".editor-v2-shell").waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector(".editor-v2-shell")?.getBoundingClientRect().height === innerHeight);

  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: overflow horizontal global`);
  assert(await page.locator('[data-testid="editor-v2-canvas"]:visible').count() === 1, `${name}: canvas visível não encontrado`);
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.matches(":focus-visible")), `${name}: primeiro controle sem foco visível`);

  if (viewport.width < 1024) {
    const navigation = page.locator('nav[aria-label="Áreas do editor"]');
    assert(await navigation.getByRole("button").count() === 4, `${name}: navegação estreita incompleta`);
    await navigation.getByRole("button", { name: "Biblioteca" }).click();
    assert(await page.locator('section[aria-label="Biblioteca do Editor V2"]:visible').count() === 1, `${name}: biblioteca não abriu`);
    await page.screenshot({ path: `${output}/${name}-library.png`, fullPage: false });
    await navigation.getByRole("button", { name: "Prévia" }).click();
  }

  await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
  await page.close();
}

await inspect({ width: 1440, height: 1000 }, "desktop-1440x1000");
await inspect({ width: 430, height: 900 }, "narrow-430x900");
await browser.close();

console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
