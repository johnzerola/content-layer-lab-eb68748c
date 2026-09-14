import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const output = "output/playwright/editor-v2-phase5";
const fixture = `${output}/voice-music-fixture.wav`;
const baseUrl = process.env.EDITOR_V2_URL ?? "http://127.0.0.1:5173/editor-v2";
await mkdir(output, { recursive: true });
await writeFile(fixture, makeWav(2, 44_100));
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const consoleErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.locator(".editor-v2-shell").waitFor({ timeout: 20_000 });
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => Object.keys(button).some((key) => key.startsWith("__reactProps"))), null, { timeout: 20_000 });

const started = performance.now();
await page.getByLabel("Selecionar mídias locais").setInputFiles(fixture);
const musicTrack = page.locator('[data-track-id="track-music"]');
await musicTrack.locator('[data-clip-id]').waitFor({ timeout: 15_000 });
await musicTrack.locator('[data-waveform-state="ready"]').waitFor({ timeout: 15_000 });
const waveformReadyMs = performance.now() - started;
assert(await musicTrack.locator('[data-waveform-state="ready"] i').count() > 40, "A waveform real não apareceu na timeline");
await musicTrack.locator('[data-clip-id]').click({ position: { x: 40, y: 18 } });
const inspector = page.locator('aside[aria-label="Inspector de propriedades"]:visible');
assert(await inspector.getByText("Mix do clipe", { exact: true }).isVisible(), "O inspector não abriu os controles de áudio");
const volume = inspector.locator('label').filter({ hasText: /^Volume(?! da faixa)/ }).locator('input[type="range"]');
await volume.fill("0.55");
assert(await inspector.getByText("55%", { exact: true }).isVisible(), "O ganho do clipe não atualizou");
await inspector.getByRole("button", { name: /Adicionar ponto em/ }).click();
assert((await inspector.getByText("1 pontos", { exact: true }).count()) === 1, "O envelope de volume não recebeu um ponto");
await inspector.getByLabel("Baixar música durante a narração").uncheck();
assert(!(await inspector.getByLabel("Baixar música durante a narração").isChecked()), "O ducking não pôde ser desligado");
await page.getByRole("button", { name: "Ouvir somente Música" }).click();
assert(await page.getByRole("button", { name: "Desativar solo de Música" }).isVisible(), "O solo da trilha não foi ativado");
await page.getByRole("button", { name: "Reproduzir" }).click();
await page.waitForTimeout(250);
assert(await page.locator("audio").count() === 1, "A reprodução não criou o elemento de áudio sincronizado");
assert(await page.locator("audio").evaluate((audio) => !(audio).paused), "O áudio não iniciou com o relógio do projeto");
await page.getByRole("button", { name: "Pausar" }).click();
await page.screenshot({ path: `${output}/editor-v2-phase5-audio-1440x1000.png` });
const warmStarted = performance.now();
await page.getByLabel("Selecionar mídias locais").setInputFiles(fixture);
await page.waitForFunction(() => document.querySelectorAll('[data-track-id="track-music"] [data-waveform-state="ready"]').length === 2, null, { timeout: 15_000 });
const waveformWarmMs = performance.now() - warmStarted;
assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "A Fase 5 criou overflow global");
await page.close();
await browser.close();
console.log(JSON.stringify({ passed: failures.length === 0 && consoleErrors.length === 0, failures, consoleErrors, metrics: { waveformColdMs: Math.round(waveformReadyMs), waveformWarmMs: Math.round(waveformWarmMs) } }, null, 2));
if (failures.length || consoleErrors.length) process.exitCode = 1;

function makeWav(seconds, sampleRate) {
  const samples = seconds * sampleRate;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const voice = Math.sin(2 * Math.PI * 220 * time) * .45;
    const music = Math.sin(2 * Math.PI * 440 * time) * (index % 12_000 < 6_000 ? .22 : .08);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((voice + music) * 32767))), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
