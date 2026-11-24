import { AntiAirController } from './antiAirController';
import { createComponentHealth } from './combat';
import { createFlightState, FlightConfig, stepFlightPhysics } from './flightSystem';
import { MechActor } from './mech';
import { computeEffectiveMechStats, MECH_ROSTER } from './mechRoster';
import { createPhysicsState, normalizeAngle, shortestAngleDiff } from './physics';
import { LegAnimator } from './proceduralLegs';
import { canDetectUnit } from './stealthSystem';
import { EnemyArchetype, MapDefinition, MechClassId, MechClassSpec, Obstacle, Vec2 } from './types';
import { createWeaponRuntime } from './weapons';

export type FlyingEnemyArchetype = 'interceptor' | 'rocket_hunter' | 'sky_breaker';

export interface FlyingEnemySpec {
  name: string;
  baseClass: MechClassId;
  color: string;
  accent: string;
  scaleHp: number;
  scaleSpeed: number;
  scaleDamage: number;
  radius: number;
  cruiseAltitude: number;
  preferredRangeMin: number;
  preferredRangeMax: number;
  windupDuration: number;
  flightCfg: FlightConfig;
}

export const FLYING_ENEMY_SPECS: Record<FlyingEnemyArchetype, FlyingEnemySpec> = {
  interceptor: {
    name: 'Vesper-07 Interceptor',
    baseClass: 'valkyrie',
    color: '#3f4756',
    accent: '#38bdf8',
    scaleHp: 0.62,
    scaleSpeed: 1.12,
    scaleDamage: 0.56,
    radius: 17,
    cruiseAltitude: 92,
    preferredRangeMin: 180,
    preferredRangeMax: 360,
    windupDuration: 0,
    flightCfg: {
      maxAltitude: 155,
      hoverAltitude: 92,
      ascendAccel: 380,
      descendAccel: 320,
      gravity: 200,
      maxFlightSpeed: 305,
      boostSpeedMult: 1.45,
      thrustAccel: 590,
      turnRate: 6.2,
      heatGainPerSec: 4.5,
      boostHeatGainPerSec: 18,
      coolRatePerSec: 18,
      overheatThreshold: 100,
      recoverThreshold: 40,
    },
  },
  rocket_hunter: {
    name: 'Harrier-11 Rocket Hunter',
    baseClass: 'valkyrie',
    color: '#463844',
    accent: '#fb923c',
    scaleHp: 0.88,
    scaleSpeed: 0.9,
    scaleDamage: 0.66,
    radius: 20,
    cruiseAltitude: 112,
    preferredRangeMin: 360,
    preferredRangeMax: 650,
    windupDuration: 0.85, // Clear lock-on telegraph before guided salvo
    flightCfg: {
      maxAltitude: 165,
      hoverAltitude: 112,
      ascendAccel: 340,
      descendAccel: 290,
      gravity: 200,
      maxFlightSpeed: 240,
      boostSpeedMult: 1.38,
      thrustAccel: 460,
      turnRate: 4.6,
      heatGainPerSec: 5.5,
      boostHeatGainPerSec: 20,
      coolRatePerSec: 17,
      overheatThreshold: 100,
      recoverThreshold: 42,
    },
  },
  sky_breaker: {
    name: 'Goliath-14 Sky Breaker',
    baseClass: 'valkyrie',
    color: '#342c2e',
    accent: '#ef4444',
    scaleHp: 1.55,
    scaleSpeed: 0.72,
    scaleDamage: 0.82,
    radius: 26,
    cruiseAltitude: 128,
    preferredRangeMin: 240,
    preferredRangeMax: 520,
    windupDuration: 0.45,
    flightCfg: {
      maxAltitude: 170,
      hoverAltitude: 128,
      ascendAccel: 290,
      descendAccel: 260,
      gravity: 210,
      maxFlightSpeed: 188,
      boostSpeedMult: 1.28,
      thrustAccel: 350,
      turnRate: 3.1,
      heatGainPerSec: 8.5,
      boostHeatGainPerSec: 24,
      coolRatePerSec: 15,
      overheatThreshold: 100,
      recoverThreshold: 38,
    },
  },
};

export function isFlyingArchetype(arch?: EnemyArchetype): arch is FlyingEnemyArchetype {
  return arch === 'interceptor' || arch === 'rocket_hunter' || arch === 'sky_breaker';
}

export function createFlyingEnemy(params: {
  id: string;
  archetype: FlyingEnemyArchetype;
  x: number;
  y: number;
  difficultyMult?: number;
}): MechActor {
  const fp = FLYING_ENEMY_SPECS[params.archetype];
  const baseSpec = MECH_ROSTER[fp.baseClass];
  const stats = computeEffectiveMechStats(baseSpec);
  const diff = params.difficultyMult ?? 1.0;

  const customSpec: MechClassSpec = {
    ...baseSpec,
    radius: fp.radius,
    canFly: true,
    silhouette: 'valkyrie',
  };

  const hp = Math.round(stats.chassis * fp.scaleHp * diff);
  const armor = Math.round(stats.armor * fp.scaleHp * diff);
  const legDur = Math.round(stats.legDurability * fp.scaleHp * diff);

  const primarySpec = {
    ...baseSpec.primaryWeapon,
    damage: Math.round(
      baseSpec.primaryWeapon.damage *
        fp.scaleDamage *
        diff *
        (params.archetype === 'sky_breaker' ? 1.25 : 0.92)
    ),
    fireRate:
      baseSpec.primaryWeapon.fireRate *
      (params.archetype === 'interceptor' ? 1.05 : params.archetype === 'sky_breaker' ? 0.95 : 0.72),
    range: params.archetype === 'rocket_hunter' ? 760 : 720,
  };
  const secondarySpec = {
    ...baseSpec.secondaryWeapon,
    missileType:
      params.archetype === 'rocket_hunter'
        ? ('interceptor' as const)
        : params.archetype === 'sky_breaker'
        ? ('swarm' as const)
        : ('standard' as const),
    damage: Math.round(
      baseSpec.secondaryWeapon.damage *
        fp.scaleDamage *
        diff *
        (params.archetype === 'rocket_hunter' ? 1.15 : 1.0)
    ),
    projectileSpeed: params.archetype === 'rocket_hunter' ? 930 : 760,
    burstCount: params.archetype === 'sky_breaker' ? 4 : 2,
    range: params.archetype === 'rocket_hunter' ? 1120 : 940,
  };

  const angle = Math.PI;
  const actor: MechActor = {
    id: params.id,
    callsign: fp.name,
    team: 'enemy',
    isPlayer: false,
    classId: 'valkyrie',
    enemyArchetype: params.archetype,
    spec: customSpec,
    stats,
    physCfg: {
      mass: stats.mass,
      acceleration: fp.flightCfg.thrustAccel,
      maxSpeed: fp.flightCfg.maxFlightSpeed,
      sprintMultiplier: fp.flightCfg.boostSpeedMult,
      reverseMultiplier: 0.75,
      turnAccel: 5.5,
      maxTurnSpeed: fp.flightCfg.turnRate,
      lateralGrip: 2.2,
      radius: fp.radius,
      suspensionStiffness: 1.0,
      terrainPenaltyMult: 0.25,
    },
    phys: createPhysicsState(params.x, params.y, angle),
    legs: new LegAnimator(baseSpec.legs, { x: params.x, y: params.y }, angle),
    health: createComponentHealth(hp, armor, legDur),
    primary: createWeaponRuntime(primarySpec),
    secondary: createWeaponRuntime(secondarySpec),
    activeSlot: 1,
    paint: {
      id: `enemy_${params.archetype}`,
      name: fp.name,
      primary: fp.color,
      secondary: '#1d222b',
      accent: fp.accent,
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
    aiTimer: Math.random() * 1.5,
    aiPath: [],
    aiPathTimer: 0,
    lastKnownTargetPos: null,
    targetId: null,
    windupTimer: 0,
    windupTargetPos: null,
    squadOrder: 'attack_target',
    defendPos: null,
    formationSlot: 0,
    personality: 'aggressive',
    flight: createFlightState(true, fp.cruiseAltitude),
    antiAir: AntiAirController.forPreset('flying', undefined, angle),
  };

  return actor;
}

export interface AerialAIOutput {
  wishX: number;
  wishY: number;
  ascend: boolean;
  descend: boolean;
  boost: boolean;
  firePrimary: boolean;
  fireSecondary: boolean;
  aimAngle: number;
  lockingPlayer: boolean;
}

export function computeFlyingEnemyAI(
  enemy: MechActor,
  friendlies: MechActor[],
  allEnemies: MechActor[],
  map: MapDefinition,
  dt: number,
  attackTokens: { used: number; max: number }
): AerialAIOutput {
  const arch = (isFlyingArchetype(enemy.enemyArchetype) ? enemy.enemyArchetype : 'interceptor') as FlyingEnemyArchetype;
  const spec = FLYING_ENEMY_SPECS[arch];

  const out: AerialAIOutput = {
    wishX: 0,
    wishY: 0,
    ascend: false,
    descend: false,
    boost: false,
    firePrimary: false,
    fireSecondary: false,
    aimAngle: enemy.phys.aimAngle,
    lockingPlayer: false,
  };

  enemy.aiTimer -= dt;

  // Pick closest / best aerial target
  let bestTarget: MechActor | null = null;
  let bestScore = -1e9;
  for (let i = 0; i < friendlies.length; i++) {
    const f = friendlies[i];
    if (!f.alive || f.downed) continue;
    if (!canDetectUnit(enemy, f, map.obstacles)) continue;
    const dist = Math.hypot(f.phys.pos.x - enemy.phys.pos.x, f.phys.pos.y - enemy.phys.pos.y);
    if (dist > 1700) continue;
    let score = -dist + (f.isPlayer ? 220 : 0);
    if (f.flight?.isAirborne) score += 160; // Interceptors relish dogfights too
    if (score > bestScore) {
      bestScore = score;
      bestTarget = f;
    }
  }

  if (!bestTarget) return out;

  const dx = bestTarget.phys.pos.x - enemy.phys.pos.x;
  const dy = bestTarget.phys.pos.y - enemy.phys.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dirX = dx / dist;
  const dirY = dy / dist;

  // Predictive aerial aiming
  const leadT = Math.min(0.6, dist / Math.max(420, enemy.primary.spec.projectileSpeed));
  let aimTargetX = bestTarget.phys.pos.x + bestTarget.phys.vel.x * leadT;
  let aimTargetY = bestTarget.phys.pos.y + bestTarget.phys.vel.y * leadT;
  if (enemy.jammedTimer > 0) {
    aimTargetX += Math.sin(enemy.aiTimer * 15) * 140;
    aimTargetY += Math.cos(enemy.aiTimer * 12) * 140;
  }

  const desiredAim = Math.atan2(aimTargetY - enemy.phys.pos.y, aimTargetX - enemy.phys.pos.x);
  const aimDiff = shortestAngleDiff(enemy.phys.aimAngle, desiredAim);
  const aimRate = arch === 'interceptor' ? 5.8 : arch === 'rocket_hunter' ? 4.4 : 3.2;
  enemy.phys.aimAngle = normalizeAngle(
    enemy.phys.aimAngle + Math.max(-aimRate * dt, Math.min(aimRate * dt, aimDiff))
  );
  out.aimAngle = enemy.phys.aimAngle;

  const hpRatio = enemy.health.chassis / Math.max(1, enemy.health.maxChassis);
  const fl = enemy.flight!;
  const isOverheated = fl.overheated || fl.heat > 84;

  // Vertical altitude oscillation / tactical altitude changes
  const desiredAlt =
    isOverheated
      ? spec.cruiseAltitude * 0.72
      : enemy.windupTimer > 0
      ? spec.cruiseAltitude + 22
      : spec.cruiseAltitude + Math.sin(enemy.aiTimer * 1.4) * 18;
  out.ascend = fl.altitude < desiredAlt - 12;
  out.descend = fl.altitude > desiredAlt + 16;

  // Missile lock-on telegraph countdown (Harrier Rocket Hunter & Goliath Sky Breaker)
  if (enemy.windupTimer > 0) {
    enemy.windupTimer -= dt;
    enemy.aiState = 'windup';
    enemy.windupTargetPos = { x: aimTargetX, y: aimTargetY };
    if (bestTarget.isPlayer && arch === 'rocket_hunter') {
      out.lockingPlayer = true;
    }
    // Keep moving smoothly during lock-on (never freeze midair!)
    const orbitSign = parseInt(enemy.id.replace(/\D/g, '') || '1', 10) % 2 === 0 ? 1 : -1;
    out.wishX = -dirY * orbitSign * 0.75 + dirX * 0.15;
    out.wishY = dirX * orbitSign * 0.75 + dirY * 0.15;

    if (enemy.windupTimer <= 0) {
      out.fireSecondary = true;
      enemy.windupTargetPos = null;
    }
  } else {
    const orbitSign = parseInt(enemy.id.replace(/\D/g, '') || '1', 10) % 2 === 0 ? 1 : -1;
    const tangX = -dirY * orbitSign;
    const tangY = dirX * orbitSign;

    if (isOverheated || (arch === 'rocket_hunter' && hpRatio < 0.35 && dist < 500)) {
      enemy.aiState = 'retreat';
      out.wishX = -dirX * 0.8 + tangX * 0.55;
      out.wishY = -dirY * 0.8 + tangY * 0.55;
    } else if (arch === 'interceptor') {
      // Fast strafing figure-eight sweeps
      enemy.aiState = 'flank';
      const approach = dist > spec.preferredRangeMax ? 0.85 : dist < spec.preferredRangeMin ? -0.55 : 0.1;
      out.wishX = dirX * approach + tangX * 0.92;
      out.wishY = dirY * approach + tangY * 0.92;
      out.boost = dist > spec.preferredRangeMax * 1.15 && !fl.overheated;
    } else if (arch === 'rocket_hunter') {
      enemy.aiState = 'engage';
      if (dist < spec.preferredRangeMin) {
        out.wishX = -dirX * 0.72 + tangX * 0.65;
        out.wishY = -dirY * 0.72 + tangY * 0.65;
      } else if (dist > spec.preferredRangeMax) {
        out.wishX = dirX * 0.85 + tangX * 0.35;
        out.wishY = dirY * 0.85 + tangY * 0.35;
      } else {
        out.wishX = tangX;
        out.wishY = tangY;
      }
    } else {
      // Heavy Sky Breaker pushes overhead firing heavy autocannons + rocket salvos
      enemy.aiState = 'engage';
      const approach = dist > spec.preferredRangeMax ? 0.75 : dist < spec.preferredRangeMin ? -0.35 : 0.25;
      out.wishX = dirX * approach + tangX * 0.7;
      out.wishY = dirY * approach + tangY * 0.7;
    }
  }

  // Tall obstacle flight avoidance (fly cleanly around tall structures >= 48px high; ignore short cover!)
  for (let i = 0; i < map.obstacles.length; i++) {
    const obs: Obstacle = map.obstacles[i];
    if (obs.destroyed || obs.height < 48) continue;
    const ox = enemy.phys.pos.x - obs.x;
    const oy = enemy.phys.pos.y - obs.y;
    const safeDist = Math.max(obs.w, obs.h) * 0.5 + enemy.spec.radius + 42;
    const oDist = Math.hypot(ox, oy);
    if (oDist > 0.1 && oDist < safeDist) {
      const push = (safeDist - oDist) / safeDist;
      out.wishX += (ox / oDist) * push * 1.9;
      out.wishY += (oy / oDist) * push * 1.9;
      if (fl.altitude < 110) out.ascend = true;
    }
  }

  // Aerial separation so flying squadrons fan out realistically
  for (let i = 0; i < allEnemies.length; i++) {
    const other = allEnemies[i];
    if (other === enemy || !other.alive) continue;
    const sx = enemy.phys.pos.x - other.phys.pos.x;
    const sy = enemy.phys.pos.y - other.phys.pos.y;
    const sDist = Math.hypot(sx, sy);
    const minSep = enemy.spec.radius + other.spec.radius + 54;
    if (sDist > 0.1 && sDist < minSep) {
      const push = (minSep - sDist) / minSep;
      out.wishX += (sx / sDist) * push * 1.4;
      out.wishY += (sy / sDist) * push * 1.4;
    }
  }

  // Keep inside arena boundary margin
  if (enemy.phys.pos.x < 110) out.wishX += 1.2;
  if (enemy.phys.pos.x > map.width - 110) out.wishX -= 1.2;
  if (enemy.phys.pos.y < 110) out.wishY += 1.2;
  if (enemy.phys.pos.y > map.height - 110) out.wishY -= 1.2;

  const wMag = Math.hypot(out.wishX, out.wishY);
  if (wMag > 1) {
    out.wishX /= wMag;
    out.wishY /= wMag;
  }

  // Primary & Secondary firing logic
  const aligned = Math.abs(shortestAngleDiff(enemy.phys.aimAngle, desiredAim)) < 0.28;
  if (
    aligned &&
    dist <= enemy.primary.spec.range &&
    enemy.primary.cooldown <= 0 &&
    !enemy.primary.reloading &&
    attackTokens.used < attackTokens.max
  ) {
    attackTokens.used++;
    out.firePrimary = true;
  }

  if (
    (arch === 'rocket_hunter' || arch === 'sky_breaker') &&
    enemy.windupTimer <= 0 &&
    aligned &&
    dist <= enemy.secondary.spec.range &&
    enemy.secondary.cooldown <= 0 &&
    !enemy.secondary.reloading &&
    attackTokens.used < attackTokens.max
  ) {
    attackTokens.used++;
    if (spec.windupDuration > 0) {
      enemy.windupTimer = spec.windupDuration;
      enemy.windupTargetPos = { x: aimTargetX, y: aimTargetY };
    } else {
      out.fireSecondary = true;
    }
  }

  return out;
}

export function stepFlyingEnemyMotion(
  enemy: MechActor,
  ai: AerialAIOutput,
  map: MapDefinition,
  dt: number
): void {
  const arch = (isFlyingArchetype(enemy.enemyArchetype) ? enemy.enemyArchetype : 'interceptor') as FlyingEnemyArchetype;
  const spec = FLYING_ENEMY_SPECS[arch];
  if (!enemy.flight) {
    enemy.flight = createFlightState(true, spec.cruiseAltitude);
  }
  stepFlightPhysics(
    enemy.phys,
    enemy.flight,
    spec.flightCfg,
    {
      wishX: ai.wishX,
      wishY: ai.wishY,
      ascend: ai.ascend,
      descend: ai.descend,
      boost: ai.boost,
    },
    enemy.health,
    'concrete',
    dt
  );

  // Clamp world edges gently without colliding with low ground props
  const margin = enemy.spec.radius + 24;
  enemy.phys.pos.x = Math.max(margin, Math.min(map.width - margin, enemy.phys.pos.x));
  enemy.phys.pos.y = Math.max(margin, Math.min(map.height - margin, enemy.phys.pos.y));

  enemy.legs.update(
    dt,
    enemy.phys,
    {
      strideLength: 26,
      stepHeight: 8,
      stepSpeed: 5.5,
      maxSpeed: spec.flightCfg.maxFlightSpeed,
      footstepWeight: 0.4,
    },
    enemy.health,
    [],
    { airborne: enemy.flight.isAirborne, altitude: enemy.flight.altitude }
  );
}
