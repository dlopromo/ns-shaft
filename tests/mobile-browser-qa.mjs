import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.TEST_URL ?? "http://127.0.0.1:5173/?qa=1";
const output = new URL("../artifacts/qa/mobile/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const [name, viewport] of Object.entries({
  "portrait-360": { width: 360, height: 640 },
  "portrait-390": { width: 390, height: 844 },
  "portrait-430": { width: 430, height: 932 },
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
      desktopMenuVisible: getComputedStyle(document.querySelector(".main-menu")).display !== "none",
      languageCentered: Math.abs((box(".mobile-language").left + box(".mobile-language").right) / 2 - innerWidth / 2),
      languageIsLast: document.querySelector(".mobile-language").compareDocumentPosition(
        document.querySelector("#mobile-title-menu button:last-of-type")
      ) === Node.DOCUMENT_POSITION_PRECEDING
    };
  });
  const portraitLanguageFailure = viewport.width < viewport.height && title.languageCentered > 2;
  if (!title.state.mobile.active || title.desktopMenuVisible || title.language.width < 120 ||
      title.frame.left < 0 || title.frame.right > viewport.width || title.frame.bottom > viewport.height ||
      title.menu.right > viewport.width || portraitLanguageFailure || !title.languageIsLast) {
    throw new Error(`${name} title layout failed: ${JSON.stringify(title)}`);
  }
  await page.screenshot({ path: new URL(`${name}-title.png`, output).pathname, fullPage: true });

  await page.locator("#mobile-title-menu [data-open='options']").click();
  for (const locale of ["ja", "zh-Hant", "en"]) {
    await page.locator("#mobile-locale").selectOption(locale, { force: true });
    const dialog = await page.locator("#options-panel").evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      const content = panel.querySelector(".dialog");
      panel.scrollTop = panel.scrollHeight;
      const close = panel.querySelector("[data-close]").getBoundingClientRect();
      const context = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      const gesture = new Event("gesturestart", { bubbles: true, cancelable: true });
      const doubleTap = new MouseEvent("dblclick", { bubbles: true, cancelable: true });
      content.dispatchEvent(context);
      content.dispatchEvent(gesture);
      content.dispatchEvent(doubleTap);
      return {
        width: rect.width,
        height: rect.height,
        overflowY: getComputedStyle(panel).overflowY,
        closeVisible: close.bottom <= rect.bottom + 1,
        contextPrevented: context.defaultPrevented,
        gesturePrevented: gesture.defaultPrevented,
        doubleTapPrevented: doubleTap.defaultPrevented,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        background: getComputedStyle(panel).backgroundColor
      };
    });
    if (Math.round(dialog.width) !== viewport.width || Math.round(dialog.height) !== viewport.height ||
        !["auto", "scroll"].includes(dialog.overflowY) || !dialog.closeVisible || !dialog.contextPrevented ||
        !dialog.gesturePrevented || !dialog.doubleTapPrevented || dialog.horizontalOverflow > 1 ||
        dialog.background !== "rgb(212, 208, 200)") {
      throw new Error(`${name}/${locale} dialog layout failed: ${JSON.stringify(dialog)}`);
    }
    if (name === "portrait-430" && locale === "ja") {
      await page.screenshot({ path: new URL(`${name}-options-ja.png`, output).pathname, fullPage: true });
    }
  }
  await page.locator("#options-panel [data-close]").click();

  await page.locator("#mobile-title-menu [data-start='1']").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mobile.controlsVisible);
  const controls = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const left = box("#mobile-left");
    const right = box("#mobile-right");
    const directions = box("#mobile-directions");
    const actions = box(".mobile-actions");
    return {
      state: JSON.parse(window.render_game_to_text()),
      top: document.querySelector(".mobile-controls").getBoundingClientRect().top,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      shellBackground: getComputedStyle(document.querySelector(".mobile-shell")).backgroundColor,
      viewport: { width: visualViewport?.width ?? innerWidth, height: visualViewport?.height ?? innerHeight, scale: visualViewport?.scale ?? 1 },
      directions: { left: directions.left, right: directions.right, top: directions.top, bottom: directions.bottom, width: directions.width },
      actions: { top: actions.top, bottom: actions.bottom },
      actionTextClipped: [...document.querySelectorAll(".mobile-actions button")]
        .some((button) => button.scrollWidth > button.clientWidth + 1),
      left: { left: left.left, width: left.width, height: left.height },
      right: { right: right.right, width: right.width, height: right.height }
    };
  });
  const portraitControlFailure = viewport.width < viewport.height &&
    (controls.left.width < viewport.width * 0.4 || controls.right.width < viewport.width * 0.4 ||
      controls.left.height !== 96 || controls.right.height !== 96 || controls.actions.top < controls.directions.bottom);
  const landscapeControlFailure = viewport.width >= viewport.height &&
    Math.abs(controls.left.width - controls.right.width) > 2;
  if (controls.state.mobile.primaryAction !== "pause" || controls.left.left > 32 ||
      viewport.width - controls.right.right > 32 || portraitControlFailure || landscapeControlFailure ||
      controls.actionTextClipped || controls.viewport.scale !== 1 ||
      controls.state.mobile.viewport.width !== controls.viewport.width ||
      controls.state.mobile.viewport.height !== controls.viewport.height) {
    throw new Error(`${name} controls failed: ${JSON.stringify(controls)}`);
  }
  if (controls.bodyBackground !== "rgb(9, 10, 12)" || controls.shellBackground !== "rgb(21, 23, 26)") {
    throw new Error(`${name} mobile palette failed: ${JSON.stringify(controls)}`);
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

  await page.evaluate(() => window.__nsShaftQa.startCoop());
  await page.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("countdown", 2000));
  await page.waitForFunction(() => document.querySelector(".game-frame .online-state")?.dataset.countdown === "true");
  const coop = await page.evaluate(() => {
    const canvas = document.querySelector("#game").getBoundingClientRect();
    const dialog = document.querySelector(".game-frame .online-state-dialog").getBoundingClientRect();
    const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    return { canvas: center(canvas), dialog: center(dialog) };
  });
  if (Math.abs(coop.canvas.x - coop.dialog.x) > 2 || Math.abs(coop.canvas.y - coop.dialog.y) > 2) {
    throw new Error(`${name} co-op center failed: ${JSON.stringify(coop)}`);
  }

  await page.evaluate(() => window.__nsShaftQa.startRace());
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ui === "race");
  const race = await page.evaluate(() => {
    const local = document.querySelector(".race-pane-local").getBoundingClientRect();
    const remote = document.querySelector(".race-pane-remote").getBoundingClientRect();
    const remoteCanvas = document.querySelector(".race-pane-remote .race-canvas").getBoundingClientRect();
    const controls = document.querySelector(".mobile-controls").getBoundingClientRect();
    return { local: { left: local.left, right: local.right, top: local.top, bottom: local.bottom },
      remote: { left: remote.left, right: remote.right, top: remote.top, bottom: remote.bottom },
      remoteCanvas: { width: remoteCanvas.width, height: remoteCanvas.height },
      controlsTop: controls.top };
  });
  const raceIsOrdered = viewport.width < viewport.height
    ? race.remote.top >= race.local.bottom
    : race.remote.left >= race.local.right && race.remote.right <= viewport.width;
  if (!raceIsOrdered) throw new Error(`${name} race layout failed: ${JSON.stringify(race)}`);
  const remoteAspectError = Math.abs(race.remoteCanvas.width / race.remoteCanvas.height - 634 / 436) / (634 / 436);
  const portraitGeometryFailed = viewport.width < viewport.height &&
    (race.remote.bottom > race.controlsTop || Math.abs(race.controlsTop - controls.top) > 2);
  if (remoteAspectError >= 0.005 || race.remote.bottom > viewport.height || portraitGeometryFailed) {
    throw new Error(`${name} race geometry failed: ${JSON.stringify({ race, controls, remoteAspectError })}`);
  }

  await page.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("countdown", 2000));
  await page.waitForFunction(() => document.querySelector(".online-state")?.dataset.countdown === "true");
  const countdown = await page.evaluate(() => {
    const canvas = document.querySelector(".race-pane-local .race-canvas").getBoundingClientRect();
    const dialog = document.querySelector(".race-pane-local .online-state-dialog").getBoundingClientRect();
    const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    return { canvas: center(canvas), dialog: center(dialog) };
  });
  if (Math.abs(countdown.canvas.x - countdown.dialog.x) > 2 || Math.abs(countdown.canvas.y - countdown.dialog.y) > 2) {
    throw new Error(`${name} countdown center failed: ${JSON.stringify(countdown)}`);
  }

  await page.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("results", 2000));
  await page.waitForFunction(() => !document.querySelector(".race-pane-local .online-state")?.hidden);
  const results = await page.evaluate(() => {
    const canvas = document.querySelector(".race-pane-local .race-canvas").getBoundingClientRect();
    const dialog = document.querySelector(".race-pane-local .online-state-dialog").getBoundingClientRect();
    const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    return { canvas: center(canvas), dialog: center(dialog) };
  });
  if (Math.abs(results.canvas.x - results.dialog.x) > 2 || Math.abs(results.canvas.y - results.dialog.y) > 2) {
    throw new Error(`${name} results center failed: ${JSON.stringify(results)}`);
  }
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
console.log("Mobile browser QA passed: 360x640, 390x844, 430x932, 844x390");
