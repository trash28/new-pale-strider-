import { AegisArmorState, createInactiveAegisState } from './aegisArmor';
import { AntiAirController } from './antiAirController';
import { createComponentHealth } from './combat';
import { DashController } from './dashSystem';
import { createFlightState, FlightState } from './flightSystem';
import { LegAnimator } from './proceduralLegs';
import { createStealthState, StealthState } from './stealthSystem';
import { computeEffectiveMechStats, ComputedMechStats, MECH_ROSTER, PAINT_SCHEMES } from './mechRoster';
import { createPhysicsState, MechPhysicsState, PhysicsConfig } from './physics';
import {
  createMorphRigState,
  getProteusMorphSpec,
  isProteusMorphTargetId,
  MorphRigState,
} from './proteusMorphs';
import { TransformRuntimeState } from './transformSystem';
import type { GrapplerEnemyState } from './grapplerEnemy';
import {
  ComponentHealth,
  EnemyArchetype,
  MechClassId,
  MechClassSpec,
  MechLoadoutCustomization,
  PaintScheme,
  SquadOrder,
  Vec2,
} from './types';
import { createWeaponRuntime, WeaponRuntime } from './weapons';

export interface MechActor {
  id: string;
  callsign: string;
  team: 'player' | 'enemy';
  isPlayer: boolean;
  classId: MechClassId;
  enemyArchetype?: EnemyArchetype;
  spec: MechClassSpec;
  stats: ComputedMechStats;
  physCfg: PhysicsConfig;
  phys: MechPhysicsState;
  legs: LegAnimator;
  health: ComponentHealth;
  primary: WeaponRuntime;
  secondary: WeaponRuntime;
  activeSlot: 1 | 2 | 3;
  paint: PaintScheme;
  // Special ability state
  specialActiveTimer: number;
  specialCooldownTimer: number;
  // Combat & visual juice
  hitFlashTimer: number;
  alive: boolean;
  koTimer: number; // 0..0.45 topple dissolve
  detected: boolean;
  jammedTimer: number;
  // AI fields
  aiState: 'idle' | 'patrol' | 'engage' | 'flank' | 'cover' | 'retreat' | 'search' | 'windup';
  aiTimer: number;
  aiPath: Vec2[];
  aiPathTimer: number;
  lastKnownTargetPos: Vec2 | null;
  targetId: string | null;
  windupTimer: number;
  windupTargetPos: Vec2 | null;
  squadOrder: SquadOrder;
  squadRole?: 'assault' | 'support' | 'recon';
  defendPos: Vec2 | null;
  formationSlot: number;
  personality: 'aggressive' | 'disciplined' | 'support' | 'cautious';
  isDummy?: boolean;
  // M-09 Colossus mortar animation & munition state
  activeMortarAmmo?: import('./types').MortarAmmoType;
  mortarPitch?: number;
  gantryCycle?: number;
  // Advanced mobility & rocket flight state
  flight?: FlightState;
  dash?: DashController;
  antiAir: AntiAirController;
  // REVENANT corrupted enemy metadata
  isRevenant?: boolean;
  revenantSourceClass?: MechClassId;
  revenantSurgeTimer?: number;
  revenantPulsePhase?: number;
  sandboxBehavior?: import('./sandboxRegistry').SandboxBehaviorMode;
  sandboxManual?: boolean;
  grapplerState?: GrapplerEnemyState;
  // Aegis Adaptive Protective Armor (30s infinite-HP upgrade)
  aegisArmor?: AegisArmorState;
  // Downed & coordinated squad revive state
  downed?: boolean;
  reviveProgress?: number;
  reviveCooldownTimer?: number;
  reviveTargetId?: string | null;
  reviveStuckTimer?: number;
  lastFailedReviveTargetId?: string | null;
  // Coordinated Search & Sweep state
  searchWaypoint?: Vec2 | null;
  searchExpandRadius?: number;
  visitedSearchPoints?: Vec2[];
  // Stealth Optical Cloak system
  stealth?: StealthState;
  // TX-10 Proteus Transformation system
  isProteusOrigin?: boolean;
  transform?: TransformRuntimeState | null;
  transformCooldownTimer: number;
  morphRig?: MorphRigState;
  markedTimer?: number;
}

export function createPlayableMech(params: {
  id: string;
  callsign: string;
  isPlayer: boolean;
  classId: MechClassId;
  x: number;
  y: number;
  angle?: number;
  customization?: MechLoadoutCustomization;
  formationSlot?: number;
  personality?: MechActor['personality'];
  squadRole?: 'assault' | 'support' | 'recon';
}): MechActor {
  const spec = MECH_ROSTER[params.classId];
  const stats = computeEffectiveMechStats(spec, params.customization);
  const paint =
    PAINT_SCHEMES.find((p) => p.id === params.customization?.paintId) ?? {
      id: 'default',
      name: 'Standard',
      primary: spec.defaultColor,
      secondary: '#262b33',
      accent: spec.accentColor,
    };

  const physCfg: PhysicsConfig = {
    mass: stats.mass,
    acceleration: stats.acceleration,
    maxSpeed: stats.maxSpeed,
    sprintMultiplier: spec.sprintMultiplier,
    reverseMultiplier: spec.reverseMultiplier,
    turnAccel: stats.turnAccel,
    maxTurnSpeed: stats.turnSpeed,
    lateralGrip: stats.lateralGrip,
    radius: spec.radius,
    suspensionStiffness: spec.suspensionStiffness,
    terrainPenaltyMult: stats.terrainPenaltyMult,
  };

  const primarySpec = {
    ...spec.primaryWeapon,
    damage: Math.round(spec.primaryWeapon.damage * stats.damageMult),
    fireRate: spec.primaryWeapon.fireRate * stats.fireRateMult,
    reloadTime: spec.primaryWeapon.reloadTime / stats.reloadMult,
    recoilImpulse: spec.primaryWeapon.recoilImpulse * stats.recoilMult,
    spreadRad: spec.primaryWeapon.spreadRad * stats.spreadMult,
  };
  const secondarySpec = {
    ...spec.secondaryWeapon,
    damage: Math.round(spec.secondaryWeapon.damage * stats.damageMult),
    fireRate: spec.secondaryWeapon.fireRate * stats.fireRateMult,
    reloadTime: spec.secondaryWeapon.reloadTime / stats.reloadMult,
    recoilImpulse: spec.secondaryWeapon.recoilImpulse * stats.recoilMult,
    spreadRad: spec.secondaryWeapon.spreadRad * stats.spreadMult,
  };

  const angle = params.angle ?? 0;

  return {
    id: params.id,
    callsign: params.callsign,
    team: 'player',
    isPlayer: params.isPlayer,
    classId: params.classId,
    spec,
    stats,
    physCfg,
    phys: createPhysicsState(params.x, params.y, angle),
    legs: new LegAnimator(spec.legs, { x: params.x, y: params.y }, angle),
    health: createComponentHealth(stats.chassis, stats.armor, stats.legDurability),
    primary: createWeaponRuntime(primarySpec),
    secondary: createWeaponRuntime(secondarySpec),
    activeSlot: 1,
    paint,
    specialActiveTimer: 0,
    specialCooldownTimer: 0,
    hitFlashTimer: 0,
    alive: true,
    koTimer: 0,
    detected: true,
    jammedTimer: 0,
    aiState: 'idle',
    aiTimer: 0,
    aiPath: [],
    aiPathTimer: 0,
    lastKnownTargetPos: null,
    targetId: null,
    windupTimer: 0,
    windupTargetPos: null,
    squadOrder: 'follow',
    squadRole: params.squadRole,
    defendPos: null,
    formationSlot: params.formationSlot ?? 0,
    personality: params.personality ?? 'disciplined',
    activeMortarAmmo: params.classId === 'colossus' ? 'he' : undefined,
    mortarPitch: 0.42,
    gantryCycle: 0,
    flight: spec.canFly ? createFlightState(false, 0) : undefined,
    dash: new DashController(params.classId, params.customization),
    antiAir: AntiAirController.forMechClass(params.classId, params.customization, angle),
    aegisArmor: createInactiveAegisState(),
    downed: false,
    reviveProgress: 0,
    reviveCooldownTimer: 0,
    reviveTargetId: null,
    reviveStuckTimer: 0,
    lastFailedReviveTargetId: null,
    searchWaypoint: null,
    searchExpandRadius: 520,
    visitedSearchPoints: [],
    stealth: createStealthState(params.classId === 'assassin'),
    isProteusOrigin: params.classId === 'proteus',
    transform: null,
    transformCooldownTimer: 0,
  };
}

/**
 * Transitions a TX-10 Proteus mech cleanly into the upgraded Proteus-specific TX-series
 * combat specification while preserving HP % ratios and keeping Proteus's 60s
 * transformation cooldown independent of target special abilities.
 * Non-Proteus allied units never pass through this path and remain completely unmodified.
 */
export function applyTransformedUnitForm(
  mech: MechActor,
  targetSpec: MechClassSpec,
  customization?: MechLoadoutCustomization
): void {
  const effSpec = mech.isProteusOrigin ? getProteusMorphSpec(targetSpec) : targetSpec;
  const stats = computeEffectiveMechStats(effSpec, customization);
  const paint =
    PAINT_SCHEMES.find((p) => p.id === customization?.paintId) ?? {
      id: 'replicated',
      name: effSpec.name,
      primary: effSpec.defaultColor,
      secondary: '#262b33',
      accent: effSpec.accentColor,
    };

  const armorRatio = Math.max(0.05, Math.min(1, mech.health.armor / Math.max(1, mech.health.maxArmor)));
  const chassisRatio = Math.max(0.05, Math.min(1, mech.health.chassis / Math.max(1, mech.health.maxChassis)));
  const engineRatio = Math.max(0.1, Math.min(1, mech.health.engine / Math.max(1, mech.health.maxEngine)));
  const sensorRatio = Math.max(0.1, Math.min(1, mech.health.sensors / Math.max(1, mech.health.maxSensors)));
  const weaponRatio = Math.max(0.1, Math.min(1, mech.health.weapons / Math.max(1, mech.health.maxWeapons)));
  const leftRatio = Math.max(0, Math.min(1, mech.health.leftLegs / Math.max(1, mech.health.maxLeftLegs)));
  const rightRatio = Math.max(0, Math.min(1, mech.health.rightLegs / Math.max(1, mech.health.maxRightLegs)));

  mech.classId = effSpec.id;
  mech.spec = effSpec;
  mech.stats = stats;
  mech.paint = paint;

  mech.physCfg = {
    mass: stats.mass,
    acceleration: stats.acceleration,
    maxSpeed: stats.maxSpeed,
    sprintMultiplier: effSpec.sprintMultiplier,
    reverseMultiplier: effSpec.reverseMultiplier,
    turnAccel: stats.turnAccel,
    maxTurnSpeed: stats.turnSpeed,
    lateralGrip: stats.lateralGrip,
    radius: effSpec.radius,
    suspensionStiffness: effSpec.suspensionStiffness,
    terrainPenaltyMult: stats.terrainPenaltyMult,
  };

  const primarySpec = {
    ...effSpec.primaryWeapon,
    damage: Math.round(effSpec.primaryWeapon.damage * stats.damageMult),
    fireRate: effSpec.primaryWeapon.fireRate * stats.fireRateMult,
    reloadTime: effSpec.primaryWeapon.reloadTime / stats.reloadMult,
    recoilImpulse: effSpec.primaryWeapon.recoilImpulse * stats.recoilMult,
    spreadRad: effSpec.primaryWeapon.spreadRad * stats.spreadMult,
  };
  const secondarySpec = {
    ...effSpec.secondaryWeapon,
    damage: Math.round(effSpec.secondaryWeapon.damage * stats.damageMult),
    fireRate: effSpec.secondaryWeapon.fireRate * stats.fireRateMult,
    reloadTime: effSpec.secondaryWeapon.reloadTime / stats.reloadMult,
    recoilImpulse: effSpec.secondaryWeapon.recoilImpulse * stats.recoilMult,
    spreadRad: effSpec.secondaryWeapon.spreadRad * stats.spreadMult,
  };

  mech.primary = createWeaponRuntime(primarySpec);
  mech.secondary = createWeaponRuntime(secondarySpec);
  mech.activeSlot = 1;

  const newHealth = createComponentHealth(stats.chassis, stats.armor, stats.legDurability);
  newHealth.armor = Math.max(0, Math.round(newHealth.maxArmor * armorRatio));
  newHealth.chassis = Math.max(1, Math.round(newHealth.maxChassis * chassisRatio));
  newHealth.engine = Math.max(1, Math.round(newHealth.maxEngine * engineRatio));
  newHealth.sensors = Math.max(1, Math.round(newHealth.maxSensors * sensorRatio));
  newHealth.weapons = Math.max(1, Math.round(newHealth.maxWeapons * weaponRatio));
  newHealth.leftLegs = Math.round(newHealth.maxLeftLegs * leftRatio);
  newHealth.rightLegs = Math.round(newHealth.maxRightLegs * rightRatio);
  mech.health = newHealth;

  mech.legs.syncMorphSpecs(effSpec.legs, mech.phys.pos, mech.phys.bodyAngle);
  mech.dash = new DashController(effSpec.id, customization);
  mech.antiAir = AntiAirController.forMechClass(effSpec.id, customization, mech.phys.aimAngle);
  mech.flight = effSpec.canFly ? createFlightState(false, 0) : undefined;
  mech.stealth = createStealthState(effSpec.id === 'assassin');
  mech.activeMortarAmmo = effSpec.id === 'colossus' ? 'he' : undefined;
  mech.mortarPitch = effSpec.id === 'colossus' ? 0.52 : 0;
  mech.gantryCycle = 0;
  mech.morphRig =
    mech.isProteusOrigin && isProteusMorphTargetId(effSpec.id)
      ? createMorphRigState(effSpec.id)
      : undefined;

  // Target unit's own tactical special ability starts ready to deploy after transformation!
  mech.specialActiveTimer = 0;
  mech.specialCooldownTimer = 0;
}
