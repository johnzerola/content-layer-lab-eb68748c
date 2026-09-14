import { mkdir } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-phase3";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const failures = [];
const consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

async function open(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("http://127.0.0.1:8080/editor-v2", { waitUntil: "domcontentloaded" });
  await page.locator(".editor-v2-shell").waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 20_000 });
  await page.waitForTimeout(150);
  return page;
}

const keyframes = await open();
await keyframes.getByRole("button", { name: "Inserir" }).first().click();
await keyframes.getByRole("button", { name: "Adicionar keyframe de Posição X" }).click();
await keyframes.keyboard.press("Shift+ArrowRight");
await keyframes.keyboard.press("Shift+ArrowRight");
await keyframes.keyboard.press("Shift+ArrowRight");
const xField = keyframes.locator('label:has-text("Posição X") input');
await xField.fill("80");
await xField.press("Enter");
await keyframes.waitForTimeout(120);
assert(await keyframes.locator("[data-keyframe-id]").count() === 2, "Dois keyframes de posição não apareceram na timeline");
await keyframes.keyboard.press("Shift+ArrowLeft");
await keyframes.waitForTimeout(120);
const interpolated = Number(await xField.inputValue());
assert(interpolated > 20 && interpolated < 80, `Interpolação visual não produziu valor intermediário: ${interpolated}`);

const secondPoint = keyframes.locator("[data-keyframe-id]").nth(1);
const pointBox = await secondPoint.boundingBox();
if (pointBox) {
  await keyframes.mouse.move(pointBox.x + pointBox.width / 2, pointBox.y + pointBox.height / 2);
  await keyframes.mouse.down();
  await keyframes.mouse.move(pointBox.x - 52, pointBox.y + pointBox.height / 2, { steps: 5 });
  await keyframes.mouse.up();
  await keyframes.waitForTimeout(120);
  const positionLabels = await keyframes.getByRole("button", { name: /Posição X em/ }).all().then((items) => Promise.all(items.map((item) => item.getAttribute("aria-label"))));
  const movedTime = Number(positionLabels.at(-1)?.match(/em ([\d.]+) segundos/)?.[1]);
  assert(movedTime > 1.5 && movedTime < 2.2, `Arraste do keyframe não atualizou seu tempo local: ${positionLabels.join(", ")}`);
} else failures.push("Não foi possível medir o keyframe para arrastá-lo");

const canvasItem = keyframes.locator('[data-testid="editor-v2-canvas"]:visible [role="button"][tabindex="0"]').first();
await canvasItem.focus();
const beforeNudge = Number(await xField.inputValue());
await keyframes.keyboard.press("ArrowRight");
await keyframes.waitForTimeout(100);
assert(Number(await xField.inputValue()) === beforeNudge + 1, "Seta direita não moveu o item selecionado no canvas");
await keyframes.keyboard.press("Control+z");
assert(Number(await xField.inputValue()) === beforeNudge, "Undo não reverteu o movimento de teclado no canvas");
const rotateHandle = keyframes.getByRole("button", { name: "Girar Social Focus" });
await rotateHandle.focus();
await keyframes.keyboard.press("ArrowRight");
await keyframes.waitForTimeout(80);
assert(Number(await keyframes.locator('label:has-text("Rotação") input').inputValue()) === 1, "Handle de rotação não respondeu ao teclado");
await keyframes.keyboard.press("Control+z");
await keyframes.screenshot({ path: `${output}/editor-v2-phase3-keyframes-1440x1000.png` });
await keyframes.close();

const transitions = await open();
await transitions.getByRole("button", { name: "Inserir" }).first().click();
await transitions.keyboard.press("Shift+ArrowRight");
await transitions.keyboard.press("Shift+ArrowRight");
await transitions.keyboard.press("s");
await transitions.getByRole("button", { name: "Aplicar transição" }).click();
await transitions.waitForTimeout(120);
assert(await transitions.locator("[data-transition-id]").count() === 1, "A transição aplicada não apareceu na timeline");
assert(await transitions.getByRole("button", { name: "Atualizar transição" }).isVisible(), "Inspector não refletiu a transição aplicada");
assert(await transitions.locator('[data-testid="editor-v2-canvas"]:visible [role="button"][tabindex="0"]').count() === 2, "Preview da transição não resolveu os dois clipes na fronteira");
await transitions.keyboard.press("Control+z");
assert(await transitions.locator("[data-transition-id]").count() === 0, "Undo não removeu a transição");
await transitions.keyboard.press("Control+Shift+z");
assert(await transitions.locator("[data-transition-id]").count() === 1, "Redo não restaurou a transição");
await transitions.screenshot({ path: `${output}/editor-v2-phase3-transition-1440x1000.png` });
await transitions.close();

const mobile = await open({ width: 430, height: 932 });
await mobile.getByRole("button", { name: /Biblioteca/ }).click();
await mobile.getByRole("button", { name: "Inserir" }).first().click();
await mobile.getByRole("button", { name: /Inspector/ }).click();
assert(await mobile.getByRole("heading", { name: "Keyframes" }).isVisible(), "Keyframes não ficaram acessíveis no inspector mobile");
assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "A Fase 3 criou overflow horizontal no mobile");
await mobile.screenshot({ path: `${output}/editor-v2-phase3-430x932.png` });
await mobile.close();

await browser.close();
console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
