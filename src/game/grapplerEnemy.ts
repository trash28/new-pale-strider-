import { AntiAirController } from './antiAirController';
import { createComponentHealth } from './combat';
import { GrappleTargetRegistry } from './grappleSystem';
import { MechActor } from './mech';
import { computeEffectiveMechStats } from './mechRoster';
import { hasLineOfSight } from './pathfinding';
import { createPhysicsState, normalizeAngle, resolveObstacleCollisions, shortestAngleDiff } from './physics';
import { LegAnimator } from './proceduralLegs';
import { LegMountSpec, MapDefinition, MechClassSpec, Obstacle, Vec2, WeaponKind } from './types';
import { createWeaponRuntime } from './weapons';

/**
 * Exact continuous damage-per-second inflicted by EACH living clinging grappler.
 */
export const GRAPPLER_CLING_DPS = 5;
export const GRAPPLER_GROUP_SIZE = 5;
export const GRAPPLER_MAX_SWING_SPEED = 820;
export const GRAPPLER_SPAWN_MIN_SEC = 10;
export const GRAPPLER_SPAWN_MAX_SEC = 15;
export const MAX_ACTIVE_GRAPPLERS = 15;

export function rollNextGrapplerSpawnInterval(rng = Math.random()): number {
  const clamped = Math.max(0, Math.min(1, rng));
  return GRAPPLER_SPAWN_MIN_SEC + clamped * (GRAPPLER_SPAWN_MAX_SEC - GRAPPLER_SPAWN_MIN_SEC);
}

export class GrapplerSpawnScheduler {
  public timerSec: number;

  constructor(initialIntervalSec?: number) {
    this.timerSec = initialIntervalSec ?? rollNextGrapplerSpawnInterval();
  }

  public reset(rng = Math.random()): void {
    this.timerSec = rollNextGrapplerSpawnInterval(rng);
  }

  public step(
    dt: number,
    activeGrapplerCount: number,
    canSpawnReinforcements: boolean,
    rng = Math.random()
  ): boolean {
    if (!canSpawnReinforcements) return false;
    this.timerSec -= dt;
    if (this.timerSec > 0) return false;
    this.timerSec = rollNextGrapplerSpawnInterval(rng);
    return activeGrapplerCount < MAX_ACTIVE_GRAPPLERS;
  }
}

export type GrapplerMode = 'scuttle' | 'hook_deploy' | 'swinging' | 'air_launch' | 'clinging';
export type GrapplerHuntPhase = 'approach' | 'circle' | 'dive' | 'cling';
export type GrapplerApproachStyle = 'direct' | 'weave' | 'flank';

export interface GrapplerEnemyState {
  groupId: string;
  groupIndex: number;
  flankSign: 1 | -1;
  mode: GrapplerMode;
  huntPhase: GrapplerHuntPhase;
  approachStyle: GrapplerApproachStyle;
  decisionTimer: number;
  weavePhase: number;
  weaveFreq: number;
  jukeBias: number;
  jukeTimer: number;
  anchorJitterSeed: number;
  circleTimer: number;
  minCircleDuration: number;
  circleSwingsCompleted: number;
  diveTimer: number;
  orbitRadius: number;
  hookAnchor: Vec2 | null;
  hookTip: Vec2;
  hookObstacleId: string | null;
  lastHookObstacleId: string | null;
  ropeLength: number;
  tension: number;
  deployProgress: number;
  swingTimer: number;
  swingTangentSign: 1 | -1;
  airborne: boolean;
  altitude: number;
  swingMomentumTimer: number;
  hookCooldown: number;
  clingCooldown: number;
  screamCooldown: number;
  eatAudioCooldown: number;
  attachedTargetId: string | null;
  attachLocalAngle: number;
  attachLocalDist: number;
  strugglePhase: number;
  deflectFlashTimer: number;
  deflectTextCooldown: number;
  struggleAudioCooldown: number;
  stuckTimer: number;
  lastProgressPos: Vec2;
  clawOpenAmount: number;
}

export interface GrapplerStepEvents {
  launchedHook: boolean;
  latchedStructure: boolean;
  releasedHook: boolean;
  propulsionBurst: boolean;
  clampedTarget: boolean;
  struggleTick: boolean;
  diveScream: boolean;
  feedBite: boolean;
}

// Proportions scaled cleanly for smaller radius=10 chassis while keeping two-bone IK strictly within [8px, maxReach]
const GRAPPLER_LEGS: LegMountSpec[] = [
  // Forward scythe-grip forelimbs (rest reach = hypot(8, -6) = 10.0px, maxReach = 18.24px)
  { side: 'left', attachX: 5, attachY: -5.5, restX: 13, restY: -11.5, femurLength: 9.0, tibiaLength: 10.0, bendSign: -1, gaitGroup: 0 },
  { side: 'right', attachX: 5, attachY: 5.5, restX: 13, restY: 11.5, femurLength: 9.0, tibiaLength: 10.0, bendSign: 1, gaitGroup: 1 },
  // Mid high-tension anchor legs (rest reach = 9.5px, maxReach = 19.2px)
  { side: 'left', attachX: 0, attachY: -6, restX: 0, restY: -15.5, femurLength: 9.5, tibiaLength: 10.5, bendSign: -1, gaitGroup: 1 },
  { side: 'right', attachX: 0, attachY: 6, restX: 0, restY: 15.5, femurLength: 9.5, tibiaLength: 10.5, bendSign: 1, gaitGroup: 0 },
  // Rear thruster-braced spring legs (rest reach = hypot(-7, -6) = 9.22px, maxReach = 18.72px)
  { side: 'left', attachX: -5.5, attachY: -5, restX: -12.5, restY: -11, femurLength: 9.0, tibiaLength: 10.5, bendSign: -1, gaitGroup: 0 },
  { side: 'right', attachX: -5.5, attachY: 5, restX: -12.5, restY: 11, femurLength: 9.0, tibiaLength: 10.5, bendSign: 1, gaitGroup: 1 },
];

export const GRAPPLER_CHASSIS_SPEC: MechClassSpec = {
  id: 'recon',
  code: 'RP-05',
  name: 'Raptis-05 Grappler',
  role: 'Aerial Parasite / Swinging Interceptor',
  description: 'Compact high-velocity grappling parasite that circles prey at extreme speed before diving to latch.',
  unlockCost: 0,
  mass: 8,
  baseArmor: 24,
  baseChassis: 95,
  legDurability: 72,
  maxSpeed: 345,
  sprintMultiplier: 1.55,
  reverseMultiplier: 0.94,
  acceleration: 1980,
  turnAccel: 26,
  maxTurnSpeed: 9.4,
  lateralGrip: 9.8,
  suspensionStiffness: 1.55,
  sensorRange: 980,
  radius: 10,
  strideLength: 17,
  stepHeight: 5,
  stepSpeed: 13.5,
  footstepWeight: 0.24,
  defaultColor: '#26232d',
  accentColor: '#f43f5e',
  silhouette: 'wedge',
  canGrapple: true,
  legs: GRAPPLER_LEGS,
  primaryWeapon: {
    id: 'grappler_ripper',
    name: 'Mantis Ripper Claw-Spitter',
    kind: 'machinegun',
    damage: 7,
    fireRate: 3.4,
    projectileSpeed: 640,
    range: 195,
    magazineSize: 28,
    reloadTime: 1.4,
    spreadRad: 0.08,
    recoilImpulse: 4,
    recoilTorque: 0.1,
    recoilSpreadGain: 0.01,
    stabilityCost: 0.02,
    prepTime: 0,
    requiresBrace: false,
    barrelOffsetY: 0,
    chargeTime: 0,
    homingTurnRate: 0,
    splashRadius: 0,
    piercing: false,
    caliber: 2.0,
    barrelLength: 7,
    burstCount: 1,
  },
  secondaryWeapon: {
    id: 'grappler_tether_pod',
    name: 'Barbed Tether Pod',
    kind: 'autocannon',
    damage: 10,
    fireRate: 1.2,
    projectileSpeed: 620,
    range: 240,
    magazineSize: 8,
    reloadTime: 1.8,
    spreadRad: 0.06,
    recoilImpulse: 5,
    recoilTorque: 0.12,
    recoilSpreadGain: 0.01,
    stabilityCost: 0.03,
    prepTime: 0,
    requiresBrace: false,
    barrelOffsetY: 0,
    chargeTime: 0,
    homingTurnRate: 0,
    splashRadius: 0,
    piercing: false,
    caliber: 2.2,
    barrelLength: 7,
    burstCount: 1,
  },
  specialAbility: {
    name: 'Parasite Latch',
    kind: 'overdrive',
    cooldown: 5,
    duration: 2.5,
    description: 'Vector thruster grapple latch.',
  },
};

function pickApproachStyle(r = Math.random()): GrapplerApproachStyle {
  if (r < 0.45) return 'direct';
  if (r < 0.80) return 'weave';
  return 'flank';
}

export function createGrapplerEnemyUnit(params: {
  id: string;
  groupId: string;
  groupIndex: number;
  x: number;
  y: number;
  difficultyMult?: number;
  angle?: number;
}): MechActor {
  const diff = params.difficultyMult ?? 1.0;
  const spec = GRAPPLER_CHASSIS_SPEC;
  const stats = computeEffectiveMechStats(spec);
  const hp = Math.round(spec.baseChassis * diff);
  const armor = Math.round(spec.baseArmor * diff);
  const legDur = Math.round(spec.legDurability * diff);
  const ang = params.angle ?? Math.PI;
  const flankSign: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const initialStyle = pickApproachStyle((params.groupIndex * 0.23 + Math.random() * 0.77) % 1);

  const grapplerState: GrapplerEnemyState = {
    groupId: params.groupId,
    groupIndex: params.groupIndex,
    flankSign,
    mode: 'scuttle',
    huntPhase: 'approach',
    approachStyle: initialStyle,
    decisionTimer: 0.55 + Math.random() * 0.95,
    weavePhase: Math.random() * Math.PI * 2,
    weaveFreq: 1.9 + Math.random() * 1.5,
    jukeBias: (Math.random() - 0.5) * 0.42,
    jukeTimer: 0.35 + Math.random() * 0.55,
    anchorJitterSeed: Math.floor(Math.random() * 1000),
    circleTimer: 0,
    minCircleDuration: initialStyle === 'direct' ? 0.35 + Math.random() * 0.35 : 0.65 + Math.random() * 0.65,
    circleSwingsCompleted: 0,
    diveTimer: 0,
    orbitRadius: 145 + Math.random() * 75,
    hookAnchor: null,
    hookTip: { x: params.x, y: params.y },
    hookObstacleId: null,
    lastHookObstacleId: null,
    ropeLength: 0,
    tension: 0,
    deployProgress: 0,
    swingTimer: 0,
    swingTangentSign: flankSign,
    airborne: false,
    altitude: 0,
    swingMomentumTimer: 0,
    hookCooldown: 0.05 + Math.random() * 0.22,
    clingCooldown: 0,
    screamCooldown: 0.15 + params.groupIndex * 0.22,
    eatAudioCooldown: 0,
    attachedTargetId: null,
    attachLocalAngle: ((params.groupIndex % 5) / 5) * Math.PI * 2,
    attachLocalDist: 16,
    strugglePhase: params.groupIndex * 1.25,
    deflectFlashTimer: 0,
    deflectTextCooldown: 0,
    struggleAudioCooldown: 0,
    stuckTimer: 0,
    lastProgressPos: { x: params.x, y: params.y },
    clawOpenAmount: 0.42,
  };

  return {
    id: params.id,
    callsign: `Raptis-${params.groupIndex + 1}`,
    team: 'enemy',
    isPlayer: false,
    classId: 'recon',
    enemyArchetype: 'grappler',
    spec,
    stats,
    physCfg: {
      mass: spec.mass,
      acceleration: spec.acceleration,
      maxSpeed: spec.maxSpeed,
      sprintMultiplier: spec.sprintMultiplier,
      reverseMultiplier: spec.reverseMultiplier,
      turnAccel: spec.turnAccel,
      maxTurnSpeed: spec.maxTurnSpeed,
      lateralGrip: spec.lateralGrip,
      radius: spec.radius,
      suspensionStiffness: spec.suspensionStiffness,
      terrainPenaltyMult: 0.4,
    },
    phys: createPhysicsState(params.x, params.y, ang),
    legs: new LegAnimator(spec.legs, { x: params.x, y: params.y }, ang),
    health: createComponentHealth(hp, armor, legDur),
    primary: createWeaponRuntime(spec.primaryWeapon),
    secondary: createWeaponRuntime(spec.secondaryWeapon),
    activeSlot: 1,
    paint: {
      id: 'enemy_grappler',
      name: 'Raptis-05 Grappler',
      primary: spec.defaultColor,
      secondary: '#17151c',
      accent: spec.accentColor,
    },
    specialActiveTimer: 0,
    specialCooldownTimer: 0,
    transformCooldownTimer: 0,
    hitFlashTimer: 0,
    alive: true,
    koTimer: 0,
    detected: false,
    jammedTimer: 0,
    aiState: 'flank',
    aiTimer: Math.random() * 0.8,
    aiPath: [],
    aiPathTimer: 0,
    lastKnownTargetPos: null,
    targetId: null,
    windupTimer: 0,
    windupTargetPos: null,
    squadOrder: 'attack_target',
    defendPos: null,
    formationSlot: params.groupIndex,
    personality: 'aggressive',
    antiAir: AntiAirController.forMechClass('recon', undefined, ang),
    grapplerState,
  };
}

/**
 * Selects an obstacle-free medium-range flanking anchor (~490-690px from the player/squad)
 * so Grapplers arrive promptly by grapple-swinging rather than spawning across empty edges
 * or directly on top of the squad.
 */
export function pickGrapplerApproachAnchor(params: {
  playerPos: Vec2;
  friendlies?: readonly Vec2[];
  mapWidth: number;
  mapHeight: number;
  obstacles: Obstacle[];
  seedIndex?: number;
}): Vec2 {
  const { playerPos, mapWidth, mapHeight, obstacles } = params;
  const friendlies = params.friendlies && params.friendlies.length > 0 ? params.friendlies : [playerPos];
  const seed = params.seedIndex ?? 0;

  let bestPos: Vec2 = {
    x: Math.max(130, Math.min(mapWidth - 130, playerPos.x + 560)),
    y: Math.max(130, Math.min(mapHeight - 130, playerPos.y)),
  };
  let bestScore = -1e9;

  for (let i = 0; i < 16; i++) {
    const ang = ((i + seed * 3) / 16) * Math.PI * 2;
    const dist = 500 + (i % 3) * 75;
    const cand: Vec2 = {
      x: Math.max(135, Math.min(mapWidth - 135, playerPos.x + Math.cos(ang) * dist)),
      y: Math.max(135, Math.min(mapHeight - 135, playerPos.y + Math.sin(ang) * dist)),
    };
    resolveObstacleCollisions(cand, { x: 0, y: 0 }, 24, obstacles, mapWidth, mapHeight);

    const distPlayer = Math.hypot(cand.x - playerPos.x, cand.y - playerPos.y);
    if (distPlayer < 410 || distPlayer > 820) continue;

    let minFriendlyDist = distPlayer;
    for (let f = 0; f < friendlies.length; f++) {
      const fd = Math.hypot(cand.x - friendlies[f].x, cand.y - friendlies[f].y);
      if (fd < minFriendlyDist) minFriendlyDist = fd;
    }
    if (minFriendlyDist < 360) continue;

    // Reward candidates near grappleable terrain structures so pack can chain swings immediately
    let nearbyGrapples = 0;
    for (let o = 0; o < obstacles.length; o++) {
      const obs = obstacles[o];
      if (!GrappleTargetRegistry.isObstacleGrappleable(obs)) continue;
      const od = Math.hypot(obs.x - cand.x, obs.y - cand.y);
      if (od >= 90 && od <= 520) nearbyGrapples++;
    }

    // Prefer forward/diagonal flank angles (in front of default rightward spawn orientation)
    const forwardBias = Math.cos(ang) * 45;
    const idealDistScore = -Math.abs(distPlayer - 560) * 0.45;
    const score = idealDistScore + Math.min(4, nearbyGrapples) * 65 + forwardBias;
    if (score > bestScore) {
      bestScore = score;
      bestPos = cand;
    }
  }

  return bestPos;
}

/**
 * Spawns a coordinated group of EXACTLY 5 grappling enemies distributed cleanly
 * across distinct flank approaches / grappleable cover positions without stacking or clipping.
 */
export function createGrapplerGroup(params: {
  groupId: string;
  baseSpawnIndex: number;
  anchorPos: Vec2;
  mapWidth: number;
  mapHeight: number;
  obstacles: Obstacle[];
  difficultyMult?: number;
  playerPos?: Vec2;
}): MechActor[] {
  const units: MechActor[] = [];
  const baseAngle = params.playerPos
    ? Math.atan2(params.anchorPos.y - params.playerPos.y, params.anchorPos.x - params.playerPos.x)
    : 0;

  for (let i = 0; i < GRAPPLER_GROUP_SIZE; i++) {
    // Spread 5 units across wide tactical fan (never stacked on a single point)
    const spreadAng = baseAngle + (i - 2) * 0.56;
    const radialOffset = 78 + (i % 2) * 48;
    let sx = params.anchorPos.x + Math.cos(spreadAng) * radialOffset;
    let sy = params.anchorPos.y + Math.sin(spreadAng) * radialOffset;
    sx = Math.max(70, Math.min(params.mapWidth - 70, sx));
    sy = Math.max(70, Math.min(params.mapHeight - 70, sy));

    const unit = createGrapplerEnemyUnit({
      id: `grappler_${params.baseSpawnIndex + i}`,
      groupId: params.groupId,
      groupIndex: i,
      x: sx,
      y: sy,
      difficultyMult: params.difficultyMult,
      angle: params.playerPos ? Math.atan2(params.playerPos.y - sy, params.playerPos.x - sx) : Math.PI,
    });

    resolveObstacleCollisions(
      unit.phys.pos,
      unit.phys.vel,
      unit.spec.radius + 4,
      params.obstacles,
      params.mapWidth,
      params.mapHeight
    );

    // Ensure non-overlapping minimum separation from already placed pack members
    for (let j = 0; j < units.length; j++) {
      const prev = units[j];
      const dx = unit.phys.pos.x - prev.phys.pos.x;
      const dy = unit.phys.pos.y - prev.phys.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 62) {
        const pushAng = d > 0.1 ? Math.atan2(dy, dx) : i * 1.25;
        unit.phys.pos.x = Math.max(70, Math.min(params.mapWidth - 70, prev.phys.pos.x + Math.cos(pushAng) * 72));
        unit.phys.pos.y = Math.max(70, Math.min(params.mapHeight - 70, prev.phys.pos.y + Math.sin(pushAng) * 72));
        resolveObstacleCollisions(
          unit.phys.pos,
          unit.phys.vel,
          unit.spec.radius + 4,
          params.obstacles,
          params.mapWidth,
          params.mapHeight
        );
      }
    }

    unit.legs.reset(unit.spec.legs, unit.phys.pos, unit.phys.bodyAngle);
    if (unit.grapplerState) {
      unit.grapplerState.lastProgressPos = { ...unit.phys.pos };
      unit.grapplerState.hookTip = { ...unit.phys.pos };
    }
    units.push(unit);
  }

  return units;
}

/**
 * Bullet Immunity Rule:
 * Unattached grappling enemies deflect standard bullets/projectiles cleanly,
 * whereas attached grapplers (or AoE/explosions/EMP) expose their chassis and take full damage.
 */
export function isGrapplerImmuneToProjectile(
  target: Pick<MechActor, 'enemyArchetype' | 'alive' | 'grapplerState'>,
  weaponKind: WeaponKind,
  splashRadius = 0
): boolean {
  if (!target.alive || target.enemyArchetype !== 'grappler') return false;
  const gs = target.grapplerState;
  if (gs?.attachedTargetId) {
    return false;
  }
  if (splashRadius > 0) return false;
  if (weaponKind === 'ewar_pulse') return false;
  return weaponKind === 'autocannon' || weaponKind === 'machinegun' || weaponKind === 'railgun';
}

/**
 * Computes stacking speed multiplier for a mech with N living grapplers attached.
 * Immediately returns 1.0 when attachedCount === 0 (zero residual slow).
 */
export function computeGrapplerSlowMultiplier(attachedCount: number): number {
  if (attachedCount <= 0) return 1.0;
  if (attachedCount === 1) return 0.62;
  if (attachedCount === 2) return 0.42;
  if (attachedCount === 3) return 0.30;
  return 0.24;
}

export function countAttachedGrapplersForUnit(unitId: string, enemies: readonly MechActor[]): number {
  let count = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive && e.enemyArchetype === 'grappler' && e.grapplerState?.attachedTargetId === unitId) {
      count++;
    }
  }
  return count;
}

export function detachGrappler(enemy: MechActor, clingCooldown = 1.4): void {
  const gs = enemy.grapplerState;
  if (!gs) return;
  gs.attachedTargetId = null;
  gs.mode = 'scuttle';
  gs.huntPhase = 'approach';
  gs.approachStyle = pickApproachStyle();
  gs.decisionTimer = 0.55 + Math.random() * 0.75;
  gs.jukeBias = (Math.random() - 0.5) * 0.42;
  gs.circleTimer = 0;
  gs.circleSwingsCompleted = 0;
  gs.minCircleDuration = 0.55 + Math.random() * 0.65;
  gs.hookAnchor = null;
  gs.hookObstacleId = null;
  gs.tension = 0;
  gs.airborne = false;
  gs.altitude = 0;
  gs.clingCooldown = Math.max(gs.clingCooldown, clingCooldown);
}

/**
 * Keeps clinging grapplers locked in exact sync with their host's position, rotation, and altitude.
 */
export function syncClingingGrapplers(
  enemies: MechActor[],
  potentialHosts: readonly MechActor[]
): void {
  const hostMap = new Map<string, MechActor>();
  for (let i = 0; i < potentialHosts.length; i++) {
    hostMap.set(potentialHosts[i].id, potentialHosts[i]);
  }

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const gs = e.grapplerState;
    if (!gs || e.enemyArchetype !== 'grappler') continue;
    if (!e.alive) {
      gs.attachedTargetId = null;
      gs.hookAnchor = null;
      gs.airborne = false;
      gs.altitude = 0;
      continue;
    }
    if (!gs.attachedTargetId) continue;

    const host = hostMap.get(gs.attachedTargetId);
    if (!host || !host.alive || host.downed) {
      detachGrappler(e, 0.8);
      continue;
    }

    const worldAng = host.phys.bodyAngle + gs.attachLocalAngle;
    const dist = host.spec.radius + 5;
    e.phys.pos.x = host.phys.pos.x + Math.cos(worldAng) * dist;
    e.phys.pos.y = host.phys.pos.y + Math.sin(worldAng) * dist;
    e.phys.vel.x = host.phys.vel.x;
    e.phys.vel.y = host.phys.vel.y;
    const inwardAng = Math.atan2(host.phys.pos.y - e.phys.pos.y, host.phys.pos.x - e.phys.pos.x);
    e.phys.bodyAngle = inwardAng;
    e.phys.aimAngle = inwardAng;
    gs.altitude = Math.max(9, (host.flight?.altitude ?? 0) + 9);
    gs.airborne = gs.altitude > 4;
    gs.hookAnchor = { x: host.phys.pos.x, y: host.phys.pos.y };
    gs.hookTip = { x: host.phys.pos.x, y: host.phys.pos.y };
    gs.tension = 0.85 + Math.sin(gs.strugglePhase * 3.1) * 0.15;
    e.legs.reset(e.spec.legs, e.phys.pos, e.phys.bodyAngle);
  }
}

function computeDesiredGrapplerMove(
  dirToTgtX: number,
  dirToTgtY: number,
  gs: GrapplerEnemyState
): { wishX: number; wishY: number; wantsStraight: boolean } {
  const perpX = -dirToTgtY * gs.flankSign;
  const perpY = dirToTgtX * gs.flankSign;

  if (gs.huntPhase === 'dive' || gs.approachStyle === 'direct') {
    // Going straight toward target: only subtle human-like micro-adjustments, never circling
    const subtleLat = gs.jukeBias * 0.18 + Math.sin(gs.weavePhase) * 0.08;
    const rawX = dirToTgtX + perpX * subtleLat;
    const rawY = dirToTgtY + perpY * subtleLat;
    const len = Math.hypot(rawX, rawY) || 1;
    return { wishX: rawX / len, wishY: rawY / len, wantsStraight: true };
  }

  if (gs.approachStyle === 'weave') {
    // Organic S-curve slalom closing forward toward target
    const weaveAmt = Math.sin(gs.weavePhase) * 0.36 + gs.jukeBias * 0.24;
    const rawX = dirToTgtX * 0.90 + perpX * weaveAmt;
    const rawY = dirToTgtY * 0.90 + perpY * weaveAmt;
    const len = Math.hypot(rawX, rawY) || 1;
    return {
      wishX: rawX / len,
      wishY: rawY / len,
      wantsStraight: Math.abs(weaveAmt) < 0.22,
    };
  }

  // Brief diagonal flank cut (still pushes inward toward target, never endless circular orbit)
  const flankAmt = 0.56 + gs.jukeBias * 0.22;
  const rawX = dirToTgtX * 0.76 + perpX * flankAmt;
  const rawY = dirToTgtY * 0.76 + perpY * flankAmt;
  const len = Math.hypot(rawX, rawY) || 1;
  return { wishX: rawX / len, wishY: rawY / len, wantsStraight: false };
}

function findGrappleSwingAnchor(
  selfPos: Vec2,
  selfVel: Vec2,
  targetPos: Vec2,
  wishDir: Vec2,
  wantsStraight: boolean,
  obstacles: Obstacle[],
  huntPhase: GrapplerHuntPhase,
  lastHookObstacleId: string | null,
  jitterSeed: number
): { obstacleId: string; x: number; y: number; ropeLength: number } | null {
  const dirToTgtX = targetPos.x - selfPos.x;
  const dirToTgtY = targetPos.y - selfPos.y;
  const distToTgt = Math.hypot(dirToTgtX, dirToTgtY) || 1;
  const fwdX = dirToTgtX / distToTgt;
  const fwdY = dirToTgtY / distToTgt;

  const spd = Math.hypot(selfVel.x, selfVel.y);
  const velX = spd > 20 ? selfVel.x / spd : wishDir.x;
  const velY = spd > 20 ? selfVel.y / spd : wishDir.y;

  let best: { obstacleId: string; x: number; y: number; ropeLength: number } | null = null;
  let bestScore = -1e9;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (!GrappleTargetRegistry.isObstacleGrappleable(obs)) continue;

    // Exterior surface point facing the grappler
    const hw = obs.w * 0.5;
    const hh = obs.h * 0.5;
    const dx = selfPos.x - obs.x;
    const dy = selfPos.y - obs.y;
    let ax = Math.max(obs.x - hw, Math.min(selfPos.x, obs.x + hw));
    let ay = Math.max(obs.y - hh, Math.min(selfPos.y, obs.y + hh));
    if (Math.abs(ax - obs.x) < hw * 0.85 && Math.abs(ay - obs.y) < hh * 0.85) {
      if (Math.abs(dx / Math.max(1, hw)) > Math.abs(dy / Math.max(1, hh))) {
        ax = obs.x + Math.sign(dx || 1) * hw;
      } else {
        ay = obs.y + Math.sign(dy || 1) * hh;
      }
    }

    const odx = ax - selfPos.x;
    const ody = ay - selfPos.y;
    const dist = Math.hypot(odx, ody);
    if (dist < 64 || dist > 640) continue;

    const nx = odx / dist;
    const ny = ody / dist;
    const checkEnd = { x: ax - nx * 10, y: ay - ny * 10 };
    if (!hasLineOfSight(selfPos, checkEnd, obstacles)) continue;

    const forwardDot = nx * fwdX + ny * fwdY;
    const wishDot = nx * wishDir.x + ny * wishDir.y;
    const velAlign = nx * velX + ny * velY;
    const obsDistToTarget = Math.hypot(ax - targetPos.x, ay - targetPos.y);
    const repeatPenalty = obs.id === lastHookObstacleId ? 240 : 0;
    const humanVariance = (((Math.round(obs.x) * 17 + Math.round(obs.y) * 31 + jitterSeed) % 100) / 100) * 36;

    let score = 0;
    if (wantsStraight || huntPhase === 'dive') {
      // Going straight: only hook forward anchors along the approach corridor so we zip forward cleanly
      if (wishDot < 0.28) continue;
      // Avoid hooking an anchor much farther away than the target itself
      if (dist > distToTgt + 140) continue;
      score =
        wishDot * 340 +
        forwardDot * 160 +
        velAlign * 105 -
        Math.abs(dist - Math.min(280, distToTgt * 0.72)) * 0.25 -
        obsDistToTarget * 0.22 +
        humanVariance -
        repeatPenalty;
    } else {
      // Weaving / diagonal flank adjustment: prefer forward-angled anchors along wishDir, never circling behind
      if (wishDot < 0.02 && forwardDot < 0.02) continue;
      score =
        wishDot * 255 +
        forwardDot * 125 +
        velAlign * 135 -
        Math.abs(dist - 250) * 0.24 -
        obsDistToTarget * 0.14 +
        humanVariance -
        repeatPenalty;
    }

    if (score > bestScore) {
      bestScore = score;
      best = { obstacleId: obs.id, x: ax, y: ay, ropeLength: dist };
    }
  }
  return best;
}

/**
 * Moves position with sub-stepped obstacle collision resolution so compact high-velocity
 * Grapplers (radius=10, up to 820px/s) never tunnel or clip into geometry.
 */
function integrateSubsteppedMotion(
  pos: Vec2,
  vel: Vec2,
  radius: number,
  obstacles: Obstacle[],
  mapWidth: number,
  mapHeight: number,
  dt: number
): void {
  const travel = Math.hypot(vel.x * dt, vel.y * dt);
  const maxStep = Math.max(4, radius * 0.6);
  const steps = Math.max(1, Math.min(6, Math.ceil(travel / maxStep)));
  const subDt = dt / steps;
  for (let s = 0; s < steps; s++) {
    pos.x += vel.x * subDt;
    pos.y += vel.y * subDt;
    resolveObstacleCollisions(pos, vel, radius, obstacles, mapWidth, mapHeight);
  }
}

/**
 * Steps a single AoT-style high-mobility grappling enemy:
 * - Multi-swing circling & hunting around squadmates via true pendulum physics
 * - Rapid mid-air grapple chaining & momentum carry
 * - Screaming dive strikes & feeding/eating drain once clamped
 */
export function stepGrapplerEnemyAI(
  enemy: MechActor,
  friendlies: readonly MechActor[],
  allEnemies: readonly MechActor[],
  map: MapDefinition,
  dt: number
): GrapplerStepEvents {
  const events: GrapplerStepEvents = {
    launchedHook: false,
    latchedStructure: false,
    releasedHook: false,
    propulsionBurst: false,
    clampedTarget: false,
    struggleTick: false,
    diveScream: false,
    feedBite: false,
  };

  const gs = enemy.grapplerState;
  if (!gs || !enemy.alive) return events;

  if (gs.deflectFlashTimer > 0) gs.deflectFlashTimer = Math.max(0, gs.deflectFlashTimer - dt);
  if (gs.deflectTextCooldown > 0) gs.deflectTextCooldown = Math.max(0, gs.deflectTextCooldown - dt);
  if (gs.hookCooldown > 0) gs.hookCooldown = Math.max(0, gs.hookCooldown - dt);
  if (gs.clingCooldown > 0) gs.clingCooldown = Math.max(0, gs.clingCooldown - dt);
  if (gs.swingMomentumTimer > 0) gs.swingMomentumTimer = Math.max(0, gs.swingMomentumTimer - dt);
  if (gs.struggleAudioCooldown > 0) gs.struggleAudioCooldown = Math.max(0, gs.struggleAudioCooldown - dt);
  if (gs.screamCooldown > 0) gs.screamCooldown = Math.max(0, gs.screamCooldown - dt);
  if (gs.eatAudioCooldown > 0) gs.eatAudioCooldown = Math.max(0, gs.eatAudioCooldown - dt);

  // If currently clinging to a living target, drive struggling/feeding audio & sync
  if (gs.mode === 'clinging' && gs.attachedTargetId) {
    const host = friendlies.find((f) => f.id === gs.attachedTargetId && f.alive && !f.downed);
    if (!host) {
      detachGrappler(enemy, 0.7);
    } else {
      gs.huntPhase = 'cling';
      gs.strugglePhase += dt * 13.5;
      gs.clawOpenAmount = 0.06 + Math.abs(Math.sin(gs.strugglePhase)) * 0.28;
      if (gs.struggleAudioCooldown <= 0) {
        gs.struggleAudioCooldown = 1.35 + Math.random() * 0.65;
        events.struggleTick = true;
      }
      if (gs.eatAudioCooldown <= 0) {
        gs.eatAudioCooldown = 1.55 + Math.random() * 0.85;
        events.feedBite = true;
      }
      return events;
    }
  }

  // Coordinated Target Selection: distribute group members across alive targets so pack flanks multiple angles
  const aliveTargets = friendlies.filter((f) => f.alive && !f.downed);
  if (aliveTargets.length === 0) {
    enemy.phys.vel.x *= Math.exp(-4 * dt);
    enemy.phys.vel.y *= Math.exp(-4 * dt);
    return events;
  }

  const groupTargetLoads = new Map<string, number>();
  for (let i = 0; i < allEnemies.length; i++) {
    const o = allEnemies[i];
    if (o === enemy || !o.alive || o.enemyArchetype !== 'grappler') continue;
    const ogs = o.grapplerState;
    if (!ogs || ogs.groupId !== gs.groupId) continue;
    const claimId = ogs.attachedTargetId ?? o.targetId;
    if (claimId) {
      groupTargetLoads.set(claimId, (groupTargetLoads.get(claimId) ?? 0) + 1);
    }
  }

  let target: MechActor = aliveTargets[0];
  let bestTargetScore = -1e9;
  for (let i = 0; i < aliveTargets.length; i++) {
    const f = aliveTargets[i];
    const d = Math.hypot(f.phys.pos.x - enemy.phys.pos.x, f.phys.pos.y - enemy.phys.pos.y);
    const load = groupTargetLoads.get(f.id) ?? 0;
    const attachedOnF = countAttachedGrapplersForUnit(f.id, allEnemies);
    let score = -d * 0.58 - load * 310 - attachedOnF * 240;
    if (f.isPlayer && load < 2) score += 170;
    if (score > bestTargetScore) {
      bestTargetScore = score;
      target = f;
    }
  }
  enemy.targetId = target.id;
  enemy.lastKnownTargetPos = { ...target.phys.pos };

  const dx = target.phys.pos.x - enemy.phys.pos.x;
  const dy = target.phys.pos.y - enemy.phys.pos.y;
  const distToTarget = Math.hypot(dx, dy) || 1;
  const dirToTgtX = dx / distToTarget;
  const dirToTgtY = dy / distToTarget;
  const orbitTangX = -dirToTgtY * gs.flankSign;
  const orbitTangY = dirToTgtX * gs.flankSign;

  // Human-like organic micro-adjustments & randomized cadence updates
  gs.weavePhase += gs.weaveFreq * dt;
  gs.jukeTimer -= dt;
  if (gs.jukeTimer <= 0) {
    gs.jukeTimer = 0.32 + Math.random() * 0.62;
    gs.jukeBias = (Math.random() - 0.5) * 0.46;
  }
  gs.decisionTimer -= dt;
  if (gs.decisionTimer <= 0 && gs.huntPhase !== 'dive') {
    gs.decisionTimer = 0.65 + Math.random() * 1.15;
    if (Math.random() < 0.36) {
      gs.flankSign = gs.flankSign === 1 ? -1 : 1;
    }
    gs.approachStyle = pickApproachStyle();
  }

  const hasClearTargetLos = hasLineOfSight(enemy.phys.pos, target.phys.pos, map.obstacles);
  const { wishX, wishY, wantsStraight } = computeDesiredGrapplerMove(dirToTgtX, dirToTgtY, gs);

  // Hunt Phase Transitions: close distance naturally (straight rush or brief weave/flank) then commit to dive
  if (gs.huntPhase === 'approach' || gs.huntPhase === 'circle') {
    gs.circleTimer += dt;
    const readyDirect =
      gs.approachStyle === 'direct' && gs.circleTimer >= gs.minCircleDuration && hasClearTargetLos && distToTarget <= 540;
    const readyByTime = gs.circleTimer >= gs.minCircleDuration + 0.55 && distToTarget <= 620;
    const readyBySwing = gs.circleSwingsCompleted >= 1 && gs.circleTimer >= gs.minCircleDuration && distToTarget <= 580;
    if (readyDirect || readyByTime || readyBySwing) {
      gs.huntPhase = 'dive';
      gs.diveTimer = 0;
      gs.clawOpenAmount = 0.96;
      if (gs.screamCooldown <= 0) {
        gs.screamCooldown = 2.4;
        events.diveScream = true;
      }
    }
  } else if (gs.huntPhase === 'dive') {
    gs.diveTimer += dt;
    if (gs.screamCooldown <= 0 && distToTarget < 420 && distToTarget > 125) {
      gs.screamCooldown = 2.6;
      events.diveScream = true;
    }
    // If dive misses/overshoots cleanly for too long, reset with randomized style + small juke
    if (gs.diveTimer > 3.2 && distToTarget > 190) {
      gs.huntPhase = 'approach';
      gs.approachStyle = pickApproachStyle();
      gs.circleTimer = 0;
      gs.circleSwingsCompleted = 0;
      gs.minCircleDuration = 0.45 + Math.random() * 0.55;
      gs.flankSign = Math.random() < 0.5 ? 1 : -1;
    }
  }

  // Attempt direct grapple-cling attack once dive aligns with clear LOS
  if (
    gs.huntPhase === 'dive' &&
    gs.clingCooldown <= 0 &&
    distToTarget <= 122 &&
    hasClearTargetLos
  ) {
    const alreadyOnHost = countAttachedGrapplersForUnit(target.id, allEnemies);
    gs.mode = 'clinging';
    gs.huntPhase = 'cling';
    gs.attachedTargetId = target.id;
    gs.attachLocalAngle = (alreadyOnHost * 2.15 + gs.groupIndex * 1.1) % (Math.PI * 2);
    gs.attachLocalDist = target.spec.radius + 5;
    gs.hookAnchor = { ...target.phys.pos };
    gs.hookTip = { ...target.phys.pos };
    gs.hookObstacleId = null;
    gs.airborne = true;
    gs.altitude = Math.max(9, (target.flight?.altitude ?? 0) + 9);
    gs.clawOpenAmount = 0.1;
    gs.eatAudioCooldown = 0.8;
    events.clampedTarget = true;
    events.feedBite = true;
    syncClingingGrapplers([enemy], friendlies);
    return events;
  }

  // Stuck detection & automatic release / lateral thruster hop
  const moved = Math.hypot(enemy.phys.pos.x - gs.lastProgressPos.x, enemy.phys.pos.y - gs.lastProgressPos.y);
  if (moved < 24 * dt && distToTarget > 85) {
    gs.stuckTimer += dt;
    if (gs.stuckTimer > 0.55) {
      gs.stuckTimer = 0;
      gs.flankSign = gs.flankSign === 1 ? -1 : 1;
      if (gs.mode === 'swinging' || gs.mode === 'hook_deploy') {
        gs.mode = 'air_launch';
        gs.hookAnchor = null;
        gs.hookObstacleId = null;
        gs.swingMomentumTimer = 0.7;
        events.releasedHook = true;
      }
      enemy.phys.vel.x += orbitTangX * 260 + dirToTgtX * 220;
      enemy.phys.vel.y += orbitTangY * 260 + dirToTgtY * 220;
      gs.altitude = Math.max(gs.altitude, 18);
      gs.airborne = true;
      events.propulsionBurst = true;
    }
  } else {
    gs.stuckTimer = Math.max(0, gs.stuckTimer - dt * 2.5);
  }
  gs.lastProgressPos = { ...enemy.phys.pos };

  // Environmental Grapple Chaining State Machine (straight forward zip vs subtle weave vs tactical flank)
  if (gs.mode === 'scuttle' || gs.mode === 'air_launch') {
    if (gs.mode === 'air_launch') {
      gs.altitude = Math.max(0, gs.altitude - dt * 24);
      gs.airborne = gs.altitude > 3;
      if (gs.swingMomentumTimer <= 0 || gs.altitude <= 0) {
        gs.mode = 'scuttle';
        gs.airborne = false;
        gs.altitude = 0;
      }
    } else {
      gs.altitude = 0;
      gs.airborne = false;
    }

    // If going straight with open LOS close to target, don't force an unnecessary detour grapple
    const skipDetourForClearCharge =
      (wantsStraight || gs.huntPhase === 'dive') && hasClearTargetLos && distToTarget < 240;
    const canFireHook =
      !skipDetourForClearCharge &&
      gs.hookCooldown <= 0 &&
      distToTarget > 125;

    if (canFireHook) {
      gs.anchorJitterSeed = (gs.anchorJitterSeed + 73 + Math.floor(Math.random() * 41)) % 1000;
      const anchor = findGrappleSwingAnchor(
        enemy.phys.pos,
        enemy.phys.vel,
        target.phys.pos,
        { x: wishX, y: wishY },
        wantsStraight,
        map.obstacles,
        gs.huntPhase,
        gs.lastHookObstacleId,
        gs.anchorJitterSeed
      );
      if (anchor) {
        gs.mode = 'hook_deploy';
        gs.hookAnchor = { x: anchor.x, y: anchor.y };
        gs.hookObstacleId = anchor.obstacleId;
        gs.lastHookObstacleId = anchor.obstacleId;
        gs.hookTip = { ...enemy.phys.pos };
        gs.ropeLength = anchor.ropeLength;
        gs.deployProgress = 0;
        gs.swingTimer = 0;
        gs.clawOpenAmount = gs.huntPhase === 'dive' ? 0.96 : 0.72;
        events.launchedHook = true;
      }
    }

    // Separation from fellow enemies so pack never clumps on top of itself
    let sepX = 0;
    let sepY = 0;
    for (let i = 0; i < allEnemies.length; i++) {
      const o = allEnemies[i];
      if (o === enemy || !o.alive) continue;
      if (o.grapplerState?.attachedTargetId) continue;
      const sx = enemy.phys.pos.x - o.phys.pos.x;
      const sy = enemy.phys.pos.y - o.phys.pos.y;
      const sd = Math.hypot(sx, sy);
      if (sd > 0.1 && sd < 52) {
        const push = ((52 - sd) / 52) * 260;
        sepX += (sx / sd) * push;
        sepY += (sy / sd) * push;
      }
    }

    if (gs.mode === 'air_launch') {
      const curSpd = Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y);
      const airDrag = Math.exp(-0.48 * dt);
      enemy.phys.vel.x *= airDrag;
      enemy.phys.vel.y *= airDrag;

      const airThrust = gs.huntPhase === 'dive' ? 580 : 450;
      enemy.phys.vel.x += (wishX * airThrust + sepX * 0.5) * dt;
      enemy.phys.vel.y += (wishY * airThrust + sepY * 0.5) * dt;
      const newSpd = Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y);
      const cap = Math.max(curSpd, GRAPPLER_MAX_SWING_SPEED);
      if (newSpd > cap) {
        enemy.phys.vel.x = (enemy.phys.vel.x / newSpd) * cap;
        enemy.phys.vel.y = (enemy.phys.vel.y / newSpd) * cap;
      }
    } else {
      // Ground/skimming high-agility direct rush or subtle weave
      const targetSpeed = gs.huntPhase === 'dive' ? 550 : wantsStraight ? 500 : 465;
      const alpha = 1 - Math.exp(-9.2 * dt);
      enemy.phys.vel.x += (wishX * targetSpeed + sepX - enemy.phys.vel.x) * alpha;
      enemy.phys.vel.y += (wishY * targetSpeed + sepY - enemy.phys.vel.y) * alpha;
    }
  } else if (gs.mode === 'hook_deploy' && gs.hookAnchor) {
    gs.deployProgress = Math.min(1, gs.deployProgress + dt * 22);
    gs.hookTip.x = enemy.phys.pos.x + (gs.hookAnchor.x - enemy.phys.pos.x) * gs.deployProgress;
    gs.hookTip.y = enemy.phys.pos.y + (gs.hookAnchor.y - enemy.phys.pos.y) * gs.deployProgress;
    gs.tension = 0.38;
    if (gs.deployProgress >= 1) {
      gs.mode = 'swinging';
      gs.airborne = true;
      gs.altitude = Math.max(gs.altitude, 16);
      gs.swingTimer = 0;
      gs.ropeLength = Math.max(54, Math.hypot(gs.hookAnchor.x - enemy.phys.pos.x, gs.hookAnchor.y - enemy.phys.pos.y));
      gs.clawOpenAmount = gs.huntPhase === 'dive' ? 0.85 : 0.35;

      const ax = gs.hookAnchor.x - enemy.phys.pos.x;
      const ay = gs.hookAnchor.y - enemy.phys.pos.y;
      const al = Math.hypot(ax, ay) || 1;
      const rx = ax / al;
      const ry = ay / al;
      const tx1 = -ry;
      const ty1 = rx;

      // Pick swing tangent aligned with desired travel vector (or current velocity) so curves always bend toward goal
      const wishDotT = tx1 * wishX + ty1 * wishY;
      const spd = Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y);
      if (Math.abs(wishDotT) > 0.14) {
        gs.swingTangentSign = wishDotT >= 0 ? 1 : -1;
      } else if (spd > 120) {
        const velDotT = (enemy.phys.vel.x / spd) * tx1 + (enemy.phys.vel.y / spd) * ty1;
        gs.swingTangentSign = velDotT >= 0 ? 1 : -1;
      } else {
        gs.swingTangentSign = gs.flankSign;
      }

      // Immediate crisp initial tether tug along cable
      enemy.phys.vel.x += rx * 195;
      enemy.phys.vel.y += ry * 195;

      events.latchedStructure = true;
      events.propulsionBurst = true;
    }
  } else if (gs.mode === 'swinging' && gs.hookAnchor) {
    const obs = gs.hookObstacleId ? map.obstacles.find((o) => o.id === gs.hookObstacleId) : null;
    if (gs.hookObstacleId && (!obs || obs.destroyed)) {
      gs.mode = 'air_launch';
      gs.hookAnchor = null;
      gs.hookObstacleId = null;
      gs.swingMomentumTimer = 1.0;
      gs.hookCooldown = 0.14;
      events.releasedHook = true;
    } else {
      gs.swingTimer += dt;
      gs.hookTip.x = gs.hookAnchor.x;
      gs.hookTip.y = gs.hookAnchor.y;
      gs.altitude = Math.min(54, gs.altitude + dt * 155);
      gs.airborne = true;

      const adx = gs.hookAnchor.x - enemy.phys.pos.x;
      const ady = gs.hookAnchor.y - enemy.phys.pos.y;
      const adist = Math.hypot(adx, ady) || 1;
      const rx = adx / adist;
      const ry = ady / adist;
      const tangX = -ry;
      const tangY = rx;

      const wishAlong = wishX * rx + wishY * ry;
      const wishAcross = wishX * tangX + wishY * tangY;
      const zipStraight = (wantsStraight || Math.abs(wishAcross) < 0.32) && wishAlong > 0.25;

      // Reel cable aggressively when zipping straight, smoothly when curving around cover
      const reelRate = zipStraight ? 290 : 175;
      gs.ropeLength = Math.max(46, gs.ropeLength - reelRate * dt);

      if (zipStraight) {
        // Straight-line grapple pull: drive hard along wishDir/cable with tiny obstacle-edge clearance, zero circling
        const pullAccel = 1480;
        const microAdj = wishAcross * 360 + gs.swingTangentSign * 95;
        enemy.phys.vel.x += (rx * pullAccel + tangX * microAdj) * dt;
        enemy.phys.vel.y += (ry * pullAccel + tangY * microAdj) * dt;

        // Bleed stray lateral speed so straight zip tracks straight
        const tanVel = enemy.phys.vel.x * tangX + enemy.phys.vel.y * tangY;
        const damp = tanVel * Math.min(1, dt * 3.8);
        enemy.phys.vel.x -= tangX * damp;
        enemy.phys.vel.y -= tangY * damp;
        gs.tension = Math.min(1, 0.55 + Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y) / 900);
      } else {
        // Gentle human-like swing curve proportional to desired across-cable direction
        const curveSign = Math.abs(wishAcross) > 0.08 ? Math.sign(wishAcross) : gs.swingTangentSign;
        const curveStrength = Math.min(1.0, Math.max(0.28, Math.abs(wishAcross) * 1.15));
        const pullAccel = 1120;
        const swingThrust = 960 * curveStrength;
        enemy.phys.vel.x += (rx * pullAccel + tangX * curveSign * swingThrust) * dt;
        enemy.phys.vel.y += (ry * pullAccel + tangY * curveSign * swingThrust) * dt;

        // Pendulum tether constraint: redirect outward stretch smoothly along desired curve without forcing loops
        const radVel = enemy.phys.vel.x * rx + enemy.phys.vel.y * ry;
        const tanVel = enemy.phys.vel.x * tangX + enemy.phys.vel.y * tangY;
        if (adist >= gs.ropeLength) {
          const stretch = adist - gs.ropeLength;
          if (radVel < 0) {
            const swingSign = Math.abs(tanVel) > 25 ? Math.sign(tanVel) : curveSign;
            const transfer = Math.abs(radVel) * 0.45 * swingSign;
            const newTanVel = tanVel + transfer;
            const correctedRad = Math.max(0, radVel * 0.25) + Math.min(980, stretch * 22) * dt;
            enemy.phys.vel.x = rx * correctedRad + tangX * newTanVel;
            enemy.phys.vel.y = ry * correctedRad + tangY * newTanVel;
          } else {
            const springForce = Math.min(1050, stretch * 20);
            enemy.phys.vel.x += rx * springForce * dt;
            enemy.phys.vel.y += ry * springForce * dt;
          }
          gs.tension = Math.min(1, 0.54 + stretch / 72);
        } else {
          gs.tension = Math.max(0.3, Math.min(0.95, Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y) / 720));
        }
      }

      const spd = Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y);
      if (spd > GRAPPLER_MAX_SWING_SPEED) {
        enemy.phys.vel.x = (enemy.phys.vel.x / spd) * GRAPPLER_MAX_SWING_SPEED;
        enemy.phys.vel.y = (enemy.phys.vel.y / spd) * GRAPPLER_MAX_SWING_SPEED;
      }

      const velAlignWish = spd > 10 ? (enemy.phys.vel.x / spd) * wishX + (enemy.phys.vel.y / spd) * wishY : 0;
      const maxSwingDur = zipStraight ? 0.56 : 0.72;
      const shouldRelease =
        adist < 56 ||
        gs.swingTimer > maxSwingDur ||
        (gs.swingTimer > 0.22 && velAlignWish > 0.89) ||
        (gs.huntPhase === 'dive' && distToTarget < 130);

      if (shouldRelease) {
        gs.mode = 'air_launch';
        gs.hookAnchor = null;
        gs.hookObstacleId = null;
        gs.tension = 0;
        gs.swingMomentumTimer = 0.95 + Math.random() * 0.35;
        gs.hookCooldown = 0.14 + Math.random() * 0.24;
        gs.clawOpenAmount = gs.huntPhase === 'dive' ? 0.95 : 0.55;
        if (gs.huntPhase === 'approach' || gs.huntPhase === 'circle') {
          gs.circleSwingsCompleted++;
        }
        // Slingshot carry boost along release direction
        if (spd > 60) {
          const boost = Math.min(185, spd * 0.22 + 75);
          enemy.phys.vel.x += (enemy.phys.vel.x / spd) * boost;
          enemy.phys.vel.y += (enemy.phys.vel.y / spd) * boost;
        }
        const postSpd = Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y);
        if (postSpd > GRAPPLER_MAX_SWING_SPEED + 80) {
          enemy.phys.vel.x = (enemy.phys.vel.x / postSpd) * (GRAPPLER_MAX_SWING_SPEED + 80);
          enemy.phys.vel.y = (enemy.phys.vel.y / postSpd) * (GRAPPLER_MAX_SWING_SPEED + 80);
        }
        events.releasedHook = true;
      }
    }
  }

  // Sub-stepped motion & collision handling (airborne swinging/launching glides cleanly over low props < 42px)
  const collisionObstacles = gs.airborne && gs.altitude > 18
    ? map.obstacles.filter((o) => !o.destroyed && (o.height >= 44 || o.kind === 'building'))
    : map.obstacles;
  integrateSubsteppedMotion(
    enemy.phys.pos,
    enemy.phys.vel,
    enemy.spec.radius,
    collisionObstacles,
    map.width,
    map.height,
    dt
  );

  // Align body/aim smoothly toward velocity vector for fluid AoT aerial curving & banking
  const moveSpd = Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y);
  const desiredBody = moveSpd > 25 ? Math.atan2(enemy.phys.vel.y, enemy.phys.vel.x) : Math.atan2(dy, dx);
  const diffBody = shortestAngleDiff(enemy.phys.bodyAngle, desiredBody);
  const maxTurn = (gs.mode === 'swinging' || gs.mode === 'air_launch' ? 14 : 11) * dt;
  enemy.phys.bodyAngle = normalizeAngle(enemy.phys.bodyAngle + Math.max(-maxTurn, Math.min(maxTurn, diffBody)));
  enemy.phys.aimAngle = gs.huntPhase === 'dive' ? Math.atan2(dy, dx) : enemy.phys.bodyAngle;
  enemy.phys.sprinting = moveSpd > 280;

  // Dynamic velocity-coupled banking & pitch
  const fwdX = Math.cos(enemy.phys.bodyAngle);
  const fwdY = Math.sin(enemy.phys.bodyAngle);
  const rightX = -fwdY;
  const rightY = fwdX;
  const targetTiltX = Math.max(-0.28, Math.min(0.28, ((enemy.phys.vel.x * fwdX + enemy.phys.vel.y * fwdY) / 680) * 0.24));
  const targetTiltY = Math.max(-0.28, Math.min(0.28, ((enemy.phys.vel.x * rightX + enemy.phys.vel.y * rightY) / 680) * 0.26));
  enemy.phys.tiltX += (targetTiltX - enemy.phys.tiltX) * Math.min(1, dt * 12);
  enemy.phys.tiltY += (targetTiltY - enemy.phys.tiltY) * Math.min(1, dt * 12);

  enemy.legs.update(
    dt,
    enemy.phys,
    {
      strideLength: enemy.spec.strideLength,
      stepHeight: enemy.spec.stepHeight,
      stepSpeed: enemy.spec.stepSpeed,
      maxSpeed: enemy.spec.maxSpeed,
      footstepWeight: enemy.spec.footstepWeight,
    },
    enemy.health,
    map.obstacles,
    {
      grappling: gs.mode === 'swinging' || gs.mode === 'hook_deploy',
      airborne: gs.airborne && gs.altitude > 8,
      altitude: gs.altitude,
      dashing: gs.mode === 'air_launch',
    }
  );

  return events;
}
