import { mkdir } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-phase4";
const baseUrl = process.env.EDITOR_V2_URL ?? "http://127.0.0.1:5173/editor-v2";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const failures = [];
const consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

async function open(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".editor-v2-shell").waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 20_000 });
  await page.waitForTimeout(150);
  return page;
}

const templatePage = await open();
const templateLibrary = templatePage.locator('section[aria-label="Biblioteca do Editor V2"]:visible');
assert(await templateLibrary.locator("[data-template-preview]").count() === 4, "A biblioteca não mostrou os quatro previews reais de template");
await templateLibrary.locator("article").filter({ hasText: "Social Focus" }).getByRole("button", { name: /Inserir/ }).click();
await templatePage.waitForTimeout(150);
assert(await templatePage.locator('[data-testid="editor-v2-canvas"]:visible > [role="button"]').count() === 3, "Social Focus não foi aplicado como três camadas editáveis");
assert((await templatePage.locator("footer").innerText()).includes("3 camadas"), "O feedback não confirmou a aplicação do template");
await templatePage.screenshot({ path: `${output}/editor-v2-phase4-template-1440x1000.png` });
await templatePage.keyboard.press("Control+z");
assert(await templatePage.locator('[data-testid="editor-v2-canvas"]:visible > [role="button"]').count() === 0, "Undo não removeu o template completo em uma ação");
await templatePage.close();

const captions = await open();
const captionLibrary = captions.locator('section[aria-label="Biblioteca do Editor V2"]:visible');
await captionLibrary.getByRole("tab", { name: "Legendas" }).click();
await captions.waitForTimeout(300);
const captionCardNames = await captionLibrary.locator("article").allInnerTexts();
assert(captionCardNames.some((name) => name.includes("Word Highlight")), `Categoria de legendas não renderizou os presets: ${captionCardNames.join(" | ")}`);
const wordHighlight = captionLibrary.locator("article").filter({ hasText: "Word Highlight" });
await wordHighlight.getByText("Inserir", { exact: true }).click();
await captions.waitForTimeout(120);
assert(await captions.locator("[data-caption-cue-id]:visible").count() === 1, "A legenda não gerou um cue renderizável");
assert(await captions.locator("[data-caption-word-active]:visible").count() === 4, "A legenda não preservou palavras temporizadas");
assert(await captions.locator('[data-caption-word-active="true"]:visible').count() === 1, "O preview não marcou a palavra ativa");
await captionLibrary.locator("article").filter({ hasText: "Karaoke" }).getByText("Inserir", { exact: true }).click();
await captions.waitForTimeout(100);
assert((await captions.locator("footer").innerText()).includes("aplicado à legenda"), "Inserir um preset com legenda selecionada não o aplicou à legenda existente");
const content = captions.locator('label:has-text("Conteúdo") textarea');
await content.fill("NARRAÇÃO COM CLAREZA");
await content.blur();
await captions.waitForTimeout(100);
assert(await captions.locator("[data-caption-word-active]:visible").count() === 3, "Editar o cue não recalculou suas palavras");
await captions.screenshot({ path: `${output}/editor-v2-phase4-caption-1440x1000.png` });
await captions.close();

const mobile = await open({ width: 430, height: 932 });
await mobile.getByRole("button", { name: /Biblioteca/ }).click();
const mobileLibrary = mobile.locator('section[aria-label="Biblioteca do Editor V2"]:visible');
await mobileLibrary.getByRole("tab", { name: "Legendas" }).click();
assert(await mobileLibrary.locator("article").count() === 8, "Os presets de legenda não ficaram acessíveis no mobile");
assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "A Fase 4 criou overflow horizontal no mobile");
await mobile.screenshot({ path: `${output}/editor-v2-phase4-mobile-430x932.png` });
await mobile.close();

await browser.close();
console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
