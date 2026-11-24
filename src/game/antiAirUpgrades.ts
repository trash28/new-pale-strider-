import { MechClassId, MechLoadoutCustomization, UpgradeId, UpgradeSpec } from './types';

export type AntiAirClassKey =
  | 'lightweight'
  | 'standard'
  | 'sniper'
  | 'heavy'
  | 'artillery'
  | 'support'
  | 'flying'
  | 'boss';

export type AntiAirMountStyle =
  | 'rotary_pod'
  | 'shoulder_ciws'
  | 'dorsal_popup'
  | 'twin_flak'
  | 'sensor_linked'
  | 'vector_360'
  | 'boss_ciws';

export interface AntiAirSpec {
  classKey: AntiAirClassKey;
  mountStyle: AntiAirMountStyle;
  range: number;
  minEngageDist: number;
  slewRateRad: number; // rad/s turret rotation limit
  arcHalfRad: number; // Math.PI = full 360 coverage
  reactionDelay: number; // minimum acquisition lock time before firing
  fireRate: number; // rounds per second
  damagePerHit: number;
  baseAccuracy: number; // 0..0.86 max cap
  heatPerShot: number;
  coolRate: number; // heat dissipated per second
  overheatLockoutHeat: number; // heat threshold to exit overheat state
  aimToleranceRad: number;
  sensorResilience: number; // 0..1 mitigation against sensor/weapon damage
  multiTargetPenalty: number; // reaction delay penalty when multiple threats saturate
  maxHitChanceCap: number; // strict upper bound (< 1.0, never guarantees immunity)
  caliberScale: number;
  // Long-range counter-missile interceptor battery
  interceptorRange: number;
  interceptorMinRange: number;
  interceptorCooldown: number;
  interceptorInterceptChance: number;
}

export const ANTI_AIR_UPGRADES: UpgradeSpec[] = [
  {
    id: 'aa_targeting',
    name: 'AA Targeting Computer',
    description: '+12% anti-missile hit precision & lead calculation per level.',
    tradeOff: '+3% chassis weight on fire-control rack.',
    maxLevel: 3,
    costPerLevel: 115,
    category: 'anti_air',
  },
  {
    id: 'aa_servos',
    name: 'AA High-Torque Servos',
    description: '+18% point-defense turret slew speed per level.',
    tradeOff: '+2% frame mass.',
    maxLevel: 3,
    costPerLevel: 105,
    category: 'anti_air',
  },
  {
    id: 'aa_rapid_fire',
    name: 'AA Rapid-Fire Feeder',
    description: '+15% burst fire cadence against incoming salvos.',
    tradeOff: '+14% barrel heat buildup per shot.',
    maxLevel: 3,
    costPerLevel: 120,
    category: 'anti_air',
  },
  {
    id: 'aa_ammo',
    name: 'AA Proximity Flak Rounds',
    description: '+22% missile interception damage per burst.',
    tradeOff: '+3% ammunition drum mass.',
    maxLevel: 3,
    costPerLevel: 125,
    category: 'anti_air',
  },
  {
    id: 'aa_detection',
    name: 'AA Extended Radar Array',
    description: '+15% detection & interceptor range, -12% initial lock delay.',
    tradeOff: 'Higher electromagnetic signature.',
    maxLevel: 3,
    costPerLevel: 100,
    category: 'anti_air',
  },
  {
    id: 'aa_cooling',
    name: 'AA Cryo Cooling Jacket',
    description: '+22% barrel heat dissipation & faster overheat recovery.',
    tradeOff: '+3% coolant manifold weight.',
    maxLevel: 3,
    costPerLevel: 110,
    category: 'anti_air',
  },
  {
    id: 'aa_multitarget',
    name: 'AA Multi-Target Bus',
    description: '-24% saturation delay & faster counter-interceptor reload.',
    tradeOff: '+6% thermal load during rapid target swaps.',
    maxLevel: 3,
    costPerLevel: 115,
    category: 'anti_air',
  },
  {
    id: 'aa_reinforced',
    name: 'AA Armored Turret Ring',
    description: '+22% point-defense resistance to sensor & weapon damage.',
    tradeOff: '+4% chassis weight.',
    maxLevel: 3,
    costPerLevel: 110,
    category: 'anti_air',
  },
  {
    id: 'aa_intercept_ai',
    name: 'AA Predictive Intercept AI',
    description: 'Prioritizes highest-threat incoming warheads & trims burst error.',
    tradeOff: 'Calibrated safety margin caps peak reliability below 86%.',
    maxLevel: 3,
    costPerLevel: 135,
    category: 'anti_air',
  },
];

export const CLASS_AA_PRESETS: Record<AntiAirClassKey, AntiAirSpec> = {
  lightweight: {
    classKey: 'lightweight',
    mountStyle: 'rotary_pod',
    range: 450,
    minEngageDist: 30,
    slewRateRad: 8.6,
    arcHalfRad: Math.PI * 0.78,
    reactionDelay: 0.06,
    fireRate: 26.0,
    damagePerHit: 8.5,
    baseAccuracy: 0.75,
    heatPerShot: 2.3,
    coolRate: 28,
    overheatLockoutHeat: 34,
    aimToleranceRad: 0.3,
    sensorResilience: 0.14,
    multiTargetPenalty: 0.09,
    maxHitChanceCap: 0.85,
    caliberScale: 0.75,
    interceptorRange: 920,
    interceptorMinRange: 260,
    interceptorCooldown: 2.2,
    interceptorInterceptChance: 0.78,
  },
  standard: {
    classKey: 'standard',
    mountStyle: 'shoulder_ciws',
    range: 485,
    minEngageDist: 32,
    slewRateRad: 7.4,
    arcHalfRad: Math.PI * 0.8,
    reactionDelay: 0.07,
    fireRate: 24.0,
    damagePerHit: 10,
    baseAccuracy: 0.75,
    heatPerShot: 2.4,
    coolRate: 28,
    overheatLockoutHeat: 35,
    aimToleranceRad: 0.28,
    sensorResilience: 0.2,
    multiTargetPenalty: 0.1,
    maxHitChanceCap: 0.85,
    caliberScale: 0.9,
    interceptorRange: 1000,
    interceptorMinRange: 270,
    interceptorCooldown: 2.0,
    interceptorInterceptChance: 0.8,
  },
  sniper: {
    classKey: 'sniper',
    mountStyle: 'dorsal_popup',
    range: 525,
    minEngageDist: 36,
    slewRateRad: 6.2,
    arcHalfRad: Math.PI * 0.7,
    reactionDelay: 0.08,
    fireRate: 20.5,
    damagePerHit: 11.5,
    baseAccuracy: 0.76,
    heatPerShot: 2.6,
    coolRate: 26,
    overheatLockoutHeat: 36,
    aimToleranceRad: 0.26,
    sensorResilience: 0.18,
    multiTargetPenalty: 0.11,
    maxHitChanceCap: 0.85,
    caliberScale: 0.85,
    interceptorRange: 1120,
    interceptorMinRange: 280,
    interceptorCooldown: 2.3,
    interceptorInterceptChance: 0.81,
  },
  heavy: {
    classKey: 'heavy',
    mountStyle: 'twin_flak',
    range: 500,
    minEngageDist: 38,
    slewRateRad: 5.2,
    arcHalfRad: Math.PI * 0.74,
    reactionDelay: 0.09,
    fireRate: 22.0,
    damagePerHit: 13.5,
    baseAccuracy: 0.75,
    heatPerShot: 2.65,
    coolRate: 27,
    overheatLockoutHeat: 34,
    aimToleranceRad: 0.3,
    sensorResilience: 0.3,
    multiTargetPenalty: 0.12,
    maxHitChanceCap: 0.85,
    caliberScale: 1.2,
    interceptorRange: 1040,
    interceptorMinRange: 280,
    interceptorCooldown: 2.1,
    interceptorInterceptChance: 0.79,
  },
  artillery: {
    classKey: 'artillery',
    mountStyle: 'dorsal_popup',
    range: 510,
    minEngageDist: 40,
    slewRateRad: 5.4,
    arcHalfRad: Math.PI * 0.72,
    reactionDelay: 0.09,
    fireRate: 21.0,
    damagePerHit: 12,
    baseAccuracy: 0.75,
    heatPerShot: 2.55,
    coolRate: 27,
    overheatLockoutHeat: 35,
    aimToleranceRad: 0.29,
    sensorResilience: 0.24,
    multiTargetPenalty: 0.12,
    maxHitChanceCap: 0.84,
    caliberScale: 1.05,
    interceptorRange: 1160,
    interceptorMinRange: 290,
    interceptorCooldown: 1.9,
    interceptorInterceptChance: 0.8,
  },
  support: {
    classKey: 'support',
    mountStyle: 'sensor_linked',
    range: 575,
    minEngageDist: 32,
    slewRateRad: 7.8,
    arcHalfRad: Math.PI * 0.86,
    reactionDelay: 0.06,
    fireRate: 25.0,
    damagePerHit: 9.5,
    baseAccuracy: 0.76,
    heatPerShot: 2.35,
    coolRate: 29,
    overheatLockoutHeat: 34,
    aimToleranceRad: 0.29,
    sensorResilience: 0.22,
    multiTargetPenalty: 0.08,
    maxHitChanceCap: 0.86,
    caliberScale: 0.85,
    interceptorRange: 1200,
    interceptorMinRange: 250,
    interceptorCooldown: 1.75,
    interceptorInterceptChance: 0.82,
  },
  flying: {
    classKey: 'flying',
    mountStyle: 'vector_360',
    range: 515,
    minEngageDist: 28,
    slewRateRad: 9.4,
    arcHalfRad: Math.PI, // Full 360-degree aerial gimbal coverage
    reactionDelay: 0.06,
    fireRate: 26.5,
    damagePerHit: 9.5,
    baseAccuracy: 0.75,
    heatPerShot: 2.5,
    coolRate: 27,
    overheatLockoutHeat: 36,
    aimToleranceRad: 0.32,
    sensorResilience: 0.16,
    multiTargetPenalty: 0.09,
    maxHitChanceCap: 0.85,
    caliberScale: 0.85,
    interceptorRange: 1080,
    interceptorMinRange: 250,
    interceptorCooldown: 2.0,
    interceptorInterceptChance: 0.8,
  },
  boss: {
    classKey: 'boss',
    mountStyle: 'boss_ciws',
    range: 600,
    minEngageDist: 60,
    slewRateRad: 5.0,
    arcHalfRad: Math.PI * 0.86,
    reactionDelay: 0.1,
    fireRate: 24.0,
    damagePerHit: 14.5,
    baseAccuracy: 0.75,
    heatPerShot: 2.45,
    coolRate: 25,
    overheatLockoutHeat: 38,
    aimToleranceRad: 0.3,
    sensorResilience: 0.26,
    multiTargetPenalty: 0.13,
    maxHitChanceCap: 0.84,
    caliberScale: 1.45,
    interceptorRange: 1240,
    interceptorMinRange: 300,
    interceptorCooldown: 2.1,
    interceptorInterceptChance: 0.78,
  },
};

export function mapMechClassToAntiAirKey(classId: MechClassId): AntiAirClassKey {
  switch (classId) {
    case 'recon':
    case 'assassin':
      return 'lightweight';
    case 'standard':
    case 'proteus':
      return 'standard';
    case 'sniper':
      return 'sniper';
    case 'heavy':
      return 'heavy';
    case 'artillery':
    case 'colossus':
      return 'artillery';
    case 'ewar':
    case 'engineer':
    case 'phantom':
      return 'support';
    case 'valkyrie':
      return 'flying';
  }
}

export function computeEffectiveAntiAirSpec(
  classKey: AntiAirClassKey,
  custom?: MechLoadoutCustomization
): AntiAirSpec {
  const base = CLASS_AA_PRESETS[classKey];
  const up: Partial<Record<UpgradeId, number>> = custom?.upgrades ?? {};

  const tgt = up.aa_targeting ?? 0;
  const srv = up.aa_servos ?? 0;
  const rpd = up.aa_rapid_fire ?? 0;
  const amm = up.aa_ammo ?? 0;
  const det = up.aa_detection ?? 0;
  const col = up.aa_cooling ?? 0;
  const mtg = up.aa_multitarget ?? 0;
  const rnf = up.aa_reinforced ?? 0;
  const iai = up.aa_intercept_ai ?? 0;

  // Cap accuracy strictly below 100% (<= 0.86) so AA can never guarantee missile immunity
  const rawAcc = base.baseAccuracy * (1 + tgt * 0.05 + iai * 0.04);
  const hardCap = Math.min(0.86, base.maxHitChanceCap + iai * 0.005);

  return {
    ...base,
    range: Math.round(base.range * (1 + det * 0.15)),
    slewRateRad: base.slewRateRad * (1 + srv * 0.18),
    reactionDelay: Math.max(0.03, base.reactionDelay * Math.pow(0.88, det) * Math.pow(0.92, iai)),
    fireRate: base.fireRate * (1 + rpd * 0.15),
    damagePerHit: Math.round(base.damagePerHit * (1 + amm * 0.22) * 10) / 10,
    baseAccuracy: Math.min(hardCap, rawAcc),
    heatPerShot: base.heatPerShot * (1 + rpd * 0.14 + mtg * 0.04),
    coolRate: base.coolRate * (1 + col * 0.22),
    overheatLockoutHeat: Math.max(22, base.overheatLockoutHeat - col * 3),
    sensorResilience: Math.min(0.78, base.sensorResilience + rnf * 0.2),
    multiTargetPenalty: Math.max(0.02, base.multiTargetPenalty * Math.pow(0.76, mtg)),
    maxHitChanceCap: hardCap,
    interceptorRange: Math.round(base.interceptorRange * (1 + det * 0.15)),
    interceptorCooldown: Math.max(0.85, base.interceptorCooldown * Math.pow(0.86, mtg) * Math.pow(0.92, rpd)),
    interceptorInterceptChance: Math.min(hardCap, base.interceptorInterceptChance + tgt * 0.02 + iai * 0.02),
  };
}
