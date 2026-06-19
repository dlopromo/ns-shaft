import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.NS_SHAFT_URL ?? "http://127.0.0.1:5175/?qa=1";
const env = await readViteEnv();
if (!env.VITE_FIREBASE_DATABASE_URL) throw new Error("VITE_FIREBASE_DATABASE_URL is missing");

const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  const results = [];
  for (const mode of ["coop", "race"]) results.push(await runRoomFlow(mode));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}

if (errors.length > 0) throw new Error(errors.join(" | "));

async function runRoomFlow(mode) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"]
  });
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  let roomCode = "";

  for (const [name, page] of [[`${mode}-host`, host], [`${mode}-guest`, guest]]) {
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${name}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  }

  try {
    await Promise.all([
      host.goto(baseUrl, { waitUntil: "networkidle" }),
      guest.goto(baseUrl, { waitUntil: "networkidle" })
    ]);
    await openOnline(host, `HOST-${mode.toUpperCase()}-QA`);
    await host.locator("#online-mode").selectOption(mode);
    await host.getByRole("button", { name: "部屋を作る" }).click();
    await host.waitForFunction(() => /^\d{4}$/.test(document.querySelector("#online-code")?.value ?? ""));
    roomCode = await host.locator("#online-code").inputValue();
    assert(await host.evaluate(() => navigator.clipboard.readText()) === roomCode,
      `${mode}: created room code was not copied`);

    await openOnline(guest, `GUEST-${mode.toUpperCase()}-QA`);
    await guest.locator("#online-code").fill(roomCode);
    await guest.getByRole("button", { name: "部屋に入る" }).click();
    await guest.waitForTimeout(1500);
    const lobbyState = {
      hostStatus: await host.locator("#online-status").textContent(),
      guestStatus: await guest.locator("#online-status").textContent(),
      hostGuest: await host.locator('.online-player[data-player="1"]').getAttribute("data-status"),
      guestHost: await guest.locator('.online-player[data-player="0"]').getAttribute("data-status")
    };
    assert(lobbyState.hostGuest === "connected" && lobbyState.guestHost === "connected",
      `${mode}: lobby did not connect: ${JSON.stringify(lobbyState)}`);

    await Promise.all([
      host.getByRole("button", { name: "準備完了", exact: true }).click(),
      guest.getByRole("button", { name: "準備完了", exact: true }).click()
    ]);
    await Promise.all([
      waitForOnlinePhase(host, "countdown"),
      waitForOnlinePhase(guest, "countdown")
    ]);
    const frozenTicks = await Promise.all([
      gameState(host).then((state) => state.ticks),
      gameState(guest).then((state) => state.ticks)
    ]);
    await host.waitForTimeout(600);
    assert((await gameState(host)).ticks === frozenTicks[0] &&
      (await gameState(guest)).ticks === frozenTicks[1],
    `${mode}: simulation advanced during countdown`);
    await Promise.all([
      waitForOnlinePhase(host, "playing"),
      waitForOnlinePhase(guest, "playing")
    ]);
    if (mode === "race") {
      await Promise.all([
        host.locator("#race-stage").waitFor({ state: "visible" }),
        guest.locator("#race-stage").waitFor({ state: "visible" })
      ]);
      await Promise.all([
        host.waitForFunction(() => JSON.parse(window.render_game_to_text()).race?.remote !== null),
        guest.waitForFunction(() => JSON.parse(window.render_game_to_text()).race?.remote !== null)
      ]);
    } else {
      await Promise.all([
        host.waitForFunction(() => {
          const state = JSON.parse(window.render_game_to_text());
          return state.online?.status?.phase === "playing" && state.ticks > 3;
        }),
        guest.waitForFunction(() => {
          const state = JSON.parse(window.render_game_to_text());
          return state.online?.status?.phase === "playing" && state.ticks > 3;
        })
      ]);
    }

    const pauseButton = mode === "race" ? "#race-pause" : "#pause-control";
    await host.locator(pauseButton).click();
    await Promise.all([
      host.waitForFunction(() => JSON.parse(window.render_game_to_text()).online?.pause !== null),
      guest.waitForFunction(() => JSON.parse(window.render_game_to_text()).online?.pause !== null)
    ]);
    const pausedTicks = await Promise.all([
      gameState(host).then((state) => state.ticks),
      gameState(guest).then((state) => state.ticks)
    ]);
    await Promise.all([
      host.getByRole("button", { name: "再開準備", exact: true }).click(),
      guest.getByRole("button", { name: "再開準備", exact: true }).click()
    ]);
    await host.waitForFunction(() =>
      JSON.parse(window.render_game_to_text()).online?.pause?.resumeAt !== null
    );
    await host.waitForTimeout(1000);
    assert((await gameState(host)).ticks === pausedTicks[0] &&
      (await gameState(guest)).ticks === pausedTicks[1], `${mode}: simulation advanced while paused`);
    await Promise.all([
      host.waitForFunction(() => JSON.parse(window.render_game_to_text()).online?.pause === null),
      guest.waitForFunction(() => JSON.parse(window.render_game_to_text()).online?.pause === null)
    ]);

    await host.evaluate(() => window.__nsShaftQa.setOnlineRoundPhase("results", 1200));
    await Promise.all([
      waitForOnlinePhase(host, "results"),
      waitForOnlinePhase(guest, "results")
    ]);
    await Promise.all([
      waitForOnlinePhase(host, "lobby"),
      waitForOnlinePhase(guest, "lobby")
    ]);
    assert(await host.locator("#online-panel").isVisible() &&
      await guest.locator("#online-panel").isVisible(),
    `${mode}: clients did not return to lobby`);
    assert(!await host.getByRole("button", { name: "準備完了", exact: true }).isDisabled() &&
      !await guest.getByRole("button", { name: "準備完了", exact: true }).isDisabled(),
    `${mode}: Ready was not reset`);

    await Promise.all([
      host.getByRole("button", { name: "準備完了", exact: true }).click(),
      guest.getByRole("button", { name: "準備完了", exact: true }).click()
    ]);
    await Promise.all([
      host.waitForFunction(() => {
        const state = JSON.parse(window.render_game_to_text());
        return state.online?.phase === "countdown" && state.online?.round === 2;
      }),
      guest.waitForFunction(() => {
        const state = JSON.parse(window.render_game_to_text());
        return state.online?.phase === "countdown" && state.online?.round === 2;
      })
    ]);
    assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
    return {
      mode,
      roomCode,
      codeIsNumeric: /^\d{4}$/.test(roomCode),
      clipboard: "copied",
      hostAndGuest: "connected",
      ready: "both",
      countdown: "five-seconds-frozen",
      gameplay: mode === "race" ? "remote-snapshots-visible" : "lockstep-advanced",
      pause: "both-ready-three-second-resume",
      rematch: "same-room-round-2-countdown"
    };
  } finally {
    if (roomCode) await host.evaluate(() => {
      const visibleAbort = [...document.querySelectorAll("#abort-control, #race-abort")]
        .find((element) => !element.hidden);
      if (visibleAbort instanceof HTMLElement) visibleAbort.click();
      else document.querySelector("#online-panel [data-close]")?.click();
    }).catch(() => undefined);
    await host.waitForTimeout(300).catch(() => undefined);
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
}

async function openOnline(page, name) {
  await page.getByRole("button", { name: "オンライン2P" }).click();
  await page.locator("#online-name").fill(name);
}

function gameState(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}

function waitForOnlinePhase(page, phase) {
  return page.waitForFunction((expected) =>
    JSON.parse(window.render_game_to_text()).online?.phase === expected, phase
  );
}

async function readViteEnv() {
  const merged = {};
  for (const path of [".env", ".env.local"]) {
    try {
      const contents = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) merged[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return merged;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
