export type MusicState =
  | 'menu'
  | 'exploration'
  | 'suspense'
  | 'combat'
  | 'heavy_combat'
  | 'boss'
  | 'boss_siege'
  | 'boss_cataclysm'
  | 'boss_stormbringer'
  | 'boss_fortress'
  | 'boss_blackout'
  | 'revenant'
  | 'victory'
  | 'defeat';

export type MusicTrackId =
  | 'menu_dark_ambient'
  | 'exploration_suspense'
  | 'combat_tension'
  | 'heavy_combat_pulse'
  | 'boss_dread'
  | 'boss_siege'
  | 'boss_cataclysm'
  | 'boss_stormbringer'
  | 'boss_fortress'
  | 'boss_blackout'
  | 'revenant_anomaly'
  | 'victory_cinematic'
  | 'defeat_ominous';

export interface MusicTrackMeta {
  id: MusicTrackId;
  url: string;
  title: string;
  creator: string;
  sourceUrl: string;
  license: string;
  loop: boolean;
  /** Conservative per-track gain multiplier (keeps music well below weapons/radio) */
  baseGain: number;
}

export const MUSIC_TRACK_MANIFEST: Record<MusicTrackId, MusicTrackMeta> = {
  menu_dark_ambient: {
    id: 'menu_dark_ambient',
    url: '/assets/audio/music/menu_dark_ambient.mp3',
    title: 'FutureOfTheWorld Drone 1',
    creator: 'Suspicion',
    sourceUrl: 'https://archive.org/details/SUSFOTW',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.78,
  },
  exploration_suspense: {
    id: 'exploration_suspense',
    url: '/assets/audio/music/exploration_suspense.mp3',
    title: 'Urban Droning',
    creator: 'norelpref',
    sourceUrl: 'https://archive.org/details/urbandrone1',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.72,
  },
  combat_tension: {
    id: 'combat_tension',
    url: '/assets/audio/music/combat_tension.mp3',
    title: 'Bad Futurist 1',
    creator: 'Suspicion',
    sourceUrl: 'https://archive.org/details/SUSFOTW',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.76,
  },
  heavy_combat_pulse: {
    id: 'heavy_combat_pulse',
    url: '/assets/audio/music/heavy_combat_pulse.mp3',
    title: 'Bad Futurist 2',
    creator: 'Suspicion',
    sourceUrl: 'https://archive.org/details/SUSFOTW',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.8,
  },
  boss_dread: {
    id: 'boss_dread',
    url: '/assets/audio/music/boss_dread.mp3',
    title: 'Fear',
    creator: 'Mad God',
    sourceUrl: 'https://archive.org/details/gt564Senselessness-Calm',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.85,
  },
  boss_siege: {
    id: 'boss_siege',
    url: '/assets/audio/music/boss_siege.mp3',
    title: 'Damned (Thunderhead Siege Theme)',
    creator: 'Mad God',
    sourceUrl: 'https://archive.org/details/gt564Senselessness-Calm',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.84,
  },
  boss_cataclysm: {
    id: 'boss_cataclysm',
    url: '/assets/audio/music/boss_cataclysm.mp3',
    title: 'And They Will Be Cast out into Utter Darkness (Cataclysm Theme)',
    creator: 'Gnaw Their Tongues',
    sourceUrl: 'https://archive.org/details/gnaw-their-tongues-abyss-of-longing-throats',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.86,
  },
  boss_stormbringer: {
    id: 'boss_stormbringer',
    url: '/assets/audio/music/boss_stormbringer.mp3',
    title: 'Techno Is Not Dead Vol 2 (Stormbringer Theme)',
    creator: 'ROB1',
    sourceUrl: 'https://archive.org/details/Rob1-TechnoIsNotDeadVol2',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.82,
  },
  boss_fortress: {
    id: 'boss_fortress',
    url: '/assets/audio/music/boss_fortress.mp3',
    title: 'ex 6 minus 1 (Fortress Theme)',
    creator: 'nojoined',
    sourceUrl: 'https://archive.org/details/nojoined-ex6minus1',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.84,
  },
  boss_blackout: {
    id: 'boss_blackout',
    url: '/assets/audio/music/boss_blackout.mp3',
    title: 'Identity Thief (Blackout Theme)',
    creator: 'summon.exe',
    sourceUrl: 'https://archive.org/details/summon.exe-loading',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.84,
  },
  revenant_anomaly: {
    id: 'revenant_anomaly',
    url: '/assets/audio/music/revenant_anomaly.mp3',
    title: 'Dark Insomnia',
    creator: 'FFVII',
    sourceUrl: 'https://archive.org/details/gt007Ffvii-DarkInsomnia',
    license: 'CC0 1.0 Universal',
    loop: true,
    baseGain: 0.88,
  },
  victory_cinematic: {
    id: 'victory_cinematic',
    url: '/assets/audio/music/victory_cinematic.mp3',
    title: 'Star Encounter',
    creator: 'Alaeddin Hallak',
    sourceUrl: 'https://archive.org/details/CalmPills',
    license: 'CC0 1.0 Universal',
    loop: false,
    baseGain: 0.86,
  },
  defeat_ominous: {
    id: 'defeat_ominous',
    url: '/assets/audio/music/defeat_ominous.mp3',
    title: 'Damned',
    creator: 'Mad God',
    sourceUrl: 'https://archive.org/details/gt564Senselessness-Calm',
    license: 'CC0 1.0 Universal',
    loop: false,
    baseGain: 0.82,
  },
};

export const ALL_MUSIC_TRACK_IDS = Object.keys(MUSIC_TRACK_MANIFEST) as MusicTrackId[];

export function mapBossVariantToMusicState(
  variantId: 'siege' | 'cataclysm' | 'stormbringer' | 'fortress' | 'blackout'
): MusicState {
  switch (variantId) {
    case 'siege':
      return 'boss_siege';
    case 'cataclysm':
      return 'boss_cataclysm';
    case 'stormbringer':
      return 'boss_stormbringer';
    case 'fortress':
      return 'boss_fortress';
    case 'blackout':
      return 'boss_blackout';
  }
}

export function mapMusicStateToTrack(state: MusicState): MusicTrackId {
  switch (state) {
    case 'menu':
      return 'menu_dark_ambient';
    case 'exploration':
    case 'suspense':
      return 'exploration_suspense';
    case 'combat':
      return 'combat_tension';
    case 'heavy_combat':
      return 'heavy_combat_pulse';
    case 'boss':
    case 'boss_siege':
      return 'boss_siege';
    case 'boss_cataclysm':
      return 'boss_cataclysm';
    case 'boss_stormbringer':
      return 'boss_stormbringer';
    case 'boss_fortress':
      return 'boss_fortress';
    case 'boss_blackout':
      return 'boss_blackout';
    case 'revenant':
      return 'revenant_anomaly';
    case 'victory':
      return 'victory_cinematic';
    case 'defeat':
      return 'defeat_ominous';
  }
}

interface ActiveMusicVoice {
  trackId: MusicTrackId;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Dynamic, smooth-crossfading Web Audio background music manager.
 * Guarantees:
 * - Only one intended music state plays at a time (smooth crossfade out of previous track).
 * - Conservative master gain cap (<= 0.34) + bass control so music never overpowers SFX or radio.
 * - Automatic gentle ducking when high-priority radio comms or boss sirens are active.
 */
export class MusicManager {
  public currentState: MusicState = 'menu';
  public currentTrackId: MusicTrackId | null = null;
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private bassControlFilter: BiquadFilterNode | null = null;
  private buffers = new Map<MusicTrackId, AudioBuffer>();
  private loading = new Set<MusicTrackId>();
  private activeVoice: ActiveMusicVoice | null = null;
  private fadingVoices: ActiveMusicVoice[] = [];
  private volume = 0.42; // 0..1 user slider
  private muted = false;
  private duckFactor = 1.0;
  private phaseIntensity = 1.0;
  private pendingState: MusicState | null = null;

  // Hard ceiling keeping background music beneath weapons, footsteps, and radio dialogue
  private readonly MAX_MUSIC_GAIN = 0.34;

  public attachContext(ctx: AudioContext, destination: AudioNode): void {
    if (this.ctx === ctx) return;
    this.ctx = ctx;

    // Gentle high-pass & low-shelf control so sub-bass never muddies explosions or footsteps
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 52;
    hp.Q.value = 0.7;

    const bus = ctx.createGain();
    bus.gain.value = this.computeBusGain();

    bus.connect(hp);
    hp.connect(destination);

    this.musicBus = bus;
    this.bassControlFilter = hp;

    // If a state was requested before user gesture unlocked AudioContext, start it now
    if (this.pendingState) {
      const target = this.pendingState;
      this.pendingState = null;
      this.setState(target, 1.4);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyBusGain(0.18);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyBusGain(0.12);
  }

  /** Scales intensity smoothly when bosses enter critical Phases 3 or 4 */
  public setBossPhaseIntensity(phase: 1 | 2 | 3 | 4 | null): void {
    const next = phase === 4 ? 1.14 : phase === 3 ? 1.08 : 1.0;
    if (Math.abs(next - this.phaseIntensity) < 0.01) return;
    this.phaseIntensity = next;
    if (this.ctx && this.activeVoice) {
      const meta = MUSIC_TRACK_MANIFEST[this.activeVoice.trackId];
      const now = this.ctx.currentTime;
      try {
        this.activeVoice.gain.gain.cancelScheduledValues(now);
        this.activeVoice.gain.gain.setValueAtTime(this.activeVoice.gain.gain.value, now);
        this.activeVoice.gain.gain.linearRampToValueAtTime(
          Math.min(1.0, meta.baseGain * this.phaseIntensity),
          now + 0.9
        );
      } catch {
        // ignore
      }
    }
  }

  /** Temporarily ducks background music gently during radio dialogue or sirens */
  public setDucking(active: boolean): void {
    const next = active ? 0.52 : 1.0;
    if (Math.abs(next - this.duckFactor) < 0.01) return;
    this.duckFactor = next;
    this.applyBusGain(0.32);
  }

  private computeBusGain(): number {
    if (this.muted) return 0;
    return this.volume * this.MAX_MUSIC_GAIN * this.duckFactor;
  }

  private applyBusGain(rampSec: number): void {
    if (!this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    try {
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
      this.musicBus.gain.linearRampToValueAtTime(this.computeBusGain(), now + rampSec);
    } catch {
      this.musicBus.gain.value = this.computeBusGain();
    }
  }

  public setState(state: MusicState, crossfadeSec = 2.0): boolean {
    const targetTrack = mapMusicStateToTrack(state);
    this.currentState = state;

    if (!this.ctx || !this.musicBus || this.ctx.state === 'suspended') {
      this.pendingState = state;
      return false;
    }

    if (this.currentTrackId === targetTrack && this.activeVoice) {
      // Same track already playing; adjust subtle intensity gain for suspense vs exploration
      const meta = MUSIC_TRACK_MANIFEST[targetTrack];
      const stateMult = state === 'suspense' ? 1.12 : this.phaseIntensity;
      const now = this.ctx.currentTime;
      this.activeVoice.gain.gain.cancelScheduledValues(now);
      this.activeVoice.gain.gain.setValueAtTime(this.activeVoice.gain.gain.value, now);
      this.activeVoice.gain.gain.linearRampToValueAtTime(Math.min(1.0, meta.baseGain * stateMult), now + 0.8);
      return true;
    }

    this.startTrack(targetTrack, crossfadeSec);
    return true;
  }

  private startTrack(trackId: MusicTrackId, crossfadeSec: number): void {
    if (!this.ctx || !this.musicBus) return;
    const buffer = this.buffers.get(trackId);
    if (!buffer) {
      this.loadTrack(trackId, crossfadeSec);
      return;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const fade = Math.max(0.4, crossfadeSec);

    // Smoothly fade out any currently active track (prevents track stacking)
    if (this.activeVoice) {
      const prev = this.activeVoice;
      this.activeVoice = null;
      this.fadingVoices.push(prev);
      try {
        prev.gain.gain.cancelScheduledValues(now);
        prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
        prev.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
        prev.source.stop(now + fade + 0.08);
      } catch {
        // Already stopped
      }
      prev.source.onended = () => {
        try {
          prev.source.disconnect();
          prev.gain.disconnect();
        } catch {
          // ignore
        }
        const idx = this.fadingVoices.indexOf(prev);
        if (idx >= 0) this.fadingVoices.splice(idx, 1);
      };
    }

    const meta = MUSIC_TRACK_MANIFEST[trackId];
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = meta.loop;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(meta.baseGain, now + fade);

    src.connect(gain);
    gain.connect(this.musicBus);
    src.start(now);

    const voice: ActiveMusicVoice = { trackId, source: src, gain };
    this.activeVoice = voice;
    this.currentTrackId = trackId;

    src.onended = () => {
      if (this.activeVoice === voice) {
        this.activeVoice = null;
        this.currentTrackId = null;
      }
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  }

  private loadTrack(trackId: MusicTrackId, crossfadeSec: number): void {
    if (this.loading.has(trackId) || !this.ctx) return;
    this.loading.add(trackId);
    const meta = MUSIC_TRACK_MANIFEST[trackId];
    fetch(meta.url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((ab) => (ab && this.ctx ? this.ctx.decodeAudioData(ab) : null))
      .then((buf) => {
        this.loading.delete(trackId);
        if (!buf) return;
        this.buffers.set(trackId, buf);
        // Only start if this track is STILL the intended state's track
        if (mapMusicStateToTrack(this.currentState) === trackId) {
          this.startTrack(trackId, crossfadeSec);
        }
      })
      .catch(() => {
        this.loading.delete(trackId);
      });
  }

  public stopAll(fadeSec = 0.6): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const all = [...this.fadingVoices, ...(this.activeVoice ? [this.activeVoice] : [])];
    this.activeVoice = null;
    this.fadingVoices = [];
    this.currentTrackId = null;
    for (const v of all) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        v.source.stop(now + fadeSec + 0.05);
      } catch {
        // ignore
      }
    }
  }
}
