import { chromium } from "playwright";
import { cp, mkdir, writeFile } from "node:fs/promises";

const output = new URL("../artifacts/qa/current/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
const captures = [];
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

await page.getByRole("button", { name: "オプション" }).click();
await page.locator("#difficulty").selectOption("hard");
await page.locator("#conveyor").check();
await capture("02-options");
await page.getByRole("button", { name: "戻る" }).click();

await page.getByRole("button", { name: "ベスト５" }).click();
let state = await capture("03-records");
if (state.ui !== "records") throw new Error(`Records screen failed: ${state.ui}`);
await page.getByRole("button", { name: "戻る" }).click();

await page.getByRole("button", { name: "１人プレイ" }).click();
await page.waitForTimeout(150);
state = await capture("04-gameplay-initial");
if (state.mode !== "playing" || state.players.length !== 1) {
  throw new Error(`1P start failed: ${JSON.stringify(state)}`);
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
    leftWallBluePixels: count(22, 94, 16, 32, (r, g, b) => b > r && b > g),
    rightWallBluePixels: count(422, 94, 16, 32, (r, g, b) => b > r && b > g),
    floorPrefixStrayPixels: count(186, 12, 8, 32, (r, g, b) => r > 180 && g > 180 && b > 180),
    floorPrefixRightPixels: count(258, 12, 8, 32, (r, g, b) => r > 110 && g > 140 && b < 180),
    floorSuffixGapPixels: count(378, 12, 4, 32, (r, g, b) => r > 180 && g > 180 && b > 120),
    floorSuffixRightPixels: count(414, 12, 8, 32, (r, g, b) => r > 110 && g > 140 && b < 180),
    difficultyLeftStrayPixels: count(500, 113, 28, 13, (r, g, b) => r > 160 && g > 160 && b > 160)
  };
});
if (nativePixelAudit.texturedPixels < 500 ||
    nativePixelAudit.ceilingBrightPixels < 500 ||
    nativePixelAudit.leftWallBluePixels < 100 ||
    nativePixelAudit.rightWallBluePixels < 100 ||
    nativePixelAudit.floorPrefixStrayPixels > 4 ||
    nativePixelAudit.floorPrefixRightPixels < 8 ||
    nativePixelAudit.floorSuffixGapPixels > 4 ||
    nativePixelAudit.floorSuffixRightPixels < 8 ||
    nativePixelAudit.difficultyLeftStrayPixels > 4) {
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
      activationAgeMs: 430, height: 6 },
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
      activationState: "triggered", activationAgeMs: 180, height: 12
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
  throw new Error(`Rotating block did not drop after 200ms: ${JSON.stringify(state)}`);
}

await page.evaluate(() => {
  window.__nsShaftQa.setPlatforms([
    {
      id: 21, x: 80, y: 220, width: 96, kind: "rotating",
      variant: "disappearing", direction: 1, phase: 0, collidable: false,
      activationState: "disappearing", activationAgeMs: 440, height: 0
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
if (state.platforms[0].activationAgeMs < 440 ||
    state.platforms[0].activationAgeMs >= 500 ||
    state.platforms[0].activationState !== "disappearing") {
  throw new Error(`Rotating block skipped its last frame: ${JSON.stringify(state.platforms[0])}`);
}

await page.evaluate(() => window.advanceTime(60));
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
    standingPlatformId: 23
  });
  window.advanceTime(145);
});
await capture("05e-spring-compressing");

await page.evaluate(() => window.advanceTime(75));
state = await capture("05f-spring-rebounding");
if (state.players[0].standingPlatformId !== null || state.players[0].vy >= 0) {
  throw new Error(`Spring did not launch player: ${JSON.stringify(state.players[0])}`);
}

await page.getByRole("button", { name: "暫停" }).click();
await page.waitForTimeout(40);
state = await capture("06-paused");
if (state.mode !== "paused") throw new Error(`Pause failed: ${state.mode}`);
await page.getByRole("button", { name: "暫停" }).click();
await page.waitForTimeout(40);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.mode !== "playing") throw new Error(`Resume failed: ${state.mode}`);

await page.evaluate(() => window.dispatchEvent(new Event("blur")));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.mode !== "paused") throw new Error(`Blur did not auto-pause: ${state.mode}`);
await page.getByRole("button", { name: "暫停" }).click();

await page.evaluate(() => {
  window.__nsShaftQa.setProgress(170);
  window.__nsShaftQa.setPlayer(0, { alive: false, health: 0 });
  window.advanceTime(20);
});
state = await capture("07-name-entry");
if (state.ui !== "name-entry") throw new Error(`Name entry failed: ${state.ui}`);
await page.locator("#player-name").fill("CODEX");
await page.getByRole("button", { name: "登録" }).click();

await page.getByRole("button", { name: "ベスト５" }).click();
if (!(await page.locator("#records-list").innerText()).includes("CODEX")) {
  throw new Error("Recorded score was not shown in Best 5");
}
await capture("08-record-saved");
await page.getByRole("button", { name: "記録消去" }).click();
if ((await page.locator("#records-list").innerText()).includes("CODEX")) {
  throw new Error("Clear records did not remove the saved score");
}
await page.getByRole("button", { name: "戻る" }).click();

await page.getByRole("button", { name: "２人プレイ" }).click();
await page.keyboard.down("KeyX");
await page.waitForTimeout(120);
await page.keyboard.up("KeyX");
state = await capture("09-two-player");
if (state.players.length !== 2 || state.players[1].x <= 224) {
  throw new Error(`2P movement failed: ${JSON.stringify(state.players)}`);
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

await page.getByRole("button", { name: "中止遊戲" }).click();
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
