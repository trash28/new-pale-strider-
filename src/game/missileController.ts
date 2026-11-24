import { SmokeCloud } from './mortarSystem';
import { shortestAngleDiff } from './physics';
import { Obstacle } from './types';
import { Projectile } from './weapons';
import { computeMissileGuidance, MissileTargetState } from './missileGuidance';
import { getMissileProfile } from './missileTypes';

export interface MissileStepResult {
  justLostLock: boolean;
  shouldPlayPassBy: boolean;
}

export function stepMissileProjectile(
  p: Projectile,
  target: MissileTargetState | null,
  obstacles: Obstacle[],
  smokeClouds: SmokeCloud[],
  dt: number,
  playerPos?: { x: number; y: number }
): MissileStepResult {
  const profile = getMissileProfile(p.missileType);
  const wasLost = Boolean(p.trackingLost);

  // Rapid booster acceleration from launch tube velocity to cruise max speed
  const curSpeed = Math.hypot(p.vx, p.vy) || profile.launchSpeed;
  const maxSpd = p.maxMissileSpeed ?? profile.maxSpeed;
  const accel = p.missileAccel ?? profile.acceleration;
  const nextSpeed = Math.min(maxSpd, curSpeed + accel * dt);
  p.missileSpeed = nextSpeed;

  // Interpolate missile altitude smoothly from launch altitude toward target altitude
  const startAlt = p.launchAltitude ?? 0;
  const tgtAlt = target?.altitude ?? 0;
  const altBlend = Math.min(1, p.life / 0.65);
  p.missileAlt = startAlt + (tgtAlt - startAlt) * altBlend;

  const guidance = computeMissileGuidance(
    {
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      life: p.life,
      missileAlt: p.missileAlt,
      trackingLost: Boolean(p.trackingLost),
      lastKnownX: p.lastKnownX ?? p.x,
      lastKnownY: p.lastKnownY ?? p.y,
      swarmSeed: p.swarmSeed ?? 0,
    },
    profile,
    target,
    obstacles,
    smokeClouds
  );

  p.trackingLost = guidance.trackingLost;
  p.lastKnownX = guidance.lastKnownX;
  p.lastKnownY = guidance.lastKnownY;

  let newAngle = Math.atan2(p.vy, p.vx);
  if (!guidance.trackingLost && guidance.desiredAngle !== null) {
    // High-speed G-turn penalty so fast missiles overshoot sharp perpendicular dashes/grapples
    const speedRatio = Math.max(0, Math.min(1, nextSpeed / Math.max(1, maxSpd)));
    const speedTurnFactor = 1 - (1 - profile.highSpeedTurnScale) * speedRatio;
    const baseTurn = p.homingTurnRate > 0 ? Math.max(profile.turnRateRad, p.homingTurnRate) : profile.turnRateRad;
    const maxTurn = baseTurn * speedTurnFactor * dt;

    const diff = shortestAngleDiff(newAngle, guidance.desiredAngle);
    const clampedStep = Math.max(-maxTurn, Math.min(maxTurn, diff));
    newAngle += clampedStep;
  }

  p.vx = Math.cos(newAngle) * nextSpeed;
  p.vy = Math.sin(newAngle) * nextSpeed;

  let shouldPlayPassBy = false;
  if (playerPos && !p.dopplerTriggered && p.team === 'enemy') {
    const dp = Math.hypot(p.x - playerPos.x, p.y - playerPos.y);
    if (dp <= 175 && nextSpeed >= 360) {
      p.dopplerTriggered = true;
      shouldPlayPassBy = true;
    }
  }

  return {
    justLostLock: !wasLost && guidance.trackingLost,
    shouldPlayPassBy,
  };
}

export interface CounterInterceptorStepResult {
  interceptedTarget: Projectile | null;
  selfDestructed: boolean;
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-4) {
    const ex = px - x1;
    const ey = py - y1;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + dx * t;
  const projY = y1 + dy * t;
  const ex = px - projX;
  const ey = py - projY;
  return ex * ex + ey * ey;
}

/**
 * Guides a defensive Counter-Interceptor Missile toward an incoming hostile missile
 * and detonates its proximity warhead in mid-air upon intercept.
 */
export function stepCounterInterceptorProjectile(
  p: Projectile,
  dt: number,
  allProjectiles: Projectile[],
  rng: () => number = Math.random
): CounterInterceptorStepResult {
  const curSpeed = Math.hypot(p.vx, p.vy) || 440;
  const maxSpd = p.maxMissileSpeed ?? 1420;
  const accel = p.missileAccel ?? 2750;
  const nextSpeed = Math.min(maxSpd, curSpeed + accel * dt);
  p.missileSpeed = nextSpeed;

  // Verify assigned target or re-acquire nearest hostile missile in flight
  let target = p.interceptTarget ?? null;
  if (!target || !target.active || target.kind !== 'missile' || target.isCounterInterceptor) {
    target = null;
    let bestD = 520;
    for (let i = 0; i < allProjectiles.length; i++) {
      const cand = allProjectiles[i];
      if (!cand.active || cand.kind !== 'missile' || cand.isCounterInterceptor) continue;
      if (cand.team === p.team) continue;
      const d = Math.hypot(cand.x - p.x, cand.y - p.y);
      if (d < bestD) {
        bestD = d;
        target = cand;
      }
    }
    p.interceptTarget = target;
  }

  if (!target) {
    if (p.life > 0.35) {
      p.active = false;
      return { interceptedTarget: null, selfDestructed: true };
    }
    return { interceptedTarget: null, selfDestructed: false };
  }

  // Smooth altitude match
  const tgtAlt = target.missileAlt ?? 0;
  p.missileAlt = (p.missileAlt ?? 0) + (tgtAlt - (p.missileAlt ?? 0)) * Math.min(1, dt * 8);

  // Predictive intercept lead calculation
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  const tti = Math.min(0.45, dist / Math.max(400, nextSpeed + Math.hypot(target.vx, target.vy) * 0.5));
  const aimX = target.x + target.vx * tti;
  const aimY = target.y + target.vy * tti;

  const desiredAngle = Math.atan2(aimY - p.y, aimX - p.x);
  const curAngle = Math.atan2(p.vy, p.vx);
  const maxTurn = Math.max(8.8, p.homingTurnRate) * dt;
  const diff = shortestAngleDiff(curAngle, desiredAngle);
  const newAngle = curAngle + Math.max(-maxTurn, Math.min(maxTurn, diff));

  p.vx = Math.cos(newAngle) * nextSpeed;
  p.vy = Math.sin(newAngle) * nextSpeed;

  // Proximity fuze detonation check (continuous segment check prevents tunneling)
  const fuzeRadius = 30;
  const distSq = pointToSegmentDistSq(target.x, target.y, p.prevX, p.prevY, p.x, p.y);
  if (distSq <= fuzeRadius * fuzeRadius || dist <= fuzeRadius) {
    const reliability = Math.min(0.86, p.interceptReliability ?? 0.8);
    p.active = false;
    if (rng() <= reliability) {
      target.missileHp = 0;
      target.active = false;
      return { interceptedTarget: target, selfDestructed: false };
    }
    // Glancing proximity blast still damages heavy warheads even on a partial miss
    if (target.missileHp !== undefined) {
      target.missileHp = Math.max(1, target.missileHp - 18);
    }
    return { interceptedTarget: null, selfDestructed: true };
  }

  return { interceptedTarget: null, selfDestructed: false };
}
