import {
  AntiAirClassKey,
  AntiAirSpec,
  computeEffectiveAntiAirSpec,
  mapMechClassToAntiAirKey,
} from './antiAirUpgrades';
import { AntiAirTracer, computeAntiAirDamage, computeAntiAirHitChance } from './antiAirWeapon';
import { damageMissileProjectile, TrackedMissileThreat } from './combatThreatManager';
import { hasMissileLineOfSight } from './missileGuidance';
import { doesSegmentCrossSmoke, isPointInSmoke, SmokeCloud } from './mortarSystem';
import { normalizeAngle, shortestAngleDiff } from './physics';
import { MechClassId, MechLoadoutCustomization, Obstacle } from './types';
import { Projectile } from './weapons';

export interface AntiAirStepInput {
  ownerId: string;
  team: 'player' | 'enemy';
  x: number;
  y: number;
  altitude: number;
  bodyAngle: number;
  radius: number;
  jammedTimer: number;
  subsystemHealth: number; // 0..1 combined sensor/weapon health ratio
  threats: TrackedMissileThreat[];
  obstacles: Obstacle[];
  smokeClouds: SmokeCloud[];
  alreadyTargetedByInterceptor?: Set<Projectile>;
  rng?: () => number;
}

export interface AntiAirInterceptorLaunch {
  targetProjectile: Projectile;
  launchX: number;
  launchY: number;
  angle: number;
  reliability: number;
}

export interface AntiAirStepResult {
  fired: boolean;
  intercepted: boolean;
  hitX: number;
  hitY: number;
  muzzleX: number;
  muzzleY: number;
  overheatedJustNow: boolean;
  trackingCount: number;
  caliberScale: number;
  launchInterceptor: AntiAirInterceptorLaunch | null;
}

export class AntiAirController {
  public spec: AntiAirSpec;
  public turretAngle: number;
  public heat = 0;
  public overheated = false;
  public cooldown = 0;
  public lockTimer = 0;
  public recoil = 0;
  public muzzleFlashTimer = 0;
  public tracers: AntiAirTracer[] = [];
  public trackingCount = 0;
  public damagedDegraded = false;
  public interceptorCooldown = 0;

  private activeTarget: Projectile | null = null;
  private rngFallback = Math.random;

  constructor(spec: AntiAirSpec, initialAngle = 0) {
    this.spec = spec;
    this.turretAngle = initialAngle;
  }

  public static forMechClass(
    classId: MechClassId,
    custom?: MechLoadoutCustomization,
    initialAngle = 0
  ): AntiAirController {
    const key = mapMechClassToAntiAirKey(classId);
    return new AntiAirController(computeEffectiveAntiAirSpec(key, custom), initialAngle);
  }

  public static forPreset(
    classKey: AntiAirClassKey,
    custom?: MechLoadoutCustomization,
    initialAngle = 0
  ): AntiAirController {
    return new AntiAirController(computeEffectiveAntiAirSpec(classKey, custom), initialAngle);
  }

  public getHeatRatio(): number {
    return Math.max(0, Math.min(1, this.heat / 100));
  }

  public update(dt: number, input: AntiAirStepInput): AntiAirStepResult {
    const result: AntiAirStepResult = {
      fired: false,
      intercepted: false,
      hitX: 0,
      hitY: 0,
      muzzleX: input.x,
      muzzleY: input.y,
      overheatedJustNow: false,
      trackingCount: 0,
      caliberScale: this.spec.caliberScale,
      launchInterceptor: null,
    };

    // Decay tracers, recoil, and muzzle flash cleanly even when idle
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) {
        this.tracers.splice(i, 1);
      }
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.interceptorCooldown = Math.max(0, this.interceptorCooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 7.5);
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);

    // Passive barrel heat dissipation
    const coolMult = this.overheated ? 1.15 : 1.0;
    this.heat = Math.max(0, this.heat - this.spec.coolRate * coolMult * dt);
    if (this.overheated && this.heat <= this.spec.overheatLockoutHeat) {
      this.overheated = false;
    }

    // Effective subsystem health mitigated by armored AA turret ring
    const rawHealth = Math.max(0, Math.min(1, input.subsystemHealth));
    const effectiveHealth = rawHealth + (1 - rawHealth) * this.spec.sensorResilience * 0.65;
    this.damagedDegraded = rawHealth < 0.65;

    if (effectiveHealth <= 0.12 || input.jammedTimer > 0) {
      this.trackingCount = 0;
      this.activeTarget = null;
      this.lockTimer = 0;
      return result;
    }

    // Score & select best incoming missile threat within detection range, firing arc, and LOS
    const effRange = this.spec.range * (0.72 + 0.28 * effectiveHealth);
    let bestThreat: TrackedMissileThreat | null = null;
    let bestScore = -1e9;
    let validThreatCount = 0;

    for (let i = 0; i < input.threats.length; i++) {
      const t = input.threats[i];
      if (!t.projectile.active) continue;
      const dx = t.x - input.x;
      const dy = t.y - input.y;
      const dist = Math.hypot(dx, dy);

      // Too far or inside point-blank blind deadzone
      if (dist > effRange || dist < this.spec.minEngageDist) continue;

      const angleToThreat = Math.atan2(dy, dx);
      if (this.spec.arcHalfRad < Math.PI - 0.01) {
        const bodyRelAngle = Math.abs(shortestAngleDiff(input.bodyAngle, angleToThreat));
        if (bodyRelAngle > this.spec.arcHalfRad) continue;
      }

      // Radar LOS check against tall terrain & dense smoke clouds
      if (
        input.smokeClouds.length > 0 &&
        (isPointInSmoke(t.x, t.y, input.smokeClouds) ||
          doesSegmentCrossSmoke(input.x, input.y, t.x, t.y, input.smokeClouds))
      ) {
        continue;
      }
      if (!hasMissileLineOfSight(input.x, input.y, input.altitude, t.x, t.y, t.altitude, input.obstacles)) {
        continue;
      }

      validThreatCount++;

      // Check closing velocity so receding stray missiles are deprioritized
      const closingSpeed = -(dx * t.vx + dy * t.vy) / Math.max(1, dist);
      const targetedSelfBonus = t.targetId === input.ownerId ? 240 : 0;
      const closingBonus = Math.max(-180, closingSpeed * 0.45);
      const score = targetedSelfBonus + t.threatWeight * 190 + closingBonus - dist * 0.65;

      if (score > bestScore) {
        bestScore = score;
        bestThreat = t;
      }
    }

    this.trackingCount = validThreatCount;
    result.trackingCount = validThreatCount;

    // Long-range counter-interceptor battery scan (engages incoming long-range & standoff missiles)
    if (this.interceptorCooldown <= 0 && effectiveHealth > 0.22 && input.threats.length > 0) {
      const effInterceptorRange = this.spec.interceptorRange * (0.75 + 0.25 * effectiveHealth);
      let bestLongThreat: TrackedMissileThreat | null = null;
      let bestLongScore = -1e9;

      for (let i = 0; i < input.threats.length; i++) {
        const t = input.threats[i];
        if (!t.projectile.active) continue;
        if (input.alreadyTargetedByInterceptor?.has(t.projectile)) continue;

        const dx = t.x - input.x;
        const dy = t.y - input.y;
        const dist = Math.hypot(dx, dy);
        const isPriorityLong =
          t.missileType === 'long_range' ||
          t.missileType === 'heavy' ||
          t.missileType === 'advanced_tracking';
        const minR = isPriorityLong ? this.spec.interceptorMinRange * 0.72 : this.spec.interceptorMinRange;
        if (dist < minR || dist > effInterceptorRange) continue;

        const closingSpeed = -(dx * t.vx + dy * t.vy) / Math.max(1, dist);
        if (closingSpeed < 45 && t.targetId !== input.ownerId) continue;

        if (
          input.smokeClouds.length > 0 &&
          (isPointInSmoke(t.x, t.y, input.smokeClouds) ||
            doesSegmentCrossSmoke(input.x, input.y, t.x, t.y, input.smokeClouds))
        ) {
          continue;
        }
        if (!hasMissileLineOfSight(input.x, input.y, input.altitude, t.x, t.y, t.altitude, input.obstacles)) {
          continue;
        }

        const typeBonus =
          t.missileType === 'long_range'
            ? 320
            : t.missileType === 'heavy'
            ? 240
            : t.missileType === 'advanced_tracking'
            ? 210
            : 120;
        const selfBonus = t.targetId === input.ownerId ? 200 : 0;
        const score = typeBonus + selfBonus + closingSpeed * 0.35 - dist * 0.15;
        if (score > bestLongScore) {
          bestLongScore = score;
          bestLongThreat = t;
        }
      }

      if (bestLongThreat) {
        const launchAngle = Math.atan2(bestLongThreat.y - input.y, bestLongThreat.x - input.x);
        const podDist = input.radius * 0.55 + 4;
        result.launchInterceptor = {
          targetProjectile: bestLongThreat.projectile,
          launchX: input.x + Math.cos(launchAngle) * podDist,
          launchY: input.y + Math.sin(launchAngle) * podDist,
          angle: launchAngle,
          reliability: Math.min(
            this.spec.maxHitChanceCap,
            this.spec.interceptorInterceptChance * (0.65 + 0.35 * effectiveHealth)
          ),
        };
        this.interceptorCooldown = this.spec.interceptorCooldown;
      }
    }

    if (!bestThreat) {
      this.activeTarget = null;
      this.lockTimer = 0;
      return result;
    }

    // Track target change -> apply acquisition reaction delay + swarm saturation penalty
    if (this.activeTarget !== bestThreat.projectile) {
      this.activeTarget = bestThreat.projectile;
      const extraSaturation = Math.max(0, validThreatCount - 1) * this.spec.multiTargetPenalty;
      const damagePenalty = (1 - effectiveHealth) * 0.16;
      this.lockTimer = this.spec.reactionDelay + extraSaturation + damagePenalty;
    } else if (this.lockTimer > 0) {
      this.lockTimer = Math.max(0, this.lockTimer - dt);
    }

    // Predict slight lead for AA tracer barrel aim
    const dx = bestThreat.x - input.x;
    const dy = bestThreat.y - input.y;
    const dist = Math.hypot(dx, dy);
    const leadT = Math.min(0.24, dist / 1650);
    const predX = bestThreat.x + bestThreat.vx * leadT;
    const predY = bestThreat.y + bestThreat.vy * leadT;
    const desiredAngle = Math.atan2(predY - input.y, predX - input.x);

    // Slew AA turret at finite angular rate
    const slewRate = this.spec.slewRateRad * (0.55 + 0.45 * effectiveHealth);
    const angleDiff = shortestAngleDiff(this.turretAngle, desiredAngle);
    const maxStep = slewRate * dt;
    this.turretAngle = normalizeAngle(
      this.turretAngle + Math.max(-maxStep, Math.min(maxStep, angleDiff))
    );

    const remainingAngleError = Math.abs(shortestAngleDiff(this.turretAngle, desiredAngle));

    // Gate firing on overheat, cooldown, reaction lock delay, and turret slew alignment
    if (
      this.overheated ||
      this.cooldown > 0 ||
      this.lockTimer > 0 ||
      remainingAngleError > this.spec.aimToleranceRad
    ) {
      return result;
    }

    // Fire burst round!
    const muzzleDist = input.radius * 0.62 + 6;
    const muzzleX = input.x + Math.cos(this.turretAngle) * muzzleDist;
    const muzzleY = input.y + Math.sin(this.turretAngle) * muzzleDist;
    result.muzzleX = muzzleX;
    result.muzzleY = muzzleY;
    result.fired = true;

    const effFireRate = this.spec.fireRate * (0.65 + 0.35 * effectiveHealth);
    this.cooldown = 1 / Math.max(1.2, effFireRate);
    this.recoil = 1.0;
    this.muzzleFlashTimer = 0.065;

    this.heat = Math.min(100, this.heat + this.spec.heatPerShot);
    if (this.heat >= 100) {
      this.overheated = true;
      result.overheatedJustNow = true;
    }

    const hitChance = computeAntiAirHitChance({
      spec: this.spec,
      missileSpeed: bestThreat.speed,
      missileType: bestThreat.missileType,
      angularErrorRad: remainingAngleError,
      nearbyThreatsCount: validThreatCount,
      subsystemHealthFactor: effectiveHealth,
      distance: dist,
    });

    const rand = (input.rng ?? this.rngFallback)();
    const isHit = rand <= hitChance;

    const tracerColor = input.team === 'player' ? '#fbbf24' : '#fb7185';
    if (isHit) {
      const dmg = computeAntiAirDamage(this.spec, effectiveHealth);
      const destroyed = damageMissileProjectile(bestThreat.projectile, dmg);
      result.intercepted = destroyed;
      result.hitX = bestThreat.x;
      result.hitY = bestThreat.y;

      this.tracers.push({
        x1: muzzleX,
        y1: muzzleY,
        x2: bestThreat.x,
        y2: bestThreat.y,
        life: 0.062,
        maxLife: 0.062,
        hit: true,
        color: tracerColor,
        caliberScale: this.spec.caliberScale,
      });
    } else {
      // Visible near-miss tracer spray around the missile path
      const missSpread = (rand - 0.5) * 0.2;
      const missAngle = this.turretAngle + missSpread;
      const tracerLen = Math.min(effRange, dist + 60);
      const endX = muzzleX + Math.cos(missAngle) * tracerLen;
      const endY = muzzleY + Math.sin(missAngle) * tracerLen;
      result.hitX = endX;
      result.hitY = endY;

      this.tracers.push({
        x1: muzzleX,
        y1: muzzleY,
        x2: endX,
        y2: endY,
        life: 0.055,
        maxLife: 0.055,
        hit: false,
        color: tracerColor,
        caliberScale: this.spec.caliberScale,
      });
    }

    return result;
  }
}
