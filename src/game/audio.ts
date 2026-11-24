import { ALL_AUDIO_ASSET_IDS, AUDIO_ASSET_MANIFEST, AudioAssetId } from './audioAssets';
import { selectTerrainFootstepAsset, VoiceLimiter } from './audioMixer';
import { BossVariantId, BossWarheadType } from './bossTypes';
import { VoiceLineEntry } from './dialogueDatabase';
import { BootStage } from './mechBootSequence';
import { MissileType } from './missileTypes';
import { MusicManager, MusicState } from './musicManager';
import { RadioAudioProcessor } from './radioAudioProcessor';
import type { TakedownAudioCue } from './takedownVariations';
import { MechClassId, SettingsData, SpecialAbilityKind, TerrainType, WeaponKind } from './types';

export interface ContinuousAudioState {
  active: boolean;
  speedRatio: number;
  isFlying: boolean;
  airborne: boolean;
  boosting: boolean;
  flightHeat: number;
  bossProximity: number; // 0..1
  grappleAttached: boolean;
  grappleTension: number; // 0..1
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private weaponsGain: GainNode | null = null;
  private explosionsGain: GainNode | null = null;
  private mechanicalGain: GainNode | null = null;
  private enginesGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private radioGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private reverbInput: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private sampleBuffers = new Map<AudioAssetId, AudioBuffer>();
  private loadingPromise: Promise<void> | null = null;
  private voiceLimiter = new VoiceLimiter();

  // Continuous loop nodes
  private rocketLoopGain: GainNode | null = null;
  private rocketLoopFilter: BiquadFilterNode | null = null;
  private rocketLoopSource: AudioBufferSourceNode | null = null;

  private engineLoopGain: GainNode | null = null;
  private engineLoopFilter: BiquadFilterNode | null = null;
  private engineLoopSource: AudioBufferSourceNode | null = null;

  private bossLoopGain: GainNode | null = null;
  private bossLoopSource: AudioBufferSourceNode | null = null;

  private windLoopGain: GainNode | null = null;
  private windLoopSource: AudioBufferSourceNode | null = null;

  private warzoneLoopGain: GainNode | null = null;
  private warzoneLoopSource: AudioBufferSourceNode | null = null;

  private musicStarted = false;
  private musicTimer: number | null = null;
  private ambienceTimer: number | null = null;
  private duckUntilMs = 0;
  private lastGrappleCreakMs = 0;
  private muted = false;
  private bossIntensity = false;
  private settings: SettingsData | null = null;
  private radioProcessor = new RadioAudioProcessor();
  public music = new MusicManager();

  public unlock(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();

        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.weaponsGain = this.ctx.createGain();
        this.explosionsGain = this.ctx.createGain();
        this.mechanicalGain = this.ctx.createGain();
        this.enginesGain = this.ctx.createGain();
        this.ambienceGain = this.ctx.createGain();
        this.radioGain = this.ctx.createGain();
        this.uiGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();

        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -11;
        compressor.knee.value = 14;
        compressor.ratio.value = 4.2;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.16;

        // Filtered battlefield echo tail bus
        this.reverbInput = this.ctx.createGain();
        const delayA = this.ctx.createDelay(0.6);
        delayA.delayTime.value = 0.14;
        const delayB = this.ctx.createDelay(0.6);
        delayB.delayTime.value = 0.29;
        const echoFilter = this.ctx.createBiquadFilter();
        echoFilter.type = 'lowpass';
        echoFilter.frequency.value = 1050;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.3;
        const wetGain = this.ctx.createGain();
        wetGain.gain.value = 0.24;

        this.reverbInput.connect(delayA);
        delayA.connect(echoFilter);
        echoFilter.connect(delayB);
        delayB.connect(feedback);
        feedback.connect(delayA);
        echoFilter.connect(wetGain);
        wetGain.connect(this.sfxGain);

        this.weaponsGain.connect(this.sfxGain);
        this.explosionsGain.connect(this.sfxGain);
        this.mechanicalGain.connect(this.sfxGain);
        this.enginesGain.connect(this.sfxGain);
        this.sfxGain.connect(compressor);
        this.ambienceGain.connect(compressor);
        this.radioGain.connect(compressor);
        this.uiGain.connect(compressor);
        this.musicGain.connect(compressor);
        compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.radioProcessor.bind(this.ctx, this.radioGain, (id) => this.sampleBuffers.get(id));
        this.music.attachContext(this.ctx, this.musicGain);
        this.radioProcessor.preload([
          '/assets/audio/voices/boot_online_01.mp3',
          '/assets/audio/voices/cmd_deploy_01.mp3',
          '/assets/audio/voices/emg_missile_01.mp3',
          '/assets/audio/voices/emg_armor_01.mp3',
        ]);

        // Pre-generate 1.5s fallback noise buffer
        const sr = this.ctx.sampleRate;
        const len = Math.floor(sr * 1.5);
        this.noiseBuffer = this.ctx.createBuffer(1, len, sr);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        // Initialize continuous loop gain/filter nodes
        this.rocketLoopFilter = this.ctx.createBiquadFilter();
        this.rocketLoopFilter.type = 'lowpass';
        this.rocketLoopFilter.frequency.value = 1600;
        this.rocketLoopGain = this.ctx.createGain();
        this.rocketLoopGain.gain.value = 0;
        this.rocketLoopFilter.connect(this.rocketLoopGain);
        this.rocketLoopGain.connect(this.enginesGain);

        this.engineLoopFilter = this.ctx.createBiquadFilter();
        this.engineLoopFilter.type = 'lowpass';
        this.engineLoopFilter.frequency.value = 320;
        this.engineLoopGain = this.ctx.createGain();
        this.engineLoopGain.gain.value = 0;
        this.engineLoopFilter.connect(this.engineLoopGain);
        this.engineLoopGain.connect(this.enginesGain);

        this.bossLoopGain = this.ctx.createGain();
        this.bossLoopGain.gain.value = 0;
        this.bossLoopGain.connect(this.enginesGain);

        this.windLoopGain = this.ctx.createGain();
        this.windLoopGain.gain.value = 0.24;
        this.windLoopGain.connect(this.ambienceGain);

        this.warzoneLoopGain = this.ctx.createGain();
        this.warzoneLoopGain.gain.value = 0.14;
        this.warzoneLoopGain.connect(this.ambienceGain);
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.applyVolumes();
      this.preloadAssets();
      if (!this.musicStarted) {
        this.startAmbientScore();
        this.startBattlefieldAmbience();
      }
    } catch {
      // Ignore Web Audio errors in restricted/headless contexts
    }
  }

  private preloadAssets(): void {
    if (!this.ctx || this.loadingPromise) return;
    const ctx = this.ctx;
    this.loadingPromise = (async () => {
      await Promise.all(
        ALL_AUDIO_ASSET_IDS.map(async (id) => {
          try {
            const meta = AUDIO_ASSET_MANIFEST[id];
            const res = await fetch(meta.url);
            if (!res.ok) return;
            const arr = await res.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arr);
            this.sampleBuffers.set(id, decoded);
          } catch {
            // Safe fallback to layered DSP if decode fails
          }
        })
      );
      this.ensureLoopsStarted();
    })();
  }

  private ensureLoopsStarted(): void {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const startLoop = (
      id: AudioAssetId,
      dest: AudioNode | null,
      existing: AudioBufferSourceNode | null,
      rate = 1
    ): AudioBufferSourceNode | null => {
      if (existing || !dest || !this.ctx) return existing;
      const buf = this.sampleBuffers.get(id);
      if (!buf) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;
      src.connect(dest);
      src.start();
      return src;
    };

    this.rocketLoopSource = startLoop('rocket_loop', this.rocketLoopFilter, this.rocketLoopSource, 1.0);
    this.engineLoopSource = startLoop('mech_engine_hum_loop', this.engineLoopFilter, this.engineLoopSource, 0.95);
    this.bossLoopSource = startLoop('boss_engine_loop', this.bossLoopGain, this.bossLoopSource, 0.88);
    this.windLoopSource = startLoop('env_wind_loop', this.windLoopGain, this.windLoopSource, 1.0);
    this.warzoneLoopSource = startLoop('env_warzone_loop', this.warzoneLoopGain, this.warzoneLoopSource, 0.95);
  }

  public updateSettings(settings: SettingsData): void {
    this.settings = settings;
    this.applyVolumes();
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    this.music.setMuted(m);
    this.applyVolumes();
  }

  public setMusicState(state: MusicState, crossfadeSec = 2.0): void {
    this.music.setState(state, crossfadeSec);
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private applyVolumes(): void {
    if (
      !this.ctx ||
      !this.masterGain ||
      !this.sfxGain ||
      !this.weaponsGain ||
      !this.explosionsGain ||
      !this.mechanicalGain ||
      !this.enginesGain ||
      !this.ambienceGain ||
      !this.radioGain ||
      !this.uiGain ||
      !this.musicGain
    ) {
      return;
    }

    const duckActive =
      (this.settings?.dynamicAudioMix ?? true) && performance.now() < this.duckUntilMs;
    const duckScale = duckActive ? 0.58 : 1.0;

    const master = this.muted ? 0 : this.settings?.masterVolume ?? 0.72;
    const sfx = this.settings?.sfxVolume ?? 0.85;
    const music = (this.settings?.musicVolume ?? 0.36) * duckScale;
    const weapons = this.settings?.weaponsVolume ?? 0.92;
    const explosions = this.settings?.explosionsVolume ?? 0.94;
    const mechanical = this.settings?.mechanicalVolume ?? 0.84;
    const engines = this.settings?.enginesVolume ?? 0.76;
    const ambience = (this.settings?.ambienceVolume ?? 0.55) * duckScale;
    const radio = this.settings?.radioVolume ?? 0.75;
    const ui = this.settings?.uiVolume ?? 0.65;

    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(master, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(sfx, now, 0.04);
    this.weaponsGain.gain.setTargetAtTime(weapons, now, 0.04);
    this.explosionsGain.gain.setTargetAtTime(explosions, now, 0.04);
    this.mechanicalGain.gain.setTargetAtTime(mechanical, now, 0.04);
    this.enginesGain.gain.setTargetAtTime(engines, now, 0.04);
    this.ambienceGain.gain.setTargetAtTime(ambience, now, 0.08);
    this.radioGain.gain.setTargetAtTime(radio, now, 0.04);
    this.uiGain.gain.setTargetAtTime(ui, now, 0.04);
    // MusicManager already caps gain <= 0.34 and applies bass control; keep musicGain at 1.0 unity
    this.musicGain.gain.setTargetAtTime(1.0, now, 0.08);
    this.music.setVolume(this.settings?.musicVolume ?? 0.36);
    this.music.setDucking(duckActive);
  }

  private triggerDuck(durationMs = 550): void {
    if (this.settings && !this.settings.dynamicAudioMix) return;
    this.duckUntilMs = Math.max(this.duckUntilMs, performance.now() + durationMs);
    this.applyVolumes();
    window.setTimeout(() => {
      if (performance.now() >= this.duckUntilMs) {
        this.applyVolumes();
      }
    }, durationMs + 40);
  }

  private routeSpatial(
    bus: GainNode,
    distanceScale: number,
    occluded: boolean,
    pan = 0
  ): AudioNode {
    if (!this.ctx) return bus;
    const dClamped = Math.max(0.04, Math.min(1, distanceScale));
    let tail: AudioNode = bus;

    if (Math.abs(pan) > 0.05 && typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.92, Math.min(0.92, pan));
      panner.connect(tail);
      tail = panner;
    }

    if (occluded || dClamped <= 0.85) {
      const lpf = this.ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      const baseCutoff = 900 + dClamped * 5600;
      lpf.frequency.value = occluded ? Math.min(880, baseCutoff * 0.34) : baseCutoff;
      lpf.connect(tail);
      tail = lpf;
    }

    return tail;
  }

  /** Plays a decoded real-world audio sample if ready; returns true if played. */
  private playSample(
    id: AudioAssetId,
    dest: AudioNode,
    volume: number,
    playbackRate = 1.0,
    delaySeconds = 0,
    channel = 'sfx',
    minIntervalMs = 24,
    maxPolyphony = 10
  ): boolean {
    if (!this.ctx) return false;
    const buf = this.sampleBuffers.get(id);
    if (!buf) return false;
    const nowMs = performance.now();
    if (!this.voiceLimiter.canPlay(id, minIntervalMs, channel, maxPolyphony, nowMs)) {
      return true; // intentionally rate-limited so we don't stack DSP fallback either
    }
    const startAt = this.ctx.currentTime + Math.max(0, delaySeconds);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.45, Math.min(1.9, playbackRate));
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, volume), startAt);
    src.connect(gain);
    gain.connect(dest);
    src.onended = () => {
      this.voiceLimiter.release(channel);
    };
    src.start(startAt);
    return true;
  }

  public updateContinuousAudio(state: ContinuousAudioState): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (!state.active) {
      this.rocketLoopGain?.gain.setTargetAtTime(0, now, 0.08);
      this.engineLoopGain?.gain.setTargetAtTime(0, now, 0.08);
      this.bossLoopGain?.gain.setTargetAtTime(0, now, 0.12);
      return;
    }

    this.ensureLoopsStarted();

    // Player engine idle + load hum
    if (this.engineLoopGain && this.engineLoopFilter) {
      const targetEngineGain = 0.045 + state.speedRatio * 0.085;
      this.engineLoopGain.gain.setTargetAtTime(targetEngineGain, now, 0.12);
      this.engineLoopFilter.frequency.setTargetAtTime(240 + state.speedRatio * 420, now, 0.12);
    }

    // Dynamic Valkyrie continuous rocket thruster loop
    if (this.rocketLoopGain && this.rocketLoopFilter) {
      const thrustGain = state.airborne
        ? state.boosting
          ? 0.34
          : 0.21
        : state.isFlying
        ? 0.03
        : 0;
      const cutoff = state.boosting ? 4200 : state.airborne ? 2100 : 700;
      this.rocketLoopGain.gain.setTargetAtTime(thrustGain, now, 0.08);
      this.rocketLoopFilter.frequency.setTargetAtTime(cutoff, now, 0.08);
    }

    // Thunderhead boss proximity reactor rumble
    if (this.bossLoopGain) {
      const bossVol = state.bossProximity > 0.05 ? state.bossProximity * 0.24 : 0;
      this.bossLoopGain.gain.setTargetAtTime(bossVol, now, 0.16);
    }

    // Grapple cable tension creak while swinging/winching under load
    if (state.grappleAttached && state.grappleTension > 0.52) {
      const nowMs = performance.now();
      if (nowMs - this.lastGrappleCreakMs > 520) {
        this.lastGrappleCreakMs = nowMs;
        this.playGrappleTension(state.grappleTension);
      }
    }
  }

  public playFootstep(
    weight: number,
    distanceScale = 1,
    occluded = false,
    terrain: TerrainType = 'concrete',
    pan = 0
  ): void {
    if (!this.ctx || !this.mechanicalGain || !this.noiseBuffer || distanceScale <= 0.06) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this.routeSpatial(this.mechanicalGain, distanceScale, occluded, pan);
      const vol = Math.min(0.55, (0.16 + weight * 0.3) * distanceScale);
      const pitch = (1.14 - weight * 0.34) * (0.94 + Math.random() * 0.12);

      // Material-aware real-world footstep sample
      const stepAsset = selectTerrainFootstepAsset(terrain, weight);
      const playedSample = this.playSample(
        stepAsset,
        dest,
        vol * 0.9,
        pitch,
        0,
        'footstep',
        55,
        8
      );

      // Heavy hydraulic actuator layer for large/heavy mechs
      if (weight >= 0.72) {
        this.playSample('hydraulics_servo_whir', dest, vol * 0.26, 0.88, 0, 'hydraulics', 130, 4);
      }

      // Deep seismic sub-bass ground weight
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const baseFreq = 104 - weight * 56 + (Math.random() - 0.5) * 8;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(22, now + 0.11 + weight * 0.09);
      gain.gain.setValueAtTime(vol * (playedSample ? 0.55 : 0.85), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14 + weight * 0.08);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.24);

      if (!playedSample) {
        this.playNoiseBurstTo(dest, vol * 0.38, 1100 - weight * 480, 0.07);
      }
    } catch {
      // Ignore
    }
  }

  public playWeaponPrep(kind: WeaponKind, distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.08) return;
    try {
      const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
      const played = this.playSample(
        'hydraulics_piston_lock',
        dest,
        0.34 * distanceScale,
        kind === 'artillery' ? 0.82 : 1.05,
        0,
        'mechanical',
        80,
        6
      );
      if (!played) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(kind === 'artillery' ? 140 : 210, now);
        osc.frequency.linearRampToValueAtTime(kind === 'artillery' ? 88 : 130, now + 0.12);
        g.gain.setValueAtTime(0.2 * distanceScale, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.17);
      }
    } catch {
      // Ignore
    }
  }

  public playWeaponCharge(duration: number, distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.weaponsGain || distanceScale <= 0.08) return;
    try {
      const dest = this.routeSpatial(this.weaponsGain, distanceScale, false, pan);
      this.playSample('hydraulics_servo_whir', dest, 0.25 * distanceScale, 1.35, 0, 'mechanical', 160, 4);
      const now = this.ctx.currentTime;
      const d = Math.max(0.2, Math.min(1.5, duration));
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(1450, now + d);
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.15 * distanceScale, now + d * 0.85);
      g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.03);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + d + 0.04);
    } catch {
      // Ignore
    }
  }

  public playWeaponFire(
    kind: WeaponKind,
    distanceScale = 1,
    occluded = false,
    caliber = 5,
    pan = 0
  ): void {
    if (!this.ctx || !this.weaponsGain || !this.mechanicalGain || !this.noiseBuffer || distanceScale <= 0.05) {
      return;
    }
    try {
      const now = this.ctx.currentTime;
      const pitchVar = 0.94 + Math.random() * 0.12;
      const dest = this.routeSpatial(this.weaponsGain, distanceScale, occluded, pan);
      const echoDest = !occluded && this.reverbInput ? this.reverbInput : null;

      if (kind === 'artillery') {
        const isMortar = caliber >= 12;
        const asset: AudioAssetId = isMortar ? 'artillery_mortar_thump' : 'artillery_howitzer';
        this.playSample(asset, dest, 0.82 * distanceScale, pitchVar * 0.94, 0, 'weapons', 65, 8);
        this.playSample('hydraulics_piston_lock', dest, 0.34 * distanceScale, 0.84, 0.04, 'mechanical', 70, 6);
        this.triggerDuck(420);

        // Sub-bass cannon chest punch
        const sub = this.ctx.createOscillator();
        const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(92 * pitchVar, now);
        sub.frequency.exponentialRampToValueAtTime(19, now + 0.56);
        subG.gain.setValueAtTime(0.55 * distanceScale, now);
        subG.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        sub.connect(subG);
        subG.connect(dest);
        sub.start(now);
        sub.stop(now + 0.62);

        if (echoDest) this.playNoiseBurstTo(echoDest, 0.24 * distanceScale, 520, 0.26);
      } else if (kind === 'railgun') {
        this.playSample('weapon_railgun', dest, 0.7 * distanceScale, 1.05 * pitchVar, 0, 'weapons', 60, 6);
        this.playSample('explosion_blast_close', dest, 0.25 * distanceScale, 1.4, 0, 'weapons', 60, 6);
        const arc = this.ctx.createOscillator();
        const arcG = this.ctx.createGain();
        arc.type = 'sawtooth';
        arc.frequency.setValueAtTime(1600 * pitchVar, now);
        arc.frequency.exponentialRampToValueAtTime(75, now + 0.32);
        arcG.gain.setValueAtTime(0.32 * distanceScale, now);
        arcG.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
        arc.connect(arcG);
        arcG.connect(dest);
        arc.start(now);
        arc.stop(now + 0.36);
        if (echoDest) this.playNoiseBurstTo(echoDest, 0.22 * distanceScale, 900, 0.18);
      } else if (kind === 'missile') {
        this.playSample('weapon_missile_launch', dest, 0.65 * distanceScale, pitchVar, 0, 'weapons', 70, 6);
        this.playSample('hydraulics_release', dest, 0.28 * distanceScale, 1.1, 0, 'mechanical', 70, 6);
        if (echoDest) this.playNoiseBurstTo(echoDest, 0.12 * distanceScale, 700, 0.15);
      } else if (kind === 'ewar_pulse' || kind === 'repair_beam') {
        this.playSample(
          kind === 'repair_beam' ? 'hydraulics_servo_whir' : 'radio_morse',
          dest,
          0.32 * distanceScale,
          1.1,
          0,
          'weapons',
          120,
          4
        );
      } else {
        const isMg = kind === 'machinegun';
        const heavyCannon = caliber >= 6.8;
        const asset: AudioAssetId = isMg
          ? 'weapon_machinegun'
          : heavyCannon
          ? 'weapon_cannon_fire'
          : 'weapon_autocannon';
        const played = this.playSample(
          asset,
          dest,
          (isMg ? 0.38 : heavyCannon ? 0.68 : 0.56) * distanceScale,
          pitchVar * (heavyCannon ? 0.92 : 1.0),
          0,
          'weapons',
          isMg ? 32 : 45,
          12
        );

        // Low-end mechanical punch + breech/casing layer
        const heavyFactor = Math.max(0.45, Math.min(1.6, caliber / 5.5));
        const sub = this.ctx.createOscillator();
        const subG = this.ctx.createGain();
        sub.type = isMg ? 'triangle' : 'sine';
        sub.frequency.setValueAtTime((isMg ? 175 : 132 / Math.sqrt(heavyFactor)) * pitchVar, now);
        sub.frequency.exponentialRampToValueAtTime(isMg ? 46 : 26, now + (isMg ? 0.075 : 0.16 * heavyFactor));
        subG.gain.setValueAtTime((isMg ? 0.14 : 0.34 * Math.min(1.25, heavyFactor)) * distanceScale, now);
        subG.gain.exponentialRampToValueAtTime(0.001, now + (isMg ? 0.08 : 0.17 * heavyFactor));
        sub.connect(subG);
        subG.connect(dest);
        sub.start(now);
        sub.stop(now + 0.26);

        if (!played) {
          this.playNoiseBurstTo(dest, (isMg ? 0.14 : 0.3) * distanceScale, isMg ? 2100 : 1350, isMg ? 0.055 : 0.13);
        }
        if (!isMg) {
          this.playSample('mech_heavy_joint_clank', dest, 0.2 * distanceScale, 1.25, 0.04, 'mechanical', 65, 6);
          if (echoDest) this.playNoiseBurstTo(echoDest, 0.16 * distanceScale, 760, 0.16);
        }
      }
    } catch {
      // Ignore
    }
  }

  public playExplosion(
    radius: number,
    distanceScale = 1,
    occluded = false,
    pan = 0,
    delaySec = 0
  ): void {
    if (!this.ctx || !this.explosionsGain || !this.noiseBuffer || distanceScale <= 0.04) return;
    try {
      const weight = Math.max(0.65, Math.min(1.9, radius / 68));
      const dest = this.routeSpatial(this.explosionsGain, distanceScale, occluded, pan);
      const startAt = this.ctx.currentTime + Math.max(0, delaySec);

      // Multi-layered real-world explosion: crack + heavy detonation + debris + distant tail
      const primaryAsset: AudioAssetId = radius >= 78 ? 'explosion_blast_heavy' : 'explosion_blast_close';
      this.playSample(primaryAsset, dest, Math.min(0.95, 0.65 * weight) * distanceScale, 1.05 - weight * 0.08, delaySec, 'explosions', 48, 8);
      if (radius >= 55) {
        this.playSample('explosion_debris_scatter', dest, 0.42 * distanceScale, 0.95 + Math.random() * 0.15, delaySec + 0.09, 'explosions', 65, 6);
      }
      if (distanceScale < 0.72 || radius >= 90) {
        this.playSample('explosion_distant_rumble', dest, 0.45 * distanceScale, 0.92, delaySec + 0.12, 'explosions', 90, 5);
      }

      if (radius >= 85 && distanceScale > 0.45) {
        this.triggerDuck(550);
      }

      // Sub-bass shockwave pressure layer
      const sub = this.ctx.createOscillator();
      const subG = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(78 / Math.pow(weight, 0.3), startAt);
      sub.frequency.exponentialRampToValueAtTime(16, startAt + 0.55 * weight);
      subG.gain.setValueAtTime(Math.min(0.68, 0.48 * weight) * distanceScale, startAt);
      subG.gain.exponentialRampToValueAtTime(0.001, startAt + 0.58 * weight);
      sub.connect(subG);
      subG.connect(dest);
      sub.start(startAt);
      sub.stop(startAt + 0.62 * weight);

      if (!occluded && this.reverbInput) {
        this.playNoiseBurstTo(this.reverbInput, 0.25 * distanceScale, 440, 0.32 * weight);
      }
    } catch {
      // Ignore
    }
  }

  public playImpact(heavy = false, distanceScale = 1, occluded = false, pan = 0): void {
    if (!this.ctx || !this.sfxGain || distanceScale <= 0.06) return;
    const dest = this.routeSpatial(this.sfxGain, distanceScale, occluded, pan);
    this.playSample(
      heavy ? 'mech_heavy_joint_clank' : 'hydraulics_piston_lock',
      dest,
      (heavy ? 0.42 : 0.22) * distanceScale,
      heavy ? 0.88 : 1.32,
      0,
      'impact',
      45,
      8
    );
    if (heavy) {
      this.playSample('mech_chassis_creak', dest, 0.24 * distanceScale, 0.96, 0.03, 'impact', 140, 4);
    }
  }

  public playWarningAlarm(): void {
    if (!this.ctx || !this.radioGain) return;
    try {
      this.playSample('radio_morse', this.radioGain, 0.32, 1.15, 0, 'radio', 180, 4);
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.setValueAtTime(480, now + 0.09);
      g.gain.setValueAtTime(0.09, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(g);
      g.connect(this.radioGain);
      osc.start(now);
      osc.stop(now + 0.21);
    } catch {
      // Ignore
    }
  }

  public playRadioTransmission(): void {
    if (!this.ctx || !this.radioGain) return;
    this.playSample('radio_squelch', this.radioGain, 0.32, 1.0, 0, 'radio', 280, 3);
  }

  public setBossIntensity(active: boolean): void {
    this.bossIntensity = active;
  }

  public playBossFootstep(weight: number, distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || !this.noiseBuffer || distanceScale <= 0.05) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this.routeSpatial(this.mechanicalGain, Math.min(1, distanceScale * 1.18), false, pan);
      const vol = Math.min(0.68, 0.36 * weight * distanceScale);

      this.playSample('boss_stomp', dest, vol * 1.1, 0.85, 0, 'boss_step', 160, 4);
      this.playSample('mech_chassis_creak', dest, vol * 0.45, 0.72, 0.04, 'boss_step', 220, 3);

      const sub = this.ctx.createOscillator();
      const subG = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(58, now);
      sub.frequency.exponentialRampToValueAtTime(16, now + 0.3);
      subG.gain.setValueAtTime(vol * 0.85, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      sub.connect(subG);
      subG.connect(dest);
      sub.start(now);
      sub.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  public playBossLoadShell(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.06) return;
    const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    this.playSample('hydraulics_piston_lock', dest, 0.48 * distanceScale, 0.72, 0, 'mechanical', 160, 4);
    this.playSample('hydraulics_servo_whir', dest, 0.32 * distanceScale, 0.78, 0.08, 'mechanical', 160, 4);
  }

  public playBossSirenWarning(): void {
    if (!this.ctx || !this.radioGain) return;
    this.triggerDuck(650);
    this.playSample('boss_siren', this.radioGain, 0.46, 0.96, 0, 'radio', 450, 2);
  }

  public playBossArtilleryFire(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.weaponsGain || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      const scale = Math.max(0.3, distanceScale);
      const dest = this.routeSpatial(this.weaponsGain, scale, false, pan);
      this.triggerDuck(650);

      this.playSample('artillery_howitzer', dest, 0.9 * scale, 0.82, 0, 'weapons', 120, 6);
      this.playSample('artillery_shell_whistle', dest, 0.4 * scale, 0.95, 0.16, 'weapons', 160, 4);

      const sub = this.ctx.createOscillator();
      const subG = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(70, now);
      sub.frequency.exponentialRampToValueAtTime(15, now + 0.95);
      subG.gain.setValueAtTime(0.72 * scale, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.98);
      sub.connect(subG);
      subG.connect(dest);
      sub.start(now);
      sub.stop(now + 1.0);
    } catch {
      // Ignore
    }
  }

  public playBossNuclearDetonation(warhead: BossWarheadType, distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.explosionsGain || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      const scale = Math.max(0.35, distanceScale);
      const dest = this.routeSpatial(this.explosionsGain, scale, false, pan);
      this.triggerDuck(1100);

      this.playSample('explosion_blast_heavy', dest, 0.98 * scale, 0.82, 0, 'explosions', 120, 6);
      this.playSample('explosion_distant_rumble', dest, 0.72 * scale, 0.78, 0.18, 'explosions', 120, 6);
      if (warhead === 'emp') {
        this.playSample('weapon_railgun', dest, 0.65 * scale, 0.68, 0, 'explosions', 120, 6);
      }

      const sub = this.ctx.createOscillator();
      const subG = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(58, now);
      sub.frequency.exponentialRampToValueAtTime(14, now + 1.25);
      subG.gain.setValueAtTime(0.85 * scale, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      sub.connect(subG);
      subG.connect(dest);
      sub.start(now);
      sub.stop(now + 1.32);
    } catch {
      // Ignore
    }
  }

  public playBossDestruction(): void {
    this.playBossNuclearDetonation('strategic', 1.0, 0);
  }

  public playBossHatchHydraulic(): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample('hydraulics_piston_lock', this.mechanicalGain, 0.45, 0.74, 0, 'mechanical', 160, 4);
    this.playSample('hydraulics_release', this.mechanicalGain, 0.36, 0.88, 0.08, 'mechanical', 160, 4);
  }

  public playBossUltimateAlarm(variant?: BossVariantId): void {
    if (!this.ctx || !this.radioGain) return;
    this.triggerDuck(850);
    const rate = variant === 'blackout' ? 1.18 : variant === 'siege' ? 0.84 : 0.98;
    this.playSample('boss_siren', this.radioGain, 0.56, rate, 0, 'radio', 400, 2);
    this.playBossHatchHydraulic();
  }

  public playMortarAmmoSwitch(): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample('hydraulics_piston_lock', this.mechanicalGain, 0.35, 1.28, 0, 'mechanical', 60, 4);
    this.playSample('ui_click', this.uiGain ?? this.mechanicalGain, 0.38, 1.0, 0.03, 'ui', 40, 4);
  }

  public playSmokeDeploy(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.explosionsGain || !this.noiseBuffer || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.explosionsGain, distanceScale, false, pan);
    this.playSample('hydraulics_release', dest, 0.52 * distanceScale, 0.78, 0, 'explosions', 120, 4);
  }

  public playUiClick(): void {
    if (!this.ctx || !this.uiGain) return;
    const played = this.playSample('ui_click', this.uiGain, 0.42, 1.08, 0, 'ui', 30, 4);
    if (!played) {
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(720, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.035);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(g);
        g.connect(this.uiGain);
        osc.start(now);
        osc.stop(now + 0.045);
      } catch {
        // Ignore
      }
    }
  }

  public playReload(heavy = false): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample('weapon_reload_cycle', this.mechanicalGain, 0.52, heavy ? 0.82 : 1.06, 0, 'mechanical', 160, 4);
    this.playSample('hydraulics_piston_lock', this.mechanicalGain, 0.32, heavy ? 0.78 : 1.05, heavy ? 0.24 : 0.14, 'mechanical', 160, 4);
  }

  public playDashBoost(heavy = false): void {
    if (!this.ctx || !this.enginesGain || !this.noiseBuffer) return;
    this.playSample('dash_burst', this.enginesGain, heavy ? 0.62 : 0.48, heavy ? 0.84 : 1.12, 0, 'engines', 90, 4);
    this.playSample('hydraulics_release', this.mechanicalGain ?? this.enginesGain, 0.32, 0.95, 0.03, 'mechanical', 90, 4);
  }

  public playGrappleFire(): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample('grapple_fire', this.mechanicalGain, 0.52, 1.08, 0, 'mechanical', 90, 4);
  }

  public playGrappleLatch(): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample('grapple_latch', this.mechanicalGain, 0.58, 1.0, 0, 'mechanical', 80, 4);
    this.playSample('hydraulics_servo_whir', this.mechanicalGain, 0.28, 1.2, 0.04, 'mechanical', 90, 4);
  }

  public playGrappleTension(tension: number): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample(
      'grapple_tension',
      this.mechanicalGain,
      Math.min(0.45, 0.18 + tension * 0.25),
      0.92 + tension * 0.22,
      0,
      'mechanical',
      420,
      2
    );
  }

  public playGrappleDetach(): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample('grappler_hook_release', this.mechanicalGain, 0.36, 1.05, 0, 'mechanical', 80, 4);
    this.playSample('mech_heavy_joint_clank', this.mechanicalGain, 0.28, 0.96, 0.02, 'mechanical', 80, 4);
  }

  public playGrapplerHookLaunch(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    this.playSample('grappler_hook_launch', dest, 0.42 * distanceScale, 1.12, 0, 'mechanical', 90, 5);
  }

  public playGrapplerHookLatch(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    this.playSample('grappler_hook_latch', dest, 0.44 * distanceScale, 1.15, 0, 'mechanical', 90, 5);
  }

  public playGrapplerPropulsion(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.enginesGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.enginesGain, distanceScale, false, pan);
    this.playSample('grappler_swing_propulsion', dest, 0.36 * distanceScale, 1.18, 0, 'engines', 180, 4);
    this.playSample('grappler_cable_tension', dest, 0.24 * distanceScale, 1.08, 0.04, 'mechanical', 240, 4);
  }

  public playGrapplerHookRelease(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    this.playSample('grappler_hook_release', dest, 0.34 * distanceScale, 1.15, 0, 'mechanical', 120, 4);
  }

  public playGrapplerTargetClamp(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    this.playSample('grappler_target_clamp', dest, 0.56 * distanceScale, 1.04, 0, 'mechanical', 110, 4);
  }

  public playGrapplerClingStruggle(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    this.playSample('grappler_cling_struggle', dest, 0.36 * distanceScale, 1.08, 0, 'mechanical', 420, 3);
  }

  public playGrapplerBulletDeflect(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.weaponsGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.weaponsGain, distanceScale, false, pan);
    this.playSample('grappler_bullet_deflect', dest, 0.42 * distanceScale, 1.24 + Math.random() * 0.14, 0, 'weapons', 75, 5);
  }

  public playGrapplerDestroy(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.explosionsGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.explosionsGain, distanceScale, false, pan);
    this.playSample('grappler_destroy', dest, 0.52 * distanceScale, 1.06, 0, 'explosions', 80, 4);
  }

  public playGrapplerAttackScream(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.weaponsGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.weaponsGain, distanceScale, false, pan);
    const screamRate = 1.24 + Math.random() * 0.22;
    this.playSample('grappler_attack_scream', dest, 0.48 * distanceScale, screamRate, 0, 'weapons', 850, 2);
    this.playSample('grappler_approach_shriek', dest, 0.34 * distanceScale, 1.32 + Math.random() * 0.16, 0.05, 'weapons', 850, 2);
  }

  public playGrapplerFeeding(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.mechanicalGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    this.playSample('grappler_feed_eat', dest, 0.42 * distanceScale, 1.08 + Math.random() * 0.14, 0, 'mechanical', 950, 2);
    this.playSample('grappler_feed_crunch', dest, 0.30 * distanceScale, 1.02 + Math.random() * 0.16, 0.08, 'mechanical', 950, 2);
  }

  public playFlightTakeoff(): void {
    if (!this.ctx || !this.enginesGain) return;
    this.playSample('rocket_ignition', this.enginesGain, 0.58, 1.0, 0, 'engines', 200, 3);
  }

  public playFlightLanding(impactStrength = 0.7): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playFootstep(1.15 * impactStrength, 1.0, false, 'concrete', 0);
    this.playSample('hydraulics_release', this.mechanicalGain, 0.34 * impactStrength, 0.9, 0.04, 'mechanical', 120, 4);
  }

  public playRocketBoost(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.enginesGain || distanceScale <= 0.08) return;
    const dest = this.routeSpatial(this.enginesGain, distanceScale, false, pan);
    this.playSample('rocket_boost', dest, 0.38 * distanceScale, 1.04, 0, 'engines', 220, 3);
  }

  public playMissileLockBeep(): void {
    if (!this.ctx || !this.radioGain) return;
    try {
      this.playSample('radio_morse', this.radioGain, 0.24, 1.45, 0, 'radio', 180, 3);
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1180, now);
      osc.frequency.setValueAtTime(1420, now + 0.045);
      g.gain.setValueAtTime(0.06, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(g);
      g.connect(this.radioGain);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore
    }
  }

  public playAntiAirFire(distanceScale = 1, pan = 0, caliberScale = 1): void {
    if (!this.ctx || !this.weaponsGain || distanceScale <= 0.05) return;
    const now = this.ctx.currentTime;
    const dest = this.routeSpatial(this.weaponsGain, distanceScale, false, pan);
    // High-cadence rotary minigun / Phalanx CIWS BRRRT
    const rate = Math.max(1.15, Math.min(1.65, (1.46 / Math.max(0.75, caliberScale)) + (Math.random() - 0.5) * 0.1));
    const played = this.playSample(
      'weapon_machinegun',
      dest,
      0.24 * distanceScale,
      rate,
      0,
      'aa_fire',
      22,
      10
    );
    // Synthesized rotary-barrel mechanical buzz + crisp supersonic crack so 22-26 rps rips like a minigun
    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const baseHz = 118 / Math.max(0.8, caliberScale * 0.92) + (Math.random() - 0.5) * 14;
      osc.frequency.setValueAtTime(baseHz, now);
      osc.frequency.exponentialRampToValueAtTime(baseHz * 0.62, now + 0.032);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.085 * distanceScale, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.034);
      osc.connect(og);
      og.connect(dest);
      osc.start(now);
      osc.stop(now + 0.036);
    } catch {
      // Ignore oscillator scheduling edge cases
    }
    if (!played && this.noiseBuffer) {
      this.playNoiseBurstTo(dest, 0.13 * distanceScale, 2900, 0.028);
    }
  }

  public playInterceptorLaunch(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.weaponsGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.weaponsGain, distanceScale, false, pan);
    this.playSample(
      'weapon_missile_launch',
      dest,
      0.52 * distanceScale,
      1.48 + (Math.random() - 0.5) * 0.08,
      0,
      'weapons',
      45,
      8
    );
    if (this.noiseBuffer) {
      this.playNoiseBurstTo(dest, 0.18 * distanceScale, 3200, 0.09);
    }
  }

  public playMissileIntercept(distanceScale = 1, pan = 0): void {
    if (!this.ctx || !this.explosionsGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.explosionsGain, distanceScale, false, pan);
    this.playSample(
      'explosion_blast_close',
      dest,
      0.42 * distanceScale,
      1.35 + Math.random() * 0.2,
      0,
      'aa_intercept',
      55,
      6
    );
    this.playSample(
      'explosion_debris_scatter',
      dest,
      0.22 * distanceScale,
      1.25,
      0.02,
      'aa_intercept',
      70,
      4
    );
  }

  public playAntiAirOverheat(): void {
    if (!this.ctx || !this.mechanicalGain) return;
    this.playSample('hydraulics_release', this.mechanicalGain, 0.42, 1.32, 0, 'mechanical', 240, 3);
    this.playSample('radio_morse', this.radioGain ?? this.mechanicalGain, 0.2, 0.85, 0.03, 'radio', 240, 2);
  }

  public playMissileVariantLaunch(
    variant: MissileType,
    distanceScale = 1,
    occluded = false,
    pan = 0
  ): void {
    if (!this.ctx || !this.weaponsGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.weaponsGain, distanceScale, occluded, pan);
    const rate =
      variant === 'heavy'
        ? 0.76
        : variant === 'interceptor'
        ? 1.26
        : variant === 'swarm'
        ? 1.18
        : variant === 'long_range'
        ? 0.86
        : variant === 'advanced_tracking'
        ? 1.12
        : 1.0;
    const vol = (variant === 'heavy' ? 0.78 : variant === 'swarm' ? 0.52 : 0.65) * distanceScale;
    this.playSample('weapon_missile_launch', dest, vol, rate + (Math.random() - 0.5) * 0.06, 0, 'weapons', 55, 8);
    if (variant === 'heavy') {
      this.playSample('hydraulics_release', dest, 0.36 * distanceScale, 0.82, 0.02, 'mechanical', 80, 4);
    }
  }

  public playMissilePassBy(distanceScale = 0.7, pan = 0): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || distanceScale <= 0.08) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this.routeSpatial(this.sfxGain, distanceScale, false, pan);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3.2;
      bp.frequency.setValueAtTime(1650, now);
      bp.frequency.exponentialRampToValueAtTime(320, now + 0.22);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.26 * distanceScale, now + 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + 0.26);
    } catch {
      // Ignore
    }
  }

  public playVoiceTransmission(line: VoiceLineEntry, onEnded?: () => void): void {
    if (!this.ctx || !this.radioGain) {
      onEnded?.();
      return;
    }
    this.radioProcessor.playTransmission(line.url, line.signalProfile, {
      onEnded,
      sfxOverlay: line.sfxOverlay,
    });
  }

  public stopVoiceTransmission(): void {
    this.radioProcessor.stopActive();
  }

  public playVictoryCinematicSound(phase: 'start' | 'awards'): void {
    if (!this.ctx || !this.uiGain) return;
    if (phase === 'start') {
      this.playSample('cinematic_victory_drumroll', this.uiGain, 0.58, 1.0, 0, 'ui', 200, 4);
      this.playSample('cinematic_victory_gong', this.uiGain, 0.48, 0.96, 0.45, 'ui', 200, 4);
    } else {
      this.playSample('cinematic_award_sting', this.uiGain, 0.52, 1.05, 0, 'ui', 200, 4);
    }
  }

  public playRevenantSound(kind: 'interference' | 'startup' | 'surge'): void {
    if (!this.ctx || !this.radioGain || !this.mechanicalGain) return;
    if (kind === 'interference') {
      this.playSample('radio_revenant_drone', this.radioGain, 0.52, 0.94, 0, 'radio', 150, 4);
      this.playSample('radio_squelch', this.radioGain, 0.42, 0.78, 0.12, 'radio', 150, 4);
    } else if (kind === 'startup') {
      this.playSample('boot_reactor_startup', this.mechanicalGain, 0.62, 0.72, 0, 'mech', 150, 4);
      this.playSample('radio_revenant_scream', this.radioGain, 0.46, 0.88, 0.18, 'radio', 150, 4);
    } else {
      this.playSample('radio_revenant_drone', this.radioGain, 0.36, 1.18, 0, 'radio', 150, 4);
    }
  }

  /**
   * Plays class-weighted, internet-sourced CC0 mechanical, electrical, and diagnostic sounds
   * synchronized with each stage of MechBootSequence.
   */
  public playBootStageSound(stage: BootStage, mechClass: MechClassId, abbreviated = false): void {
    if (!this.ctx || !this.mechanicalGain || !this.uiGain || !this.enginesGain || !this.radioGain) return;
    const isHeavy = mechClass === 'heavy' || mechClass === 'artillery' || mechClass === 'colossus';
    const isLight = mechClass === 'recon' || mechClass === 'valkyrie';
    const pitchScale = isHeavy ? 0.78 : isLight ? 1.18 : 1.0;

    if (stage === 1) {
      this.playSample('boot_power_activation', this.enginesGain, 0.52, pitchScale, 0, 'boot', 50, 4);
      this.playSample(
        'boot_reactor_startup',
        this.enginesGain,
        isHeavy ? 0.62 : 0.48,
        pitchScale * 0.94,
        0.08,
        'boot',
        50,
        4
      );
      if (mechClass === 'valkyrie') {
        this.playSample('rocket_ignition', this.enginesGain, 0.34, 1.18, 0.14, 'boot', 50, 4);
      }
    } else if (stage === 2) {
      this.playSample('boot_telemetry_beeps', this.uiGain, 0.46, isLight ? 1.12 : 0.98, 0, 'boot', 50, 4);
      this.playSample('boot_diagnostic_scan', this.uiGain, 0.44, pitchScale, 0.12, 'boot', 50, 4);
      this.playSample('hydraulics_servo_whir', this.mechanicalGain, 0.38, pitchScale, 0.18, 'boot', 50, 4);
    } else if (stage === 3) {
      this.playSample(
        'hydraulics_piston_lock',
        this.mechanicalGain,
        isHeavy ? 0.56 : 0.4,
        pitchScale,
        0,
        'boot',
        50,
        4
      );
      this.playSample('hydraulics_release', this.mechanicalGain, 0.32, pitchScale * 1.05, 0.1, 'boot', 50, 4);
      this.playSample('radio_squelch', this.radioGain, 0.38, 1.02, 0.16, 'boot', 50, 4);
    } else if (stage === 4) {
      this.playSample('boot_system_confirm', this.uiGain, 0.5, isHeavy ? 0.9 : 1.06, 0, 'boot', 50, 4);
      if (!abbreviated) {
        this.playSample('ui_click', this.uiGain, 0.34, 1.08, 0.08, 'boot', 50, 4);
      }
    }
  }

  public playStealthToggle(active: boolean): void {
    if (!this.ctx || !this.mechanicalGain || !this.uiGain) return;
    try {
      const now = this.ctx.currentTime;
      this.playSample('hydraulics_release', this.mechanicalGain, 0.32, active ? 1.45 : 0.85, 0, 'stealth', 80, 3);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(active ? 260 : 780, now);
      osc.frequency.exponentialRampToValueAtTime(active ? 840 : 180, now + 0.24);
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.connect(g);
      g.connect(this.uiGain);
      osc.start(now);
      osc.stop(now + 0.27);
    } catch {
      // Ignore
    }
  }

  public playTeleportPhantom(phase: 'vanish' | 'appear', distanceScale = 1.0, pan = 0): void {
    if (!this.ctx || !this.sfxGain || distanceScale <= 0.05) return;
    const dest = this.routeSpatial(this.sfxGain, distanceScale, false, pan);
    try {
      const now = this.ctx.currentTime;
      this.playSample(
        phase === 'vanish' ? 'dash_burst' : 'hydraulics_piston_lock',
        dest,
        0.5 * distanceScale,
        phase === 'vanish' ? 1.38 : 0.92,
        0,
        'teleport',
        45,
        6
      );
      if (this.noiseBuffer) {
        this.playNoiseBurstTo(dest, 0.22 * distanceScale, phase === 'vanish' ? 2400 : 1100, 0.14);
      }
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(phase === 'vanish' ? 540 : 190, now);
      osc.frequency.exponentialRampToValueAtTime(phase === 'vanish' ? 130 : 480, now + 0.16);
      g.gain.setValueAtTime(0.14 * distanceScale, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Ignore
    }
  }

  public playTakedownCue(cue: TakedownAudioCue, distanceScale = 1.0, pan = 0): void {
    if (!this.ctx || !this.sfxGain || !this.mechanicalGain || distanceScale <= 0.05) return;
    const sfxDest = this.routeSpatial(this.sfxGain, distanceScale, false, pan);
    const mechDest = this.routeSpatial(this.mechanicalGain, distanceScale, false, pan);
    try {
      const now = this.ctx.currentTime;
      if (cue === 'grab') {
        this.playSample('hydraulics_piston_lock', mechDest, 0.56 * distanceScale, 0.95, 0, 'td_cue', 40, 8);
        this.playSample('mech_heavy_joint_clank', mechDest, 0.36 * distanceScale, 1.15, 0.02, 'td_cue', 40, 6);
      } else if (cue === 'blade_slash') {
        this.playSample('hydraulics_release', sfxDest, 0.42 * distanceScale, 1.65, 0, 'td_cue', 35, 8);
        if (this.noiseBuffer) {
          this.playNoiseBurstTo(sfxDest, 0.24 * distanceScale, 4200, 0.09);
        }
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1450, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
        g.gain.setValueAtTime(0.08 * distanceScale, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(g);
        g.connect(sfxDest);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (cue === 'joint_snap') {
        this.playSample('mech_heavy_joint_clank', mechDest, 0.62 * distanceScale, 0.78, 0, 'td_cue', 40, 8);
        this.playSample('mech_chassis_creak', mechDest, 0.42 * distanceScale, 1.25, 0.03, 'td_cue', 40, 6);
      } else if (cue === 'heavy_impact') {
        this.playSample('explosion_blast_close', sfxDest, 0.55 * distanceScale, 1.12, 0, 'td_cue', 45, 6);
        this.playSample('boss_stomp', mechDest, 0.45 * distanceScale, 1.15, 0, 'td_cue', 45, 6);
      } else if (cue === 'throw_whoosh') {
        this.playSample('dash_burst', mechDest, 0.46 * distanceScale, 1.25, 0, 'td_cue', 45, 6);
        if (this.noiseBuffer) {
          this.playNoiseBurstTo(sfxDest, 0.22 * distanceScale, 1400, 0.18);
        }
      } else if (cue === 'core_pierce') {
        this.playSample('weapon_railgun', sfxDest, 0.65 * distanceScale, 1.18, 0, 'td_cue', 45, 6);
        this.playSample('explosion_debris_scatter', sfxDest, 0.35 * distanceScale, 1.22, 0.04, 'td_cue', 45, 6);
      } else if (cue === 'emp_arc') {
        this.playSample('weapon_railgun', sfxDest, 0.48 * distanceScale, 1.45, 0, 'td_cue', 45, 6);
        this.playSample('radio_squelch', this.radioGain ?? sfxDest, 0.28 * distanceScale, 1.32, 0, 'td_cue', 45, 6);
      }
    } catch {
      // Ignore
    }
  }

  public playMinigameCue(kind: 'prompt' | 'perfect' | 'good' | 'miss' | 'escape' | 'execute'): void {
    if (!this.ctx || !this.uiGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      if (kind === 'prompt') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(990, now + 0.055);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      } else if (kind === 'perfect' || kind === 'execute') {
        this.playSample('boot_system_confirm', this.uiGain, 0.38, kind === 'perfect' ? 1.25 : 1.0, 0, 'mg_cue', 40, 4);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1320, now + 0.06);
        g.gain.setValueAtTime(0.11, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      } else if (kind === 'good' || kind === 'escape') {
        this.playSample('ui_click', this.uiGain, 0.42, 1.12, 0, 'mg_cue', 40, 4);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.setValueAtTime(830, now + 0.05);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      } else {
        this.playSample('mech_heavy_joint_clank', this.mechanicalGain ?? this.uiGain, 0.44, 0.88, 0, 'mg_cue', 40, 4);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(115, now + 0.18);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      }
      osc.connect(g);
      g.connect(this.uiGain);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      // Ignore
    }
  }

  /**
   * Synchronized piercing blade slash, charge-draw telegraph, and evasive dodge sounds.
   */
  public playPiercingSlash(
    kind: 'telegraph' | 'slash' | 'dodge' | 'hit',
    intensity = 1.0,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const dest = this.routeSpatial(this.sfxGain, intensity, false, pan);
    try {
      const now = this.ctx.currentTime;
      if (kind === 'telegraph') {
        // High-tension HF blade unsheathe & frequency whine before slash
        this.playSample('hydraulics_piston_lock', this.mechanicalGain ?? dest, 0.34 * intensity, 1.35, 0, 'slash_tel', 35, 6);
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1150, now);
        osc.frequency.exponentialRampToValueAtTime(2850, now + 0.28);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.055 * intensity, now + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.31);
      } else if (kind === 'slash') {
        // Multi-layered supersonic piercing blade slice + metallic ring + kinetic whoosh
        this.playSample('hydraulics_release', dest, 0.48 * intensity, 1.85, 0, 'slash_sfx', 25, 8);
        this.playSample('dash_burst', this.mechanicalGain ?? dest, 0.38 * intensity, 1.48, 0, 'slash_sfx', 25, 6);

        if (this.noiseBuffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const bp = this.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 2.4;
          bp.frequency.setValueAtTime(5200, now);
          bp.frequency.exponentialRampToValueAtTime(880, now + 0.19);
          const ng = this.ctx.createGain();
          ng.gain.setValueAtTime(0.32 * intensity, now);
          ng.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
          src.connect(bp);
          bp.connect(ng);
          ng.connect(dest);
          src.start(now);
          src.stop(now + 0.22);
        }

        // Sharp piercing steel harmonics
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const sg = this.ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(2150, now);
        osc1.frequency.exponentialRampToValueAtTime(520, now + 0.16);
        osc2.frequency.setValueAtTime(3280, now);
        osc2.frequency.exponentialRampToValueAtTime(980, now + 0.14);
        sg.gain.setValueAtTime(0.11 * intensity, now);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc1.connect(sg);
        osc2.connect(sg);
        sg.connect(dest);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.19);
        osc2.stop(now + 0.19);

        // Low-end kinetic cleave thump
        const sub = this.ctx.createOscillator();
        const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(165, now);
        sub.frequency.exponentialRampToValueAtTime(48, now + 0.12);
        subG.gain.setValueAtTime(0.18 * intensity, now);
        subG.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        sub.connect(subG);
        subG.connect(dest);
        sub.start(now);
        sub.stop(now + 0.14);
      } else if (kind === 'dodge') {
        this.playSample('dash_burst', this.uiGain ?? dest, 0.28 * intensity, 1.65, 0, 'slash_dodge', 20, 6);
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(760, now);
        osc.frequency.exponentialRampToValueAtTime(1260, now + 0.11);
        g.gain.setValueAtTime(0.08 * intensity, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(g);
        g.connect(this.uiGain ?? dest);
        osc.start(now);
        osc.stop(now + 0.14);
      } else {
        this.playSample('mech_heavy_joint_clank', this.mechanicalGain ?? dest, 0.56 * intensity, 0.85, 0, 'slash_hit', 20, 6);
        this.playSample('explosion_debris_scatter', dest, 0.34 * intensity, 1.25, 0, 'slash_hit', 20, 6);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Synchronized multi-stage Transformers-grade mechanical audio choreography.
   * Combines real CC0 archive recordings (servo whine, gear ratchets, hydraulic vents,
   * structural clamps) scaled by target chassis mass class & spatial distance.
   */
  public playTransformStageCue(
    cue:
      | 'unlock'
      | 'retract_armor'
      | 'core_rotation'
      | 'limb_reposition'
      | 'structural_reform'
      | 'weapon_deploy'
      | 'clamp_lock_a'
      | 'clamp_lock_b'
      | 'stabilize',
    massClass: 'light' | 'standard' | 'heavy' | 'artillery' | 'ewar' | 'aerial',
    distanceScale = 1.0,
    occluded = false,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const mechBus = this.mechanicalGain ?? this.sfxGain;
    const destMech = this.routeSpatial(mechBus, distanceScale, occluded, pan);
    const destSfx = this.routeSpatial(this.sfxGain, distanceScale, occluded, pan);

    const massPitch =
      massClass === 'artillery'
        ? 0.80
        : massClass === 'heavy'
        ? 0.86
        : massClass === 'ewar'
        ? 1.04
        : massClass === 'aerial'
        ? 1.14
        : massClass === 'light'
        ? 1.18
        : 0.98;
    const isHeavy = massClass === 'heavy' || massClass === 'artillery';

    try {
      const now = this.ctx.currentTime;
      if (cue === 'unlock') {
        this.playSample('transform_activate', destMech, 0.72 * distanceScale, massPitch, 0, 'tf_unlock', 60, 8);
        this.playSample('transform_piston_slide', destMech, 0.52 * distanceScale, 1.08 * massPitch, 0.05, 'tf_vent', 60, 8);
        this.playSample('transform_lock_crisp', destMech, 0.48 * distanceScale, 1.12, 0.08, 'tf_latch', 60, 8);
      } else if (cue === 'retract_armor') {
        this.playSample('transform_armor_unlock', destMech, 0.74 * distanceScale, massPitch * 0.96, 0, 'tf_armor', 60, 8);
        this.playSample('transform_servo_light', destMech, 0.54 * distanceScale, 1.06 * massPitch, 0.06, 'tf_servo', 60, 8);
        this.playSample('transform_ratchet_gear', destMech, 0.45 * distanceScale, 1.08, 0.14, 'tf_gear', 60, 8);
      } else if (cue === 'core_rotation') {
        this.playSample(
          isHeavy ? 'transform_servo_heavy' : 'transform_servo_light',
          destMech,
          0.76 * distanceScale,
          massPitch * 0.94,
          0,
          'tf_core',
          60,
          8
        );
        this.playSample('transform_ratchet_gear', destMech, 0.62 * distanceScale, 0.95 * massPitch, 0.04, 'tf_gear', 60, 8);
        this.playSample('hydraulics_piston_lock', destMech, 0.42 * distanceScale, massPitch, 0.24, 'tf_pin', 60, 8);
      } else if (cue === 'limb_reposition') {
        this.playSample('transform_piston_slide', destMech, 0.65 * distanceScale, 0.95 * massPitch, 0, 'tf_vent', 60, 8);
        this.playSample('transform_ratchet_gear', destMech, 0.58 * distanceScale, 1.18 * massPitch, 0.07, 'tf_gear', 60, 8);
        this.playSample('transform_lock_crisp', destMech, 0.54 * distanceScale, 1.05 * massPitch, 0.22, 'tf_latch', 60, 8);
      } else if (cue === 'structural_reform') {
        this.playSample(
          isHeavy ? 'transform_servo_heavy' : 'transform_armor_unlock',
          destMech,
          0.74 * distanceScale,
          massPitch,
          0,
          'tf_reform',
          60,
          8
        );
        this.playSample('transform_armor_unlock', destMech, 0.58 * distanceScale, 1.08 * massPitch, 0.12, 'tf_panel', 60, 8);
      } else if (cue === 'weapon_deploy') {
        this.playSample('transform_weapon_unfold', destMech, 0.72 * distanceScale, massPitch * 1.02, 0, 'tf_weapon', 60, 8);
        this.playSample('transform_lock_crisp', destMech, 0.56 * distanceScale, 1.15 * massPitch, 0.14, 'tf_latch', 60, 8);
        this.playSample('transform_ratchet_gear', destMech, 0.44 * distanceScale, 1.24, 0.04, 'tf_gear', 60, 8);
      } else if (cue === 'clamp_lock_a') {
        this.playSample(
          isHeavy ? 'transform_lock_heavy' : 'transform_lock_crisp',
          destMech,
          0.78 * distanceScale,
          massPitch * 0.98,
          0,
          'tf_clamp_a',
          40,
          8
        );
        this.playSample('transform_piston_slide', destMech, 0.42 * distanceScale, 1.28, 0.03, 'tf_vent', 60, 8);
      } else if (cue === 'clamp_lock_b') {
        this.playSample('transform_lock_heavy', destMech, 0.84 * distanceScale, massPitch * 0.92, 0, 'tf_clamp_b', 40, 8);
        this.playSample('transform_lock_crisp', destMech, 0.62 * distanceScale, 0.96 * massPitch, 0.09, 'tf_latch', 40, 8);
        // Subtle sub-harmonic structural slam confirmation underneath heavy metal lock
        const sub = this.ctx.createOscillator();
        const subG = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(isHeavy ? 88 : 112, now);
        sub.frequency.exponentialRampToValueAtTime(34, now + 0.22);
        subG.gain.setValueAtTime((isHeavy ? 0.28 : 0.18) * distanceScale, now);
        subG.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        sub.connect(subG);
        subG.connect(destSfx);
        sub.start(now);
        sub.stop(now + 0.25);
      } else if (cue === 'stabilize') {
        this.playSample('transform_stabilize_hum', destSfx, 0.54 * distanceScale, massPitch * 1.04, 0, 'tf_stab', 80, 8);
        this.playSample('boot_system_confirm', this.uiGain ?? destSfx, 0.42 * distanceScale, 1.02, 0.1, 'tf_confirm', 80, 6);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Plays unique CC0 mechanical + combat audio synchronized with Proteus TX-series
   * morph special abilities (deploy, impact, or retract stages).
   */
  public playMorphAbilityCue(
    kind: SpecialAbilityKind,
    stage: 'deploy' | 'impact' | 'retract' = 'deploy',
    distanceScale = 1.0,
    occluded = false,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain || distanceScale <= 0.04) return;
    const mechBus = this.mechanicalGain ?? this.sfxGain;
    const destMech = this.routeSpatial(mechBus, distanceScale, occluded, pan);
    const destSfx = this.routeSpatial(this.sfxGain, distanceScale, occluded, pan);

    try {
      const now = this.ctx.currentTime;
      if (stage === 'retract') {
        this.playSample('transform_lock_crisp', destMech, 0.45 * distanceScale, 1.08, 0, 'morph_ret', 70, 6);
        this.playSample('hydraulics_release', destMech, 0.34 * distanceScale, 1.15, 0.04, 'morph_ret_v', 70, 6);
        return;
      }

      switch (kind) {
        case 'recon_apex_scan': {
          this.playSample('morph_recon_radar', destSfx, 0.78 * distanceScale, 1.05, 0, 'morph_recon', 90, 6);
          this.playSample('transform_servo_light', destMech, 0.46 * distanceScale, 1.18, 0.03, 'morph_recon_s', 90, 6);
          break;
        }
        case 'standard_bulwark_salvo': {
          // Boost morph_shield_fold (~1.35x relative gain) and layer crisp pneumatic lock + missile rack pop
          this.playSample('morph_shield_fold', destMech, 1.0 * distanceScale, 0.98, 0, 'morph_shld', 80, 6);
          this.playSample('transform_lock_crisp', destMech, 0.62 * distanceScale, 0.94, 0.05, 'morph_shld_p', 80, 6);
          this.playSample('weapon_missile_launch', destSfx, 0.48 * distanceScale, 1.16, 0.14, 'morph_shld_m', 60, 6);
          break;
        }
        case 'sniper_hyper_lockdown': {
          this.playSample('morph_sniper_lock', destMech, 0.78 * distanceScale, 1.02, 0, 'morph_snp', 80, 6);
          this.playSample('weapon_railgun', destSfx, 0.72 * distanceScale, 0.96, 0.08, 'morph_snp_r', 80, 6);
          break;
        }
        case 'heavy_siege_ram': {
          this.playSample('morph_heavy_slam', destSfx, 0.86 * distanceScale, 0.92, 0, 'morph_hvy', 60, 6);
          this.playSample('explosion_blast_close', destSfx, 0.56 * distanceScale, 0.88, 0.02, 'morph_hvy_b', 60, 6);
          this.playSample('transform_lock_heavy', destMech, 0.58 * distanceScale, 0.85, 0.06, 'morph_hvy_l', 60, 6);
          break;
        }
        case 'artillery_earthshaker': {
          this.playSample('morph_artillery_anchor', destMech, 0.82 * distanceScale, 0.9, 0, 'morph_art', 70, 6);
          this.playSample('artillery_howitzer', destSfx, 0.74 * distanceScale, 0.86, 0.12, 'morph_art_h', 60, 6);
          break;
        }
        case 'colossus_apocalypse_salvo': {
          this.playSample('morph_artillery_anchor', destMech, 0.84 * distanceScale, 0.82, 0, 'morph_col', 70, 6);
          this.playSample('artillery_mortar_thump', destSfx, 0.78 * distanceScale, 0.84, 0.08, 'morph_col_m', 50, 8);
          this.playSample('transform_lock_heavy', destMech, 0.62 * distanceScale, 0.8, 0.02, 'morph_col_l', 70, 6);
          break;
        }
        case 'ewar_tempest_storm': {
          this.playSample('morph_ewar_emp', destSfx, 0.82 * distanceScale, 1.0, 0, 'morph_ewar', 80, 6);
          this.playSample('radio_squelch', this.radioGain ?? destSfx, 0.36 * distanceScale, 1.25, 0.04, 'morph_ewar_r', 80, 6);
          break;
        }
        case 'engineer_fabricator_rig': {
          this.playSample('morph_engineer_fab', destMech, 0.78 * distanceScale, 1.04, 0, 'morph_eng', 80, 6);
          this.playSample('transform_piston_slide', destMech, 0.5 * distanceScale, 1.12, 0.06, 'morph_eng_v', 80, 6);
          break;
        }
        case 'valkyrie_seraphim_strike': {
          this.playSample('morph_aerial_wings', destSfx, 0.8 * distanceScale, 1.08, 0, 'morph_valk', 80, 6);
          this.playSample('rocket_boost', destSfx, 0.58 * distanceScale, 1.12, 0.05, 'morph_valk_r', 80, 6);
          break;
        }
        case 'phantom_overclock_aegis': {
          this.playSample('morph_ewar_emp', destSfx, 0.66 * distanceScale, 1.22, 0, 'morph_phm', 80, 6);
          this.playSample('dash_burst', destSfx, 0.68 * distanceScale, 1.32, 0.03, 'morph_phm_d', 80, 6);
          break;
        }
        case 'assassin_crimson_tempest': {
          this.playSample('morph_blade_scythe', destSfx, 0.82 * distanceScale, 1.12, 0, 'morph_asn', 60, 6);
          this.playSample('hydraulics_release', destMech, 0.44 * distanceScale, 1.45, 0.04, 'morph_asn_v', 60, 6);
          break;
        }
        default: {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(760, now + 0.14);
          g.gain.setValueAtTime(0.08 * distanceScale, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.connect(g);
          g.connect(destSfx);
          osc.start(now);
          osc.stop(now + 0.17);
        }
      }
    } catch {
      // Ignore
    }
  }

  private playNoiseBurstTo(dest: AudioNode, volume: number, filterFreq: number, duration: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  private startBattlefieldAmbience(): void {
    if (!this.ctx || !this.ambienceGain) return;
    const triggerDistantBattle = () => {
      if (!this.ctx || !this.ambienceGain || this.ctx.state !== 'running') return;
      try {
        const pan = (Math.random() - 0.5) * 1.5;
        const dest = this.routeSpatial(this.ambienceGain, 0.45, true, pan);
        if (Math.random() < 0.7) {
          this.playSample('explosion_distant_rumble', dest, 0.14 + Math.random() * 0.08, 0.88 + Math.random() * 0.2, 0, 'env', 1000, 3);
        } else {
          this.playSample('env_metal_creak', dest, 0.08, 0.9, 0, 'env', 1000, 3);
        }
      } catch {
        // Ignore
      }
    };
    this.ambienceTimer = window.setInterval(triggerDistantBattle, 4600);
  }

  private startAmbientScore(): void {
    if (!this.ctx || !this.musicGain || this.musicStarted) return;
    this.musicStarted = true;
    this.music.setState(this.music.currentState, 1.8);
  }

  public dispose(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.music.stopAll(0.2);
    if (this.ambienceTimer !== null) {
      clearInterval(this.ambienceTimer);
      this.ambienceTimer = null;
    }
    this.voiceLimiter.reset();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
