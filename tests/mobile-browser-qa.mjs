import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.TEST_URL ?? "http://127.0.0.1:5173/?qa=1";
const output = new URL("../artifacts/qa/mobile/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const [name, viewport] of Object.entries({
  "portrait-360": { width: 360, height: 640 },
  "portrait-390": { width: 390, height: 844 },
  "landscape-844": { width: 844, height: 390 }
})) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, locale: "en-US" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const title = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      state: JSON.parse(window.render_game_to_text()),
      frame: box(".game-frame"),
      menu: box("#mobile-title-menu"),
      language: box("#mobile-locale"),
      desktopMenuVisible: getComputedStyle(document.querySelector(".main-menu")).display !== "none"
    };
  });
  if (!title.state.mobile.active || title.desktopMenuVisible || title.language.width < 120 ||
      title.frame.left < 0 || title.frame.right > viewport.width || title.frame.bottom > viewport.height ||
      title.menu.right > viewport.width) {
    throw new Error(`${name} title layout failed: ${JSON.stringify(title)}`);
  }
  await page.screenshot({ path: new URL(`${name}-title.png`, output).pathname, fullPage: true });

  await page.locator("#mobile-title-menu [data-open='options']").click();
  const dialog = await page.locator("#options-panel").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return { width: rect.width, height: rect.height, overflowY: getComputedStyle(panel).overflowY };
  });
  if (Math.round(dialog.width) !== viewport.width || Math.round(dialog.height) !== viewport.height ||
      !["auto", "scroll"].includes(dialog.overflowY)) {
    throw new Error(`${name} dialog layout failed: ${JSON.stringify(dialog)}`);
  }
  await page.locator("#options-panel [data-close]").click();

  await page.locator("#mobile-title-menu [data-start='1']").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mobile.controlsVisible);
  const controls = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const left = box("#mobile-left");
    const right = box("#mobile-right");
    return {
      state: JSON.parse(window.render_game_to_text()),
      left: { left: left.left, width: left.width, height: left.height },
      right: { right: right.right, width: right.width, height: right.height }
    };
  });
  if (controls.state.mobile.primaryAction !== "pause" || controls.left.left > 32 ||
      viewport.width - controls.right.right > 32 || controls.left.width < 44 || controls.right.width < 44) {
    throw new Error(`${name} controls failed: ${JSON.stringify(controls)}`);
  }
  await page.screenshot({ path: new URL(`${name}-controls.png`, output).pathname, fullPage: true });

  await page.locator("#mobile-left").dispatchEvent("pointerdown", { pointerId: 71, pointerType: "touch" });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mobile.direction === "left");
  await page.locator("#mobile-primary").click();
  await page.waitForFunction(() => {
    const mobile = JSON.parse(window.render_game_to_text()).mobile;
    return mobile.primaryAction === "resume" && mobile.direction === "neutral";
  });
  await page.locator("#mobile-primary").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mobile.primaryAction === "pause");

  await page.evaluate(() => window.__nsShaftQa.startRace());
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ui === "race");
  const race = await page.evaluate(() => {
    const local = document.querySelector(".race-pane-local").getBoundingClientRect();
    const remote = document.querySelector(".race-pane-remote").getBoundingClientRect();
    return { local: { left: local.left, right: local.right, top: local.top, bottom: local.bottom },
      remote: { left: remote.left, right: remote.right, top: remote.top, bottom: remote.bottom } };
  });
  const raceIsOrdered = viewport.width < viewport.height
    ? race.remote.top >= race.local.bottom
    : race.remote.left >= race.local.right && race.remote.right <= viewport.width;
  if (!raceIsOrdered) throw new Error(`${name} race layout failed: ${JSON.stringify(race)}`);
  await page.locator("#mobile-abort").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ui === "title");

  await page.locator("#mobile-title-menu [data-start='1']").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mobile.primaryAction === "pause");

  await page.evaluate(() => {
    window.__nsShaftQa.setPlayer(0, { y: 500, health: 0 });
    window.advanceTime(20);
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mobile.primaryAction === "retry");
  await page.locator("#mobile-primary").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mobile.primaryAction === "pause");
  await page.locator("#mobile-abort").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ui === "title");

  if (errors.length) throw new Error(`${name} browser errors: ${JSON.stringify(errors)}`);
  await context.close();
}

await browser.close();
console.log("Mobile browser QA passed: 360x640, 390x844, 844x390");
