import { AntiAirController } from './antiAirController';
import { createComponentHealth } from './combat';
import { MechActor } from './mech';
import { computeEffectiveMechStats, MECH_ROSTER } from './mechRoster';
import { createPhysicsState, normalizeAngle, shortestAngleDiff } from './physics';
import { findNearbyCover, hasLineOfSight, NavGrid } from './pathfinding';
import { LegAnimator } from './proceduralLegs';
import { canDetectUnit, createStealthState } from './stealthSystem';
import { EnemyArchetype, FriendlyDeployable, MapDefinition, MechClassId, Obstacle, Vec2 } from './types';
import { createWeaponRuntime } from './weapons';

interface EnemyBlueprint {
  name: string;
  baseClass: MechClassId;
  color: string;
  accent: string;
  scaleHp: number;
  scaleSpeed: number;
  scaleDamage: number;
  preferredRangeMin: number;
  preferredRangeMax: number;
  windupDuration: number;
}

type GroundEnemyArchetype = Exclude<EnemyArchetype, 'interceptor' | 'rocket_hunter' | 'sky_breaker' | 'grappler'>;

export const ENEMY_BLUEPRINTS: Record<GroundEnemyArchetype, EnemyBlueprint> = {
  scout: {
    name: 'Ameise-04 Scout',
    baseClass: 'recon',
    color: '#3f3d44',
    accent: '#ef4444',
    scaleHp: 0.78,
    scaleSpeed: 0.92,
    scaleDamage: 0.65,
    preferredRangeMin: 170,
    preferredRangeMax: 340,
    windupDuration: 0,
  },
  assault: {
    name: 'Grauwolf-06 Assault',
    baseClass: 'standard',
    color: '#46413e',
    accent: '#f97316',
    scaleHp: 0.92,
    scaleSpeed: 0.8,
    scaleDamage: 0.58,
    preferredRangeMin: 240,
    preferredRangeMax: 440,
    windupDuration: 0,
  },
  sniper: {
    name: 'Strix-04 Rail Sniper',
    baseClass: 'sniper',
    color: '#353b42',
    accent: '#f43f5e',
    scaleHp: 0.8,
    scaleSpeed: 0.76,
    scaleDamage: 0.36, // ~77 dmg rail shot with a 0.75s laser windup telegraph
    preferredRangeMin: 520,
    preferredRangeMax: 840,
    windupDuration: 0.75,
  },
  heavy: {
    name: 'Dinosauria-08 Heavy',
    baseClass: 'heavy',
    color: '#32302e',
    accent: '#dc2626',
    scaleHp: 1.08,
    scaleSpeed: 0.78,
    scaleDamage: 0.58,
    preferredRangeMin: 180,
    preferredRangeMax: 400,
    windupDuration: 0.45,
  },
  swarm: {
    name: 'Skorpion-04 Swarm',
    baseClass: 'recon',
    color: '#4d3a3a',
    accent: '#fb7185',
    scaleHp: 0.48,
    scaleSpeed: 0.95,
    scaleDamage: 0.45,
    preferredRangeMin: 95,
    preferredRangeMax: 210,
    windupDuration: 0,
  },
  hunter: {
    name: 'Phantom-06 Hunter',
    baseClass: 'ewar',
    color: '#2c2f36',
    accent: '#e11d48',
    scaleHp: 0.95,
    scaleSpeed: 0.9,
    scaleDamage: 0.68,
    preferredRangeMin: 200,
    preferredRangeMax: 380,
    windupDuration: 0,
  },
  assassin: {
    name: 'Kurokage-09 Stalker',
    baseClass: 'assassin',
    color: '#1b2029',
    accent: '#f43f5e',
    scaleHp: 0.96,
    scaleSpeed: 0.98,
    scaleDamage: 0.72,
    preferredRangeMin: 120,
    preferredRangeMax: 290,
    windupDuration: 0,
  },
};

export function createEnemyMech(params: {
  id: string;
  archetype: EnemyArchetype;
  x: number;
  y: number;
  difficultyMult?: number;
  isDummy?: boolean;
}): MechActor {
  const bp = (ENEMY_BLUEPRINTS as Record<string, EnemyBlueprint>)[params.archetype] ?? ENEMY_BLUEPRINTS.scout;
  const spec = MECH_ROSTER[bp.baseClass];
  const stats = computeEffectiveMechStats(spec);
  const diff = params.difficultyMult ?? 1.0;

  const hp = Math.round(stats.chassis * bp.scaleHp * diff);
  const armor = Math.round(stats.armor * bp.scaleHp * diff);
  const legDur = Math.round(stats.legDurability * bp.scaleHp * diff);

  const primarySpec = {
    ...spec.primaryWeapon,
    damage: Math.round(spec.primaryWeapon.damage * bp.scaleDamage * diff),
    fireRate: spec.primaryWeapon.fireRate * (params.archetype === 'sniper' ? 0.6 : 0.78),
  };
  const secondarySpec = {
    ...spec.secondaryWeapon,
    damage: Math.round(spec.secondaryWeapon.damage * bp.scaleDamage * diff),
  };

  const angle = Math.PI;
  return {
    id: params.id,
    callsign: params.isDummy ? 'Target Drone' : bp.name,
    team: 'enemy',
    isPlayer: false,
    classId: bp.baseClass,
    enemyArchetype: params.archetype,
    spec,
    stats,
    physCfg: {
      mass: stats.mass,
      acceleration: stats.acceleration * bp.scaleSpeed,
      maxSpeed: stats.maxSpeed * bp.scaleSpeed,
      sprintMultiplier: spec.sprintMultiplier,
      reverseMultiplier: spec.reverseMultiplier,
      turnAccel: stats.turnAccel,
      maxTurnSpeed: stats.turnSpeed,
      lateralGrip: stats.lateralGrip,
      radius: spec.radius,
      suspensionStiffness: spec.suspensionStiffness,
      terrainPenaltyMult: 1,
    },
    phys: createPhysicsState(params.x, params.y, angle),
    legs: new LegAnimator(spec.legs, { x: params.x, y: params.y }, angle),
    health: createComponentHealth(hp, armor, legDur),
    primary: createWeaponRuntime(primarySpec),
    secondary: createWeaponRuntime(secondarySpec),
    activeSlot: 1,
    paint: {
      id: `enemy_${params.archetype}`,
      name: bp.name,
      primary: bp.color,
      secondary: '#1d1e22',
      accent: bp.accent,
    },
    specialActiveTimer: 0,
    specialCooldownTimer: 0,
    transformCooldownTimer: 0,
    hitFlashTimer: 0,
    alive: true,
    koTimer: 0,
    detected: false,
    jammedTimer: 0,
    aiState: 'patrol',
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
    isDummy: params.isDummy,
    antiAir: AntiAirController.forMechClass(bp.baseClass, undefined, angle),
    stealth: createStealthState(params.archetype === 'assassin'),
  };
}

export interface EnemyAIOutput {
  wishX: number;
  wishY: number;
  sprint: boolean;
  firePrimary: boolean;
  fireSecondary: boolean;
  aimAngle: number;
  wantsStealth?: boolean;
  executionTargetId?: string | null;
}

export function computeEnemyAI(
  enemy: MechActor,
  friendlies: MechActor[],
  allEnemies: MechActor[],
  map: MapDefinition,
  navGrid: NavGrid,
  dt: number,
  attackTokens: { used: number; max: number },
  decoys?: readonly FriendlyDeployable[]
): EnemyAIOutput {
  const out: EnemyAIOutput = {
    wishX: 0,
    wishY: 0,
    sprint: false,
    firePrimary: false,
    fireSecondary: false,
    aimAngle: enemy.phys.aimAngle,
  };

  if (enemy.isDummy) {
    // Training target drones gently idle or patrol slightly if named Mobile
    return out;
  }

  const arch = enemy.enemyArchetype ?? 'assault';
  const bp = (ENEMY_BLUEPRINTS as Record<string, EnemyBlueprint>)[arch] ?? ENEMY_BLUEPRINTS.assault;
  enemy.aiTimer -= dt;
  enemy.aiPathTimer -= dt;

  // Target selection: prioritize closest visible friendly, or holographic EWAR decoy
  let bestTarget: MechActor | null = null;
  let bestDecoy: FriendlyDeployable | null = null;
  let bestScore = -1e9;
  let bestHasLos = false;

  for (let i = 0; i < friendlies.length; i++) {
    const f = friendlies[i];
    if (!f.alive || f.downed) continue;
    if (!canDetectUnit(enemy, f, map.obstacles)) continue;
    const dist = Math.hypot(f.phys.pos.x - enemy.phys.pos.x, f.phys.pos.y - enemy.phys.pos.y);
    if (dist > 1400) continue;
    const los = hasLineOfSight(enemy.phys.pos, f.phys.pos, map.obstacles);
    let score = -dist;
    if (los) score += 450;
    if (arch === 'hunter' || arch === 'assassin') {
      const hpRatio = f.health.chassis / f.health.maxChassis;
      score += (1 - hpRatio) * 500;
      if (arch === 'assassin' && f.isPlayer) score += 260;
    } else if (arch === 'sniper' && f.isPlayer) {
      score += 180;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTarget = f;
      bestDecoy = null;
      bestHasLos = los;
    }
  }

  if (decoys && decoys.length > 0) {
    for (let i = 0; i < decoys.length; i++) {
      const dec = decoys[i];
      if (dec.kind !== 'ewar_decoy' || dec.hp <= 0 || dec.life <= 0) continue;
      const d = Math.hypot(dec.x - enemy.phys.pos.x, dec.y - enemy.phys.pos.y);
      if (d > 820) continue;
      const los = hasLineOfSight(enemy.phys.pos, { x: dec.x, y: dec.y }, map.obstacles);
      // High electronic signature lures nearby hostiles unless decoy is very far
      const score = -d + (los ? 680 : 120);
      if (score > bestScore) {
        bestScore = score;
        bestDecoy = dec;
        bestTarget = null;
        bestHasLos = los;
      }
    }
  }

  const resolvedPos: Vec2 | null = bestDecoy
    ? { x: bestDecoy.x, y: bestDecoy.y }
    : bestTarget
    ? bestTarget.phys.pos
    : null;

  if (!resolvedPos) {
    if (enemy.lastKnownTargetPos) {
      const ldx = enemy.lastKnownTargetPos.x - enemy.phys.pos.x;
      const ldy = enemy.lastKnownTargetPos.y - enemy.phys.pos.y;
      const lDist = Math.hypot(ldx, ldy);
      if (lDist > 48) {
        out.wishX = ldx / lDist;
        out.wishY = ldy / lDist;
        if (arch === 'assassin') out.wantsStealth = true;
      } else {
        enemy.lastKnownTargetPos = null;
      }
    }
    return out;
  }

  const decoyProxy: MechActor | null = bestDecoy
    ? {
        ...(friendlies[0] ?? enemy),
        id: bestDecoy.id,
        phys: {
          ...enemy.phys,
          pos: { x: bestDecoy.x, y: bestDecoy.y },
          vel: { x: 0, y: 0 },
          bodyAngle: 0,
        },
        downed: false,
      }
    : bestTarget;

  const targetEntity = decoyProxy!;
  const dx = targetEntity.phys.pos.x - enemy.phys.pos.x;
  const dy = targetEntity.phys.pos.y - enemy.phys.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dirX = dx / dist;
  const dirY = dy / dist;

  if (bestHasLos) {
    enemy.lastKnownTargetPos = { ...targetEntity.phys.pos };
    enemy.targetId = targetEntity.id;
  }

  const _origTargetForRef = bestTarget;
  void _origTargetForRef;
  // Re-bind bestTarget variable cleanly for downstream AI checks
  bestTarget = targetEntity;

  // Smooth aim tracking (hunter leads velocity!)
  let aimTargetX = bestTarget.phys.pos.x;
  let aimTargetY = bestTarget.phys.pos.y;
  if (arch === 'hunter' || arch === 'sniper') {
    const leadT = Math.min(0.65, dist / Math.max(400, enemy.primary.spec.projectileSpeed));
    aimTargetX += bestTarget.phys.vel.x * leadT;
    aimTargetY += bestTarget.phys.vel.y * leadT;
  }
  if (enemy.jammedTimer > 0) {
    aimTargetX += Math.sin(enemy.aiTimer * 14) * 110;
    aimTargetY += Math.cos(enemy.aiTimer * 11) * 110;
  }

  const desiredAim = Math.atan2(aimTargetY - enemy.phys.pos.y, aimTargetX - enemy.phys.pos.x);
  const aimRate = arch === 'heavy' ? 2.4 : arch === 'sniper' ? 3.2 : 4.6;
  const aimDiff = shortestAngleDiff(enemy.phys.aimAngle, desiredAim);
  enemy.phys.aimAngle = normalizeAngle(
    enemy.phys.aimAngle + Math.max(-aimRate * dt, Math.min(aimRate * dt, aimDiff))
  );
  out.aimAngle = enemy.phys.aimAngle;

  // Behavior state machine per archetype
  const hpRatio = enemy.health.chassis / enemy.health.maxChassis;

  if (enemy.windupTimer > 0) {
    enemy.windupTimer -= dt;
    enemy.aiState = 'windup';
    // Lock movement during sniper windup telegraph
    if (enemy.windupTimer <= 0) {
      out.firePrimary = true;
      enemy.windupTargetPos = null;
    } else {
      enemy.windupTargetPos = { x: aimTargetX, y: aimTargetY };
    }
    return out;
  }

  let moveGoal: Vec2 | null = null;

  if (!bestHasLos && enemy.lastKnownTargetPos) {
    enemy.aiState = 'search';
    moveGoal = enemy.lastKnownTargetPos;
  } else if (arch === 'sniper') {
    if (dist < bp.preferredRangeMin * 0.85) {
      enemy.aiState = 'retreat';
      moveGoal = {
        x: enemy.phys.pos.x - dirX * 260,
        y: enemy.phys.pos.y - dirY * 260,
      };
    } else if (dist > bp.preferredRangeMax) {
      enemy.aiState = 'engage';
      moveGoal = bestTarget.phys.pos;
    } else {
      enemy.aiState = 'cover';
      const cover = findNearbyCover(enemy.phys.pos, bestTarget.phys.pos, map.obstacles, 240);
      if (cover && Math.hypot(cover.x - enemy.phys.pos.x, cover.y - enemy.phys.pos.y) > 40) {
        moveGoal = cover;
      }
    }
  } else if (arch === 'assassin') {
    // Kurokage Stalker: cloak during approach, flank rear hemisphere, trigger teleport ambush!
    enemy.aiState = 'flank';
    const tgtHeading = bestTarget.phys.bodyAngle;
    const rearX = bestTarget.phys.pos.x - Math.cos(tgtHeading) * 145;
    const rearY = bestTarget.phys.pos.y - Math.sin(tgtHeading) * 145;
    const flankSign = parseInt(enemy.id.replace(/\D/g, '') || '1', 10) % 2 === 0 ? 1 : -1;
    const tangentX = -dirY * flankSign;
    const tangentY = dirX * flankSign;

    if (dist > 175 && enemy.stealth?.supported && (enemy.stealth.energy > 34 || enemy.stealth.active)) {
      out.wantsStealth = true;
    }
    if (enemy.specialCooldownTimer <= 0 && !bestTarget.downed && dist <= 345) {
      out.executionTargetId = bestTarget.id;
    }
    if (dist > 280) {
      moveGoal = {
        x: rearX + tangentX * 95,
        y: rearY + tangentY * 95,
      };
      out.sprint = true;
    } else {
      moveGoal = { x: rearX, y: rearY };
      out.sprint = dist > 165;
    }
  } else if (arch === 'scout' || arch === 'swarm' || arch === 'hunter') {
    // Flank & encircle!
    enemy.aiState = 'flank';
    const flankSign = parseInt(enemy.id.replace(/\D/g, '') || '1', 10) % 2 === 0 ? 1 : -1;
    const tangentX = -dirY * flankSign;
    const tangentY = dirX * flankSign;
    if (dist > bp.preferredRangeMax) {
      moveGoal = {
        x: bestTarget.phys.pos.x + tangentX * 140,
        y: bestTarget.phys.pos.y + tangentY * 140,
      };
      out.sprint = arch === 'scout' || arch === 'hunter';
    } else if (dist < bp.preferredRangeMin) {
      moveGoal = {
        x: enemy.phys.pos.x - dirX * 120 + tangentX * 180,
        y: enemy.phys.pos.y - dirY * 120 + tangentY * 180,
      };
    } else {
      moveGoal = {
        x: enemy.phys.pos.x + tangentX * 200,
        y: enemy.phys.pos.y + tangentY * 200,
      };
    }
  } else if (arch === 'assault') {
    if (hpRatio < 0.4 && enemy.aiTimer <= 0) {
      enemy.aiState = 'cover';
      const cover = findNearbyCover(enemy.phys.pos, bestTarget.phys.pos, map.obstacles, 320);
      if (cover) moveGoal = cover;
      enemy.aiTimer = 2.0;
    } else if (dist > bp.preferredRangeMax) {
      enemy.aiState = 'engage';
      moveGoal = bestTarget.phys.pos;
    } else if (dist < bp.preferredRangeMin) {
      enemy.aiState = 'retreat';
      moveGoal = {
        x: enemy.phys.pos.x - dirX * 150,
        y: enemy.phys.pos.y - dirY * 150,
      };
    } else {
      enemy.aiState = 'engage';
      const strafe = Math.sin(enemy.aiTimer * 1.4) > 0 ? 1 : -1;
      moveGoal = {
        x: enemy.phys.pos.x - dirY * 130 * strafe,
        y: enemy.phys.pos.y + dirX * 130 * strafe,
      };
    }
  } else {
    // Heavy juggernaut pushes relentlessly
    enemy.aiState = 'engage';
    if (dist > bp.preferredRangeMin) {
      moveGoal = bestTarget.phys.pos;
    }
  }

  // Pathfind periodically when obstructed
  if (moveGoal) {
    moveGoal.x = Math.max(80, Math.min(map.width - 80, moveGoal.x));
    moveGoal.y = Math.max(80, Math.min(map.height - 80, moveGoal.y));

    if (enemy.aiPathTimer <= 0) {
      enemy.aiPathTimer = 0.65 + Math.random() * 0.35;
      if (!hasLineOfSight(enemy.phys.pos, moveGoal, map.obstacles)) {
        enemy.aiPath = navGrid.findPath(enemy.phys.pos, moveGoal);
      } else {
        enemy.aiPath = [moveGoal];
      }
    }

    const waypoint = enemy.aiPath[0] ?? moveGoal;
    const wdx = waypoint.x - enemy.phys.pos.x;
    const wdy = waypoint.y - enemy.phys.pos.y;
    const wDist = Math.hypot(wdx, wdy);
    if (wDist < 42 && enemy.aiPath.length > 1) {
      enemy.aiPath.shift();
    }
    if (wDist > 12) {
      out.wishX = wdx / wDist;
      out.wishY = wdy / wDist;
    }
  }

  // Separation steering from nearby enemies so they never stack
  for (let i = 0; i < allEnemies.length; i++) {
    const other = allEnemies[i];
    if (other === enemy || !other.alive) continue;
    const sx = enemy.phys.pos.x - other.phys.pos.x;
    const sy = enemy.phys.pos.y - other.phys.pos.y;
    const sDist = Math.hypot(sx, sy);
    const minSep = enemy.spec.radius + other.spec.radius + 38;
    if (sDist > 0.1 && sDist < minSep) {
      const push = (minSep - sDist) / minSep;
      out.wishX += (sx / sDist) * push * 1.4;
      out.wishY += (sy / sDist) * push * 1.4;
    }
  }

  // Obstacle avoidance feeler
  for (let i = 0; i < map.obstacles.length; i++) {
    const obs: Obstacle = map.obstacles[i];
    if (obs.destroyed) continue;
    const ox = enemy.phys.pos.x - obs.x;
    const oy = enemy.phys.pos.y - obs.y;
    const safeDist = Math.max(obs.w, obs.h) * 0.5 + enemy.spec.radius + 26;
    const oDist = Math.hypot(ox, oy);
    if (oDist > 0.1 && oDist < safeDist) {
      const push = (safeDist - oDist) / safeDist;
      out.wishX += (ox / oDist) * push * 1.6;
      out.wishY += (oy / oDist) * push * 1.6;
    }
  }

  const wishMag = Math.hypot(out.wishX, out.wishY);
  if (wishMag > 1) {
    out.wishX /= wishMag;
    out.wishY /= wishMag;
  }

  // Firing logic with LOS, aim alignment, and attack token budget
  // Stealth assassins hold fire while cloaked at long range to ambush cleanly up close
  const holdingFireForAmbush =
    arch === 'assassin' && Boolean(enemy.stealth?.active) && enemy.stealth?.revealedTimer === 0 && dist > 235;
  const aimAligned = Math.abs(shortestAngleDiff(enemy.phys.aimAngle, desiredAim)) < 0.24;
  if (
    !holdingFireForAmbush &&
    bestHasLos &&
    aimAligned &&
    dist <= enemy.primary.spec.range * 0.95 &&
    enemy.primary.cooldown <= 0 &&
    !enemy.primary.reloading
  ) {
    if (attackTokens.used < attackTokens.max) {
      attackTokens.used++;
      if (bp.windupDuration > 0) {
        enemy.windupTimer = bp.windupDuration;
        enemy.windupTargetPos = { x: aimTargetX, y: aimTargetY };
      } else {
        out.firePrimary = true;
      }
    }
  }

  if (
    (arch === 'heavy' || (arch === 'assassin' && !holdingFireForAmbush)) &&
    bestHasLos &&
    aimAligned &&
    dist <= enemy.secondary.spec.range * 0.9 &&
    enemy.secondary.cooldown <= 0 &&
    !enemy.secondary.reloading &&
    attackTokens.used < attackTokens.max
  ) {
    attackTokens.used++;
    out.fireSecondary = true;
  }

  return out;
}
