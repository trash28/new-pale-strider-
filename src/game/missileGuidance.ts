import { doesSegmentCrossSmoke, isPointInSmoke, SmokeCloud } from './mortarSystem';
import { segmentIntersectsAABB } from './pathfinding';
import { shortestAngleDiff } from './physics';
import { Obstacle } from './types';
import { MissileProfile } from './missileTypes';

export interface MissileTargetState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  altitude: number;
  alive: boolean;
}

export interface MissileGuidanceInput {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  missileAlt: number;
  trackingLost: boolean;
  lastKnownX: number;
  lastKnownY: number;
  swarmSeed: number;
}

export interface MissileGuidanceResult {
  desiredAngle: number | null;
  trackingLost: boolean;
  lastKnownX: number;
  lastKnownY: number;
  targetDist: number;
}

export function isSolidMissileCover(obs: Obstacle): boolean {
  if (obs.destroyed) return false;
  if (obs.kind === 'tree' || obs.kind === 'crate') return false;
  return (
    obs.kind === 'building' ||
    obs.kind === 'bunker' ||
    obs.kind === 'rock' ||
    obs.kind === 'tank_wreck' ||
    obs.kind === 'ruin' ||
    obs.kind === 'fuel_tank' ||
    obs.kind === 'watchtower' ||
    obs.kind === 'crane' ||
    obs.kind === 'bridge_pylon' ||
    obs.kind === 'radar_dish' ||
    obs.kind === 'silo' ||
    obs.kind === 'monolith'
  );
}

export function hasMissileLineOfSight(
  mx: number,
  my: number,
  missileAlt: number,
  tx: number,
  ty: number,
  targetAlt: number,
  obstacles: Obstacle[]
): boolean {
  const avgAlt = (missileAlt + targetAlt) * 0.5;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (!isSolidMissileCover(obs)) continue;
    // Only tall buildings block high-altitude shots; low cover blocks low-altitude seekers
    if (avgAlt > 42 && obs.kind !== 'building' && obs.height < 42) continue;
    if (segmentIntersectsAABB(mx, my, tx, ty, obs.x, obs.y, obs.w, obs.h)) {
      return false;
    }
  }
  return true;
}

export function computeMissileGuidance(
  missile: MissileGuidanceInput,
  profile: MissileProfile,
  target: MissileTargetState | null,
  obstacles: Obstacle[],
  smokeClouds: SmokeCloud[]
): MissileGuidanceResult {
  if (missile.trackingLost) {
    return {
      desiredAngle: null,
      trackingLost: true,
      lastKnownX: missile.lastKnownX,
      lastKnownY: missile.lastKnownY,
      targetDist: Math.hypot(missile.lastKnownX - missile.x, missile.lastKnownY - missile.y),
    };
  }

  if (!target || !target.alive) {
    const distLast = Math.hypot(missile.lastKnownX - missile.x, missile.lastKnownY - missile.y);
    return {
      desiredAngle: null,
      trackingLost: true,
      lastKnownX: missile.lastKnownX,
      lastKnownY: missile.lastKnownY,
      targetDist: distLast,
    };
  }

  const dx = target.x - missile.x;
  const dy = target.y - missile.y;
  const dist = Math.hypot(dx, dy);

  if (dist > profile.maxTrackRange) {
    return {
      desiredAngle: null,
      trackingLost: true,
      lastKnownX: missile.lastKnownX,
      lastKnownY: missile.lastKnownY,
      targetDist: dist,
    };
  }

  // Seeker gimbal cone check after initial launch stabilization window
  const curAngle = Math.atan2(missile.vy, missile.vx);
  const directAngle = Math.atan2(dy, dx);
  const gimbalError = Math.abs(shortestAngleDiff(curAngle, directAngle));
  if (missile.life > 0.24 && gimbalError > profile.seekerConeRad) {
    return {
      desiredAngle: null,
      trackingLost: true,
      lastKnownX: missile.lastKnownX,
      lastKnownY: missile.lastKnownY,
      targetDist: dist,
    };
  }

  // Smoke & solid cover break seeker lock
  if (
    smokeClouds.length > 0 &&
    (isPointInSmoke(target.x, target.y, smokeClouds) ||
      doesSegmentCrossSmoke(missile.x, missile.y, target.x, target.y, smokeClouds))
  ) {
    return {
      desiredAngle: null,
      trackingLost: true,
      lastKnownX: missile.lastKnownX,
      lastKnownY: missile.lastKnownY,
      targetDist: dist,
    };
  }

  if (!hasMissileLineOfSight(missile.x, missile.y, missile.missileAlt, target.x, target.y, target.altitude, obstacles)) {
    return {
      desiredAngle: null,
      trackingLost: true,
      lastKnownX: missile.lastKnownX,
      lastKnownY: missile.lastKnownY,
      targetDist: dist,
    };
  }

  // Predictive velocity lead intercept
  const curSpeed = Math.max(120, Math.hypot(missile.vx, missile.vy));
  const tGo = Math.min(0.95, dist / curSpeed) * profile.leadFactor;
  let aimX = target.x + target.vx * tGo;
  let aimY = target.y + target.vy * tGo;

  // Swarm curved lateral arc during mid-flight, converging sharply near impact
  if (profile.weaveAmplitude > 0 && dist > 95) {
    const weaveFade = Math.min(1, (dist - 95) / 260);
    const perpX = -Math.sin(directAngle);
    const perpY = Math.cos(directAngle);
    const phase = missile.life * profile.weaveFreq + missile.swarmSeed * 6.283;
    const offset = Math.sin(phase) * profile.weaveAmplitude * weaveFade;
    aimX += perpX * offset;
    aimY += perpY * offset;
  }

  return {
    desiredAngle: Math.atan2(aimY - missile.y, aimX - missile.x),
    trackingLost: false,
    lastKnownX: target.x,
    lastKnownY: target.y,
    targetDist: dist,
  };
}
