export type LobbyPlayerStatus = "waiting" | "connected" | "ready";

export interface LobbyPlayerData {
  connected?: boolean;
  ready?: boolean;
  name?: string;
}

export interface LobbyRoomData {
  players?: Partial<Record<0 | 1, LobbyPlayerData>>;
}

export interface LobbyPlayerView {
  playerId: 0 | 1;
  label: "1P ホスト" | "2P ゲスト";
  name: string;
  status: LobbyPlayerStatus;
  text: "待機中" | "接続済み" | "準備完了";
}

export interface LobbyView {
  players: [LobbyPlayerView, LobbyPlayerView];
  readyButton: {
    state: "available" | "ready";
    label: "準備完了" | "準備完了 ✓";
    disabled: boolean;
  };
}

function playerView(playerId: 0 | 1, player?: LobbyPlayerData): LobbyPlayerView {
  const status: LobbyPlayerStatus = player?.ready
    ? "ready"
    : player?.connected
      ? "connected"
      : "waiting";
  return {
    playerId,
    label: playerId === 0 ? "1P ホスト" : "2P ゲスト",
    name: player?.name ?? "---",
    status,
    text: status === "ready" ? "準備完了" :
      status === "connected" ? "接続済み" : "待機中"
  };
}

export function buildLobbyView(
  room: LobbyRoomData,
  localPlayerId: 0 | 1
): LobbyView {
  const players: [LobbyPlayerView, LobbyPlayerView] = [
    playerView(0, room.players?.[0]),
    playerView(1, room.players?.[1])
  ];
  const localReady = players[localPlayerId].status === "ready";
  return {
    players,
    readyButton: localReady
      ? { state: "ready", label: "準備完了 ✓", disabled: true }
      : { state: "available", label: "準備完了", disabled: false }
  };
}
