import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-creative";
const baseUrl = process.env.EDITOR_V2_URL ?? "http://127.0.0.1:5173/editor-v2";
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [], consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.locator(".editor-v2-shell").waitFor({ timeout: 20_000 });
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 20_000 });
await page.getByLabel("Selecionar mídias locais").setInputFiles(`${output}/creative-fixture.mp4`);
const videoClip = page.locator('[data-track-id="track-video"] [data-clip-id]').first();
await videoClip.waitFor({ timeout: 15_000 }).catch(async (error) => { await page.screenshot({ path: `${output}/import-failure.png` }); console.error(await page.locator("footer").innerText()); throw error; });
await videoClip.click({ position: { x: 80, y: 16 } });
const inspector = page.locator('aside[aria-label="Inspector de propriedades"]:visible');
for (const tab of ["Básico", "Velocidade", "Animação", "Ajuste", "Efeitos"]) assert(await inspector.getByRole("tab", { name: tab, exact: true }).isVisible(), `A aba ${tab} não apareceu ao selecionar o vídeo`);

await inspector.getByRole("tab", { name: "Velocidade", exact: true }).click();
await inspector.getByRole("button", { name: "1.5×", exact: true }).click();
assert(await inspector.getByText("1.50×", { exact: true }).isVisible(), "A velocidade não foi aplicada ao clipe");

const originalLeft = Number.parseFloat(await videoClip.evaluate((element) => element.style.left));
const originalWidth = Number.parseFloat(await videoClip.evaluate((element) => element.style.width));
await page.getByRole("button", { name: "Duplicar", exact: true }).click();
const videoClips = page.locator('[data-track-id="track-video"] [data-clip-id]');
assert(await videoClips.count() === 2, "Duplicar não criou exatamente uma cópia");
const copy = videoClips.nth(1);
const copyLeft = Number.parseFloat(await copy.evaluate((element) => element.style.left));
assert(copyLeft >= originalLeft + originalWidth - .5, "A cópia ficou sobreposta ao clipe original");
assert(await copy.getAttribute("aria-pressed") === "true", "A nova cópia não ficou selecionada");
await page.screenshot({ path: `${output}/duplicate-adjacent.png`, fullPage: false });
await page.getByLabel("Desfazer").click();
assert(await videoClips.count() === 1, "Desfazer não removeu a duplicação");

const library = page.locator('section[aria-label="Biblioteca do Editor V2"]:visible');
await library.getByRole("tab", { name: "Efeitos", exact: true }).click();
await library.getByLabel("Buscar recursos").fill("Vibrante");
await page.waitForTimeout(250);
const vividCard = library.locator("article").filter({ hasText: "Vibrante" });
if (!await vividCard.count()) throw new Error(`Filtro Vibrante ausente: ${await library.innerText()}`);
await vividCard.getByRole("button", { name: /Inserir/ }).click();
await inspector.getByRole("tab", { name: "Ajuste", exact: true }).click();
assert(await inspector.getByRole("button", { name: /Vibrante/ }).getAttribute("aria-pressed") === "true", "O look Vibrante não ficou identificado como aplicado");
await page.screenshot({ path: `${output}/adjustment-presets.png`, fullPage: false });

await videoClip.click({ position: { x: 80, y: 16 } });
await library.getByRole("tab", { name: "Efeitos", exact: true }).click();
await library.getByLabel("Buscar recursos").fill("Zoom Burst");
await library.locator("article").filter({ hasText: "Zoom Burst" }).getByRole("button", { name: /Inserir/ }).click();
await inspector.getByRole("tab", { name: "Efeitos", exact: true }).click();
assert(await inspector.getByText("zoom-burst", { exact: true }).isVisible(), "O efeito Zoom Burst não entrou na pilha do clipe");

await videoClip.click({ position: { x: 80, y: 16 } });
await library.getByRole("tab", { name: "Texto", exact: true }).click();
await library.getByLabel("Buscar recursos").fill("Flutuar");
await library.locator("article").filter({ hasText: "Flutuar" }).getByRole("button", { name: /Inserir/ }).click();
await inspector.getByRole("tab", { name: "Animação", exact: true }).click();
await inspector.getByRole("tab", { name: /Loop/ }).click();
assert(await inspector.getByRole("button", { name: "Flutuar", exact: true }).getAttribute("aria-pressed") === "true", "A animação em loop não foi aplicada");
await page.screenshot({ path: `${output}/animation-presets.png`, fullPage: false });

await library.getByRole("tab", { name: "Elementos", exact: true }).click();
await library.getByLabel("Buscar recursos").fill("Inscreva-se");
await library.locator("article").filter({ hasText: "Inscreva-se" }).getByRole("button", { name: /Inserir/ }).click();
const stickerClip = page.locator('[data-track-id="track-overlay"] [data-clip-id*="subscribe"]');
await stickerClip.waitFor({ timeout: 8_000 }).catch(async (error) => { await page.screenshot({ path: `${output}/sticker-failure.png` }); console.error(await page.locator("footer").innerText()); console.error(await library.innerText()); throw error; });
assert(await page.locator('[data-testid="editor-v2-canvas"] canvas').count() > 0, "O sticker vetorial não apareceu no canvas");

await page.getByLabel("Selecionar mídias locais").setInputFiles(`${output}/captions.srt`);
await page.waitForFunction(() => document.querySelectorAll('[data-track-id="track-captions"] [data-clip-id]').length === 2, null, { timeout: 15_000 });
assert(await page.locator('[data-track-id="track-captions"] [data-clip-id]').count() === 2, "O SRT não criou dois clipes sincronizados");
await page.screenshot({ path: `${output}/editor-v2-creative-1440x1000.png`, fullPage: false });
assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "O pacote criativo criou overflow global");

await page.close();
await browser.close();
console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
