import { mkdir } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-phase2";
const fixture = `${output}/phase2-sample.mp4`;
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const failures = [];
const consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("http://localhost:8080/editor-v2", { waitUntil: "domcontentloaded" });
  await page.locator(".editor-v2-shell").waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 20_000 });
  await page.waitForTimeout(150);
  return page;
}

const page = await open({ width: 1440, height: 1000 });
await page.getByLabel("Selecionar mídias locais").setInputFiles(fixture);
try {
  await page.getByText("1 mídia importada para esta sessão.").waitFor({ timeout: 15_000 });
} catch (error) {
  console.log(JSON.stringify({ stage: "import", status: await page.locator('[role="status"]').allTextContents(), body: (await page.locator("body").innerText()).slice(0, 4000), consoleErrors }, null, 2));
  throw error;
}

const videoTrack = page.locator('[data-track-id="track-video"]');
const overlayTrack = page.locator('[data-track-id="track-overlay"]');
const importedClip = videoTrack.locator('[data-clip-id]');
assert(await importedClip.count() === 1, "A mídia local não entrou na trilha de vídeo");
assert(await page.locator('[data-testid="editor-v2-canvas"]:visible video').count() === 1, "A mídia local não apareceu no canvas");
assert((await importedClip.first().getAttribute("style"))?.includes("blob:") === true, "A timeline não exibiu o preview real da mídia");

await importedClip.first().click({ position: { x: 34, y: 18 } });
await page.keyboard.press("Control+d");
await page.waitForTimeout(120);
assert(await videoTrack.locator('[data-clip-id]').count() === 2, "Ctrl+D não duplicou o clipe selecionado");
await page.keyboard.press("Control+z");
await page.waitForTimeout(120);
assert(await videoTrack.locator('[data-clip-id]').count() === 1, "Undo não reverteu a duplicação");

const sourceBox = await importedClip.first().boundingBox();
const targetBox = await overlayTrack.boundingBox();
if (sourceBox && targetBox) {
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 20, targetBox.y + targetBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert(await overlayTrack.locator('[data-clip-id]').count() === 1, "O clipe não mudou verticalmente para a trilha de sobreposição");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(120);
  assert(await videoTrack.locator('[data-clip-id]').count() === 1, "Undo não restaurou a trilha original");
} else {
  failures.push("Não foi possível medir as trilhas para o teste de movimento vertical");
}

const mute = page.getByRole("button", { name: "Silenciar Vídeo" });
await mute.click();
assert(await page.getByRole("button", { name: "Ativar som de Vídeo" }).getAttribute("aria-pressed") === "true", "Mute não atualizou o estado da trilha");
await page.keyboard.press("Control+z");
assert(await page.getByRole("button", { name: "Silenciar Vídeo" }).getAttribute("aria-pressed") === "false", "Undo não reverteu o mute");

await page.getByRole("button", { name: "Ocultar Vídeo" }).click();
assert(await page.locator('[data-testid="editor-v2-canvas"]:visible video').count() === 0, "Ocultar trilha não removeu a mídia do canvas");
await page.keyboard.press("Control+z");
assert(await page.locator('[data-testid="editor-v2-canvas"]:visible video').count() === 1, "Undo não restaurou a mídia oculta");

await page.getByRole("button", { name: "Bloquear Vídeo" }).click();
assert(await page.getByRole("button", { name: "Aparar fim de phase2-sample.mp4" }).count() === 0, "Trilha bloqueada ainda expôs alça de trim");
await page.keyboard.press("Control+z");
assert(await page.getByRole("button", { name: "Aparar fim de phase2-sample.mp4" }).count() === 1, "Undo não restaurou as alças de trim");

assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "O desktop criou overflow horizontal global");
await page.screenshot({ path: `${output}/editor-v2-phase2-1440x1000.png` });
await page.close();

const compact = await open({ width: 1366, height: 768 });
assert(await compact.getByLabel("Timeline multitrack").isVisible(), "Timeline ausente em 1366×768");
assert(await compact.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Overflow horizontal em 1366×768");
await compact.screenshot({ path: `${output}/editor-v2-phase2-1366x768.png` });
await compact.close();

const mobile = await open({ width: 430, height: 932 });
await mobile.getByRole("button", { name: /Timeline/ }).click();
assert(await mobile.locator('section[aria-label="Timeline multitrack"]:visible').isVisible(), "Timeline não abriu no mobile");
assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Overflow horizontal no mobile");
await mobile.screenshot({ path: `${output}/editor-v2-phase2-430x932.png` });
await mobile.close();

await browser.close();
console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
