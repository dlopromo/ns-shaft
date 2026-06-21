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
    permissions: ["clipboard-read", "clipboard-write"],
    locale: "ja-JP",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const guestContext = await browser.newContext({
    locale: "ja-JP",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
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
    await host.getByRole("button", { name: "部屋を作る" }).click();
    await host.locator("#room-code-dialog").waitFor({ state: "visible" });
    await host.locator("#room-code-dialog").getByRole("button", { name: "部屋を作る" }).click();
    await host.waitForFunction(() => /^ROOM \d{4}$/.test(
      document.querySelector("[data-online-header]")?.textContent?.trim() ?? ""
    ));
    roomCode = (await host.locator("[data-online-header]").first().textContent()).match(/\d{4}/)?.[0] ?? "";
    await host.getByRole("button", { name: "コードをコピー" }).click();
    assert(await host.evaluate(() => navigator.clipboard.readText()) === roomCode,
      `${mode}: created room code was not copied`);

    await openOnline(guest, `GUEST-${mode.toUpperCase()}-QA`);
    await guest.getByRole("button", { name: "部屋に入る" }).click();
    await guest.locator("#room-code-input").fill(roomCode);
    await guest.locator("#room-code-dialog").getByRole("button", { name: "部屋に入る" }).click();
    await Promise.all([
      host.waitForFunction(() =>
        document.querySelector('.online-player[data-player="1"]')?.dataset.status === "connected"),
      guest.waitForFunction(() =>
        document.querySelector('.online-player[data-player="0"]')?.dataset.status === "connected")
    ]);
    const lobbyState = {
      hostStatus: await host.locator("#online-status").textContent(),
      guestStatus: await guest.locator("#online-status").textContent(),
      hostGuest: await host.locator('.online-player[data-player="1"]').getAttribute("data-status"),
      guestHost: await guest.locator('.online-player[data-player="0"]').getAttribute("data-status")
    };
    assert(lobbyState.hostGuest === "connected" && lobbyState.guestHost === "connected",
      `${mode}: lobby did not connect: ${JSON.stringify(lobbyState)}`);
    await host.locator("#online-room-mode").selectOption(mode);
    await host.locator("#online-difficulty").selectOption("hard");
    await host.locator("#online-conveyor").uncheck();
    await host.locator("#online-spring").check();
    await host.locator("#online-rotating").uncheck();
    await host.locator("#online-fast").check();
    await Promise.all([
      host.waitForFunction((expected) => JSON.parse(window.render_game_to_text()).online?.mode === expected, mode),
      guest.waitForFunction((expected) => JSON.parse(window.render_game_to_text()).online?.mode === expected, mode),
      guest.waitForFunction(() => {
        return document.querySelector("#online-difficulty")?.value === "hard" &&
          !document.querySelector("#online-conveyor")?.checked &&
          document.querySelector("#online-spring")?.checked &&
          !document.querySelector("#online-rotating")?.checked &&
          document.querySelector("#online-fast")?.checked;
      })
    ]);
    assert(await guest.locator("#online-difficulty").isDisabled() &&
      await guest.locator("#online-fast").isDisabled() &&
      await guest.locator("#online-room-mode").isDisabled(),
      `${mode}: guest could edit shared room settings`);

    await Promise.all([
      host.getByRole("button", { name: "準備完了", exact: true }).click(),
      guest.getByRole("button", { name: "準備完了", exact: true }).click()
    ]);
    await host.waitForFunction(() => !document.querySelector("#online-start")?.disabled);
    assert((await gameState(host)).online.phase === "lobby" &&
      await guest.locator("#online-start").isDisabled(),
    `${mode}: ready state auto-started or guest START was enabled`);
    await host.getByRole("button", { name: "開始", exact: true }).click();
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
      const labels = {
        hostLocal: await host.locator(".race-pane-local header").textContent(),
        hostRemote: await host.locator(".race-pane-remote header").textContent(),
        guestLocal: await guest.locator(".race-pane-local header").textContent(),
        guestRemote: await guest.locator(".race-pane-remote header").textContent()
      };
      assert(labels.hostLocal !== labels.hostRemote && labels.guestLocal !== labels.guestRemote,
        `race: local and remote identity labels were duplicated: ${JSON.stringify(labels)}`);
      await Promise.all([
        host.keyboard.down("ArrowRight"),
        guest.keyboard.down("ArrowLeft")
      ]);
      await host.waitForTimeout(150);
      await Promise.all([
        host.keyboard.up("ArrowRight"),
        guest.keyboard.up("ArrowLeft")
      ]);
      await host.waitForTimeout(150);
      const hostRace = (await gameState(host)).race;
      const guestRace = (await gameState(guest)).race;
      assert(Math.abs(hostRace.remote.players[0].x - guestRace.local.players[0].x) < 24,
        "race: host remote pane is not following the guest");
      assert(Math.abs(guestRace.remote.players[0].x - hostRace.local.players[0].x) < 24,
        "race: guest remote pane is not following the host");
      assert((await gameState(host)).online.connection === "healthy" &&
        (await gameState(guest)).online.connection === "healthy",
      "race: active opponent snapshots were classified as disconnected");
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
      const before = await gameState(host);
      await Promise.all([
        host.keyboard.down("ArrowRight"),
        guest.keyboard.down("ArrowLeft")
      ]);
      await host.waitForTimeout(400);
      await Promise.all([
        host.keyboard.up("ArrowRight"),
        guest.keyboard.up("ArrowLeft")
      ]);
      await host.waitForTimeout(350);
      const [hostCoop, guestCoop] = await Promise.all([gameState(host), gameState(guest)]);
      assert(hostCoop.players[0].x !== before.players[0].x &&
        hostCoop.players[1].x !== before.players[1].x,
      "coop: both arrow-key players did not move");
      assert(hostCoop.online.connection === "healthy" && guestCoop.online.connection === "healthy",
        "coop: active opponent batches were classified as disconnected");
      await Promise.all([
        host.waitForFunction(() =>
          JSON.parse(window.render_game_to_text()).online?.sync?.peerStateMatch === true),
        guest.waitForFunction(() =>
          JSON.parse(window.render_game_to_text()).online?.sync?.peerStateMatch === true)
      ]);
      await guest.reload({ waitUntil: "domcontentloaded" });
      await guest.waitForFunction(() => {
        const state = JSON.parse(window.render_game_to_text());
        return state.online?.phase === "playing" && state.online?.sync?.simulationTick > 0;
      });
    }

    const pauseButton = "#mobile-primary";
    await host.locator(pauseButton).waitFor({ state: "visible" });
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
    await host.waitForFunction(() => !document.querySelector("#online-start")?.disabled);
    await host.getByRole("button", { name: "開始", exact: true }).click();
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
      const visibleAbort = [...document.querySelectorAll("#mobile-abort, #abort-control, #race-abort")]
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
