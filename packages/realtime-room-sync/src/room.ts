import type { Checkpoint, PlayerId, RealtimeRoomTransport, RoomCapacity, RoomHandle, RoomPlayer, RoomState, Unsubscribe } from "./types.js";

export interface RoomClientOptions<TSettings> {
  transport: RealtimeRoomTransport<TSettings>;
  clientId: string;
  now?: () => number;
  reconnectGraceMs?: number;
  roomCodeLength?: number;
  random?: () => number;
}

export class RoomClient<TSettings> {
  state: RoomState<TSettings> | null = null;
  handle: RoomHandle | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private readonly now: () => number;

  constructor(private readonly options: RoomClientOptions<TSettings>) {
    this.now = options.now ?? Date.now;
  }

  get transport(): RealtimeRoomTransport<TSettings> { return this.options.transport; }
  get player(): RoomPlayer | null { return this.handle ? this.state?.players[this.handle.playerId] ?? null : null; }

  async createRoom(input: { code?: string; capacity: RoomCapacity; name: string; settings: TSettings }): Promise<RoomHandle> {
    const code = input.code ?? this.generateCode();
    this.validateCode(code);
    const player = this.makePlayer(0, input.name);
    const state: RoomState<TSettings> = {
      meta: { code, capacity: input.capacity, hostId: 0, phase: "lobby", round: 1, participantEpoch: 1, activePlayerIds: [0], settings: input.settings },
      players: { 0: player }
    };
    if (!await this.transport.createRoom(code, state)) throw new Error("Room code is already in use");
    return this.attach(code, player);
  }

  async joinRoom(input: { code: string; name: string }): Promise<RoomHandle> {
    this.validateCode(input.code);
    let joined: RoomPlayer | null = null;
    const state = await this.transport.transactRoom(input.code, (room) => {
      if (!room) throw new Error("Room not found");
      const occupied = Object.values(room.players).filter(Boolean) as RoomPlayer[];
      if (occupied.length >= room.meta.capacity) throw new Error("Room is full");
      const id = Array.from({ length: room.meta.capacity }, (_, value) => value).find((value) => !room.players[value]);
      if (id === undefined) throw new Error("Room is full");
      joined = this.makePlayer(id, input.name);
      return { ...room, meta: { ...room.meta, activePlayerIds: [...room.meta.activePlayerIds, id].sort() }, players: { ...room.players, [id]: joined } };
    });
    if (!state || !joined) throw new Error("Unable to join room");
    return this.attach(input.code, joined);
  }

  async reconnect(handle: RoomHandle): Promise<void> {
    const state = await this.transport.transactRoom(handle.code, (room) => {
      const player = room?.players[handle.playerId];
      if (!room || !player || player.resumeToken !== handle.resumeToken) throw new Error("Reconnect token is invalid");
      return { ...room, players: { ...room.players, [handle.playerId]: { ...player, clientId: this.options.clientId, connected: true, disconnectedAt: undefined, lastSeenAt: this.now() } } };
    });
    if (!state) throw new Error("Room is closed");
    this.handle = handle;
    this.watch(handle.code);
  }

  async setReady(ready: boolean): Promise<void> { await this.updatePlayer((player) => ({ ...player, ready })); }

  async start(countdownEndsAt: number): Promise<void> {
    await this.updateRoom((room) => {
      this.assertHost(room);
      const active = activePlayers(room);
      if (active.length < 2 || active.some((player) => !player.ready)) throw new Error("All active players must be ready");
      return { ...room, meta: { ...room.meta, phase: "countdown", countdownEndsAt } };
    });
  }

  async beginPlaying(): Promise<void> {
    await this.updateRoom((room) => ({ ...room, meta: { ...room.meta, phase: "playing", countdownEndsAt: undefined, resumeAt: undefined } }));
  }

  async requestPause(): Promise<void> {
    await this.updateRoom((room) => ({ ...room, meta: { ...room.meta, phase: "paused" }, players: mapPlayers(room, (player) => ({ ...player, pauseReady: false })) }));
  }

  async setPauseReady(ready: boolean): Promise<void> { await this.updatePlayer((player) => ({ ...player, pauseReady: ready })); }

  async resume(resumeAt: number): Promise<void> {
    await this.updateRoom((room) => {
      this.assertHost(room);
      if (activePlayers(room).some((player) => !player.pauseReady)) throw new Error("All active players must be ready to resume");
      return { ...room, meta: { ...room.meta, resumeAt } };
    });
  }

  async finish(results: unknown): Promise<void> {
    await this.updateRoom((room) => ({ ...room, meta: { ...room.meta, phase: "results", results } }));
  }

  async rematch(): Promise<void> {
    await this.updateRoom((room) => {
      this.assertHost(room);
      return { ...room, meta: { ...room.meta, phase: "lobby", round: room.meta.round + 1, results: undefined, countdownEndsAt: undefined, resumeAt: undefined }, players: mapPlayers(room, (player) => ({ ...player, ready: false, pauseReady: false })) };
    });
  }

  async heartbeat(): Promise<void> { await this.updatePlayer((player) => ({ ...player, connected: true, lastSeenAt: this.now(), disconnectedAt: undefined })); }

  async disconnect(): Promise<void> {
    await this.updatePlayer((player) => ({ ...player, connected: false, disconnectedAt: this.now(), lastSeenAt: this.now(), ready: false, pauseReady: false }), true);
    if (this.handle?.playerId !== 0) await this.updateRoom((room) => ({ ...room, meta: { ...room.meta, phase: room.meta.phase === "playing" ? "paused" : room.meta.phase } }), true);
    this.unsubscribe?.();
  }

  async removeExpiredPlayers<TCheckpoint>(now: number, checkpoint: Omit<Checkpoint<TCheckpoint>, "participantEpoch">): Promise<void> {
    const current = this.handle ? await this.transport.readRoom(this.handle.code) : null;
    const host = current?.players[0];
    const grace = this.options.reconnectGraceMs ?? 15000;
    if (current && host && !host.connected && now - (host.disconnectedAt ?? now) >= grace) {
      await this.transport.deleteRoom(current.meta.code);
      this.state = null;
      return;
    }
    let published: Checkpoint<TCheckpoint> | null = null;
    await this.updateRoom((room) => {
      this.assertHost(room);
      const expired = room.meta.activePlayerIds
        .map((id) => room.players[id])
        .filter((player): player is RoomPlayer => Boolean(player && player.id !== 0 && !player.connected && now - (player.disconnectedAt ?? now) >= grace));
      if (!expired.length) return room;
      const players = { ...room.players };
      for (const player of expired) delete players[player.id];
      const activePlayerIds = room.meta.activePlayerIds.filter((id) => players[id]);
      const participantEpoch = room.meta.participantEpoch + 1;
      published = { ...checkpoint, participantEpoch };
      return { ...room, players, meta: { ...room.meta, activePlayerIds, participantEpoch, phase: activePlayerIds.length >= 2 ? "paused" : "results" } };
    });
    if (published && this.handle) await this.transport.publishCheckpoint(this.handle.code, this.state!.meta.round, published);
  }

  async leave(): Promise<void> {
    if (!this.handle) return;
    const { code, playerId } = this.handle;
    if (playerId === 0) await this.transport.deleteRoom(code);
    else await this.updateRoom((room) => {
      const players = { ...room.players }; delete players[playerId];
      const activePlayerIds = room.meta.activePlayerIds.filter((id) => id !== playerId);
      return { ...room, players, meta: { ...room.meta, activePlayerIds, participantEpoch: room.meta.participantEpoch + 1, phase: activePlayerIds.length >= 2 ? "paused" : "results" } };
    }, true);
    this.unsubscribe?.(); this.unsubscribe = null;
  }

  private async updatePlayer(update: (player: RoomPlayer) => RoomPlayer, allowDisconnected = false): Promise<void> {
    await this.updateRoom((room) => {
      const id = this.requireHandle().playerId;
      const player = room.players[id];
      if (!player || (!allowDisconnected && !player.connected)) throw new Error("Player is not active");
      return { ...room, players: { ...room.players, [id]: update(player) } };
    }, allowDisconnected);
  }

  private async updateRoom(update: (room: RoomState<TSettings>) => RoomState<TSettings>, allowDisconnected = false): Promise<void> {
    const handle = this.requireHandle();
    const state = await this.transport.transactRoom(handle.code, (room) => {
      if (!room) throw new Error("Room is closed");
      const player = room.players[handle.playerId];
      if (!player || player.resumeToken !== handle.resumeToken || (!allowDisconnected && !player.connected)) throw new Error("Player session is invalid");
      return update(room);
    });
    this.state = state;
  }

  private attach(code: string, player: RoomPlayer): RoomHandle {
    this.handle = { code, playerId: player.id, resumeToken: player.resumeToken };
    this.watch(code);
    return this.handle;
  }

  private watch(code: string): void {
    this.unsubscribe?.();
    this.unsubscribe = this.transport.subscribeRoom(code, (state) => { this.state = state; });
  }

  private makePlayer(id: PlayerId, name: string): RoomPlayer {
    return { id, name, clientId: this.options.clientId, resumeToken: token(), connected: true, ready: false, pauseReady: false, lastSeenAt: this.now() };
  }

  private requireHandle(): RoomHandle { if (!this.handle) throw new Error("Not in a room"); return this.handle; }
  private assertHost(room: RoomState<TSettings>): void { if (this.requireHandle().playerId !== room.meta.hostId) throw new Error("Only the host can perform this action"); }
  private validateCode(code: string): void { const length = this.options.roomCodeLength ?? 4; if (length < 4 || length > 8 || !new RegExp(`^[0-9]{${length}}$`).test(code)) throw new Error(`Room code must be ${length} numeric digits`); }
  private generateCode(): string { const length = this.options.roomCodeLength ?? 4; const random = this.options.random ?? Math.random; return Array.from({ length }, () => Math.floor(random() * 10)).join(""); }
}

function token(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function activePlayers<T>(room: RoomState<T>): RoomPlayer[] { return room.meta.activePlayerIds.map((id) => room.players[id]).filter((player): player is RoomPlayer => Boolean(player?.connected)); }
function mapPlayers<T>(room: RoomState<T>, update: (player: RoomPlayer) => RoomPlayer): RoomState<T>["players"] { return Object.fromEntries(Object.entries(room.players).map(([id, player]) => [id, player ? update(player) : player])); }
