import type { GameEvent, GameEventType } from "./types";
import { Midi } from "@tonejs/midi";

export const AUDIO_RESOURCES = [
  { resourceId: 107, durationMs: 271.7 },
  { resourceId: 108, durationMs: 320.1 },
  { resourceId: 109, durationMs: 438.5 },
  { resourceId: 110, durationMs: 441.7 },
  { resourceId: 111, durationMs: 1083.4 },
  { resourceId: 112, durationMs: 1775.1 },
  { resourceId: 113, durationMs: 1811.8 },
  { resourceId: 114, durationMs: 801.8 },
  { resourceId: 115, durationMs: 1380.1 }
] as const satisfies readonly {
  resourceId: number;
  durationMs: number;
}[];

const durationFor = (resourceId: number): number =>
  AUDIO_RESOURCES.find((resource) => resource.resourceId === resourceId)?.durationMs ?? 0;

export const AUDIO_EFFECTS = [
  { event: "land", resourceId: 107 },
  { event: "heal", resourceId: 108 },
  { event: "hurt", resourceId: 110 },
  { event: "spring", resourceId: 109 },
  { event: "conveyor", resourceId: 107 },
  { event: "rotate", resourceId: 111 },
  { event: "ceiling", resourceId: 110 },
  { event: "death", resourceId: 113 },
  { event: "pause", resourceId: 114 },
  { event: "abort", resourceId: 115 }
].map((effect) => ({
  ...effect,
  durationMs: durationFor(effect.resourceId)
})) as readonly {
  event: GameEventType;
  resourceId: number;
  durationMs: number;
}[];

export const AUDIO_MANIFEST = {
  music: `${import.meta.env.BASE_URL}assets/BGM.MID`,
  effects: Object.fromEntries(AUDIO_EFFECTS.map((effect) => [
    effect.event,
    `${import.meta.env.BASE_URL}assets/extracted/wave-${effect.resourceId}-1041.bin`
  ])) as Record<GameEventType, string>
};

export type EffectName = keyof typeof AUDIO_MANIFEST.effects;
export const MUSIC_MASTER_GAIN = 0.1;

export class GameAudio {
  private context?: AudioContext;
  private buffers = new Map<EffectName, AudioBuffer>();
  private musicTimer?: number;
  private musicGain?: GainNode;
  private midi?: Midi;
  private musicLoopEndsAt?: number;
  private pausedLoopRemainingMs?: number;
  musicEnabled = true;
  soundEnabled = true;

  async unlock(): Promise<void> {
    try {
      this.context ??= new AudioContext();
    } catch {
      return;
    }
    if (this.context.state === "suspended") await this.context.resume();
    await Promise.all(Object.entries(AUDIO_MANIFEST.effects).map(async ([name, url]) => {
      if (this.buffers.has(name as EffectName)) return;
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        this.buffers.set(name as EffectName, await this.context!.decodeAudioData(data));
      } catch {
        // A missing effect must not stop the game or the remaining sounds.
      }
    }));
  }

  configure(settings: { music: boolean; sound: boolean }): void {
    this.musicEnabled = settings.music;
    this.soundEnabled = settings.sound;
    if (!this.musicEnabled) this.stopMusic();
  }

  consume(events: GameEvent[]): void {
    if (!this.soundEnabled || !this.context) return;
    for (const event of events) this.playEffect(event.type);
  }

  playEffect(name: EffectName, options: { force?: boolean } = {}): void {
    const buffer = this.buffers.get(name);
    if (!this.context || !buffer || (!this.soundEnabled && !options.force)) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = 0.5;
    source.buffer = buffer;
    source.connect(gain).connect(this.context.destination);
    source.start();
  }

  async previewEffect(name: EffectName): Promise<void> {
    await this.unlock();
    this.playEffect(name, { force: true });
  }

  async startMusic(): Promise<void> {
    if (!this.musicEnabled) return;
    try {
      await this.unlock();
    } catch {
      return;
    }
    if (!this.context) return;
    this.stopMusic();
    if (!this.midi) {
      try {
        const response = await fetch(AUDIO_MANIFEST.music);
        if (!response.ok) return;
        this.midi = new Midi(await response.arrayBuffer());
      } catch {
        return;
      }
    }
    this.musicGain = this.context!.createGain();
    this.musicGain.gain.value = MUSIC_MASTER_GAIN;
    this.musicGain.connect(this.context!.destination);
    const play = () => {
      if (!this.context || !this.musicGain || !this.musicEnabled || !this.midi) return;
      const start = this.context.currentTime + 0.03;
      for (const track of this.midi.tracks) {
        for (const note of track.notes) {
          const oscillator = this.context.createOscillator();
          const envelope = this.context.createGain();
          oscillator.type = "square";
          oscillator.frequency.value = 440 * 2 ** ((note.midi - 69) / 12);
          envelope.gain.setValueAtTime(0.0001, start + note.time);
          envelope.gain.exponentialRampToValueAtTime(
            Math.max(0.002, note.velocity * 0.18),
            start + note.time + 0.01
          );
          envelope.gain.exponentialRampToValueAtTime(
            0.0001,
            start + note.time + Math.max(0.04, note.duration)
          );
          oscillator.connect(envelope).connect(this.musicGain);
          oscillator.start(start + note.time);
          oscillator.stop(start + note.time + Math.max(0.05, note.duration));
        }
      }
      const durationMs = Math.max(500, this.midi.duration * 1000);
      this.musicLoopEndsAt = start + durationMs / 1000;
      this.musicTimer = window.setTimeout(play, durationMs);
    };
    play();
  }

  stopMusic(): void {
    if (this.musicTimer !== undefined) window.clearTimeout(this.musicTimer);
    this.musicTimer = undefined;
    this.musicLoopEndsAt = undefined;
    this.pausedLoopRemainingMs = undefined;
    this.musicGain?.disconnect();
    this.musicGain = undefined;
  }

  async suspend(): Promise<void> {
    if (this.context?.state !== "running") return;
    if (this.musicTimer !== undefined) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = undefined;
      this.pausedLoopRemainingMs = Math.max(
        0,
        ((this.musicLoopEndsAt ?? this.context.currentTime) - this.context.currentTime) * 1000
      );
    }
    await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.context?.state !== "suspended") return;
    await this.context.resume();
    if (this.musicGain && this.midi && this.musicEnabled && this.musicTimer === undefined) {
      const delay = this.pausedLoopRemainingMs ?? Math.max(500, this.midi.duration * 1000);
      this.pausedLoopRemainingMs = undefined;
      this.musicTimer = window.setTimeout(() => {
        this.musicTimer = undefined;
        void this.startMusic();
      }, delay);
    }
  }

  status(): {
    contextState: AudioContextState | "unavailable";
    midiLoaded: boolean;
    musicActive: boolean;
    musicGain: number;
  } {
    return {
      contextState: this.context?.state ?? "unavailable",
      midiLoaded: Boolean(this.midi),
      musicActive: Boolean(this.musicGain),
      musicGain: this.musicGain?.gain.value ?? 0
    };
  }
}
