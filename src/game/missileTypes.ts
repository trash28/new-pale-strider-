export type MissileType =
  | 'standard'
  | 'interceptor'
  | 'heavy'
  | 'swarm'
  | 'long_range'
  | 'advanced_tracking';

export interface MissileProfile {
  id: MissileType;
  label: string;
  launchSpeed: number;
  maxSpeed: number;
  acceleration: number;
  turnRateRad: number;
  highSpeedTurnScale: number; // multiplier applied as speed nears maxSpeed (causes realistic overshoot)
  leadFactor: number; // 0..1 predictive target velocity lead
  seekerConeRad: number; // half-angle gimbal cone limit
  maxLifetime: number;
  maxTrackRange: number;
  damage: number;
  splashRadius: number;
  missileHp: number;
  threatWeight: number;
  weaveAmplitude: number;
  weaveFreq: number;
  bodyColor: string;
  flameColor: string;
  trailColor: string;
  scale: number;
  audioVariant: 'standard' | 'interceptor' | 'heavy' | 'swarm';
}

export const MISSILE_PROFILES: Record<MissileType, MissileProfile> = {
  standard: {
    id: 'standard',
    label: 'Standard Homing',
    launchSpeed: 230,
    maxSpeed: 690,
    acceleration: 960,
    turnRateRad: 3.15,
    highSpeedTurnScale: 0.68,
    leadFactor: 0.45,
    seekerConeRad: 1.28,
    maxLifetime: 3.1,
    maxTrackRange: 1050,
    damage: 74,
    splashRadius: 72,
    missileHp: 20,
    threatWeight: 1.0,
    weaveAmplitude: 0,
    weaveFreq: 0,
    bodyColor: '#e2e8f0',
    flameColor: '#f97316',
    trailColor: '#94a3b8',
    scale: 1.0,
    audioVariant: 'standard',
  },
  interceptor: {
    id: 'interceptor',
    label: 'Interceptor',
    launchSpeed: 320,
    maxSpeed: 930,
    acceleration: 1520,
    turnRateRad: 4.45,
    highSpeedTurnScale: 0.72,
    leadFactor: 0.7,
    seekerConeRad: 1.45,
    maxLifetime: 2.35,
    maxTrackRange: 1180,
    damage: 54,
    splashRadius: 48,
    missileHp: 14,
    threatWeight: 1.15,
    weaveAmplitude: 0,
    weaveFreq: 0,
    bodyColor: '#bae6fd',
    flameColor: '#38bdf8',
    trailColor: '#cbd5e1',
    scale: 0.9,
    audioVariant: 'interceptor',
  },
  heavy: {
    id: 'heavy',
    label: 'Heavy Anti-Mech',
    launchSpeed: 155,
    maxSpeed: 515,
    acceleration: 540,
    turnRateRad: 1.85,
    highSpeedTurnScale: 0.56,
    leadFactor: 0.35,
    seekerConeRad: 1.05,
    maxLifetime: 3.85,
    maxTrackRange: 1120,
    damage: 132,
    splashRadius: 108,
    missileHp: 44,
    threatWeight: 1.65,
    weaveAmplitude: 0,
    weaveFreq: 0,
    bodyColor: '#fca5a5',
    flameColor: '#ef4444',
    trailColor: '#64748b',
    scale: 1.38,
    audioVariant: 'heavy',
  },
  swarm: {
    id: 'swarm',
    label: 'Swarm Salvo',
    launchSpeed: 265,
    maxSpeed: 760,
    acceleration: 1180,
    turnRateRad: 3.35,
    highSpeedTurnScale: 0.66,
    leadFactor: 0.42,
    seekerConeRad: 1.25,
    maxLifetime: 2.75,
    maxTrackRange: 980,
    damage: 38,
    splashRadius: 42,
    missileHp: 11,
    threatWeight: 0.85,
    weaveAmplitude: 130,
    weaveFreq: 7.4,
    bodyColor: '#fde047',
    flameColor: '#fb923c',
    trailColor: '#cbd5e1',
    scale: 0.78,
    audioVariant: 'swarm',
  },
  long_range: {
    id: 'long_range',
    label: 'Long-Range Cruise',
    launchSpeed: 205,
    maxSpeed: 745,
    acceleration: 740,
    turnRateRad: 2.45,
    highSpeedTurnScale: 0.55,
    leadFactor: 0.62,
    seekerConeRad: 1.16,
    maxLifetime: 5.2,
    maxTrackRange: 1750,
    damage: 92,
    splashRadius: 82,
    missileHp: 24,
    threatWeight: 1.28,
    weaveAmplitude: 0,
    weaveFreq: 0,
    bodyColor: '#cbd5e1',
    flameColor: '#fbbf24',
    trailColor: '#94a3b8',
    scale: 1.15,
    audioVariant: 'standard',
  },
  advanced_tracking: {
    id: 'advanced_tracking',
    label: 'Advanced Seeker',
    launchSpeed: 275,
    maxSpeed: 810,
    acceleration: 1140,
    turnRateRad: 3.9,
    highSpeedTurnScale: 0.78,
    leadFactor: 0.92,
    seekerConeRad: 1.56,
    maxLifetime: 3.3,
    maxTrackRange: 1280,
    damage: 78,
    splashRadius: 68,
    missileHp: 22,
    threatWeight: 1.48,
    weaveAmplitude: 0,
    weaveFreq: 0,
    bodyColor: '#d8b4fe',
    flameColor: '#a855f7',
    trailColor: '#c4b5fd',
    scale: 1.05,
    audioVariant: 'interceptor',
  },
};

export const ALL_MISSILE_TYPES: MissileType[] = [
  'standard',
  'interceptor',
  'heavy',
  'swarm',
  'long_range',
  'advanced_tracking',
];

export function getMissileProfile(type?: MissileType): MissileProfile {
  return type ? MISSILE_PROFILES[type] : MISSILE_PROFILES.standard;
}
