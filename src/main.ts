import "./style.css";
import { AUDIO_EFFECTS, GameAudio, type EffectName } from "./game/audio";
import { KeyboardInput } from "./game/input";
import { Renderer } from "./game/renderer";
import { integerScaleForViewport } from "./game/layout";
import { GameSimulation } from "./game/simulation";
import { loadSave, SAVE_KEY } from "./game/storage";
import { setLocale, t, type TranslationKey } from "./game/i18n";
import { normalizePlayerName } from "./game/player-name";
import {
  FirebaseLeaderboard,
  rankLeaderboardSubmission,
  type LeaderboardMode,
  type RankedLeaderboardEntry
} from "./game/leaderboard";
import { OnlineGameController } from "./game/online/controller";
import {
  connectionPresentation,
  OnlineConnectionMonitor,
  type OnlineConnectionState
} from "./game/online/connection";
import { copyRoomCode } from "./game/online/clipboard";
import { createRealtimeDatabasePort, type RealtimeDatabasePort } from "./game/online/firebase";
import { buildLobbyView, type LobbyRoomData } from "./game/online/lobby";
import {
  OnlineRaceController,
  serializeRaceSnapshot,
  type RaceSnapshot
} from "./game/online/race";
import { buildFirebaseConfig, validateRoomCode } from "./game/online/room";
import {
  ONLINE_RESUME_KEY,
  parseResumeTicket,
  type OnlineResumeTicket
} from "./game/online/resume";
import {
  normalizeOnlinePause,
  requestOnlinePause,
  schedulePauseResume,
  type OnlinePauseState
} from "./game/online/pause";
import {
  ONLINE_COUNTDOWN_MS,
  ONLINE_RESULTS_MS,
  buildOnlineResultViewModel,
  nextOnlineHostAction,
  onlineCountdownLabel,
  onlineRaceResult,
  onlineResultsCountdownLabel,
  type OnlineRoomPhase
} from "./game/online/round";
import {
  FirebaseOnlineSession,
  type OnlineRoomHandle,
  type OnlineRoomMode
} from "./game/online/session";
import {
  DEFAULT_BUFFER_TICKS,
  selectBufferTicks,
  type OnlineCheckpoint,
  type OnlineSyncStatus
} from "./game/online/sync";
import type { Difficulty, GameStateSnapshot, InputFrame, SaveData } from "./game/types";

interface OnlineRoomMeta {
  seed?: number;
  difficulty?: Difficulty;
  options?: SaveData["settings"];
  mode?: OnlineRoomMode;
  phase?: OnlineRoomPhase;
  round?: number;
  bufferTicks?: number;
  countdownEndsAt?: number | null;
  resultsEndsAt?: number | null;
  resultRanks?: Partial<Record<0 | 1, number>>;
  hostConnected?: boolean;
  guestConnected?: boolean;
  pause?: OnlinePauseState;
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
      setOnlineRoundPhase: (phase: OnlineRoomPhase, endsInMs?: number) => void | Promise<void>;
      setOnlinePause: (pause: OnlinePauseState) => void;
      setOnlineConnection: (connected: boolean, idleMs: number) => void;
      setOnlineResultRank: (rank: number) => void;
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
    <button type="button" data-sound-preview="${effect.event}" data-i18n="common.play">${t("common.play")}</button>
    <span>${effect.event}</span>
    <code>wave-${effect.resourceId}</code>
    <small>${Math.round(effect.durationMs)}ms</small>
  </li>
`).join("");

root.innerHTML = `
  <main class="cabinet">
    <section class="game-frame" aria-label="NS-SHAFT 1.3J">
      <canvas id="game" aria-label="NS-SHAFT game canvas"></canvas>
      <button id="pause-control" class="frame-control pause-control" aria-label="${t("common.pause")}" data-i18n-aria="common.pause"></button>
      <button id="abort-control" class="frame-control abort-control" aria-label="${t("common.abort")}" data-i18n-aria="common.abort"></button>
      <div id="title-screen" class="screen title-screen">
        <img class="title-art" src="${assetUrl("assets/web/rt_bitmap-104-1041.png")}" alt="NS-SHAFT Ver 1.3J">
        <nav class="main-menu">
          <button data-start="1" data-i18n="menu.onePlayer">${t("menu.onePlayer")}</button>
          <button data-start="2" data-i18n="menu.twoPlayer">${t("menu.twoPlayer")}</button>
          <button data-open="online" data-i18n="menu.online">${t("menu.online")}</button>
          <button data-open="records" data-i18n="menu.records">${t("menu.records")}</button>
          <button data-open="options" data-i18n="menu.options">${t("menu.options")}</button>
          <button data-open="about" data-i18n="menu.about">${t("menu.about")}</button>
        </nav>
        <label class="title-language"><span data-i18n="options.language">${t("options.language")}</span>
          <select id="locale" aria-label="${t("options.language")}" data-i18n-aria="options.language">
            <option value="ja" data-i18n="options.japanese">${t("options.japanese")}</option>
            <option value="zh-Hant" data-i18n="options.traditionalChinese">${t("options.traditionalChinese")}</option>
            <option value="en" data-i18n="options.english">${t("options.english")}</option>
          </select>
        </label>
        <p class="key-help" data-i18n="menu.keyHelp">${t("menu.keyHelp")}</p>
      </div>

      <section id="options-panel" class="screen dialog-screen" hidden>
        <div class="dialog">
          <h2 data-i18n="options.title">${t("options.title")}</h2>
          <label><span data-i18n="options.difficulty">${t("options.difficulty")}</span>
            <select id="difficulty">
              <option value="easy" data-i18n="options.easy">${t("options.easy")}</option>
              <option value="normal" data-i18n="options.normal">${t("options.normal")}</option>
              <option value="hard" data-i18n="options.hard">${t("options.hard")}</option>
            </select>
          </label>
          <div class="player-name-settings">
            <label>1P NAME <input id="player1-name" autocomplete="off"></label>
            <label>2P NAME <input id="player2-name" autocomplete="off"></label>
          </div>
          <label><input id="conveyor" type="checkbox"> <span data-i18n="options.conveyor">${t("options.conveyor")}</span></label>
          <label><input id="spring" type="checkbox"> <span data-i18n="options.spring">${t("options.spring")}</span></label>
          <label><input id="rotating" type="checkbox"> <span data-i18n="options.rotating">${t("options.rotating")}</span></label>
          <label><input id="music" type="checkbox"> <span data-i18n="options.music">${t("options.music")}</span></label>
          <label><input id="sound" type="checkbox"> <span data-i18n="options.sound">${t("options.sound")}</span></label>
          <label><input id="fast" type="checkbox"> <span data-i18n="options.fast">${t("options.fast")}</span></label>
          <button type="button" data-open="sound" data-i18n="options.soundTest">${t("options.soundTest")}</button>
          <button data-close data-i18n="common.back">${t("common.back")}</button>
        </div>
      </section>

      <section id="sound-panel" class="screen dialog-screen" hidden>
        <div class="dialog sound-dialog">
          <h2 data-i18n="options.soundTest">${t("options.soundTest")}</h2>
          <section class="sound-preview" aria-label="${t("options.soundTest")}" data-i18n-aria="options.soundTest">
            <ol>${soundPreviewRows}</ol>
          </section>
          <button type="button" data-close-sound data-i18n="common.back">${t("common.back")}</button>
        </div>
      </section>

      <section id="records-panel" class="screen records-screen" hidden>
        <div class="records-content">
          <h2 data-i18n="records.title">${t("records.title")}</h2>
          <nav id="record-modes" class="record-modes" aria-label="${t("records.title")}" data-i18n-aria="records.title">
            <button type="button" data-record-mode="solo">1P</button>
            <button type="button" data-record-mode="local2p">2P</button>
            <button type="button" data-record-mode="coop" data-i18n="records.coop">${t("records.coop")}</button>
            <button type="button" data-record-mode="race" data-i18n="records.race">${t("records.race")}</button>
          </nav>
          <div id="records-list"></div>
          <div class="dialog-actions">
            <button data-close data-i18n="common.back">${t("common.back")}</button>
          </div>
        </div>
      </section>

      <section id="online-panel" class="screen dialog-screen" hidden>
        <div class="dialog online-dialog">
          <h2 data-i18n="online.title">${t("online.title")}</h2>
          <p id="online-status">${t("online.description")}</p>
          <label><span data-i18n="online.mode.label">${t("online.mode.label")}</span>
            <select id="online-mode">
              <option value="coop" data-i18n="online.mode.coop">${t("online.mode.coop")}</option>
              <option value="race" data-i18n="online.mode.race">${t("online.mode.race")}</option>
            </select>
          </label>
          <label><span data-i18n="online.name">${t("online.name")}</span> <input id="online-name" autocomplete="off" value="PLAYER1"></label>
          <section id="online-players" class="online-players" aria-label="${t("online.playersAria")}" data-i18n-aria="online.playersAria" hidden>
            <div class="online-player" data-player="0" data-status="waiting">
              <span data-i18n="online.host">${t("online.host")}</span><b>---</b><strong>${t("online.waiting")}</strong>
            </div>
            <div class="online-player" data-player="1" data-status="waiting">
              <span data-i18n="online.guest">${t("online.guest")}</span><b>---</b><strong>${t("online.waiting")}</strong>
            </div>
          </section>
          <div class="dialog-actions">
            <button id="online-create" type="button" data-i18n="online.room.create">${t("online.room.create")}</button>
            <button id="online-ready" type="button" data-state="available" data-i18n="online.ready" disabled>${t("online.ready")}</button>
          </div>
          <label><span data-i18n="online.room.code">${t("online.room.code")}</span> <input id="online-code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off"></label>
          <div class="dialog-actions">
            <button id="online-join" type="button" data-i18n="online.room.join">${t("online.room.join")}</button>
            <button id="online-copy" type="button" data-i18n="online.room.copy" disabled>${t("online.room.copy")}</button>
            <button data-close type="button" data-i18n="online.back">${t("online.back")}</button>
          </div>
        </div>
      </section>

      <section id="about-panel" class="screen about-screen" hidden>
        <img src="${assetUrl("assets/web/rt_bitmap-105-1041.png")}" alt="NS-SHAFT copyright">
        <button data-close data-i18n="common.back">${t("common.back")}</button>
      </section>

      <section id="online-state" class="online-state" hidden>
        <div class="online-state-dialog">
          <h2 id="online-state-title"></h2>
          <p id="online-state-detail"></p>
          <div id="online-pause-players" class="online-pause-players" hidden>
            <span>1P</span><strong data-pause-player="0">${t("online.waiting")}</strong>
            <span>2P</span><strong data-pause-player="1">${t("online.waiting")}</strong>
          </div>
          <div id="online-state-actions" class="dialog-actions" hidden>
            <button id="online-state-ready" type="button" data-i18n="online.pause.ready">${t("online.pause.ready")}</button>
            <button id="online-state-leave" type="button" data-i18n="online.room.leave">${t("online.room.leave")}</button>
          </div>
        </div>
      </section>
      <div id="online-connection-indicator" class="online-connection-indicator" data-i18n="online.connection.syncing" hidden>
        ${t("online.connection.syncing")}
      </div>
    </section>
    <section id="race-stage" class="race-stage" aria-label="${t("online.raceAria")}" data-i18n-aria="online.raceAria" hidden>
      <div class="race-strip">
        <article class="race-pane race-pane-local" data-role="local" data-player-color="yellow">
          <header>1P</header>
          <canvas id="race-local" class="race-canvas" aria-label="1Pゲーム画面"></canvas>
          <button id="race-pause" class="frame-control pause-control" aria-label="${t("common.pause")}" data-i18n-aria="common.pause"></button>
          <button id="race-abort" class="frame-control abort-control" aria-label="${t("common.abort")}" data-i18n-aria="common.abort"></button>
        </article>
        <article class="race-pane race-pane-remote" data-role="remote" data-player-color="green">
          <header>2P</header>
          <canvas id="race-remote" class="race-canvas" aria-label="2Pゲーム画面"></canvas>
        </article>
      </div>
    </section>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const cabinet = document.querySelector<HTMLElement>(".cabinet")!;
const gameFrame = document.querySelector<HTMLElement>(".game-frame")!;
const title = document.querySelector<HTMLElement>("#title-screen")!;
const optionsPanel = document.querySelector<HTMLElement>("#options-panel")!;
const soundPanel = document.querySelector<HTMLElement>("#sound-panel")!;
const recordsPanel = document.querySelector<HTMLElement>("#records-panel")!;
const player1Name = document.querySelector<HTMLInputElement>("#player1-name")!;
const player2Name = document.querySelector<HTMLInputElement>("#player2-name")!;
const onlinePanel = document.querySelector<HTMLElement>("#online-panel")!;
const aboutPanel = document.querySelector<HTMLElement>("#about-panel")!;
const difficulty = document.querySelector<HTMLSelectElement>("#difficulty")!;
const locale = document.querySelector<HTMLSelectElement>("#locale")!;
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
const onlineState = document.querySelector<HTMLElement>("#online-state")!;
const onlineStateTitle = document.querySelector<HTMLElement>("#online-state-title")!;
const onlineStateDetail = document.querySelector<HTMLElement>("#online-state-detail")!;
const onlinePausePlayers = document.querySelector<HTMLElement>("#online-pause-players")!;
const onlineStateActions = document.querySelector<HTMLElement>("#online-state-actions")!;
const onlineStateReady = document.querySelector<HTMLButtonElement>("#online-state-ready")!;
const onlineStateLeave = document.querySelector<HTMLButtonElement>("#online-state-leave")!;
const onlineConnectionIndicator = document.querySelector<HTMLElement>(
  "#online-connection-indicator"
)!;
const raceStage = document.querySelector<HTMLElement>("#race-stage")!;
const racePause = document.querySelector<HTMLButtonElement>("#race-pause")!;
const raceAbort = document.querySelector<HTMLButtonElement>("#race-abort")!;
const raceLocalPane = document.querySelector<HTMLElement>(".race-pane-local")!;
const raceLocalCanvas = document.querySelector<HTMLCanvasElement>("#race-local")!;
const raceRemoteCanvas = document.querySelector<HTMLCanvasElement>("#race-remote")!;
const raceLocalLabel = document.querySelector<HTMLElement>(".race-pane-local header")!;
const raceRemoteLabel = document.querySelector<HTMLElement>(".race-pane-remote header")!;
const renderer = new Renderer(canvas);
const raceLocalRenderer = new Renderer(raceLocalCanvas);
const raceRemoteRenderer = new Renderer(raceRemoteCanvas);
const keyboard = new KeyboardInput();
const audio = new GameAudio();
let save: SaveData = loadSave(localStorage.getItem(SAVE_KEY), navigator.languages);
setLocale(save.settings.locale);
let game: GameSimulation | null = null;
let onlineGame: OnlineGameController | null = null;
let onlineRace: OnlineRaceController | null = null;
let onlineSession: FirebaseOnlineSession | null = null;
let firebaseDatabase: RealtimeDatabasePort | null = null;
let leaderboard: FirebaseLeaderboard | null = null;
let onlineRoom: OnlineRoomHandle | null = null;
let unsubscribeOnlineRoom: (() => void) | null = null;
let unsubscribeOnlineInputs: (() => void) | null = null;
let unsubscribeRaceSnapshots: (() => void) | null = null;
let unsubscribeOnlineStatus: (() => void) | null = null;
let unsubscribeOnlineCheckpoint: (() => void) | null = null;
let onlinePeerStatus: OnlineSyncStatus | null = null;
let latestOnlineCheckpoint: OnlineCheckpoint | null = null;
let onlineRoomData: OnlineRoomData | null = null;
let onlinePhase: OnlineRoomPhase | null = null;
let onlineServerOffsetMs = 0;
let onlineTransitionPending = false;
let onlinePreparedRound = -1;
let wasOnlinePaused = false;
let playerCount: 1 | 2 = 1;
let activeLeaderboardMode: LeaderboardMode = "solo";
let selectedRecordMode: LeaderboardMode = "solo";
let submittedOnlineRound = -1;
let accumulator = 0;
let lastTime = performance.now();
let scoreHandled = false;
const STEP_MS = 1000 / 60;
const onlineConnectionMonitor = new OnlineConnectionMonitor(performance.now());
const qaMode = new URLSearchParams(location.search).get("qa") === "1";
pauseControl.hidden = true;
abortControl.hidden = true;

function persist(): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function saveOnlineResumeTicket(room: OnlineRoomHandle): void {
  const ticket: OnlineResumeTicket = {
    roomCode: room.roomCode,
    playerId: room.playerId,
    playerName: onlinePlayerName()
  };
  localStorage.setItem(ONLINE_RESUME_KEY, JSON.stringify(ticket));
}

function clearOnlineResumeTicket(): void {
  localStorage.removeItem(ONLINE_RESUME_KEY);
}

function syncRendererSettings(): void {
  let recordFloor = 0;
  try {
    recordFloor = getLeaderboard().cachedWorldRecord(
      activeLeaderboardMode,
      save.settings.difficulty
    );
  } catch {
    // A missing Firebase config must not block the offline game.
  }
  const settings = {
    fast: save.settings.fast,
    recordFloor
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
  locale.value = save.settings.locale;
  player1Name.value = save.playerNames[0];
  player2Name.value = save.playerNames[1];
  for (const key of ["conveyor", "spring", "rotating", "music", "sound", "fast"] as const) {
    document.querySelector<HTMLInputElement>(`#${key}`)!.checked = save.settings[key];
  }
  syncRendererSettings();
}

function applyLocaleToDocument(): void {
  setLocale(save.settings.locale);
  document.documentElement.lang = save.settings.locale;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n as TranslationKey);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria as TranslationKey));
  });
  if (!onlineRoom && !onlinePanel.hidden) setOnlineStatus(t("online.description"));
  if (onlineRoomData && onlineRoom) renderOnlineLobby(onlineRoomData, onlineRoom.playerId);
  renderOnlineStateDialog();
  drawRaceStatus();
  if (!recordsPanel.hidden) void renderRecords();
}

function closePanels(): void {
  optionsPanel.hidden = true;
  soundPanel.hidden = true;
  recordsPanel.hidden = true;
  onlinePanel.hidden = true;
  aboutPanel.hidden = true;
}

function getFirebaseDatabase(): RealtimeDatabasePort {
  if (firebaseDatabase) return firebaseDatabase;
  const config = buildFirebaseConfig(import.meta.env as Record<string, string | undefined>);
  firebaseDatabase = createRealtimeDatabasePort(config);
  return firebaseDatabase;
}

function getLeaderboard(): FirebaseLeaderboard {
  if (!leaderboard) {
    leaderboard = new FirebaseLeaderboard(getFirebaseDatabase());
    void leaderboard.retryPending().catch(() => undefined);
  }
  return leaderboard;
}

function submitLeaderboardScore(
  input: Parameters<FirebaseLeaderboard["submit"]>[0]
): void {
  try {
    void getLeaderboard().submit(input).catch(() => undefined);
  } catch {
    // Local gameplay remains available when Firebase is not configured.
  }
}

async function refreshWorldRecord(mode: LeaderboardMode, difficultyLevel: Difficulty): Promise<void> {
  activeLeaderboardMode = mode;
  syncRendererSettings();
  try {
    await getLeaderboard().loadTop(mode, difficultyLevel);
  } catch {
    // Keep the last successful cached record while offline.
  }
  if (activeLeaderboardMode === mode && save.settings.difficulty === difficultyLevel) {
    syncRendererSettings();
  }
}

async function start(players: 1 | 2): Promise<void> {
  playerCount = players;
  activeLeaderboardMode = players === 1 ? "solo" : "local2p";
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
  void refreshWorldRecord(activeLeaderboardMode, save.settings.difficulty);
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

async function togglePause(): Promise<void> {
  if (onlineRoom && onlinePhase !== "playing") return;
  if ((!game && !onlineRace && !onlineGame) || game?.snapshot().mode === "gameover" ||
      onlineGame?.snapshot().mode === "gameover" ||
      onlineRace?.localSnapshot().mode === "gameover") return;
  if (!onlineRoom) {
    const idle: InputFrame = {
      players: [{ left: false, right: false }, { left: false, right: false }],
      pausePressed: true
    };
    update(idle, 0);
    if (game?.snapshot().mode === "paused") await audio.suspend();
    else await audio.resume();
    return;
  }
  if (onlineRoomData?.meta?.pause) return;
  await getOnlineSession().updateMeta(onlineRoom.roomCode, {
    pause: requestOnlinePause(onlineRoom.playerId)
  });
}

function handleGameOver(state: GameStateSnapshot): void {
  if (scoreHandled) return;
  scoreHandled = true;
  audio.stopMusic();
  if (state.floor > 0) {
    submitLeaderboardScore({
      mode: playerCount === 1 ? "solo" : "local2p",
      difficulty: state.difficulty,
      player1: save.playerNames[0],
      ...(playerCount === 2 ? { player2: save.playerNames[1] } : {}),
      floor: state.floor
    });
  }
}

function update(input: InputFrame, elapsedMs = STEP_MS): void {
  const onlinePaused = onlineRoomData?.meta?.pause != null;
  if (onlineRoom && onlinePhase === "playing" && input.pausePressed && !onlinePaused) {
    void togglePause();
    return;
  }
  if (onlineRace) {
    if (onlinePhase === "playing" && !onlinePaused) onlineRace.step(input);
    const local = onlineRace.localSnapshot();
    const remote = onlineRace.remoteRenderSnapshot();
    audio.consume(onlineRace.drainEvents());
    raceLocalRenderer.render(local);
    if (remote) raceRemoteRenderer.render(remote);
    drawRaceStatus();
    drawOnlineRoundOverlay();
    return;
  }
  if (onlineGame) {
    if (onlinePhase === "playing" && !onlinePaused) onlineGame.step(input);
    maybeApplyHostCheckpoint(latestOnlineCheckpoint);
    const state = onlineGame.snapshot();
    audio.consume(onlineGame.drainEvents());
    renderer.render(state);
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

async function renderRecords(): Promise<void> {
  const names: Record<Difficulty, string> = {
    easy: t("options.easy"), normal: t("options.normal"), hard: t("options.hard")
  };
  let service: FirebaseLeaderboard;
  try {
    service = getLeaderboard();
  } catch {
    document.querySelector("#records-list")!.innerHTML = `<p>${t("records.unavailable")}</p>`;
    return;
  }
  document.querySelectorAll<HTMLElement>("[data-record-mode]").forEach((button) => {
    button.dataset.active = String(button.dataset.recordMode === selectedRecordMode);
  });
  const levels = ["easy", "normal", "hard"] as Difficulty[];
  const results = await Promise.all(levels.map(async (level) => {
    try {
      return await service.loadTop(selectedRecordMode, level);
    } catch {
      return service.cachedTop(selectedRecordMode, level);
    }
  }));
  document.querySelector("#records-list")!.innerHTML = levels.map((level, levelIndex) => `
    <section><h3>${names[level]}</h3><ol>${Array.from({ length: 5 }, (_, index) => {
      const entry: RankedLeaderboardEntry | undefined = results[levelIndex][index];
      const players = entry ? [entry.player1, entry.player2].filter(Boolean).join(" / ") : "--------";
      return `<li><span>${players}</span><b>${t("records.floor", { floor: entry?.floor ?? 0 })}</b></li>`;
    }).join("")}</ol></section>`).join("");
}

function getOnlineSession(): FirebaseOnlineSession {
  if (onlineSession) return onlineSession;
  onlineSession = new FirebaseOnlineSession(getFirebaseDatabase());
  return onlineSession;
}

function setOnlineStatus(
  message: string,
  tone: "neutral" | "success" | "error" = "neutral"
): void {
  onlineStatus.textContent = message;
  onlineStatus.dataset.tone = tone;
}

function onlineErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("4 digits")) return t("online.error.roomCode");
  if (message.includes("already exists") || message.includes("allocate room")) {
    return t("online.error.roomExists");
  }
  if (message.includes("not found")) return t("online.error.roomMissing");
  if (message.includes("full")) return t("online.error.roomFull");
  if (message.includes("not in lobby")) return t("online.error.roomBusy");
  if (message.toLowerCase().includes("auth")) return t("online.error.auth");
  return t("online.error.network");
}

function enterOnlineRoom(role: "host" | "guest"): void {
  onlineCreate.hidden = true;
  onlineJoin.hidden = true;
  onlineCode.closest("label")!.hidden = true;
  onlineName.disabled = true;
  onlinePlayers.hidden = false;
  onlineReady.disabled = true;
  onlineReady.dataset.state = "available";
  onlineReady.textContent = t("online.ready");
  // ponytail: host can change mode, guest sees it read-only
  const modeLabel = onlineMode.closest("label")!;
  modeLabel.hidden = false;
  if (role === "host") {
    onlineMode.disabled = false;
    onlineCopy.hidden = false;
    onlineCopy.disabled = false;
  } else {
    onlineMode.disabled = true;
    onlineCopy.hidden = true;
    onlineCopy.disabled = true;
  }
}

function exitOnlineRoom(): void {
  onlineCode.classList.remove("error");
  onlineCreate.hidden = false;
  onlineCreate.disabled = false;
  onlineJoin.hidden = false;
  onlineJoin.disabled = false;
  onlineCode.closest("label")!.hidden = false;
  onlineCode.readOnly = false;
  onlineMode.closest("label")!.hidden = false;
  onlineMode.disabled = false;
  onlineName.disabled = false;
  onlineCopy.hidden = false;
  onlineCopy.disabled = true;
  onlinePlayers.hidden = true;
  onlineReady.disabled = true;
  onlineReady.dataset.state = "available";
  onlineReady.textContent = t("online.ready");
}

function renderOnlineLobby(room: LobbyRoomData, localPlayerId: 0 | 1): void {
  const view = buildLobbyView(room, localPlayerId);
  onlinePlayers.hidden = false;
  for (const player of view.players) {
    const row = onlinePlayers.querySelector<HTMLElement>(`[data-player="${player.playerId}"]`)!;
    row.dataset.status = player.status;
    row.querySelector("span")!.textContent = t(player.playerId === 0 ? "online.host" : "online.guest");
    row.querySelector("b")!.textContent = player.name;
    row.querySelector("strong")!.textContent = t(
      player.status === "ready" ? "online.ready" :
        player.status === "connected" ? "online.connected" : "online.waiting"
    );
  }
  onlineReady.dataset.state = view.readyButton.state;
  onlineReady.textContent = `${t("online.ready")}${view.readyButton.state === "ready" ? " ✓" : ""}`;
  onlineReady.disabled = view.readyButton.disabled;
}

async function copyCurrentRoomCode(): Promise<void> {
  if (!onlineRoom) return;
  const result = await copyRoomCode(onlineRoom.roomCode, navigator.clipboard);
  if (result === "copied") {
    setOnlineStatus(t("online.room.copied", { code: onlineRoom.roomCode }), "success");
    return;
  }
  onlineCode.focus();
  onlineCode.select();
  setOnlineStatus(t("online.room.created", { code: onlineRoom.roomCode }), "error");
}

function onlinePlayerName(): string {
  return normalizePlayerName(onlineName.value, onlineRoom?.playerId === 1 ? "PLAYER2" : "PLAYER1");
}

function showOnlineRoomLobby(room: OnlineRoomHandle, roomData: OnlineRoomData): void {
  onlineGame = null;
  onlineRace = null;
  onlinePreparedRound = -1;
  wasOnlinePaused = false;
  audio.stopMusic();
  closePanels();
  title.hidden = true;
  onlinePanel.hidden = false;
  gameFrame.hidden = false;
  raceStage.hidden = true;
  cabinet.classList.remove("race-active");
  pauseControl.hidden = true;
  abortControl.hidden = true;
  onlineState.hidden = true;
  gameFrame.append(onlineState);
  gameFrame.append(onlineConnectionIndicator);
  onlineConnectionIndicator.hidden = true;
  enterOnlineRoom(room.role);
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

async function submitOnlineResult(room: OnlineRoomHandle, data: OnlineRoomData): Promise<void> {
  const round = data.meta?.round ?? 0;
  if (submittedOnlineRound === round) return;
  const mode = data.meta?.mode ?? room.mode;
  if (mode === "coop" && room.role !== "host") return;
  const result = mode === "race" ? onlineRace?.localSnapshot() : onlineGame?.snapshot();
  if (result?.mode !== "gameover") return;
  const floor = result.floor;
  if (!floor || floor < 1) return;
  submittedOnlineRound = round;
  const difficultyLevel = data.meta?.difficulty ?? save.settings.difficulty;
  const localName = data.players?.[room.playerId]?.name ?? onlinePlayerName();
  const service = getLeaderboard();
  const submission = await service.submit({
    mode,
    difficulty: difficultyLevel,
    player1: mode === "coop" ? data.players?.[0]?.name ?? "PLAYER1" : localName,
    ...(mode === "coop" ? { player2: data.players?.[1]?.name ?? "PLAYER2" } : {}),
    floor
  });
  if (!submission.submitted) return;
  const entries = await service.loadTop(mode, difficultyLevel);
  const rank = rankLeaderboardSubmission(entries, submission.id) ?? 0;
  const ranks = mode === "coop"
    ? { "resultRanks/0": rank, "resultRanks/1": rank }
    : { [`resultRanks/${room.playerId}`]: rank };
  await getOnlineSession().updateMeta(room.roomCode, ranks);
}

async function driveOnlineRoundLifecycle(): Promise<void> {
  const room = onlineRoom;
  const data = onlineRoomData;
  if (!room || room.role !== "host" || !data?.meta || onlineTransitionPending) return;
  const now = onlineServerNow();
  const pause = data.meta.pause ?? null;
  if (pause?.resumeAt !== null && pause?.resumeAt !== undefined && now >= pause.resumeAt) {
    onlineTransitionPending = true;
    try {
      await getOnlineSession().updateMeta(room.roomCode, { pause: null });
    } catch {
      // The next host frame retries the transition.
    } finally {
      onlineTransitionPending = false;
    }
    return;
  }
  if (pause && pause.resumeAt === null) {
    const scheduled = schedulePauseResume(pause, now, onlinePauseRequiredPlayers());
    if (scheduled?.resumeAt === null) return;
    onlineTransitionPending = true;
    try {
      await getOnlineSession().updateMeta(room.roomCode, { pause: scheduled });
    } finally {
      onlineTransitionPending = false;
    }
    return;
  }
  if (pause) return;
  const hostReady = Boolean(data.players?.[0]?.ready);
  const guestReady = Boolean(data.players?.[1]?.ready);
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
      const timingSamples = [data.players?.[0]?.timing, data.players?.[1]?.timing]
        .filter((value): value is { rttMs: number; jitterMs: number } => Boolean(value));
      await session.beginCountdown(room.roomCode, {
        seed: Math.floor(Math.random() * 0x7fffffff),
        round: (data.meta.round ?? 0) + 1,
        countdownEndsAt: now + ONLINE_COUNTDOWN_MS,
        bufferTicks: selectBufferTicks(timingSamples)
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
      onlineErrorMessage(error),
      "error"
    );
  } finally {
    onlineTransitionPending = false;
  }
}

function onlinePauseRequiredPlayers(): Record<0 | 1, boolean> {
  if (onlineRace && onlineRoom) {
    const opponentId = onlineRoom.playerId === 0 ? 1 : 0;
    const required: Record<0 | 1, boolean> = { 0: true, 1: true };
    required[onlineRoom.playerId] = onlineRace.localSnapshot().players[0]?.alive ?? true;
    required[opponentId] = onlineRace.remoteSnapshot()?.players[0]?.alive ?? true;
    return required;
  }
  const players = onlineGame?.snapshot().players;
  return {
    0: players?.[0]?.alive ?? true,
    1: players?.[1]?.alive ?? true
  };
}

async function leaveOnlineRoom(): Promise<void> {
  const room = onlineRoom;
  const session = onlineSession;
  unsubscribeOnlineRoom?.();
  unsubscribeOnlineInputs?.();
  unsubscribeRaceSnapshots?.();
  unsubscribeOnlineStatus?.();
  unsubscribeOnlineCheckpoint?.();
  unsubscribeOnlineRoom = null;
  unsubscribeOnlineInputs = null;
  unsubscribeRaceSnapshots = null;
  unsubscribeOnlineStatus = null;
  unsubscribeOnlineCheckpoint = null;
  onlinePeerStatus = null;
  latestOnlineCheckpoint = null;
  onlineConnectionMonitor.reset(performance.now());
  onlineRoom = null;
  onlineRoomData = null;
  onlinePhase = null;
  onlinePreparedRound = -1;
  onlineTransitionPending = false;
  wasOnlinePaused = false;
  onlineState.hidden = true;
  onlineConnectionIndicator.hidden = true;
  exitOnlineRoom();
  if (room && session) {
    clearOnlineResumeTicket();
    await session.leaveRoom(room.roomCode, room.playerId).catch(() => undefined);
  }
}

async function resumeSavedOnlineRoom(): Promise<void> {
  if (onlineRoom) return;
  const ticket = parseResumeTicket(localStorage.getItem(ONLINE_RESUME_KEY));
  if (!ticket) return;
  try {
    const session = getOnlineSession();
    setOnlineStatus(t("online.connection.syncing"));
    onlineServerOffsetMs = await session.getServerTimeOffset().catch(() => 0);
    const room = await session.resumeRoom(
      ticket.roomCode,
      ticket.playerId,
      ticket.playerName
    );
    onlineName.value = ticket.playerName;
    onlineCode.value = room.roomCode;
    onlineRoom = room;
    enterOnlineRoom(room.role);
    subscribeOnlineRoom(room);
    void session.measureNetworkTiming(room.roomCode, room.playerId).catch(() => undefined);
  } catch {
    clearOnlineResumeTicket();
  }
}

function subscribeOnlineRoom(room: OnlineRoomHandle): void {
  unsubscribeOnlineRoom?.();
  unsubscribeOnlineInputs?.();
  unsubscribeRaceSnapshots?.();
  unsubscribeOnlineStatus?.();
  unsubscribeOnlineCheckpoint?.();
  unsubscribeOnlineInputs = null;
  unsubscribeRaceSnapshots = null;
  unsubscribeOnlineStatus = null;
  unsubscribeOnlineCheckpoint = null;
  const session = getOnlineSession();
  unsubscribeOnlineRoom = session.subscribeRoom(room.roomCode, (snapshot) => {
    if (!snapshot) {
      onlineRoom = null;
      showTitle();
      return;
    }
    const roomData = snapshot as OnlineRoomData;
    if (roomData.meta?.pause) {
      roomData.meta.pause = normalizeOnlinePause(roomData.meta.pause);
    }
    const hostReady = Boolean(roomData.players?.[0]?.ready);
    const guestReady = Boolean(roomData.players?.[1]?.ready);
    const guestPresent = Boolean(roomData.players?.[1]?.connected);
    const previousPhase = onlinePhase;
    const phase = roomData.meta?.phase ?? "lobby";
    room.mode = roomData.meta?.mode ?? room.mode;
    onlineRoomData = roomData;
    onlinePhase = phase;
    renderOnlineLobby(roomData, room.playerId);
    if (roomData.meta?.mode) onlineMode.value = roomData.meta.mode;
    if (phase === "lobby") {
      if (onlineGame || onlineRace) {
        showOnlineRoomLobby(room, roomData);
      }
      setOnlineStatus(
        t("online.room.lobby", {
          code: room.roomCode,
          players: t(guestPresent ? "online.room.players.connected" : "online.room.players.waiting"),
          ready: t(hostReady && guestReady ? "online.room.ready.starting" : "online.room.ready.waiting")
        }),
        hostReady && guestReady ? "success" : "neutral"
      );
    }
    if (phase === "ended" && onlineRoom?.roomCode === room.roomCode) {
      setOnlineStatus(t("online.room.closed"));
      showTitle();
      return;
    }
    if (phase === "countdown") {
      prepareOnlineMode(room, roomData.meta ?? {});
      setOnlineStatus(t("online.phase.countdown"), "success");
    }
    if (phase === "playing") {
      prepareOnlineMode(room, roomData.meta ?? {});
      onlineRace?.beginPlaying();
      if (previousPhase !== "playing") {
        onlineConnectionMonitor.reset(performance.now());
        void audio.startMusic();
      }
      setOnlineStatus(t("online.phase.playing"), "success");
    }
    const opponentId = room.playerId === 0 ? 1 : 0;
    const peerPresence = roomData.players?.[opponentId]?.connected;
    onlineConnectionMonitor.setPeerPresence(peerPresence === true, performance.now());
    if (phase === "results") {
      audio.stopMusic();
      setOnlineStatus(t("online.phase.results"), "success");
      if (previousPhase !== "results") {
        void submitOnlineResult(room, roomData).catch(() => undefined);
      }
    }
    const onlinePausedNow = phase === "playing" && roomData.meta?.pause != null;
    if (onlinePausedNow !== wasOnlinePaused) {
      lastTime = performance.now();
      accumulator = 0;
      wasOnlinePaused = onlinePausedNow;
      if (onlinePausedNow) void audio.suspend();
      else {
        onlineConnectionMonitor.reset(performance.now());
        onlineConnectionMonitor.setPeerPresence(peerPresence === true, performance.now());
        void audio.resume();
      }
    }
    pauseControl.hidden = phase !== "playing" || Boolean(onlinePausedNow) || Boolean(onlineRace);
    racePause.hidden = phase !== "playing" || Boolean(onlinePausedNow) || !onlineRace;
    renderOnlineStateDialog();
    void driveOnlineRoundLifecycle();
  });
}

function prepareOnlineMode(
  room: OnlineRoomHandle,
  meta: OnlineRoomMeta
): void {
  const round = meta.round ?? 0;
  const mode = meta.mode ?? room.mode;
  if (onlinePreparedRound === round && room.mode === mode &&
      ((mode === "coop" && onlineGame) || (mode === "race" && onlineRace))) return;
  room.mode = mode;
  onlinePreparedRound = round;
  submittedOnlineRound = -1;
  if (mode === "race") {
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

function clearOnlineTransportSubscriptions(): void {
  unsubscribeOnlineInputs?.();
  unsubscribeRaceSnapshots?.();
  unsubscribeOnlineStatus?.();
  unsubscribeOnlineCheckpoint?.();
  unsubscribeOnlineInputs = null;
  unsubscribeRaceSnapshots = null;
  unsubscribeOnlineStatus = null;
  unsubscribeOnlineCheckpoint = null;
  onlinePeerStatus = null;
  latestOnlineCheckpoint = null;
  onlineConnectionMonitor.reset(performance.now());
}

function prepareOnlineCoop(
  room: OnlineRoomHandle,
  meta: OnlineRoomMeta
): void {
  const seed = meta.seed ?? Date.now();
  const onlineDifficulty = meta.difficulty ?? save.settings.difficulty;
  const round = meta.round ?? 0;
  const session = getOnlineSession();
  clearOnlineTransportSubscriptions();
  onlineGame = new OnlineGameController({
    seed,
    difficulty: onlineDifficulty,
    options: onlineOptions(meta),
    round,
    bufferTicks: meta.bufferTicks ?? DEFAULT_BUFFER_TICKS,
    playerId: room.playerId,
    sendInputBatch: (batch) => session.sendInputBatch(room.roomCode, batch),
    removeInputBatch: (sequence) =>
      session.removeInputBatch(room.roomCode, round, room.playerId, sequence),
    publishSyncStatus: (status) =>
      session.sendSyncStatus(room.roomCode, round, room.playerId, status),
    publishCheckpoint: (checkpoint) =>
      session.sendCheckpoint(room.roomCode, round, checkpoint)
  });
  const opponentId = room.playerId === 0 ? 1 : 0;
  unsubscribeOnlineInputs = session.subscribeInputBatches(
    room.roomCode,
    round,
    opponentId,
    (batch) => {
      onlineConnectionMonitor.markPeerActivity(performance.now());
      onlineGame?.queueRemoteBatch(batch);
    }
  );
  unsubscribeOnlineStatus = session.subscribeSyncStatus(
    room.roomCode,
    round,
    opponentId,
    (status) => {
      onlinePeerStatus = status;
      if (status) {
        onlineConnectionMonitor.markPeerActivity(performance.now());
        onlineGame?.receivePeerStatus(status);
      }
    }
  );
  unsubscribeOnlineCheckpoint = session.subscribeCheckpoint(
    room.roomCode,
    round,
    (checkpoint) => {
      latestOnlineCheckpoint = checkpoint;
      if (checkpoint && room.playerId === 1) {
        onlineConnectionMonitor.markPeerActivity(performance.now());
      }
      maybeApplyHostCheckpoint(checkpoint);
    }
  );
  playerCount = 2;
  game = null;
  onlineRace = null;
  wasOnlinePaused = false;
  scoreHandled = false;
  audio.configure(save.settings);
  closePanels();
  cabinet.classList.remove("race-active");
  raceStage.hidden = true;
  gameFrame.hidden = false;
  title.hidden = true;
  pauseControl.hidden = false;
  abortControl.hidden = false;
  gameFrame.append(onlineState);
  gameFrame.append(onlineConnectionIndicator);
  onlineState.hidden = true;
  onlineConnectionIndicator.hidden = true;
  setOnlineStatus(t("online.phase.playing"));
  renderer.render(onlineGame.snapshot());
  void refreshWorldRecord("coop", onlineDifficulty);
}

function maybeApplyHostCheckpoint(checkpoint: OnlineCheckpoint | null): void {
  if (!checkpoint || !onlineGame || !onlineRoom) return;
  const local = onlineGame.syncStatus();
  const hostReconnect = onlineRoom.playerId === 0 &&
    local.simulationTick === 0 && checkpoint.tick > 0;
  const sameTickMismatch = checkpoint.tick === local.simulationTick &&
    checkpoint.stateHash !== local.stateHash;
  const farBehind = checkpoint.tick - local.simulationTick > 30;
  if (hostReconnect || (onlineRoom.playerId === 1 && (sameTickMismatch || farBehind))) {
    onlineGame.applyHostCheckpoint(checkpoint);
  }
}

function prepareOnlineRace(
  room: OnlineRoomHandle,
  meta: OnlineRoomMeta,
  sendSnapshot?: (snapshot: RaceSnapshot) => Promise<void>
): void {
  const round = meta.round ?? 0;
  const session = getOnlineSession();
  clearOnlineTransportSubscriptions();
  onlineRace = new OnlineRaceController({
    seed: meta.seed ?? Date.now(),
    difficulty: meta.difficulty ?? save.settings.difficulty,
    options: onlineOptions(meta),
    playerId: room.playerId,
    playerName: onlinePlayerName(),
    round,
    snapshotIntervalTicks: 6,
    sendSnapshot: sendSnapshot ?? (async (snapshot) => {
      await session.sendRaceSnapshot(room.roomCode, room.playerId, snapshot);
    })
  });
  const opponentId = room.playerId === 0 ? 1 : 0;
  unsubscribeRaceSnapshots = session.subscribeRaceSnapshots(
    room.roomCode,
    round,
    opponentId,
    (snapshot) => {
      if (snapshot && onlineRace?.receiveSnapshot(snapshot)) {
        onlineConnectionMonitor.markPeerActivity(performance.now());
      }
    }
  );
  onlineGame = null;
  game = null;
  playerCount = 1;
  wasOnlinePaused = false;
  scoreHandled = true;
  audio.configure(save.settings);
  closePanels();
  title.hidden = true;
  gameFrame.hidden = true;
  raceStage.hidden = false;
  cabinet.classList.add("race-active");
  raceLocalLabel.textContent = `1P · ${onlinePlayerName()}`;
  raceRemoteLabel.textContent = `2P · ${onlineRoomData?.players?.[opponentId]?.name ?? "PLAYER2"}`;
  const initial = onlineRace.localSnapshot();
  raceLocalRenderer.render(initial);
  raceRemoteRenderer.render({ ...initial, players: [], platforms: [] });
  raceLocalPane.append(onlineState);
  raceLocalPane.append(onlineConnectionIndicator);
  onlineState.hidden = true;
  onlineConnectionIndicator.hidden = true;
  updateFullscreenScale();
  void refreshWorldRecord("race", meta.difficulty ?? save.settings.difficulty);
}

function showOnlineState(
  titleText: string,
  detail: string,
  options: { pause?: OnlinePauseState; canLeave?: boolean } = {}
): void {
  onlineState.hidden = false;
  onlineStateTitle.textContent = titleText;
  onlineStateDetail.textContent = detail;
  const pause = options.pause;
  const required = onlinePauseRequiredPlayers();
  onlinePausePlayers.hidden = !pause || pause.resumeAt !== null;
  for (const playerId of [0, 1] as const) {
    const status = onlinePausePlayers.querySelector<HTMLElement>(`[data-pause-player="${playerId}"]`)!;
    status.textContent = !required[playerId]
      ? t("online.result.gameover")
      : pause?.ready[playerId] ? t("online.ready") : t("online.waiting");
    status.dataset.ready = String(!required[playerId] || Boolean(pause?.ready[playerId]));
  }
  onlineStateActions.hidden = !pause && !options.canLeave;
  const localPlayerId = onlineRoom?.playerId ?? 0;
  onlineStateReady.hidden = !pause || pause.resumeAt !== null || !required[localPlayerId];
  onlineStateReady.disabled = !required[localPlayerId] || Boolean(pause?.ready[localPlayerId]);
  onlineStateLeave.hidden = !options.canLeave && !pause;
}

function localizedRaceResult(): string {
  if (!onlineRace) return t("online.result.gameover");
  const local = onlineRace.localSnapshot().floor;
  const remote = onlineRace.remoteSnapshot()?.floor ?? 0;
  const result = onlineRaceResult(local, remote);
  return result === "YOU WIN" ? t("online.result.win") :
    result === "YOU LOSE" ? t("online.result.lose") : t("online.result.draw");
}

function currentOnlineConnectionState(): OnlineConnectionState {
  return onlineConnectionMonitor.state(
    performance.now(),
    onlinePhase !== "playing" || Boolean(onlineRoomData?.meta?.pause)
  );
}

function renderOnlineConnectionIndicator(): OnlineConnectionState {
  const state = currentOnlineConnectionState();
  onlineConnectionIndicator.hidden = !connectionPresentation(state).indicator;
  return state;
}

function renderOnlineStateDialog(): void {
  if (!onlineRoom) {
    onlineState.hidden = true;
    onlineConnectionIndicator.hidden = true;
    return;
  }
  const connectionState = renderOnlineConnectionIndicator();
  const now = onlineServerNow();
  const pause = onlineRoomData?.meta?.pause ?? null;
  if (pause) {
    if (pause.resumeAt !== null) {
      const remaining = pause.resumeAt - now;
      showOnlineState(
        remaining <= 0 ? "GO!" : String(Math.max(1, Math.ceil(remaining / 1000))),
        remaining <= 0 ? "" : t("online.pause.resume")
      );
    } else {
      showOnlineState(t("online.pause.title"), t("online.pause.waiting"), {
        pause,
        canLeave: true
      });
    }
    return;
  }
  const countdownEndsAt = onlineRoomData?.meta?.countdownEndsAt ?? undefined;
  const countdown = countdownEndsAt === undefined ? null : onlineCountdownLabel(now, countdownEndsAt);
  if ((onlinePhase === "countdown" || onlinePhase === "playing") && countdown) {
    showOnlineState(countdown, countdown === "GO!" ? "" : t("online.phase.ready"));
    return;
  }
  if (connectionPresentation(connectionState).dialog) {
    showOnlineState(t("online.connection.lost"), t("online.connection.waiting"), {
      canLeave: true
    });
    return;
  }
  if (onlinePhase === "results") {
    const resultsEndsAt = onlineRoomData?.meta?.resultsEndsAt ?? now;
    const seconds = Number(onlineResultsCountdownLabel(now, resultsEndsAt));
    const localFloor = onlineRace?.localSnapshot().floor ?? onlineGame?.snapshot().floor ?? 0;
    const remoteFloor = onlineRace?.remoteSnapshot()?.floor;
    const rankValue = onlineRoomData?.meta?.resultRanks?.[onlineRoom.playerId];
    const view = buildOnlineResultViewModel({
      mode: onlineRace ? "race" : "coop",
      localFloor,
      ...(onlineRace ? { remoteFloor: remoteFloor ?? 0 } : {}),
      best5Rank: rankValue && rankValue > 0 ? rankValue : null,
      rankingPending: rankValue === undefined,
      seconds
    });
    const rankText = view.rankingPending ? t("online.result.ranking") :
      view.best5Rank ? t("online.result.best5", { rank: view.best5Rank }) :
        t("online.result.notBest5");
    const placementText = view.mode === "coop" ? t("online.result.shared") :
      view.placement ? t("online.result.place", { place: view.placement }) :
        t("online.result.draw");
    const floors = view.mode === "race"
      ? `1P ${view.localFloor} / 2P ${view.remoteFloor ?? 0}`
      : t("online.result.floor", { floor: view.localFloor });
    showOnlineState(
      view.mode === "race" ? localizedRaceResult() : t("online.result.gameover"),
      `${placementText}\n${floors}\n${rankText}\n${t("online.result.next", { seconds: view.seconds })}`
    );
    return;
  }
  onlineState.hidden = true;
}

function drawOnlineRoundOverlay(): void {
  renderOnlineStateDialog();
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
  const connection = currentOnlineConnectionState();
  const opponentId = onlineRoom?.playerId === 0 ? 1 : 0;
  const identity = onlineRace.remoteIdentity();
  const name = identity?.playerId === opponentId
    ? identity.name
    : onlineRoomData?.players?.[opponentId]?.name ?? "PLAYER2";
  raceRemoteLabel.textContent = connection === "healthy" && identity
    ? `2P · ${name}` : `2P · ${t("online.connection.syncing")}`;
}

document.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((button) => {
  button.addEventListener("click", () => void start(Number(button.dataset.start) as 1 | 2));
});
document.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    title.hidden = true;
    const panel = button.dataset.open;
    if (panel === "options") optionsPanel.hidden = false;
    if (panel === "sound") {
      optionsPanel.hidden = true;
      soundPanel.hidden = false;
    }
    if (panel === "online") {
      onlinePanel.hidden = false;
      onlineName.value = save.lastInputName;
      exitOnlineRoom();
      setOnlineStatus(t("online.description"));
      void resumeSavedOnlineRoom();
    }
    if (panel === "records") {
      recordsPanel.hidden = false;
      void renderRecords();
    }
    if (panel === "about") aboutPanel.hidden = false;
  });
});
for (const input of [player1Name, player2Name, onlineName]) {
  input.addEventListener("input", () => {
    input.value = normalizePlayerName(input.value, "");
  });
}
for (const [index, input] of [player1Name, player2Name].entries()) {
  input.addEventListener("change", () => {
    const fallback = index === 0 ? "PLAYER1" : "PLAYER2";
    input.value = normalizePlayerName(input.value, fallback);
    save.playerNames[index as 0 | 1] = input.value;
    if (index === 0) save.lastInputName = input.value;
    persist();
  });
}
document.querySelectorAll<HTMLButtonElement>("[data-record-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedRecordMode = button.dataset.recordMode as LeaderboardMode;
    void renderRecords();
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((button) => {
  button.addEventListener("click", () => showTitle());
});
document.querySelector<HTMLButtonElement>("[data-close-sound]")!.addEventListener("click", () => {
  soundPanel.hidden = true;
  optionsPanel.hidden = false;
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
locale.addEventListener("change", () => {
  save.settings.locale = locale.value as SaveData["settings"]["locale"];
  persist();
  applyLocaleToDocument();
});
onlineCreate.addEventListener("click", async () => {
  try {
    const codeInput = onlineCode.value.trim();
    if (codeInput && !/^\d{4}$/.test(codeInput)) {
      onlineCode.classList.add("error");
      setOnlineStatus(t("online.error.roomCode"), "error");
      return;
    }
    onlineCode.classList.remove("error");
    onlineCreate.disabled = true;
    setOnlineStatus(t("online.room.creating"));
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
      },
      roomCode: codeInput || undefined
    });
    onlineRoom = room;
    saveOnlineResumeTicket(room);
    void session.measureNetworkTiming(room.roomCode, room.playerId).catch(() => undefined);
    save.lastInputName = onlinePlayerName();
    persist();
    onlineCode.value = room.roomCode;
    enterOnlineRoom("host");
    renderOnlineLobby({
      players: { 0: { connected: true, ready: false, name: onlinePlayerName() } }
    }, room.playerId);
    subscribeOnlineRoom(room);
    await copyCurrentRoomCode();
  } catch (error) {
    setOnlineStatus(
      onlineErrorMessage(error),
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
    setOnlineStatus(t("online.room.joining"));
    const session = getOnlineSession();
    onlineServerOffsetMs = await session.getServerTimeOffset().catch(() => 0);
    const room = await session.joinRoom(validation.code, onlinePlayerName());
    onlineRoom = room;
    saveOnlineResumeTicket(room);
    void session.measureNetworkTiming(room.roomCode, room.playerId).catch(() => undefined);
    save.lastInputName = onlinePlayerName();
    persist();
    enterOnlineRoom("guest");
    subscribeOnlineRoom(room);
    setOnlineStatus(t("online.room.joined", { code: room.roomCode }));
  } catch (error) {
    setOnlineStatus(
      onlineErrorMessage(error),
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
    onlineReady.textContent = `${t("online.ready")} ✓`;
    setOnlineStatus(t("online.pause.waiting"), "success");
  } catch (error) {
    onlineReady.disabled = false;
    setOnlineStatus(
      onlineErrorMessage(error),
      "error"
    );
  }
});
onlineCode.addEventListener("input", () => onlineCode.classList.remove("error"));
onlineCopy.addEventListener("click", () => void copyCurrentRoomCode());
onlineMode.addEventListener("change", async () => {
  if (!onlineRoom || onlineRoom.role !== "host" || onlinePhase !== "lobby") return;
  const mode = onlineMode.value as OnlineRoomMode;
  onlineRoom.mode = mode;
  try {
    await getOnlineSession().updateMeta(onlineRoom.roomCode, { mode });
  } catch {
    // ponytail: silent fail, local mode already set for next round
  }
});
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
onlineStateReady.addEventListener("click", async () => {
  const room = onlineRoom;
  const pause = onlineRoomData?.meta?.pause;
  if (!room || !pause) return;
  onlineStateReady.disabled = true;
  try {
    await getOnlineSession().setPauseReady(room.roomCode, room.playerId, true);
  } catch (error) {
    onlineStateReady.disabled = false;
    setOnlineStatus(onlineErrorMessage(error), "error");
  }
});
onlineStateLeave.addEventListener("click", () => {
  audio.playEffect("abort");
  showTitle();
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Enter" && game?.snapshot().mode === "gameover") showTitle();
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
void resumeSavedOnlineRoom();

window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: "origin top-left; +x right; +y down; frame 634x436; playfield 420x356 at (22,62)",
  ui: !title.hidden ? "title" : !optionsPanel.hidden ? "options" :
    !soundPanel.hidden ? "sound" : !recordsPanel.hidden ? "records" : !onlinePanel.hidden ? "online" :
      onlineRace ? "race" : "game",
  ...((game ?? onlineGame)?.snapshot() ?? onlineRace?.localSnapshot() ?? { mode: "title" }),
  online: onlineRoom ? {
    roomCode: onlineRoom.roomCode,
    role: onlineRoom.role,
    playerId: onlineRoom.playerId,
    mode: onlineRoom.mode,
    phase: onlinePhase,
    round: onlineRoomData?.meta?.round ?? 0,
    pause: onlineRoomData?.meta?.pause ?? null,
    display: onlineDisplayText(),
    status: onlineGame?.status() ?? onlineRace?.status(),
    sync: onlineGame?.syncStatus() ?? null,
    peerStatus: onlinePeerStatus,
    bufferTicks: onlineRoomData?.meta?.bufferTicks ?? null,
    connection: currentOnlineConnectionState(),
    connectionIndicator: onlineConnectionIndicator.hidden
      ? null
      : onlineConnectionIndicator.textContent?.trim() ?? null,
    dialog: onlineState.hidden ? null : {
      title: onlineStateTitle.textContent,
      detail: onlineStateDetail.textContent
    }
  } : null,
  race: onlineRace ? {
    local: onlineRace.localSnapshot(),
    remote: onlineRace.remoteSnapshot(),
    status: onlineRace.status()
  } : null,
  settings: { ...save.settings },
  audio: { music: save.settings.music, sound: save.settings.sound, ...audio.status() }
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
        roomCode: "0000",
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
      onlineRace.receiveSnapshot(serializeRaceSnapshot(
        1,
        "OPPONENT",
        Date.now(),
        state,
        onlineRoomData?.meta?.round ?? 0,
        state.ticks + 1
      ));
      const remote = onlineRace.remoteSnapshot();
      if (remote) raceRemoteRenderer.render(remote);
      drawRaceStatus();
    },
    setOnlineRoundPhase: async (phase, endsInMs = 0) => {
      if (!onlineRoom) return;
      const now = onlineServerNow();
      if (onlineSession && unsubscribeOnlineRoom) {
        await onlineSession.updateMeta(onlineRoom.roomCode, {
          phase,
          ...(phase === "countdown" || phase === "playing"
            ? { countdownEndsAt: now + endsInMs } : {}),
          resultsEndsAt: phase === "results" ? now + endsInMs : null
        });
        return;
      }
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
    setOnlinePause: (pause) => {
      if (!onlineRoomData?.meta) return;
      onlineRoomData.meta.pause = pause;
      renderOnlineStateDialog();
    },
    setOnlineConnection: (connected, idleMs) => {
      const now = performance.now();
      onlineConnectionMonitor.reset(now - idleMs);
      onlineConnectionMonitor.setPeerPresence(connected, now - idleMs);
      renderOnlineStateDialog();
      drawRaceStatus();
    },
    setOnlineResultRank: (rank) => {
      if (!onlineRoom) return;
      onlineRoomData ??= { players: {} };
      onlineRoomData.meta ??= {};
      onlineRoomData.meta.resultRanks = {
        ...(onlineRoomData.meta.resultRanks ?? {}),
        [onlineRoom.playerId]: rank
      };
      renderOnlineStateDialog();
    },
    showOnlineLobby: (players, localPlayerId = 0) => {
      onlinePanel.hidden = false;
      title.hidden = true;
      onlineRoom = {
        roomCode: "1234",
        role: localPlayerId === 0 ? "host" : "guest",
        playerId: localPlayerId,
        mode: "coop"
      };
      onlineCode.value = "1234";
      enterOnlineRoom(localPlayerId === 0 ? "host" : "guest");
      renderOnlineLobby({ players }, localPlayerId);
    }
  };
}

applySettingsToControls();
applyLocaleToDocument();
renderer.render({
  mode: "title", difficulty: save.settings.difficulty, floor: 0,
  floorSequence: 0, level: 0, timeMs: 0, cameraY: 0, ticks: 0,
  players: [], platforms: []
});
requestAnimationFrame(frame);
