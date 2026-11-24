import { MechPhysicsState } from './physics';
import { ProceduralLeg } from './proceduralLegs';
import { MechClassId, MechLoadoutCustomization, Obstacle, Vec2 } from './types';

export interface DashSpec {
  supported: boolean;
  impulseSpeed: number; // peak burst velocity added
  maxDashSpeed: number; // speed ceiling during burst
  duration: number; // active thrust / teleport-phase window (seconds)
  recoveryDuration: number; // stabilization window after burst
  cooldown: number; // cooldown seconds
  maxCharges: number;
  stabilityCost: number;
  cameraShake: number;
  afterimageInterval: number;
  tintColor: string;
  /** Spatial teleportation dash (used by PS-08 Phantom) */
  teleportMode?: boolean;
  teleportRange?: number;
  /** Enforces strict zero-damage immunity during active dash frames */
  invulnerableDuringDash?: boolean;
}

export const DASH_SPECS: Record<MechClassId, DashSpec> = {
  recon: {
    supported: true,
    impulseSpeed: 390,
    maxDashSpeed: 495,
    duration: 0.24,
    recoveryDuration: 0.16,
    cooldown: 1.75,
    maxCharges: 2,
    stabilityCost: 0.12,
    cameraShake: 0.14,
    afterimageInterval: 0.032,
    tintColor: '#38bdf8',
  },
  standard: {
    supported: true,
    impulseSpeed: 315,
    maxDashSpeed: 395,
    duration: 0.22,
    recoveryDuration: 0.22,
    cooldown: 2.35,
    maxCharges: 1,
    stabilityCost: 0.18,
    cameraShake: 0.2,
    afterimageInterval: 0.036,
    tintColor: '#fbbf24',
  },
  sniper: {
    supported: true,
    impulseSpeed: 295,
    maxDashSpeed: 365,
    duration: 0.2,
    recoveryDuration: 0.24,
    cooldown: 2.7,
    maxCharges: 1,
    stabilityCost: 0.22,
    cameraShake: 0.18,
    afterimageInterval: 0.038,
    tintColor: '#67e8f9',
  },
  heavy: {
    supported: true,
    impulseSpeed: 255,
    maxDashSpeed: 315,
    duration: 0.2,
    recoveryDuration: 0.34,
    cooldown: 3.3,
    maxCharges: 1,
    stabilityCost: 0.28,
    cameraShake: 0.32,
    afterimageInterval: 0.04,
    tintColor: '#f97316',
  },
  artillery: {
    supported: true,
    impulseSpeed: 195,
    maxDashSpeed: 250,
    duration: 0.17,
    recoveryDuration: 0.38,
    cooldown: 4.0,
    maxCharges: 1,
    stabilityCost: 0.36,
    cameraShake: 0.3,
    afterimageInterval: 0.042,
    tintColor: '#fb923c',
  },
  colossus: {
    supported: true,
    impulseSpeed: 185,
    maxDashSpeed: 240,
    duration: 0.17,
    recoveryDuration: 0.4,
    cooldown: 4.2,
    maxCharges: 1,
    stabilityCost: 0.38,
    cameraShake: 0.34,
    afterimageInterval: 0.045,
    tintColor: '#f59e0b',
  },
  ewar: {
    supported: true,
    impulseSpeed: 335,
    maxDashSpeed: 425,
    duration: 0.23,
    recoveryDuration: 0.19,
    cooldown: 2.1,
    maxCharges: 2,
    stabilityCost: 0.15,
    cameraShake: 0.16,
    afterimageInterval: 0.034,
    tintColor: '#a855f7',
  },
  engineer: {
    supported: true,
    impulseSpeed: 295,
    maxDashSpeed: 375,
    duration: 0.21,
    recoveryDuration: 0.22,
    cooldown: 2.4,
    maxCharges: 1,
    stabilityCost: 0.18,
    cameraShake: 0.18,
    afterimageInterval: 0.038,
    tintColor: '#34d399',
  },
  valkyrie: {
    // Uses Space for Ascend / Vector Surge; aerial directional boost uses this spec
    supported: true,
    impulseSpeed: 360,
    maxDashSpeed: 520,
    duration: 0.24,
    recoveryDuration: 0.14,
    cooldown: 1.9,
    maxCharges: 2,
    stabilityCost: 0.1,
    cameraShake: 0.16,
    afterimageInterval: 0.03,
    tintColor: '#38bdf8',
  },
  phantom: {
    // Elite spatial-displacement teleportation dash with strict active-frame invulnerability
    supported: true,
    impulseSpeed: 420,
    maxDashSpeed: 560,
    duration: 0.22,
    recoveryDuration: 0.12,
    cooldown: 1.85,
    maxCharges: 2,
    stabilityCost: 0.08,
    cameraShake: 0.14,
    afterimageInterval: 0.04,
    tintColor: '#22d3ee',
    teleportMode: true,
    teleportRange: 215,
    invulnerableDuringDash: true,
  },
  assassin: {
    supported: true,
    impulseSpeed: 430,
    maxDashSpeed: 560,
    duration: 0.2,
    recoveryDuration: 0.1,
    cooldown: 1.55,
    maxCharges: 2,
    stabilityCost: 0.06,
    cameraShake: 0.1,
    afterimageInterval: 0.028,
    tintColor: '#f43f5e',
  },
  proteus: {
    supported: true,
    impulseSpeed: 345,
    maxDashSpeed: 445,
    duration: 0.22,
    recoveryDuration: 0.16,
    cooldown: 2.05,
    maxCharges: 2,
    stabilityCost: 0.14,
    cameraShake: 0.16,
    afterimageInterval: 0.035,
    tintColor: '#38bdf8',
  },
};

export function getEffectiveDashSpec(
  classId: MechClassId,
  customization?: MechLoadoutCustomization
): DashSpec {
  const base = DASH_SPECS[classId];
  const engineLvl = customization?.upgrades?.engine_output ?? 0;
  const legLvl = customization?.upgrades?.leg_actuators ?? 0;
  const suspLvl = customization?.upgrades?.suspension_kit ?? 0;
  return {
    ...base,
    impulseSpeed: base.impulseSpeed * (1 + engineLvl * 0.06 + legLvl * 0.04),
    maxDashSpeed: base.maxDashSpeed * (1 + engineLvl * 0.06),
    cooldown: Math.max(0.95, base.cooldown * (1 - engineLvl * 0.06 - legLvl * 0.05)),
    recoveryDuration: Math.max(0.08, base.recoveryDuration * (1 - suspLvl * 0.08)),
  };
}

export interface AfterimageLegPose {
  hipX: number;
  hipY: number;
  kneeX: number;
  kneeY: number;
  footX: number;
  footY: number;
  destroyed: boolean;
}

export interface DashAfterimage {
  active: boolean;
  x: number;
  y: number;
  bodyAngle: number;
  aimAngle: number;
  altitude: number;
  radius: number;
  silhouette: string;
  tintColor: string;
  life: number;
  maxLife: number;
  legCount: number;
  legs: AfterimageLegPose[];
}

export class AfterimagePool {
  public readonly items: DashAfterimage[];
  private cursor = 0;

  constructor(capacity = 48) {
    this.items = Array.from({ length: capacity }, () => ({
      active: false,
      x: 0,
      y: 0,
      bodyAngle: 0,
      aimAngle: 0,
      altitude: 0,
      radius: 20,
      silhouette: 'standard',
      tintColor: '#38bdf8',
      life: 0,
      maxLife: 0.34,
      legCount: 0,
      legs: Array.from({ length: 8 }, () => ({
        hipX: 0,
        hipY: 0,
        kneeX: 0,
        kneeY: 0,
        footX: 0,
        footY: 0,
        destroyed: false,
      })),
    }));
  }

  public spawn(params: {
    x: number;
    y: number;
    bodyAngle: number;
    aimAngle: number;
    altitude: number;
    radius: number;
    silhouette: string;
    tintColor: string;
    maxLife?: number;
    legs: ProceduralLeg[];
  }): void {
    const slot = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;

    slot.active = true;
    slot.x = params.x;
    slot.y = params.y;
    slot.bodyAngle = params.bodyAngle;
    slot.aimAngle = params.aimAngle;
    slot.altitude = params.altitude;
    slot.radius = params.radius;
    slot.silhouette = params.silhouette;
    slot.tintColor = params.tintColor;
    slot.maxLife = params.maxLife ?? 0.34;
    slot.life = slot.maxLife;
    slot.legCount = Math.min(slot.legs.length, params.legs.length);
    for (let i = 0; i < slot.legCount; i++) {
      const src = params.legs[i];
      const dst = slot.legs[i];
      dst.hipX = src.hipPos.x;
      dst.hipY = src.hipPos.y;
      dst.kneeX = src.kneePos.x;
      dst.kneeY = src.kneePos.y;
      dst.footX = src.footPos.x;
      dst.footY = src.footPos.y;
      dst.destroyed = src.destroyed;
    }
  }

  public update(dt: number): void {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item.active) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.active = false;
        item.life = 0;
      }
    }
  }

  public clear(): void {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].active = false;
      this.items[i].life = 0;
    }
  }
}

export class DashController {
  public spec: DashSpec;
  public activeTimer = 0;
  public recoveryTimer = 0;
  public cooldownTimer = 0;
  public charges = 1;
  public dashDir: Vec2 = { x: 1, y: 0 };
  public afterimageAccum = 0;
  public isGrappleDashBoosted = false;
  // Spatial teleportation visual & physics tracking
  public teleportOrigin: Vec2 | null = null;
  public teleportDest: Vec2 | null = null;
  public teleportVisualTimer = 0;

  constructor(classId: MechClassId, customization?: MechLoadoutCustomization) {
    this.spec = getEffectiveDashSpec(classId, customization);
    this.charges = this.spec.maxCharges;
  }

  public configure(classId: MechClassId, customization?: MechLoadoutCustomization): void {
    this.spec = getEffectiveDashSpec(classId, customization);
    this.activeTimer = 0;
    this.recoveryTimer = 0;
    this.cooldownTimer = 0;
    this.charges = this.spec.maxCharges;
    this.afterimageAccum = 0;
    this.isGrappleDashBoosted = false;
    this.teleportOrigin = null;
    this.teleportDest = null;
    this.teleportVisualTimer = 0;
  }

  public isDashing(): boolean {
    return this.activeTimer > 0;
  }

  /**
   * True ONLY during active dash frames of a teleport-capable unit.
   * Immediately returns false once activeTimer reaches 0.
   */
  public isInvulnerableDuringDash(): boolean {
    return Boolean(this.spec.invulnerableDuringDash && this.activeTimer > 0);
  }

  public isRecovering(): boolean {
    return this.recoveryTimer > 0;
  }

  public canDash(): boolean {
    return this.spec.supported && this.charges > 0 && this.activeTimer <= 0;
  }

  public trigger(
    phys: MechPhysicsState,
    wishX: number,
    wishY: number,
    grappleReleaseWindowTimer = 0,
    collisionCtx?: { obstacles: Obstacle[]; radius: number; mapWidth: number; mapHeight: number }
  ): boolean {
    if (!this.canDash()) return false;

    let dx = wishX;
    let dy = wishY;
    const wMag = Math.hypot(dx, dy);
    if (wMag > 0.15) {
      dx /= wMag;
      dy /= wMag;
    } else {
      const vMag = Math.hypot(phys.vel.x, phys.vel.y);
      if (vMag > 16) {
        dx = phys.vel.x / vMag;
        dy = phys.vel.y / vMag;
      } else {
        dx = Math.cos(phys.bodyAngle);
        dy = Math.sin(phys.bodyAngle);
      }
    }

    const grappleCombo = grappleReleaseWindowTimer > 0;
    this.isGrappleDashBoosted = grappleCombo;
    const comboMult = grappleCombo ? 1.24 : 1.0;

    this.dashDir = { x: dx, y: dy };
    this.activeTimer = this.spec.duration;
    this.recoveryTimer = this.spec.recoveryDuration;
    this.afterimageAccum = this.spec.afterimageInterval; // Immediately capture pose #1

    this.charges = Math.max(0, this.charges - 1);
    if (this.cooldownTimer <= 0) {
      this.cooldownTimer = this.spec.cooldown;
    }

    // Spatial Teleportation Mode (PS-08 Phantom): collision-safe raymarch so unit never clips walls
    if (this.spec.teleportMode && this.spec.teleportRange) {
      const originX = phys.pos.x;
      const originY = phys.pos.y;
      const maxRange = this.spec.teleportRange * comboMult;
      const stepSize = 8;
      const steps = Math.max(1, Math.ceil(maxRange / stepSize));
      const rad = collisionCtx?.radius ?? 22;
      const obstacles = collisionCtx?.obstacles ?? [];
      const minX = rad + 36;
      const minY = rad + 36;
      const maxX = (collisionCtx?.mapWidth ?? 3600) - rad - 36;
      const maxY = (collisionCtx?.mapHeight ?? 2400) - rad - 36;

      let safeX = originX;
      let safeY = originY;
      for (let s = 1; s <= steps; s++) {
        const dist = Math.min(maxRange, s * stepSize);
        const testX = Math.max(minX, Math.min(maxX, originX + dx * dist));
        const testY = Math.max(minY, Math.min(maxY, originY + dy * dist));
        let blocked = false;
        for (let oi = 0; oi < obstacles.length; oi++) {
          const obs = obstacles[oi];
          if (obs.destroyed) continue;
          const halfW = obs.w * 0.5 + rad + 4;
          const halfH = obs.h * 0.5 + rad + 4;
          if (Math.abs(testX - obs.x) < halfW && Math.abs(testY - obs.y) < halfH) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
        safeX = testX;
        safeY = testY;
      }

      this.teleportOrigin = { x: originX, y: originY };
      this.teleportDest = { x: safeX, y: safeY };
      this.teleportVisualTimer = 0.36;

      phys.pos.x = safeX;
      phys.pos.y = safeY;
      // Preserve crisp exit momentum in dash direction without overshooting walls
      phys.vel.x = dx * 155;
      phys.vel.y = dy * 155;
      phys.stability = Math.max(0.25, phys.stability - this.spec.stabilityCost);
      return true;
    }

    // Standard momentum-preserving dash impulse
    const preserveX = phys.vel.x * 0.45;
    const preserveY = phys.vel.y * 0.45;
    phys.vel.x = preserveX + dx * this.spec.impulseSpeed * comboMult;
    phys.vel.y = preserveY + dy * this.spec.impulseSpeed * comboMult;
    const newSpd = Math.hypot(phys.vel.x, phys.vel.y);
    const cap = this.spec.maxDashSpeed * comboMult;
    if (newSpd > cap) {
      phys.vel.x = (phys.vel.x / newSpd) * cap;
      phys.vel.y = (phys.vel.y / newSpd) * cap;
    }

    // Physical suspension dip + forward lean into dash
    const fwdDot = dx * Math.cos(phys.bodyAngle) + dy * Math.sin(phys.bodyAngle);
    const latDot = -dx * Math.sin(phys.bodyAngle) + dy * Math.cos(phys.bodyAngle);
    phys.tiltX = Math.max(-0.28, Math.min(0.28, phys.tiltX + fwdDot * 0.18));
    phys.tiltY = Math.max(-0.28, Math.min(0.28, phys.tiltY + latDot * 0.18));
    phys.bounceVelZ -= 36;
    phys.stability = Math.max(0.18, phys.stability - this.spec.stabilityCost);
    phys.recoilRecoverTimer = Math.max(phys.recoilRecoverTimer, this.spec.duration + 0.14);

    return true;
  }

  public update(
    dt: number,
    phys: MechPhysicsState,
    afterimagePool: AfterimagePool,
    pose: {
      altitude: number;
      radius: number;
      silhouette: string;
      legs: ProceduralLeg[];
      afterimageIntensity: number;
      dashVfxEnabled: boolean;
    }
  ): void {
    if (this.teleportVisualTimer > 0) {
      this.teleportVisualTimer = Math.max(0, this.teleportVisualTimer - dt);
      if (this.teleportVisualTimer <= 0) {
        this.teleportOrigin = null;
        this.teleportDest = null;
      }
    }

    // Recharge cooldown
    if (this.charges < this.spec.maxCharges) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.charges = Math.min(this.spec.maxCharges, this.charges + 1);
        this.cooldownTimer = this.charges < this.spec.maxCharges ? this.spec.cooldown : 0;
      }
    }

    if (this.activeTimer > 0) {
      this.activeTimer = Math.max(0, this.activeTimer - dt);
      if (this.spec.teleportMode) {
        // Teleport unit stays agile during brief invulnerable arrival window without forcing extra wall slide
        return;
      }
      // Maintain smooth thrust curve during active burst, tapering smoothly at tail
      const ratio = this.activeTimer / Math.max(0.01, this.spec.duration);
      const comboMult = this.isGrappleDashBoosted ? 1.2 : 1.0;
      const targetSpd = this.spec.maxDashSpeed * comboMult * (0.78 + 0.22 * ratio);
      const curSpd = Math.hypot(phys.vel.x, phys.vel.y);
      if (curSpd < targetSpd) {
        phys.vel.x += this.dashDir.x * (targetSpd - curSpd) * Math.min(1, dt * 11);
        phys.vel.y += this.dashDir.y * (targetSpd - curSpd) * Math.min(1, dt * 11);
      }

      if (pose.dashVfxEnabled && pose.afterimageIntensity > 0.02) {
        this.afterimageAccum += dt;
        if (this.afterimageAccum >= this.spec.afterimageInterval) {
          this.afterimageAccum = 0;
          afterimagePool.spawn({
            x: phys.pos.x,
            y: phys.pos.y,
            bodyAngle: phys.bodyAngle,
            aimAngle: phys.aimAngle,
            altitude: pose.altitude,
            radius: pose.radius,
            silhouette: pose.silhouette,
            tintColor: this.spec.tintColor,
            maxLife: 0.24 + pose.afterimageIntensity * 0.16,
            legs: pose.legs,
          });
        }
      }
    } else if (this.recoveryTimer > 0) {
      this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);
      // Natural momentum bleed after dash instead of brick-wall stop
      const bleed = Math.exp(-3.4 * dt);
      phys.vel.x *= bleed;
      phys.vel.y *= bleed;
    }
  }
}
