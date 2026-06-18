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
  label: "P1 HOST" | "P2 GUEST";
  name: string;
  status: LobbyPlayerStatus;
  text: "WAITING" | "CONNECTED" | "READY";
}

export interface LobbyView {
  players: [LobbyPlayerView, LobbyPlayerView];
  readyButton: {
    state: "available" | "ready";
    label: "Ready" | "READY ✓";
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
    label: playerId === 0 ? "P1 HOST" : "P2 GUEST",
    name: player?.name ?? "---",
    status,
    text: status === "ready" ? "READY" :
      status === "connected" ? "CONNECTED" : "WAITING"
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
      ? { state: "ready", label: "READY ✓", disabled: true }
      : { state: "available", label: "Ready", disabled: false }
  };
}
