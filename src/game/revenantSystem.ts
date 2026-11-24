import { AntiAirController } from './antiAirController';
import { createComponentHealth } from './combat';
import { DashController } from './dashSystem';
import { createFlightState } from './flightSystem';
import { MechActor } from './mech';
import { computeEffectiveMechStats, MECH_LIST, MECH_ROSTER } from './mechRoster';
import { createPhysicsState, PhysicsConfig } from './physics';
import { LegAnimator } from './proceduralLegs';
import { GameMode, MechClassId, Obstacle, PaintScheme, SaveData, Vec2 } from './types';
import { createWeaponRuntime } from './weapons';

/**
 * Pure white armor + deep purple/violet corruption + glowing violet outline scheme
 * used by every REVENANT unit regardless of its source mech class.
 */
export const REVENANT_PAINT: PaintScheme = {
  id: 'revenant_corrupted',
  name: 'Revenant Corrupted',
  primary: '#f4f6fb',
  secondary: '#4c1d95',
  accent: '#c084fc',
};

export const REVENANT_OUTLINE_COLOR = '#a855f7';
export const REVENANT_GLOW_COLOR = '#e879f9';

/**
 * Mode-specific persistence tracker for failed runs.
 * Records { gameMode -> mechClassId } so failing Survival with M-09 Colossus
 * ONLY spawns a Colossus Revenant on the next Survival attempt — never in Skirmish.
 */
export class FailedRunTracker {
  public static recordFailure(save: SaveData, mode: GameMode, mechClass: MechClassId): SaveData {
    // Training and freeroam do not trigger failure-to-Revenant penalties
    if (mode === 'training' || mode === 'freeroam') return save;
    return {
      ...save,
      failedModeUnits: {
        ...(save.failedModeUnits ?? {}),
        [mode]: mechClass,
      },
    };
  }

  public static getPendingRevenantClass(save: SaveData, mode: GameMode): MechClassId | null {
    if (mode === 'training' || mode === 'freeroam') return null;
    return save.failedModeUnits?.[mode] ?? null;
  }

  public static clearModeFailure(save: SaveData, mode: GameMode): SaveData {
    if (!save.failedModeUnits || !(mode in save.failedModeUnits)) return save;
    const next = { ...save.failedModeUnits };
    delete next[mode];
    return {
      ...save,
      failedModeUnits: next,
    };
  }
}

/**
 * Returns every complete, supported MechClassId eligible to spawn as a Revenant variant.
 */
export function getEligibleRevenantClasses(): MechClassId[] {
  return MECH_LIST.filter(
    (m) => Boolean(MECH_ROSTER[m.id]?.primaryWeapon && MECH_ROSTER[m.id]?.legs?.length >= 2)
  ).map((m) => m.id);
}

/**
 * Uniformly chooses a random eligible Revenant class, avoiding repeating excludeClassId
 * when more than one eligible variant exists so resets feel varied and unpredictable.
 */
export function pickRandomRevenantClass(
  excludeClassId?: MechClassId | null,
  rng: () => number = Math.random
): MechClassId {
  const all = getEligibleRevenantClasses();
  const pool = excludeClassId && all.length > 1 ? all.filter((id) => id !== excludeClassId) : all;
  const idx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * pool.length);
  return pool[idx] ?? 'standard';
}

/**
 * Resolves the guaranteed Revenant variant for any game mode:
 * honors pending mode-specific failed-run variant if present, otherwise picks
 * a random eligible Revenant variant so EVERY game mode gets a guaranteed Revenant.
 */
export function resolveGuaranteedRevenantClass(
  pendingFromFailure: MechClassId | null,
  lastRandomClassId?: MechClassId | null,
  rng: () => number = Math.random
): MechClassId {
  const eligible = getEligibleRevenantClasses();
  if (pendingFromFailure && eligible.includes(pendingFromFailure)) {
    return pendingFromFailure;
  }
  return pickRandomRevenantClass(lastRandomClassId, rng);
}

export interface RevenantClassProfile {
  speedMult: number;
  accelMult: number;
  damageMult: number;
  hullMult: number;
  armorMult: number;
  fireRateMult: number;
  damageResist: number;
  projectileSpeedMult: number;
  corruptedAbilityName: string;
  surgeCooldown: number;
}

export function getRevenantProfileForClass(classId: MechClassId): RevenantClassProfile {
  switch (classId) {
    case 'colossus':
      return {
        speedMult: 1.92,
        accelMult: 2.35,
        damageMult: 1.82,
        hullMult: 3.35,
        armorMult: 3.2,
        fireRateMult: 1.62,
        damageResist: 0.3,
        projectileSpeedMult: 1.42,
        corruptedAbilityName: 'VOID SIEGE BARRAGE',
        surgeCooldown: 5.5,
      };
    case 'valkyrie':
      return {
        speedMult: 1.96,
        accelMult: 2.45,
        damageMult: 1.76,
        hullMult: 2.95,
        armorMult: 2.85,
        fireRateMult: 1.72,
        damageResist: 0.24,
        projectileSpeedMult: 1.45,
        corruptedAbilityName: 'PHANTOM MISSILE STORM',
        surgeCooldown: 4.8,
      };
    case 'sniper':
      return {
        speedMult: 1.88,
        accelMult: 2.3,
        damageMult: 1.85,
        hullMult: 2.85,
        armorMult: 2.75,
        fireRateMult: 1.68,
        damageResist: 0.22,
        projectileSpeedMult: 1.52,
        corruptedAbilityName: 'CORRUPTED RAIL OVERCHARGE',
        surgeCooldown: 5.0,
      };
    case 'recon':
      return {
        speedMult: 2.05,
        accelMult: 2.6,
        damageMult: 1.72,
        hullMult: 2.8,
        armorMult: 2.7,
        fireRateMult: 1.8,
        damageResist: 0.22,
        projectileSpeedMult: 1.45,
        corruptedAbilityName: 'PHANTOM BLITZ OVERDRIVE',
        surgeCooldown: 4.2,
      };
    case 'heavy':
      return {
        speedMult: 1.86,
        accelMult: 2.28,
        damageMult: 1.8,
        hullMult: 3.45,
        armorMult: 3.35,
        fireRateMult: 1.6,
        damageResist: 0.32,
        projectileSpeedMult: 1.38,
        corruptedAbilityName: 'VIOLET JUGGERNAUT SALVO',
        surgeCooldown: 5.4,
      };
    case 'artillery':
      return {
        speedMult: 1.9,
        accelMult: 2.35,
        damageMult: 1.88,
        hullMult: 3.1,
        armorMult: 2.95,
        fireRateMult: 1.66,
        damageResist: 0.26,
        projectileSpeedMult: 1.44,
        corruptedAbilityName: 'VOID ARTILLERY STORM',
        surgeCooldown: 5.2,
      };
    case 'ewar':
      return {
        speedMult: 1.94,
        accelMult: 2.4,
        damageMult: 1.74,
        hullMult: 2.9,
        armorMult: 2.85,
        fireRateMult: 1.75,
        damageResist: 0.25,
        projectileSpeedMult: 1.46,
        corruptedAbilityName: 'CORRUPTED EMP RUPTURE',
        surgeCooldown: 4.6,
      };
    case 'engineer':
      return {
        speedMult: 1.88,
        accelMult: 2.32,
        damageMult: 1.76,
        hullMult: 3.2,
        armorMult: 3.1,
        fireRateMult: 1.68,
        damageResist: 0.28,
        projectileSpeedMult: 1.4,
        corruptedAbilityName: 'SIPHON NANITE SURGE',
        surgeCooldown: 5.0,
      };
    case 'phantom':
      return {
        speedMult: 2.04,
        accelMult: 2.55,
        damageMult: 1.82,
        hullMult: 3.1,
        armorMult: 3.05,
        fireRateMult: 1.78,
        damageResist: 0.28,
        projectileSpeedMult: 1.48,
        corruptedAbilityName: 'VOID PHASE BLINK SALVO',
        surgeCooldown: 4.4,
      };
    case 'assassin':
      return {
        speedMult: 2.1,
        accelMult: 2.65,
        damageMult: 1.84,
        hullMult: 2.85,
        armorMult: 2.75,
        fireRateMult: 1.85,
        damageResist: 0.22,
        projectileSpeedMult: 1.52,
        corruptedAbilityName: 'VOID SHADOW EXECUTION',
        surgeCooldown: 4.1,
      };
    case 'proteus':
      return {
        speedMult: 1.98,
        accelMult: 2.48,
        damageMult: 1.86,
        hullMult: 3.15,
        armorMult: 3.05,
        fireRateMult: 1.76,
        damageResist: 0.27,
        projectileSpeedMult: 1.46,
        corruptedAbilityName: 'CORRUPTED MORPH MATRIX',
        surgeCooldown: 4.5,
      };
    default:
      return {
        speedMult: 1.92,
        accelMult: 2.42,
        damageMult: 1.78,
        hullMult: 3.05,
        armorMult: 2.95,
        fireRateMult: 1.72,
        damageResist: 0.26,
        projectileSpeedMult: 1.42,
        corruptedAbilityName: 'CORRUPTED PHASE SURGE',
        surgeCooldown: 4.8,
      };
  }
}

/**
 * Generates an insanely fast, hyper-aggressive, corrupted hostile REVENANT mech
 * from the exact MechClassId the player selected during their previous failed attempt
 * (or directly spawned in Sandbox mode).
 */
export class RevenantVariantFactory {
  public static createRevenant(params: {
    sourceClassId: MechClassId;
    x: number;
    y: number;
    angle?: number;
    difficultyScale?: number;
    team?: 'enemy' | 'player';
  }): MechActor {
    const spec = MECH_ROSTER[params.sourceClassId];
    const baseStats = computeEffectiveMechStats(spec);
    const prof = getRevenantProfileForClass(params.sourceClassId);
    const diff = params.difficultyScale ?? 1.0;

    const stats = {
      ...baseStats,
      maxSpeed: Math.round(baseStats.maxSpeed * prof.speedMult),
      acceleration: Math.round(baseStats.acceleration * prof.accelMult),
      turnAccel: baseStats.turnAccel * 1.9,
      turnSpeed: baseStats.turnSpeed * 1.85,
      chassis: Math.round(baseStats.chassis * prof.hullMult * diff),
      armor: Math.round(baseStats.armor * prof.armorMult * diff),
      legDurability: Math.round(baseStats.legDurability * 2.85 * diff),
      sensorRange: Math.round(baseStats.sensorRange * 1.65),
      damageMult: baseStats.damageMult * prof.damageMult,
      fireRateMult: baseStats.fireRateMult * prof.fireRateMult,
    };

    const physCfg: PhysicsConfig = {
      mass: stats.mass * 0.88,
      acceleration: stats.acceleration,
      maxSpeed: stats.maxSpeed,
      sprintMultiplier: Math.max(1.48, spec.sprintMultiplier * 1.2),
      reverseMultiplier: Math.max(0.92, spec.reverseMultiplier * 1.25),
      turnAccel: stats.turnAccel,
      maxTurnSpeed: stats.turnSpeed,
      lateralGrip: Math.max(7.8, stats.lateralGrip * 1.4),
      radius: spec.radius * 1.06,
      suspensionStiffness: spec.suspensionStiffness,
      terrainPenaltyMult: 0.25,
    };

    const primarySpec = {
      ...spec.primaryWeapon,
      name: `Corrupted ${spec.primaryWeapon.name}`,
      damage: Math.round(spec.primaryWeapon.damage * prof.damageMult),
      fireRate: spec.primaryWeapon.fireRate * prof.fireRateMult,
      projectileSpeed: Math.round(spec.primaryWeapon.projectileSpeed * prof.projectileSpeedMult),
      range: Math.round(spec.primaryWeapon.range * 1.32),
      reloadTime: Math.max(0.65, spec.primaryWeapon.reloadTime * 0.58),
      recoilImpulse: spec.primaryWeapon.recoilImpulse * 0.3,
      spreadRad: spec.primaryWeapon.spreadRad * 0.58,
    };

    const secondarySpec = {
      ...spec.secondaryWeapon,
      name: `Void ${spec.secondaryWeapon.name}`,
      damage: Math.round(spec.secondaryWeapon.damage * prof.damageMult),
      fireRate: spec.secondaryWeapon.fireRate * prof.fireRateMult,
      projectileSpeed: Math.round(spec.secondaryWeapon.projectileSpeed * prof.projectileSpeedMult),
      range: Math.round(spec.secondaryWeapon.range * 1.32),
      reloadTime: Math.max(0.75, spec.secondaryWeapon.reloadTime * 0.6),
      recoilImpulse: spec.secondaryWeapon.recoilImpulse * 0.3,
    };

    const angle = params.angle ?? Math.PI;
    const isFlyer = Boolean(spec.canFly);
    const team = params.team ?? 'enemy';

    return {
      id: `revenant_${params.sourceClassId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      callsign: `REVENANT // ${spec.code}`,
      team,
      isPlayer: false,
      classId: params.sourceClassId,
      enemyArchetype: isFlyer ? 'rocket_hunter' : 'hunter',
      spec: {
        ...spec,
        maxSpeed: stats.maxSpeed,
        stepSpeed: spec.stepSpeed * 1.85,
        defaultColor: REVENANT_PAINT.primary,
        accentColor: REVENANT_PAINT.accent,
      },
      stats,
      physCfg,
      phys: createPhysicsState(params.x, params.y, angle),
      legs: new LegAnimator(spec.legs, { x: params.x, y: params.y }, angle),
      health: createComponentHealth(stats.chassis, stats.armor, stats.legDurability),
      primary: createWeaponRuntime(primarySpec),
      secondary: createWeaponRuntime(secondarySpec),
      activeSlot: 1,
      paint: { ...REVENANT_PAINT },
      specialActiveTimer: 0,
      specialCooldownTimer: 2.2,
      transformCooldownTimer: 0,
      hitFlashTimer: 0,
      alive: true,
      koTimer: 0,
      detected: true,
      jammedTimer: 0,
      aiState: 'engage',
      aiTimer: 0,
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
      flight: isFlyer ? createFlightState(true, 105) : undefined,
      dash: new DashController(params.sourceClassId),
      antiAir: AntiAirController.forMechClass(params.sourceClassId, undefined, angle),
      isRevenant: true,
      revenantSourceClass: params.sourceClassId,
      revenantSurgeTimer: prof.surgeCooldown * 0.45,
      revenantPulsePhase: 0,
    };
  }
}

export interface RevenantIntroState {
  scheduled: boolean;
  spawned: boolean;
  defeated: boolean;
  sourceClassId: MechClassId | null;
  warningTimer: number;
  bannerText: string | null;
  interferenceAlpha: number;
  spawnDelaySec: number;
}

/**
 * Coordinates the single-per-attempt Revenant entrance, radio interference warning,
 * HUD identification banner, and prevents any duplicate Revenant spawns.
 */
export class RevenantManager {
  public state: RevenantIntroState = {
    scheduled: false,
    spawned: false,
    defeated: false,
    sourceClassId: null,
    warningTimer: 0,
    bannerText: null,
    interferenceAlpha: 0,
    spawnDelaySec: 0,
  };

  public reset(): void {
    this.state = {
      scheduled: false,
      spawned: false,
      defeated: false,
      sourceClassId: null,
      warningTimer: 0,
      bannerText: null,
      interferenceAlpha: 0,
      spawnDelaySec: 0,
    };
  }

  public scheduleIfEligible(pendingClass: MechClassId | null, delaySec = 9.0): boolean {
    this.reset();
    if (!pendingClass) return false;
    this.state.scheduled = true;
    this.state.sourceClassId = pendingClass;
    this.state.spawnDelaySec = Math.max(3.5, delaySec);
    return true;
  }

  public update(dt: number, elapsedSeconds: number): {
    startInterference: boolean;
    shouldSpawnNow: boolean;
    sourceClassId: MechClassId | null;
  } {
    let startInterference = false;
    let shouldSpawnNow = false;

    if (this.state.warningTimer > 0) {
      this.state.warningTimer = Math.max(0, this.state.warningTimer - dt);
      this.state.interferenceAlpha = Math.min(1, this.state.warningTimer / 2.2) * 0.55;
      if (this.state.warningTimer <= 0) {
        this.state.bannerText = null;
        this.state.interferenceAlpha = 0;
      }
    }

    if (!this.state.scheduled || this.state.spawned || !this.state.sourceClassId) {
      return { startInterference, shouldSpawnNow, sourceClassId: this.state.sourceClassId };
    }

    // 2.2s before arrival: trigger radio interference & HUD signature warning
    if (elapsedSeconds >= this.state.spawnDelaySec - 2.2 && this.state.warningTimer <= 0 && !this.state.bannerText) {
      this.state.warningTimer = 5.4;
      this.state.interferenceAlpha = 0.52;
      this.state.bannerText = 'UNKNOWN HOSTILE SIGNATURE // IDENTIFICATION: REVENANT';
      startInterference = true;
    }

    if (elapsedSeconds >= this.state.spawnDelaySec) {
      this.state.spawned = true;
      shouldSpawnNow = true;
    }

    return { startInterference, shouldSpawnNow, sourceClassId: this.state.sourceClassId };
  }

  public pickSafeEntrancePoint(
    playerPos: Vec2,
    mapWidth: number,
    mapHeight: number,
    obstacles: readonly Obstacle[] = []
  ): Vec2 {
    const baseAngle = Math.atan2(mapHeight * 0.5 - playerPos.y, mapWidth * 0.5 - playerPos.x) + 0.35;
    const minDistPlayer = 520;
    const clearance = 46;
    const margin = 135;

    const isClear = (cx: number, cy: number): boolean => {
      if (cx < margin || cx > mapWidth - margin || cy < margin || cy > mapHeight - margin) return false;
      if (Math.hypot(cx - playerPos.x, cy - playerPos.y) < minDistPlayer) return false;
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (obs.destroyed) continue;
        const hw = obs.w * 0.5 + clearance;
        const hh = obs.h * 0.5 + clearance;
        if (Math.abs(cx - obs.x) < hw && Math.abs(cy - obs.y) < hh) {
          return false;
        }
      }
      return true;
    };

    const radii = [680, 780, 580, 880];
    const candidates = 16;
    for (let rIdx = 0; rIdx < radii.length; rIdx++) {
      const dist = radii[rIdx];
      for (let k = 0; k < candidates; k++) {
        const ang = baseAngle + (k / candidates) * Math.PI * 2;
        const cx = Math.max(margin, Math.min(mapWidth - margin, playerPos.x + Math.cos(ang) * dist));
        const cy = Math.max(margin, Math.min(mapHeight - margin, playerPos.y + Math.sin(ang) * dist));
        if (isClear(cx, cy)) {
          return { x: cx, y: cy };
        }
      }
    }

    // Fallback: pick farthest quadrant corner and push out of any intersecting obstacle
    let fx = playerPos.x < mapWidth * 0.5 ? mapWidth - 220 : 220;
    let fy = playerPos.y < mapHeight * 0.5 ? mapHeight - 220 : 220;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (obs.destroyed) continue;
        const hw = obs.w * 0.5 + clearance;
        const hh = obs.h * 0.5 + clearance;
        if (Math.abs(fx - obs.x) < hw && Math.abs(fy - obs.y) < hh) {
          const pushX = hw - Math.abs(fx - obs.x);
          const pushY = hh - Math.abs(fy - obs.y);
          if (pushX < pushY) fx += (fx >= obs.x ? 1 : -1) * (pushX + 8);
          else fy += (fy >= obs.y ? 1 : -1) * (pushY + 8);
        }
      }
    }
    return {
      x: Math.max(margin, Math.min(mapWidth - margin, fx)),
      y: Math.max(margin, Math.min(mapHeight - margin, fy)),
    };
  }
}
