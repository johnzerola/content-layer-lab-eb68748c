import { mkdir } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-phase1";
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
  return page;
}

const desktop = await open({ width: 1440, height: 1000 });
assert(await desktop.getByRole("heading", { name: "Biblioteca" }).isVisible(), "Biblioteca não apareceu no desktop");
assert(await desktop.getByLabel("Timeline multitrack").isVisible(), "Timeline não apareceu no desktop");
assert((await desktop.locator('[role="separator"]').count()) >= 3, "Painéis redimensionáveis não apareceram");

await desktop.locator('section[aria-label="Biblioteca do Editor V2"]:visible article').first().dragTo(desktop.locator('[data-testid="editor-v2-canvas"]:visible'));
assert(await desktop.getByRole("button", { name: /Social Focus, selecionado/ }).isVisible(), "Inserção não chegou ao canvas selecionado");
assert(await desktop.getByText("Social Focus", { exact: true }).count() >= 2, "Seleção não chegou ao inspector/timeline");

const xField = desktop.locator('label:has-text("Posição X") input');
if (await xField.count() === 0) {
  console.log(JSON.stringify({ body: (await desktop.locator("body").innerText()).slice(0, 6000), consoleErrors }, null, 2));
  await desktop.screenshot({ path: `${output}/debug-no-inspector.png` });
  await browser.close();
  process.exit(1);
}
await xField.fill("35");
await xField.press("Enter");
assert((await xField.inputValue()) === "35", "Inspector não atualizou a posição");
await desktop.getByRole("heading", { name: "Inspector" }).click();
await desktop.keyboard.press("Control+z");
await desktop.waitForTimeout(100);
assert((await desktop.locator('label:has-text("Posição X") input').inputValue()) === "50", "Undo não restaurou propriedade visual");
await desktop.keyboard.press("Control+Shift+z");
await desktop.waitForTimeout(80);
assert((await desktop.locator('label:has-text("Posição X") input').inputValue()) === "35", "Redo não reaplicou propriedade visual");

const trimEnd = desktop.getByRole("button", { name: "Aparar fim de Social Focus" });
const trimBox = await trimEnd.boundingBox();
if (trimBox) {
  await desktop.mouse.move(trimBox.x + trimBox.width / 2, trimBox.y + trimBox.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(trimBox.x - 45, trimBox.y + trimBox.height / 2, { steps: 4 });
  await desktop.mouse.up();
  await desktop.waitForTimeout(80);
  assert(await desktop.getByRole("button", { name: /Social Focus, de 00:00:00 até 00:05/ }).count() > 0, "Trim visual não atualizou a duração na timeline");
  await desktop.keyboard.press("Control+z");
}

await desktop.getByRole("tab", { name: "Texto" }).click();
await desktop.getByRole("button", { name: "Inserir" }).first().click();
const canvasItems = desktop.locator('[data-testid="editor-v2-canvas"]:visible [role="button"][tabindex="0"]');
await desktop.waitForTimeout(200);
if (await canvasItems.count() !== 2) console.log(JSON.stringify({ stage: "second-item", body: (await desktop.locator("body").innerText()).slice(-2500) }, null, 2));
assert((await canvasItems.count()) === 2, "Segundo item não chegou ao canvas");
await canvasItems.first().focus();
await desktop.keyboard.press("Shift+Enter");
await desktop.waitForTimeout(80);
assert((await desktop.locator('[data-testid="editor-v2-canvas"]:visible [aria-label$=", selecionado"]').count()) === 2, "Seleção múltipla não foi compartilhada pelo canvas");

await desktop.keyboard.press("Delete");
await desktop.waitForTimeout(80);
assert((await canvasItems.count()) === 0, "Delete não removeu a seleção múltipla");
await desktop.keyboard.press("Control+z");
await desktop.waitForTimeout(80);
assert((await canvasItems.count()) === 2, "Undo não restaurou exclusão múltipla");

await desktop.getByLabel("Reproduzir").click();
await desktop.waitForTimeout(180);
assert(await desktop.getByLabel("Pausar").isVisible(), "Playback não iniciou");
await desktop.keyboard.press("Space");
assert(await desktop.getByLabel("Reproduzir").isVisible(), "Space não pausou playback");

const separator = desktop.locator('[role="separator"]').first();
const before = await separator.boundingBox();
if (before) {
  await desktop.mouse.move(before.x + 1, before.y + before.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(before.x + 45, before.y + before.height / 2, { steps: 5 });
  await desktop.mouse.up();
  const after = await separator.boundingBox();
  assert(Boolean(after && Math.abs(after.x - before.x) > 10), "Redimensionamento do painel não alterou a divisão");
}

await desktop.screenshot({ path: `${output}/editor-v2-1440x1000.png` });

for (const [name, width, height] of [["1920x1080", 1920, 1080], ["1366x768", 1366, 768]]) {
  const page = await open({ width, height });
  await page.getByRole("button", { name: "Inserir" }).first().click();
  assert(await page.getByLabel("Timeline multitrack").isVisible(), `Timeline ausente em ${name}`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow horizontal em ${name}`);
  await page.screenshot({ path: `${output}/editor-v2-${name}.png` });
  await page.close();
}

const mobile = await open({ width: 430, height: 932 });
assert(await mobile.getByRole("button", { name: /Biblioteca/ }).isVisible(), "Navegação móvel não apareceu");
await mobile.getByRole("button", { name: /Biblioteca/ }).click();
await mobile.getByRole("button", { name: "Inserir" }).first().click();
assert(await mobile.locator('section[aria-label="Prévia do vídeo"]:visible').isVisible(), "Inserção móvel não retornou à prévia");
await mobile.getByRole("button", { name: /Timeline/ }).click();
assert(await mobile.locator('section[aria-label="Timeline multitrack"]:visible').isVisible(), "Timeline móvel não abriu");
assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Overflow horizontal no mobile");
await mobile.screenshot({ path: `${output}/editor-v2-430x932.png` });
await mobile.close();

await desktop.close();
await browser.close();
console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
