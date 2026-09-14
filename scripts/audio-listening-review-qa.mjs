import { chromium } from "file:///C:/Users/DINO/AppData/Local/OpenAI/Codex/runtimes/cua_node/a708e72b10c27b59/bin/node_modules/playwright/index.mjs";

const baseUrl = process.env.AUDIO_REVIEW_URL ?? "http://127.0.0.1:8765/output/audio-separation/aud04-b0-b2-listening-review.html";
const expectedMonitors = Number(process.env.AUDIO_REVIEW_MONITORS ?? 10);
const screenshot = process.env.AUDIO_REVIEW_SCREENSHOT ?? "output/audio-separation/aud04-b0-b2-listening-review.png";
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const consoleErrors = [];
const failedResponses = [];
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", error => consoleErrors.push(error.message));
page.on("response", response => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
const monitors = page.locator(".monitor");
const actualMonitors = await monitors.count();
if (actualMonitors !== expectedMonitors) failures.push(`O comparador expôs ${actualMonitors} monitores; esperado: ${expectedMonitors}`);
for (let index = 0; index < actualMonitors; index += 1) {
  await monitors.nth(index).click();
  await page.waitForTimeout(150);
  const source = await page.locator("audio").getAttribute("src");
  const expected = await monitors.nth(index).getAttribute("data-src");
  if (source !== expected) failures.push(`Monitor ${index} não selecionou ${expected}`);
  if (await monitors.nth(index).getAttribute("aria-pressed") !== "true") failures.push(`Monitor ${index} não anunciou seleção`);
}
await page.locator("#play").click();
await page.waitForTimeout(400);
await page.locator("#play").click();
const seekBox = await page.locator("#seek").boundingBox();
if (!seekBox) failures.push("Controle de seek não possui geometria visível");
else {
  const maximum = Number(await page.locator("#seek").getAttribute("max"));
  await page.locator("#seek").click({ position: { x: seekBox.width * (2 / maximum), y: seekBox.height / 2 } });
}
await page.waitForTimeout(300);
const currentTime = await page.locator("audio").evaluate(audio => audio.currentTime);
const seekDebug = await page.evaluate(() => {
  const audio = document.querySelector("audio");
  return { value: document.querySelector("#seek")?.value, duration: audio?.duration, readyState: audio?.readyState, seekable: audio?.seekable?.length ? [audio.seekable.start(0), audio.seekable.end(0)] : [] };
});
if (Math.abs(currentTime - 2) > 0.2) failures.push(`Seek não preservou a posição sincronizada (tempo=${currentTime}, estado=${JSON.stringify(seekDebug)})`);
await page.screenshot({ path: screenshot, fullPage: true });
await browser.close();

if (consoleErrors.length) failures.push(`Erros de console: ${consoleErrors.join(" | ")}`);
if (failedResponses.length) failures.push(`Recursos HTTP falharam: ${failedResponses.join(" | ")}`);
const report = { passed: failures.length === 0, failures, consoleErrors, failedResponses, monitors: actualMonitors, screenshot };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
