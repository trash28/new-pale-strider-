import { MechClassId, MechClassSpec, SpecialAbilityKind, WeaponSpec } from './types';

export type ProteusMorphTargetId = Exclude<MechClassId, 'proteus'>;

export interface ProteusMorphProfile {
  targetId: ProteusMorphTargetId;
  morphCode: string;
  morphName: string;
  category: string;
  enhancedSummary: string;
  visualModsDesc: string;
  weaponSummary: string;
  accentColor: string;
  statMultipliers: {
    accelerationMult: number;
    maxSpeedMult: number;
    sprintMultBoost: number;
    turnSpeedMult: number;
    armorMult: number;
    chassisMult: number;
    legDurabilityMult: number;
    sensorRangeMult: number;
    radiusDelta: number;
  };
  primaryOverrides: Partial<WeaponSpec>;
  secondaryOverrides: Partial<WeaponSpec>;
  specialAbility: {
    kind: SpecialAbilityKind;
    name: string;
    description: string;
    duration: number;
    cooldown: number;
  };
}

export interface MorphRigState {
  targetId: ProteusMorphTargetId;
  abilityDeploy: number; // 0..1 smooth mechanical extension for special ability hardware
  weaponExtend: number; // 0..1 barrel / rail / launcher extension
  recoilVent: number; // 0..1 recoil vent shutter & exhaust opening
  reloadBreech: number; // 0..1 ammo feed / breech cycle
  radarSpin: number; // continuous rad rotation for dishes, turbines, gyroscopes
  speedLean: number; // -1..1 accel/brake pitch
  turnBank: number; // -1..1 angular velocity roll offset
  stridePhase: number; // continuous leg-synced mechanical breathing phase
  wingSweep: number; // 0..1 variable-geometry wing sweep (Valkyrie)
  anchorSpades: number; // 0..1 hydraulic ground anchor spades (Sniper / Artillery / Colossus)
  ramStroke: number; // 0..1 heavy siege-ram piston strike impulse
}

export const PROTEUS_MORPH_TARGET_IDS: readonly ProteusMorphTargetId[] = [
  'recon',
  'standard',
  'sniper',
  'heavy',
  'artillery',
  'colossus',
  'ewar',
  'engineer',
  'valkyrie',
  'phantom',
  'assassin',
] as const;

export const PROTEUS_MORPH_PROFILES: Record<ProteusMorphTargetId, ProteusMorphProfile> = {
  recon: {
    targetId: 'recon',
    morphCode: 'TX-01',
    morphName: 'Apex Recon',
    category: 'RECON',
    enhancedSummary: 'Unfolding tri-blade radar mast, vector dash thrusters & twin burst cannon.',
    visualModsDesc: 'Rotating dorsal radar blades, lateral aero-strakes & glowing target-link optics.',
    weaponSummary: '50mm Hyper-Burst AC · Twin 25mm Flankers',
    accentColor: '#38bdf8',
    statMultipliers: {
      accelerationMult: 1.32,
      maxSpeedMult: 1.24,
      sprintMultBoost: 0.1,
      turnSpeedMult: 1.22,
      armorMult: 1.38,
      chassisMult: 1.25,
      legDurabilityMult: 1.3,
      sensorRangeMult: 1.45,
      radiusDelta: 1,
    },
    primaryOverrides: {
      name: '50mm Hyper-Burst Autocannon',
      damage: 38,
      fireRate: 3.1,
      projectileSpeed: 920,
      range: 820,
      magazineSize: 22,
      reloadTime: 1.65,
      spreadRad: 0.02,
      barrelLength: 29,
      caliber: 4.8,
    },
    secondaryOverrides: {
      name: 'Twin 25mm Vector Flankers',
      damage: 14,
      fireRate: 8.5,
      burstCount: 2,
      projectileSpeed: 840,
      range: 560,
      magazineSize: 44,
      reloadTime: 1.8,
      barrelLength: 22,
    },
    specialAbility: {
      kind: 'recon_apex_scan',
      name: 'Apex Telemetry Sweep',
      description: 'Deploys 1300m radar pulse marking enemies (+28% dmg), drops Sensor Beacon & surges speed +48%.',
      duration: 6.5,
      cooldown: 12,
    },
  },

  standard: {
    targetId: 'standard',
    morphCode: 'TX-02',
    morphName: 'Vanguard Prime',
    category: 'FRONTLINE',
    enhancedSummary: 'Hydraulic swinging tower shields, 85mm dual-feed cannon & shoulder 6-tube VLS.',
    visualModsDesc: 'Articulated twin front kinetic shields & elevating 6-cell missile pods.',
    weaponSummary: '85mm Dual-Feed AC · 6-Tube Homing VLS',
    accentColor: '#f59e0b',
    statMultipliers: {
      accelerationMult: 1.2,
      maxSpeedMult: 1.16,
      sprintMultBoost: 0.08,
      turnSpeedMult: 1.18,
      armorMult: 1.45,
      chassisMult: 1.35,
      legDurabilityMult: 1.35,
      sensorRangeMult: 1.18,
      radiusDelta: 2,
    },
    primaryOverrides: {
      name: '85mm Dual-Feed Autocannon',
      damage: 78,
      splashRadius: 38,
      fireRate: 1.68,
      projectileSpeed: 790,
      range: 860,
      magazineSize: 16,
      reloadTime: 2.15,
      spreadRad: 0.018,
      barrelLength: 35,
      caliber: 6.8,
    },
    secondaryOverrides: {
      name: 'Shoulder 6-Tube VLS Pod',
      damage: 88,
      splashRadius: 82,
      fireRate: 0.9,
      burstCount: 3,
      magazineSize: 6,
      reloadTime: 3.4,
      homingTurnRate: 3.85,
      missileType: 'interceptor',
    },
    specialAbility: {
      kind: 'standard_bulwark_salvo',
      name: 'Bulwark VLS Salvo',
      description: 'Locks hydraulic tower shields (-60% dmg, -75% recoil, +40% ROF) & launches 4-missile homing salvo.',
      duration: 7.0,
      cooldown: 13,
    },
  },

  sniper: {
    targetId: 'sniper',
    morphCode: 'TX-03',
    morphName: 'Rail Overlord',
    category: 'SNIPER',
    enhancedSummary: 'Bifurcated split-jaw 130mm twin railgun, 4 hydraulic ground spades & laser mast.',
    visualModsDesc: 'Split electromagnetic accelerator jaws, extending anchor spades & targeting laser.',
    weaponSummary: '130mm Bifurcated Railgun · 30mm Defense PDW',
    accentColor: '#22d3ee',
    statMultipliers: {
      accelerationMult: 1.16,
      maxSpeedMult: 1.12,
      sprintMultBoost: 0.06,
      turnSpeedMult: 1.18,
      armorMult: 1.32,
      chassisMult: 1.28,
      legDurabilityMult: 1.3,
      sensorRangeMult: 1.35,
      radiusDelta: 1,
    },
    primaryOverrides: {
      name: '130mm Bifurcated Twin Railgun',
      damage: 310,
      splashRadius: 34,
      fireRate: 0.52,
      projectileSpeed: 2250,
      range: 1650,
      spreadRad: 0.002,
      chargeTime: 0.58,
      prepTime: 0.08,
      magazineSize: 6,
      reloadTime: 2.85,
      piercing: true,
      barrelLength: 52,
      caliber: 7.4,
    },
    secondaryOverrides: {
      name: '30mm Rotary Defense Carbine',
      damage: 22,
      fireRate: 5.2,
      range: 560,
      magazineSize: 28,
      reloadTime: 1.9,
      barrelLength: 24,
    },
    specialAbility: {
      kind: 'sniper_hyper_lockdown',
      name: 'Hyper-Velocity Lockdown',
      description: 'Deploys 4 spades, fires an instant 420-dmg piercing beam shot & boosts charge speed +60% for 7s.',
      duration: 7.0,
      cooldown: 13,
    },
  },

  heavy: {
    targetId: 'heavy',
    morphCode: 'TX-04',
    morphName: 'Juggernaut Colossus',
    category: 'HEAVY',
    enhancedSummary: 'Sliding blast shutters, twin hydraulic siege-ram gauntlets & 105mm twin cannon.',
    visualModsDesc: 'Dual telescoping pile-driver rams, blast shutters & heavy flank reactive skirts.',
    weaponSummary: '105mm Twin Assault AC · 25mm Vulcan Shredder',
    accentColor: '#ef4444',
    statMultipliers: {
      accelerationMult: 1.28,
      maxSpeedMult: 1.22,
      sprintMultBoost: 0.08,
      turnSpeedMult: 1.24,
      armorMult: 1.48,
      chassisMult: 1.4,
      legDurabilityMult: 1.45,
      sensorRangeMult: 1.15,
      radiusDelta: 2,
    },
    primaryOverrides: {
      name: '105mm Twin Assault Cannon',
      damage: 112,
      splashRadius: 48,
      fireRate: 1.32,
      projectileSpeed: 760,
      range: 880,
      magazineSize: 14,
      reloadTime: 2.6,
      recoilImpulse: 120,
      barrelLength: 39,
      caliber: 8.2,
    },
    secondaryOverrides: {
      name: '25mm Vulcan Shredder',
      damage: 18,
      fireRate: 10.5,
      projectileSpeed: 820,
      range: 620,
      magazineSize: 75,
      reloadTime: 2.5,
      barrelLength: 27,
    },
    specialAbility: {
      kind: 'heavy_siege_ram',
      name: 'Seismic Siege Ram',
      description: 'Slams twin hydraulic pistons (320-dmg stun & cover break) & engages Bastion Armor (-68% dmg, +50% ROF).',
      duration: 7.0,
      cooldown: 14,
    },
  },

  artillery: {
    targetId: 'artillery',
    morphCode: 'TX-05',
    morphName: 'Earthshaker',
    category: 'ARTILLERY',
    enhancedSummary: '3 unfolding hydraulic outriggers, dual-cradle 210mm howitzer & thermobaric salvo.',
    visualModsDesc: 'Tri-point hydraulic ground anchors & reinforced 210mm recoil cradle.',
    weaponSummary: '210mm Dual-Cradle Howitzer · 45mm Flak Defense',
    accentColor: '#fb923c',
    statMultipliers: {
      accelerationMult: 1.22,
      maxSpeedMult: 1.18,
      sprintMultBoost: 0.08,
      turnSpeedMult: 1.2,
      armorMult: 1.4,
      chassisMult: 1.35,
      legDurabilityMult: 1.38,
      sensorRangeMult: 1.22,
      radiusDelta: 2,
    },
    primaryOverrides: {
      name: '210mm Earthshaker Howitzer',
      damage: 325,
      splashRadius: 195,
      fireRate: 0.42,
      projectileSpeed: 510,
      range: 1480,
      prepTime: 0.28,
      magazineSize: 5,
      reloadTime: 3.3,
      barrelLength: 48,
      caliber: 11.2,
    },
    secondaryOverrides: {
      name: '45mm Twin Defense Flak',
      damage: 42,
      splashRadius: 42,
      fireRate: 2.2,
      range: 560,
      magazineSize: 16,
      reloadTime: 2.1,
    },
    specialAbility: {
      kind: 'artillery_earthshaker',
      name: 'Thermobaric Siege Salvo',
      description: 'Anchors 3 outriggers, reloads magazine & fires 5 thermobaric shells leaving burning hazard zones.',
      duration: 3.0,
      cooldown: 15,
    },
  },

  colossus: {
    targetId: 'colossus',
    morphCode: 'TX-09',
    morphName: 'Apocalypse',
    category: 'SIEGE',
    enhancedSummary: '280mm bifurcated siege mortar, dorsal ammo vaults, quad outriggers & rapid rammer.',
    visualModsDesc: 'Sliding overhead ammo vaults, 4 heavy stabilizer spades & 280mm split shroud.',
    weaponSummary: '280mm Apocalypse Mortar · 40mm Twin Flak',
    accentColor: '#fbbf24',
    statMultipliers: {
      accelerationMult: 1.22,
      maxSpeedMult: 1.18,
      sprintMultBoost: 0.08,
      turnSpeedMult: 1.2,
      armorMult: 1.42,
      chassisMult: 1.38,
      legDurabilityMult: 1.4,
      sensorRangeMult: 1.22,
      radiusDelta: 2,
    },
    primaryOverrides: {
      name: '280mm Apocalypse Siege Mortar',
      damage: 350,
      splashRadius: 215,
      fireRate: 0.38,
      projectileSpeed: 620,
      range: 1950,
      prepTime: 0.26,
      magazineSize: 6,
      reloadTime: 3.1,
      barrelLength: 52,
      caliber: 14.5,
    },
    secondaryOverrides: {
      name: '40mm Quad Defense Flak',
      damage: 38,
      splashRadius: 36,
      fireRate: 2.9,
      range: 580,
      magazineSize: 22,
      reloadTime: 2.0,
    },
    specialAbility: {
      kind: 'colossus_apocalypse_salvo',
      name: 'Apocalypse 7-Shell Barrage',
      description: 'Opens dorsal ammo vaults & launches an accelerated 7-round wide-splash barrage in active munition.',
      duration: 2.6,
      cooldown: 15,
    },
  },

  ewar: {
    targetId: 'ewar',
    morphCode: 'TX-06',
    morphName: 'Tempest EWAR',
    category: 'EWAR',
    enhancedSummary: 'Unfolding quad-dipole antenna mast, EM capacitor fins, blackout storm & holo-decoys.',
    visualModsDesc: 'Spinning quad-dipole jammer crown & glowing violet EM discharge fins.',
    weaponSummary: '55mm Ionized Carbine · Twin EMP Arc Mortar',
    accentColor: '#a78bfa',
    statMultipliers: {
      accelerationMult: 1.24,
      maxSpeedMult: 1.18,
      sprintMultBoost: 0.08,
      turnSpeedMult: 1.22,
      armorMult: 1.36,
      chassisMult: 1.3,
      legDurabilityMult: 1.3,
      sensorRangeMult: 1.35,
      radiusDelta: 1,
    },
    primaryOverrides: {
      name: '55mm Ionized Pulse Carbine',
      damage: 48,
      splashRadius: 24,
      fireRate: 2.75,
      projectileSpeed: 840,
      range: 780,
      magazineSize: 22,
      reloadTime: 1.85,
      barrelLength: 30,
    },
    secondaryOverrides: {
      name: 'Heavy EMP Arc Mortar',
      damage: 78,
      splashRadius: 155,
      fireRate: 0.85,
      range: 760,
      magazineSize: 6,
      reloadTime: 2.7,
    },
    specialAbility: {
      kind: 'ewar_tempest_storm',
      name: 'Tempest EMP Blackout',
      description: '900m EMP surge (8s jam, 110 EM dmg, vaporizes enemy missiles) & deploys 2 Holographic Decoys.',
      duration: 8.0,
      cooldown: 13,
    },
  },

  engineer: {
    targetId: 'engineer',
    morphCode: 'TX-07',
    morphName: 'Fabricator',
    category: 'SUPPORT',
    enhancedSummary: 'Dual extending servo cranes, overcharged nanite dome & autonomous sentry turret.',
    visualModsDesc: 'Dual articulated shoulder manipulator cranes & dorsal fabricator dome projector.',
    weaponSummary: '50mm Siege Carbine · Focused Twin Nanite Beam',
    accentColor: '#34d399',
    statMultipliers: {
      accelerationMult: 1.25,
      maxSpeedMult: 1.2,
      sprintMultBoost: 0.08,
      turnSpeedMult: 1.2,
      armorMult: 1.44,
      chassisMult: 1.36,
      legDurabilityMult: 1.4,
      sensorRangeMult: 1.25,
      radiusDelta: 2,
    },
    primaryOverrides: {
      name: '50mm Support Autocannon',
      damage: 46,
      splashRadius: 20,
      fireRate: 2.55,
      projectileSpeed: 800,
      range: 720,
      magazineSize: 22,
      reloadTime: 1.8,
      barrelLength: 28,
    },
    secondaryOverrides: {
      name: 'Overcharged Nanite Repair Beam',
      damage: 42,
      splashRadius: 105,
      fireRate: 4.0,
      range: 460,
      magazineSize: 32,
      reloadTime: 1.8,
    },
    specialAbility: {
      kind: 'engineer_fabricator_rig',
      name: 'Fabricator Sentry & Dome',
      description: '360m Nanite Dome (+34/s repair, 2.5x revive speed, -25% dmg) & deploys Autonomous Sentry Turret.',
      duration: 9.0,
      cooldown: 14,
    },
  },

  valkyrie: {
    targetId: 'valkyrie',
    morphCode: 'TX-12',
    morphName: 'Seraphim',
    category: 'AERIAL',
    enhancedSummary: 'Variable-sweep aero wings, outboard booster pods & 8-missile curved strike fan.',
    visualModsDesc: 'Articulated sweeping aero wings, wingtip missile pods & twin blue Mach exhaust.',
    weaponSummary: '35mm Hyper-Rotary AC · Twin Swarm Pods',
    accentColor: '#38bdf8',
    statMultipliers: {
      accelerationMult: 1.28,
      maxSpeedMult: 1.22,
      sprintMultBoost: 0.12,
      turnSpeedMult: 1.22,
      armorMult: 1.42,
      chassisMult: 1.34,
      legDurabilityMult: 1.35,
      sensorRangeMult: 1.25,
      radiusDelta: 1,
    },
    primaryOverrides: {
      name: '35mm Seraphim Rotary Cannon',
      damage: 46,
      splashRadius: 24,
      fireRate: 4.1,
      projectileSpeed: 960,
      range: 840,
      magazineSize: 30,
      reloadTime: 1.65,
      barrelLength: 31,
    },
    secondaryOverrides: {
      name: 'Twin Swarm Micro-Missile Pods',
      damage: 56,
      splashRadius: 64,
      fireRate: 1.2,
      burstCount: 4,
      magazineSize: 8,
      reloadTime: 2.5,
      homingTurnRate: 4.2,
      missileType: 'advanced_tracking',
    },
    specialAbility: {
      kind: 'valkyrie_seraphim_strike',
      name: 'Seraphim Mach Strike',
      description: 'Flushes thruster heat, surges supersonic flight +45% for 6s & launches 8-missile curved fan salvo.',
      duration: 6.0,
      cooldown: 13,
    },
  },

  phantom: {
    targetId: 'phantom',
    morphCode: 'TX-08',
    morphName: 'Chrono Phantom',
    category: 'VANGUARD',
    enhancedSummary: '4 radial phase-capacitor fins, phase-pulse twin carbine & explosive Aegis Nova.',
    visualModsDesc: 'Unfolding 4-petal phase-capacitor array & wrist-mounted cyan phase emitters.',
    weaponSummary: '35mm Chrono-Pulse Rifle · Smart Seekers',
    accentColor: '#22d3ee',
    statMultipliers: {
      accelerationMult: 1.24,
      maxSpeedMult: 1.18,
      sprintMultBoost: 0.1,
      turnSpeedMult: 1.2,
      armorMult: 1.38,
      chassisMult: 1.34,
      legDurabilityMult: 1.34,
      sensorRangeMult: 1.25,
      radiusDelta: 1,
    },
    primaryOverrides: {
      name: '35mm Chrono-Pulse Rifle',
      damage: 34,
      splashRadius: 16,
      fireRate: 6.4,
      projectileSpeed: 1140,
      range: 860,
      magazineSize: 36,
      reloadTime: 1.5,
      barrelLength: 29,
    },
    secondaryOverrides: {
      name: 'Chrono-Disruptor Seekers',
      damage: 72,
      splashRadius: 68,
      fireRate: 1.3,
      burstCount: 3,
      magazineSize: 9,
      reloadTime: 2.3,
      homingTurnRate: 4.3,
      missileType: 'interceptor',
    },
    specialAbility: {
      kind: 'phantom_overclock_aegis',
      name: 'Chrono Aegis Nova',
      description: '30s Squad Aegis Armor + 280m Phase Nova (140 dmg + stun) + instant dash reset & -45% dash CD.',
      duration: 8.0,
      cooldown: 28,
    },
  },

  assassin: {
    targetId: 'assassin',
    morphCode: 'TX-09K',
    morphName: 'Shinobi Kage',
    category: 'ASSASSIN',
    enhancedSummary: '4 articulated dorsal blade arms, oversized dual crimson scythes & Shadow Blitz dash.',
    visualModsDesc: 'Twin oversized dorsal HF crimson thermal scythes & split mantis stealth cowls.',
    weaponSummary: '30mm Silenced Rail-Flechette · Piercing Darts',
    accentColor: '#f43f5e',
    statMultipliers: {
      accelerationMult: 1.22,
      maxSpeedMult: 1.16,
      sprintMultBoost: 0.1,
      turnSpeedMult: 1.22,
      armorMult: 1.42,
      chassisMult: 1.36,
      legDurabilityMult: 1.38,
      sensorRangeMult: 1.28,
      radiusDelta: 1,
    },
    primaryOverrides: {
      name: '30mm Silenced Rail-Flechette',
      damage: 36,
      splashRadius: 12,
      fireRate: 6.0,
      projectileSpeed: 1220,
      range: 740,
      magazineSize: 30,
      reloadTime: 1.35,
      piercing: true,
      barrelLength: 27,
    },
    secondaryOverrides: {
      name: 'Crimson HF Thermal Darts',
      damage: 24,
      fireRate: 8.8,
      projectileSpeed: 1080,
      range: 560,
      magazineSize: 40,
      reloadTime: 1.25,
      piercing: true,
    },
    specialAbility: {
      kind: 'assassin_crimson_tempest',
      name: 'Crimson Tempest Execution',
      description: '620m rear Phantom Execution on lock; otherwise Shadow Blitz 260m crescent dash cleave + 3.5s Cloak.',
      duration: 3.8,
      cooldown: 9.5,
    },
  },
};

export function isProteusMorphTargetId(id: MechClassId): id is ProteusMorphTargetId {
  return id !== 'proteus' && id in PROTEUS_MORPH_PROFILES;
}

export function getProteusMorphProfile(id: MechClassId): ProteusMorphProfile | null {
  if (!isProteusMorphTargetId(id)) return null;
  return PROTEUS_MORPH_PROFILES[id];
}

/**
 * Produces a strictly isolated Proteus-upgraded MechClassSpec without mutating base MECH_ROSTER.
 * Standard non-Proteus units in Campaign/Skirmish/AI allies remain completely untouched.
 */
export function getProteusMorphSpec(baseSpec: MechClassSpec): MechClassSpec {
  const profile = getProteusMorphProfile(baseSpec.id);
  if (!profile) return baseSpec;

  const sm = profile.statMultipliers;
  return {
    ...baseSpec,
    code: `${profile.morphCode} ${profile.morphName}`,
    name: `${profile.morphName} (Proteus)`,
    role: `${baseSpec.role} · Upgraded Morph`,
    description: `${profile.enhancedSummary} ${profile.specialAbility.description}`,
    acceleration: Math.round(baseSpec.acceleration * sm.accelerationMult),
    maxSpeed: Math.round(baseSpec.maxSpeed * sm.maxSpeedMult),
    sprintMultiplier: Number((baseSpec.sprintMultiplier + sm.sprintMultBoost).toFixed(2)),
    maxTurnSpeed: Number((baseSpec.maxTurnSpeed * sm.turnSpeedMult).toFixed(2)),
    turnAccel: Number((baseSpec.turnAccel * sm.turnSpeedMult).toFixed(2)),
    radius: baseSpec.radius + sm.radiusDelta,
    baseArmor: Math.round(baseSpec.baseArmor * sm.armorMult),
    baseChassis: Math.round(baseSpec.baseChassis * sm.chassisMult),
    legDurability: Math.round(baseSpec.legDurability * sm.legDurabilityMult),
    sensorRange: Math.round(baseSpec.sensorRange * sm.sensorRangeMult),
    accentColor: profile.accentColor,
    primaryWeapon: {
      ...baseSpec.primaryWeapon,
      ...profile.primaryOverrides,
      id: `${baseSpec.primaryWeapon.id}_tx`,
    },
    secondaryWeapon: {
      ...baseSpec.secondaryWeapon,
      ...profile.secondaryOverrides,
      id: `${baseSpec.secondaryWeapon.id}_tx`,
    },
    specialAbility: {
      ...profile.specialAbility,
    },
  };
}

export function createMorphRigState(classId: MechClassId): MorphRigState | undefined {
  if (!isProteusMorphTargetId(classId)) return undefined;
  return {
    targetId: classId,
    abilityDeploy: 0,
    weaponExtend: 0.3,
    recoilVent: 0,
    reloadBreech: 0,
    radarSpin: 0,
    speedLean: 0,
    turnBank: 0,
    stridePhase: 0,
    wingSweep: 0.25,
    anchorSpades: 0,
    ramStroke: 0,
  };
}

export function stepMorphRigState(
  rig: MorphRigState,
  input: {
    dt: number;
    speedRatio: number;
    sprinting: boolean;
    angularVel: number;
    tiltX: number;
    recoilOffset: number;
    reloading: boolean;
    reloadProgress: number;
    chargingOrPreparing: boolean;
    braced: boolean;
    specialActive: boolean;
    airborne: boolean;
    boosting: boolean;
  }
): void {
  const dt = Math.max(0, Math.min(0.05, input.dt));
  const lerpRate = (cur: number, tgt: number, rate: number) => cur + (tgt - cur) * Math.min(1, dt * rate);

  const abilityTarget = input.specialActive ? 1 : 0;
  rig.abilityDeploy = lerpRate(rig.abilityDeploy, abilityTarget, input.specialActive ? 11 : 6.5);

  const weaponTarget = input.reloading ? 0.15 : input.chargingOrPreparing || input.specialActive ? 1.0 : 0.45 + input.speedRatio * 0.25;
  rig.weaponExtend = lerpRate(rig.weaponExtend, weaponTarget, 9);

  const recoilTarget = Math.min(1, input.recoilOffset / 6.5);
  rig.recoilVent = recoilTarget > rig.recoilVent ? lerpRate(rig.recoilVent, recoilTarget, 22) : lerpRate(rig.recoilVent, recoilTarget, 5.5);

  const breechTarget = input.reloading ? Math.sin(Math.max(0, Math.min(1, input.reloadProgress)) * Math.PI) : 0;
  rig.reloadBreech = lerpRate(rig.reloadBreech, breechTarget, 12);

  const spinMult = input.specialActive ? 4.8 : 1.3 + input.speedRatio * 1.1;
  rig.radarSpin = (rig.radarSpin + dt * spinMult) % (Math.PI * 200);

  rig.speedLean = lerpRate(rig.speedLean, Math.max(-1, Math.min(1, input.tiltX * 1.4)), 8);
  rig.turnBank = lerpRate(rig.turnBank, Math.max(-1, Math.min(1, input.angularVel * 0.42)), 9);
  rig.stridePhase = (rig.stridePhase + dt * (1.8 + input.speedRatio * (input.sprinting ? 9.5 : 5.5))) % (Math.PI * 200);

  const sweepTarget =
    rig.targetId === 'valkyrie'
      ? input.boosting || input.specialActive
        ? 1.0
        : input.airborne
        ? 0.68
        : 0.15 + input.speedRatio * 0.35
      : 0;
  rig.wingSweep = lerpRate(rig.wingSweep, sweepTarget, 7.5);

  const spadesTarget =
    rig.targetId === 'sniper' || rig.targetId === 'artillery' || rig.targetId === 'colossus'
      ? input.specialActive || input.braced || input.chargingOrPreparing
        ? 1.0
        : 0
      : 0;
  rig.anchorSpades = lerpRate(rig.anchorSpades, spadesTarget, 10);

  rig.ramStroke = Math.max(0, rig.ramStroke - dt * 2.4);
}

export function getMorphIncomingDamageReduction(
  kind: SpecialAbilityKind,
  specialActiveRemaining: number
): number {
  if (specialActiveRemaining <= 0) return 0;
  if (kind === 'fortress_armor') return 0.6;
  if (kind === 'stabilizer') return 0.45;
  if (kind === 'standard_bulwark_salvo') return 0.6;
  if (kind === 'heavy_siege_ram') return 0.68;
  if (kind === 'recon_apex_scan') return 0.25;
  return 0;
}

export function getMorphFireRateMultiplier(
  kind: SpecialAbilityKind,
  specialActiveRemaining: number
): number {
  if (specialActiveRemaining <= 0) return 1.0;
  if (kind === 'standard_bulwark_salvo') return 1.4;
  if (kind === 'heavy_siege_ram') return 1.5;
  if (kind === 'sniper_hyper_lockdown') return 1.25;
  return 1.0;
}

export function getMorphRecoilMultiplier(
  kind: SpecialAbilityKind,
  specialActiveRemaining: number
): number {
  if (specialActiveRemaining <= 0) return 1.0;
  if (kind === 'stabilizer' || kind === 'siege_stance') return 0.32;
  if (kind === 'standard_bulwark_salvo') return 0.25;
  if (kind === 'sniper_hyper_lockdown') return 0.15;
  if (kind === 'heavy_siege_ram') return 0.35;
  return 1.0;
}

export function getMorphSpreadMultiplier(
  kind: SpecialAbilityKind,
  specialActiveRemaining: number
): number {
  if (specialActiveRemaining <= 0) return 1.0;
  if (kind === 'stabilizer' || kind === 'siege_stance') return 0.35;
  if (kind === 'standard_bulwark_salvo') return 0.42;
  if (kind === 'sniper_hyper_lockdown') return 0.05;
  return 1.0;
}

export function getMorphSpeedMultiplier(
  kind: SpecialAbilityKind,
  specialActiveRemaining: number
): number {
  if (specialActiveRemaining <= 0) return 1.0;
  if (kind === 'overdrive') return 1.42;
  if (kind === 'recon_apex_scan') return 1.48;
  if (kind === 'valkyrie_seraphim_strike') return 1.45;
  return 1.0;
}

export function getMorphDashCooldownMultiplier(
  kind: SpecialAbilityKind,
  specialActiveRemaining: number
): number {
  if (specialActiveRemaining <= 0) return 1.0;
  if (kind === 'phantom_overclock_aegis') return 0.55;
  if (kind === 'recon_apex_scan') return 0.65;
  if (kind === 'assassin_crimson_tempest') return 0.6;
  return 1.0;
}

export function getMorphChargeSpeedMultiplier(
  kind: SpecialAbilityKind,
  specialActiveRemaining: number
): number {
  if (specialActiveRemaining <= 0) return 1.0;
  if (kind === 'siege_stance') return 1.35;
  if (kind === 'sniper_hyper_lockdown') return 1.6;
  return 1.0;
}
