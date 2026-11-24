import { hasLineOfSight } from './pathfinding';
import { MechPhysicsState } from './physics';
import { Obstacle, Vec2 } from './types';

export type GrappleState = 'idle' | 'deploying' | 'attached' | 'retracting';

export interface GrappleTargetCandidate {
  obstacleId: string;
  anchorX: number;
  anchorY: number;
  distance: number;
  valid: boolean;
  reason: 'ready' | 'out_of_range' | 'blocked';
}

export class GrappleTargetRegistry {
  public static isObstacleGrappleable(obs: Obstacle): boolean {
    if (obs.destroyed) return false;
    if (obs.kind === 'crate' || obs.kind === 'fuel_tank') return false;
    if (obs.kind === 'tree' && Math.max(obs.w, obs.h) < 36) return false;
    // All structural & natural grapple anchors are indestructible and non-explosive
    return Math.max(obs.w, obs.h) >= 30;
  }

  public static findBestTarget(
    origin: Vec2,
    cursorWorld: Vec2,
    obstacles: Obstacle[],
    maxReach: number
  ): GrappleTargetCandidate | null {
    let best: GrappleTargetCandidate | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (!this.isObstacleGrappleable(obs)) continue;

      const hw = obs.w * 0.5;
      const hh = obs.h * 0.5;
      // Find closest perimeter surface point toward cursor/origin line
      const clampedX = Math.max(obs.x - hw, Math.min(cursorWorld.x, obs.x + hw));
      const clampedY = Math.max(obs.y - hh, Math.min(cursorWorld.y, obs.y + hh));
      const distCursor = Math.hypot(clampedX - cursorWorld.x, clampedY - cursorWorld.y);
      if (distCursor > 250) continue;

      // Project anchor onto surface edge facing player so cable visibly clamps to exterior wall
      const dirX = origin.x - obs.x;
      const dirY = origin.y - obs.y;
      let anchorX = clampedX;
      let anchorY = clampedY;
      if (Math.abs(clampedX - obs.x) < hw * 0.9 && Math.abs(clampedY - obs.y) < hh * 0.9) {
        if (Math.abs(dirX / Math.max(1, hw)) > Math.abs(dirY / Math.max(1, hh))) {
          anchorX = obs.x + Math.sign(dirX || 1) * hw;
        } else {
          anchorY = obs.y + Math.sign(dirY || 1) * hh;
        }
      }

      const distFromOrigin = Math.hypot(anchorX - origin.x, anchorY - origin.y);
      if (distFromOrigin < 42 || distFromOrigin > maxReach * 1.35) continue;

      const inRange = distFromOrigin <= maxReach;
      // Check clear LOS slightly short of obstacle surface
      const nx = (anchorX - origin.x) / distFromOrigin;
      const ny = (anchorY - origin.y) / distFromOrigin;
      const checkEnd = { x: anchorX - nx * 10, y: anchorY - ny * 10 };
      const los = hasLineOfSight(origin, checkEnd, obstacles);

      const score = distCursor + (inRange ? 0 : 120) + (los ? 0 : 250);
      if (score < bestScore) {
        bestScore = score;
        best = {
          obstacleId: obs.id,
          anchorX,
          anchorY,
          distance: distFromOrigin,
          valid: inRange && los,
          reason: !inRange ? 'out_of_range' : !los ? 'blocked' : 'ready',
        };
      }
    }

    return best;
  }
}

export class GrappleController {
  public state: GrappleState = 'idle';
  public maxReach = 840;
  public cooldownTotal = 1.35;
  public cooldownTimer = 0;

  public anchorPos: Vec2 = { x: 0, y: 0 };
  public targetObstacleId: string | null = null;
  public cableTip: Vec2 = { x: 0, y: 0 };
  public ropeLength = 0;
  public tension = 0; // 0..1 normalized tension indicator
  public deployProgress = 0;
  public retractTimer = 0;
  public attachDuration = 0;
  public releaseBoostWindow = 0; // allows Grapple-Dash synergy shortly after release
  public hoveredCandidate: GrappleTargetCandidate | null = null;
  public swingArcSign: -1 | 0 | 1 = 0;
  public latchImpactFlash = 0;

  public reset(): void {
    this.state = 'idle';
    this.cooldownTimer = 0;
    this.targetObstacleId = null;
    this.ropeLength = 0;
    this.tension = 0;
    this.deployProgress = 0;
    this.retractTimer = 0;
    this.attachDuration = 0;
    this.releaseBoostWindow = 0;
    this.hoveredCandidate = null;
    this.swingArcSign = 0;
    this.latchImpactFlash = 0;
  }

  public refreshCandidate(origin: Vec2, cursorWorld: Vec2, obstacles: Obstacle[]): void {
    this.hoveredCandidate = GrappleTargetRegistry.findBestTarget(origin, cursorWorld, obstacles, this.maxReach);
  }

  public toggleFire(origin: Vec2, cursorWorld: Vec2, obstacles: Obstacle[]): 'fired' | 'detached' | 'failed' {
    if (this.state === 'attached' || this.state === 'deploying') {
      this.detach();
      return 'detached';
    }
    if (this.cooldownTimer > 0) return 'failed';

    const cand = GrappleTargetRegistry.findBestTarget(origin, cursorWorld, obstacles, this.maxReach);
    this.hoveredCandidate = cand;
    if (!cand || !cand.valid) return 'failed';

    this.state = 'deploying';
    this.anchorPos = { x: cand.anchorX, y: cand.anchorY };
    this.targetObstacleId = cand.obstacleId;
    this.cableTip = { x: origin.x, y: origin.y };
    this.ropeLength = cand.distance;
    this.deployProgress = 0;
    this.attachDuration = 0;
    this.tension = 0.25;
    this.swingArcSign = 0;
    return 'fired';
  }

  public detach(phys?: MechPhysicsState): void {
    if (this.state === 'idle' || this.state === 'retracting') return;
    if (this.state === 'attached' || this.state === 'deploying') {
      this.releaseBoostWindow = 0.65;
    }
    if (phys) {
      phys.grappleActive = false;
      const spd = Math.hypot(phys.vel.x, phys.vel.y);
      if (this.state === 'attached' && spd > 90) {
        phys.grappleMomentumTimer = 1.45;
        // Release slingshot carry impulse along velocity direction
        const boost = Math.min(220, spd * 0.28 + 90);
        phys.vel.x += (phys.vel.x / spd) * boost;
        phys.vel.y += (phys.vel.y / spd) * boost;
        const capped = Math.hypot(phys.vel.x, phys.vel.y);
        if (capped > 1150) {
          phys.vel.x = (phys.vel.x / capped) * 1150;
          phys.vel.y = (phys.vel.y / capped) * 1150;
        }
      }
    }
    this.state = 'retracting';
    this.retractTimer = 0.14;
    this.targetObstacleId = null;
    this.tension = 0;
    this.swingArcSign = 0;
    this.cooldownTimer = Math.max(this.cooldownTimer, 0.72);
  }

  public update(
    dt: number,
    phys: MechPhysicsState,
    mass: number,
    wishX: number,
    wishY: number,
    obstacles: Obstacle[],
    opts?: { reelingIn?: boolean }
  ): { justLatched: boolean; attachedTick: boolean; justReleased: boolean } {
    let justLatched = false;
    let attachedTick = false;
    let justReleased = false;

    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }
    if (this.releaseBoostWindow > 0) {
      this.releaseBoostWindow = Math.max(0, this.releaseBoostWindow - dt);
    }
    if (this.latchImpactFlash > 0) {
      this.latchImpactFlash = Math.max(0, this.latchImpactFlash - dt);
    }

    if (this.state === 'idle') {
      phys.grappleActive = false;
      return { justLatched, attachedTick, justReleased };
    }

    // Verify anchor obstacle is still intact
    if (this.targetObstacleId) {
      const obs = obstacles.find((o) => o.id === this.targetObstacleId);
      if (!obs || obs.destroyed) {
        this.detach(phys);
        justReleased = true;
        return { justLatched, attachedTick, justReleased };
      }
    }

    if (this.state === 'deploying') {
      phys.grappleActive = false;
      this.deployProgress = Math.min(1, this.deployProgress + dt * 16.5);
      this.cableTip.x = phys.pos.x + (this.anchorPos.x - phys.pos.x) * this.deployProgress;
      this.cableTip.y = phys.pos.y + (this.anchorPos.y - phys.pos.y) * this.deployProgress;
      if (this.deployProgress >= 1) {
        this.state = 'attached';
        this.ropeLength = Math.max(64, Math.hypot(this.anchorPos.x - phys.pos.x, this.anchorPos.y - phys.pos.y));
        this.latchImpactFlash = 0.22;
        phys.grappleActive = true;
        phys.grappleMomentumTimer = 1.35;
        // Immediate high-impulse initial tug toward anchor so launch feels crisp and responsive
        const idx = this.anchorPos.x - phys.pos.x;
        const idy = this.anchorPos.y - phys.pos.y;
        const idist = Math.hypot(idx, idy) || 1;
        const massScale = Math.max(0.65, Math.min(1.65, 34 / Math.max(14, mass)));
        phys.vel.x += (idx / idist) * 145 * massScale;
        phys.vel.y += (idy / idist) * 145 * massScale;
        justLatched = true;
      }
      return { justLatched, attachedTick, justReleased };
    }

    if (this.state === 'retracting') {
      phys.grappleActive = false;
      this.retractTimer -= dt;
      const k = Math.max(0, this.retractTimer / 0.14);
      this.cableTip.x = phys.pos.x + (this.anchorPos.x - phys.pos.x) * k;
      this.cableTip.y = phys.pos.y + (this.anchorPos.y - phys.pos.y) * k;
      if (this.retractTimer <= 0) {
        this.state = 'idle';
      }
      return { justLatched, attachedTick, justReleased };
    }

    // ATTACHED: True pendulum + slingshot momentum physics
    attachedTick = true;
    phys.grappleActive = true;
    phys.grappleMomentumTimer = Math.max(phys.grappleMomentumTimer, 0.85);
    this.attachDuration += dt;
    this.cableTip.x = this.anchorPos.x;
    this.cableTip.y = this.anchorPos.y;

    const dx = this.anchorPos.x - phys.pos.x;
    const dy = this.anchorPos.y - phys.pos.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 46 || dist > this.maxReach * 1.45 || this.attachDuration > 5.0) {
      this.detach(phys);
      justReleased = true;
      return { justLatched, attachedTick: false, justReleased };
    }

    const dirX = dx / Math.max(0.001, dist);
    const dirY = dy / Math.max(0.001, dist);
    const tangX = -dirY;
    const tangY = dirX;

    // Reel in smoothly (faster if holding toward anchor or explicitly reeling)
    const wishToward = wishX * dirX + wishY * dirY;
    const wishTang = wishX * tangX + wishY * tangY;
    const isSwingingSideways = Math.abs(wishTang) > 0.2;
    const reelRate = opts?.reelingIn ? 360 : wishToward > 0.25 ? 295 : isSwingingSideways ? 85 : 175;
    this.ropeLength = Math.max(58, this.ropeLength - reelRate * dt);

    const massFactor = Math.max(0.62, Math.min(1.85, 34 / Math.max(14, mass)));

    // Radial winch pull (stronger direct pull when steering straight toward anchor)
    const goingStraight = wishToward > 0.3 && Math.abs(wishTang) <= 0.18;
    const pullAccel = (goingStraight ? 1060 : 860) * massFactor;
    phys.vel.x += dirX * pullAccel * dt;
    phys.vel.y += dirY * pullAccel * dt;

    // Perpendicular pendulum swing thrust & momentum pumping (only when deliberately curving)
    if (Math.abs(wishTang) > 0.12) {
      this.swingArcSign = wishTang > 0 ? 1 : -1;
      const swingThrust = 760 * massFactor;
      phys.vel.x += tangX * wishTang * swingThrust * dt;
      phys.vel.y += tangY * wishTang * swingThrust * dt;
    } else {
      this.swingArcSign = 0;
      if (goingStraight) {
        // Gently damp lateral drift so straight grapples track straight instead of circling
        const lat = phys.vel.x * tangX + phys.vel.y * tangY;
        const damp = lat * Math.min(1, dt * 4.5);
        phys.vel.x -= tangX * damp;
        phys.vel.y -= tangY * damp;
      }
    }

    // True pendulum tether constraint: convert outward radial stretch cleanly into arc swing velocity
    const radVel = phys.vel.x * dirX + phys.vel.y * dirY;
    const tanVel = phys.vel.x * tangX + phys.vel.y * tangY;
    if (dist >= this.ropeLength) {
      const stretch = dist - this.ropeLength;
      if (radVel < 0) {
        // Redirect outward speed into tangential swing energy (pendulum conservation!)
        const transfer = Math.abs(radVel) * 0.45 * (tanVel >= 0 ? 1 : -1);
        const newTanVel = tanVel + transfer;
        const correctedRad = Math.max(0, radVel * 0.25) + Math.min(920, stretch * 22) * dt;
        phys.vel.x = dirX * correctedRad + tangX * newTanVel;
        phys.vel.y = dirY * correctedRad + tangY * newTanVel;
      } else {
        const springForce = Math.min(960, stretch * 19);
        phys.vel.x += dirX * springForce * dt;
        phys.vel.y += dirY * springForce * dt;
      }
      this.tension = Math.min(1, 0.52 + stretch / 80);
    } else {
      this.tension = Math.max(0.25, Math.min(0.92, Math.hypot(phys.vel.x, phys.vel.y) / 680));
    }

    // Bounded high-speed grapple sling cap (far faster than normal sprint, zero physics blowups)
    const curSpd = Math.hypot(phys.vel.x, phys.vel.y);
    const maxSling = 980 * Math.min(1.2, massFactor);
    if (curSpd > maxSling) {
      phys.vel.x = (phys.vel.x / curSpd) * maxSling;
      phys.vel.y = (phys.vel.y / curSpd) * maxSling;
    }

    // Dynamic chassis bank & pitch into the cable pull / swing arc
    const fwdX = Math.cos(phys.bodyAngle);
    const fwdY = Math.sin(phys.bodyAngle);
    const rightX = -fwdY;
    const rightY = fwdX;
    const velNormX = curSpd > 10 ? phys.vel.x / curSpd : dirX;
    const velNormY = curSpd > 10 ? phys.vel.y / curSpd : dirY;
    const targetTiltX = (velNormX * fwdX + velNormY * fwdY) * 0.22;
    const targetTiltY = (velNormX * rightX + velNormY * rightY) * 0.24;
    phys.tiltX += (targetTiltX - phys.tiltX) * Math.min(1, dt * 11);
    phys.tiltY += (targetTiltY - phys.tiltY) * Math.min(1, dt * 11);

    return { justLatched, attachedTick, justReleased };
  }
}
