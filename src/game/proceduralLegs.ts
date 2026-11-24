import { MechPhysicsState } from './physics';
import { ComponentHealth, LegMountSpec, Obstacle, Vec2 } from './types';

export type GaitState =
  | 'idle'
  | 'slow_walk'
  | 'walking'
  | 'fast_walk'
  | 'running'
  | 'sprinting'
  | 'dashing'
  | 'strafing'
  | 'reversing'
  | 'turning'
  | 'braking'
  | 'grappling'
  | 'midair'
  | 'landing'
  | 'stumbling'
  | 'recovering'
  | 'anchored';

export interface ProceduralLeg {
  index: number;
  spec: LegMountSpec;
  hipPos: Vec2;
  kneePos: Vec2;
  footPos: Vec2;
  swingStartPos: Vec2;
  targetPos: Vec2;
  isSwinging: boolean;
  swingProgress: number; // 0..1
  liftZ: number; // 0..stepHeight
  compression: number; // 0..1 ground contact compression
  damageRatio: number; // 1 = healthy, 0 = destroyed
  destroyed: boolean;
  stepCooldown: number;
  limpPhase: number;
}

export interface FootstepEvent {
  x: number;
  y: number;
  side: 'left' | 'right';
}

export interface LegAnimatorConfig {
  strideLength: number;
  stepHeight: number;
  stepSpeed: number;
  maxSpeed: number;
  footstepWeight: number;
}

export interface GaitUpdateOptions {
  stanceSpreadMult?: number;
  anchored?: boolean;
  recoilKick?: number;
  dashing?: boolean;
  dashDir?: Vec2;
  grappling?: boolean;
  grappleDir?: Vec2;
  airborne?: boolean;
  altitude?: number;
  landingImpact?: number;
  stumbling?: boolean;
  recovering?: boolean;
}

interface GaitProfile {
  paceMult: number;
  strideMult: number;
  liftMult: number;
  leadTime: number;
  leanAmt: number;
}

const GAIT_PROFILES: Record<GaitState, GaitProfile> = {
  idle: { paceMult: 0.72, strideMult: 0.36, liftMult: 0.7, leadTime: 0.08, leanAmt: 0.0 },
  slow_walk: { paceMult: 0.76, strideMult: 0.44, liftMult: 0.8, leadTime: 0.12, leanAmt: 0.02 },
  walking: { paceMult: 0.92, strideMult: 0.54, liftMult: 0.94, leadTime: 0.15, leanAmt: 0.04 },
  fast_walk: { paceMult: 1.06, strideMult: 0.6, liftMult: 1.05, leadTime: 0.18, leanAmt: 0.06 },
  running: { paceMult: 1.22, strideMult: 0.68, liftMult: 1.2, leadTime: 0.21, leanAmt: 0.085 },
  sprinting: { paceMult: 1.48, strideMult: 0.78, liftMult: 1.38, leadTime: 0.24, leanAmt: 0.12 },
  dashing: { paceMult: 2.35, strideMult: 0.95, liftMult: 1.45, leadTime: 0.22, leanAmt: 0.18 },
  strafing: { paceMult: 1.08, strideMult: 0.56, liftMult: 1.0, leadTime: 0.16, leanAmt: 0.05 },
  reversing: { paceMult: 0.9, strideMult: 0.5, liftMult: 0.9, leadTime: 0.14, leanAmt: -0.05 },
  turning: { paceMult: 0.96, strideMult: 0.42, liftMult: 0.85, leadTime: 0.12, leanAmt: 0.0 },
  braking: { paceMult: 1.15, strideMult: 0.45, liftMult: 0.75, leadTime: 0.1, leanAmt: -0.09 },
  grappling: { paceMult: 1.85, strideMult: 0.82, liftMult: 1.25, leadTime: 0.2, leanAmt: 0.14 },
  midair: { paceMult: 1.0, strideMult: 0.5, liftMult: 0.5, leadTime: 0.05, leanAmt: 0.1 },
  landing: { paceMult: 1.4, strideMult: 0.4, liftMult: 0.55, leadTime: 0.08, leanAmt: 0.04 },
  stumbling: { paceMult: 1.35, strideMult: 0.48, liftMult: 1.1, leadTime: 0.1, leanAmt: -0.08 },
  recovering: { paceMult: 0.98, strideMult: 0.48, liftMult: 0.88, leadTime: 0.13, leanAmt: 0.02 },
  anchored: { paceMult: 0.72, strideMult: 0.36, liftMult: 0.68, leadTime: 0.06, leanAmt: 0.0 },
};

/**
 * High-speed safe 2-bone analytic IK in angled 2.5D top-down space.
 * Guarantees finite positions, strict min/max reach clamps, no joint flipping,
 * and clean outward knee bend regardless of chassis velocity.
 */
export function solveTwoBoneIK(
  hip: Vec2,
  foot: Vec2,
  L1: number,
  L2: number,
  bendSign: 1 | -1,
  liftZ: number,
  bodyAngle: number,
  compression = 0
): { knee: Vec2; clampedFoot: Vec2 } {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const rawDist = Math.hypot(dx, dy);

  const minReach = Math.max(8, Math.abs(L1 - L2) + 5);
  const maxReach = (L1 + L2) * 0.96;
  const dist = Math.max(minReach, Math.min(maxReach, rawDist));

  const dirX = rawDist > 0.001 ? dx / rawDist : Math.cos(bodyAngle);
  const dirY = rawDist > 0.001 ? dy / rawDist : Math.sin(bodyAngle);

  const clampedFoot: Vec2 =
    rawDist > maxReach || rawDist < minReach
      ? { x: hip.x + dirX * dist, y: hip.y + dirY * dist }
      : { x: foot.x, y: foot.y };

  const cosAngle = Math.max(
    -0.98,
    Math.min(0.98, (L1 * L1 + dist * dist - L2 * L2) / Math.max(1, 2 * L1 * dist))
  );
  const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle));

  const perpX = -dirY * bendSign;
  const perpY = dirX * bendSign;

  // Vertical knee arch in 2.5D angled top-down space; dips on heavy compression/landing
  const geomCompression = Math.max(0, 1 - dist / Math.max(1, L1 + L2));
  const kneeArchY = -(7.0 + geomCompression * 17 + liftZ * 0.88 - compression * 4.4);

  const kneeX = hip.x + (dirX * cosAngle + perpX * sinAngle * 0.58) * L1;
  const kneeY = hip.y + (dirY * cosAngle + perpY * sinAngle * 0.58) * L1 + kneeArchY;

  return {
    knee: { x: kneeX, y: kneeY },
    clampedFoot,
  };
}

export function localToWorld(origin: Vec2, angle: number, localX: number, localY: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: origin.x + localX * c - localY * s,
    y: origin.y + localX * s + localY * c,
  };
}

function nudgeFootOutOfObstacles(target: Vec2, hip: Vec2, obstacles: Obstacle[]): Vec2 {
  let tx = target.x;
  let ty = target.y;
  const pad = 6;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (obs.destroyed) continue;
    const minX = obs.x - obs.w * 0.5 - pad;
    const maxX = obs.x + obs.w * 0.5 + pad;
    const minY = obs.y - obs.h * 0.5 - pad;
    const maxY = obs.y + obs.h * 0.5 + pad;
    if (tx > minX && tx < maxX && ty > minY && ty < maxY) {
      const dl = Math.abs(tx - minX);
      const dr = Math.abs(maxX - tx);
      const dt = Math.abs(ty - minY);
      const db = Math.abs(maxY - ty);
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) tx = minX;
      else if (m === dr) tx = maxX;
      else if (m === dt) ty = minY;
      else ty = maxY;
      tx = tx * 0.78 + hip.x * 0.22;
      ty = ty * 0.78 + hip.y * 0.22;
    }
  }
  return { x: tx, y: ty };
}

export class LegAnimator {
  public legs: ProceduralLeg[] = [];
  public gaitState: GaitState = 'idle';
  private time = 0;
  private prevVelX = 0;
  private prevVelY = 0;
  private smoothPaceMult = 0.85;
  private smoothStrideMult = 0.5;
  private smoothLiftMult = 0.9;
  private smoothLeadTime = 0.15;
  private smoothSpreadMult = 1.0;
  private prevPosX = 0;
  private prevPosY = 0;
  private prevAngle = 0;
  private hasPrevPose = false;

  constructor(legSpecs: LegMountSpec[], initialPos: Vec2, initialAngle: number) {
    this.reset(legSpecs, initialPos, initialAngle);
  }

  public reset(legSpecs: LegMountSpec[], initialPos: Vec2, initialAngle: number): void {
    this.prevVelX = 0;
    this.prevVelY = 0;
    this.prevPosX = initialPos.x;
    this.prevPosY = initialPos.y;
    this.prevAngle = initialAngle;
    this.hasPrevPose = true;
    this.legs = legSpecs.map((spec, index) => {
      const hipPos = localToWorld(initialPos, initialAngle, spec.attachX, spec.attachY);
      const footPos = localToWorld(initialPos, initialAngle, spec.restX, spec.restY);
      const { knee } = solveTwoBoneIK(
        hipPos,
        footPos,
        spec.femurLength,
        spec.tibiaLength,
        spec.bendSign,
        0,
        initialAngle,
        0
      );
      return {
        index,
        spec,
        hipPos,
        kneePos: knee,
        footPos,
        swingStartPos: { ...footPos },
        targetPos: { ...footPos },
        isSwinging: false,
        swingProgress: 0,
        liftZ: 0,
        compression: 0,
        damageRatio: 1,
        destroyed: false,
        stepCooldown: 0,
        limpPhase: index * 1.3,
      };
    });
  }

  /**
   * Smoothly updates leg mount coordinates & lengths mid-transformation without snapping.
   */
  public syncMorphSpecs(morphedSpecs: LegMountSpec[], pos: Vec2, bodyAngle: number): void {
    const nextLegs: ProceduralLeg[] = [];
    for (let i = 0; i < morphedSpecs.length; i++) {
      const sp = morphedSpecs[i];
      const existing = this.legs[i];
      if (existing) {
        existing.spec = sp;
        existing.index = i;
        nextLegs.push(existing);
      } else {
        const hipPos = localToWorld(pos, bodyAngle, sp.attachX, sp.attachY);
        const footPos = localToWorld(pos, bodyAngle, sp.restX, sp.restY);
        const { knee } = solveTwoBoneIK(
          hipPos,
          footPos,
          sp.femurLength,
          sp.tibiaLength,
          sp.bendSign,
          0,
          bodyAngle,
          0
        );
        nextLegs.push({
          index: i,
          spec: sp,
          hipPos,
          kneePos: knee,
          footPos,
          swingStartPos: { ...footPos },
          targetPos: { ...footPos },
          isSwinging: false,
          swingProgress: 0,
          liftZ: 0,
          compression: 0,
          damageRatio: 1,
          destroyed: false,
          stepCooldown: 0,
          limpPhase: i * 1.3,
        });
      }
    }
    this.legs = nextLegs;
  }

  private resolveGaitState(
    speed: number,
    speedRatio: number,
    fwdVel: number,
    latVel: number,
    phys: MechPhysicsState,
    options?: GaitUpdateOptions
  ): GaitState {
    if (options?.airborne) return 'midair';
    if ((options?.landingImpact ?? 0) > 0.12) return 'landing';
    if (options?.dashing) return 'dashing';
    if (options?.grappling) return 'grappling';
    if (options?.anchored || phys.bracingFactor > 0.65) return 'anchored';
    if (options?.stumbling) return 'stumbling';
    if (options?.recovering || phys.recoilRecoverTimer > 0.28) return 'recovering';
    if (phys.braking && speed > 22) return 'braking';
    if (phys.sprinting && speed > 36) return 'sprinting';
    if (speed < 9 && Math.abs(phys.angularVel) > 0.15) return 'turning';
    if (speed < 9) return 'idle';
    if (fwdVel < -14 && Math.abs(fwdVel) > Math.abs(latVel)) return 'reversing';
    if (Math.abs(latVel) > Math.abs(fwdVel) * 1.15 && speed > 16) return 'strafing';
    if (speedRatio > 0.78) return 'running';
    if (speedRatio > 0.56) return 'fast_walk';
    if (speedRatio > 0.26) return 'walking';
    return 'slow_walk';
  }

  public update(
    dt: number,
    phys: MechPhysicsState,
    cfg: LegAnimatorConfig,
    components: ComponentHealth,
    obstacles: Obstacle[],
    options?: GaitUpdateOptions
  ): FootstepEvent[] {
    if (dt <= 0) return [];
    const disp = this.hasPrevPose
      ? Math.hypot(phys.pos.x - this.prevPosX, phys.pos.y - this.prevPosY)
      : Math.hypot(phys.vel.x, phys.vel.y) * dt;
    let dAng = this.hasPrevPose ? (phys.bodyAngle - this.prevAngle) % (Math.PI * 2) : phys.angularVel * dt;
    if (dAng > Math.PI) dAng -= Math.PI * 2;
    if (dAng < -Math.PI) dAng += Math.PI * 2;

    const substeps = Math.max(1, Math.min(4, Math.ceil(Math.max(disp / 10.0, Math.abs(dAng) / 0.14))));
    if (substeps === 1) {
      this.prevPosX = phys.pos.x;
      this.prevPosY = phys.pos.y;
      this.prevAngle = phys.bodyAngle;
      this.hasPrevPose = true;
      return this.updateSingleStep(dt, phys, cfg, components, obstacles, options);
    }

    const startX = this.hasPrevPose ? this.prevPosX : phys.pos.x;
    const startY = this.hasPrevPose ? this.prevPosY : phys.pos.y;
    const startAng = this.hasPrevPose ? this.prevAngle : phys.bodyAngle;
    const finalX = phys.pos.x;
    const finalY = phys.pos.y;
    const finalAng = phys.bodyAngle;
    const subDt = dt / substeps;
    const allSteps: FootstepEvent[] = [];

    for (let s = 1; s <= substeps; s++) {
      const f = s / substeps;
      phys.pos.x = startX + (finalX - startX) * f;
      phys.pos.y = startY + (finalY - startY) * f;
      phys.bodyAngle = startAng + dAng * f;
      const ev = this.updateSingleStep(subDt, phys, cfg, components, obstacles, options);
      for (let k = 0; k < ev.length; k++) allSteps.push(ev[k]);
    }
    phys.pos.x = finalX;
    phys.pos.y = finalY;
    phys.bodyAngle = finalAng;
    this.prevPosX = finalX;
    this.prevPosY = finalY;
    this.prevAngle = finalAng;
    this.hasPrevPose = true;
    return allSteps;
  }

  private updateSingleStep(
    dt: number,
    phys: MechPhysicsState,
    cfg: LegAnimatorConfig,
    components: ComponentHealth,
    obstacles: Obstacle[],
    options?: GaitUpdateOptions
  ): FootstepEvent[] {
    this.time += dt;
    const footsteps: FootstepEvent[] = [];

    const speed = Math.hypot(phys.vel.x, phys.vel.y);
    const accelX = (phys.vel.x - this.prevVelX) / Math.max(0.004, dt);
    const accelY = (phys.vel.y - this.prevVelY) / Math.max(0.004, dt);
    this.prevVelX = phys.vel.x;
    this.prevVelY = phys.vel.y;

    const fwdX = Math.cos(phys.bodyAngle);
    const fwdY = Math.sin(phys.bodyAngle);
    const rightX = -fwdY;
    const rightY = fwdX;
    const fwdVel = phys.vel.x * fwdX + phys.vel.y * fwdY;
    const latVel = phys.vel.x * rightX + phys.vel.y * rightY;
    const speedRatio = Math.min(2.4, speed / Math.max(25, cfg.maxSpeed));

    this.gaitState = this.resolveGaitState(speed, speedRatio, fwdVel, latVel, phys, options);
    const profile = GAIT_PROFILES[this.gaitState];

    // Smooth gait parameter blending so transitions never pop or snap
    const blendRate = this.gaitState === 'dashing' || this.gaitState === 'landing' ? 16 : 9;
    const bAlpha = 1 - Math.exp(-blendRate * dt);
    this.smoothPaceMult += (profile.paceMult - this.smoothPaceMult) * bAlpha;
    this.smoothStrideMult += (profile.strideMult - this.smoothStrideMult) * bAlpha;
    this.smoothLiftMult += (profile.liftMult - this.smoothLiftMult) * bAlpha;
    this.smoothLeadTime += (profile.leadTime - this.smoothLeadTime) * bAlpha;

    const leftRatio = components.leftLegs / Math.max(1, components.maxLeftLegs);
    const rightRatio = components.rightLegs / Math.max(1, components.maxRightLegs);

    const baseSpread = options?.stanceSpreadMult ?? 1.0;
    const braceSpread =
      1 +
      phys.bracingFactor * 0.24 +
      Math.min(0.14, phys.recoilAccum * 0.1) +
      (this.gaitState === 'landing' ? 0.2 : 0) +
      (this.gaitState === 'braking' ? 0.14 : 0);
    const targetSpread = Math.max(baseSpread, braceSpread);
    this.smoothSpreadMult += (targetSpread - this.smoothSpreadMult) * bAlpha;

    // Subtle chassis lateral weight-shift calculation from swinging legs
    let weightShiftY = 0;
    let group0Swinging = 0;
    let group1Swinging = 0;
    for (let i = 0; i < this.legs.length; i++) {
      const l = this.legs[i];
      if (l.isSwinging && !l.destroyed) {
        if (l.spec.gaitGroup === 0) group0Swinging++;
        else group1Swinging++;
        weightShiftY += l.spec.side === 'left' ? 1.0 : -1.0;
      }
    }

    const dynamicStepSpeed =
      cfg.stepSpeed *
      this.smoothPaceMult *
      (0.7 + Math.min(2.6, speedRatio * 0.85) + Math.min(0.55, Math.abs(phys.angularVel) * 0.3));

    const strideTriggerDist = Math.max(
      11,
      cfg.strideLength * this.smoothStrideMult * (1 + Math.min(0.35, (speedRatio - 1) * 0.25))
    );

    const airborne = Boolean(options?.airborne);

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const sideRatio = leg.spec.side === 'left' ? leftRatio : rightRatio;
      leg.damageRatio = sideRatio;
      leg.destroyed =
        sideRatio <= 0.05 || (sideRatio < 0.22 && (leg.index === 0 || leg.index === this.legs.length - 1));

      leg.stepCooldown = Math.max(0, leg.stepCooldown - dt);
      leg.compression = Math.max(0, leg.compression - dt * 4.5);

      const hipPos = localToWorld(
        phys.pos,
        phys.bodyAngle,
        leg.spec.attachX + phys.tiltX * 6.5,
        leg.spec.attachY + phys.tiltY * 6.5 + (airborne ? 0 : weightShiftY * 0.55)
      );
      hipPos.y -= phys.bounceZ * 0.85;
      leg.hipPos = hipPos;

      const minReach = Math.max(8, Math.abs(leg.spec.femurLength - leg.spec.tibiaLength) + 5);
      const maxReach = (leg.spec.femurLength + leg.spec.tibiaLength) * 0.95;

      // Airborne flight or active grapple swing posture: legs tuck cleanly into dynamic trailing/skid configuration
      if (airborne || this.gaitState === 'grappling') {
        leg.isSwinging = false;
        leg.liftZ = 0;
        const speedNorm = Math.min(1.2, speed / 340);
        const sway = this.gaitState === 'grappling' ? Math.sin(this.time * 12 + leg.limpPhase) * 2.2 : 0;
        const tuckX = leg.spec.restX * (this.gaitState === 'grappling' ? 0.56 : 0.62) - 7 - speedNorm * 9 + sway;
        const tuckY = leg.spec.restY * (0.7 - speedNorm * 0.12);
        const tuckTarget = localToWorld(phys.pos, phys.bodyAngle, tuckX, tuckY);
        const alpha = 1 - Math.exp(-13 * dt);
        leg.footPos.x += (tuckTarget.x - leg.footPos.x) * alpha;
        leg.footPos.y += (tuckTarget.y - leg.footPos.y) * alpha;
        const ik = solveTwoBoneIK(
          hipPos,
          leg.footPos,
          leg.spec.femurLength,
          leg.spec.tibiaLength,
          leg.spec.bendSign,
          this.gaitState === 'grappling' ? 6 : 5,
          phys.bodyAngle,
          0
        );
        leg.kneePos = ik.knee;
        leg.footPos = ik.clampedFoot;
        continue;
      }

      if (leg.destroyed) {
        leg.isSwinging = false;
        const limpTarget = localToWorld(
          phys.pos,
          phys.bodyAngle,
          leg.spec.restX * 0.55 - 8,
          leg.spec.restY * 0.58
        );
        leg.footPos.x += (limpTarget.x - leg.footPos.x) * Math.min(1, dt * 6);
        leg.footPos.y += (limpTarget.y - leg.footPos.y) * Math.min(1, dt * 6);
        leg.liftZ = 0;
        const ik = solveTwoBoneIK(
          hipPos,
          leg.footPos,
          leg.spec.femurLength,
          leg.spec.tibiaLength,
          leg.spec.bendSign,
          0,
          phys.bodyAngle,
          0
        );
        leg.kneePos = ik.knee;
        continue;
      }

      let restX = leg.spec.restX * this.smoothSpreadMult;
      let restY = leg.spec.restY * this.smoothSpreadMult;

      if (phys.bracingFactor > 0.15) {
        if (leg.spec.restX < 0) restX -= 6 * phys.bracingFactor;
        restY *= 1 + phys.bracingFactor * 0.12;
      }
      if (this.gaitState === 'braking') {
        restX += 7.5 * Math.sign(leg.spec.restX || 1);
        restY *= 1.15;
      }
      if (this.gaitState === 'dashing' && options?.dashDir) {
        // Legs drive forcefully in dash thrust posture
        const localDashDot = options.dashDir.x * fwdX + options.dashDir.y * fwdY;
        restX -= localDashDot * 5;
        restY *= 1.1;
      }
      if (this.gaitState === 'idle') {
        const micro = Math.sin(this.time * 1.6 + leg.limpPhase) * 0.7;
        restX += micro * 0.35;
      }
      if (this.gaitState === 'landing') {
        leg.compression = Math.max(leg.compression, options?.landingImpact ?? 0.75);
      }

      const idealRest = localToWorld(phys.pos, phys.bodyAngle, restX, restY);

      // Velocity + rotational tangent + bounded acceleration prediction
      const rotTangentX = -(idealRest.y - phys.pos.y) * phys.angularVel;
      const rotTangentY = (idealRest.x - phys.pos.x) * phys.angularVel;
      const clampedAccelX = Math.max(-420, Math.min(420, accelX));
      const clampedAccelY = Math.max(-420, Math.min(420, accelY));
      const totalVelX = phys.vel.x + rotTangentX;
      const totalVelY = phys.vel.y + rotTangentY;

      const lead = this.smoothLeadTime;
      let predictedTarget: Vec2 = {
        x: idealRest.x + totalVelX * lead + clampedAccelX * 0.5 * lead * lead,
        y: idealRest.y + totalVelY * lead + clampedAccelY * 0.5 * lead * lead,
      };

      if (leg.damageRatio < 0.65 || this.gaitState === 'stumbling') {
        const errAmt =
          this.gaitState === 'stumbling' ? 9 : (1 - leg.damageRatio) * 8.5;
        predictedTarget.x += Math.sin(this.time * 8 + leg.limpPhase) * errAmt;
        predictedTarget.y += Math.cos(this.time * 6.5 + leg.limpPhase) * errAmt;
      }

      // Enforce leg reach envelope & minimum hip clearance (feet never enter chassis)
      const pDx = predictedTarget.x - hipPos.x;
      const pDy = predictedTarget.y - hipPos.y;
      const pDist = Math.hypot(pDx, pDy);
      if (pDist > maxReach * 0.88) {
        const s = (maxReach * 0.88) / Math.max(0.001, pDist);
        predictedTarget.x = hipPos.x + pDx * s;
        predictedTarget.y = hipPos.y + pDy * s;
      } else if (pDist < minReach * 1.15) {
        const outDirX = pDist > 0.01 ? pDx / pDist : rightX * leg.spec.bendSign;
        const outDirY = pDist > 0.01 ? pDy / pDist : rightY * leg.spec.bendSign;
        predictedTarget.x = hipPos.x + outDirX * minReach * 1.15;
        predictedTarget.y = hipPos.y + outDirY * minReach * 1.15;
      }

      // Separate target from neighboring same-side feet so legs never cross
      for (let j = 0; j < this.legs.length; j++) {
        if (i === j) continue;
        const other = this.legs[j];
        if (other.destroyed || other.spec.side !== leg.spec.side) continue;
        const ox = predictedTarget.x - other.footPos.x;
        const oy = predictedTarget.y - other.footPos.y;
        const oDist = Math.hypot(ox, oy);
        if (oDist > 0.01 && oDist < 12) {
          const push = (12 - oDist) * 0.6;
          predictedTarget.x += (ox / oDist) * push;
          predictedTarget.y += (oy / oDist) * push;
        }
      }

      predictedTarget = nudgeFootOutOfObstacles(predictedTarget, hipPos, obstacles);

      if (leg.isSwinging) {
        // High-speed catch-up guarantee: step finishes fast enough before extreme-speed Revenant/dash outruns reach!
        const distToTarget = Math.hypot(predictedTarget.x - leg.swingStartPos.x, predictedTarget.y - leg.swingStartPos.y);
        const minSpeedAdapted =
          speed > 20 ? Math.max(dynamicStepSpeed, (speed * 2.55) / Math.max(14, distToTarget)) : dynamicStepSpeed;
        const limbSpeedPenalty = 0.6 + 0.4 * leg.damageRatio;

        leg.swingProgress += dt * Math.min(26, minSpeedAdapted) * limbSpeedPenalty;
        if (leg.swingProgress < 0.6) {
          const trackRate = Math.min(1, dt * (speed > cfg.maxSpeed * 1.1 ? 20 : 10));
          leg.targetPos.x += (predictedTarget.x - leg.targetPos.x) * trackRate;
          leg.targetPos.y += (predictedTarget.y - leg.targetPos.y) * trackRate;
        }

        if (leg.swingProgress >= 1) {
          leg.swingProgress = 1;
          leg.isSwinging = false;
          leg.footPos.x = leg.targetPos.x;
          leg.footPos.y = leg.targetPos.y;
          leg.liftZ = 0;
          const impactScale =
            this.gaitState === 'dashing'
              ? 1.45
              : this.gaitState === 'sprinting'
              ? 1.32
              : this.gaitState === 'running'
              ? 1.12
              : 0.85;
          leg.compression = Math.min(1, (0.42 + cfg.footstepWeight * 0.55) * impactScale);
          leg.stepCooldown = speed > cfg.maxSpeed * 1.25 ? 0.02 : 0.06;
          footsteps.push({ x: leg.footPos.x, y: leg.footPos.y, side: leg.spec.side });
          phys.bounceVelZ -= cfg.footstepWeight * (this.gaitState === 'sprinting' ? 22 : 14) * impactScale;
        } else {
          const t = leg.swingProgress;
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
          leg.footPos.x = leg.swingStartPos.x + (leg.targetPos.x - leg.swingStartPos.x) * ease;
          leg.footPos.y = leg.swingStartPos.y + (leg.targetPos.y - leg.swingStartPos.y) * ease;
          leg.liftZ = Math.sin(Math.pow(t, 0.82) * Math.PI) * cfg.stepHeight * this.smoothLiftMult;
        }
      } else {
        // WORLD-SPACE STANCE PLANTING: Foot stays anchored in world coords while chassis moves over it
        leg.liftZ = 0;

        const errToIdeal = Math.hypot(idealRest.x - leg.footPos.x, idealRest.y - leg.footPos.y);
        const distFromHip = Math.hypot(leg.footPos.x - hipPos.x, leg.footPos.y - hipPos.y);

        // Smoothly initiate next step BEFORE reaching physical stretch limit
        const urgentStep = distFromHip > maxReach * 0.91 || distFromHip < minReach * 1.05;
        const highSpeedOverride = speed > cfg.maxSpeed * 1.15 && errToIdeal > strideTriggerDist * 0.82;
        const otherGroupSwinging = leg.spec.gaitGroup === 0 ? group1Swinging > 0 : group0Swinging > 0;

        const effectiveTrigger =
          this.gaitState === 'idle'
            ? strideTriggerDist * 0.72
            : this.gaitState === 'turning'
            ? strideTriggerDist * 0.52
            : strideTriggerDist;

        if (
          urgentStep ||
          ((errToIdeal > effectiveTrigger || highSpeedOverride) &&
            (!otherGroupSwinging || urgentStep || speed > cfg.maxSpeed * 1.45) &&
            leg.stepCooldown <= 0)
        ) {
          leg.isSwinging = true;
          leg.swingProgress = 0;
          leg.swingStartPos.x = leg.footPos.x;
          leg.swingStartPos.y = leg.footPos.y;
          leg.targetPos.x = predictedTarget.x;
          leg.targetPos.y = predictedTarget.y;
          if (leg.spec.gaitGroup === 0) group0Swinging++;
          else group1Swinging++;
        }
      }

      const recoilCompress = phys.recoilOffset > 1.5 ? Math.min(0.45, phys.recoilOffset * 0.03) : 0;
      const ik = solveTwoBoneIK(
        hipPos,
        leg.footPos,
        leg.spec.femurLength,
        leg.spec.tibiaLength,
        leg.spec.bendSign,
        leg.liftZ,
        phys.bodyAngle,
        Math.min(1, leg.compression + recoilCompress)
      );
      leg.kneePos = ik.knee;
      // Only enforce reach clamp when actually exceeding physical limits, avoiding world-foot drift
      const dAfter = Math.hypot(leg.footPos.x - hipPos.x, leg.footPos.y - hipPos.y);
      if (dAfter > maxReach || dAfter < minReach) {
        leg.footPos = ik.clampedFoot;
      }
    }

    return footsteps;
  }
}
