import { chromium } from "playwright";
import { cp, mkdir, writeFile } from "node:fs/promises";

const output = new URL("../artifacts/qa/current/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: "ja-JP" });
const errors = [];
const captures = [];
let state;
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

async function capture(name) {
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const path = new URL(`${name}.png`, output).pathname;
  await page.screenshot({ path });
  captures.push({ name, path: `artifacts/qa/current/${name}.png`, state });
  return state;
}

await page.goto("http://127.0.0.1:5173/?qa=1", { waitUntil: "networkidle" });
const canvasGeometry = await page.locator("#game").evaluate((canvas) => ({
  width: canvas.width,
  height: canvas.height,
  cssWidth: canvas.getBoundingClientRect().width,
  cssHeight: canvas.getBoundingClientRect().height,
  left: Math.round(canvas.getBoundingClientRect().left),
  top: Math.round(canvas.getBoundingClientRect().top)
}));
if (JSON.stringify(canvasGeometry) !== JSON.stringify({
  width: 634, height: 436, cssWidth: 634, cssHeight: 436,
  left: 133, top: 132
})) {
  throw new Error(`Canvas is not native size and centered: ${JSON.stringify(canvasGeometry)}`);
}
await capture("01-title-native");
const menuGeometry = await page.locator(".main-menu").evaluate((menu) => {
  const online = menu.querySelector('[data-open="online"]').getBoundingClientRect();
  const records = menu.querySelector('[data-open="records"]').getBoundingClientRect();
  const options = menu.querySelector('[data-open="options"]').getBoundingClientRect();
  return {
    onlineWidth: online.width,
    recordsTop: records.top,
    optionsTop: options.top
  };
});
if (menuGeometry.onlineWidth < 250 || menuGeometry.recordsTop !== menuGeometry.optionsTop) {
  throw new Error(`ONLINE 2P does not span the menu: ${JSON.stringify(menuGeometry)}`);
}
const titlePanelSpacing = await page.evaluate(() => {
  const frame = document.querySelector(".game-frame").getBoundingClientRect();
  const title = document.querySelector(".title-screen");
  const art = document.querySelector(".title-art").getBoundingClientRect();
  const about = document.querySelector('[data-open="about"]').getBoundingClientRect();
  const languageElement = document.querySelector(".title-language");
  const language = languageElement.getBoundingClientRect();
  const panelHeight = Number.parseFloat(getComputedStyle(title, "::before").height);
  const panelTop = frame.top + (frame.height - panelHeight) / 2;
  const panelBottom = panelTop + panelHeight;
  return {
    top: Math.round(art.top - panelTop),
    languageTop: Math.round(language.top - panelTop),
    languageWidth: Math.round(languageElement.querySelector("select").getBoundingClientRect().width),
    languageArtGap: Math.round(art.top - language.bottom),
    artMenuGap: Math.round(document.querySelector(".main-menu").getBoundingClientRect().top - art.bottom),
    bottom: Math.round(panelBottom - about.bottom)
  };
});
if (titlePanelSpacing.top < 12 || titlePanelSpacing.top > 45 ||
    titlePanelSpacing.languageTop < 6 || titlePanelSpacing.languageTop > 14 ||
    titlePanelSpacing.languageWidth < 120 || titlePanelSpacing.languageArtGap < 2 ||
    titlePanelSpacing.artMenuGap < 4 || titlePanelSpacing.bottom < 10 ||
    titlePanelSpacing.bottom > 30) {
  throw new Error(`Title panel spacing is unbalanced: ${JSON.stringify(titlePanelSpacing)}`);
}

await page.getByRole("button", { name: "オンライン2P" }).click();
state = await capture("01b-online-panel");
if (state.ui !== "online") throw new Error(`Online panel failed: ${state.ui}`);
const onlineModes = await page.locator("#online-room-mode option").allTextContents();
if (JSON.stringify(onlineModes) !== JSON.stringify(["協力プレイ", "対戦プレイ"])) {
  throw new Error(`Online modes are incomplete: ${JSON.stringify(onlineModes)}`);
}
const preRoomAudit = await page.evaluate(() => ({
  nameDisabled: document.querySelector("#online-name").disabled,
  codeFieldPresent: Boolean(document.querySelector("#online-code-label")),
  createVisible: !document.querySelector("#online-create").hidden,
  joinVisible: !document.querySelector("#online-join").hidden,
  copyVisible: !document.querySelector("#online-copy").hidden,
  readyVisible: !document.querySelector("#online-ready").hidden,
  startVisible: !document.querySelector("#online-start").hidden,
  playersVisible: !document.querySelector("#online-players").hidden,
  settingsVisible: !document.querySelector("#online-room-settings").hidden
}));
if (preRoomAudit.nameDisabled || preRoomAudit.codeFieldPresent || !preRoomAudit.createVisible ||
    !preRoomAudit.joinVisible || preRoomAudit.copyVisible || preRoomAudit.readyVisible ||
    preRoomAudit.startVisible || preRoomAudit.playersVisible || preRoomAudit.settingsVisible) {
  throw new Error(`Pre-room online panel is not minimal: ${JSON.stringify(preRoomAudit)}`);
}
await page.getByRole("button", { name: "部屋に入る" }).click();
const codeDialogAudit = await page.locator("#room-code-dialog").evaluate((dialog) => ({
  open: dialog.open,
  title: dialog.querySelector("h2")?.textContent,
  inputMode: dialog.querySelector("input")?.inputMode,
  maxLength: dialog.querySelector("input")?.maxLength
}));
if (!codeDialogAudit.open || codeDialogAudit.title !== "ルームコードを入力" ||
    codeDialogAudit.inputMode !== "numeric" || codeDialogAudit.maxLength !== 4) {
  throw new Error(`Room code dialog is incorrect: ${JSON.stringify(codeDialogAudit)}`);
}
await page.locator("#room-code-cancel").click();
await page.evaluate(() => window.__nsShaftQa.showOnlineLobby({
  0: { connected: true, ready: true, name: "HOST" },
  1: { connected: true, ready: false, name: "GUEST" }
}, 1, {
  difficulty: "hard",
  mode: "race",
  options: { conveyor: true, spring: false, rotating: true, fast: false }
}));
const lobbyAudit = await page.evaluate(() => {
  const host = document.querySelector('[data-player="0"]');
  const guest = document.querySelector('[data-player="1"]');
  const ready = document.querySelector("#online-ready");
  const header = document.querySelector(".online-room-header");
  const dialog = document.querySelector(".online-dialog");
  const screen = document.querySelector("#online-panel");
  return {
    hostStatus: host.dataset.status,
    hostText: host.querySelector("strong").textContent,
    hostRole: host.querySelector("[data-online-role]").textContent,
    hostBackground: getComputedStyle(host).backgroundColor,
    guestStatus: guest.dataset.status,
    guestText: guest.querySelector("strong").textContent,
    guestRole: guest.querySelector("[data-online-role]").textContent,
    guestBackground: getComputedStyle(guest).backgroundColor,
    guestLocal: guest.dataset.local,
    hostLocal: host.dataset.local,
    guestTag: guest.querySelector("[data-online-you]")?.textContent ?? "",
    hostTag: host.querySelector("[data-online-you]")?.textContent ?? "",
    readyState: ready.dataset.state,
    readyDisabled: ready.disabled,
    readyBackground: getComputedStyle(ready).backgroundColor,
    copyVisible: !document.querySelector("#online-copy").hidden,
    copyDisabled: document.querySelector("#online-copy").disabled,
    startVisible: !document.querySelector("#online-start").hidden,
    startDisabled: document.querySelector("#online-start").disabled,
    roomSettingsVisible: !document.querySelector("#online-room-settings").hidden,
    roomSettingsDisabled: document.querySelector("#online-room-settings").disabled,
    roomDifficulty: document.querySelector("#online-difficulty")?.value,
    roomMode: document.querySelector("#online-room-mode")?.value,
    springEnabled: document.querySelector("#online-spring").checked,
    statusVisible: getComputedStyle(document.querySelector("#online-status")).display !== "none",
    headerCells: Array.from(header.querySelectorAll("[data-online-header]")).map((node) => node.textContent.trim()),
    dialogContained: dialog.getBoundingClientRect().top >= screen.getBoundingClientRect().top &&
      dialog.getBoundingClientRect().bottom <= screen.getBoundingClientRect().bottom
  };
});
if (lobbyAudit.hostStatus !== "ready" || lobbyAudit.hostText !== "準備完了" ||
    lobbyAudit.hostRole !== "1P" ||
    lobbyAudit.hostBackground !== "rgb(156, 227, 165)" ||
    lobbyAudit.guestRole !== "2P" ||
    lobbyAudit.guestStatus !== "connected" || lobbyAudit.guestText !== "接続済み" ||
    lobbyAudit.guestBackground !== "rgb(255, 226, 138)" ||
    lobbyAudit.guestLocal !== "true" || lobbyAudit.hostLocal !== "false" ||
    lobbyAudit.guestTag !== "YOU" || lobbyAudit.hostTag !== "" ||
    lobbyAudit.readyState !== "available" || lobbyAudit.readyDisabled ||
    lobbyAudit.readyBackground !== "rgb(255, 226, 138)" ||
    lobbyAudit.copyVisible || !lobbyAudit.copyDisabled || !lobbyAudit.startVisible ||
    !lobbyAudit.startDisabled || !lobbyAudit.roomSettingsVisible ||
    !lobbyAudit.roomSettingsDisabled || lobbyAudit.roomDifficulty !== "hard" ||
    lobbyAudit.roomMode !== "race" || lobbyAudit.springEnabled ||
    lobbyAudit.statusVisible ||
    JSON.stringify(lobbyAudit.headerCells) !== JSON.stringify(["ROOM 1234", "PLAYERS 2/2", "READY WAITING"]) ||
    !lobbyAudit.dialogContained) {
  throw new Error(`Online lobby styling failed: ${JSON.stringify(lobbyAudit)}`);
}
await capture("01c-online-lobby-ready");
await page.evaluate(() => window.__nsShaftQa.showOnlineLobby({
  0: { connected: true, ready: false, name: "HOST" },
  1: { connected: true, ready: false, name: "GUEST" }
}, 0, {
  difficulty: "easy",
  mode: "coop",
  options: { conveyor: false, spring: true, rotating: false, fast: true }
}));
const hostSettingsAudit = await page.evaluate(() => ({
  disabled: document.querySelector("#online-room-settings").disabled,
  difficulty: document.querySelector("#online-difficulty")?.value,
  conveyor: document.querySelector("#online-conveyor").checked,
  fast: document.querySelector("#online-fast").checked,
  copyVisible: !document.querySelector("#online-copy").hidden,
  startVisible: !document.querySelector("#online-start").hidden,
  startDisabled: document.querySelector("#online-start").disabled,
  localTag: document.querySelector('[data-player="0"] [data-online-you]')?.textContent ?? "",
  localRole: document.querySelector('[data-player="0"]').querySelector("[data-online-role]").textContent
}));
if (hostSettingsAudit.disabled || hostSettingsAudit.difficulty !== "easy" ||
    hostSettingsAudit.conveyor || !hostSettingsAudit.fast ||
    hostSettingsAudit.copyVisible || !hostSettingsAudit.startVisible ||
    !hostSettingsAudit.startDisabled || hostSettingsAudit.localTag !== "YOU" ||
    hostSettingsAudit.localRole !== "1P") {
  throw new Error(`Host room settings are not editable: ${JSON.stringify(hostSettingsAudit)}`);
}
await capture("01d-online-lobby-host");
for (const language of ["ja", "zh-Hant", "en"]) {
  await page.locator("#locale").evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, language);
  const localeLayout = await page.locator("#online-room-settings").evaluate((settings) => ({
    overflow: settings.scrollWidth > settings.clientWidth || settings.scrollHeight > settings.clientHeight,
    labelsOverflow: Array.from(settings.querySelectorAll("label")).some((label) =>
      label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight),
    sameFontSize: getComputedStyle(settings.querySelector("label")).fontSize ===
      getComputedStyle(document.querySelector("#online-name").closest("label")).fontSize,
    selectsFit: Array.from(settings.querySelectorAll("select")).every((select) =>
      select.scrollWidth <= select.clientWidth && select.getBoundingClientRect().height === 22),
    compactHeight: settings.getBoundingClientRect().height <= 135,
    hostLabelClipped: document.querySelector('[data-player="0"] small').scrollWidth >
      document.querySelector('[data-player="0"] small').clientWidth
  }));
  if (localeLayout.overflow || localeLayout.labelsOverflow || !localeLayout.sameFontSize ||
      !localeLayout.selectsFit || !localeLayout.compactHeight || localeLayout.hostLabelClipped) {
    throw new Error(`${language} online settings overflowed: ${JSON.stringify(localeLayout)}`);
  }
  await capture(`01d-online-lobby-${language}`);
}
await page.locator("#locale").evaluate((select) => {
  select.value = "ja";
  select.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.getByRole("button", { name: "戻る" }).click();

await page.locator("#locale").selectOption("zh-Hant");
if (await page.getByRole("button", { name: "選項" }).count() !== 1 ||
    JSON.parse(await page.evaluate(() => window.render_game_to_text())).settings.locale !== "zh-Hant") {
  throw new Error("Traditional Chinese did not apply immediately");
}
await capture("02a-title-zh-hant");
await page.locator("#locale").selectOption("en");
if (await page.getByRole("button", { name: "OPTIONS" }).count() !== 1) {
  throw new Error("English did not apply immediately");
}
await capture("02b-title-en");
await page.reload({ waitUntil: "networkidle" });
if (await page.getByRole("button", { name: "OPTIONS" }).count() !== 1 ||
    JSON.parse(await page.evaluate(() => window.render_game_to_text())).settings.locale !== "en") {
  throw new Error("English locale was not persisted across reload");
}
await page.locator("#locale").selectOption("ja");
await page.getByRole("button", { name: "オプション" }).click();
await page.locator("#difficulty").selectOption("hard");
await page.locator("#conveyor").check();
await page.locator("#player1-name").fill("alice!?long");
if (await page.locator("#player1-name").inputValue() !== "ALICELON") {
  throw new Error("Player name was not normalized to eight uppercase alphanumerics");
}
await capture("02-options");
const optionsContained = await page.locator("#options-panel .dialog").evaluate((dialog) => {
  const panel = document.querySelector("#options-panel").getBoundingClientRect();
  const rect = dialog.getBoundingClientRect();
  const style = getComputedStyle(dialog);
  return rect.top >= panel.top && rect.bottom <= panel.bottom && rect.height < 330 &&
    dialog.scrollHeight === dialog.clientHeight && !["auto", "scroll"].includes(style.overflowY);
});
if (!optionsContained) throw new Error("Options dialog overflowed its panel");
await page.getByRole("button", { name: "効果音テスト" }).click();
await capture("02c-sound-test");
const soundPreviewRows = await page.locator("[data-sound-preview]").evaluateAll((buttons) =>
  buttons.map((button) => ({
    event: button.getAttribute("data-sound-preview"),
    text: button.parentElement?.textContent?.replace(/\s+/g, " ").trim()
  }))
);
if (soundPreviewRows.length !== 10 ||
    soundPreviewRows[4].event !== "conveyor" ||
    !soundPreviewRows[4].text?.includes("wave-107") ||
    soundPreviewRows[5].event !== "rotate" ||
    !soundPreviewRows[5].text?.includes("wave-111") ||
    soundPreviewRows[9].event !== "abort" ||
    !soundPreviewRows[9].text?.includes("wave-115")) {
  throw new Error(`Sound preview list is incomplete: ${JSON.stringify(soundPreviewRows)}`);
}
await page.locator('[data-sound-preview="rotate"]').click();
await page.waitForTimeout(50);
await page.getByRole("button", { name: "戻る" }).click();
if (await page.locator("#player1-name").inputValue() !== "ALICELON") {
  throw new Error("Player name was not retained in localStorage");
}
await page.getByRole("button", { name: "戻る" }).click();

await page.getByRole("button", { name: "ベスト５" }).click();
await page.waitForFunction(() => document.querySelectorAll("#records-list .record-row").length === 15);
state = await capture("03-records");
if (state.ui !== "records") throw new Error(`Records screen failed: ${state.ui}`);
const recordsAudit = await page.evaluate(() => {
  const screen = document.querySelector("#records-panel").getBoundingClientRect();
  const content = document.querySelector(".records-content").getBoundingClientRect();
  const rows = [...document.querySelectorAll("#records-list .record-row")];
  return {
    cabinetCentered: Math.abs((content.left + content.width / 2) - (screen.left + screen.width / 2)) <= 1,
    contained: content.top >= screen.top && content.bottom <= screen.bottom,
    rows: rows.length,
    overflow: rows.some((row) => row.scrollWidth > row.clientWidth)
  };
});
if (!recordsAudit.cabinetCentered || !recordsAudit.contained ||
    recordsAudit.rows !== 15 || recordsAudit.overflow) {
  throw new Error(`BEST 5 layout failed: ${JSON.stringify(recordsAudit)}`);
}
await page.locator('[data-record-mode="coop"]').click();
await page.waitForFunction(() =>
  document.querySelector('[data-record-mode="coop"]')?.dataset.active === "true" &&
  document.querySelector('#records-list .record-row')?.dataset.layout === "coop"
);
const coopRecordsAudit = await page.locator("#records-list").evaluate((list) => ({
  rows: list.querySelectorAll(".record-row[data-layout=coop]").length,
  maxNames: Math.max(...[...list.querySelectorAll(".record-player")]
    .map((player) => player.children.length)),
  overflow: [...list.querySelectorAll(".record-row")]
    .some((row) => row.scrollWidth > row.clientWidth)
}));
if (coopRecordsAudit.rows !== 15 || coopRecordsAudit.maxNames !== 2 || coopRecordsAudit.overflow) {
  throw new Error(`Co-op BEST 5 layout failed: ${JSON.stringify(coopRecordsAudit)}`);
}
await capture("03b-records-coop");
await page.getByRole("button", { name: "戻る" }).click();

await page.getByRole("button", { name: "１人プレイ" }).click();
await page.waitForTimeout(150);
state = await capture("04-gameplay-initial");
if (state.mode !== "playing" || state.players.length !== 1) {
  throw new Error(`1P start failed: ${JSON.stringify(state)}`);
}
if (!state.audio.midiLoaded || !state.audio.musicActive ||
    state.audio.contextState !== "running" || Math.abs(state.audio.musicGain - 0.1) > 0.001) {
  throw new Error(`MIDI BGM did not start audibly: ${JSON.stringify(state.audio)}`);
}
const nativePixelAudit = await page.locator("#game").evaluate((canvas) => {
  const context = canvas.getContext("2d");
  const count = (x, y, width, height, predicate) => {
    const pixels = context.getImageData(x, y, width, height).data;
    let matches = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (predicate(pixels[index], pixels[index + 1], pixels[index + 2])) matches += 1;
    }
    return matches;
  };
  return {
    texturedPixels: count(180, 180, 48, 48, (r, g, b) => b > r + 8 && b > g + 8),
    ceilingBrightPixels: count(38, 62, 384, 16, (r, g, b) => r > 120 && g > 120 && b > 120),
    ceilingBlueGapPixels: count(38, 62, 384, 16, (r, g, b) => b > r + 20 && b > g + 20),
    leftWallBluePixels: count(22, 94, 16, 32, (r, g, b) => b > r && b > g),
    rightWallBluePixels: count(426, 94, 16, 32, (r, g, b) => b > r && b > g),
    floorPrefixStrayPixels: count(186, 12, 8, 32, (r, g, b) => r > 180 && g > 180 && b > 180),
    floorPrefixRightPixels: count(258, 12, 8, 32, (r, g, b) => r > 110 && g > 140 && b < 180),
    floorSuffixGapPixels: count(384, 12, 4, 32, (r, g, b) => r > 180 && g > 180 && b > 120),
    floorDigitBackgroundStrayPixels: count(384, 12, 4, 12, (r, g, b) => r > 35 || g > 35 || b > 35),
    floorSuffixRightPixels: count(412, 12, 8, 32, (r, g, b) => r > 110 && g > 140 && b < 180),
    difficultyLeftStrayPixels: count(500, 113, 28, 13, (r, g, b) => r > 160 && g > 160 && b > 160),
    recordDigitsAlignedPixels: count(542, 165, 52, 4, (r, g, b) => r > 150 && g > 150 && b > 150)
  };
});
if (nativePixelAudit.texturedPixels < 500 ||
    nativePixelAudit.ceilingBrightPixels < 500 ||
    nativePixelAudit.ceilingBlueGapPixels < 100 ||
    nativePixelAudit.leftWallBluePixels < 100 ||
    nativePixelAudit.rightWallBluePixels < 100 ||
    nativePixelAudit.floorPrefixStrayPixels > 4 ||
    nativePixelAudit.floorPrefixRightPixels < 8 ||
    nativePixelAudit.floorSuffixGapPixels > 4 ||
    nativePixelAudit.floorDigitBackgroundStrayPixels > 0 ||
    nativePixelAudit.floorSuffixRightPixels < 8 ||
    nativePixelAudit.difficultyLeftStrayPixels > 4 ||
    nativePixelAudit.recordDigitsAlignedPixels < 20) {
  throw new Error(`Native playfield art is cropped or missing: ${JSON.stringify(nativePixelAudit)}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([
    { id: 1, x: 18, y: 80, width: 96, kind: "normal", variant: "normal",
      direction: 1, phase: 0, collidable: true, activationState: "active" },
    { id: 2, x: 130, y: 140, width: 96, kind: "conveyor", variant: "conveyor-left",
      direction: -1, phase: 0, collidable: true, activationState: "active" },
    { id: 3, x: 244, y: 200, width: 96, kind: "rotating", variant: "disappearing",
      direction: 1, phase: 0, collidable: true, activationState: "disappearing",
      activationAgeMs: 190, height: 6 },
    { id: 4, x: 80, y: 260, width: 96, kind: "spring", variant: "spring",
      direction: 1, phase: 0, collidable: true, activationState: "triggered",
      activationAgeMs: 120 },
    { id: 5, x: 250, y: 330, width: 96, kind: "spike", variant: "spike",
      direction: 1, phase: 0, collidable: true, activationState: "active" }
  ]);
  window.__nsShaftQa.setPlayer(0, { x: 128, y: 260, standingPlatformId: 4 });
  window.advanceTime(1);
});
await capture("05-all-platform-objects");

await page.evaluate(() => {
  const state = JSON.parse(window.render_game_to_text());
  window.__nsShaftQa.setPlayer(0, {
    pose: "hurt",
    hurtUntilMs: state.timeMs + 1000
  });
  window.advanceTime(1);
});
await capture("05b-player-hurt-red");

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([{
    id: 19, x: 80, y: 260, width: 96, kind: "normal",
    variant: "normal", direction: 1, phase: 0, collidable: true,
    activationState: "active"
  }]);
  window.__nsShaftQa.setPlayer(0, {
    x: 128, y: 260, vx: 0, pose: "stand", facing: "right",
    hurtUntilMs: 0, standingPlatformId: 19
  });
});
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(80);
state = await capture("05ba-player-walk-right");
await page.keyboard.up("ArrowRight");
if (state.players[0].pose !== "walk" || state.players[0].facing !== "right") {
  throw new Error(`Right walk animation failed: ${JSON.stringify(state.players[0])}`);
}

await page.keyboard.down("ArrowLeft");
await page.waitForTimeout(80);
state = await capture("05bb-player-walk-left");
await page.keyboard.up("ArrowLeft");
if (state.players[0].pose !== "walk" || state.players[0].facing !== "left") {
  throw new Error(`Left walk animation failed: ${JSON.stringify(state.players[0])}`);
}

const innerLeft = 16;
const innerRight = 404;
const playerHalf = 13;
await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([{
    id: 25, x: 16, y: 260, width: 96, kind: "normal",
    variant: "normal", direction: 1, phase: 0, collidable: true,
    activationState: "active"
  }]);
  window.__nsShaftQa.setPlayer(0, {
    x: 40, y: 260, vx: 0, vy: 0, pose: "stand", hurtUntilMs: 0,
    standingPlatformId: 25
  });
});
await page.keyboard.down("ArrowLeft");
await page.waitForTimeout(220);
state = await capture("05bc-player-left-wall-clamp");
await page.keyboard.up("ArrowLeft");
if (state.players[0].x < innerLeft + playerHalf) {
  throw new Error(`Player overlapped the left wall: ${JSON.stringify(state.players[0])}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([{
    id: 26, x: 308, y: 260, width: 96, kind: "normal",
    variant: "normal", direction: 1, phase: 0, collidable: true,
    activationState: "active"
  }]);
  window.__nsShaftQa.setPlayer(0, {
    x: 380, y: 260, vx: 0, vy: 0, pose: "stand", hurtUntilMs: 0,
    standingPlatformId: 26
  });
});
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(220);
state = await capture("05bd-player-right-wall-clamp");
await page.keyboard.up("ArrowRight");
if (state.players[0].x > innerRight - playerHalf) {
  throw new Error(`Player overlapped the right wall: ${JSON.stringify(state.players[0])}`);
}

const conveyorStartX = 120;
await page.evaluate((x) => {
  window.__nsShaftQa.setPlatforms([{
    id: 20, x: 80, y: 260, width: 96, kind: "conveyor",
    variant: "conveyor-right", direction: 1, phase: 0, collidable: true,
    activationState: "active"
  }]);
  window.__nsShaftQa.setPlayer(0, {
    x, y: 260, vx: 0, pose: "stand", hurtUntilMs: 0,
    standingPlatformId: 20
  });
  window.advanceTime(100);
}, conveyorStartX);
state = await capture("05c-conveyor-rail-moves-player");
if (state.players[0].x <= conveyorStartX) {
  throw new Error(`Conveyor rail did not move player: ${state.players[0].x}`);
}

await page.evaluate((x) => {
  window.__nsShaftQa.setPlatforms([{
    id: 22, x: 80, y: 260, width: 96, kind: "conveyor",
    variant: "conveyor-left", direction: -1, phase: 0, collidable: true,
    activationState: "active"
  }]);
  window.__nsShaftQa.setPlayer(0, {
    x, y: 260, vx: 0, pose: "stand", hurtUntilMs: 0,
    standingPlatformId: 22
  });
  window.advanceTime(100);
}, conveyorStartX);
state = await capture("05cc-conveyor-left-moves-player");
if (state.players[0].x >= conveyorStartX) {
  throw new Error(`Left conveyor did not move player left: ${state.players[0].x}`);
}

const rotatingStartX = 120;
await page.evaluate((x) => {
  window.__nsShaftQa.setPlatforms([
    {
      id: 21, x: 80, y: 260, width: 96, kind: "rotating",
      variant: "disappearing", direction: 1, phase: 0, collidable: true,
      activationState: "active"
    },
    {
      id: 24, x: 80, y: 350, width: 96, kind: "normal",
      variant: "normal", direction: 1, phase: 0, collidable: true,
      activationState: "active"
    }
  ]);
  window.__nsShaftQa.setPlayer(0, {
    x, y: 260, vx: 0.1, pose: "stand", hurtUntilMs: 0,
    standingPlatformId: 21
  });
  window.advanceTime(100);
}, rotatingStartX);
state = await capture("05d-rotating-block-does-not-move-player");
if (Math.abs(state.players[0].x - rotatingStartX) > 0.001) {
  throw new Error(`Rotating block moved player: ${state.players[0].x}`);
}
if (state.players[0].standingPlatformId !== 21 ||
    !state.platforms[0].collidable ||
    state.platforms[0].activationState !== "triggered") {
  throw new Error(`Rotating block skipped its delay: ${JSON.stringify(state)}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([
    {
      id: 21, x: 80, y: 260, width: 96, kind: "rotating",
      variant: "disappearing", direction: 1, phase: 0, collidable: true,
      activationState: "triggered", activationAgeMs: 90, height: 12
    },
    {
      id: 24, x: 80, y: 350, width: 96, kind: "normal",
      variant: "normal", direction: 1, phase: 0, collidable: true,
      activationState: "active"
    }
  ]);
  window.__nsShaftQa.setPlayer(0, {
    x: 120, y: 260, vx: 0, vy: 0, pose: "stand",
    standingPlatformId: 21
  });
  window.advanceTime(20);
});
state = await capture("05dc-rotating-delay-ended");
if (state.players[0].standingPlatformId !== null ||
    state.platforms[0].collidable ||
    state.platforms[0].activationState !== "disappearing") {
  throw new Error(`Rotating block did not drop after 100ms: ${JSON.stringify(state)}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([
    {
      id: 21, x: 80, y: 220, width: 96, kind: "rotating",
      variant: "disappearing", direction: 1, phase: 0, collidable: false,
      activationState: "disappearing", activationAgeMs: 330, height: 0
    },
    {
      id: 24, x: 80, y: 350, width: 96, kind: "normal",
      variant: "normal", direction: 1, phase: 0, collidable: true,
      activationState: "active"
    }
  ]);
  window.advanceTime(1);
});
state = await capture("05dd-rotating-last-frame");
if (state.platforms[0].activationAgeMs < 330 ||
    state.platforms[0].activationAgeMs >= 350 ||
    state.platforms[0].activationState !== "disappearing") {
  throw new Error(`Rotating block skipped its last frame: ${JSON.stringify(state.platforms[0])}`);
}

await page.evaluate(() => window.advanceTime(40));
state = await capture("05de-rotating-reset");
if (!state.platforms[0].collidable ||
    state.platforms[0].activationState !== "active" ||
    state.platforms[0].activationAgeMs !== 0) {
  throw new Error(`Rotating block did not reset: ${JSON.stringify(state.platforms[0])}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([{
    id: 23, x: 80, y: 260, width: 96, kind: "spring",
    variant: "spring", direction: 1, phase: 0, collidable: true,
    activationState: "triggered", activationAgeMs: 0
  }]);
  window.__nsShaftQa.setPlayer(0, {
    x: 128, y: 260, vx: 0, vy: 0, pose: "stand",
    standingPlatformId: 23,
    onPlatformSince: JSON.parse(window.render_game_to_text()).timeMs
  });
  window.advanceTime(145);
});
await capture("05e-spring-compressing");

await page.evaluate(() => window.advanceTime(75));
state = await capture("05f-spring-rebounding");
if (state.players[0].standingPlatformId !== null || state.players[0].vy >= 0) {
  throw new Error(`Spring did not launch player: ${JSON.stringify(state.players[0])}`);
}

await page.evaluate(() => {
  const timeMs = JSON.parse(window.render_game_to_text()).timeMs;
  window.__nsShaftQa.setPlatforms([
    { id: 33, x: 80, y: 140, width: 96, kind: "normal", variant: "normal",
      direction: 1, phase: 0, collidable: true, activationState: "active" },
    { id: 31, x: 80, y: 200, width: 96, kind: "spring", variant: "spring",
      direction: 1, phase: 0, collidable: true, activationState: "triggered",
      activationAgeMs: 0 },
    { id: 32, x: 80, y: 260, width: 200, kind: "normal", variant: "normal",
      direction: 1, phase: 0, collidable: true, activationState: "active" }
  ]);
  window.__nsShaftQa.setPlayer(0, {
    x: 200, y: 200, vx: 0, vy: 0, pose: "stand", standingPlatformId: 31,
    standingPlayerId: null, onPlatformSince: timeMs,
    springIgnoredPlatformIds: [], springSourcePlatformId: null,
    springLaunchAtMs: timeMs + 100,
    springLaunchPlatformId: 31
  });
  window.advanceTime(900);
});
state = await capture("05g-spring-lands-next-lower-block");
if (state.players[0].standingPlatformId !== 32 ||
    state.players[0].springIgnoredPlatformIds.length !== 0) {
  throw new Error(`Spring skipped the next lower block: ${JSON.stringify(state.players[0])}`);
}

const repeatedSpring = await page.evaluate(() => {
  const timeMs = JSON.parse(window.render_game_to_text()).timeMs;
  window.__nsShaftQa.setPlatforms([{
    id: 41, x: 80, y: 260, width: 96, kind: "spring", variant: "spring",
    direction: 1, phase: 0, collidable: true, activationState: "active"
  }]);
  window.__nsShaftQa.setPlayer(0, {
    x: 128, y: 260, vx: 0, vy: 0, pose: "stand", standingPlatformId: 41,
    standingPlayerId: null, onPlatformSince: timeMs,
    springIgnoredPlatformIds: [], springSourcePlatformId: null,
    springLaunchAtMs: timeMs + 100, springLaunchPlatformId: 41
  });
  let launched = false;
  let landed = false;
  let relaunched = false;
  for (let elapsed = 0; elapsed < 1800; elapsed += 20) {
    window.advanceTime(20);
    const player = JSON.parse(window.render_game_to_text()).players[0];
    if (!launched && player.springSourcePlatformId === 41 && player.vy < 0) launched = true;
    else if (launched && !landed && player.standingPlatformId === 41) landed = true;
    else if (landed && player.springSourcePlatformId === 41 && player.vy < 0) {
      relaunched = true;
      break;
    }
  }
  return { launched, landed, relaunched };
});
state = await capture("05h-same-spring-relaunches");
if (!repeatedSpring.launched || !repeatedSpring.landed || !repeatedSpring.relaunched) {
  throw new Error(`Same spring did not relaunch: ${JSON.stringify(repeatedSpring)}`);
}

await page.getByRole("button", { name: "一時停止" }).click();
await page.waitForTimeout(40);
state = await capture("06-paused");
if (state.mode !== "paused" || state.audio.contextState !== "suspended" ||
    !state.audio.musicActive) {
  throw new Error(`Pause failed: ${JSON.stringify({ mode: state.mode, audio: state.audio })}`);
}
await page.getByRole("button", { name: "一時停止" }).click();
await page.waitForTimeout(40);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.mode !== "playing" || state.audio.contextState !== "running" ||
    !state.audio.musicActive) {
  throw new Error(`Resume failed: ${JSON.stringify({ mode: state.mode, audio: state.audio })}`);
}

await page.evaluate(() => window.dispatchEvent(new Event("blur")));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.mode !== "paused") throw new Error(`Blur did not auto-pause: ${state.mode}`);
await page.getByRole("button", { name: "一時停止" }).click();

await page.evaluate(() => {
  window.__nsShaftQa.setProgress(170);
  window.__nsShaftQa.setPlayer(0, { alive: false, health: 0 });
  window.advanceTime(20);
});
state = await capture("07-game-over");
if (state.mode !== "gameover") throw new Error(`Game over failed: ${state.mode}`);
await page.keyboard.press("Enter");

await page.getByRole("button", { name: "ベスト５" }).click();
await page.waitForFunction(() => document.querySelectorAll("#records-list section").length === 3);
await capture("08-global-records");
await page.getByRole("button", { name: "戻る" }).click();

await page.getByRole("button", { name: "２人プレイ" }).click();
await page.keyboard.down("KeyX");
await page.waitForTimeout(120);
await page.keyboard.up("KeyX");
state = await capture("09-two-player");
if (state.players.length !== 2 || state.players[1].x <= 224) {
  throw new Error(`2P movement failed: ${JSON.stringify(state.players)}`);
}
const twoPlayerHudAudit = await page.locator("#game").evaluate((canvas) => {
  const context = canvas.getContext("2d");
  const count = (x, y, width, height, predicate) => {
    const pixels = context.getImageData(x, y, width, height).data;
    let matches = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (predicate(pixels[index], pixels[index + 1], pixels[index + 2])) matches += 1;
    }
    return matches;
  };
  const magenta = (r, g, b) => r > 190 && b > 110 && g < 120;
  const life = (r, g, b) => r > 180 && (g > 90 || b < 80);
  return {
    twoPlayerLabel: count(30, 12, 40, 16, magenta),
    onePlayerLabel: count(334, 12, 36, 16, magenta),
    twoPlayerLife: count(32, 28, 96, 16, life),
    onePlayerLife: count(336, 28, 96, 16, life),
    shiftedFloor: count(133, 12, 200, 32, (r, g, b) => r > 110 && g > 130 && b < 180),
    floorSuffixStrayDot: count(293, 12, 4, 12, (r, g, b) => r > 110 && g > 130 && b < 180),
    leftGap: count(128, 12, 5, 32, (r, g, b) => r > 110 && g > 130 && b < 180),
    rightGap: count(331, 12, 5, 16, magenta),
    symmetricLifeEdges: Math.abs((32 - 22) - (442 - (336 + 96)))
  };
});
if (twoPlayerHudAudit.twoPlayerLabel < 30 ||
    twoPlayerHudAudit.onePlayerLabel < 30 ||
    twoPlayerHudAudit.twoPlayerLife < 500 ||
    twoPlayerHudAudit.onePlayerLife < 500 ||
    twoPlayerHudAudit.shiftedFloor < 500 ||
    twoPlayerHudAudit.floorSuffixStrayDot > 0 ||
    twoPlayerHudAudit.leftGap > 4 ||
    twoPlayerHudAudit.rightGap > 0 ||
    twoPlayerHudAudit.symmetricLifeEdges !== 0) {
  throw new Error(`2P HUD is missing or misaligned: ${JSON.stringify(twoPlayerHudAudit)}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([]);
  window.__nsShaftQa.setPlayer(0, {
    x: 190, y: 260, vx: 0, vy: 0, standingPlatformId: null,
    standingPlayerId: null, facing: "right"
  });
  window.__nsShaftQa.setPlayer(1, {
    x: 216, y: 260, vx: 0, vy: 0, standingPlatformId: null,
    standingPlayerId: null, facing: "left"
  });
});
await page.keyboard.down("ArrowRight");
await page.keyboard.down("KeyZ");
await page.waitForTimeout(100);
await page.keyboard.up("ArrowRight");
await page.keyboard.up("KeyZ");
state = await capture("09b-two-player-blocks-overlap");
if (state.players[1].x - state.players[0].x < state.players[0].width) {
  throw new Error(`2P players overlapped: ${JSON.stringify(state.players)}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([]);
  window.__nsShaftQa.setPlayer(0, {
    x: 160, y: 260, vx: 0, vy: 0, standingPlatformId: null,
    standingPlayerId: null, facing: "right"
  });
  window.__nsShaftQa.setPlayer(1, {
    x: 160, y: 232, vx: 0, vy: 0.2, standingPlatformId: null,
    standingPlayerId: null, facing: "left"
  });
  window.advanceTime(40);
});
state = await capture("09c-two-player-head-stand");
if (state.players[1].standingPlayerId !== state.players[0].id ||
    Math.abs(state.players[1].y - (state.players[0].y - state.players[0].height)) > 0.01) {
  throw new Error(`2P head standing failed: ${JSON.stringify(state.players)}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([]);
  window.__nsShaftQa.setPlayer(0, {
    x: 80, y: 220, vx: 0, vy: 0.2, standingPlatformId: null,
    standingPlayerId: null, facing: "left"
  });
  window.__nsShaftQa.setPlayer(1, {
    x: 130, y: 220, vx: 0, vy: 0.2, standingPlatformId: null,
    standingPlayerId: null, facing: "left",
    pose: "hurt", hurtUntilMs: JSON.parse(window.render_game_to_text()).timeMs + 1000
  });
  window.advanceTime(20);
});
state = await capture("09d-two-player-fall-facing-left");
if (state.players.some((player) => player.facing !== "left")) {
  throw new Error(`Falling/hurt facing changed unexpectedly: ${JSON.stringify(state.players)}`);
}

const deadPlayerMotion = await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([{
    id: 90, x: 100, y: 300, width: 96, kind: "normal",
    variant: "normal", direction: 1, phase: 0, collidable: true
  }]);
  window.__nsShaftQa.setPlayer(0, {
    alive: true, health: 0, x: 180, y: 180, vy: 0,
    standingPlatformId: null, standingPlayerId: null
  });
  window.__nsShaftQa.setPlayer(1, {
    alive: true, health: 12, x: 130, y: 300, vy: 0,
    standingPlatformId: 90, standingPlayerId: null
  });
  window.advanceTime(20);
  const before = JSON.parse(window.render_game_to_text());
  window.advanceTime(200);
  const after = JSON.parse(window.render_game_to_text());
  return {
    beforeY: before.players[0].y,
    afterY: after.players[0].y,
    dead: !after.players[0].alive,
    survivorAlive: after.players[1].alive,
    mode: after.mode
  };
});
if (!deadPlayerMotion.dead || !deadPlayerMotion.survivorAlive ||
    deadPlayerMotion.afterY <= deadPlayerMotion.beforeY ||
    deadPlayerMotion.mode !== "playing") {
  throw new Error(`Dead co-op player did not fall away: ${JSON.stringify(deadPlayerMotion)}`);
}
await capture("09e-two-player-death-fall");

await page.getByRole("button", { name: "中止" }).click();
state = await capture("10-abort-to-title");
if (state.ui !== "title") throw new Error(`Abort failed: ${state.ui}`);

await page.getByRole("button", { name: "オプション" }).click();
await page.locator("#fast").check();
await page.locator("#music").uncheck();
await page.locator("#sound").uncheck();
await page.getByRole("button", { name: "戻る" }).click();
await page.getByRole("button", { name: "１人プレイ" }).click();
await page.waitForTimeout(80);
state = await capture("11-fast-muted");
if (!state.settings.fast || state.settings.music || state.settings.sound) {
  throw new Error(`Settings did not apply immediately: ${JSON.stringify(state.settings)}`);
}

await page.setViewportSize({ width: 1300, height: 900 });
await page.waitForTimeout(50);
const scale = await page.locator(".game-frame").evaluate((element) =>
  getComputedStyle(element).getPropertyValue("--game-scale").trim()
);
if (scale !== "2") throw new Error(`Fullscreen integer scale was not calculated: ${scale}`);
await page.keyboard.press("KeyF");
await page.waitForTimeout(100);
const fullscreenGeometry = await page.locator("#game").evaluate((canvas) => ({
  active: Boolean(document.fullscreenElement),
  width: canvas.getBoundingClientRect().width,
  height: canvas.getBoundingClientRect().height
}));
if (!fullscreenGeometry.active ||
    fullscreenGeometry.width !== 1268 || fullscreenGeometry.height !== 872) {
  throw new Error(`Fullscreen geometry is not integer-scaled: ${
    JSON.stringify(fullscreenGeometry)
  }`);
}
await capture("12-integer-scale-ready");
await page.keyboard.press("KeyF");

await page.getByRole("button", { name: "中止" }).click();
await page.setViewportSize({ width: 1400, height: 700 });
await page.evaluate(() => window.__nsShaftQa.startRace());
await page.waitForTimeout(60);
await page.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("countdown", 5000));
const countdownTicks = JSON.parse(await page.evaluate(() => window.render_game_to_text())).ticks;
await page.evaluate(() => window.advanceTime(500));
state = await capture("13a-online-countdown");
if (state.online?.phase !== "countdown" || state.ticks !== countdownTicks ||
    !state.online?.display?.includes("5")) {
  throw new Error(`Online countdown did not freeze at 5: ${JSON.stringify(state.online)}`);
}
const startCountdownLayout = await page.locator("#online-state").evaluate((overlay) => {
  const dialog = overlay.querySelector(".online-state-dialog").getBoundingClientRect();
  const bounds = overlay.getBoundingClientRect();
  return {
    countdown: overlay.dataset.countdown,
    width: Math.round(dialog.width),
    height: Math.round(dialog.height),
    boundsWidth: Math.round(bounds.width),
    boundsHeight: Math.round(bounds.height)
  };
});
if (startCountdownLayout.countdown !== "true" ||
    startCountdownLayout.width !== startCountdownLayout.boundsWidth ||
    startCountdownLayout.height !== startCountdownLayout.boundsHeight) {
  throw new Error(`Start countdown is not full-screen: ${JSON.stringify(startCountdownLayout)}`);
}
await page.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("playing", -1000));
state = await capture("13-online-split-race");
if (state.ui !== "race" || state.race?.local?.players?.length !== 1) {
  throw new Error(`Split race did not start: ${JSON.stringify(state)}`);
}
const deadPlayerPauseDialog = await page.evaluate(() => {
  window.__nsShaftQa.setRaceRemotePlayer({ alive: false, health: 0, pose: "dead" });
  window.__nsShaftQa.setOnlinePause({
    requestedBy: 0,
    ready: { 0: true, 1: false },
    resumeAt: null
  });
  const dialog = document.querySelector("#online-state");
  return {
    player1: dialog.querySelector('[data-pause-player="0"]')?.textContent,
    player2: dialog.querySelector('[data-pause-player="1"]')?.textContent,
    readyHidden: dialog.querySelector("#online-state-ready")?.hidden,
    readyDisabled: dialog.querySelector("#online-state-ready")?.disabled
  };
});
if (deadPlayerPauseDialog.player1 !== "準備完了" ||
    deadPlayerPauseDialog.player2 !== "ゲームオーバー" ||
    deadPlayerPauseDialog.readyHidden || !deadPlayerPauseDialog.readyDisabled) {
  throw new Error(`Dead player still blocked pause resume: ${JSON.stringify(deadPlayerPauseDialog)}`);
}
await page.evaluate(() => {
  window.__nsShaftQa.setOnlinePause(null);
  window.advanceTime(20);
  window.__nsShaftQa.setRaceRemotePlayer({ alive: true, health: 12, pose: "stand" });
});
await page.evaluate(() => window.__nsShaftQa.setOnlinePause({
  requestedBy: 0,
  ready: { 0: true, 1: false },
  resumeAt: null
}));
state = await capture("13aa-online-pause-ready");
const pauseDialog = await page.locator("#online-state").evaluate((dialog) => ({
  visible: !dialog.hidden,
  title: dialog.querySelector("#online-state-title")?.textContent,
  player1: dialog.querySelector('[data-pause-player="0"]')?.textContent,
  player2: dialog.querySelector('[data-pause-player="1"]')?.textContent,
  readyDisabled: dialog.querySelector("#online-state-ready")?.disabled
}));
if (!pauseDialog.visible || pauseDialog.title !== "一時停止" ||
    pauseDialog.player1 !== "準備完了" || pauseDialog.player2 !== "待機中" ||
    !pauseDialog.readyDisabled) {
  throw new Error(`Online pause dialog is invalid: ${JSON.stringify(pauseDialog)}`);
}
await page.evaluate(() => window.__nsShaftQa.setOnlinePause({
  requestedBy: 0,
  ready: { 0: true, 1: true },
  resumeAt: Date.now() + 3000
}));
state = await capture("13ab-online-resume-countdown");
const resumeCountdownFullScreen = await page.locator("#online-state").evaluate((overlay) =>
  overlay.dataset.countdown === "true" &&
  overlay.querySelector(".online-state-dialog").getBoundingClientRect().width === overlay.getBoundingClientRect().width
);
if (state.online?.dialog?.title !== "3" || !resumeCountdownFullScreen) {
  throw new Error(`Online resume countdown is invalid: ${JSON.stringify(state.online?.dialog)}`);
}
await page.evaluate(() => window.__nsShaftQa.setOnlinePause(null));
await page.evaluate(() => window.__nsShaftQa.setOnlineConnection(false, 6000));
state = await capture("13ac-online-connection-syncing");
if (state.online?.connection !== "syncing" ||
    state.online?.connectionIndicator !== "通信中…" || state.online?.dialog !== null) {
  throw new Error(`Transient disconnect blocked play: ${JSON.stringify(state.online)}`);
}
await page.evaluate(() => window.__nsShaftQa.setOnlineConnection(false, 14000));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.online?.connection !== "syncing" || state.online?.dialog !== null) {
  throw new Error(`Disconnect grace ended too early: ${JSON.stringify(state.online)}`);
}
await page.evaluate(() => window.__nsShaftQa.setOnlineConnection(false, 15100));
state = await capture("13ad-online-connection-lost");
if (state.online?.connection !== "disconnected" ||
    state.online?.dialog?.title !== "通信が切断されました") {
  throw new Error(`Confirmed disconnect dialog is missing: ${JSON.stringify(state.online)}`);
}
await page.evaluate(() => window.__nsShaftQa.setOnlineConnection(true, 0));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.online?.connection !== "healthy" || state.online?.connectionIndicator !== null ||
    state.online?.dialog !== null) {
  throw new Error(`Connection did not recover immediately: ${JSON.stringify(state.online)}`);
}
const raceGeometry = await page.locator(".race-pane").evaluateAll((panes) =>
  panes.map((pane) => {
    const canvas = pane.querySelector("canvas");
    const paneRect = pane.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
    role: pane.dataset.role,
    color: pane.dataset.playerColor,
    width: canvas.width,
    height: canvas.height,
    cssWidth: canvasRect.width,
    cssHeight: canvasRect.height,
    paneTop: paneRect.top,
    paneHeight: paneRect.height,
    visible: canvasRect.width > 0
  }; })
);
if (raceGeometry.length !== 2 || raceGeometry.some((item) =>
  item.width !== 634 || item.height !== 436 || !item.visible
) || raceGeometry[0].role !== "local" || raceGeometry[0].color !== "yellow" ||
    raceGeometry[0].cssWidth !== 634 || raceGeometry[0].cssHeight !== 436 ||
    raceGeometry[1].role !== "remote" || raceGeometry[1].color !== "green" ||
    raceGeometry[1].cssWidth !== 317 || raceGeometry[1].cssHeight !== 218 ||
    Math.abs(
      raceGeometry[1].paneTop + raceGeometry[1].paneHeight / 2 -
      (raceGeometry[0].paneTop + raceGeometry[0].paneHeight / 2)
    ) > 1) {
  throw new Error(`Split race canvases are invalid: ${JSON.stringify(raceGeometry)}`);
}

const localStartX = state.race.local.players[0].x;
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(100);
await page.keyboard.up("ArrowRight");
await page.evaluate(() => window.__nsShaftQa.setRaceRemotePlayer({ x: 88, facing: "left" }));
state = await capture("13b-online-split-race-motion");
if (state.race.local.players[0].x <= localStartX ||
    state.race.remote.players[0].x !== 88) {
  throw new Error(`Split race motion/snapshot failed: ${JSON.stringify(state.race)}`);
}
await page.setViewportSize({ width: 900, height: 700 });
await page.waitForTimeout(40);
const responsiveRaceGeometry = await page.locator("#race-stage").evaluate((stage) => {
  const stageRect = stage.getBoundingClientRect();
  const canvases = [...stage.querySelectorAll("canvas")].map((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, right: rect.right };
  });
  return { width: stageRect.width, right: stageRect.right, canvases };
});
if (responsiveRaceGeometry.width > 900 ||
    responsiveRaceGeometry.right > 900 ||
    responsiveRaceGeometry.canvases.some((item) => item.width <= 0 || item.right > 900)) {
  throw new Error(
    `Split race does not fit a narrow desktop viewport: ${JSON.stringify(responsiveRaceGeometry)}`
  );
}
await page.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("results", 5000));
await page.evaluate(() => window.__nsShaftQa.setOnlineResultRank(2));
state = await capture("13c-online-results");
const resultLayout = await page.locator("#online-result").evaluate((result) => ({
  visible: !result.hidden,
  score: result.querySelector('[data-result="score"]')?.textContent,
  rank: result.querySelector('[data-result="rank"]')?.textContent,
  next: result.querySelector('[data-result="next"]')?.textContent,
  rankBackground: getComputedStyle(result.querySelector('[data-result="rank"]')).backgroundColor
}));
if (state.online?.phase !== "results" || !state.online?.display || !resultLayout.visible ||
    !resultLayout.rank?.includes("BEST 5 第2位") ||
    !resultLayout.next?.includes("部屋に戻るまで 5") ||
    resultLayout.rankBackground !== "rgb(156, 227, 165)") {
  throw new Error(`Online results overlay is missing: ${JSON.stringify(state.online)}`);
}
await page.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("lobby"));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.ui !== "online" || state.online?.phase !== "lobby" ||
    await page.locator("#online-ready").isDisabled()) {
  throw new Error(`Online rematch lobby failed: ${JSON.stringify(state.online)}`);
}

if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
const report = {
  generatedAt: new Date().toISOString(),
  canvasGeometry,
  captures,
  consoleErrors: errors
};
await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2));
const archiveName = report.generatedAt.replaceAll(":", "-").replaceAll(".", "-");
const archive = new URL(`../runs/${archiveName}/`, output);
await mkdir(archive, { recursive: true });
await cp(output, archive, { recursive: true });
console.log(JSON.stringify(report, null, 2));
await browser.close();
