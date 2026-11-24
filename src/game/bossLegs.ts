import { BossLegMountSpec, BossPosture } from './bossTypes';
import { MechPhysicsState } from './physics';
import { solveTwoBoneIK } from './proceduralLegs';
import { Obstacle, Vec2 } from './types';

export interface BossLeg {
  spec: BossLegMountSpec;
  hipPos: Vec2;
  kneePos: Vec2;
  footPos: Vec2;
  stepStart: Vec2;
  stepTarget: Vec2;
  isSwinging: boolean;
  stepProgress: number;
  liftZ: number;
  compression: number;
  damageRatio: number;
  destroyed: boolean;
  collapseAngle: number;
  stepCooldown: number;
}

export interface BossFootstepEvent {
  x: number;
  y: number;
  weight: number;
  side: 'left' | 'right';
}

/**
 * Speed-responsive, substepped procedural leg & IK animator for spider-legged
 * Thunderhead super-heavy bosses. Guarantees:
 * - Zero leg stretching beyond physical (femur + tibia) reach at any speed.
 * - Velocity + angular-velocity rotational lead prediction so sharp 90°/180° turns never cross legs.
 * - Live swing target tracking so feet always land ahead of fast-moving hips.
 * - Adaptive swing cadence coupled directly to actual linear + rotational speed.
 */
export class BossLegAnimator {
  public legs: BossLeg[] = [];
  public posture: BossPosture = 'heavy_idle';
  public bodyBounce = 0;
  public bodyTiltX = 0;
  public bodyTiltY = 0;
  private activeWaveGroup: 0 | 1 | 2 | 3 = 0;
  private waveCooldown = 0;
  private prevPosX = 0;
  private prevPosY = 0;
  private prevAngle = 0;
  private hasPrev = false;

  constructor(specs: BossLegMountSpec[], pos: Vec2, angle: number) {
    this.reset(specs, pos, angle);
  }

  public reset(specs: BossLegMountSpec[], pos: Vec2, angle: number): void {
    this.prevPosX = pos.x;
    this.prevPosY = pos.y;
    this.prevAngle = angle;
    this.hasPrev = true;
    this.legs = specs.map((spec) => {
      const hipPos = localToWorld(pos, angle, spec.attachX, spec.attachY);
      const restPos = localToWorld(pos, angle, spec.restX, spec.restY);
      const ik = solveTwoBoneIK(
        hipPos,
        restPos,
        spec.femurLength,
        spec.tibiaLength,
        spec.bendSign,
        0, // liftZ
        angle, // bodyAngle
        0.25
      );
      return {
        spec,
        hipPos,
        kneePos: ik.knee,
        footPos: ik.clampedFoot,
        stepStart: { ...ik.clampedFoot },
        stepTarget: { ...ik.clampedFoot },
        isSwinging: false,
        stepProgress: 1,
        liftZ: 0,
        compression: 0,
        damageRatio: 1,
        destroyed: false,
        collapseAngle: 0,
        stepCooldown: 0,
      };
    });
    this.posture = 'heavy_idle';
    this.activeWaveGroup = 0;
    this.waveCooldown = 0;
    this.bodyBounce = 0;
    this.bodyTiltX = 0;
    this.bodyTiltY = 0;
  }

  public update(
    dt: number,
    phys: MechPhysicsState,
    cfg: {
      strideLength: number;
      stepHeight: number;
      stepSpeed: number;
      footstepWeight: number;
      posture: BossPosture;
      leftLegRatio: number;
      rightLegRatio: number;
      destroying: boolean;
      destroyProgress: number;
    },
    obstacles: Obstacle[]
  ): BossFootstepEvent[] {
    if (dt <= 0) return [];

    // Substep when moving or turning at high speeds so legs never skip triggers or snap
    const frameDisp = this.hasPrev
      ? Math.hypot(phys.pos.x - this.prevPosX, phys.pos.y - this.prevPosY)
      : Math.hypot(phys.vel.x, phys.vel.y) * dt;
    const frameAngDisp = this.hasPrev
      ? Math.abs(shortestAngleDiffLocal(this.prevAngle, phys.bodyAngle))
      : Math.abs(phys.angularVel) * dt;

    const substeps = Math.max(
      1,
      Math.min(4, Math.ceil(Math.max(frameDisp / 9.0, frameAngDisp / 0.1)))
    );

    const startX = this.hasPrev ? this.prevPosX : phys.pos.x;
    const startY = this.hasPrev ? this.prevPosY : phys.pos.y;
    const startAngle = this.hasPrev ? this.prevAngle : phys.bodyAngle;
    const dAngle = shortestAngleDiffLocal(startAngle, phys.bodyAngle);

    const allEvents: BossFootstepEvent[] = [];
    const subDt = dt / substeps;

    for (let s = 1; s <= substeps; s++) {
      const frac = s / substeps;
      const samplePosX = startX + (phys.pos.x - startX) * frac;
      const samplePosY = startY + (phys.pos.y - startY) * frac;
      const sampleAngle = startAngle + dAngle * frac;
      const stepEvents = this.updateSubstep(subDt, samplePosX, samplePosY, sampleAngle, phys, cfg, obstacles);
      for (let e = 0; e < stepEvents.length; e++) {
        allEvents.push(stepEvents[e]);
      }
    }

    this.prevPosX = phys.pos.x;
    this.prevPosY = phys.pos.y;
    this.prevAngle = phys.bodyAngle;
    this.hasPrev = true;
    return allEvents;
  }

  private updateSubstep(
    dt: number,
    posX: number,
    posY: number,
    bodyAngle: number,
    phys: MechPhysicsState,
    cfg: {
      strideLength: number;
      stepHeight: number;
      stepSpeed: number;
      footstepWeight: number;
      posture: BossPosture;
      leftLegRatio: number;
      rightLegRatio: number;
      destroying: boolean;
      destroyProgress: number;
    },
    obstacles: Obstacle[]
  ): BossFootstepEvent[] {
    const events: BossFootstepEvent[] = [];
    this.posture = cfg.posture;

    const speed = Math.hypot(phys.vel.x, phys.vel.y);
    const absAngVel = Math.abs(phys.angularVel);
    const cos = Math.cos(bodyAngle);
    const sin = Math.sin(bodyAngle);

    // Posture offsets across all 9 Thunderhead movement states
    let spreadWidthMult = 1.0;
    let rearBraceShift = 0;
    let postureSink = 0;
    let strideScale = 1.0;
    let stepRateBoost = 1.0;
    let targetTiltX = 0;

    switch (cfg.posture) {
      case 'heavy_idle':
        spreadWidthMult = 1.02;
        postureSink = 0.5;
        break;
      case 'fast_walk':
        strideScale = 1.04;
        stepRateBoost = 1.1;
        break;
      case 'rapid_move':
        spreadWidthMult = 0.99;
        strideScale = 1.14;
        stepRateBoost = 1.32;
        targetTiltX = 0.24;
        break;
      case 'full_pursuit':
        spreadWidthMult = 0.97;
        strideScale = 1.22;
        stepRateBoost = 1.55;
        postureSink = 1.8;
        targetTiltX = 0.42;
        break;
      case 'high_speed_turn':
        spreadWidthMult = 1.12;
        strideScale = 1.02;
        stepRateBoost = 1.4;
        break;
      case 'emergency_brake':
        spreadWidthMult = 1.22;
        rearBraceShift = -9;
        postureSink = 5.5;
        stepRateBoost = 1.45;
        targetTiltX = 0.55;
        break;
      case 'artillery_deploy':
        spreadWidthMult = 1.2;
        rearBraceShift = -12;
        postureSink = 5.2;
        break;
      case 'recoil_recover':
        spreadWidthMult = 1.24;
        rearBraceShift = -16;
        postureSink = 8.0;
        targetTiltX = -0.48;
        break;
      case 'critical_damage':
        spreadWidthMult = 1.1;
        postureSink = 4.8;
        stepRateBoost = 0.85;
        break;
    }

    // Critically damped body stabilization (no oscillation or snap)
    const turnLean = Math.max(-0.7, Math.min(0.7, phys.angularVel * 0.85));
    const speedLean = Math.min(0.35, (speed / 220) * 0.28);
    const targetTiltY = (cfg.rightLegRatio - cfg.leftLegRatio) * 1.05 + turnLean;
    const tiltAlpha = 1 - Math.exp(-8.5 * dt);
    this.bodyTiltX += (targetTiltX + speedLean - this.bodyTiltX) * tiltAlpha;
    this.bodyTiltY += (targetTiltY - this.bodyTiltY) * tiltAlpha;
    this.bodyBounce += (postureSink - this.bodyBounce) * (1 - Math.exp(-9.0 * dt));

    // Speed-responsive 4-group wave gait: faster speed & turning shorten wave delay
    this.waveCooldown -= dt;
    const anySwingingInActive = this.legs.some(
      (l) => !l.destroyed && l.isSwinging && l.spec.gaitGroup === this.activeWaveGroup
    );
    const waveDelay =
      speed > 130 || absAngVel > 1.2
        ? 0.025
        : speed > 75 || absAngVel > 0.65
        ? 0.055
        : 0.13;
    if (!anySwingingInActive && this.waveCooldown <= 0) {
      this.activeWaveGroup = ((this.activeWaveGroup + 1) % 4) as 0 | 1 | 2 | 3;
      this.waveCooldown = waveDelay;
    }

    const totalLegs = this.legs.length;
    // Scale concurrent swings smoothly with speed so legs can always keep up while keeping >=50% planted
    const swingRatio = speed > 140 || absAngVel > 1.3 ? 0.5 : speed > 85 ? 0.38 : 0.28;
    const maxConcurrentSwings = Math.max(2, Math.floor(totalLegs * swingRatio));
    let currentSwings = 0;
    for (let i = 0; i < totalLegs; i++) {
      if (this.legs[i].isSwinging && !this.legs[i].destroyed) currentSwings++;
    }

    const effStride = cfg.strideLength * strideScale;
    const leadTime = speed > 130 ? 0.24 : speed > 70 ? 0.22 : 0.18;

    for (let i = 0; i < totalLegs; i++) {
      const leg = this.legs[i];
      const sideRatio = leg.spec.side === 'left' ? cfg.leftLegRatio : cfg.rightLegRatio;
      leg.damageRatio = sideRatio;
      leg.stepCooldown = Math.max(0, leg.stepCooldown - dt);

      // Progressive leg failure as side cluster takes damage (or full collapse during destruction)
      const sideLegsCount = totalLegs / 2;
      const sideIndex = Math.floor(i / 2);
      const failureThreshold = 0.1 + (sideIndex / Math.max(1, sideLegsCount)) * 0.45;
      const isClusterDead = sideRatio <= 0.05 || (sideRatio < 0.48 && sideRatio < failureThreshold);
      if (isClusterDead || (cfg.destroying && cfg.destroyProgress > 0.2 + (i % 5) * 0.13)) {
        leg.destroyed = true;
        leg.isSwinging = false;
        leg.collapseAngle = Math.min(1, leg.collapseAngle + dt * 2.2);
      } else {
        leg.destroyed = false;
        leg.collapseAngle = 0;
      }

      const hipPos: Vec2 = {
        x: posX + (leg.spec.attachX * cos - leg.spec.attachY * sin),
        y: posY + (leg.spec.attachX * sin + leg.spec.attachY * cos),
      };
      leg.hipPos = hipPos;

      const minReach = Math.max(12, Math.abs(leg.spec.femurLength - leg.spec.tibiaLength) + 6);
      const maxReach = (leg.spec.femurLength + leg.spec.tibiaLength) * 0.94;

      if (leg.destroyed) {
        const droopX = hipPos.x + (leg.spec.restX * cos - leg.spec.restY * sin) * 0.25;
        const droopY = hipPos.y + (leg.spec.restX * sin + leg.spec.restY * cos) * 0.25 + 14 * leg.collapseAngle;
        const ik = solveTwoBoneIK(
          hipPos,
          { x: droopX, y: droopY },
          leg.spec.femurLength,
          leg.spec.tibiaLength,
          leg.spec.bendSign,
          0, // liftZ
          bodyAngle, // bodyAngle
          0.35
        );
        leg.kneePos = ik.knee;
        leg.footPos = ik.clampedFoot;
        leg.liftZ = 0;
        continue;
      }

      // Compute ideal stance point with posture widening, linear velocity + rotational tangent lead
      const emergencyShift = sideRatio < 0.65 ? 0.92 : 1.0;
      const brakeForwardShift = cfg.posture === 'emergency_brake' && leg.spec.attachX > 0 ? 12 : 0;
      const localRestX = leg.spec.restX + (leg.spec.attachX < 0 ? rearBraceShift : brakeForwardShift);
      const localRestY = leg.spec.restY * spreadWidthMult * emergencyShift;

      const restWorldX = posX + (localRestX * cos - localRestY * sin);
      const restWorldY = posY + (localRestX * sin + localRestY * cos);

      // Include rotational tangent velocity so sharp 90°/180° turns predict foot placement cleanly!
      const rotVelX = -(restWorldY - posY) * phys.angularVel;
      const rotVelY = (restWorldX - posX) * phys.angularVel;
      const rawLeadX = (phys.vel.x + rotVelX) * leadTime;
      const rawLeadY = (phys.vel.y + rotVelY) * leadTime;
      const rawLeadMag = Math.hypot(rawLeadX, rawLeadY);
      const maxLead = Math.min(effStride * 0.72, maxReach * 0.42);
      const leadScale = rawLeadMag > maxLead ? maxLead / rawLeadMag : 1;

      let idealX = restWorldX + rawLeadX * leadScale;
      let idealY = restWorldY + rawLeadY * leadScale;

      // Avoid planting boss foot straight inside tall buildings/bunkers
      for (let o = 0; o < obstacles.length; o++) {
        const obs = obstacles[o];
        if (obs.destroyed) continue;
        const halfW = obs.w * 0.5 + 8;
        const halfH = obs.h * 0.5 + 8;
        if (Math.abs(idealX - obs.x) < halfW && Math.abs(idealY - obs.y) < halfH) {
          const dx = idealX - obs.x;
          const dy = idealY - obs.y;
          if (Math.abs(dx) > Math.abs(dy)) idealX = obs.x + Math.sign(dx || 1) * halfW;
          else idealY = obs.y + Math.sign(dy || 1) * halfH;
        }
      }

      // Separate ideal target from same-side neighboring feet so legs never cross during turns
      for (let j = 0; j < totalLegs; j++) {
        if (i === j) continue;
        const other = this.legs[j];
        if (other.destroyed || other.spec.side !== leg.spec.side) continue;
        const ox = idealX - other.footPos.x;
        const oy = idealY - other.footPos.y;
        const oDist = Math.hypot(ox, oy);
        const minSep = 16;
        if (oDist > 0.01 && oDist < minSep) {
          const push = (minSep - oDist) * 0.55;
          idealX += (ox / oDist) * push;
          idealY += (oy / oDist) * push;
        }
      }

      // Clamp ideal target strictly inside physical IK reach envelope [minReach*1.12 .. maxReach*0.86]
      const iDx = idealX - hipPos.x;
      const iDy = idealY - hipPos.y;
      const iDist = Math.hypot(iDx, iDy);
      if (iDist > maxReach * 0.86) {
        const s = (maxReach * 0.86) / Math.max(0.001, iDist);
        idealX = hipPos.x + iDx * s;
        idealY = hipPos.y + iDy * s;
      } else if (iDist < minReach * 1.12) {
        const outX = iDist > 0.01 ? iDx / iDist : -sin * leg.spec.bendSign;
        const outY = iDist > 0.01 ? iDy / iDist : cos * leg.spec.bendSign;
        idealX = hipPos.x + outX * minReach * 1.12;
        idealY = hipPos.y + outY * minReach * 1.12;
      }

      const distFromIdeal = Math.hypot(idealX - leg.footPos.x, idealY - leg.footPos.y);
      const distFromHip = Math.hypot(leg.footPos.x - hipPos.x, leg.footPos.y - hipPos.y);

      const stepThreshold =
        cfg.posture === 'recoil_recover' || cfg.posture === 'artillery_deploy'
          ? effStride * 0.65
          : speed > 110 || absAngVel > 1.0
          ? effStride * 0.38
          : effStride * 0.48;

      if (!leg.isSwinging) {
        const urgentReach = distFromHip > maxReach * 0.88 || distFromHip < minReach * 1.06;
        const canWaveStep =
          (leg.spec.gaitGroup === this.activeWaveGroup || speed > 115 || absAngVel > 1.0) &&
          currentSwings < maxConcurrentSwings;
        if (urgentReach || (distFromIdeal > stepThreshold && canWaveStep && leg.stepCooldown <= 0)) {
          leg.isSwinging = true;
          leg.stepProgress = 0;
          leg.stepStart = { x: leg.footPos.x, y: leg.footPos.y };
          leg.stepTarget = { x: idealX, y: idealY };
          currentSwings++;
        }
      }

      if (leg.isSwinging) {
        // Dynamically track moving/turning ideal target during first 60% of swing so foot lands ahead of hip!
        if (leg.stepProgress < 0.6) {
          const trackAlpha = 1 - Math.exp(-16 * dt);
          leg.stepTarget.x += (idealX - leg.stepTarget.x) * trackAlpha;
          leg.stepTarget.y += (idealY - leg.stepTarget.y) * trackAlpha;
        }
        // Keep stepTarget strictly within physical reach of current hipPos
        const tDx = leg.stepTarget.x - hipPos.x;
        const tDy = leg.stepTarget.y - hipPos.y;
        const tDist = Math.hypot(tDx, tDy);
        if (tDist > maxReach * 0.9) {
          const s = (maxReach * 0.9) / Math.max(0.001, tDist);
          leg.stepTarget.x = hipPos.x + tDx * s;
          leg.stepTarget.y = hipPos.y + tDy * s;
        }

        const limpMult = sideRatio < 0.65 ? 0.78 : 1.0;
        const swingSpan = Math.max(18, Math.hypot(leg.stepTarget.x - leg.stepStart.x, leg.stepTarget.y - leg.stepStart.y));
        const baseRate = cfg.stepSpeed * stepRateBoost * (0.85 + Math.min(1.6, speed / 90));
        // Catch-up guarantee: step finishes before chassis outruns physical leg reach
        const velocityRequiredRate = (speed * 2.35 + absAngVel * 75) / swingSpan;
        const finalStepRate = Math.min(18, Math.max(baseRate, velocityRequiredRate)) * limpMult;

        leg.stepProgress = Math.min(1, leg.stepProgress + dt * finalStepRate);
        const t = leg.stepProgress;
        const smooth = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
        leg.footPos = {
          x: leg.stepStart.x + (leg.stepTarget.x - leg.stepStart.x) * smooth,
          y: leg.stepStart.y + (leg.stepTarget.y - leg.stepStart.y) * smooth,
        };
        leg.liftZ = Math.sin(t * Math.PI) * cfg.stepHeight * (cfg.posture === 'full_pursuit' ? 1.15 : 1.0);

        if (leg.stepProgress >= 1) {
          leg.isSwinging = false;
          leg.liftZ = 0;
          leg.compression = 1.0;
          leg.stepCooldown = speed > 115 ? 0.015 : 0.04;
          events.push({
            x: leg.footPos.x,
            y: leg.footPos.y,
            weight: cfg.footstepWeight * (cfg.posture === 'full_pursuit' ? 1.18 : 1.0),
            side: leg.spec.side,
          });
        }
      } else {
        leg.liftZ = 0;
      }

      leg.compression = Math.max(0, leg.compression - dt * 4.5);

      // Correctly ordered arguments: (hip, foot, L1, L2, bendSign, liftZ, bodyAngle, compression)
      const ik = solveTwoBoneIK(
        hipPos,
        leg.footPos,
        leg.spec.femurLength,
        leg.spec.tibiaLength,
        leg.spec.bendSign,
        leg.liftZ,
        bodyAngle,
        Math.min(1, leg.compression * 0.9 + (cfg.posture === 'recoil_recover' ? 0.4 : cfg.posture === 'artillery_deploy' ? 0.22 : 0))
      );
      leg.kneePos = ik.knee;
      leg.footPos = ik.clampedFoot;
    }

    return events;
  }
}

function localToWorld(origin: Vec2, angle: number, lx: number, ly: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: origin.x + lx * c - ly * s,
    y: origin.y + lx * s + ly * c,
  };
}

function shortestAngleDiffLocal(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
