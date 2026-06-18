import "./style.css";
import { AUDIO_EFFECTS, GameAudio, type EffectName } from "./game/audio";
import { KeyboardInput } from "./game/input";
import { Renderer } from "./game/renderer";
import { integerScaleForViewport } from "./game/layout";
import { GameSimulation } from "./game/simulation";
import { loadSave, recordScore, SAVE_KEY } from "./game/storage";
import { OnlineGameController } from "./game/online/controller";
import { copyRoomCode } from "./game/online/clipboard";
import { createRealtimeDatabasePort } from "./game/online/firebase";
import { buildLobbyView, type LobbyRoomData } from "./game/online/lobby";
import {
  OnlineRaceController,
  serializeRaceSnapshot,
  type RaceSnapshot
} from "./game/online/race";
import { buildFirebaseConfig, validateRoomCode } from "./game/online/room";
import {
  ONLINE_COUNTDOWN_MS,
  ONLINE_RESULTS_MS,
  nextOnlineHostAction,
  onlineCountdownLabel,
  onlineRaceResult,
  shouldShowRemoteWaiting,
  type OnlineRoomPhase
} from "./game/online/round";
import {
  FirebaseOnlineSession,
  type NetworkInput,
  type OnlineRoomHandle,
  type OnlineRoomMode
} from "./game/online/session";
import type { Difficulty, GameStateSnapshot, InputFrame, SaveData } from "./game/types";

interface OnlineRoomMeta {
  seed?: number;
  difficulty?: Difficulty;
  options?: SaveData["settings"];
  mode?: OnlineRoomMode;
  phase?: OnlineRoomPhase;
  round?: number;
  countdownEndsAt?: number | null;
  resultsEndsAt?: number | null;
  hostConnected?: boolean;
  guestConnected?: boolean;
}

interface OnlineRoomData extends LobbyRoomData {
  meta?: OnlineRoomMeta;
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __nsShaftQa?: {
      setPlayer: (index: number, patch: Record<string, unknown>) => void;
      setPlatforms: (platforms: Record<string, unknown>[]) => void;
      setProgress: (floorSequence: number) => void;
      startRace: () => void;
      setRaceRemotePlayer: (patch: Record<string, unknown>) => void;
      setOnlineRoundPhase: (phase: OnlineRoomPhase, endsInMs?: number) => void;
      showOnlineLobby: (
        players: LobbyRoomData["players"],
        localPlayerId?: 0 | 1
      ) => void;
    };
  }
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app was not found");
const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
const soundPreviewRows = AUDIO_EFFECTS.map((effect) => `
  <li>
    <button type="button" data-sound-preview="${effect.event}">Play</button>
    <span>${effect.event}</span>
    <code>wave-${effect.resourceId}</code>
    <small>${Math.round(effect.durationMs)}ms</small>
  </li>
`).join("");

root.innerHTML = `
  <main class="cabinet">
    <section class="game-frame" aria-label="NS-SHAFT 1.3J">
      <canvas id="game" aria-label="NS-SHAFT game canvas"></canvas>
      <button id="pause-control" class="frame-control pause-control" aria-label="暫停"></button>
      <button id="abort-control" class="frame-control abort-control" aria-label="中止遊戲"></button>
      <div id="title-screen" class="screen title-screen">
        <img class="title-art" src="${assetUrl("assets/web/rt_bitmap-104-1041.png")}" alt="NS-SHAFT Ver 1.3J">
        <nav class="main-menu">
          <button data-start="1">１人プレイ</button>
          <button data-start="2">２人プレイ</button>
          <button data-open="online">ONLINE 2P</button>
          <button data-open="records">ベスト５</button>
          <button data-open="options">オプション</button>
          <button data-open="about">このソフトについて</button>
        </nav>
        <p class="key-help">1P ← →　2P Z X　ESC 一時停止　F 全画面</p>
      </div>

      <section id="options-panel" class="screen dialog-screen" hidden>
        <div class="dialog">
          <h2>難易度・オプション</h2>
          <label>難易度
            <select id="difficulty">
              <option value="easy">やさしい</option>
              <option value="normal">ふつう</option>
              <option value="hard">むずかしい</option>
            </select>
          </label>
          <label><input id="conveyor" type="checkbox"> ベルトコンベア</label>
          <label><input id="spring" type="checkbox"> ジャンプ台</label>
          <label><input id="rotating" type="checkbox"> 回る床</label>
          <label><input id="music" type="checkbox"> 音楽</label>
          <label><input id="sound" type="checkbox"> 効果音</label>
          <label><input id="fast" type="checkbox"> 高速化</label>
          <section class="sound-preview" aria-label="効果音テスト">
            <h3>効果音テスト</h3>
            <ol>${soundPreviewRows}</ol>
          </section>
          <button data-close>戻る</button>
        </div>
      </section>

      <section id="records-panel" class="screen records-screen" hidden>
        <div class="records-content">
          <h2>BEST 5</h2>
          <div id="records-list"></div>
          <div class="dialog-actions">
            <button id="clear-records">記録消去</button>
            <button data-close>戻る</button>
          </div>
        </div>
      </section>

      <section id="online-panel" class="screen dialog-screen" hidden>
        <div class="dialog online-dialog">
          <h2>ONLINE 2P</h2>
          <p id="online-status">Create a room or join with a 6 digit code.</p>
          <label>Mode
            <select id="online-mode">
              <option value="coop">Co-op 2P</option>
              <option value="race">Split Race</option>
            </select>
          </label>
          <label>名前 <input id="online-name" maxlength="12" autocomplete="off" value="PLAYER"></label>
          <section id="online-players" class="online-players" aria-label="Room players" hidden>
            <div class="online-player" data-player="0" data-status="waiting">
              <span>P1 HOST</span><b>---</b><strong>WAITING</strong>
            </div>
            <div class="online-player" data-player="1" data-status="waiting">
              <span>P2 GUEST</span><b>---</b><strong>WAITING</strong>
            </div>
          </section>
          <div class="dialog-actions">
            <button id="online-create" type="button">Create Room</button>
            <button id="online-ready" type="button" data-state="available" disabled>Ready</button>
          </div>
          <label>Room Code <input id="online-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off"></label>
          <div class="dialog-actions">
            <button id="online-join" type="button">Join Room</button>
            <button id="online-copy" type="button" disabled>Copy Code</button>
            <button data-close type="button">戻る</button>
          </div>
        </div>
      </section>

      <section id="about-panel" class="screen about-screen" hidden>
        <img src="${assetUrl("assets/web/rt_bitmap-105-1041.png")}" alt="NS-SHAFT copyright">
        <button data-close>戻る</button>
      </section>

      <section id="name-panel" class="screen dialog-screen" hidden>
        <form id="name-form" class="dialog">
          <h2>BEST 5 入賞</h2>
          <p id="final-score"></p>
          <label>名前 <input id="player-name" maxlength="12" autocomplete="off"></label>
          <button type="submit">登録</button>
        </form>
      </section>
    </section>
    <section id="race-stage" class="race-stage" aria-label="Online split-screen race" hidden>
      <div class="race-strip">
        <article class="race-pane race-pane-local" data-role="local" data-player-color="yellow">
          <header>YOU</header>
          <canvas id="race-local" class="race-canvas" aria-label="Your race game"></canvas>
        </article>
        <article class="race-pane race-pane-remote" data-role="remote" data-player-color="green">
          <header>OPPONENT</header>
          <canvas id="race-remote" class="race-canvas" aria-label="Opponent race game"></canvas>
        </article>
        <div class="race-actions">
          <span id="race-status">ONLINE SPLIT RACE</span>
          <button id="race-pause" type="button">暫停</button>
          <button id="race-abort" type="button">中止遊戲</button>
        </div>
      </div>
    </section>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const cabinet = document.querySelector<HTMLElement>(".cabinet")!;
const gameFrame = document.querySelector<HTMLElement>(".game-frame")!;
const title = document.querySelector<HTMLElement>("#title-screen")!;
const optionsPanel = document.querySelector<HTMLElement>("#options-panel")!;
const recordsPanel = document.querySelector<HTMLElement>("#records-panel")!;
const onlinePanel = document.querySelector<HTMLElement>("#online-panel")!;
const aboutPanel = document.querySelector<HTMLElement>("#about-panel")!;
const namePanel = document.querySelector<HTMLElement>("#name-panel")!;
const difficulty = document.querySelector<HTMLSelectElement>("#difficulty")!;
const onlineStatus = document.querySelector<HTMLElement>("#online-status")!;
const onlineMode = document.querySelector<HTMLSelectElement>("#online-mode")!;
const onlineName = document.querySelector<HTMLInputElement>("#online-name")!;
const onlineCode = document.querySelector<HTMLInputElement>("#online-code")!;
const onlineCreate = document.querySelector<HTMLButtonElement>("#online-create")!;
const onlineJoin = document.querySelector<HTMLButtonElement>("#online-join")!;
const onlineReady = document.querySelector<HTMLButtonElement>("#online-ready")!;
const onlineCopy = document.querySelector<HTMLButtonElement>("#online-copy")!;
const onlinePlayers = document.querySelector<HTMLElement>("#online-players")!;
const pauseControl = document.querySelector<HTMLButtonElement>("#pause-control")!;
const abortControl = document.querySelector<HTMLButtonElement>("#abort-control")!;
const raceStage = document.querySelector<HTMLElement>("#race-stage")!;
const raceStatus = document.querySelector<HTMLElement>("#race-status")!;
const racePause = document.querySelector<HTMLButtonElement>("#race-pause")!;
const raceAbort = document.querySelector<HTMLButtonElement>("#race-abort")!;
const raceLocalCanvas = document.querySelector<HTMLCanvasElement>("#race-local")!;
const raceRemoteCanvas = document.querySelector<HTMLCanvasElement>("#race-remote")!;
const raceLocalLabel = document.querySelector<HTMLElement>(".race-pane-local header")!;
const raceRemoteLabel = document.querySelector<HTMLElement>(".race-pane-remote header")!;
const renderer = new Renderer(canvas);
const raceLocalRenderer = new Renderer(raceLocalCanvas);
const raceRemoteRenderer = new Renderer(raceRemoteCanvas);
const keyboard = new KeyboardInput();
const audio = new GameAudio();
let save: SaveData = loadSave(localStorage.getItem(SAVE_KEY));
let game: GameSimulation | null = null;
let onlineGame: OnlineGameController | null = null;
let onlineRace: OnlineRaceController | null = null;
let onlineSession: FirebaseOnlineSession | null = null;
let onlineRoom: OnlineRoomHandle | null = null;
let unsubscribeOnlineRoom: (() => void) | null = null;
let unsubscribeOnlineInputs: (() => void) | null = null;
let unsubscribeRaceSnapshots: (() => void) | null = null;
let onlineRoomData: OnlineRoomData | null = null;
let onlinePhase: OnlineRoomPhase | null = null;
let onlineServerOffsetMs = 0;
let onlineTransitionPending = false;
let onlinePreparedRound = -1;
let playerCount: 1 | 2 = 1;
let accumulator = 0;
let lastTime = performance.now();
let scoreHandled = false;
const STEP_MS = 1000 / 60;
const qaMode = new URLSearchParams(location.search).get("qa") === "1";
pauseControl.hidden = true;
abortControl.hidden = true;

function persist(): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function syncRendererSettings(): void {
  const settings = {
    fast: save.settings.fast,
    recordFloor: save.records[save.settings.difficulty][0]?.floor ?? 0
  };
  renderer.configure(settings);
  raceLocalRenderer.configure(settings);
  raceRemoteRenderer.configure({ ...settings, playerColorOverride: "green" });
}

function onlineServerNow(): number {
  return Date.now() + onlineServerOffsetMs;
}

function applySettingsToControls(): void {
  difficulty.value = save.settings.difficulty;
  for (const key of ["conveyor", "spring", "rotating", "music", "sound", "fast"] as const) {
    document.querySelector<HTMLInputElement>(`#${key}`)!.checked = save.settings[key];
  }
  syncRendererSettings();
}

function closePanels(): void {
  optionsPanel.hidden = true;
  recordsPanel.hidden = true;
  onlinePanel.hidden = true;
  aboutPanel.hidden = true;
  namePanel.hidden = true;
}

async function start(players: 1 | 2): Promise<void> {
  playerCount = players;
  onlineGame = null;
  onlineRace = null;
  scoreHandled = false;
  await audio.unlock().catch(() => undefined);
  audio.configure(save.settings);
  void audio.startMusic();
  game = new GameSimulation({
    seed: qaMode ? 1337 : Date.now(),
    difficulty: save.settings.difficulty,
    players
  });
  game.setOptions(save.settings);
  syncRendererSettings();
  closePanels();
  cabinet.classList.remove("race-active");
  raceStage.hidden = true;
  gameFrame.hidden = false;
  title.hidden = true;
  pauseControl.hidden = false;
  abortControl.hidden = false;
  renderer.render(game.snapshot());
}

function showTitle(): void {
  game = null;
  onlineGame = null;
  onlineRace = null;
  void leaveOnlineRoom();
  audio.stopMusic();
  closePanels();
  title.hidden = false;
  cabinet.classList.remove("race-active");
  raceStage.hidden = true;
  gameFrame.hidden = false;
  pauseControl.hidden = true;
  abortControl.hidden = true;
}

function togglePause(): void {
  if (onlineRoom && onlinePhase !== "playing") return;
  if ((!game && !onlineRace && !onlineGame) || game?.snapshot().mode === "gameover" ||
      onlineGame?.snapshot().mode === "gameover" ||
      onlineRace?.localSnapshot().mode === "gameover") return;
  const idle: InputFrame = {
    players: [{ left: false, right: false }, { left: false, right: false }],
    pausePressed: true
  };
  update(idle, 0);
}

function qualifiesForRecord(state: GameStateSnapshot): boolean {
  const records = save.records[state.difficulty];
  return playerCount === 1 && state.floor > 0 &&
    (records.length < 5 || state.floor > records[records.length - 1].floor);
}

function handleGameOver(state: GameStateSnapshot): void {
  if (scoreHandled) return;
  scoreHandled = true;
  audio.stopMusic();
  if (qualifiesForRecord(state)) {
    document.querySelector("#final-score")!.textContent = `${state.floor} 階`;
    const input = document.querySelector<HTMLInputElement>("#player-name")!;
    input.value = save.lastInputName;
    namePanel.hidden = false;
    input.focus();
  }
}

function update(input: InputFrame, elapsedMs = STEP_MS): void {
  if (onlineRace) {
    if (onlinePhase === "playing") onlineRace.step(input);
    const local = onlineRace.localSnapshot();
    const remote = onlineRace.remoteRenderSnapshot();
    audio.consume(onlineRace.drainEvents());
    raceLocalRenderer.render(local);
    raceRemoteRenderer.render(remote ?? local);
    drawRaceStatus();
    drawOnlineRoundOverlay();
    return;
  }
  if (onlineGame) {
    if (onlinePhase === "playing") onlineGame.step(input);
    const state = onlineGame.snapshot();
    audio.consume(onlineGame.drainEvents());
    renderer.render(state);
    if (onlinePhase === "playing" && onlineGame.status().phase === "waiting") {
      drawOnlineWaiting();
    }
    drawOnlineRoundOverlay();
    return;
  }
  if (!game) return;
  game.step(input, elapsedMs);
  const state = game.snapshot();
  audio.consume(game.drainEvents());
  renderer.render(state);
  if (state.mode === "gameover") handleGameOver(state);
}

function frame(now: number): void {
  accumulator += Math.min(100, now - lastTime);
  lastTime = now;
  while (accumulator >= STEP_MS) {
    update(keyboard.read(), STEP_MS);
    accumulator -= STEP_MS;
  }
  if (onlineRoom?.role === "host") void driveOnlineRoundLifecycle();
  requestAnimationFrame(frame);
}

function renderRecords(): void {
  const names: Record<Difficulty, string> = { easy: "やさしい", normal: "ふつう", hard: "むずかしい" };
  document.querySelector("#records-list")!.innerHTML = (["easy", "normal", "hard"] as Difficulty[])
    .map((level) => `
      <section><h3>${names[level]}</h3><ol>${
        Array.from({ length: 5 }, (_, index) => {
          const entry = save.records[level][index];
          return `<li><span>${entry?.name ?? "--------"}</span><b>${entry?.floor ?? 0} 階</b></li>`;
        }).join("")
      }</ol></section>`).join("");
}

function getOnlineSession(): FirebaseOnlineSession {
  if (onlineSession) return onlineSession;
  const config = buildFirebaseConfig(import.meta.env as Record<string, string | undefined>);
  onlineSession = new FirebaseOnlineSession(createRealtimeDatabasePort(config));
  return onlineSession;
}

function setOnlineStatus(
  message: string,
  tone: "neutral" | "success" | "error" = "neutral"
): void {
  onlineStatus.textContent = message;
  onlineStatus.dataset.tone = tone;
}

function setOnlineControlsLocked(locked: boolean): void {
  onlineMode.disabled = locked;
  onlineName.disabled = locked;
  onlineCode.readOnly = locked;
  onlineCreate.disabled = locked;
  onlineJoin.disabled = locked;
  onlineCopy.disabled = !locked;
  if (!locked) {
    onlinePlayers.hidden = true;
    onlineReady.disabled = true;
    onlineReady.dataset.state = "available";
    onlineReady.textContent = "Ready";
  }
}

function renderOnlineLobby(room: LobbyRoomData, localPlayerId: 0 | 1): void {
  const view = buildLobbyView(room, localPlayerId);
  onlinePlayers.hidden = false;
  for (const player of view.players) {
    const row = onlinePlayers.querySelector<HTMLElement>(`[data-player="${player.playerId}"]`)!;
    row.dataset.status = player.status;
    row.querySelector("span")!.textContent = player.label;
    row.querySelector("b")!.textContent = player.name;
    row.querySelector("strong")!.textContent = player.text;
  }
  onlineReady.dataset.state = view.readyButton.state;
  onlineReady.textContent = view.readyButton.label;
  onlineReady.disabled = view.readyButton.disabled;
}

async function copyCurrentRoomCode(): Promise<void> {
  if (!onlineRoom) return;
  const result = await copyRoomCode(onlineRoom.roomCode, navigator.clipboard);
  if (result === "copied") {
    setOnlineStatus(`Room ${onlineRoom.roomCode} copied. Share this code.`, "success");
    return;
  }
  onlineCode.focus();
  onlineCode.select();
  setOnlineStatus(
    `Room ${onlineRoom.roomCode} created. Clipboard ${result}; copy the selected code.`,
    "error"
  );
}

function onlinePlayerName(): string {
  return onlineName.value.trim().slice(0, 12) || "PLAYER";
}

function showOnlineRoomLobby(room: OnlineRoomHandle, roomData: OnlineRoomData): void {
  onlineGame = null;
  onlineRace = null;
  onlinePreparedRound = -1;
  audio.stopMusic();
  closePanels();
  title.hidden = true;
  onlinePanel.hidden = false;
  gameFrame.hidden = false;
  raceStage.hidden = true;
  cabinet.classList.remove("race-active");
  pauseControl.hidden = true;
  abortControl.hidden = true;
  setOnlineControlsLocked(true);
  renderOnlineLobby(roomData, room.playerId);
  updateFullscreenScale();
}

function onlineRoundFinished(): boolean {
  if (onlineGame) return onlineGame.snapshot().mode === "gameover";
  if (onlineRace) {
    const status = onlineRace.status();
    return status.localFinished && status.remoteFinished;
  }
  return false;
}

async function driveOnlineRoundLifecycle(): Promise<void> {
  const room = onlineRoom;
  const data = onlineRoomData;
  if (!room || room.role !== "host" || !data?.meta || onlineTransitionPending) return;
  const hostReady = Boolean(data.players?.[0]?.ready);
  const guestReady = Boolean(data.players?.[1]?.ready);
  const now = onlineServerNow();
  const action = nextOnlineHostAction({
    phase: data.meta.phase ?? "lobby",
    bothReady: hostReady && guestReady,
    roundFinished: onlineRoundFinished(),
    now,
    countdownEndsAt: data.meta.countdownEndsAt ?? undefined,
    resultsEndsAt: data.meta.resultsEndsAt ?? undefined
  });
  if (!action) return;

  onlineTransitionPending = true;
  const session = getOnlineSession();
  try {
    if (action === "begin-countdown") {
      await session.beginCountdown(room.roomCode, {
        seed: Math.floor(Math.random() * 0x7fffffff),
        round: (data.meta.round ?? 0) + 1,
        countdownEndsAt: now + ONLINE_COUNTDOWN_MS
      });
    } else if (action === "begin-playing") {
      await session.beginPlaying(room.roomCode);
    } else if (action === "begin-results") {
      await session.beginResults(room.roomCode, now + ONLINE_RESULTS_MS);
    } else {
      await session.resetForRematch(room.roomCode);
    }
  } catch (error) {
    setOnlineStatus(
      error instanceof Error ? error.message : "Unable to advance online round",
      "error"
    );
  } finally {
    onlineTransitionPending = false;
  }
}

async function leaveOnlineRoom(): Promise<void> {
  const room = onlineRoom;
  const session = onlineSession;
  unsubscribeOnlineRoom?.();
  unsubscribeOnlineInputs?.();
  unsubscribeRaceSnapshots?.();
  unsubscribeOnlineRoom = null;
  unsubscribeOnlineInputs = null;
  unsubscribeRaceSnapshots = null;
  onlineRoom = null;
  onlineRoomData = null;
  onlinePhase = null;
  onlinePreparedRound = -1;
  onlineTransitionPending = false;
  setOnlineControlsLocked(false);
  if (room && session) {
    await session.leaveRoom(room.roomCode, room.playerId).catch(() => undefined);
  }
}

function subscribeOnlineRoom(room: OnlineRoomHandle): void {
  unsubscribeOnlineRoom?.();
  unsubscribeOnlineInputs?.();
  unsubscribeRaceSnapshots?.();
  const session = getOnlineSession();
  unsubscribeOnlineRoom = session.subscribeRoom(room.roomCode, (snapshot) => {
    if (!snapshot) {
      onlineRoom = null;
      showTitle();
      return;
    }
    const roomData = snapshot as OnlineRoomData;
    const hostReady = Boolean(roomData.players?.[0]?.ready);
    const guestReady = Boolean(roomData.players?.[1]?.ready);
    const guestPresent = Boolean(roomData.players?.[1]);
    const previousPhase = onlinePhase;
    const phase = roomData.meta?.phase ?? "lobby";
    onlineRoomData = roomData;
    onlinePhase = phase;
    renderOnlineLobby(roomData, room.playerId);
    if (phase === "lobby") {
      if (onlineGame || onlineRace || previousPhase === "results") {
        showOnlineRoomLobby(room, roomData);
      }
      setOnlineStatus(
        `Room ${room.roomCode} · ${guestPresent ? "2 players connected" : "waiting for guest"} · ` +
        `${hostReady && guestReady ? "starting countdown" : "press Ready"}`,
        hostReady && guestReady ? "success" : "neutral"
      );
    }
    if (phase === "ended" && onlineRoom?.roomCode === room.roomCode) {
      setOnlineStatus("Room closed.");
      showTitle();
      return;
    }
    if (room.role === "host" && !guestPresent && roomData.meta?.guestConnected &&
        !onlineTransitionPending) {
      onlineTransitionPending = true;
      void session.leaveRoom(room.roomCode, 1).finally(() => {
        onlineTransitionPending = false;
      });
      return;
    }
    if (phase === "countdown") {
      prepareOnlineMode(room, roomData.meta ?? {});
      setOnlineStatus(`Room ${room.roomCode} countdown`, "success");
    }
    if (phase === "playing") {
      prepareOnlineMode(room, roomData.meta ?? {});
      if (previousPhase !== "playing") void audio.startMusic();
      setOnlineStatus(`Room ${room.roomCode} playing`, "success");
    }
    if (phase === "results") {
      audio.stopMusic();
      setOnlineStatus(`Room ${room.roomCode} results`, "success");
    }
    void driveOnlineRoundLifecycle();
  });
  if (room.mode === "coop") {
    unsubscribeOnlineInputs = session.subscribeInputs(room.roomCode, (snapshot) => {
      if (!onlineGame || !snapshot) return;
      const ticks = snapshot as Record<string, Record<string, NetworkInput>>;
      for (const [tick, players] of Object.entries(ticks)) {
        for (const [playerId, input] of Object.entries(players)) {
          if (playerId === "0" || playerId === "1") {
            onlineGame.queueRemoteInput(Number(tick), Number(playerId) as 0 | 1, input);
          }
        }
      }
    });
  } else {
    unsubscribeRaceSnapshots = session.subscribeRaceSnapshots(room.roomCode, (snapshot) => {
      if (!onlineRace || !snapshot) return;
      const snapshots = snapshot as Partial<Record<0 | 1, RaceSnapshot>>;
      for (const raceSnapshot of Object.values(snapshots)) {
        if (raceSnapshot) onlineRace.receiveSnapshot(raceSnapshot);
      }
    });
  }
}

function prepareOnlineMode(
  room: OnlineRoomHandle,
  meta: OnlineRoomMeta
): void {
  const round = meta.round ?? 0;
  if (onlinePreparedRound === round && (onlineGame || onlineRace)) return;
  onlinePreparedRound = round;
  if ((meta.mode ?? room.mode) === "race") {
    prepareOnlineRace(room, meta);
    return;
  }
  prepareOnlineCoop(room, meta);
}

function onlineOptions(meta: { options?: Partial<SaveData["settings"]> }) {
  return {
    conveyor: meta.options?.conveyor ?? save.settings.conveyor,
    spring: meta.options?.spring ?? save.settings.spring,
    rotating: meta.options?.rotating ?? save.settings.rotating,
    fast: meta.options?.fast ?? save.settings.fast
  };
}

function prepareOnlineCoop(
  room: OnlineRoomHandle,
  meta: OnlineRoomMeta
): void {
  const seed = meta.seed ?? Date.now();
  const onlineDifficulty = meta.difficulty ?? save.settings.difficulty;
  onlineGame = new OnlineGameController({
    seed,
    difficulty: onlineDifficulty,
    options: onlineOptions(meta),
    networkDelayTicks: 6,
    playerId: room.playerId,
    sendInput: async (tick, playerId, input) => {
      await getOnlineSession().sendInput(room.roomCode, tick, playerId, input);
    }
  });
  playerCount = 2;
  game = null;
  onlineRace = null;
  scoreHandled = false;
  audio.configure(save.settings);
  closePanels();
  cabinet.classList.remove("race-active");
  raceStage.hidden = true;
  gameFrame.hidden = false;
  title.hidden = true;
  pauseControl.hidden = false;
  abortControl.hidden = false;
  setOnlineStatus(`Room ${room.roomCode} playing`);
  renderer.render(onlineGame.snapshot());
}

function prepareOnlineRace(
  room: OnlineRoomHandle,
  meta: OnlineRoomMeta,
  sendSnapshot?: (snapshot: RaceSnapshot) => Promise<void>
): void {
  onlineRace = new OnlineRaceController({
    seed: meta.seed ?? Date.now(),
    difficulty: meta.difficulty ?? save.settings.difficulty,
    options: onlineOptions(meta),
    playerId: room.playerId,
    playerName: onlinePlayerName(),
    snapshotIntervalTicks: 6,
    sendSnapshot: sendSnapshot ?? (async (snapshot) => {
      await getOnlineSession().sendRaceSnapshot(room.roomCode, room.playerId, snapshot);
    })
  });
  onlineGame = null;
  game = null;
  playerCount = 1;
  scoreHandled = true;
  audio.configure(save.settings);
  closePanels();
  title.hidden = true;
  gameFrame.hidden = true;
  raceStage.hidden = false;
  cabinet.classList.add("race-active");
  raceStatus.textContent = `ROOM ${room.roomCode} · SPLIT RACE`;
  raceLocalLabel.textContent = `YOU · ${onlinePlayerName()}`;
  const opponentId = room.playerId === 0 ? 1 : 0;
  raceRemoteLabel.textContent = `OPPONENT · ${onlineRoomData?.players?.[opponentId]?.name ?? "PLAYER"}`;
  const initial = onlineRace.localSnapshot();
  raceLocalRenderer.render(initial);
  raceRemoteRenderer.render(initial);
  updateFullscreenScale();
}

function drawCanvasOverlay(target: HTMLCanvasElement, titleText: string, detail: string): void {
  const context = target.getContext("2d");
  if (!context) return;
  context.save();
  context.fillStyle = "rgba(0, 0, 0, .72)";
  context.fillRect(148, 178, 338, 58);
  context.fillStyle = "#fff";
  context.font = "16px monospace";
  context.fillText(titleText, 218, 202);
  context.font = "12px monospace";
  context.fillText(detail, 218, 220);
  context.restore();
}

function drawOnlineRoundOverlay(): void {
  const countdownEndsAt = onlineRoomData?.meta?.countdownEndsAt ?? undefined;
  const label = countdownEndsAt === undefined
    ? null : onlineCountdownLabel(onlineServerNow(), countdownEndsAt);
  if ((onlinePhase === "countdown" || onlinePhase === "playing") && label) {
    const detail = label === "GO!" ? "" : "GET READY";
    if (onlineRace) {
      drawCanvasOverlay(raceLocalCanvas, label, detail);
      drawCanvasOverlay(raceRemoteCanvas, label, detail);
    } else {
      drawCanvasOverlay(canvas, label, detail);
    }
    raceStatus.textContent = label === "GO!" ? "GO!" : `START IN ${label}`;
    return;
  }
  if (onlinePhase !== "results") return;
  if (onlineRace) {
    const local = onlineRace.localSnapshot();
    const remote = onlineRace.remoteSnapshot();
    const result = onlineRaceResult(local.floor, remote?.floor ?? 0);
    const detail = `YOU ${local.floor} / OPPONENT ${remote?.floor ?? 0}`;
    drawCanvasOverlay(raceLocalCanvas, result, detail);
    drawCanvasOverlay(raceRemoteCanvas, result, detail);
    raceStatus.textContent = `${result} · ${detail}`;
  } else if (onlineGame) {
    const floor = onlineGame.snapshot().floor;
    drawCanvasOverlay(canvas, "GAME OVER", `Floor ${floor} · Returning to room`);
  }
}

function onlineDisplayText(): string | null {
  const countdownEndsAt = onlineRoomData?.meta?.countdownEndsAt ?? undefined;
  if ((onlinePhase === "countdown" || onlinePhase === "playing") &&
      countdownEndsAt !== undefined) {
    return onlineCountdownLabel(onlineServerNow(), countdownEndsAt);
  }
  if (onlinePhase === "results") {
    if (onlineRace) {
      return onlineRaceResult(
        onlineRace.localSnapshot().floor,
        onlineRace.remoteSnapshot()?.floor ?? 0
      );
    }
    if (onlineGame) return `GAME OVER · ${onlineGame.snapshot().floor}`;
  }
  return onlinePhase;
}

function drawRaceStatus(): void {
  if (!onlineRace) return;
  const status = onlineRace.status();
  const local = onlineRace.localSnapshot();
  const remote = onlineRace.remoteSnapshot();
  if (shouldShowRemoteWaiting(onlinePhase, status.remoteWaiting)) {
    drawCanvasOverlay(raceRemoteCanvas, "WAITING OPPONENT", "Last snapshot unavailable");
  }
  if (status.localFinished && !status.remoteFinished) {
    drawCanvasOverlay(raceLocalCanvas, "FINISHED", `Floor ${local.floor}`);
  }
  if (status.localFinished && status.remoteFinished && remote) {
    const result = local.floor === remote.floor ? "DRAW" :
      local.floor > remote.floor ? "YOU WIN" : "YOU LOSE";
    raceStatus.textContent = `${result} · YOU ${local.floor} / OPPONENT ${remote.floor}`;
  } else {
    raceStatus.textContent = `YOU ${local.floor} · OPPONENT ${remote?.floor ?? "--"}`;
  }
}

function drawOnlineWaiting(): void {
  const status = onlineGame?.status();
  if (!status || status.phase !== "waiting") return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.save();
  context.fillStyle = "rgba(0, 0, 0, .65)";
  context.fillRect(148, 178, 338, 58);
  context.fillStyle = "#fff";
  context.font = "16px monospace";
  context.fillText("ONLINE WAITING", 238, 202);
  context.font = "12px monospace";
  context.fillText(`missing P${status.lockstep.missingPlayers.map((id) => id + 1).join(", P")}`, 238, 220);
  context.restore();
}

document.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((button) => {
  button.addEventListener("click", () => void start(Number(button.dataset.start) as 1 | 2));
});
document.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    title.hidden = true;
    const panel = button.dataset.open;
    if (panel === "options") optionsPanel.hidden = false;
    if (panel === "online") {
      onlinePanel.hidden = false;
      onlineName.value = save.lastInputName;
      setOnlineControlsLocked(false);
      setOnlineStatus("Create a room or join with a 6 digit code.");
    }
    if (panel === "records") {
      renderRecords();
      recordsPanel.hidden = false;
    }
    if (panel === "about") aboutPanel.hidden = false;
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((button) => {
  button.addEventListener("click", () => showTitle());
});
document.querySelectorAll<HTMLButtonElement>("[data-sound-preview]").forEach((button) => {
  button.addEventListener("click", () => {
    const effect = button.dataset.soundPreview as EffectName;
    void audio.previewEffect(effect);
  });
});
for (const key of ["conveyor", "spring", "rotating", "music", "sound", "fast"] as const) {
  document.querySelector<HTMLInputElement>(`#${key}`)!.addEventListener("change", (event) => {
    save.settings[key] = (event.currentTarget as HTMLInputElement).checked;
    audio.configure(save.settings);
    game?.setOptions(save.settings);
    syncRendererSettings();
    persist();
  });
}
difficulty.addEventListener("change", () => {
  save.settings.difficulty = difficulty.value as Difficulty;
  syncRendererSettings();
  persist();
});
document.querySelector("#clear-records")!.addEventListener("click", () => {
  save.records = { easy: [], normal: [], hard: [] };
  syncRendererSettings();
  persist();
  renderRecords();
});
onlineCreate.addEventListener("click", async () => {
  try {
    onlineCreate.disabled = true;
    setOnlineStatus("Creating room...");
    const session = getOnlineSession();
    onlineServerOffsetMs = await session.getServerTimeOffset().catch(() => 0);
    const room = await session.createRoom({
      playerName: onlinePlayerName(),
      seed: Date.now(),
      difficulty: save.settings.difficulty,
      mode: onlineMode.value as OnlineRoomMode,
      options: {
        conveyor: save.settings.conveyor,
        spring: save.settings.spring,
        rotating: save.settings.rotating,
        fast: save.settings.fast
      }
    });
    onlineRoom = room;
    onlineCode.value = room.roomCode;
    setOnlineControlsLocked(true);
    renderOnlineLobby({
      players: { 0: { connected: true, ready: false, name: onlinePlayerName() } }
    }, room.playerId);
    subscribeOnlineRoom(room);
    await copyCurrentRoomCode();
  } catch (error) {
    setOnlineStatus(
      error instanceof Error ? error.message : "Unable to create online room",
      "error"
    );
  } finally {
    if (!onlineRoom) onlineCreate.disabled = false;
  }
});
onlineJoin.addEventListener("click", async () => {
  try {
    const validation = validateRoomCode(onlineCode.value);
    if (!validation.ok) throw new Error(validation.reason);
    onlineJoin.disabled = true;
    setOnlineStatus("Joining room...");
    const session = getOnlineSession();
    onlineServerOffsetMs = await session.getServerTimeOffset().catch(() => 0);
    const room = await session.joinRoom(validation.code, onlinePlayerName());
    onlineRoom = room;
    setOnlineControlsLocked(true);
    subscribeOnlineRoom(room);
    setOnlineStatus(`Joined room ${room.roomCode}. Press Ready.`);
  } catch (error) {
    setOnlineStatus(
      error instanceof Error ? error.message : "Unable to join online room",
      "error"
    );
  } finally {
    if (!onlineRoom) onlineJoin.disabled = false;
  }
});
onlineReady.addEventListener("click", async () => {
  if (!onlineRoom) return;
  try {
    await audio.unlock().catch(() => undefined);
    onlineReady.disabled = true;
    await getOnlineSession().setReady(onlineRoom.roomCode, onlineRoom.playerId, true);
    onlineReady.dataset.state = "ready";
    onlineReady.textContent = "READY ✓";
    setOnlineStatus(
      `Room ${onlineRoom.roomCode} ready. Waiting for the other player.`,
      "success"
    );
  } catch (error) {
    onlineReady.disabled = false;
    setOnlineStatus(
      error instanceof Error ? error.message : "Unable to set ready",
      "error"
    );
  }
});
onlineCopy.addEventListener("click", () => void copyCurrentRoomCode());
pauseControl.addEventListener("click", togglePause);
abortControl.addEventListener("click", () => {
  if (game || onlineGame) {
    audio.playEffect("abort");
    showTitle();
  }
});
racePause.addEventListener("click", togglePause);
raceAbort.addEventListener("click", () => {
  if (!onlineRace) return;
  audio.playEffect("abort");
  showTitle();
});
document.querySelector<HTMLFormElement>("#name-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!game) return;
  const input = document.querySelector<HTMLInputElement>("#player-name")!;
  const name = input.value.trim().slice(0, 12) || "PLAYER";
  const state = game.snapshot();
  save.lastInputName = name;
  save = recordScore(save, state.difficulty, { name, floor: state.floor });
  syncRendererSettings();
  persist();
  showTitle();
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Enter" && game?.snapshot().mode === "gameover" && namePanel.hidden) showTitle();
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (onlineRace ? raceStage : gameFrame).requestFullscreen();
  }
});
window.addEventListener("blur", () => {
  if (game?.snapshot().mode === "playing") togglePause();
});

function updateFullscreenScale(): void {
  const scale = String(integerScaleForViewport(window.innerWidth, window.innerHeight));
  const raceScale = String(Math.min(
    1,
    Math.max(0.25, (window.innerWidth - 16) / 967),
    Math.max(0.25, (window.innerHeight - 16) / 488)
  ));
  cabinet.style.setProperty("--game-scale", scale);
  cabinet.style.setProperty("--race-scale", raceScale);
  gameFrame.style.setProperty("--game-scale", scale);
  raceStage.style.setProperty("--race-scale", raceScale);
}
window.addEventListener("resize", updateFullscreenScale);
document.addEventListener("fullscreenchange", updateFullscreenScale);
updateFullscreenScale();

window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: "origin top-left; +x right; +y down; frame 634x436; playfield 420x356 at (22,62)",
  ui: !title.hidden ? "title" : !optionsPanel.hidden ? "options" :
    !recordsPanel.hidden ? "records" : !onlinePanel.hidden ? "online" :
      !namePanel.hidden ? "name-entry" : onlineRace ? "race" : "game",
  ...((game ?? onlineGame)?.snapshot() ?? onlineRace?.localSnapshot() ?? { mode: "title" }),
  online: onlineRoom ? {
    roomCode: onlineRoom.roomCode,
    role: onlineRoom.role,
    playerId: onlineRoom.playerId,
    mode: onlineRoom.mode,
    phase: onlinePhase,
    round: onlineRoomData?.meta?.round ?? 0,
    display: onlineDisplayText(),
    status: onlineGame?.status() ?? onlineRace?.status()
  } : null,
  race: onlineRace ? {
    local: onlineRace.localSnapshot(),
    remote: onlineRace.remoteSnapshot(),
    status: onlineRace.status()
  } : null,
  settings: { ...save.settings },
  audio: { music: save.settings.music, sound: save.settings.sound }
});
window.advanceTime = (ms: number) => {
  const idle: InputFrame = {
    players: [{ left: false, right: false }, { left: false, right: false }],
    pausePressed: false
  };
  update(idle, ms);
};
if (qaMode) {
  window.__nsShaftQa = {
    setPlayer: (index, patch) => game?.debugSetPlayer(index, patch),
    setPlatforms: (platforms) => game?.debugSetPlatforms(platforms as never[]),
    setProgress: (floorSequence) => game?.debugSetProgress(floorSequence),
    startRace: () => {
      const room: OnlineRoomHandle = {
        roomCode: "000000",
        role: "host",
        playerId: 0,
        mode: "race"
      };
      onlineRoom = room;
      onlinePhase = "playing";
      onlineRoomData = {
        meta: { phase: "playing", round: 1, seed: 1337 },
        players: {
          0: { connected: true, name: "YOU" },
          1: { connected: true, name: "OPPONENT" }
        }
      };
      prepareOnlineRace(room, {
        seed: 1337,
        phase: "playing",
        round: 1,
        difficulty: save.settings.difficulty,
        options: save.settings
      }, async () => undefined);
    },
    setRaceRemotePlayer: (patch) => {
      if (!onlineRace) return;
      const state = onlineRace.localSnapshot();
      state.players[0] = { ...state.players[0], ...patch };
      onlineRace.receiveSnapshot(serializeRaceSnapshot(1, "OPPONENT", Date.now(), state));
      raceRemoteRenderer.render(onlineRace.remoteSnapshot()!);
      drawRaceStatus();
    },
    setOnlineRoundPhase: (phase, endsInMs = 0) => {
      if (!onlineRoom) return;
      const now = onlineServerNow();
      onlinePhase = phase;
      onlineRoomData ??= { players: {} };
      onlineRoomData.meta = {
        ...(onlineRoomData.meta ?? {}),
        phase,
        countdownEndsAt: phase === "countdown" || phase === "playing"
          ? now + endsInMs : onlineRoomData.meta?.countdownEndsAt,
        resultsEndsAt: phase === "results" ? now + endsInMs : null
      };
      if (phase === "lobby") {
        const players = {
          0: { connected: true, ready: false, name: "YOU" },
          1: { connected: true, ready: false, name: "OPPONENT" }
        };
        onlineRoomData.players = players;
        showOnlineRoomLobby(onlineRoom, onlineRoomData);
      } else {
        update({
          players: [{ left: false, right: false }, { left: false, right: false }],
          pausePressed: false
        }, 0);
      }
    },
    showOnlineLobby: (players, localPlayerId = 0) => {
      onlinePanel.hidden = false;
      title.hidden = true;
      onlineRoom = {
        roomCode: "123456",
        role: localPlayerId === 0 ? "host" : "guest",
        playerId: localPlayerId,
        mode: "coop"
      };
      onlineCode.value = "123456";
      setOnlineControlsLocked(true);
      renderOnlineLobby({ players }, localPlayerId);
    }
  };
}

applySettingsToControls();
renderer.render({
  mode: "title", difficulty: save.settings.difficulty, floor: 0,
  floorSequence: 0, level: 0, timeMs: 0, cameraY: 0, ticks: 0,
  players: [], platforms: []
});
requestAnimationFrame(frame);
