import type { GameEvent, GameEventType } from "./types";
import { Midi } from "@tonejs/midi";

export const AUDIO_MANIFEST = {
  music: `${import.meta.env.BASE_URL}assets/BGM.MID`,
  effects: {
    land: `${import.meta.env.BASE_URL}assets/extracted/wave-107-1041.bin`,
    heal: `${import.meta.env.BASE_URL}assets/extracted/wave-108-1041.bin`,
    hurt: `${import.meta.env.BASE_URL}assets/extracted/wave-109-1041.bin`,
    spring: `${import.meta.env.BASE_URL}assets/extracted/wave-110-1041.bin`,
    conveyor: `${import.meta.env.BASE_URL}assets/extracted/wave-111-1041.bin`,
    rotate: `${import.meta.env.BASE_URL}assets/extracted/wave-112-1041.bin`,
    ceiling: `${import.meta.env.BASE_URL}assets/extracted/wave-113-1041.bin`,
    death: `${import.meta.env.BASE_URL}assets/extracted/wave-114-1041.bin`,
    pause: `${import.meta.env.BASE_URL}assets/extracted/wave-115-1041.bin`
  } satisfies Record<GameEventType, string>
};

type EffectName = keyof typeof AUDIO_MANIFEST.effects;

export class GameAudio {
  private context?: AudioContext;
  private buffers = new Map<EffectName, AudioBuffer>();
  private musicTimer?: number;
  private musicGain?: GainNode;
  private midi?: Midi;
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

  playEffect(name: EffectName): void {
    const buffer = this.buffers.get(name);
    if (!this.context || !buffer || !this.soundEnabled) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = 0.5;
    source.buffer = buffer;
    source.connect(gain).connect(this.context.destination);
    source.start();
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
    this.musicGain.gain.value = 0.025;
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
    };
    play();
    this.musicTimer = window.setInterval(play, Math.max(500, this.midi.duration * 1000));
  }

  stopMusic(): void {
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    this.musicGain?.disconnect();
    this.musicGain = undefined;
  }
}
