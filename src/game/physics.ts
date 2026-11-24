import { ComponentHealth, Obstacle, TerrainType, Vec2 } from './types';

export interface MechPhysicsState {
  pos: Vec2;
  vel: Vec2;
  bodyAngle: number;
  angularVel: number;
  aimAngle: number;
  // Chassis suspension dynamics
  tiltX: number; // pitch forward/back
  tiltY: number; // roll left/right
  bounceZ: number; // vertical bob / suspension height
  bounceVelZ: number;
  recoilOffset: number; // barrel slide offset
  // Stability & accumulated recoil physics
  stability: number; // 0..1 current platform stability
  bracingFactor: number; // 0..1 firing stance brace progress
  recoilAccum: number; // consecutive shot destabilization
  recoilRecoverTimer: number;
  // Input smoothing for turn/direction change lag
  smoothedInputX: number;
  smoothedInputY: number;
  braking: boolean;
  sprinting: boolean;
  lastTerrain: TerrainType;
  grappleActive: boolean;
  grappleMomentumTimer: number;
}

export interface PhysicsConfig {
  mass: number;
  acceleration: number;
  maxSpeed: number;
  sprintMultiplier: number;
  reverseMultiplier: number;
  turnAccel: number;
  maxTurnSpeed: number;
  lateralGrip: number;
  radius: number;
  suspensionStiffness: number;
  terrainPenaltyMult: number;
}

export interface TerrainPhysicsModifiers {
  accelMult: number;
  maxSpeedMult: number;
  gripMult: number;
  stabilityMult: number;
  disturbance: number;
  slopeVec: Vec2;
}

export function getTerrainModifiers(terrain: TerrainType, penaltyMult = 1): TerrainPhysicsModifiers {
  const lerpPenalty = (base: number) => 1 - (1 - base) * penaltyMult;
  switch (terrain) {
    case 'mud':
      return {
        accelMult: lerpPenalty(0.5),
        maxSpeedMult: lerpPenalty(0.64),
        gripMult: lerpPenalty(0.56),
        stabilityMult: lerpPenalty(0.75),
        disturbance: 0.28 * penaltyMult,
        slopeVec: { x: 0, y: 0 },
      };
    case 'sand':
      return {
        accelMult: lerpPenalty(0.8),
        maxSpeedMult: lerpPenalty(0.82),
        gripMult: lerpPenalty(0.78),
        stabilityMult: lerpPenalty(0.88),
        disturbance: 0.12 * penaltyMult,
        slopeVec: { x: 0, y: 0 },
      };
    case 'rocky':
      return {
        accelMult: lerpPenalty(0.78),
        maxSpeedMult: lerpPenalty(0.84),
        gripMult: lerpPenalty(0.88),
        stabilityMult: lerpPenalty(0.8),
        disturbance: 1.0 * penaltyMult,
        slopeVec: { x: 0, y: 0 },
      };
    case 'water':
      return {
        accelMult: lerpPenalty(0.56),
        maxSpeedMult: lerpPenalty(0.6),
        gripMult: lerpPenalty(0.72),
        stabilityMult: lerpPenalty(0.74),
        disturbance: 0.22 * penaltyMult,
        slopeVec: { x: 0, y: 0 },
      };
    case 'slope_n':
      return { accelMult: 0.9, maxSpeedMult: 0.94, gripMult: 0.94, stabilityMult: 0.9, disturbance: 0.16, slopeVec: { x: 0, y: 70 } };
    case 'slope_s':
      return { accelMult: 0.9, maxSpeedMult: 0.94, gripMult: 0.94, stabilityMult: 0.9, disturbance: 0.16, slopeVec: { x: 0, y: -70 } };
    case 'slope_e':
      return { accelMult: 0.9, maxSpeedMult: 0.94, gripMult: 0.94, stabilityMult: 0.9, disturbance: 0.16, slopeVec: { x: -70, y: 0 } };
    case 'slope_w':
      return { accelMult: 0.9, maxSpeedMult: 0.94, gripMult: 0.94, stabilityMult: 0.9, disturbance: 0.16, slopeVec: { x: 70, y: 0 } };
    case 'concrete':
    default:
      return { accelMult: 1, maxSpeedMult: 1, gripMult: 1, stabilityMult: 1, disturbance: 0, slopeVec: { x: 0, y: 0 } };
  }
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function shortestAngleDiff(from: number, to: number): number {
  return normalizeAngle(to - from);
}

export function createPhysicsState(x: number, y: number, angle = 0): MechPhysicsState {
  return {
    pos: { x, y },
    vel: { x: 0, y: 0 },
    bodyAngle: angle,
    angularVel: 0,
    aimAngle: angle,
    tiltX: 0,
    tiltY: 0,
    bounceZ: 0,
    bounceVelZ: 0,
    recoilOffset: 0,
    stability: 1,
    bracingFactor: 0,
    recoilAccum: 0,
    recoilRecoverTimer: 0,
    smoothedInputX: 0,
    smoothedInputY: 0,
    braking: false,
    sprinting: false,
    lastTerrain: 'concrete',
    grappleActive: false,
    grappleMomentumTimer: 0,
  };
}

export interface MechMoveInput {
  wishX: number; // world-space normalized wish vector X
  wishY: number; // world-space normalized wish vector Y
  sprint: boolean;
  braking?: boolean;
  anchored?: boolean; // firing stance / siege lock
  bracing?: boolean; // heavy weapon preparation lock
  time: number;
}

export function stepMechPhysics(
  state: MechPhysicsState,
  cfg: PhysicsConfig,
  input: MechMoveInput,
  terrain: TerrainType,
  components: ComponentHealth,
  dt: number
): { speed: number; forwardSpeed: number; lateralSpeed: number } {
  state.lastTerrain = terrain;
  const tMod = getTerrainModifiers(terrain, cfg.terrainPenaltyMult);

  // Component health multipliers
  const engineRatio = Math.max(0.25, components.engine / Math.max(1, components.maxEngine));
  const leftLegRatio = components.leftLegs / Math.max(1, components.maxLeftLegs);
  const rightLegRatio = components.rightLegs / Math.max(1, components.maxRightLegs);
  const legAvg = Math.max(0.2, (leftLegRatio + rightLegRatio) * 0.5);
  const legImbalance = leftLegRatio - rightLegRatio;

  // Bracing factor smoothly ramps up when entering firing stance / weapon prep
  const wantBrace = Boolean(input.anchored || input.bracing);
  const braceRate = wantBrace ? 5.2 : 3.2;
  state.bracingFactor += ((wantBrace ? 1 : 0) - state.bracingFactor) * (1 - Math.exp(-braceRate * dt));

  // Direction-change lag scales strongly with mass (heavy 68t walker lags far more than 18t scout)
  const massFactor = Math.max(0.5, cfg.mass / 34);
  const inputResponsiveness = Math.max(1.9, 6.8 / Math.pow(massFactor, 0.72));
  const inputAlpha = 1 - Math.exp(-inputResponsiveness * dt);
  const lockMoveScale = input.anchored ? 0.08 : input.bracing ? 0.25 : 1.0;
  const targetWishX = input.wishX * lockMoveScale;
  const targetWishY = input.wishY * lockMoveScale;
  state.smoothedInputX += (targetWishX - state.smoothedInputX) * inputAlpha;
  state.smoothedInputY += (targetWishY - state.smoothedInputY) * inputAlpha;

  const wishMag = Math.hypot(state.smoothedInputX, state.smoothedInputY);
  const hasWish = wishMag > 0.04;

  state.sprinting = Boolean(input.sprint && hasWish && !wantBrace && legAvg > 0.45);
  const sprintMult = state.sprinting ? cfg.sprintMultiplier : 1.0;

  const effectiveMaxSpeed =
    cfg.maxSpeed *
    sprintMult *
    tMod.maxSpeedMult *
    (1 - state.bracingFactor * 0.72) *
    (0.45 + 0.55 * legAvg) *
    (0.55 + 0.45 * engineRatio);

  const effectiveAccel =
    cfg.acceleration *
    (state.sprinting ? 1.15 : 1.0) *
    tMod.accelMult *
    (1 - state.bracingFactor * 0.65) *
    engineRatio *
    (0.4 + 0.6 * legAvg);

  const forwardX = Math.cos(state.bodyAngle);
  const forwardY = Math.sin(state.bodyAngle);
  const rightX = -forwardY;
  const rightY = forwardX;

  const curVelMag = Math.hypot(state.vel.x, state.vel.y);
  const speedRatio = Math.min(1.3, curVelMag / Math.max(30, cfg.maxSpeed));

  // Heavy turning physics: turning resistance increases with movement speed & mass inertia
  const speedTurnPenalty = 1 / (1 + speedRatio * (0.48 + massFactor * 0.22));
  const braceTurnPenalty = 1 - state.bracingFactor * 0.65;
  let desiredTurnTorque = 0;

  if (hasWish && !input.anchored) {
    const wishAngle = Math.atan2(state.smoothedInputY, state.smoothedInputX);
    let diff = shortestAngleDiff(state.bodyAngle, wishAngle);
    if (Math.abs(diff) > Math.PI * 0.76 && curVelMag < effectiveMaxSpeed * 0.45) {
      diff = shortestAngleDiff(state.bodyAngle, wishAngle + Math.PI);
    }
    const maxTurn = cfg.maxTurnSpeed * speedTurnPenalty * braceTurnPenalty * (0.45 + 0.55 * legAvg);
    const desiredAngVel = Math.max(-maxTurn, Math.min(maxTurn, diff * 3.2));
    desiredTurnTorque = (desiredAngVel - state.angularVel) * cfg.turnAccel;
  } else {
    // Rotational momentum decays gradually according to mass inertia
    const rotDamp = Math.max(2.2, cfg.turnAccel * 0.95);
    desiredTurnTorque = -state.angularVel * rotDamp;
  }

  // Asymmetric leg damage pulls chassis off-track
  desiredTurnTorque += legImbalance * 1.45 * Math.min(1, curVelMag / 55);

  state.angularVel += desiredTurnTorque * dt;
  const maxAllowedAng = cfg.maxTurnSpeed * 1.35;
  state.angularVel = Math.max(-maxAllowedAng, Math.min(maxAllowedAng, state.angularVel));
  state.bodyAngle = normalizeAngle(state.bodyAngle + state.angularVel * dt);

  const fwdSpeed = state.vel.x * forwardX + state.vel.y * forwardY;
  const latSpeed = state.vel.x * rightX + state.vel.y * rightY;

  // Emergency braking detection: player strongly reverses direction against current velocity
  const rawWishMag = Math.hypot(input.wishX, input.wishY);
  const dotRawWishVel =
    curVelMag > 10 && rawWishMag > 0.1
      ? (input.wishX * state.vel.x + input.wishY * state.vel.y) / (curVelMag * rawWishMag)
      : 1;
  state.braking = Boolean(input.braking || (rawWishMag > 0.1 && dotRawWishVel < -0.32 && curVelMag > 16));

  const prevVelX = state.vel.x;
  const prevVelY = state.vel.y;

  // Apply thrust along wish vector; emergency braking resists instant reversal until momentum bleeds down
  if (hasWish && !input.braking) {
    const wishDotFwd = state.smoothedInputX * forwardX + state.smoothedInputY * forwardY;
    const revScale = wishDotFwd < -0.25 ? cfg.reverseMultiplier : 1.0;
    const brakeThrustResist = state.braking ? 0.25 : 1.0;
    state.vel.x += state.smoothedInputX * effectiveAccel * revScale * brakeThrustResist * dt;
    state.vel.y += state.smoothedInputY * effectiveAccel * revScale * brakeThrustResist * dt;
  }

  // Slope gravity pull
  state.vel.x += tMod.slopeVec.x * dt;
  state.vel.y += tMod.slopeVec.y * dt;

  // Lateral grip vs heavy drift (reduced during grapple swing/glide so lateral swing arcs flow!)
  const newFwd = state.vel.x * forwardX + state.vel.y * forwardY;
  const newLat = state.vel.x * rightX + state.vel.y * rightY;
  const inGrappleGlide = state.grappleActive || state.grappleMomentumTimer > 0;
  const gripDamp = inGrappleGlide
    ? Math.exp(-1.15 * dt)
    : Math.exp(-cfg.lateralGrip * tMod.gripMult * dt);
  const dampedLat = newLat * gripDamp;

  // Forward drag / coasting momentum / braking deceleration
  const massDragScale = 1 / Math.pow(massFactor, 0.52);
  const dragRate = state.grappleActive
    ? 0.42
    : state.grappleMomentumTimer > 0
    ? 0.78
    : wantBrace
    ? 8.5 * massDragScale + 2.5
    : state.braking
    ? (4.4 * tMod.gripMult) * massDragScale + 1.2
    : hasWish
    ? 0.65
    : (2.75 * tMod.gripMult) * massDragScale;
  const dampedFwd = newFwd * Math.exp(-dragRate * dt);

  state.vel.x = forwardX * dampedFwd + rightX * dampedLat;
  state.vel.y = forwardY * dampedFwd + rightY * dampedLat;

  // Soft speed cap (allows grapple momentum glide & weapon recoil impulses cleanly)
  const curSpeed = Math.hypot(state.vel.x, state.vel.y);
  const speedCeiling = inGrappleGlide ? Math.max(effectiveMaxSpeed, 1180) : effectiveMaxSpeed;
  if (curSpeed > speedCeiling && state.recoilRecoverTimer <= 0) {
    const excess = curSpeed - speedCeiling;
    const capped = speedCeiling + excess * Math.exp(-(inGrappleGlide ? 2.2 : 5.0) * dt);
    const scale = capped / curSpeed;
    state.vel.x *= scale;
    state.vel.y *= scale;
  }

  if (curSpeed < 1.0 && !hasWish && state.recoilRecoverTimer <= 0) {
    state.vel.x = 0;
    state.vel.y = 0;
  }

  // Integrate world position
  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;

  // Stability & grapple glide timer decay
  if (!state.grappleActive && state.grappleMomentumTimer > 0) {
    state.grappleMomentumTimer = Math.max(0, state.grappleMomentumTimer - dt);
  }
  state.recoilRecoverTimer = Math.max(0, state.recoilRecoverTimer - dt);
  state.recoilAccum = Math.max(0, state.recoilAccum - dt * (0.35 + state.bracingFactor * 0.45));

  const moveUnstablePenalty = speedRatio * (state.sprinting ? 0.42 : 0.24);
  const legStabilityCap = 0.45 + 0.55 * legAvg;
  const braceStabilityBonus = state.bracingFactor * 0.25;
  const maxCurrentStability = Math.max(
    0.22,
    Math.min(1.0, (1.0 - moveUnstablePenalty + braceStabilityBonus) * legStabilityCap * tMod.stabilityMult)
  );
  const stabRecoverRate = (0.28 + state.bracingFactor * 0.32) * legAvg;
  if (state.stability < maxCurrentStability) {
    state.stability = Math.min(maxCurrentStability, state.stability + stabRecoverRate * dt);
  } else {
    state.stability += (maxCurrentStability - state.stability) * (1 - Math.exp(-4.0 * dt));
  }

  // Suspension pitch/roll & vertical bounce spring
  const accelX = (state.vel.x - prevVelX) / Math.max(0.001, dt);
  const accelY = (state.vel.y - prevVelY) / Math.max(0.001, dt);
  const fwdAccel = accelX * forwardX + accelY * forwardY;
  const latAccel = accelX * rightX + accelY * rightY;

  // When braking hard, chassis pitches forward visibly; when bracing, chassis lowers slightly
  const brakePitch = state.braking ? 0.085 : 0;
  const targetTiltX = Math.max(-0.26, Math.min(0.26, -fwdAccel * 0.00042 + brakePitch));
  const targetTiltY = Math.max(-0.26, Math.min(0.26, latAccel * 0.00045 + legImbalance * 0.16));
  const tiltAlpha = 1 - Math.exp(-7.5 * cfg.suspensionStiffness * dt);
  state.tiltX += (targetTiltX - state.tiltX) * tiltAlpha;
  state.tiltY += (targetTiltY - state.tiltY) * tiltAlpha;

  const targetRestingBounce = -state.bracingFactor * 3.4;
  const roughShake =
    tMod.disturbance * (curSpeed / Math.max(30, cfg.maxSpeed)) * Math.sin(input.time * 18) * 1.8;
  const springForce =
    -(state.bounceZ - targetRestingBounce) * (48 * cfg.suspensionStiffness) - state.bounceVelZ * 7.8;
  state.bounceVelZ += (springForce + roughShake * 24) * dt;
  state.bounceZ += state.bounceVelZ * dt;
  state.bounceZ = Math.max(-8, Math.min(7, state.bounceZ));

  // Barrel slide recoil recovery
  state.recoilOffset *= Math.exp(-9.5 * dt);

  return {
    speed: Math.hypot(state.vel.x, state.vel.y),
    forwardSpeed: fwdSpeed,
    lateralSpeed: latSpeed,
  };
}

export function resolveObstacleCollisions(
  pos: Vec2,
  vel: Vec2,
  radius: number,
  obstacles: Obstacle[],
  mapWidth: number,
  mapHeight: number
): boolean {
  let collided = false;
  const margin = radius + 16;
  if (pos.x < margin) {
    pos.x = margin;
    if (vel.x < 0) vel.x *= -0.15;
    collided = true;
  } else if (pos.x > mapWidth - margin) {
    pos.x = mapWidth - margin;
    if (vel.x > 0) vel.x *= -0.15;
    collided = true;
  }
  if (pos.y < margin) {
    pos.y = margin;
    if (vel.y < 0) vel.y *= -0.15;
    collided = true;
  } else if (pos.y > mapHeight - margin) {
    pos.y = mapHeight - margin;
    if (vel.y > 0) vel.y *= -0.15;
    collided = true;
  }

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (obs.destroyed) continue;
    const halfW = obs.w * 0.5;
    const halfH = obs.h * 0.5;
    const closestX = Math.max(obs.x - halfW, Math.min(pos.x, obs.x + halfW));
    const closestY = Math.max(obs.y - halfH, Math.min(pos.y, obs.y + halfH));
    const dx = pos.x - closestX;
    const dy = pos.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < radius * radius) {
      collided = true;
      const dist = Math.sqrt(distSq);
      let nx = 0;
      let ny = 0;
      let pen = 0;
      if (dist > 0.0001) {
        nx = dx / dist;
        ny = dy / dist;
        pen = radius - dist;
      } else {
        const penLeft = Math.abs(pos.x - (obs.x - halfW));
        const penRight = Math.abs(obs.x + halfW - pos.x);
        const penTop = Math.abs(pos.y - (obs.y - halfH));
        const penBottom = Math.abs(obs.y + halfH - pos.y);
        const minPen = Math.min(penLeft, penRight, penTop, penBottom);
        if (minPen === penLeft) {
          nx = -1;
          pen = penLeft + radius;
        } else if (minPen === penRight) {
          nx = 1;
          pen = penRight + radius;
        } else if (minPen === penTop) {
          ny = -1;
          pen = penTop + radius;
        } else {
          ny = 1;
          pen = penBottom + radius;
        }
      }
      pos.x += nx * pen;
      pos.y += ny * pen;
      const vn = vel.x * nx + vel.y * ny;
      if (vn < 0) {
        vel.x -= nx * vn * 1.05;
        vel.y -= ny * vn * 1.05;
      }
    }
  }
  return collided;
}

export interface RecoilPhysicsOptions {
  recoilTorque?: number;
  barrelOffsetY?: number;
  stabilityCost?: number;
  legAvgRatio?: number;
  visualScale?: number;
}

export function applyRecoilImpulse(
  state: MechPhysicsState,
  aimAngle: number,
  impulse: number,
  mass: number,
  options?: RecoilPhysicsOptions
): void {
  const legRatio = Math.max(0.2, options?.legAvgRatio ?? 1.0);
  // Crippled legs & low stability dramatically reduce recoil absorption!
  const braceResistance = 1 - state.bracingFactor * 0.42;
  const legWeaknessMult = 1 + (1 - legRatio) * 0.85;
  const instabilityMult = 1 + (1 - state.stability) * 0.45;
  const totalForceMult = braceResistance * legWeaknessMult * instabilityMult;

  const dv = (impulse * totalForceMult) / Math.max(10, mass * 0.14);
  state.vel.x -= Math.cos(aimAngle) * dv;
  state.vel.y -= Math.sin(aimAngle) * dv;

  // Rotational chassis torque from off-center firing angle + lateral weapon offset
  const relAngle = shortestAngleDiff(state.bodyAngle, aimAngle);
  const offAxis = Math.sin(relAngle);
  const lateralOffset = (options?.barrelOffsetY ?? 0) * 0.08;
  const torqueMult = options?.recoilTorque ?? 0.35;
  const angImpulse = ((offAxis * 0.85 + lateralOffset) * impulse * torqueMult * totalForceMult) / Math.max(12, mass * 1.25);
  state.angularVel += angImpulse;

  // Visual barrel slide & physical suspension slam
  const vScale = options?.visualScale ?? 1.0;
  state.recoilOffset = Math.min(18, state.recoilOffset + impulse * 0.068 * vScale);
  state.tiltX -= Math.cos(relAngle) * Math.min(0.24, impulse * 0.0012 * totalForceMult * vScale);
  state.tiltY -= Math.sin(relAngle) * Math.min(0.24, impulse * 0.0012 * totalForceMult * vScale);
  state.bounceVelZ -= Math.min(58, impulse * 0.24 * totalForceMult * vScale);

  // Deplete stability and track consecutive recoil recovery
  const stabCost = (options?.stabilityCost ?? impulse * 0.0022) * legWeaknessMult * braceResistance;
  state.stability = Math.max(0.05, state.stability - stabCost);
  state.recoilAccum = Math.min(1.5, state.recoilAccum + stabCost * 1.15);
  state.recoilRecoverTimer = Math.max(state.recoilRecoverTimer, Math.min(0.85, impulse * 0.0022));
}
