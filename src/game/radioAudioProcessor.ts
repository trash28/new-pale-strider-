import { AudioAssetId } from './audioAssets';
import { RadioSignalProfile } from './dialogueDatabase';

export interface RadioPlaybackCallbacks {
  onEnded?: () => void;
  sfxOverlay?: AudioAssetId;
}

/**
 * Applies realistic narrow-band military radio DSP to spoken voice recordings:
 * - Band-pass (340 Hz - 3100 Hz) + vocal presence boost (+4dB @ 1750 Hz) so words stay crystal clear
 * - Tight military dynamics compression
 * - Subtle soft-clip saturation & signal-quality variations (clean / field / degraded / distress / corrupted)
 * - Quiet layered CC0 radio static bed + optional CC0 scream/distress/horror SFX overlay + PTT/end clicks
 * - On-demand lazy voice loading with bounded LRU buffer cache so memory stays lean
 */
export class RadioAudioProcessor {
  private ctx: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private getSfxBuffer: ((id: AudioAssetId) => AudioBuffer | undefined) | null = null;

  private voiceCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();
  private readonly maxCachedVoices = 32;

  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private activeStaticSource: AudioBufferSourceNode | null = null;
  private activeOverlaySource: AudioBufferSourceNode | null = null;
  private activeGainNode: GainNode | null = null;
  private distortionCurves = new Map<RadioSignalProfile, Float32Array<ArrayBuffer>>();
  private playbackToken = 0;

  public bind(
    ctx: AudioContext,
    outputNode: GainNode,
    getSfxBuffer: (id: AudioAssetId) => AudioBuffer | undefined
  ): void {
    this.ctx = ctx;
    this.outputNode = outputNode;
    this.getSfxBuffer = getSfxBuffer;
    this.buildDistortionCurves();
  }

  private buildDistortionCurves(): void {
    if (this.distortionCurves.size > 0) return;
    const amounts: Record<RadioSignalProfile, number> = {
      clean: 3.5,
      field: 7.5,
      degraded: 14,
      distress: 22,
      corrupted: 30,
    };
    for (const [profile, k] of Object.entries(amounts) as [RadioSignalProfile, number][]) {
      const samples = 256;
      const curve = new Float32Array(new ArrayBuffer(samples * 4));
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
      }
      this.distortionCurves.set(profile, curve);
    }
  }

  public preload(urls: string[]): void {
    for (const url of urls) {
      void this.loadVoiceBuffer(url);
    }
  }

  private async loadVoiceBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const cached = this.voiceCache.get(url);
    if (cached) {
      // Touch LRU order
      this.voiceCache.delete(url);
      this.voiceCache.set(url, cached);
      return cached;
    }
    const existing = this.loadingPromises.get(url);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok || !this.ctx) return null;
        const arr = await resp.arrayBuffer();
        if (!this.ctx) return null;
        const decoded = await this.ctx.decodeAudioData(arr);
        if (this.voiceCache.size >= this.maxCachedVoices) {
          const oldestKey = this.voiceCache.keys().next().value;
          if (oldestKey) this.voiceCache.delete(oldestKey);
        }
        this.voiceCache.set(url, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(url);
      }
    })();

    this.loadingPromises.set(url, promise);
    return promise;
  }

  public stopActive(): void {
    this.playbackToken++;
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.onended = null;
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.activeVoiceSource = null;
    }
    if (this.activeStaticSource) {
      try {
        this.activeStaticSource.stop();
        this.activeStaticSource.disconnect();
      } catch {
        // Ignore
      }
      this.activeStaticSource = null;
    }
    if (this.activeOverlaySource) {
      try {
        this.activeOverlaySource.stop();
        this.activeOverlaySource.disconnect();
      } catch {
        // Ignore
      }
      this.activeOverlaySource = null;
    }
    if (this.activeGainNode) {
      try {
        this.activeGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.activeGainNode = null;
    }
  }

  public playTransmission(
    url: string,
    signalProfile: RadioSignalProfile,
    callbacks?: RadioPlaybackCallbacks
  ): void {
    if (!this.ctx || !this.outputNode) {
      callbacks?.onEnded?.();
      return;
    }

    this.stopActive();
    const token = ++this.playbackToken;

    void this.loadVoiceBuffer(url).then((voiceBuf) => {
      if (!this.ctx || !this.outputNode || token !== this.playbackToken) return;
      if (!voiceBuf) {
        callbacks?.onEnded?.();
        return;
      }

      const now = this.ctx.currentTime;
      const dest = this.outputNode;

      // 1. Opening PTT / squelch activation click
      const pttBuf = this.getSfxBuffer?.('radio_ptt_click') ?? this.getSfxBuffer?.('radio_squelch');
      if (pttBuf) {
        try {
          const ptt = this.ctx.createBufferSource();
          ptt.buffer = pttBuf;
          const pg = this.ctx.createGain();
          pg.gain.value = signalProfile === 'clean' ? 0.34 : 0.44;
          ptt.connect(pg);
          pg.connect(dest);
          ptt.start(now);
        } catch {
          // Ignore
        }
      }

      // 2. Narrow-band military radio voice processing chain (optimized for intelligibility)
      const voiceSrc = this.ctx.createBufferSource();
      voiceSrc.buffer = voiceBuf;

      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = signalProfile === 'distress' ? 420 : 340;
      hp.Q.value = 0.85;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = signalProfile === 'clean' ? 3350 : signalProfile === 'field' ? 3050 : 2750;
      lp.Q.value = 0.9;

      const presence = this.ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 1780;
      presence.Q.value = 1.2;
      presence.gain.value = 4.2;

      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.distortionCurves.get(signalProfile) ?? null;
      shaper.oversample = '2x';

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -22;
      comp.knee.value = 10;
      comp.ratio.value = 7.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.12;

      const masterVoiceGain = this.ctx.createGain();
      const baseGain = signalProfile === 'clean' ? 0.98 : signalProfile === 'field' ? 0.94 : 0.9;
      masterVoiceGain.gain.setValueAtTime(baseGain, now + 0.08);

      // Subtle authentic signal fluctuation / micro-dropout on degraded, distress, or corrupted channels (never unintelligible)
      if ((signalProfile === 'degraded' || signalProfile === 'distress' || signalProfile === 'corrupted') && voiceBuf.duration > 1.0) {
        const dipAt = now + 0.08 + voiceBuf.duration * 0.56;
        masterVoiceGain.gain.setValueAtTime(baseGain, dipAt);
        masterVoiceGain.gain.linearRampToValueAtTime(baseGain * (signalProfile === 'corrupted' ? 0.3 : 0.44), dipAt + 0.035);
        masterVoiceGain.gain.linearRampToValueAtTime(baseGain, dipAt + 0.095);
      }

      voiceSrc.connect(hp);
      hp.connect(lp);
      lp.connect(presence);
      presence.connect(shaper);
      shaper.connect(comp);
      comp.connect(masterVoiceGain);
      masterVoiceGain.connect(dest);

      // 2b. Optional CC0 screaming / pain / breathing / Revenant horror SFX overlay through radio bandpass
      if (callbacks?.sfxOverlay) {
        const ovBuf = this.getSfxBuffer?.(callbacks.sfxOverlay);
        if (ovBuf) {
          try {
            const ovSrc = this.ctx.createBufferSource();
            ovSrc.buffer = ovBuf;
            const ovBp = this.ctx.createBiquadFilter();
            ovBp.type = 'bandpass';
            ovBp.frequency.value = signalProfile === 'corrupted' ? 1450 : 1900;
            ovBp.Q.value = 1.1;
            const ovGain = this.ctx.createGain();
            const isScream = callbacks.sfxOverlay.includes('scream');
            const ovVol = isScream ? 0.34 : 0.24;
            const startDelay = isScream ? Math.max(0.12, voiceBuf.duration * 0.52) : 0.04;
            ovGain.gain.setValueAtTime(0.001, now + startDelay);
            ovGain.gain.linearRampToValueAtTime(ovVol, now + startDelay + 0.08);
            ovGain.gain.setValueAtTime(ovVol, now + startDelay + Math.min(ovBuf.duration, 1.8));
            ovGain.gain.linearRampToValueAtTime(0.001, now + startDelay + Math.min(ovBuf.duration, 2.3));
            ovSrc.connect(ovBp);
            ovBp.connect(ovGain);
            ovGain.connect(dest);
            ovSrc.start(now + startDelay);
            ovSrc.stop(now + startDelay + Math.min(ovBuf.duration, 2.4));
            this.activeOverlaySource = ovSrc;
          } catch {
            // Ignore
          }
        }
      }

      // 3. Quiet layered CC0 radio static bed underneath spoken words
      const staticBuf = this.getSfxBuffer?.('radio_static_bed');
      if (staticBuf) {
        try {
          const stSrc = this.ctx.createBufferSource();
          stSrc.buffer = staticBuf;
          stSrc.loop = true;
          const stBp = this.ctx.createBiquadFilter();
          stBp.type = 'bandpass';
          stBp.frequency.value = signalProfile === 'corrupted' ? 1650 : 2100;
          stBp.Q.value = 0.9;
          const stGain = this.ctx.createGain();
          const staticVol =
            signalProfile === 'clean'
              ? 0.035
              : signalProfile === 'field'
              ? 0.065
              : signalProfile === 'degraded'
              ? 0.095
              : signalProfile === 'distress'
              ? 0.13
              : 0.165;
          stGain.gain.setValueAtTime(0.001, now + 0.05);
          stGain.gain.linearRampToValueAtTime(staticVol, now + 0.1);
          stGain.gain.setValueAtTime(staticVol, now + 0.08 + voiceBuf.duration);
          stGain.gain.linearRampToValueAtTime(0.001, now + 0.14 + voiceBuf.duration);
          stSrc.connect(stBp);
          stBp.connect(stGain);
          stGain.connect(dest);
          stSrc.start(now + 0.05, Math.random() * Math.max(0.1, staticBuf.duration - 0.5));
          stSrc.stop(now + 0.16 + voiceBuf.duration);
          this.activeStaticSource = stSrc;
        } catch {
          // Ignore
        }
      }

      this.activeVoiceSource = voiceSrc;
      this.activeGainNode = masterVoiceGain;

      voiceSrc.onended = () => {
        if (token !== this.playbackToken) return;
        this.activeVoiceSource = null;
        this.activeStaticSource = null;
        this.activeGainNode = null;

        // 4. Closing transmission termination click
        const endBuf = this.getSfxBuffer?.('radio_end_click') ?? this.getSfxBuffer?.('radio_squelch');
        if (endBuf && this.ctx && this.outputNode) {
          try {
            const endSrc = this.ctx.createBufferSource();
            endSrc.buffer = endBuf;
            const eg = this.ctx.createGain();
            eg.gain.value = 0.36;
            endSrc.connect(eg);
            eg.connect(this.outputNode);
            endSrc.start(this.ctx.currentTime);
          } catch {
            // Ignore
          }
        }
        callbacks?.onEnded?.();
      };

      voiceSrc.start(now + 0.08);
    });
  }
}
