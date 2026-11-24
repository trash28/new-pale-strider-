import { MechClassId } from './types';

export type BootStage = 0 | 1 | 2 | 3 | 4;

export interface HudBootSnapshot {
  active: boolean;
  stage: BootStage;
  progress: number; // 0..1
  statusLine: string;
  subLines: string[];
  screenDimAlpha: number;
  hudOpacity: number;
  topBarVisible: boolean;
  chassisVisible: boolean;
  weaponsVisible: boolean;
  radarVisible: boolean;
  flickerJitterX: number;
  scanlineAlpha: number;
  controlsUnlocked: boolean;
}

export interface BootAudioTrigger {
  stage: BootStage;
  mechClass: MechClassId;
  abbreviated: boolean;
}

const FULL_DURATION = 2.55;
const ABBREV_DURATION = 1.45;

/**
 * Controls the 4-stage Mech Boot-Up Sequence when spawning, respawning, or switching chassis:
 * Stage 1: Initial power activation (dim screen, electrical hum & reactor spin-up, irregular HUD flicker)
 * Stage 2: System initialization (staggered HUD modules, diagnostic scanlines & telemetry beeps)
 * Stage 3: System synchronization (reticle/weapons lock, radio squelch online, player controls unlock!)
 * Stage 4: Full operational status (HUD stabilizes cleanly, final confirmation tone & voice)
 */
export class MechBootSequence {
  public active = false;
  public elapsed = 0;
  public duration = FULL_DURATION;
  public abbreviated = false;
  public mechClass: MechClassId = 'standard';

  private triggeredStages = new Set<BootStage>();

  public start(mechClass: MechClassId, abbreviated = false): BootAudioTrigger {
    this.active = true;
    this.elapsed = 0;
    this.abbreviated = abbreviated;
    this.duration = abbreviated ? ABBREV_DURATION : FULL_DURATION;
    this.mechClass = mechClass;
    this.triggeredStages.clear();
    this.triggeredStages.add(1);
    return { stage: 1, mechClass, abbreviated };
  }

  public reset(): void {
    this.active = false;
    this.elapsed = 0;
    this.triggeredStages.clear();
  }

  public update(dt: number): BootAudioTrigger | null {
    if (!this.active) return null;
    this.elapsed += dt;
    const p = Math.min(1, this.elapsed / Math.max(0.1, this.duration));

    let nextTrigger: BootAudioTrigger | null = null;
    if (p >= 0.22 && !this.triggeredStages.has(2)) {
      this.triggeredStages.add(2);
      nextTrigger = { stage: 2, mechClass: this.mechClass, abbreviated: this.abbreviated };
    } else if (p >= 0.52 && !this.triggeredStages.has(3)) {
      this.triggeredStages.add(3);
      nextTrigger = { stage: 3, mechClass: this.mechClass, abbreviated: this.abbreviated };
    } else if (p >= 0.8 && !this.triggeredStages.has(4)) {
      this.triggeredStages.add(4);
      nextTrigger = { stage: 4, mechClass: this.mechClass, abbreviated: this.abbreviated };
    }

    if (this.elapsed >= this.duration) {
      this.active = false;
    }

    return nextTrigger;
  }

  public isControlsUnlocked(): boolean {
    if (!this.active) return true;
    const p = this.elapsed / Math.max(0.1, this.duration);
    // Unlock player controls at Stage 3 (~1.25s full, ~0.72s respawn) so startup never blocks gameplay
    return p >= 0.48;
  }

  public getHudSnapshot(): HudBootSnapshot {
    if (!this.active) {
      return {
        active: false,
        stage: 0,
        progress: 1,
        statusLine: 'ALL SYSTEMS OPERATIONAL',
        subLines: [],
        screenDimAlpha: 0,
        hudOpacity: 1,
        topBarVisible: true,
        chassisVisible: true,
        weaponsVisible: true,
        radarVisible: true,
        flickerJitterX: 0,
        scanlineAlpha: 0,
        controlsUnlocked: true,
      };
    }

    const p = Math.max(0, Math.min(1, this.elapsed / Math.max(0.1, this.duration)));
    const stage: BootStage = p < 0.22 ? 1 : p < 0.52 ? 2 : p < 0.8 ? 3 : 4;

    // Deterministic high-frequency boot flicker during Stages 1-2, stabilizing smoothly in Stages 3-4
    const waveA = Math.sin(this.elapsed * 58);
    const waveB = Math.sin(this.elapsed * 113 + 1.3);
    const flickerDrop = stage === 1 ? (waveA > 0.35 ? 0.55 : 0.12) : stage === 2 ? (waveB > 0.65 ? 0.55 : 0.92) : stage === 3 ? 0.95 : 1.0;

    const screenDimAlpha =
      stage === 1
        ? 0.72 * (1 - p / 0.22) + 0.28
        : stage === 2
        ? 0.28 * (1 - (p - 0.22) / 0.3)
        : 0;

    const scanlineAlpha = stage === 1 ? 0.26 : stage === 2 ? 0.18 : stage === 3 ? 0.08 : 0;
    const flickerJitterX =
      stage <= 2 && Math.abs(waveA * waveB) > 0.68 ? (waveA > 0 ? 2.5 : -2.5) : 0;

    const subLines: string[] = [];
    if (p >= 0.05) subLines.push('POWER ONLINE');
    if (p >= 0.24) subLines.push('SYSTEM CHECK');
    if (p >= 0.44) subLines.push('TARGETING ONLINE');
    if (p >= 0.58) subLines.push('WEAPONS READY');
    if (p >= 0.7) subLines.push('COMMUNICATIONS ONLINE');
    if (p >= 0.84) subLines.push('ALL SYSTEMS OPERATIONAL');

    const statusLine = subLines[subLines.length - 1] ?? 'POWER ONLINE';

    return {
      active: true,
      stage,
      progress: p,
      statusLine,
      subLines,
      screenDimAlpha,
      hudOpacity: Math.max(0.08, Math.min(1, p * 1.6 * flickerDrop)),
      topBarVisible: p >= 0.22 && (stage > 2 || waveA > -0.6),
      chassisVisible: p >= 0.14 && (stage > 1 || waveB > -0.4),
      weaponsVisible: p >= 0.46,
      radarVisible: p >= 0.34 && (stage > 2 || waveA > -0.5),
      flickerJitterX,
      scanlineAlpha,
      controlsUnlocked: this.isControlsUnlocked(),
    };
  }
}
