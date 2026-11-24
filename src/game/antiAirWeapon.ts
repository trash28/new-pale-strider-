import { AntiAirSpec } from './antiAirUpgrades';
import { MissileType } from './missileTypes';

export interface AntiAirTracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  hit: boolean;
  color: string;
  caliberScale: number;
}

export interface AntiAirHitEvalParams {
  spec: AntiAirSpec;
  missileSpeed: number;
  missileType: MissileType;
  angularErrorRad: number;
  nearbyThreatsCount: number;
  subsystemHealthFactor: number; // 0..1
  distance: number;
}

/**
 * Evaluates AA interception hit probability with hard ceilings so point-defense
 * never grants 100% missile immunity at any upgrade tier.
 */
export function computeAntiAirHitChance(params: AntiAirHitEvalParams): number {
  const { spec, missileSpeed, missileType, angularErrorRad, nearbyThreatsCount, subsystemHealthFactor, distance } =
    params;

  // Fast interceptors & weaving swarms are slightly harder for CIWS to square up
  const speedPenalty = Math.max(0, (missileSpeed - 680) / 2600);
  const swarmDodgePenalty = missileType === 'swarm' ? 0.05 : missileType === 'interceptor' ? 0.04 : 0;

  // Turret angular tracking lag reduces probability
  const anglePenalty = Math.min(0.22, Math.abs(angularErrorRad) * 0.65);

  // Salvo saturation penalty (mitigated partially by aa_multitarget lowering multiTargetPenalty)
  const extraThreats = Math.max(0, nearbyThreatsCount - 1);
  const saturationPenalty = Math.min(0.26, extraThreats * spec.multiTargetPenalty * 0.35);

  // Close-range crossing shots within inner 22% of range have slightly higher angular rate
  const closeRangeRatio = Math.max(0, 1 - distance / Math.max(70, spec.range * 0.25));
  const closePenalty = closeRangeRatio * 0.06;

  // Damaged sensors/weapons reduce tracking precision
  const healthScale = 0.42 + 0.58 * Math.max(0, Math.min(1, subsystemHealthFactor));

  const raw =
    spec.baseAccuracy * healthScale -
    speedPenalty -
    swarmDodgePenalty -
    anglePenalty -
    saturationPenalty -
    closePenalty;

  return Math.max(0.15, Math.min(spec.maxHitChanceCap, raw));
}

export function computeAntiAirDamage(spec: AntiAirSpec, subsystemHealthFactor: number): number {
  const healthScale = 0.55 + 0.45 * Math.max(0, Math.min(1, subsystemHealthFactor));
  return Math.max(4, spec.damagePerHit * healthScale);
}
