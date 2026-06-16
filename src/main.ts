import "./style.css";
import { GameAudio } from "./game/audio";
import { KeyboardInput } from "./game/input";
import { Renderer } from "./game/renderer";
import { integerScaleForViewport } from "./game/layout";
import { GameSimulation } from "./game/simulation";
import { loadSave, recordScore, SAVE_KEY } from "./game/storage";
import type { Difficulty, GameStateSnapshot, InputFrame, SaveData } from "./game/types";

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __nsShaftQa?: {
      setPlayer: (index: number, patch: Record<string, unknown>) => void;
      setPlatforms: (platforms: Record<string, unknown>[]) => void;
      setProgress: (floorSequence: number) => void;
    };
  }
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app was not found");
const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

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
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const cabinet = document.querySelector<HTMLElement>(".cabinet")!;
const gameFrame = document.querySelector<HTMLElement>(".game-frame")!;
const title = document.querySelector<HTMLElement>("#title-screen")!;
const optionsPanel = document.querySelector<HTMLElement>("#options-panel")!;
const recordsPanel = document.querySelector<HTMLElement>("#records-panel")!;
const aboutPanel = document.querySelector<HTMLElement>("#about-panel")!;
const namePanel = document.querySelector<HTMLElement>("#name-panel")!;
const difficulty = document.querySelector<HTMLSelectElement>("#difficulty")!;
const pauseControl = document.querySelector<HTMLButtonElement>("#pause-control")!;
const abortControl = document.querySelector<HTMLButtonElement>("#abort-control")!;
const renderer = new Renderer(canvas);
const keyboard = new KeyboardInput();
const audio = new GameAudio();
let save: SaveData = loadSave(localStorage.getItem(SAVE_KEY));
let game: GameSimulation | null = null;
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
  renderer.configure({
    fast: save.settings.fast,
    recordFloor: save.records[save.settings.difficulty][0]?.floor ?? 0
  });
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
  aboutPanel.hidden = true;
  namePanel.hidden = true;
}

async function start(players: 1 | 2): Promise<void> {
  playerCount = players;
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
  title.hidden = true;
  pauseControl.hidden = false;
  abortControl.hidden = false;
  renderer.render(game.snapshot());
}

function showTitle(): void {
  game = null;
  audio.stopMusic();
  closePanels();
  title.hidden = false;
  pauseControl.hidden = true;
  abortControl.hidden = true;
}

function togglePause(): void {
  if (!game || game.snapshot().mode === "gameover") return;
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

document.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((button) => {
  button.addEventListener("click", () => void start(Number(button.dataset.start) as 1 | 2));
});
document.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    title.hidden = true;
    const panel = button.dataset.open;
    if (panel === "options") optionsPanel.hidden = false;
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
pauseControl.addEventListener("click", togglePause);
abortControl.addEventListener("click", () => {
  if (game) showTitle();
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
    else void gameFrame.requestFullscreen();
  }
});
window.addEventListener("blur", () => {
  if (game?.snapshot().mode === "playing") togglePause();
});

function updateFullscreenScale(): void {
  const scale = String(integerScaleForViewport(window.innerWidth, window.innerHeight));
  cabinet.style.setProperty("--game-scale", scale);
  gameFrame.style.setProperty("--game-scale", scale);
}
window.addEventListener("resize", updateFullscreenScale);
document.addEventListener("fullscreenchange", updateFullscreenScale);
updateFullscreenScale();

window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: "origin top-left; +x right; +y down; frame 634x436; playfield 420x356 at (22,62)",
  ui: !title.hidden ? "title" : !optionsPanel.hidden ? "options" :
    !recordsPanel.hidden ? "records" : !namePanel.hidden ? "name-entry" : "game",
  ...(game?.snapshot() ?? { mode: "title" }),
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
    setProgress: (floorSequence) => game?.debugSetProgress(floorSequence)
  };
}

applySettingsToControls();
renderer.render({
  mode: "title", difficulty: save.settings.difficulty, floor: 0,
  floorSequence: 0, level: 0, timeMs: 0, cameraY: 0, ticks: 0,
  players: [], platforms: []
});
requestAnimationFrame(frame);
