import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-audio-source";
const fixture = `${output}/video-with-audio.mp4`;
const baseUrl = process.env.EDITOR_V2_URL ?? "http://127.0.0.1:5173/editor-v2";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.goto(baseUrl, { waitUntil: "commit", timeout: 90_000 });
await page.locator(".editor-v2-shell").waitFor({ timeout: 90_000 });
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 90_000 });
await page.getByLabel("Selecionar mídias locais").setInputFiles(fixture);
const videoTrack = page.locator('[data-track-id="track-video"]');
try {
  await videoTrack.locator('[data-clip-id]').waitFor({ timeout: 30_000 });
} catch (error) {
  await page.screenshot({ path: `${output}/import-failure.png`, fullPage: true });
  const status = await page.locator("body").innerText().catch(() => "DOM indisponível");
  throw new Error(`O vídeo não entrou na timeline. Estado da página: ${status.slice(-1200)}`, { cause: error });
}
await videoTrack.locator('[data-clip-id]').click({ position: { x: 40, y: 18 } });
const inspector = page.locator('aside[aria-label="Inspector de propriedades"]:visible');
await inspector.getByText("Áudio da mídia", { exact: true }).waitFor();
assert(await inspector.getByRole("button", { name: "No vídeo" }).getAttribute("aria-pressed") === "true", "O áudio embutido não iniciou como representação ativa");
assert(await inspector.getByRole("button", { name: "Extraído" }).isDisabled(), "A opção extraída foi habilitada antes de existir");
assert(await inspector.getByText("Som do vídeo", { exact: true }).isVisible(), "O vídeo selecionado não mostrou volume e mute");
assert(await inspector.getByRole("button", { name: "Separar diálogo e música" }).isEnabled(), "A ação de separação não ficou disponível para o vídeo selecionado");
assert(await inspector.getByRole("button", { name: "Restaurar áudio original" }).count() === 0, "A restauração apareceu antes de existirem stems");
await page.locator("audio").waitFor({ state: "attached" });
assert(await page.locator("audio").count() === 1, "O vídeo importado não possui exatamente um monitor de áudio");
const embeddedUrl = await page.locator("audio").getAttribute("src");

await inspector.getByRole("button", { name: "Extrair áudio completo" }).click();
const voiceTrack = page.locator('[data-track-id="track-voice"]');
await voiceTrack.locator('[data-clip-id]').waitFor({ timeout: 30_000 });
await voiceTrack.locator('[data-waveform-state="ready"]').waitFor({ timeout: 15_000 });
await inspector.getByRole("button", { name: "Extraído" }).waitFor();
assert(await inspector.getByRole("button", { name: "Extraído" }).getAttribute("aria-pressed") === "true", "A extração não ativou a representação extraída");
assert(await inspector.getByRole("button", { name: "Separar diálogo e música" }).isEnabled(), "A ação de separação desapareceu após extrair o áudio");
assert(await page.locator("audio").count() === 1, "A extração criou reprodução duplicada");
const extractedUrl = await page.locator("audio").getAttribute("src");
assert(Boolean(extractedUrl && embeddedUrl && extractedUrl !== embeddedUrl), "O monitor não mudou do vídeo para o WAV extraído");
const extractedBytes = await page.evaluate(async () => {
  const source = document.querySelector("audio")?.getAttribute("src");
  if (!source) return [];
  return [...new Uint8Array(await (await fetch(source)).arrayBuffer())];
});
const relinkFixture = `${output}/extracted-relink.wav`;
await writeFile(relinkFixture, new Uint8Array(extractedBytes));

await page.waitForTimeout(500);
await page.reload({ waitUntil: "commit", timeout: 90_000 });
await page.locator(".editor-v2-shell").waitFor({ timeout: 90_000 });
const restoredInspector = page.locator('aside[aria-label="Inspector de propriedades"]:visible');
await restoredInspector.getByRole("button", { name: "Extraído" }).waitFor({ timeout: 30_000 });
assert(await restoredInspector.getByRole("button", { name: "Extraído" }).getAttribute("aria-pressed") === "true", "Reload não preservou a representação extraída");
await page.locator('[data-track-id="track-voice"] [data-waveform-state="ready"]').waitFor({ timeout: 30_000 });
assert(await page.locator("audio").count() === 1, "Reload criou monitor de áudio duplicado");

await page.evaluate(async () => {
  const raw = localStorage.getItem("vaiviral.editor-v2.project.editor-v2-local");
  const project = raw ? JSON.parse(raw) : null;
  const extracted = project?.assets?.find((asset) => asset.kind === "audio" && asset.sourceAudio);
  if (!extracted) throw new Error("Asset extraído não encontrado no projeto persistido");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("vaiviral-media", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("sources", "readwrite");
    tx.objectStore("sources").delete(`editor-v2-media:editor-v2-local:${extracted.id}`);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
});
await page.reload({ waitUntil: "commit", timeout: 90_000 });
await page.locator(".editor-v2-shell").waitFor({ timeout: 90_000 });
const missingInspector = page.locator('aside[aria-label="Inspector de propriedades"]:visible');
await missingInspector.getByText("Arquivo ausente", { exact: true }).waitFor({ timeout: 30_000 });
await missingInspector.getByRole("button", { name: "Religar arquivo" }).click();
await page.getByLabel("Religar arquivo de mídia").setInputFiles(relinkFixture);
await missingInspector.getByText("Arquivo ausente", { exact: true }).waitFor({ state: "detached", timeout: 30_000 });
assert(await page.locator("audio").count() === 1, "Relink criou monitor de áudio duplicado");

await missingInspector.getByRole("button", { name: "No vídeo" }).click();
assert(await missingInspector.getByRole("button", { name: "No vídeo" }).getAttribute("aria-pressed") === "true", "Não foi possível restaurar o áudio embutido");
assert(await page.locator("audio").count() === 1, "Restaurar o áudio embutido duplicou o monitor");
await page.screenshot({ path: `${output}/audio-source-1440x1000.png` });

await page.close();
await browser.close();
console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors, evidence: { embeddedUrlKind: embeddedUrl?.split(":")[0], extractedUrlKind: extractedUrl?.split(":")[0] } }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;
