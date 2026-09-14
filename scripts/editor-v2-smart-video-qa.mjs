import { mkdir } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-smart-tools";
const fixture = `${output}/smart-tools-fixture.mp4`;
const baseUrl = process.env.EDITOR_V2_URL ?? "http://127.0.0.1:5173/editor-v2";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.locator(".editor-v2-shell").waitFor({ timeout: 30_000 });
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 30_000 });
await page.waitForTimeout(200);
await page.getByLabel("Selecionar mídias locais").setInputFiles(fixture);
await page.locator('[data-track-id="track-video"] [data-clip-id]').first().waitFor({ timeout: 20_000 }).catch(async (error) => {
  console.log(JSON.stringify({ stage: "import", body: (await page.locator("body").innerText()).slice(0, 5000), consoleErrors }, null, 2));
  throw error;
});

const videoTrack = page.locator('[data-track-id="track-video"]');
await videoTrack.locator('[data-clip-id]').first().click({ position: { x: 42, y: 18 } });
await page.getByRole("button", { name: "Cortes automáticos" }).click();
await page.getByLabel("Intervalo dos cortes automáticos em segundos").fill("2");
await page.getByRole("button", { name: "Aplicar cortes" }).click();
await page.waitForTimeout(150);
assert(await videoTrack.locator('[data-clip-id]').count() === 4, "O corte automático de 6,5 s em intervalos de 2 s não criou quatro trechos");
assert(await page.getByText(/Ctrl\+Z desfaz todos os cortes/).count() > 0, "O feedback do corte automático não informou a reversibilidade");

await page.keyboard.press("Control+z");
await page.waitForTimeout(120);
assert(await videoTrack.locator('[data-clip-id]').count() === 1, "Ctrl+Z não desfez todos os cortes automáticos em uma ação");

const clip = videoTrack.locator('[data-clip-id]').first();
await clip.click({ position: { x: 42, y: 18 } });
await page.getByRole("button", { name: "Espelhar horizontal" }).click();
await page.getByRole("button", { name: "Espelhar vertical" }).click();
await page.getByRole("button", { name: "Reverter vídeo" }).click();
const canvasVideo = page.locator('[data-testid="editor-v2-canvas"]:visible video');
assert((await canvasVideo.getAttribute("style"))?.includes("scaleX(-1) scaleY(-1)"), "Os espelhamentos não chegaram à prévia");
assert(await clip.getByText("REV", { exact: true }).count() === 1, "A timeline não sinalizou o vídeo revertido");
assert(await clip.getByText("↔", { exact: true }).count() === 1 && await clip.getByText("↕", { exact: true }).count() === 1, "A timeline não sinalizou os espelhamentos");

await page.getByRole("tab", { name: "Velocidade" }).click();
await page.getByRole("button", { name: /Câmera lenta suave/ }).click();
await page.waitForTimeout(120);
assert(await clip.getByText("0.5×", { exact: true }).count() === 1, "A timeline não sinalizou a câmera lenta de 0,5×");
assert(await page.getByText("A prévia, o áudio, a duração e a exportação usam a mesma velocidade do projeto.").count() === 1, "O inspector não explica o contrato de velocidade");

assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "A nova barra criou overflow horizontal global");
await page.screenshot({ path: `${output}/editor-v2-smart-video-1440x1000.png`, fullPage: false });
await browser.close();

console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
