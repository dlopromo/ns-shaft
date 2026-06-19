import { chromium, firefox, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const output = new URL("../artifacts/qa/cross-browser/", import.meta.url);
await mkdir(output, { recursive: true });
const report = [];

for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: "ja-JP" });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/?qa=1", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "１人プレイ" }).click();
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.mode === "playing";
  }, undefined, { timeout: 3000 });
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const geometry = await page.locator("#game").evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    cssWidth: canvas.getBoundingClientRect().width,
    cssHeight: canvas.getBoundingClientRect().height
  }));
  if (state.mode !== "playing" || geometry.width !== 634 || geometry.height !== 436 ||
      geometry.cssWidth !== 634 || geometry.cssHeight !== 436 || errors.length) {
    throw new Error(`${name} failed: ${JSON.stringify({ state, geometry, errors })}`);
  }
  const screenshot = new URL(`${name}.png`, output);
  await page.screenshot({ path: screenshot.pathname });
  report.push({ name, geometry, mode: state.mode, screenshot: screenshot.pathname, errors });
  await browser.close();
}

await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
