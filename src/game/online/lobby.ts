import type { Difficulty } from "../types";
import {
  normalizeOnlineRoomSettings,
  type OnlineMechanismOptions,
  type OnlineRoomMode
} from "./session";

export type LobbyPlayerStatus = "waiting" | "connected" | "ready";

export interface LobbyPlayerData {
  connected?: boolean;
  ready?: boolean;
  name?: string;
  timing?: { rttMs: number; jitterMs: number };
}

export interface LobbyRoomData {
  players?: Partial<Record<0 | 1, LobbyPlayerData>>;
  meta?: {
    difficulty?: Difficulty;
    mode?: OnlineRoomMode;
    options?: Partial<OnlineMechanismOptions>;
  };
}

export interface LobbyPlayerView {
  playerId: 0 | 1;
  role: "host" | "guest";
  label: "1P ホスト" | "2P ゲスト";
  name: string;
  status: LobbyPlayerStatus;
  text: "待機中" | "接続済み" | "準備完了";
  spriteVariant: "yellow" | "green";
  isLocalPlayer: boolean;
}

export interface LobbyView {
  header: {
    roomCode: string;
    playerCount: string;
    readyState: "WAITING" | "STARTING";
  };
  players: [LobbyPlayerView, LobbyPlayerView];
  readyButton: {
    state: "available" | "ready";
    label: "準備完了" | "準備完了 ✓";
    disabled: boolean;
  };
  startButton: {
    disabled: boolean;
  };
  actions: {
    showCopy: boolean;
    showReady: boolean;
    showStart: boolean;
    showSettings: boolean;
    showCodeInput: boolean;
    showCreate: boolean;
    showJoin: boolean;
  };
  settings: {
    difficulty: Difficulty;
    mode: OnlineRoomMode;
    options: OnlineMechanismOptions;
    editable: boolean;
    locked: boolean;
  };
}

function playerView(
  playerId: 0 | 1,
  localPlayerId: 0 | 1,
  player?: LobbyPlayerData
): LobbyPlayerView {
  const status: LobbyPlayerStatus = player?.ready
    ? "ready"
    : player?.connected
      ? "connected"
      : "waiting";
  return {
    playerId,
    role: playerId === 0 ? "host" : "guest",
    label: playerId === 0 ? "1P ホスト" : "2P ゲスト",
    name: player?.name ?? "---",
    status,
    text: status === "ready" ? "準備完了" :
      status === "connected" ? "接続済み" : "待機中",
    spriteVariant: playerId === 0 ? "yellow" : "green",
    isLocalPlayer: playerId === localPlayerId
  };
}

export function buildLobbyView(
  room: LobbyRoomData,
  localPlayerId: 0 | 1,
  roomCode = "----"
): LobbyView {
  const players: [LobbyPlayerView, LobbyPlayerView] = [
    playerView(0, localPlayerId, room.players?.[0]),
    playerView(1, localPlayerId, room.players?.[1])
  ];
  const localReady = players[localPlayerId].status === "ready";
  const locked = players.some((player) => player.status === "ready");
  const settings = normalizeOnlineRoomSettings(room.meta);
  const connectedCount = players.filter((player) => player.status !== "waiting").length;
  const guestPresent = players[1].status !== "waiting";
  const bothReady = players.every((player) => player.status === "ready");
  return {
    header: {
      roomCode,
      playerCount: `${connectedCount}/2`,
      readyState: bothReady ? "STARTING" : "WAITING"
    },
    players,
    readyButton: localReady
      ? { state: "ready", label: "準備完了 ✓", disabled: true }
      : { state: "available", label: "準備完了", disabled: false },
    startButton: {
      disabled: localPlayerId !== 0 || !bothReady
    },
    actions: {
      showCopy: localPlayerId === 0 && !guestPresent,
      showReady: true,
      showStart: guestPresent,
      showSettings: true,
      showCodeInput: false,
      showCreate: false,
      showJoin: false
    },
    settings: {
      ...settings,
      editable: localPlayerId === 0 && !locked,
      locked
    }
  };
}
