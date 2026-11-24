import { AntiAirController } from './antiAirController';
import { BossFootstepEvent, BossLegAnimator } from './bossLegs';
import {
  BossAIState,
  BossComponentId,
  BossComponentState,
  BossHudSnapshot,
  BossPosture,
  BossTuningOverrides,
  BossUltimateId,
  BossVariantId,
  BossVariantSpec,
  BossWarheadType,
} from './bossTypes';
import { BOSS_VARIANTS } from './bossVariants';
import {
  applyRecoilImpulse,
  createPhysicsState,
  PhysicsConfig,
  MechPhysicsState,
  normalizeAngle,
  resolveObstacleCollisions,
  shortestAngleDiff,
  stepMechPhysics,
} from './physics';
import { ComponentHealth, Obstacle, TerrainType, Vec2 } from './types';
import { evaluateBossVulnerabilityWindow } from './precisionTargeting';

export interface BossTeleportStartEvent {
  x: number;
  y: number;
  destX: number;
  destY: number;
  warpColor: string;
  personality: BossVariantSpec['teleport']['personality'];
}

export interface BossTeleportExecuteEvent {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  bodyAngle: number;
  radius: number;
  silhouette: BossVariantSpec['silhouette'];
  warpColor: string;
}

export interface BossUpdateActions {
  footsteps: BossFootstepEvent[];
  startWarning?: {
    x: number;
    y: number;
    radius: number;
    duration: number;
    warheadType: BossWarheadType;
  };
  extraWarnings?: {
    x: number;
    y: number;
    radius: number;
    duration: number;
    warheadType: BossWarheadType;
  }[];
  fireMortarShells?: {
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    damage: number;
    splashRadius: number;
    warheadType: BossWarheadType;
    delayedSecondary: boolean;
  }[];
  fireAuxShots?: {
    x: number;
    y: number;
    angle: number;
    kind: BossVariantSpec['auxWeaponKind'];
    damage: number;
  }[];
  spawnDeployable?: {
    kind: 'turret' | 'decoy';
    x: number;
    y: number;
  };
  empPulse?: { x: number; y: number; radius: number };
  startUltimate?: {
    variantId: BossVariantId;
    ultimateId: BossUltimateId;
    ultimateName: string;
    targetPos: Vec2;
  };
  cookOffExplosion?: { x: number; y: number; radius: number };
  finalDetonation?: { x: number; y: number; radius: number };
  phaseChangedTo?: 1 | 2 | 3 | 4;
  teleportStart?: BossTeleportStartEvent;
  teleportExecute?: BossTeleportExecuteEvent;
}

export interface BossIncomingProjectileThreat {
  id: string;
  kind: 'mortar' | 'missile';
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX?: number;
  targetY?: number;
  remainingFlightSec: number;
  splashRadius: number;
  damage: number;
  piercing: boolean;
  homing: boolean;
}

export class ThunderheadBoss {
  public id: string;
  public spec: BossVariantSpec;
  public phys: MechPhysicsState;
  public physCfg: PhysicsConfig;
  public legs: BossLegAnimator;

  public hull: number;
  public maxHull: number;
  public armor: number;
  public maxArmor: number;
  public phase: 1 | 2 | 3 | 4 = 1;
  public aiState: BossAIState = 'acquiring';
  public posture: BossPosture = 'heavy_idle';
  public alive = true;
  public destroying = false;
  public destroyTimer = 0;
  public readonly destroyDuration = 2.8;
  private cookOffTimer = 0;

  public turretAngle: number;
  public barrelPitch = 0.25; // 0 horizontal .. 1 high mortar elevation
  public loaderProgress = 0; // 0..1 visible loading crane gantry progress
  public radarAngle = 0;
  public hitFlashTimer = 0;
  public stateTimer = 1.6;
  public activeWarhead: BossWarheadType;
  private warheadIndex = 0;
  public pendingTarget: Vec2 | null = null;
  private plannedSalvoTargets: Vec2[] = [];
  private auxCooldown = 0.9;
  private deployCooldown = 9.5;
  private moveGoal: Vec2 | null = null;
  private repositionTimer = 0;

  // High-speed hunter & ultimate state
  public hatchOpenAmount = 0;
  public chargeGlow = 0;
  public empScrambleTimer = 0;
  public ultimateActive = false;
  private ultimateTimer = 0;
  private ultimateWaveIndex = 0;
  private ultimateWaveCooldown = 0;
  private ultimateCooldown = 14;
  private ultimateTarget: Vec2 = { x: 0, y: 0 };
  private pendingUltimateStart = false;
  private incomingDodgeTimer = 0;
  private incomingThreatPos: Vec2 | null = null;
  private evadeCooldownTimer = 0;
  private activeEvadeDir: Vec2 | null = null;
  private activeEvadeTimer = 0;
  private consecutiveEvadeCount = 0;
  private evadeFatigueTimer = 0;
  private evadeResetWindow = 0;
  private emergencyWarpCooldown = 0;
  public auxExposedTimer = 0;

  // Spatial teleportation state (variant-tailored with validated obstacle-free destinations & IK reset)
  public teleportPhase: 'idle' | 'telegraphing' = 'idle';
  public teleportCooldown = 6.5;
  public teleportTelegraphTimer = 0;
  public teleportTelegraphTotal = 0.6;
  public teleportPendingDest: Vec2 | null = null;
  private teleportBurstRemaining = 0;
  private recentRearCoreHits = 0;
  private recentRearHitDecay = 0;

  public damageMult = 1.0;
  public aggressionMult = 1.0;
  public attackFreqMult = 1.0;
  private speedMult = 1.0;

  public components: Record<BossComponentId, BossComponentState>;
  public antiAir: AntiAirController;

  constructor(
    variantId: BossVariantId,
    x: number,
    y: number,
    difficultyMult = 1.0,
    overrides?: BossTuningOverrides
  ) {
    this.spec = BOSS_VARIANTS[variantId];
    this.id = `boss_${variantId}`;
    const hpScale = difficultyMult * (overrides?.healthMult ?? 1.0);
    this.damageMult = overrides?.damageMult ?? 1.0;
    this.speedMult = overrides?.speedMult ?? 1.0;
    this.aggressionMult = overrides?.aggressionMult ?? 1.0;
    this.attackFreqMult = overrides?.attackFreqMult ?? 1.0;

    this.maxHull = Math.round(this.spec.maxHull * hpScale);
    this.hull = this.maxHull;
    this.maxArmor = Math.round(this.spec.maxArmor * hpScale);
    this.armor = this.maxArmor;

    const initialAngle = Math.PI;
    this.phys = createPhysicsState(x, y, initialAngle);
    this.turretAngle = initialAngle;

    this.physCfg = {
      mass: this.spec.mass,
      acceleration: this.spec.acceleration * this.speedMult,
      maxSpeed: this.spec.maxSpeed * this.speedMult,
      sprintMultiplier: this.spec.id === 'stormbringer' ? 1.24 : 1.18,
      reverseMultiplier: 0.72,
      turnAccel: this.spec.turnAccel * Math.max(0.85, this.speedMult),
      maxTurnSpeed: this.spec.maxTurnSpeed * Math.max(0.85, this.speedMult),
      lateralGrip: 4.8,
      radius: this.spec.radius,
      suspensionStiffness: 12.5,
      terrainPenaltyMult: 0.55,
    };

    this.legs = new BossLegAnimator(this.spec.legs, this.phys.pos, this.phys.bodyAngle);
    this.activeWarhead = this.spec.warheadRotation[0];
    this.ultimateCooldown = this.spec.id === 'stormbringer' ? 10.5 : 13.5;
    this.teleportCooldown = this.spec.teleport.cooldown * 0.65;

    const compLabels: Record<BossComponentId, string> = {
      mortar: 'Nuclear Mortar',
      ammoBays: 'Ammo Vaults',
      sensors: 'Radar Array',
      leftLegs: 'Port Struts',
      rightLegs: 'Stbd Struts',
      auxWeapons: 'Close Defense',
      powerCore: 'Rear Core',
    };

    this.components = {
      mortar: {
        id: 'mortar',
        label: compLabels.mortar,
        hp: Math.round(this.spec.componentHealth.mortar * difficultyMult),
        maxHp: Math.round(this.spec.componentHealth.mortar * difficultyMult),
        destroyed: false,
      },
      ammoBays: {
        id: 'ammoBays',
        label: compLabels.ammoBays,
        hp: Math.round(this.spec.componentHealth.ammoBays * difficultyMult),
        maxHp: Math.round(this.spec.componentHealth.ammoBays * difficultyMult),
        destroyed: false,
      },
      sensors: {
        id: 'sensors',
        label: compLabels.sensors,
        hp: Math.round(this.spec.componentHealth.sensors * difficultyMult),
        maxHp: Math.round(this.spec.componentHealth.sensors * difficultyMult),
        destroyed: false,
      },
      leftLegs: {
        id: 'leftLegs',
        label: compLabels.leftLegs,
        hp: Math.round(this.spec.componentHealth.leftLegs * difficultyMult),
        maxHp: Math.round(this.spec.componentHealth.leftLegs * difficultyMult),
        destroyed: false,
      },
      rightLegs: {
        id: 'rightLegs',
        label: compLabels.rightLegs,
        hp: Math.round(this.spec.componentHealth.rightLegs * difficultyMult),
        maxHp: Math.round(this.spec.componentHealth.rightLegs * difficultyMult),
        destroyed: false,
      },
      auxWeapons: {
        id: 'auxWeapons',
        label: compLabels.auxWeapons,
        hp: Math.round(this.spec.componentHealth.auxWeapons * difficultyMult),
        maxHp: Math.round(this.spec.componentHealth.auxWeapons * difficultyMult),
        destroyed: false,
      },
      powerCore: {
        id: 'powerCore',
        label: compLabels.powerCore,
        hp: Math.round(this.spec.componentHealth.powerCore * difficultyMult),
        maxHp: Math.round(this.spec.componentHealth.powerCore * difficultyMult),
        destroyed: false,
      },
    };

    this.antiAir = AntiAirController.forPreset('boss', undefined, initialAngle);
  }

  public getAntiAirSubsystemHealth(): number {
    const aux = this.components.auxWeapons;
    const sens = this.components.sensors;
    const core = this.components.powerCore;
    const auxRatio = aux.destroyed ? 0.14 : aux.hp / Math.max(1, aux.maxHp);
    const sensRatio = sens.destroyed ? 0.18 : sens.hp / Math.max(1, sens.maxHp);
    const coreRatio = core.destroyed ? 0.3 : core.hp / Math.max(1, core.maxHp);
    return Math.max(0.12, auxRatio * 0.48 + sensRatio * 0.34 + coreRatio * 0.18);
  }

  public getPhaseFromHull(): 1 | 2 | 3 | 4 {
    const ratio = this.hull / Math.max(1, this.maxHull);
    if (ratio > 0.7) return 1;
    if (ratio > 0.4) return 2;
    if (ratio > 0.2) return 3;
    return 4;
  }

  /**
   * Resolves which specific targetable component a projectile hit in world space
   * by transforming the impact point into the boss's local chassis coordinates.
   */
  public resolveHitComponent(hitX: number, hitY: number): {
    component: BossComponentId;
    isRearWeakPoint: boolean;
    isFrontArmor: boolean;
  } {
    const dx = hitX - this.phys.pos.x;
    const dy = hitY - this.phys.pos.y;
    const c = Math.cos(-this.phys.bodyAngle);
    const s = Math.sin(-this.phys.bodyAngle);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const r = this.spec.radius;

    // 1. Rear power core weak point
    if (lx < -r * 0.42 && Math.abs(ly) < r * 0.48) {
      return { component: 'powerCore', isRearWeakPoint: true, isFrontArmor: false };
    }
    // 2. Outer leg clusters on port (-Y) or starboard (+Y)
    if (ly < -r * 0.72) {
      return { component: 'leftLegs', isRearWeakPoint: false, isFrontArmor: false };
    }
    if (ly > r * 0.72) {
      return { component: 'rightLegs', isRearWeakPoint: false, isFrontArmor: false };
    }
    // 3. Lateral ammunition compartments (flank mid-hull)
    if (Math.abs(lx) < r * 0.42 && Math.abs(ly) >= r * 0.36) {
      return { component: 'ammoBays', isRearWeakPoint: false, isFrontArmor: false };
    }
    // 4. Dorsal radar / sensor array (slightly behind main mortar turret)
    if (lx < -r * 0.08 && lx >= -r * 0.44 && Math.abs(ly) < r * 0.32) {
      return { component: 'sensors', isRearWeakPoint: false, isFrontArmor: false };
    }
    // 5. Central dorsal nuclear mortar turret
    if (Math.hypot(lx, ly) < r * 0.44) {
      return { component: 'mortar', isRearWeakPoint: false, isFrontArmor: false };
    }
    // 6. Forward / flank auxiliary turrets
    if (lx > r * 0.28 && Math.abs(ly) > r * 0.22) {
      return { component: 'auxWeapons', isRearWeakPoint: false, isFrontArmor: lx > r * 0.48 };
    }

    return {
      component: lx > r * 0.32 ? 'auxWeapons' : 'mortar',
      isRearWeakPoint: false,
      isFrontArmor: lx > r * 0.32,
    };
  }

  public applyDamage(
    rawDamage: number,
    hitX: number,
    hitY: number,
    opts?: { piercing?: boolean; emp?: boolean; forcedComponent?: BossComponentId }
  ): {
    hullDamage: number;
    armorDamage: number;
    hitComponent: BossComponentId;
    componentJustDestroyed: BossComponentId | null;
    secondaryCookOff: boolean;
    startedDestruction: boolean;
    exposedHit: boolean;
    hitZoneLabel: string;
  } {
    if (!this.alive || this.destroying) {
      return {
        hullDamage: 0,
        armorDamage: 0,
        hitComponent: 'mortar',
        componentJustDestroyed: null,
        secondaryCookOff: false,
        startedDestruction: false,
        exposedHit: false,
        hitZoneLabel: 'NONE',
      };
    }

    const hitInfo = this.resolveHitComponent(hitX, hitY);
    const compId = opts?.forcedComponent ?? hitInfo.component;
    const comp = this.components[compId];
    const vuln = evaluateBossVulnerabilityWindow(this, compId, hitInfo);

    if (hitInfo.isRearWeakPoint || compId === 'powerCore') {
      this.recentRearCoreHits += rawDamage;
      this.recentRearHitDecay = 2.6;
    }

    // Directional, vulnerability window & core multipliers
    let mult = 1.0;
    if (hitInfo.isFrontArmor && this.armor > 0 && !vuln.exposed) {
      mult *= this.spec.frontArmorMult;
    } else if (hitInfo.isRearWeakPoint || compId === 'powerCore') {
      mult *= this.spec.rearWeakMult;
    }
    if (vuln.exposed) {
      mult *= vuln.damageMultiplier;
    }
    if (this.components.powerCore.destroyed) {
      mult *= 1.25; // Destroyed rear core exposes internal systems
    }
    if (opts?.emp) {
      mult *= 1.35;
    }

    const effDamage = rawDamage * mult;
    let armorDamage = 0;
    let hullDamage = 0;

    if (this.armor > 0 && !hitInfo.isRearWeakPoint && !vuln.exposed) {
      const pierceRatio = opts?.piercing ? 0.45 : 0.2;
      const armorPortion = Math.min(this.armor, effDamage * (1 - pierceRatio));
      this.armor -= armorPortion;
      armorDamage = armorPortion;
      hullDamage = effDamage - armorPortion * 0.72;
    } else {
      hullDamage = effDamage;
    }

    this.hull = Math.max(0, this.hull - hullDamage);
    this.hitFlashTimer = 0.06;

    // Apply damage directly to the struck sub-component
    let componentJustDestroyed: BossComponentId | null = null;
    let secondaryCookOff = false;
    if (!comp.destroyed) {
      const baseCompScale = compId === 'powerCore' || compId === 'ammoBays' ? 1.15 : 0.92;
      const compDmg = effDamage * baseCompScale * vuln.componentDamageMultiplier;
      comp.hp = Math.max(0, comp.hp - compDmg);
      if (comp.hp <= 0) {
        comp.destroyed = true;
        componentJustDestroyed = compId;
        if (compId === 'ammoBays') {
          // Catastrophic secondary ammo detonation damages boss hull & interrupts loading!
          this.hull = Math.max(0, this.hull - this.maxHull * 0.12);
          secondaryCookOff = true;
        }
        // Stagger / interrupt boss firing/loading when an exposed critical subsystem shatters
        if (vuln.staggerOnBreak) {
          if (this.aiState === 'loading' || this.aiState === 'warning' || this.aiState === 'bracing') {
            this.aiState = 'reloading';
            this.stateTimer = Math.max(1.2, this.spec.mortarReloadTime * 0.65);
            this.hatchOpenAmount = 0.15;
            this.chargeGlow = 0;
          } else {
            this.stateTimer += 0.8;
          }
          if (compId === 'mortar' && this.ultimateActive) {
            this.ultimateActive = false;
            this.aiState = 'reloading';
            this.stateTimer = 1.8;
          }
        }
      }
    }

    // Update phase
    const newPhase = this.getPhaseFromHull();
    if (newPhase > this.phase) {
      this.phase = newPhase;
    }

    let startedDestruction = false;
    if (this.hull <= 0 && !this.destroying) {
      this.destroying = true;
      this.aiState = 'destroying';
      this.teleportPhase = 'idle';
      this.teleportPendingDest = null;
      this.destroyTimer = 0;
      this.cookOffTimer = 0.25;
      startedDestruction = true;
    }

    return {
      hullDamage,
      armorDamage,
      hitComponent: compId,
      componentJustDestroyed,
      secondaryCookOff,
      startedDestruction,
      exposedHit: vuln.exposed,
      hitZoneLabel: vuln.zoneLabel,
    };
  }

  /**
   * Finds a validated obstacle-free, arena-bounded teleportation coordinate matching
   * this boss's combat personality, ensuring the boss never warps inside walls or onto units.
   */
  public findValidTeleportDestination(
    playerPos: Vec2,
    alliesPos: Vec2[],
    obstacles: Obstacle[],
    mapW: number,
    mapH: number
  ): Vec2 | null {
    const tp = this.spec.teleport;
    const r = this.spec.radius;
    const margin = r + 96;
    const angToPlayer = Math.atan2(playerPos.y - this.phys.pos.y, playerPos.x - this.phys.pos.x);
    const distToPlayer = Math.hypot(playerPos.x - this.phys.pos.x, playerPos.y - this.phys.pos.y);

    // Choose desired tactical displacement vector per boss personality
    const candidateAngles: number[] = [];
    if (tp.personality === 'stormbringer_flank') {
      // Aggressive flank toward or obliquely beside the player
      const base = distToPlayer > tp.maxDist * 1.1 ? angToPlayer : angToPlayer + (Math.random() > 0.5 ? 0.85 : -0.85);
      candidateAngles.push(base, base + 0.45, base - 0.45, angToPlayer + 1.2, angToPlayer - 1.2);
    } else if (tp.personality === 'fortress_anchor') {
      // Gain clean standoff distance so frontal glacis can re-face the player cleanly
      const away = angToPlayer + Math.PI;
      candidateAngles.push(away, away + 0.55, away - 0.55, away + 1.1, away - 1.1);
    } else if (tp.personality === 'blackout_ambush') {
      // Shadow-blink to oblique/rear blind angle behind or beside player
      const blind = angToPlayer + (Math.random() > 0.5 ? 1.75 : -1.75);
      candidateAngles.push(blind, blind + 0.4, blind - 0.4, angToPlayer + Math.PI * 0.65, angToPlayer - Math.PI * 0.65);
    } else if (tp.personality === 'cataclysm_shift') {
      // Deliberate heavy artillery crossfire relocation around ideal carpet range
      const side = angToPlayer + (Math.random() > 0.5 ? 1.35 : -1.35);
      candidateAngles.push(side, side + 0.45, side - 0.45, angToPlayer + Math.PI * 0.78, angToPlayer - Math.PI * 0.78);
    } else {
      // Siege: lateral/long-range artillery reposition
      const lat = angToPlayer + (Math.random() > 0.5 ? Math.PI * 0.52 : -Math.PI * 0.52);
      candidateAngles.push(lat, lat + 0.5, lat - 0.5, angToPlayer + Math.PI * 0.82, angToPlayer - Math.PI * 0.82);
    }

    // Fill additional full-circle fallback angles so constrained maps always find a safe spot
    for (let k = 0; k < 8; k++) {
      candidateAngles.push((k / 8) * Math.PI * 2);
    }

    const distances = [
      (tp.minDist + tp.maxDist) * 0.55,
      tp.maxDist * 0.92,
      tp.minDist * 1.05,
    ];

    const clearance = r + 30;
    const minUnitClearance = r + 135;

    for (const d of distances) {
      for (const a of candidateAngles) {
        const cx = this.phys.pos.x + Math.cos(a) * d;
        const cy = this.phys.pos.y + Math.sin(a) * d;
        if (cx < margin || cx > mapW - margin || cy < margin || cy > mapH - margin) continue;
        if (Math.hypot(cx - this.phys.pos.x, cy - this.phys.pos.y) < tp.minDist * 0.72) continue;

        // Avoid overlapping player or friendly squadmates
        if (Math.hypot(cx - playerPos.x, cy - playerPos.y) < minUnitClearance) continue;
        let overlapsAlly = false;
        for (let i = 0; i < alliesPos.length; i++) {
          if (Math.hypot(cx - alliesPos[i].x, cy - alliesPos[i].y) < minUnitClearance * 0.82) {
            overlapsAlly = true;
            break;
          }
        }
        if (overlapsAlly) continue;

        // Obstacle AABB check with full boss radius + stride clearance
        let blocked = false;
        for (let i = 0; i < obstacles.length; i++) {
          const obs = obstacles[i];
          if (obs.destroyed) continue;
          const halfW = obs.w * 0.5 + clearance;
          const halfH = obs.h * 0.5 + clearance;
          if (Math.abs(cx - obs.x) < halfW && Math.abs(cy - obs.y) < halfH) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        return { x: cx, y: cy };
      }
    }

    return null;
  }

  /**
   * Executes instant validated spatial relocation while resetting procedural IK legs,
   * velocity, and facing orientation so legs never stretch or tear across the map.
   */
  public executeTeleportTo(dest: Vec2, faceTargetPos?: Vec2): BossTeleportExecuteEvent {
    const fromX = this.phys.pos.x;
    const fromY = this.phys.pos.y;
    this.phys.pos.x = dest.x;
    this.phys.pos.y = dest.y;
    this.phys.vel.x *= this.spec.teleport.personality === 'stormbringer_flank' ? 0.25 : 0.05;
    this.phys.vel.y *= this.spec.teleport.personality === 'stormbringer_flank' ? 0.25 : 0.05;
    this.phys.angularVel = 0;
    this.moveGoal = null;

    if (faceTargetPos) {
      const aimTo = Math.atan2(faceTargetPos.y - dest.y, faceTargetPos.x - dest.x);
      if (this.spec.teleport.personality === 'fortress_anchor' || this.spec.teleport.personality === 'stormbringer_flank') {
        this.phys.bodyAngle = aimTo;
      }
      this.turretAngle = aimTo;
    }

    // Critical IK sync: re-plant all 10-16 hydraulic legs around the new world position immediately
    this.legs.reset(this.spec.legs, this.phys.pos, this.phys.bodyAngle);
    this.teleportPhase = 'idle';
    this.teleportPendingDest = null;

    return {
      fromX,
      fromY,
      toX: dest.x,
      toY: dest.y,
      bodyAngle: this.phys.bodyAngle,
      radius: this.spec.radius,
      silhouette: this.spec.silhouette,
      warpColor: this.spec.teleport.warpColor,
    };
  }

  private simTime = 0;

  public applyTuningOverrides(overrides: BossTuningOverrides): void {
    const prevHullRatio = this.hull / Math.max(1, this.maxHull);
    const prevArmorRatio = this.armor / Math.max(1, this.maxArmor);
    const hpMult = overrides.healthMult ?? 1.0;
    this.maxHull = Math.round(this.spec.maxHull * hpMult);
    this.hull = Math.max(1, Math.round(this.maxHull * prevHullRatio));
    this.maxArmor = Math.round(this.spec.maxArmor * hpMult);
    this.armor = Math.round(this.maxArmor * prevArmorRatio);

    if (overrides.damageMult !== undefined) this.damageMult = overrides.damageMult;
    if (overrides.speedMult !== undefined) {
      this.speedMult = overrides.speedMult;
      this.physCfg.maxSpeed = this.spec.maxSpeed * this.speedMult;
      this.physCfg.acceleration = this.spec.acceleration * this.speedMult;
      this.physCfg.turnAccel = this.spec.turnAccel * Math.max(0.85, this.speedMult);
      this.physCfg.maxTurnSpeed = this.spec.maxTurnSpeed * Math.max(0.85, this.speedMult);
    }
    if (overrides.aggressionMult !== undefined) this.aggressionMult = overrides.aggressionMult;
    if (overrides.attackFreqMult !== undefined) this.attackFreqMult = overrides.attackFreqMult;
  }

  public notifyIncomingThreat(tx: number, ty: number): void {
    if (!this.alive || this.destroying) return;
    if (Math.hypot(tx - this.phys.pos.x, ty - this.phys.pos.y) < 340) {
      this.incomingThreatPos = { x: tx, y: ty };
      this.incomingDodgeTimer = this.spec.id === 'fortress' ? 0.9 : 1.7;
    }
  }

  /**
   * Evaluates live player mortar shells and missiles to dodge genuine impact / trajectory threats
   * intelligently across all 5 Thunderhead variants while enforcing fairness locks.
   */
  public evaluateIncomingProjectiles(
    threats: readonly BossIncomingProjectileThreat[],
    obstacles: readonly Obstacle[],
    mapW: number,
    mapH: number
  ): { triggered: boolean; dodgeDir: Vec2 | null; threatCount: number; emergencyWarp: boolean } {
    if (!this.alive || this.destroying || threats.length === 0) {
      return { triggered: false, dodgeDir: null, threatCount: 0, emergencyWarp: false };
    }
    if (this.activeEvadeTimer > 0) {
      return { triggered: false, dodgeDir: this.activeEvadeDir, threatCount: 0, emergencyWarp: false };
    }
    if (this.evadeCooldownTimer > 0 || this.evadeFatigueTimer > 0) {
      return { triggered: false, dodgeDir: null, threatCount: 0, emergencyWarp: false };
    }

    // Commitment fairness: never cancel active firing discharge or late warning execution
    const lockedCommitted =
      this.aiState === 'firing' ||
      (this.aiState === 'warning' && this.stateTimer < 0.45) ||
      (this.ultimateActive &&
        (this.spec.id === 'fortress' || this.spec.id === 'cataclysm') &&
        this.ultimateWaveIndex === 0);
    if (lockedCommitted) {
      return { triggered: false, dodgeDir: null, threatCount: 0, emergencyWarp: false };
    }

    interface ActiveDanger {
      dangerX: number;
      dangerY: number;
      originX: number;
      originY: number;
      vx: number;
      vy: number;
      safeDist: number;
      eta: number;
      kind: 'mortar' | 'missile';
      piercing: boolean;
      homing: boolean;
    }

    const activeDangers: ActiveDanger[] = [];
    const bx = this.phys.pos.x;
    const by = this.phys.pos.y;
    const r = this.spec.radius;

    for (let i = 0; i < threats.length; i++) {
      const t = threats[i];
      if (t.remainingFlightSec <= 0.16) continue; // Realistic human-scale reaction threshold

      if (t.kind === 'mortar' && t.targetX !== undefined && t.targetY !== undefined) {
        const distImpact = Math.hypot(t.targetX - bx, t.targetY - by);
        const safeDist = Math.max(70, t.splashRadius) + r * 0.92;
        if (distImpact <= safeDist + 16) {
          activeDangers.push({
            dangerX: t.targetX,
            dangerY: t.targetY,
            originX: t.x,
            originY: t.y,
            vx: t.targetX - t.x,
            vy: t.targetY - t.y,
            safeDist,
            eta: t.remainingFlightSec,
            kind: 'mortar',
            piercing: t.piercing,
            homing: false,
          });
        }
      } else if (t.kind === 'missile') {
        const spd = Math.hypot(t.vx, t.vy);
        if (spd < 20) continue;
        const dx = bx - t.x;
        const dy = by - t.y;
        const distNow = Math.hypot(dx, dy);
        const eta = distNow / spd;
        if (eta <= 0.14 || eta > 2.3) continue;

        const maxHorizon = Math.min(1.45, t.remainingFlightSec);
        const tCpa = Math.max(0, Math.min(maxHorizon, (dx * t.vx + dy * t.vy) / (spd * spd)));
        const px = t.x + t.vx * tCpa;
        const py = t.y + t.vy * tCpa;
        const missDist = Math.hypot(bx - px, by - py);
        const safeDist = r + Math.max(26, t.splashRadius) + (t.homing ? 48 : 14);
        if (missDist <= safeDist) {
          activeDangers.push({
            dangerX: px,
            dangerY: py,
            originX: t.x,
            originY: t.y,
            vx: t.vx,
            vy: t.vy,
            safeDist,
            eta,
            kind: 'missile',
            piercing: t.piercing,
            homing: t.homing,
          });
        }
      }
    }

    if (activeDangers.length === 0) {
      return { triggered: false, dodgeDir: null, threatCount: 0, emergencyWarp: false };
    }

    // Score 12 radial escape directions away from all concurrent incoming threats & obstacles
    const probeDist =
      this.spec.id === 'stormbringer'
        ? 215
        : this.spec.id === 'blackout'
        ? 195
        : this.spec.id === 'fortress'
        ? 145
        : 175;
    const margin = r + 76;
    let bestDir: Vec2 | null = null;
    let bestScore = -1e9;

    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);

      let blocked = false;
      for (const frac of [0.5, 1.0]) {
        const px = bx + dx * probeDist * frac;
        const py = by + dy * probeDist * frac;
        if (px < margin || px > mapW - margin || py < margin || py > mapH - margin) {
          blocked = true;
          break;
        }
        for (let oi = 0; oi < obstacles.length; oi++) {
          const obs = obstacles[oi];
          if (obs.destroyed) continue;
          if (Math.abs(px - obs.x) < obs.w * 0.5 + r + 14 && Math.abs(py - obs.y) < obs.h * 0.5 + r + 14) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      if (blocked) continue;

      const candX = bx + dx * probeDist;
      const candY = by + dy * probeDist;
      let score = 0;

      for (let ti = 0; ti < activeDangers.length; ti++) {
        const dng = activeDangers[ti];
        const urgency = 1 / Math.max(0.25, dng.eta);
        const distFromDanger = Math.hypot(candX - dng.dangerX, candY - dng.dangerY);
        if (distFromDanger > dng.safeDist) {
          score += 240 * urgency + (distFromDanger - dng.safeDist) * 0.45;
        } else {
          score -= (dng.safeDist - distFromDanger) * 2.2 * urgency;
        }

        // Perpendicular evasion breaks homing missile tracking & clears linear trajectory
        const vLen = Math.hypot(dng.vx, dng.vy) || 1;
        const projAlign = Math.abs(dx * (dng.vx / vLen) + dy * (dng.vy / vLen));
        score += (1 - projAlign) * (dng.kind === 'missile' ? 190 : 95) * urgency;
      }

      // Variant-specific tactical personality bonuses
      const primaryDng = activeDangers[0];
      const toOriginX = primaryDng.originX - bx;
      const toOriginY = primaryDng.originY - by;
      const toOriginLen = Math.hypot(toOriginX, toOriginY) || 1;
      const towardOriginDot = dx * (toOriginX / toOriginLen) + dy * (toOriginY / toOriginLen);

      if (this.spec.id === 'stormbringer') {
        // Stormbringer turns evasion into an aggressive flanking burst
        score += (1 - Math.abs(towardOriginDot - 0.35)) * 110;
      } else if (this.spec.id === 'blackout') {
        // Blackout slips at stealthy oblique angles
        score += (1 - Math.abs(towardOriginDot + 0.25)) * 115;
      } else if (this.spec.id === 'fortress') {
        // Fortress angles heavy frontal armor toward threat while stepping off bullseye
        score += towardOriginDot * 65;
      } else {
        // Siege & Cataclysm favor crisp lateral sidestep to preserve artillery firing line
        score += (1 - Math.abs(towardOriginDot)) * 120;
      }

      if (score > bestScore) {
        bestScore = score;
        bestDir = { x: dx, y: dy };
      }
    }

    if (!bestDir) return { triggered: false, dodgeDir: null, threatCount: activeDangers.length, emergencyWarp: false };

    let sumX = 0;
    let sumY = 0;
    let hasCriticalAPOrSalvo = activeDangers.length >= 2;
    for (let ti = 0; ti < activeDangers.length; ti++) {
      sumX += activeDangers[ti].dangerX;
      sumY += activeDangers[ti].dangerY;
      if (activeDangers[ti].piercing || activeDangers[ti].kind === 'mortar') {
        hasCriticalAPOrSalvo = true;
      }
    }
    this.incomingThreatPos = {
      x: sumX / activeDangers.length,
      y: sumY / activeDangers.length,
    };

    const dodgeDur =
      this.spec.id === 'stormbringer'
        ? 1.15
        : this.spec.id === 'blackout'
        ? 1.05
        : this.spec.id === 'fortress'
        ? 0.92
        : 1.1;
    const impulse =
      this.spec.id === 'stormbringer'
        ? 215
        : this.spec.id === 'blackout'
        ? 185
        : this.spec.id === 'siege'
        ? 145
        : this.spec.id === 'cataclysm'
        ? 135
        : 120;

    this.activeEvadeDir = bestDir;
    this.activeEvadeTimer = dodgeDur;
    this.incomingDodgeTimer = Math.max(this.incomingDodgeTimer, dodgeDur);
    this.evadeCooldownTimer =
      this.spec.id === 'stormbringer'
        ? 2.25
        : this.spec.id === 'blackout'
        ? 2.4
        : this.spec.id === 'fortress'
        ? 3.1
        : 2.75;

    // Release anchoring stance cleanly so heavy artillery bosses actually step out of danger
    if (this.aiState === 'bracing' || (this.aiState === 'loading' && activeDangers.some((d) => d.eta < 0.95))) {
      this.aiState = 'repositioning';
      this.repositionTimer = Math.max(1.2, dodgeDur);
      this.moveGoal = null;
      this.hatchOpenAmount = 0.1;
    }

    this.phys.vel.x += bestDir.x * impulse;
    this.phys.vel.y += bestDir.y * impulse;

    // Fatigue fairness tracking
    this.consecutiveEvadeCount++;
    this.evadeResetWindow = 6.2;
    const maxChain = this.spec.id === 'stormbringer' ? 4 : 3;
    if (this.consecutiveEvadeCount >= maxChain) {
      this.evadeFatigueTimer = 2.4;
      this.consecutiveEvadeCount = 0;
    }

    // Fortress / Blackout / Stormbringer defensive micro-teleport when critical mortar/AP lock threatens center mass
    let emergencyWarp = false;
    if (
      hasCriticalAPOrSalvo &&
      this.teleportPhase === 'idle' &&
      this.teleportCooldown <= 1.2 &&
      this.emergencyWarpCooldown <= 0 &&
      (this.spec.id === 'fortress' || this.spec.id === 'blackout' || this.spec.id === 'stormbringer')
    ) {
      this.teleportCooldown = 0;
      this.emergencyWarpCooldown = 8.5;
      emergencyWarp = true;
    }

    return {
      triggered: true,
      dodgeDir: bestDir,
      threatCount: activeDangers.length,
      emergencyWarp,
    };
  }

  public triggerUltimate(targetPos: Vec2, force = false): boolean {
    if (!this.alive || this.destroying) return false;
    if (this.ultimateActive && !force) return false;
    this.ultimateActive = true;
    this.ultimateTimer = this.spec.id === 'stormbringer' ? 4.8 : 4.2;
    this.ultimateWaveIndex = 0;
    this.ultimateWaveCooldown = 0.55;
    this.ultimateCooldown = this.spec.id === 'stormbringer' ? 18 : 22;
    this.ultimateTarget = { x: targetPos.x, y: targetPos.y };
    this.pendingUltimateStart = true;
    return true;
  }

  public update(
    dt: number,
    playerPos: Vec2,
    alliesPos: Vec2[],
    defendPos: Vec2 | null,
    terrain: TerrainType,
    obstacles: Obstacle[],
    mapW: number,
    mapH: number
  ): BossUpdateActions {
    const actions: BossUpdateActions = { footsteps: [] };
    this.simTime += dt;

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }
    if (this.empScrambleTimer > 0) {
      this.empScrambleTimer = Math.max(0, this.empScrambleTimer - dt);
    }
    if (this.incomingDodgeTimer > 0) {
      this.incomingDodgeTimer = Math.max(0, this.incomingDodgeTimer - dt);
    }
    if (this.activeEvadeTimer > 0) {
      this.activeEvadeTimer = Math.max(0, this.activeEvadeTimer - dt);
      if (this.activeEvadeTimer <= 0) this.activeEvadeDir = null;
    }
    if (this.evadeCooldownTimer > 0) {
      this.evadeCooldownTimer = Math.max(0, this.evadeCooldownTimer - dt);
    }
    if (this.evadeFatigueTimer > 0) {
      this.evadeFatigueTimer = Math.max(0, this.evadeFatigueTimer - dt);
    }
    if (this.emergencyWarpCooldown > 0) {
      this.emergencyWarpCooldown = Math.max(0, this.emergencyWarpCooldown - dt);
    }
    if (this.evadeResetWindow > 0) {
      this.evadeResetWindow = Math.max(0, this.evadeResetWindow - dt);
      if (this.evadeResetWindow <= 0) this.consecutiveEvadeCount = 0;
    }
    if (this.auxExposedTimer > 0) {
      this.auxExposedTimer = Math.max(0, this.auxExposedTimer - dt);
    }
    if (this.recentRearHitDecay > 0) {
      this.recentRearHitDecay = Math.max(0, this.recentRearHitDecay - dt);
      if (this.recentRearHitDecay <= 0) this.recentRearCoreHits = 0;
    }
    if (this.teleportCooldown > 0 && this.teleportPhase === 'idle') {
      this.teleportCooldown = Math.max(0, this.teleportCooldown - dt * (0.9 + this.aggressionMult * 0.2));
    }

    const sensorAlive = !this.components.sensors.destroyed;
    if (sensorAlive) {
      this.radarAngle = normalizeAngle(this.radarAngle + dt * (this.phase >= 3 ? 3.0 : 1.65));
    }

    // Handle multi-stage ~2.8s final collapse sequence
    if (this.destroying) {
      this.destroyTimer += dt;
      this.cookOffTimer -= dt;
      this.phys.vel.x *= Math.exp(-3 * dt);
      this.phys.vel.y *= Math.exp(-3 * dt);
      this.hatchOpenAmount = Math.max(0, this.hatchOpenAmount - dt * 1.2);
      this.chargeGlow = 0;
      this.posture = 'critical_damage';
      if (this.cookOffTimer <= 0 && this.destroyTimer < this.destroyDuration - 0.3) {
        this.cookOffTimer = 0.35 + Math.random() * 0.18;
        actions.cookOffExplosion = {
          x: this.phys.pos.x + (Math.random() - 0.5) * this.spec.radius * 1.4,
          y: this.phys.pos.y + (Math.random() - 0.5) * this.spec.radius * 1.4,
          radius: 75 + Math.random() * 45,
        };
      }
      if (this.destroyTimer >= this.destroyDuration) {
        this.alive = false;
        this.destroying = false;
        actions.finalDetonation = {
          x: this.phys.pos.x,
          y: this.phys.pos.y,
          radius: this.spec.radius * 3.8,
        };
      }

      const steps = this.legs.update(
        dt,
        this.phys,
        {
          strideLength: this.spec.strideLength,
          stepHeight: this.spec.stepHeight,
          stepSpeed: this.spec.stepSpeed * 0.5,
          footstepWeight: this.spec.footstepWeight,
          posture: 'critical_damage',
          leftLegRatio: this.components.leftLegs.hp / Math.max(1, this.components.leftLegs.maxHp),
          rightLegRatio: this.components.rightLegs.hp / Math.max(1, this.components.rightLegs.maxHp),
          destroying: true,
          destroyProgress: this.destroyTimer / this.destroyDuration,
        },
        obstacles
      );
      actions.footsteps.push(...steps);
      return actions;
    }

    const prevPhase = this.phase;
    this.phase = this.getPhaseFromHull();
    if (this.phase !== prevPhase) {
      actions.phaseChangedTo = this.phase;
    }

    const targetCandidates: Vec2[] = [playerPos, ...alliesPos];
    const primaryTarget =
      defendPos && Math.random() < 0.32 && this.aiState === 'acquiring'
        ? defendPos
        : targetCandidates[0];
    const distToPlayer = Math.hypot(playerPos.x - this.phys.pos.x, playerPos.y - this.phys.pos.y);

    // Component health ratios driving degraded behavior
    const leftRatio = this.components.leftLegs.hp / Math.max(1, this.components.leftLegs.maxHp);
    const rightRatio = this.components.rightLegs.hp / Math.max(1, this.components.rightLegs.maxHp);
    const legRatio = (leftRatio + rightRatio) * 0.5;
    const mortarBroken = this.components.mortar.destroyed;
    const ammoBroken = this.components.ammoBays.destroyed;
    const sensorBroken = this.components.sensors.destroyed;
    const auxBroken = this.components.auxWeapons.destroyed;
    const coreBroken = this.components.powerCore.destroyed;

    const syntheticHealth: ComponentHealth = {
      chassis: this.hull,
      maxChassis: this.maxHull,
      armor: this.armor,
      maxArmor: this.maxArmor,
      engine: coreBroken ? 45 : 100,
      maxEngine: 100,
      sensors: sensorBroken ? 25 : 100,
      maxSensors: 100,
      weapons: mortarBroken ? 30 : 100,
      maxWeapons: 100,
      leftLegs: this.components.leftLegs.hp,
      maxLeftLegs: this.components.leftLegs.maxHp,
      rightLegs: this.components.rightLegs.hp,
      maxRightLegs: this.components.rightLegs.maxHp,
    };

    const empPenalty = this.empScrambleTimer > 0 ? 1.45 : 1.0;
    const phaseCadence =
      (this.phase === 1 ? 1.0 : this.phase === 2 ? 1.24 : this.phase === 3 ? 1.42 : 1.65) *
      this.attackFreqMult;
    const reloadPenalty = (ammoBroken ? 1.45 : 1.0) * (coreBroken ? 1.22 : 1.0) * empPenalty;
    const sensorAcquirePenalty = (sensorBroken ? 1.45 : 1.0) * empPenalty;

    let wishX = 0;
    let wishY = 0;
    let sprint = false;
    let bracing = false;
    let anchored = false;

    // Spatial Teleportation Telegraph & Execution (all 5 variants with distinct triggers)
    const teleportAllowedState =
      this.aiState !== 'bracing' &&
      this.aiState !== 'warning' &&
      this.aiState !== 'firing' &&
      !this.destroying;

    if (this.teleportPhase === 'telegraphing') {
      this.teleportTelegraphTimer -= dt;
      wishX *= 0.15;
      wishY *= 0.15;
      if (this.teleportTelegraphTimer <= 0) {
        const dest =
          this.teleportPendingDest ??
          this.findValidTeleportDestination(playerPos, alliesPos, obstacles, mapW, mapH);
        if (dest) {
          actions.teleportExecute = this.executeTeleportTo(dest, playerPos);
          if (this.teleportBurstRemaining > 0) {
            this.teleportBurstRemaining--;
            this.teleportCooldown = 1.65; // Quick Stormbringer chain blink
          } else {
            this.teleportCooldown = Math.max(4.5, this.spec.teleport.cooldown / Math.max(0.8, this.aggressionMult));
          }
        } else {
          this.teleportPhase = 'idle';
          this.teleportPendingDest = null;
          this.teleportCooldown = 3.0;
        }
      }
    } else if (teleportAllowedState && this.teleportCooldown <= 0) {
      const tp = this.spec.teleport;
      const flankedRear =
        tp.personality === 'fortress_anchor' &&
        (this.recentRearCoreHits >= 85 || distToPlayer < 260);
      const evadeOrPursue =
        this.incomingDodgeTimer > 0 ||
        distToPlayer > tp.maxDist * 1.45 ||
        distToPlayer < tp.minDist * 0.72 ||
        this.aiState === 'repositioning' ||
        this.phase >= 2;

      const shouldTrigger =
        tp.personality === 'fortress_anchor'
          ? flankedRear || this.aiState === 'reloading'
          : tp.personality === 'stormbringer_flank'
          ? evadeOrPursue || this.ultimateActive
          : evadeOrPursue;

      if (shouldTrigger) {
        const dest = this.findValidTeleportDestination(playerPos, alliesPos, obstacles, mapW, mapH);
        if (dest) {
          this.teleportPhase = 'telegraphing';
          this.teleportTelegraphTotal = tp.telegraphSec;
          this.teleportTelegraphTimer = tp.telegraphSec;
          this.teleportPendingDest = dest;
          if (tp.burstMaxCount > 1 && this.teleportBurstRemaining <= 0 && this.phase >= 2) {
            this.teleportBurstRemaining = tp.burstMaxCount - 1;
          }
          actions.teleportStart = {
            x: this.phys.pos.x,
            y: this.phys.pos.y,
            destX: dest.x,
            destY: dest.y,
            warpColor: tp.warpColor,
            personality: tp.personality,
          };
        } else {
          this.teleportCooldown = 2.5;
        }
      }
    }

    // Auto-trigger Ultimate in Phase 2+ when cooldown finishes
    if (!this.ultimateActive && !mortarBroken && this.phase >= 2) {
      this.ultimateCooldown -= dt * (0.8 + this.aggressionMult * 0.35) * (this.phase >= 3 ? 1.25 : 1.0);
      if (this.ultimateCooldown <= 0) {
        this.triggerUltimate(primaryTarget);
      }
    }

    if (this.pendingUltimateStart) {
      this.pendingUltimateStart = false;
      actions.startUltimate = {
        variantId: this.spec.id,
        ultimateId: this.spec.ultimateId,
        ultimateName: this.spec.ultimateName,
        targetPos: { x: this.ultimateTarget.x, y: this.ultimateTarget.y },
      };
    }

    // Active Ultimate Sequence
    if (this.ultimateActive) {
      this.ultimateTimer -= dt;
      this.ultimateWaveCooldown -= dt;
      this.hatchOpenAmount = Math.min(1, this.hatchOpenAmount + dt * 2.6);
      this.chargeGlow = Math.min(1, this.chargeGlow + dt * 2.2);

      const aimU = Math.atan2(playerPos.y - this.phys.pos.y, playerPos.x - this.phys.pos.x);
      const diffU = shortestAngleDiff(this.turretAngle, aimU);
      this.turretAngle = normalizeAngle(this.turretAngle + Math.max(-1.6 * dt, Math.min(1.6 * dt, diffU)));
      this.barrelPitch += (0.94 - this.barrelPitch) * Math.min(1, dt * 3.5);

      const mDist = this.spec.radius * 0.72;
      const sx = this.phys.pos.x + Math.cos(this.turretAngle) * mDist;
      const sy = this.phys.pos.y + Math.sin(this.turretAngle) * mDist;

      if (this.spec.id === 'stormbringer') {
        // TH-03 HELLFIRE PURSUIT: High-speed sprint chase + leading mortar carpet + rapid guns
        sprint = true;
        wishX = Math.cos(aimU);
        wishY = Math.sin(aimU);
        if (this.ultimateWaveCooldown <= 0 && this.ultimateWaveIndex < 3) {
          this.ultimateWaveIndex++;
          this.ultimateWaveCooldown = 0.85;
          const leadX = Math.max(140, Math.min(mapW - 140, playerPos.x + Math.cos(aimU) * 140));
          const leadY = Math.max(140, Math.min(mapH - 140, playerPos.y + Math.sin(aimU) * 140));
          actions.startWarning = {
            x: leadX,
            y: leadY,
            radius: this.spec.mortarSplashRadius * 0.9,
            duration: 1.35,
            warheadType: 'cluster',
          };
          actions.fireMortarShells = [
            {
              startX: sx,
              startY: sy,
              targetX: leadX,
              targetY: leadY,
              damage: this.spec.mortarDamage * 0.88 * this.damageMult,
              splashRadius: this.spec.mortarSplashRadius * 0.9,
              warheadType: 'cluster',
              delayedSecondary: false,
            },
          ];
        }
      } else if (this.spec.id === 'blackout') {
        // TH-05 SILENT APOCALYPSE: Wide EMP shockwave + decoys + high-speed flank + EMP shells
        sprint = true;
        const flankAng = aimU + Math.PI * 0.42;
        wishX = Math.cos(flankAng);
        wishY = Math.sin(flankAng);
        if (this.ultimateWaveCooldown <= 0 && this.ultimateWaveIndex < 2) {
          this.ultimateWaveIndex++;
          this.ultimateWaveCooldown = 1.25;
          if (this.ultimateWaveIndex === 1) {
            actions.empPulse = { x: this.phys.pos.x, y: this.phys.pos.y, radius: 740 };
            actions.spawnDeployable = {
              kind: 'decoy',
              x: Math.max(140, Math.min(mapW - 140, this.phys.pos.x + Math.cos(flankAng) * 165)),
              y: Math.max(140, Math.min(mapH - 140, this.phys.pos.y + Math.sin(flankAng) * 165)),
            };
          }
          const tx = Math.max(140, Math.min(mapW - 140, playerPos.x + (Math.random() - 0.5) * 160));
          const ty = Math.max(140, Math.min(mapH - 140, playerPos.y + (Math.random() - 0.5) * 160));
          actions.startWarning = {
            x: tx,
            y: ty,
            radius: this.spec.mortarSplashRadius * 1.05,
            duration: 1.5,
            warheadType: 'emp',
          };
          actions.fireMortarShells = [
            {
              startX: sx,
              startY: sy,
              targetX: tx,
              targetY: ty,
              damage: this.spec.mortarDamage * 0.92 * this.damageMult,
              splashRadius: this.spec.mortarSplashRadius * 1.05,
              warheadType: 'emp',
              delayedSecondary: false,
            },
          ];
        }
      } else if (this.spec.id === 'fortress') {
        // TH-04 IRON JUDGMENT: Glacis lock + turret drop + bunker-buster ring
        bracing = true;
        anchored = true;
        if (this.ultimateWaveCooldown <= 0 && this.ultimateWaveIndex < 2) {
          this.ultimateWaveIndex++;
          this.ultimateWaveCooldown = 1.3;
          if (this.ultimateWaveIndex === 1) {
            actions.spawnDeployable = {
              kind: 'turret',
              x: Math.max(140, Math.min(mapW - 140, this.phys.pos.x + Math.cos(aimU + 0.8) * (this.spec.radius + 95))),
              y: Math.max(140, Math.min(mapH - 140, this.phys.pos.y + Math.sin(aimU + 0.8) * (this.spec.radius + 95))),
            };
          }
          const shells = [0, 1].map((k) => {
            const ang = k === 0 ? 0 : aimU + 0.7;
            const r = k === 0 ? 35 : 190;
            return {
              startX: sx,
              startY: sy,
              targetX: Math.max(140, Math.min(mapW - 140, playerPos.x + Math.cos(ang) * r)),
              targetY: Math.max(140, Math.min(mapH - 140, playerPos.y + Math.sin(ang) * r)),
              damage: this.spec.mortarDamage * 0.9 * this.damageMult,
              splashRadius: this.spec.mortarSplashRadius,
              warheadType: 'bunker_buster' as BossWarheadType,
              delayedSecondary: false,
            };
          });
          actions.fireMortarShells = shells;
          actions.startWarning = {
            x: shells[0].targetX,
            y: shells[0].targetY,
            radius: this.spec.mortarSplashRadius,
            duration: 1.5,
            warheadType: 'bunker_buster',
          };
        }
      } else if (this.spec.id === 'cataclysm') {
        // TH-02 EXTINCTION SALVO: 5-shell strategic + thermoblast ring saturation
        bracing = this.ultimateWaveIndex === 0;
        anchored = this.ultimateWaveIndex === 0;
        if (this.ultimateWaveCooldown <= 0 && this.ultimateWaveIndex < 2) {
          this.ultimateWaveIndex++;
          this.ultimateWaveCooldown = 1.4;
          const count = this.ultimateWaveIndex === 1 ? 3 : 2;
          const shells = Array.from({ length: count }, (_, idx) => {
            const ang = (idx / Math.max(1, count)) * Math.PI * 2 + this.ultimateWaveIndex * 0.5;
            const rad = idx === 0 && this.ultimateWaveIndex === 1 ? 30 : 215;
            return {
              startX: sx,
              startY: sy,
              targetX: Math.max(140, Math.min(mapW - 140, playerPos.x + Math.cos(ang) * rad)),
              targetY: Math.max(140, Math.min(mapH - 140, playerPos.y + Math.sin(ang) * rad)),
              damage: this.spec.mortarDamage * 0.85 * this.damageMult,
              splashRadius: this.spec.mortarSplashRadius * 0.95,
              warheadType: (idx % 2 === 0 ? 'strategic' : 'thermoblast') as BossWarheadType,
              delayedSecondary: true,
            };
          });
          actions.fireMortarShells = shells;
          actions.startWarning = {
            x: shells[0].targetX,
            y: shells[0].targetY,
            radius: this.spec.mortarSplashRadius,
            duration: 1.55,
            warheadType: 'thermoblast',
          };
          applyRecoilImpulse(this.phys, this.turretAngle, 460, this.spec.mass, {
            recoilTorque: 0.25,
            barrelOffsetY: 0,
            stabilityCost: 0.45,
            legAvgRatio: Math.max(0.3, legRatio),
            visualScale: 1.6,
          });
        }
      } else {
        // TH-01 DEADFALL PROTOCOL: Rolling 4-shell corridor while advancing
        wishX = Math.cos(aimU) * 0.72;
        wishY = Math.sin(aimU) * 0.72;
        if (this.ultimateWaveCooldown <= 0 && this.ultimateWaveIndex < 4) {
          const stepIdx = this.ultimateWaveIndex;
          this.ultimateWaveIndex++;
          this.ultimateWaveCooldown = 0.65;
          const offset = (stepIdx - 1.5) * 145;
          const tx = Math.max(140, Math.min(mapW - 140, playerPos.x + Math.cos(aimU) * offset));
          const ty = Math.max(140, Math.min(mapH - 140, playerPos.y + Math.sin(aimU) * offset));
          actions.startWarning = {
            x: tx,
            y: ty,
            radius: this.spec.mortarSplashRadius * 0.88,
            duration: 1.35,
            warheadType: stepIdx % 2 === 0 ? 'strategic' : 'thermoblast',
          };
          actions.fireMortarShells = [
            {
              startX: sx,
              startY: sy,
              targetX: tx,
              targetY: ty,
              damage: this.spec.mortarDamage * 0.82 * this.damageMult,
              splashRadius: this.spec.mortarSplashRadius * 0.88,
              warheadType: stepIdx % 2 === 0 ? 'strategic' : 'thermoblast',
              delayedSecondary: false,
            },
          ];
        }
      }

      if (this.ultimateTimer <= 0) {
        this.ultimateActive = false;
        this.aiState = 'repositioning';
        this.repositionTimer = 2.6;
        this.moveGoal = null;
      }
    } else {
      this.hatchOpenAmount = Math.max(0, this.hatchOpenAmount - dt * 1.4);
      this.chargeGlow = Math.max(0, this.chargeGlow - dt * 1.6);
      this.stateTimer -= dt;

      if (mortarBroken) {
        // Main mortar destroyed: high-speed aggressive pursuit & close-range aux brawl!
        this.aiState = 'repositioning';
        const angTo = Math.atan2(playerPos.y - this.phys.pos.y, playerPos.x - this.phys.pos.x);
        if (distToPlayer > 340) {
          wishX = Math.cos(angTo);
          wishY = Math.sin(angTo);
          sprint = distToPlayer > 560;
        } else if (distToPlayer < 220) {
          wishX = -Math.cos(angTo);
          wishY = -Math.sin(angTo);
        }
        this.turretAngle = normalizeAngle(
          this.turretAngle + Math.max(-0.9 * dt, Math.min(0.9 * dt, shortestAngleDiff(this.turretAngle, angTo)))
        );
        this.barrelPitch += (0.05 - this.barrelPitch) * Math.min(1, dt * 2.5);
      } else {
        switch (this.aiState) {
          case 'repositioning': {
            this.repositionTimer -= dt;
            if (this.activeEvadeTimer > 0 && this.activeEvadeDir) {
              wishX = this.activeEvadeDir.x;
              wishY = this.activeEvadeDir.y;
              sprint = true;
            } else if (this.incomingDodgeTimer > 0 && this.incomingThreatPos) {
              // Rapid lateral evade out of incoming mortar shell zone
              const dodgeAng = Math.atan2(
                this.phys.pos.y - this.incomingThreatPos.y,
                this.phys.pos.x - this.incomingThreatPos.x
              );
              wishX = Math.cos(dodgeAng);
              wishY = Math.sin(dodgeAng);
              sprint = true;
            } else {
              if (!this.moveGoal) {
                const angTo = Math.atan2(playerPos.y - this.phys.pos.y, playerPos.x - this.phys.pos.x);
                const idealDist =
                  (this.spec.preferredRangeMin + this.spec.preferredRangeMax) * (this.spec.id === 'stormbringer' ? 0.42 : 0.48);
                const flankOffset = (Math.random() > 0.5 ? 1 : -1) * (this.spec.id === 'stormbringer' ? 0.55 : 0.82);
                const angGoal = angTo + Math.PI + flankOffset;
                this.moveGoal = {
                  x: Math.max(220, Math.min(mapW - 220, playerPos.x + Math.cos(angGoal) * idealDist)),
                  y: Math.max(220, Math.min(mapH - 220, playerPos.y + Math.sin(angGoal) * idealDist)),
                };
              }
              const gx = this.moveGoal.x - this.phys.pos.x;
              const gy = this.moveGoal.y - this.phys.pos.y;
              const gd = Math.hypot(gx, gy);
              if (gd > 55 && this.repositionTimer > 0) {
                wishX = gx / gd;
                wishY = gy / gd;
                sprint = true; // High-speed aggressive repositioning & pursuit
              } else {
                this.moveGoal = null;
                this.aiState = 'acquiring';
                this.stateTimer = 0.42 * sensorAcquirePenalty;
              }
            }
            this.barrelPitch += (0.28 - this.barrelPitch) * Math.min(1, dt * 3.8);
            break;
          }

          case 'acquiring': {
            // High-speed aggressive pursuit & lateral flanking while acquiring target
            const angToP = Math.atan2(playerPos.y - this.phys.pos.y, playerPos.x - this.phys.pos.x);
            if (this.activeEvadeTimer > 0 && this.activeEvadeDir) {
              wishX = this.activeEvadeDir.x;
              wishY = this.activeEvadeDir.y;
              sprint = true;
            } else if (this.incomingDodgeTimer > 0 && this.incomingThreatPos && this.spec.id !== 'fortress') {
              const dodgeAng = Math.atan2(
                this.phys.pos.y - this.incomingThreatPos.y,
                this.phys.pos.x - this.incomingThreatPos.x
              );
              wishX = Math.cos(dodgeAng);
              wishY = Math.sin(dodgeAng);
              sprint = true;
            } else if (distToPlayer < this.spec.preferredRangeMin * 0.72) {
              const evadeA = angToP + Math.PI * 0.72 * (this.phase % 2 === 0 ? 1 : -1);
              wishX = Math.cos(evadeA);
              wishY = Math.sin(evadeA);
              sprint = true;
            } else if (distToPlayer > this.spec.preferredRangeMax * 0.85) {
              wishX = Math.cos(angToP);
              wishY = Math.sin(angToP);
              sprint = true;
            } else {
              // Continuous high-speed lateral strafe so boss never sits stationary
              const strafeA = angToP + Math.PI * 0.46 * (Math.floor(this.simTime * 0.35) % 2 === 0 ? 1 : -1);
              wishX = Math.cos(strafeA) * 0.92;
              wishY = Math.sin(strafeA) * 0.92;
              sprint = this.phase >= 2 || this.spec.id === 'stormbringer' || this.spec.id === 'blackout';
            }

            const tgt = primaryTarget;
            const desiredTurret = Math.atan2(tgt.y - this.phys.pos.y, tgt.x - this.phys.pos.x);
            const diff = shortestAngleDiff(this.turretAngle, desiredTurret);
            const turnRate = (sensorBroken ? 1.05 : 2.15) * dt;
            this.turretAngle = normalizeAngle(
              this.turretAngle + Math.max(-turnRate, Math.min(turnRate, diff))
            );
            this.barrelPitch += (0.68 - this.barrelPitch) * Math.min(1, dt * 3.2);

            if (this.stateTimer <= 0 && Math.abs(diff) < 0.32) {
              this.aiState = 'bracing';
              this.stateTimer = 0.42 / Math.max(0.85, this.attackFreqMult);
              const pool = this.spec.warheadRotation;
              const idx = this.warheadIndex % pool.length;
              this.warheadIndex++;
              this.activeWarhead =
                this.phase === 1 && this.spec.id === 'siege' ? 'strategic' : pool[idx];
            }
            break;
          }

          case 'bracing': {
            bracing = true;
            anchored = true;
            this.barrelPitch += (0.9 - this.barrelPitch) * Math.min(1, dt * 2.8);
            if (this.stateTimer <= 0) {
              this.aiState = 'loading';
              this.loaderProgress = 0;
              this.stateTimer = (this.spec.mortarLoadTime * reloadPenalty) / phaseCadence;
            }
            break;
          }

          case 'loading': {
            bracing = true;
            anchored = true;
            this.hatchOpenAmount = Math.min(0.65, this.hatchOpenAmount + dt * 1.1);
            const loadDur = (this.spec.mortarLoadTime * reloadPenalty) / phaseCadence;
            this.loaderProgress = Math.min(1, 1 - this.stateTimer / Math.max(0.1, loadDur));
            if (this.stateTimer <= 0) {
              this.loaderProgress = 1;
              this.aiState = 'warning';
              const warnDur = Math.max(1.35, this.spec.mortarWarningTime / (this.phase === 4 ? 1.15 : 1));
              this.stateTimer = warnDur;

              const scatter =
                this.spec.mortarScatter *
                (sensorBroken ? 2.1 : 1.0) *
                (this.empScrambleTimer > 0 ? 1.85 : 1.0);
              const salvoSize = ammoBroken
                ? 1
                : this.spec.mortarSalvoCount + (this.phase >= 4 && this.spec.id === 'cataclysm' ? 1 : 0);

              this.plannedSalvoTargets = [];
              for (let s = 0; s < salvoSize; s++) {
                const ang = s === 0 ? Math.random() * Math.PI * 2 : s * 2.4 + Math.random() * 0.9;
                const rad =
                  s === 0
                    ? Math.random() * scatter * 0.45
                    : Math.max(145, (0.85 + Math.random() * 0.65) * scatter);
                const tx = Math.max(140, Math.min(mapW - 140, primaryTarget.x + Math.cos(ang) * rad));
                const ty = Math.max(140, Math.min(mapH - 140, primaryTarget.y + Math.sin(ang) * rad));
                this.plannedSalvoTargets.push({ x: tx, y: ty });
              }
              this.pendingTarget = this.plannedSalvoTargets[0];
              actions.startWarning = {
                x: this.pendingTarget.x,
                y: this.pendingTarget.y,
                radius: this.spec.mortarSplashRadius,
                duration: warnDur,
                warheadType: this.activeWarhead,
              };
              if (this.plannedSalvoTargets.length > 1) {
                actions.extraWarnings = this.plannedSalvoTargets.slice(1).map((pt) => ({
                  x: pt.x,
                  y: pt.y,
                  radius: this.spec.mortarSplashRadius,
                  duration: warnDur,
                  warheadType: this.activeWarhead,
                }));
              }
            }
            break;
          }

          case 'warning': {
            bracing = true;
            anchored = true;
            this.chargeGlow = Math.min(0.85, this.chargeGlow + dt * 1.5);
            this.barrelPitch = 0.96;
            if (this.stateTimer <= 0) {
              this.aiState = 'firing';
              this.stateTimer = 0.36;

              const muzzleDist = this.spec.radius * 0.72;
              const sx = this.phys.pos.x + Math.cos(this.turretAngle) * muzzleDist;
              const sy = this.phys.pos.y + Math.sin(this.turretAngle) * muzzleDist;

              actions.fireMortarShells = this.plannedSalvoTargets.map((pt) => ({
                startX: sx,
                startY: sy,
                targetX: pt.x,
                targetY: pt.y,
                damage:
                  this.spec.mortarDamage * (this.phase >= 4 ? 1.15 : 1.0) * this.damageMult,
                splashRadius: this.spec.mortarSplashRadius,
                warheadType: this.activeWarhead,
                delayedSecondary: this.spec.delayedSecondaryDetonation,
              }));

              applyRecoilImpulse(this.phys, this.turretAngle, 420, this.spec.mass, {
                recoilTorque: 0.25,
                barrelOffsetY: 0,
                stabilityCost: 0.45,
                legAvgRatio: Math.max(0.25, legRatio),
                visualScale: 1.5,
              });
            }
            break;
          }

          case 'firing': {
            anchored = true;
            this.loaderProgress = 0;
            if (this.stateTimer <= 0) {
              this.aiState = 'reloading';
              this.stateTimer = (this.spec.mortarReloadTime * reloadPenalty) / phaseCadence;
            }
            break;
          }

          case 'reloading': {
            if (this.activeEvadeTimer > 0 && this.activeEvadeDir) {
              wishX = this.activeEvadeDir.x;
              wishY = this.activeEvadeDir.y;
              sprint = true;
            } else {
              // Move laterally while reloading so fast Thunderhead bosses stay dynamic!
              const strafeAng =
                Math.atan2(playerPos.y - this.phys.pos.y, playerPos.x - this.phys.pos.x) +
                (this.spec.id === 'stormbringer' ? 0.55 : 1.15);
              wishX = Math.cos(strafeAng) * 0.68;
              wishY = Math.sin(strafeAng) * 0.68;
            }
            this.barrelPitch += (0.35 - this.barrelPitch) * Math.min(1, dt * 1.8);
            if (this.stateTimer <= 0) {
              if (this.spec.repositionAfterSalvo || distToPlayer < 460 || this.aggressionMult >= 1.1) {
                this.aiState = 'repositioning';
                this.repositionTimer = 2.4;
                this.moveGoal = null;
              } else {
                this.aiState = 'acquiring';
                this.stateTimer = 0.65 * sensorAcquirePenalty;
              }
            }
            break;
          }
        }
      }
    }

    // Auxiliary close-defense weapons when player/allies get inside range
    if (!auxBroken) {
      this.auxCooldown -= dt * (this.phase >= 3 ? 1.35 : 1.0) * this.attackFreqMult;
      if (this.auxCooldown <= 0 && distToPlayer <= this.spec.auxWeaponRange) {
        this.auxCooldown = 1 / Math.max(0.4, this.spec.auxFireRate);
        const aimToPlayer = Math.atan2(playerPos.y - this.phys.pos.y, playerPos.x - this.phys.pos.x);
        const shots: NonNullable<BossUpdateActions['fireAuxShots']> = [];
        for (let b = 0; b < this.spec.auxBurstCount; b++) {
          const offsetAngle = (b - (this.spec.auxBurstCount - 1) * 0.5) * 0.14;
          const mDist = this.spec.radius * 0.85;
          shots.push({
            x: this.phys.pos.x + Math.cos(aimToPlayer + offsetAngle) * mDist,
            y: this.phys.pos.y + Math.sin(aimToPlayer + offsetAngle) * mDist,
            angle: aimToPlayer + (Math.random() - 0.5) * (0.12 * empPenalty),
            kind: this.spec.auxWeaponKind,
            damage: this.spec.auxWeaponDamage * this.damageMult,
          });
        }
        actions.fireAuxShots = shots;
        this.auxExposedTimer = 0.85;
      }
    }

    // Special Variant Deployables (Fortress turrets, Blackout decoys & EMP pulse)
    if (this.phase >= 2 && !coreBroken && !this.ultimateActive) {
      this.deployCooldown -= dt * this.attackFreqMult;
      if (this.deployCooldown <= 0) {
        this.deployCooldown = this.phase >= 3 ? 10.5 : 14.0;
        if (this.spec.canDeployTurrets) {
          const ang = this.phys.bodyAngle + (Math.random() > 0.5 ? 1.1 : -1.1);
          actions.spawnDeployable = {
            kind: 'turret',
            x: Math.max(140, Math.min(mapW - 140, this.phys.pos.x + Math.cos(ang) * (this.spec.radius + 95))),
            y: Math.max(140, Math.min(mapH - 140, this.phys.pos.y + Math.sin(ang) * (this.spec.radius + 95))),
          };
        } else if (this.spec.canDeployDecoys) {
          const ang = this.phys.bodyAngle + (Math.random() > 0.5 ? 1.4 : -1.4);
          actions.spawnDeployable = {
            kind: 'decoy',
            x: Math.max(140, Math.min(mapW - 140, this.phys.pos.x + Math.cos(ang) * (this.spec.radius + 150))),
            y: Math.max(140, Math.min(mapH - 140, this.phys.pos.y + Math.sin(ang) * (this.spec.radius + 150))),
          };
          if (distToPlayer < 650) {
            actions.empPulse = { x: this.phys.pos.x, y: this.phys.pos.y, radius: 520 };
          }
        }
      }
    }

    // Step boss heavy mechanical physics
    stepMechPhysics(
      this.phys,
      this.physCfg,
      {
        wishX,
        wishY,
        sprint,
        bracing,
        anchored,
        time: this.simTime,
      },
      terrain,
      syntheticHealth,
      dt
    );

    resolveObstacleCollisions(this.phys.pos, this.phys.vel, this.spec.radius * 0.9, obstacles, mapW, mapH);

    // Compute exact 9-state BossPosture from live physics & combat telemetry
    const speed = Math.hypot(this.phys.vel.x, this.phys.vel.y);
    const speedRatio = speed / Math.max(1, this.physCfg.maxSpeed);
    const absAngVel = Math.abs(this.phys.angularVel);

    if (legRatio < 0.38 || this.hull / Math.max(1, this.maxHull) < 0.22) {
      this.posture = 'critical_damage';
    } else if (this.phys.recoilOffset > 3.5) {
      this.posture = 'recoil_recover';
    } else if (anchored || bracing || this.aiState === 'bracing' || this.aiState === 'warning' || this.aiState === 'firing') {
      this.posture = 'artillery_deploy';
    } else if (this.phys.braking && speed > 18) {
      this.posture = 'emergency_brake';
    } else if (absAngVel > 0.72 && speed > 24) {
      this.posture = 'high_speed_turn';
    } else if (sprint && speedRatio > 0.78) {
      this.posture = 'full_pursuit';
    } else if (speedRatio > 0.56) {
      this.posture = 'rapid_move';
    } else if (speed > 10) {
      this.posture = 'fast_walk';
    } else {
      this.posture = 'heavy_idle';
    }

    // Step colossal 10–16 procedural hydraulic legs
    const steps = this.legs.update(
      dt,
      this.phys,
      {
        strideLength: this.spec.strideLength,
        stepHeight: this.spec.stepHeight,
        stepSpeed: this.spec.stepSpeed * (legRatio < 0.5 ? 0.72 : 1.0) * this.speedMult,
        footstepWeight: this.spec.footstepWeight,
        posture: this.posture,
        leftLegRatio: leftRatio,
        rightLegRatio: rightRatio,
        destroying: false,
        destroyProgress: 0,
      },
      obstacles
    );
    actions.footsteps.push(...steps);

    return actions;
  }

  public toHudSnapshot(warningText: string | null): BossHudSnapshot {
    const order: BossComponentId[] = [
      'mortar',
      'ammoBays',
      'sensors',
      'leftLegs',
      'rightLegs',
      'auxWeapons',
      'powerCore',
    ];
    return {
      id: this.id,
      variantId: this.spec.id,
      code: this.spec.code,
      name: this.spec.name,
      subtitle: this.spec.subtitle,
      threatClass: this.spec.threatClass,
      hull: Math.round(this.hull),
      maxHull: this.maxHull,
      armor: Math.round(this.armor),
      maxArmor: this.maxArmor,
      phase: this.phase,
      aiState: this.aiState,
      posture: this.posture,
      activeWarhead: this.activeWarhead,
      ultimateActive: this.ultimateActive,
      ultimateName: this.spec.ultimateName,
      alive: this.alive,
      destroying: this.destroying,
      teleporting: this.teleportPhase === 'telegraphing',
      teleportProgress:
        this.teleportPhase === 'telegraphing'
          ? 1 - Math.max(0, this.teleportTelegraphTimer) / Math.max(0.1, this.teleportTelegraphTotal)
          : 0,
      components: order.map((cid) => {
        const c = this.components[cid];
        return {
          id: cid,
          label: c.label,
          hpRatio: c.hp / Math.max(1, c.maxHp),
          destroyed: c.destroyed,
        };
      }),
      warningText,
    };
  }
}
