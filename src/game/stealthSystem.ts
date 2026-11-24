import type { MechActor } from './mech';
import { hasLineOfSight } from './pathfinding';
import type { Obstacle } from './types';

export interface StealthState {
  supported: boolean;
  active: boolean;
  energy: number;
  maxEnergy: number;
  drainPerSec: number;
  rechargePerSec: number;
  cooldownTimer: number;
  cooldownDuration: number;
  cloakAlpha: number; // 1.0 visible .. 0.12 cloaked
  revealedTimer: number;
  detectedByEnemy: boolean;
}

export const STEALTH_BASE_DETECT_RADIUS = 128;
export const STEALTH_SENSOR_DETECT_RADIUS = 215;
export const STEALTH_POINT_BLANK_RADIUS = 72;

export function createStealthState(supported: boolean): StealthState {
  return {
    supported,
    active: false,
    energy: 100,
    maxEnergy: 100,
    drainPerSec: 11.5,
    rechargePerSec: 17.5,
    cooldownTimer: 0,
    cooldownDuration: 1.8,
    cloakAlpha: 1.0,
    revealedTimer: 0,
    detectedByEnemy: false,
  };
}

export function toggleStealth(stealth: StealthState | undefined): 'activated' | 'deactivated' | 'unavailable' {
  if (!stealth || !stealth.supported) return 'unavailable';
  if (stealth.active) {
    stealth.active = false;
    stealth.cooldownTimer = Math.max(stealth.cooldownTimer, 0.85);
    return 'deactivated';
  }
  if (stealth.cooldownTimer > 0 || stealth.energy < 16) return 'unavailable';
  stealth.active = true;
  stealth.revealedTimer = 0;
  return 'activated';
}

export function forceActivateStealth(stealth: StealthState | undefined): boolean {
  if (!stealth || !stealth.supported || stealth.cooldownTimer > 0 || stealth.energy < 12) return false;
  stealth.active = true;
  stealth.revealedTimer = 0;
  return true;
}

export function revealStealth(stealth: StealthState | undefined, duration = 1.35, breakCloak = false): void {
  if (!stealth || !stealth.supported) return;
  stealth.revealedTimer = Math.max(stealth.revealedTimer, duration);
  if (breakCloak && stealth.active) {
    stealth.active = false;
    stealth.cooldownTimer = Math.max(stealth.cooldownTimer, stealth.cooldownDuration);
  }
}

export function stepStealthState(
  stealth: StealthState | undefined,
  dt: number,
  options?: { jammed?: boolean; inTakedown?: boolean; isEnemy?: boolean }
): { autoDeactivated: boolean } {
  if (!stealth || !stealth.supported) return { autoDeactivated: false };

  let autoDeactivated = false;
  if (stealth.cooldownTimer > 0) {
    stealth.cooldownTimer = Math.max(0, stealth.cooldownTimer - dt);
  }
  if (stealth.revealedTimer > 0) {
    stealth.revealedTimer = Math.max(0, stealth.revealedTimer - dt);
  }

  if (options?.jammed && stealth.active) {
    stealth.active = false;
    stealth.revealedTimer = Math.max(stealth.revealedTimer, 2.0);
    stealth.cooldownTimer = Math.max(stealth.cooldownTimer, stealth.cooldownDuration);
    autoDeactivated = true;
  }

  if (stealth.active) {
    // Drain slightly slower during an active cinematic takedown
    const drainScale = options?.inTakedown ? 0.35 : 1.0;
    stealth.energy = Math.max(0, stealth.energy - stealth.drainPerSec * drainScale * dt);
    if (stealth.energy <= 0.1) {
      stealth.active = false;
      stealth.cooldownTimer = stealth.cooldownDuration;
      autoDeactivated = true;
    }
  } else {
    stealth.energy = Math.min(stealth.maxEnergy, stealth.energy + stealth.rechargePerSec * dt);
  }

  const targetAlpha = !stealth.active
    ? 1.0
    : stealth.revealedTimer > 0 || stealth.detectedByEnemy
    ? 0.44
    : options?.isEnemy
    ? 0.08
    : 0.18;

  // Smooth exponential fade (never abrupt snap)
  const blend = 1 - Math.exp(-9.5 * dt);
  stealth.cloakAlpha += (targetAlpha - stealth.cloakAlpha) * blend;
  if (Math.abs(targetAlpha - stealth.cloakAlpha) < 0.004) {
    stealth.cloakAlpha = targetAlpha;
  }

  return { autoDeactivated };
}

/**
 * Returns audio/dust attenuation multiplier for footsteps & mechanical sounds.
 * Active stealth suppresses footsteps to near-silence (0.06).
 */
export function getStealthNoiseMultiplier(stealth: StealthState | undefined): number {
  if (!stealth || !stealth.supported || !stealth.active) return 1.0;
  if (stealth.revealedTimer > 0) return 0.45;
  return 0.06;
}

/**
 * True detection rule across Enemy AI, Allied AI, and HUD radar:
 * Cloaked units cannot be seen or locked onto at standard range.
 * Detection occurs ONLY when:
 *  - Unit is not stealthed, OR stealth was revealed (firing/damage/EMP)
 *  - Observer is within point-blank melee intrusion (< 72px)
 *  - Observer has line of sight within intrusion radius (128px standard, 215px for EWAR/Recon/ECM)
 */
export function canDetectUnit(
  observer: Pick<MechActor, 'phys' | 'classId' | 'stats' | 'specialActiveTimer' | 'spec'>,
  target: Pick<MechActor, 'phys' | 'stealth' | 'jammedTimer' | 'alive'>,
  obstacles: Obstacle[],
  extraSensorBoost = false
): boolean {
  if (!target.alive) return false;
  const st = target.stealth;
  if (!st || !st.supported || !st.active) return true;
  if (st.revealedTimer > 0 || target.jammedTimer > 0) return true;

  const dist = Math.hypot(target.phys.pos.x - observer.phys.pos.x, target.phys.pos.y - observer.phys.pos.y);
  if (dist <= STEALTH_POINT_BLANK_RADIUS) return true;

  const hasEnhancedOptics =
    extraSensorBoost ||
    observer.classId === 'ewar' ||
    observer.classId === 'recon' ||
    observer.stats.sensorRange >= 1100 ||
    (observer.specialActiveTimer > 0 && observer.spec.specialAbility.kind === 'ecm_pulse');

  const detectRadius = hasEnhancedOptics ? STEALTH_SENSOR_DETECT_RADIUS : STEALTH_BASE_DETECT_RADIUS;
  if (dist > detectRadius) return false;

  return hasLineOfSight(observer.phys.pos, target.phys.pos, obstacles);
}
