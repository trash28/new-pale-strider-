import type { MechActor } from './mech';
import type { ThunderheadBoss } from './thunderheadBoss';
import { normalizeAngle, shortestAngleDiff } from './physics';
import { revealStealth } from './stealthSystem';
import {
  evaluateTakedownPose,
  selectCompatibleTakedown,
  TakedownAudioCue,
  TakedownVariationSpec,
} from './takedownVariations';
import type { Obstacle, Vec2 } from './types';

export type TimingJudgment = 'PERFECT' | 'GOOD' | 'MISS';
export type SlashPhase = 'idle' | 'telegraph' | 'strike' | 'recover';
export type TakedownMinigameVariant =
  | 'blade_sweep'
  | 'chrono_ring'
  | 'dual_arc'
  | 'tri_vector'
  | 'pulse_cadence';

export const ALL_MINIGAME_VARIANTS: readonly TakedownMinigameVariant[] = [
  'blade_sweep',
  'chrono_ring',
  'dual_arc',
  'tri_vector',
  'pulse_cadence',
];

export const SLASH_INTERVAL_MIN = 2.0;
export const SLASH_INTERVAL_MAX = 10.0;
export const FAST_SLASH_INTERVAL_MIN = 0.25;
export const FAST_SLASH_INTERVAL_MAX = 0.72;
export const DODGE_CURSOR_WIDTH = 0.068;
export const DODGE_CURSOR_HALF_WIDTH = DODGE_CURSOR_WIDTH * 0.5;

export interface SlashHazard {
  id: number;
  zoneCenter: number; // 0.16..0.84 along the bar
  zoneHalfWidth: number;
  secondaryZoneCenter: number | null;
  secondaryZoneHalfWidth: number;
  angleRad: number;
  side: -1 | 0 | 1;
  phase: SlashPhase;
  phaseTimer: number;
  phaseDuration: number;
  hitEvaluated: boolean;
  dodged: boolean;
  wasHit: boolean;
}

export interface TakedownMinigameState {
  active: boolean;
  mode: 'player_execution' | 'first_person_escape' | 'ai_visual';
  variant: TakedownMinigameVariant;
  stage: number;
  totalStages: number;
  cursor: number; // 0..1 player bar position
  cursorWidth: number;
  cursorVel: number;
  cursorDir: 1 | -1;
  cursorSpeed: number;
  wishMoveDir: -1 | 0 | 1;
  targetCursor: number | null;
  evadeCooldown: number;
  evadeMaxCooldown: number;
  perfectZone: [number, number];
  goodZone: [number, number];
  instability: number; // 0..1 (>= 1 breaks free / breaches)
  lastJudgment: TimingJudgment | null;
  judgmentTimer: number;
  timeRemaining: number;
  maxTime: number;
  aiRollTimer: number;
  aiResolvedStage: number;
  perfectCount: number;
  goodCount: number;
  missCount: number;
  // Variant-specific high-speed telemetry
  ringRadius: number; // chrono_ring (1.15 -> 0)
  ringTargetRadius: number;
  ringSpeed: number;
  needleA: number; // dual_arc & pulse_cadence (0..1)
  needleB: number; // dual_arc opposing blade (1..0)
  needleSpeedA: number;
  needleSpeedB: number;
  needleDirA: 1 | -1;
  targetZoneCenter: number;
  targetZoneHalfWidth: number;
  activeLane: 0 | 1 | 2; // tri_vector current lane
  dangerLanes: [boolean, boolean, boolean];
  slash: SlashHazard | null;
  nextSlashTimer: number;
  nextSlashDuration: number;
  slashCounter: number;
}

export interface TakedownSession {
  id: string;
  attackerId: string;
  targetId: string;
  isBossTarget: boolean;
  isPlayerAttacker: boolean;
  isPlayerVictim: boolean; // True => MUST remain in First-Person POV!
  variation: TakedownVariationSpec;
  anchorPos: Vec2;
  anchorTargetAngle: number;
  progress: number; // 0..1
  elapsed: number;
  state: 'teleporting' | 'choreography' | 'minigame' | 'finishing' | 'escaped';
  minigame: TakedownMinigameState;
  triggeredCueIndices: Set<number>;
  attackerRecoveryTimer: number;
}

export interface TakedownEvent {
  type:
    | 'started'
    | 'audio_cue'
    | 'spark_burst'
    | 'minigame_prompt'
    | 'slash_telegraph'
    | 'slash_strike'
    | 'minigame_judgment'
    | 'executed'
    | 'boss_weakpoint_hit'
    | 'escaped'
    | 'interrupted';
  sessionId: string;
  attackerId: string;
  targetId: string;
  isPlayerAttacker: boolean;
  isPlayerVictim: boolean;
  variant?: TakedownMinigameVariant;
  audioCue?: TakedownAudioCue;
  judgment?: TimingJudgment;
  damageAmount?: number;
  pos: Vec2;
  slashAngle?: number;
  slashSide?: -1 | 0 | 1;
  slashCenter?: number;
  bonusDamageMult?: number;
  isBossTarget?: boolean;
}

export const PHANTOM_EXECUTION_RANGE = 470;
export const BOSS_AMBUSH_DAMAGE_BASE = 240;

/**
 * Samples a randomized slash interval strictly within [2.0, 10.0] seconds (legacy distribution helper).
 */
export function sampleSlashInterval(rng: () => number = Math.random): number {
  const u = Math.max(0, Math.min(1, rng()));
  const raw = SLASH_INTERVAL_MIN + Math.pow(u, 1.35) * (SLASH_INTERVAL_MAX - SLASH_INTERVAL_MIN);
  return Math.max(SLASH_INTERVAL_MIN, Math.min(SLASH_INTERVAL_MAX, raw));
}

/**
 * Samples a fast-paced combat slash cadence strictly within [0.25, 0.72] seconds.
 */
export function sampleFastSlashInterval(
  rng: () => number = Math.random,
  stage = 1
): number {
  const u = Math.max(0, Math.min(1, rng()));
  const stageTighten = Math.min(0.22, Math.max(0, stage - 1) * 0.045);
  const raw =
    FAST_SLASH_INTERVAL_MIN +
    u * Math.max(0.14, FAST_SLASH_INTERVAL_MAX - FAST_SLASH_INTERVAL_MIN - stageTighten);
  return Math.max(FAST_SLASH_INTERVAL_MIN, Math.min(FAST_SLASH_INTERVAL_MAX, raw));
}

/**
 * Evaluates whether the player's small cursor bar dodged an incoming piercing slash zone
 * (or optional secondary pincer danger zone).
 */
export function evaluateSlashDodge(
  cursor: number,
  cursorHalfWidth: number,
  zoneCenter: number,
  zoneHalfWidth: number,
  secondaryZoneCenter: number | null = null,
  secondaryZoneHalfWidth = 0.1
): { hit: boolean; judgment: TimingJudgment; gap: number } {
  const dist1 = Math.abs(cursor - zoneCenter);
  const safeEdge1 = cursorHalfWidth + zoneHalfWidth;
  const gap1 = dist1 - safeEdge1;

  let minGap = gap1;
  if (secondaryZoneCenter !== null) {
    const dist2 = Math.abs(cursor - secondaryZoneCenter);
    const safeEdge2 = cursorHalfWidth + secondaryZoneHalfWidth;
    const gap2 = dist2 - safeEdge2;
    if (gap2 < minGap) minGap = gap2;
  }

  if (minGap < 0) {
    return { hit: true, judgment: 'MISS', gap: minGap };
  }
  return {
    hit: false,
    judgment: minGap <= 0.085 ? 'PERFECT' : 'GOOD',
    gap: minGap,
  };
}

/**
 * Computes a collision-safe teleport destination directly behind the moving/turning target,
 * accounting for target radius, wall/obstacle AABBs, and map bounds so the assassin NEVER
 * clips inside walls or the target's body.
 */
export function findSafeRearTeleportPos(params: {
  targetPos: Vec2;
  targetBodyAngle: number;
  targetRadius: number;
  attackerRadius: number;
  obstacles: Obstacle[];
  mapWidth: number;
  mapHeight: number;
}): { pos: Vec2; facingAngle: number } {
  const { targetPos, targetBodyAngle, targetRadius, attackerRadius, obstacles, mapWidth, mapHeight } = params;
  const standoff = targetRadius + attackerRadius + 16;
  const rearAngle = targetBodyAngle + Math.PI;
  const minX = attackerRadius + 28;
  const minY = attackerRadius + 28;
  const maxX = mapWidth - attackerRadius - 28;
  const maxY = mapHeight - attackerRadius - 28;

  const isFree = (px: number, py: number): boolean => {
    if (px < minX || px > maxX || py < minY || py > maxY) return false;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.destroyed) continue;
      if (
        Math.abs(px - obs.x) < obs.w * 0.5 + attackerRadius + 5 &&
        Math.abs(py - obs.y) < obs.h * 0.5 + attackerRadius + 5
      ) {
        return false;
      }
    }
    return true;
  };

  const angleOffsets = [0, 0.28, -0.28, 0.58, -0.58, 0.92, -0.92, 1.3, -1.3, 1.8, -1.8, Math.PI];
  const distScales = [1.0, 0.85, 1.25];

  for (const dScale of distScales) {
    const d = standoff * dScale;
    for (const off of angleOffsets) {
      const ang = rearAngle + off;
      const cx = targetPos.x + Math.cos(ang) * d;
      const cy = targetPos.y + Math.sin(ang) * d;
      if (isFree(cx, cy)) {
        return {
          pos: { x: cx, y: cy },
          facingAngle: Math.atan2(targetPos.y - cy, targetPos.x - cx),
        };
      }
    }
  }

  const clampedX = Math.max(minX, Math.min(maxX, targetPos.x + Math.cos(rearAngle) * standoff));
  const clampedY = Math.max(minY, Math.min(maxY, targetPos.y + Math.sin(rearAngle) * standoff));
  return {
    pos: { x: clampedX, y: clampedY },
    facingAngle: Math.atan2(targetPos.y - clampedY, targetPos.x - clampedX),
  };
}

export function evaluateTimingJudgment(
  cursor: number,
  perfectZone: [number, number],
  goodZone: [number, number]
): TimingJudgment {
  if (cursor >= perfectZone[0] && cursor <= perfectZone[1]) return 'PERFECT';
  if (cursor >= goodZone[0] && cursor <= goodZone[1]) return 'GOOD';
  return 'MISS';
}

export class TakedownManager {
  public sessions: TakedownSession[] = [];
  private targetLocks = new Map<string, string>(); // targetId -> sessionId
  private attackerLocks = new Map<string, string>(); // attackerId -> sessionId
  private recoveryTimers = new Map<string, number>(); // attackerId -> recovery stagger sec
  private sessionCounter = 0;
  private lastVariationByAttacker = new Map<string, string>();
  private lastPlayerVariant: TakedownMinigameVariant | null = null;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  public clear(): void {
    this.sessions = [];
    this.targetLocks.clear();
    this.attackerLocks.clear();
    this.recoveryTimers.clear();
  }

  public isUnitLocked(unitId: string): boolean {
    return this.targetLocks.has(unitId) || this.attackerLocks.has(unitId);
  }

  public isUnitInRecovery(unitId: string): boolean {
    return (this.recoveryTimers.get(unitId) ?? 0) > 0;
  }

  public getSessionForPlayer(): TakedownSession | null {
    for (const s of this.sessions) {
      if (s.isPlayerAttacker || s.isPlayerVictim) return s;
    }
    return null;
  }

  public getPlayerMinigameSession(): TakedownSession | null {
    for (const s of this.sessions) {
      if ((s.isPlayerAttacker || s.isPlayerVictim) && s.state === 'minigame' && s.minigame.active) {
        return s;
      }
    }
    return null;
  }

  public getFirstPersonVictimSession(): TakedownSession | null {
    for (const s of this.sessions) {
      if (s.isPlayerVictim) return s;
    }
    return null;
  }

  /**
   * Finds the best eligible enemy target (or boss) in Phantom Execution range
   * near the player's aim vector or proximity.
   */
  public findExecutionTarget(
    attacker: MechActor,
    enemies: MechActor[],
    boss: ThunderheadBoss | null,
    cursorWorld: Vec2,
    rangeOverride: number = PHANTOM_EXECUTION_RANGE
  ): { kind: 'mech'; target: MechActor } | { kind: 'boss'; boss: ThunderheadBoss } | null {
    if (!attacker.alive || this.isUnitLocked(attacker.id) || this.isUnitInRecovery(attacker.id)) {
      return null;
    }

    let bestMech: MechActor | null = null;
    let bestScore = -1e9;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.downed) continue;
      if (this.isUnitLocked(e.id)) continue;
      const dist = Math.hypot(e.phys.pos.x - attacker.phys.pos.x, e.phys.pos.y - attacker.phys.pos.y);
      if (dist > rangeOverride) continue;

      const dCursor = Math.hypot(e.phys.pos.x - cursorWorld.x, e.phys.pos.y - cursorWorld.y);
      const aimToE = Math.atan2(e.phys.pos.y - attacker.phys.pos.y, e.phys.pos.x - attacker.phys.pos.x);
      const aimAlign = 1 - Math.abs(shortestAngleDiff(attacker.phys.aimAngle, aimToE)) / Math.PI;
      const score = aimAlign * 420 - dCursor * 0.55 - dist * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestMech = e;
      }
    }

    if (bestMech) {
      return { kind: 'mech', target: bestMech };
    }

    if (boss && boss.alive && !boss.destroying && !this.isUnitLocked(boss.id)) {
      const distB = Math.hypot(boss.phys.pos.x - attacker.phys.pos.x, boss.phys.pos.y - attacker.phys.pos.y);
      if (distB <= rangeOverride + boss.spec.radius) {
        return { kind: 'boss', boss };
      }
    }

    return null;
  }

  private pickNextMinigameVariant(explicit?: TakedownMinigameVariant): TakedownMinigameVariant {
    if (explicit) {
      this.lastPlayerVariant = explicit;
      return explicit;
    }
    const pool = ALL_MINIGAME_VARIANTS.filter((v) => v !== this.lastPlayerVariant);
    const chosen = pool[Math.floor(this.rng() * pool.length) % pool.length] ?? 'blade_sweep';
    this.lastPlayerVariant = chosen;
    return chosen;
  }

  private createInitialMinigameState(params: {
    mode: TakedownMinigameState['mode'];
    variant: TakedownMinigameVariant;
    totalStages: number;
    isPlayerVictim: boolean;
  }): TakedownMinigameState {
    const initialLead = params.mode === 'ai_visual' ? 0.25 : 0.26;
    return {
      active: false,
      mode: params.mode,
      variant: params.variant,
      stage: 1,
      totalStages: params.totalStages,
      cursor: 0.5,
      cursorWidth: DODGE_CURSOR_WIDTH,
      cursorVel: 0,
      cursorDir: 1,
      cursorSpeed: params.isPlayerVictim ? 2.05 : 1.95,
      wishMoveDir: 0,
      targetCursor: null,
      evadeCooldown: 0,
      evadeMaxCooldown: 0.16,
      perfectZone: [0.44, 0.56],
      goodZone: [0.3, 0.7],
      instability: 0,
      lastJudgment: null,
      judgmentTimer: 0,
      timeRemaining: initialLead,
      maxTime: initialLead,
      aiRollTimer: 0.42,
      aiResolvedStage: 0,
      perfectCount: 0,
      goodCount: 0,
      missCount: 0,
      ringRadius: 1.15,
      ringTargetRadius: 0.28,
      ringSpeed: 1.9,
      needleA: 0,
      needleB: 1,
      needleSpeedA: 1.95,
      needleSpeedB: 1.95,
      needleDirA: 1,
      targetZoneCenter: 0.5,
      targetZoneHalfWidth: 0.072,
      activeLane: 1,
      dangerLanes: [false, false, false],
      slash: null,
      nextSlashTimer: initialLead,
      nextSlashDuration: initialLead,
      slashCounter: 0,
    };
  }

  public startMechTakedown(params: {
    attacker: MechActor;
    target: MechActor;
    obstacles: Obstacle[];
    mapWidth: number;
    mapHeight: number;
    seedIndex?: number;
    variant?: TakedownMinigameVariant;
  }): { session: TakedownSession; teleportOrigin: Vec2; teleportDest: Vec2 } | null {
    const { attacker, target, obstacles, mapWidth, mapHeight } = params;
    if (!attacker.alive || !target.alive || target.downed) return null;
    if (attacker.id === target.id || attacker.team === target.team) return null;
    if (this.isUnitLocked(attacker.id) || this.isUnitLocked(target.id) || this.isUnitInRecovery(attacker.id)) {
      return null;
    }

    const origin = { x: attacker.phys.pos.x, y: attacker.phys.pos.y };
    const safeRear = findSafeRearTeleportPos({
      targetPos: target.phys.pos,
      targetBodyAngle: target.phys.bodyAngle,
      targetRadius: target.spec.radius,
      attackerRadius: attacker.spec.radius,
      obstacles,
      mapWidth,
      mapHeight,
    });

    const isAerial = Boolean(target.flight?.isAirborne && (target.flight.altitude ?? 0) > 16);
    const isHeavy =
      target.classId === 'heavy' ||
      target.classId === 'colossus' ||
      target.classId === 'artillery' ||
      Boolean(target.isRevenant);
    const variation = selectCompatibleTakedown({
      isBoss: false,
      isAerial,
      isHeavy,
      seedIndex: params.seedIndex,
      lastUsedId: this.lastVariationByAttacker.get(attacker.id) ?? null,
    });
    this.lastVariationByAttacker.set(attacker.id, variation.id);

    attacker.phys.pos.x = safeRear.pos.x;
    attacker.phys.pos.y = safeRear.pos.y;
    attacker.phys.vel.x = 0;
    attacker.phys.vel.y = 0;
    attacker.phys.bodyAngle = safeRear.facingAngle;
    attacker.phys.aimAngle = safeRear.facingAngle;
    target.phys.vel.x *= 0.15;
    target.phys.vel.y *= 0.15;
    attacker.legs.reset(attacker.spec.legs, attacker.phys.pos, attacker.phys.bodyAngle);

    const isPlayerAttacker = attacker.isPlayer;
    const isPlayerVictim = target.isPlayer;
    const mode: TakedownMinigameState['mode'] = isPlayerVictim
      ? 'first_person_escape'
      : isPlayerAttacker
      ? 'player_execution'
      : 'ai_visual';

    const variant: TakedownMinigameVariant =
      mode === 'ai_visual' ? 'blade_sweep' : this.pickNextMinigameVariant(params.variant);
    const totalStages = mode === 'ai_visual' ? 2 : target.isRevenant ? 6 : 5;

    const sessionId = `td_${++this.sessionCounter}`;
    const session: TakedownSession = {
      id: sessionId,
      attackerId: attacker.id,
      targetId: target.id,
      isBossTarget: false,
      isPlayerAttacker,
      isPlayerVictim,
      variation,
      anchorPos: { x: target.phys.pos.x, y: target.phys.pos.y },
      anchorTargetAngle: target.phys.bodyAngle,
      progress: 0,
      elapsed: 0,
      state: 'choreography',
      triggeredCueIndices: new Set<number>(),
      attackerRecoveryTimer: 0,
      minigame: this.createInitialMinigameState({ mode, variant, totalStages, isPlayerVictim }),
    };

    this.sessions.push(session);
    this.targetLocks.set(target.id, sessionId);
    this.attackerLocks.set(attacker.id, sessionId);

    return {
      session,
      teleportOrigin: origin,
      teleportDest: { x: safeRear.pos.x, y: safeRear.pos.y },
    };
  }

  public startBossAmbushTakedown(params: {
    attacker: MechActor;
    boss: ThunderheadBoss;
    obstacles: Obstacle[];
    mapWidth: number;
    mapHeight: number;
    variant?: TakedownMinigameVariant;
  }): { session: TakedownSession; teleportOrigin: Vec2; teleportDest: Vec2 } | null {
    const { attacker, boss, obstacles, mapWidth, mapHeight } = params;
    if (!attacker.alive || !boss.alive || boss.destroying) return null;
    if (this.isUnitLocked(attacker.id) || this.isUnitLocked(boss.id) || this.isUnitInRecovery(attacker.id)) {
      return null;
    }

    const origin = { x: attacker.phys.pos.x, y: attacker.phys.pos.y };
    const safeRear = findSafeRearTeleportPos({
      targetPos: boss.phys.pos,
      targetBodyAngle: boss.phys.bodyAngle,
      targetRadius: boss.spec.radius,
      attackerRadius: attacker.spec.radius,
      obstacles,
      mapWidth,
      mapHeight,
    });

    const variation = selectCompatibleTakedown({
      isBoss: true,
      isAerial: false,
      isHeavy: false,
    });

    attacker.phys.pos.x = safeRear.pos.x;
    attacker.phys.pos.y = safeRear.pos.y;
    attacker.phys.vel.x = 0;
    attacker.phys.vel.y = 0;
    attacker.phys.bodyAngle = safeRear.facingAngle;
    attacker.phys.aimAngle = safeRear.facingAngle;
    attacker.legs.reset(attacker.spec.legs, attacker.phys.pos, attacker.phys.bodyAngle);

    const sessionId = `td_${++this.sessionCounter}`;
    const mode: TakedownMinigameState['mode'] = attacker.isPlayer ? 'player_execution' : 'ai_visual';
    const variant: TakedownMinigameVariant =
      mode === 'ai_visual' ? 'blade_sweep' : this.pickNextMinigameVariant(params.variant);
    const totalStages = mode === 'ai_visual' ? 2 : 6;

    const session: TakedownSession = {
      id: sessionId,
      attackerId: attacker.id,
      targetId: boss.id,
      isBossTarget: true,
      isPlayerAttacker: attacker.isPlayer,
      isPlayerVictim: false,
      variation,
      anchorPos: { x: boss.phys.pos.x, y: boss.phys.pos.y },
      anchorTargetAngle: boss.phys.bodyAngle,
      progress: 0,
      elapsed: 0,
      state: 'choreography',
      triggeredCueIndices: new Set<number>(),
      attackerRecoveryTimer: 0,
      minigame: this.createInitialMinigameState({ mode, variant, totalStages, isPlayerVictim: false }),
    };

    this.sessions.push(session);
    this.targetLocks.set(boss.id, sessionId);
    this.attackerLocks.set(attacker.id, sessionId);

    return {
      session,
      teleportOrigin: origin,
      teleportDest: { x: safeRear.pos.x, y: safeRear.pos.y },
    };
  }

  /**
   * Sets continuous horizontal bar steering from keyboard (A/D / Arrows) or pointer hover/drag.
   */
  public setPlayerDodgeInput(wishDir: -1 | 0 | 1, targetCursor?: number | null): void {
    const s = this.getPlayerMinigameSession();
    if (!s) return;
    s.minigame.wishMoveDir = wishDir;
    if (targetCursor !== undefined) {
      s.minigame.targetCursor =
        targetCursor === null ? null : Math.max(0.05, Math.min(0.95, targetCursor));
    }
  }

  /**
   * Direct lane selection for 'tri_vector' tactical lane dodging.
   */
  public setPlayerLane(lane: 0 | 1 | 2): boolean {
    const s = this.getPlayerMinigameSession();
    if (!s || s.minigame.variant !== 'tri_vector') return false;
    const clamped = Math.max(0, Math.min(2, lane)) as 0 | 1 | 2;
    if (s.minigame.activeLane === clamped) return false;
    s.minigame.activeLane = clamped;
    s.minigame.cursor = clamped === 0 ? 0.17 : clamped === 1 ? 0.5 : 0.83;
    return true;
  }

  /**
   * Steps lane left/right for 'tri_vector'.
   */
  public stepPlayerLane(delta: -1 | 1): boolean {
    const s = this.getPlayerMinigameSession();
    if (!s || s.minigame.variant !== 'tri_vector') return false;
    const next = Math.max(0, Math.min(2, s.minigame.activeLane + delta)) as 0 | 1 | 2;
    return this.setPlayerLane(next);
  }

  /**
   * Executes a snappy lateral dodge dash on 'blade_sweep' or shifts lane on 'tri_vector'.
   */
  public triggerPlayerDodgeDash(explicitDir?: -1 | 1): { dir: -1 | 1; session: TakedownSession } | null {
    const s = this.getPlayerMinigameSession();
    if (!s) return null;
    const mg = s.minigame;

    if (mg.variant === 'tri_vector') {
      let dir: -1 | 1 = explicitDir ?? (mg.wishMoveDir !== 0 ? mg.wishMoveDir : 1);
      if (!explicitDir && mg.wishMoveDir === 0) {
        // Hop toward a safe lane
        const safeLanes: (0 | 1 | 2)[] = [0, 1, 2].filter((l) => !mg.dangerLanes[l]) as (0 | 1 | 2)[];
        if (safeLanes.length > 0 && mg.dangerLanes[mg.activeLane]) {
          const target = safeLanes[0];
          dir = target < mg.activeLane ? -1 : 1;
          this.setPlayerLane(target);
          return { dir, session: s };
        }
        dir = mg.activeLane === 2 ? -1 : 1;
      }
      this.stepPlayerLane(dir);
      return { dir, session: s };
    }

    if (mg.evadeCooldown > 0) return null;

    let dir: -1 | 1;
    if (explicitDir) {
      dir = explicitDir;
    } else if (mg.wishMoveDir !== 0) {
      dir = mg.wishMoveDir;
    } else if (mg.slash) {
      dir = mg.cursor <= mg.slash.zoneCenter ? -1 : 1;
      if (dir === -1 && mg.cursor < 0.22 && mg.slash.zoneCenter < 0.55) dir = 1;
      if (dir === 1 && mg.cursor > 0.78 && mg.slash.zoneCenter > 0.45) dir = -1;
    } else {
      dir = mg.cursor > 0.5 ? -1 : 1;
    }

    mg.targetCursor = null;
    mg.cursor = Math.max(0.055, Math.min(0.945, mg.cursor + dir * 0.25));
    mg.cursorVel = dir * 3.1;
    mg.evadeCooldown = mg.evadeMaxCooldown;
    return { dir, session: s };
  }

  /**
   * Handles Space / F / Enter / Click across all 5 minigame variations:
   * - For 'chrono_ring', 'dual_arc', 'pulse_cadence': immediately evaluates precision parry timing!
   * - For 'blade_sweep' & 'tri_vector': executes lateral dodge dash / lane evade!
   */
  public submitPlayerTimingInput(
    explicitDir?: -1 | 1
  ): {
    action: 'dodge' | 'parry';
    judgment: TimingJudgment;
    damageAmount?: number;
    session: TakedownSession;
  } | null {
    const s = this.getPlayerMinigameSession();
    if (!s) return null;
    const mg = s.minigame;

    if (
      mg.variant === 'chrono_ring' ||
      mg.variant === 'dual_arc' ||
      mg.variant === 'pulse_cadence'
    ) {
      const sl = mg.slash;
      if (!sl || sl.phase !== 'telegraph' || sl.hitEvaluated) {
        return null;
      }

      let judgment: TimingJudgment = 'MISS';
      if (mg.variant === 'chrono_ring') {
        const diff = Math.abs(mg.ringRadius - mg.ringTargetRadius);
        if (diff <= 0.042) judgment = 'PERFECT';
        else if (diff <= 0.095) judgment = 'GOOD';
        else judgment = 'MISS';
      } else if (mg.variant === 'dual_arc') {
        const diff = Math.abs(mg.needleA - mg.targetZoneCenter);
        if (diff <= mg.targetZoneHalfWidth * 0.48) judgment = 'PERFECT';
        else if (diff <= mg.targetZoneHalfWidth * 1.12) judgment = 'GOOD';
        else judgment = 'MISS';
      } else {
        // pulse_cadence
        const diff = Math.abs(mg.needleA - mg.targetZoneCenter);
        if (diff <= mg.targetZoneHalfWidth * 0.48) judgment = 'PERFECT';
        else if (diff <= mg.targetZoneHalfWidth * 1.15) judgment = 'GOOD';
        else judgment = 'MISS';
      }

      // Immediately resolve this hazard & snap into kinetic blade clash!
      sl.hitEvaluated = true;
      sl.phase = 'strike';
      sl.phaseDuration = 0.18;
      sl.phaseTimer = 0.18;
      mg.lastJudgment = judgment;
      mg.judgmentTimer = 0.55;

      let damageAmount = 0;
      if (judgment === 'MISS') {
        sl.wasHit = true;
        mg.missCount += 1;
        mg.instability = Math.min(1, mg.instability + 0.28);
        damageAmount = this.computeSlashDamage(s);
        if (mg.instability >= 1) {
          mg.active = false;
          s.state = 'escaped';
        }
      } else {
        sl.dodged = true;
        if (judgment === 'PERFECT') mg.perfectCount += 1;
        else mg.goodCount += 1;
        mg.stage += 1;
      }

      return { action: 'parry', judgment, damageAmount, session: s };
    }

    // Dodge-based variants ('blade_sweep' & 'tri_vector')
    const dash = this.triggerPlayerDodgeDash(explicitDir);
    if (!dash) return null;
    return { action: 'dodge', judgment: 'GOOD', session: dash.session };
  }

  private computeSlashDamage(s: TakedownSession): number {
    const base = s.isBossTarget ? 26 : s.isPlayerVictim ? 24 : 18;
    return Math.round(base + (s.minigame.stage - 1) * 2.5);
  }

  private spawnSlashHazard(s: TakedownSession): SlashHazard {
    const mg = s.minigame;
    mg.slashCounter += 1;
    const speedScale = 1 + (mg.stage - 1) * 0.085;

    let zoneCenter = 0.5;
    let zoneHalfWidth = 0.145;
    let secondaryZoneCenter: number | null = null;
    const secondaryZoneHalfWidth = 0.1;
    let telegraphDur = 0.48;

    if (mg.variant === 'blade_sweep') {
      const bias = (this.rng() - 0.5) * 0.26;
      zoneCenter = Math.max(0.18, Math.min(0.82, mg.cursor + bias));
      if (mg.slashCounter === 1 && Math.abs(zoneCenter - mg.cursor) > 0.12) {
        zoneCenter = Math.max(0.2, Math.min(0.8, mg.cursor));
      }
      zoneHalfWidth = (s.isPlayerVictim || s.isBossTarget ? 0.155 : 0.135) + Math.min(0.025, mg.stage * 0.004);
      telegraphDur = Math.max(0.36, (s.isPlayerVictim ? 0.48 : 0.52) / speedScale);

      // On higher stages (3+), spawn a secondary pincer hazard leaving wide safe zones elsewhere
      if (mg.stage >= 3) {
        const alt = zoneCenter < 0.5 ? Math.min(0.84, zoneCenter + 0.44) : Math.max(0.16, zoneCenter - 0.44);
        if (Math.abs(alt - zoneCenter) >= 0.34) {
          secondaryZoneCenter = alt;
        }
      }
    } else if (mg.variant === 'chrono_ring') {
      zoneCenter = 0.5;
      mg.ringRadius = 1.12;
      mg.ringTargetRadius = 0.23 + this.rng() * 0.11;
      mg.ringSpeed = (1.72 + this.rng() * 0.26) * speedScale;
      // Full time for ring to collapse to 0
      telegraphDur = (mg.ringRadius + 0.05) / mg.ringSpeed;
    } else if (mg.variant === 'dual_arc') {
      const c = 0.28 + this.rng() * 0.44;
      mg.targetZoneCenter = c;
      mg.targetZoneHalfWidth = Math.max(0.058, 0.075 - (mg.stage - 1) * 0.003);
      zoneCenter = c;
      mg.needleA = 0;
      mg.needleB = 1;
      const baseVel = (1.18 + this.rng() * 0.18) * speedScale;
      const meetTime = Math.max(0.32, c / baseVel);
      mg.needleSpeedA = c / meetTime;
      mg.needleSpeedB = (1 - c) / meetTime;
      telegraphDur = meetTime + 0.24;
    } else if (mg.variant === 'tri_vector') {
      const twoDanger = mg.stage >= 2 && this.rng() < 0.72;
      const lanes: [boolean, boolean, boolean] = [false, false, false];
      // Guarantee current active lane is threatened >= 80% of the time so player must actively dodge!
      const threatenCur = this.rng() < 0.85;
      if (threatenCur) {
        lanes[mg.activeLane] = true;
      } else {
        lanes[(mg.activeLane + 1) % 3] = true;
      }
      if (twoDanger) {
        const candidates = [0, 1, 2].filter((idx) => !lanes[idx]);
        const pick = candidates[Math.floor(this.rng() * candidates.length) % candidates.length];
        if (pick !== undefined) lanes[pick] = true;
      }
      // Guarantee at least one safe lane always!
      if (lanes[0] && lanes[1] && lanes[2]) {
        lanes[(mg.activeLane + 1) % 3] = false;
      }
      mg.dangerLanes = lanes;
      const firstDanger = lanes[0] ? 0 : lanes[1] ? 1 : 2;
      zoneCenter = firstDanger === 0 ? 0.17 : firstDanger === 1 ? 0.5 : 0.83;
      telegraphDur = Math.max(0.36, (s.isPlayerVictim ? 0.48 : 0.51) / speedScale);
    } else {
      // pulse_cadence
      mg.targetZoneCenter = 0.22 + this.rng() * 0.56;
      mg.targetZoneHalfWidth = Math.max(0.058, 0.078 - (mg.stage - 1) * 0.003);
      zoneCenter = mg.targetZoneCenter;
      mg.needleA = mg.targetZoneCenter < 0.5 ? 0.92 : 0.08;
      mg.needleDirA = mg.needleA > 0.5 ? -1 : 1;
      mg.needleSpeedA = (2.15 + this.rng() * 0.35) * speedScale;
      telegraphDur = 1.05;
    }

    const side: -1 | 0 | 1 = zoneCenter < 0.39 ? -1 : zoneCenter > 0.61 ? 1 : 0;
    const angleVariants =
      side === -1
        ? [-0.72, 0.58, -1.05]
        : side === 1
        ? [-2.42, 2.52, -2.08]
        : [-1.57, -0.45, 0.45];
    const angleRad = angleVariants[mg.slashCounter % angleVariants.length] + (this.rng() - 0.5) * 0.14;

    return {
      id: mg.slashCounter,
      zoneCenter,
      zoneHalfWidth,
      secondaryZoneCenter,
      secondaryZoneHalfWidth,
      angleRad,
      side,
      phase: 'telegraph',
      phaseTimer: telegraphDur,
      phaseDuration: telegraphDur,
      hitEvaluated: false,
      dodged: false,
      wasHit: false,
    };
  }

  public step(
    dt: number,
    actorsById: Map<string, MechActor>,
    boss: ThunderheadBoss | null,
    dtPlayerDuel: number = dt
  ): TakedownEvent[] {
    const events: TakedownEvent[] = [];

    // Tick recovery staggers
    for (const [uid, rem] of this.recoveryTimers.entries()) {
      const next = rem - dt;
      if (next <= 0) this.recoveryTimers.delete(uid);
      else this.recoveryTimers.set(uid, next);
    }

    for (let i = this.sessions.length - 1; i >= 0; i--) {
      const s = this.sessions[i];
      const sessDt = s.isPlayerAttacker || s.isPlayerVictim ? dtPlayerDuel : dt;
      const attacker = actorsById.get(s.attackerId);
      const targetMech = s.isBossTarget ? undefined : actorsById.get(s.targetId);
      const targetAlive = s.isBossTarget
        ? Boolean(boss && boss.id === s.targetId && boss.alive && !boss.destroying)
        : Boolean(targetMech && targetMech.alive && !targetMech.downed);

      if (!attacker || !attacker.alive || attacker.downed || !targetAlive) {
        events.push({
          type: 'interrupted',
          sessionId: s.id,
          attackerId: s.attackerId,
          targetId: s.targetId,
          isPlayerAttacker: s.isPlayerAttacker,
          isPlayerVictim: s.isPlayerVictim,
          variant: s.minigame.variant,
          pos: { ...s.anchorPos },
        });
        this.releaseSessionAtIndex(i);
        continue;
      }

      if (s.minigame.judgmentTimer > 0) {
        s.minigame.judgmentTimer = Math.max(0, s.minigame.judgmentTimer - sessDt);
      }

      const targetRadius = s.isBossTarget && boss ? boss.spec.radius : targetMech!.spec.radius;
      if (s.isBossTarget && boss) {
        s.anchorPos = { x: boss.phys.pos.x, y: boss.phys.pos.y };
        s.anchorTargetAngle = boss.phys.bodyAngle;
      }

      const beatStart = s.variation.minigameBeatWindow[0];
      const beatEnd = s.variation.minigameBeatWindow[1];

      if (s.state === 'choreography') {
        s.elapsed += sessDt;
        s.progress = Math.min(1, s.elapsed / Math.max(0.4, s.variation.duration));
        if (s.progress >= beatStart) {
          s.state = 'minigame';
          s.minigame.active = true;
          events.push({
            type: 'minigame_prompt',
            sessionId: s.id,
            attackerId: s.attackerId,
            targetId: s.targetId,
            isPlayerAttacker: s.isPlayerAttacker,
            isPlayerVictim: s.isPlayerVictim,
            variant: s.minigame.variant,
            pos: { ...s.anchorPos },
          });
        }
      } else if (s.state === 'minigame') {
        const mg = s.minigame;

        if (mg.mode === 'ai_visual') {
          // Friendly AI & AI-vs-AI takedown minigame: STRICTLY UNBIASED FLAT 50% PROBABILITY!
          const targetBeatProgress = Math.min(
            beatEnd,
            beatStart + (beatEnd - beatStart) * (1 - Math.max(0, mg.aiRollTimer) / 0.42)
          );
          s.progress += (targetBeatProgress - s.progress) * Math.min(1, sessDt * 8);

          mg.cursor += mg.cursorDir * 1.15 * sessDt;
          if (mg.cursor >= 0.88) {
            mg.cursor = 0.88;
            mg.cursorDir = -1;
          } else if (mg.cursor <= 0.12) {
            mg.cursor = 0.12;
            mg.cursorDir = 1;
          }

          mg.aiRollTimer -= sessDt;
          if (mg.aiRollTimer <= 0) {
            const success = this.rng() < 0.5;
            const judgment: TimingJudgment = success
              ? this.rng() < 0.35
                ? 'PERFECT'
                : 'GOOD'
              : 'MISS';
            mg.lastJudgment = judgment;
            mg.judgmentTimer = 0.55;
            events.push({
              type: 'minigame_judgment',
              sessionId: s.id,
              attackerId: s.attackerId,
              targetId: s.targetId,
              isPlayerAttacker: false,
              isPlayerVictim: false,
              variant: mg.variant,
              judgment,
              pos: { ...s.anchorPos },
            });
            mg.active = false;
            if (success) {
              if (judgment === 'PERFECT') mg.perfectCount++;
              else mg.goodCount++;
              s.state = 'finishing';
            } else {
              mg.missCount++;
              s.state = 'escaped';
            }
          }
        } else {
          // Interactive Player Fast-Paced 5-Variant Minigame
          if (mg.evadeCooldown > 0) {
            mg.evadeCooldown = Math.max(0, mg.evadeCooldown - sessDt);
          }

          if (mg.variant === 'blade_sweep') {
            if (mg.wishMoveDir !== 0) {
              const targetVel = mg.wishMoveDir * mg.cursorSpeed;
              mg.cursorVel += (targetVel - mg.cursorVel) * Math.min(1, sessDt * 22);
            } else if (mg.targetCursor !== null) {
              const delta = mg.targetCursor - mg.cursor;
              const desiredVel = Math.max(
                -mg.cursorSpeed * 1.55,
                Math.min(mg.cursorSpeed * 1.55, delta * 16)
              );
              mg.cursorVel += (desiredVel - mg.cursorVel) * Math.min(1, sessDt * 24);
            } else {
              mg.cursorVel *= Math.exp(-15 * sessDt);
              if (Math.abs(mg.cursorVel) < 0.01) mg.cursorVel = 0;
            }
            mg.cursor = Math.max(0.05, Math.min(0.95, mg.cursor + mg.cursorVel * sessDt));
          }

          if (!mg.slash) {
            mg.nextSlashTimer -= sessDt;
            const sway = Math.sin(s.elapsed * 4.5) * 0.06;
            const poiseProgress = beatStart + (beatEnd - beatStart) * (0.2 + sway);
            s.progress += (poiseProgress - s.progress) * Math.min(1, sessDt * 6);
            s.elapsed += sessDt;

            if (mg.nextSlashTimer <= 0) {
              mg.slash = this.spawnSlashHazard(s);
              events.push({
                type: 'slash_telegraph',
                sessionId: s.id,
                attackerId: s.attackerId,
                targetId: s.targetId,
                isPlayerAttacker: s.isPlayerAttacker,
                isPlayerVictim: s.isPlayerVictim,
                variant: mg.variant,
                slashAngle: mg.slash.angleRad,
                slashSide: mg.slash.side,
                slashCenter: mg.slash.zoneCenter,
                pos: { ...s.anchorPos },
              });
            }
          } else {
            const sl = mg.slash;
            sl.phaseTimer -= sessDt;
            const phaseProg = Math.max(0, Math.min(1, 1 - sl.phaseTimer / Math.max(0.04, sl.phaseDuration)));

            if (sl.phase === 'telegraph') {
              const windProgress = beatStart + (beatEnd - beatStart) * (0.14 - phaseProg * 0.11);
              s.progress += (windProgress - s.progress) * Math.min(1, sessDt * 12);

              // Step continuous timing physics for precision-timing variants
              let expiredMiss = false;
              if (mg.variant === 'chrono_ring') {
                mg.ringRadius = Math.max(0, mg.ringRadius - mg.ringSpeed * sessDt);
                if (mg.ringRadius <= Math.max(0.04, mg.ringTargetRadius - 0.115)) {
                  expiredMiss = true;
                }
              } else if (mg.variant === 'dual_arc') {
                mg.needleA = Math.min(1.05, mg.needleA + mg.needleSpeedA * sessDt);
                mg.needleB = Math.max(-0.05, mg.needleB - mg.needleSpeedB * sessDt);
                if (mg.needleA > mg.targetZoneCenter + mg.targetZoneHalfWidth + 0.055) {
                  expiredMiss = true;
                }
              } else if (mg.variant === 'pulse_cadence') {
                mg.needleA += mg.needleDirA * mg.needleSpeedA * sessDt;
                if (mg.needleA >= 0.96) {
                  mg.needleA = 0.96;
                  mg.needleDirA = -1;
                } else if (mg.needleA <= 0.04) {
                  mg.needleA = 0.04;
                  mg.needleDirA = 1;
                }
              }

              if (sl.phaseTimer <= 0 || expiredMiss) {
                sl.phase = 'strike';
                sl.phaseDuration = 0.18;
                sl.phaseTimer = 0.18;
                events.push({
                  type: 'slash_strike',
                  sessionId: s.id,
                  attackerId: s.attackerId,
                  targetId: s.targetId,
                  isPlayerAttacker: s.isPlayerAttacker,
                  isPlayerVictim: s.isPlayerVictim,
                  variant: mg.variant,
                  slashAngle: sl.angleRad,
                  slashSide: sl.side,
                  slashCenter: sl.zoneCenter,
                  pos: { ...s.anchorPos },
                });
              }
            } else if (sl.phase === 'strike') {
              const cleaveProgress = beatStart + (beatEnd - beatStart) * (0.25 + phaseProg * 0.65);
              s.progress += (cleaveProgress - s.progress) * Math.min(1, sessDt * 28);

              if (!sl.hitEvaluated && phaseProg >= 0.1) {
                sl.hitEvaluated = true;

                let evalHit = false;
                let judgment: TimingJudgment = 'MISS';
                if (mg.variant === 'blade_sweep') {
                  const ev = evaluateSlashDodge(
                    mg.cursor,
                    mg.cursorWidth * 0.5,
                    sl.zoneCenter,
                    sl.zoneHalfWidth,
                    sl.secondaryZoneCenter,
                    sl.secondaryZoneHalfWidth
                  );
                  evalHit = ev.hit;
                  judgment = ev.judgment;
                } else if (mg.variant === 'tri_vector') {
                  evalHit = mg.dangerLanes[mg.activeLane];
                  if (evalHit) {
                    judgment = 'MISS';
                  } else {
                    const dangerCount = mg.dangerLanes.filter(Boolean).length;
                    judgment = dangerCount >= 2 ? 'PERFECT' : 'GOOD';
                  }
                } else {
                  // chrono_ring / dual_arc / pulse_cadence timeout = unblocked slash hit!
                  evalHit = true;
                  judgment = 'MISS';
                }

                mg.lastJudgment = judgment;
                mg.judgmentTimer = 0.55;

                if (evalHit) {
                  sl.wasHit = true;
                  mg.missCount += 1;
                  mg.instability = Math.min(1, mg.instability + 0.28);
                  events.push({
                    type: 'minigame_judgment',
                    sessionId: s.id,
                    attackerId: s.attackerId,
                    targetId: s.targetId,
                    isPlayerAttacker: s.isPlayerAttacker,
                    isPlayerVictim: s.isPlayerVictim,
                    variant: mg.variant,
                    judgment: 'MISS',
                    damageAmount: this.computeSlashDamage(s),
                    pos: { ...s.anchorPos },
                  });
                  if (mg.instability >= 1) {
                    mg.active = false;
                    s.state = 'escaped';
                  }
                } else {
                  sl.dodged = true;
                  if (judgment === 'PERFECT') mg.perfectCount += 1;
                  else mg.goodCount += 1;
                  mg.stage += 1;
                  events.push({
                    type: 'minigame_judgment',
                    sessionId: s.id,
                    attackerId: s.attackerId,
                    targetId: s.targetId,
                    isPlayerAttacker: s.isPlayerAttacker,
                    isPlayerVictim: s.isPlayerVictim,
                    variant: mg.variant,
                    judgment,
                    pos: { ...s.anchorPos },
                  });
                }
              }

              if (sl.phaseTimer <= 0 && s.state === 'minigame') {
                if (mg.stage > mg.totalStages) {
                  mg.active = false;
                  s.state = 'finishing';
                } else {
                  sl.phase = 'recover';
                  sl.phaseDuration = 0.16;
                  sl.phaseTimer = 0.16;
                }
              }
            } else if (sl.phase === 'recover') {
              const recProgress = beatStart + (beatEnd - beatStart) * (0.85 - phaseProg * 0.45);
              s.progress += (recProgress - s.progress) * Math.min(1, sessDt * 10);

              if (sl.phaseTimer <= 0) {
                mg.slash = null;
                const nextInterval = sampleFastSlashInterval(this.rng, mg.stage);
                mg.nextSlashTimer = nextInterval;
                mg.nextSlashDuration = nextInterval;
              }
            }
          }
        }
      } else if (s.state === 'finishing') {
        const speedBoost = s.minigame.perfectCount > 0 ? 1.48 : 1.2;
        s.progress = Math.min(1, s.progress + (sessDt * speedBoost) / Math.max(0.4, s.variation.duration));
      } else if (s.state === 'escaped') {
        const pushAngle = normalizeAngle(s.anchorTargetAngle + Math.PI);
        attacker.phys.vel.x = Math.cos(pushAngle) * 230;
        attacker.phys.vel.y = Math.sin(pushAngle) * 230;
        if (targetMech) {
          targetMech.phys.vel.x = Math.cos(s.anchorTargetAngle) * 145;
          targetMech.phys.vel.y = Math.sin(s.anchorTargetAngle) * 145;
        }
        revealStealth(attacker.stealth, 2.0, true);
        this.recoveryTimers.set(attacker.id, 0.75);

        events.push({
          type: 'escaped',
          sessionId: s.id,
          attackerId: s.attackerId,
          targetId: s.targetId,
          isPlayerAttacker: s.isPlayerAttacker,
          isPlayerVictim: s.isPlayerVictim,
          variant: s.minigame.variant,
          pos: { ...s.anchorPos },
          isBossTarget: s.isBossTarget,
        });
        this.releaseSessionAtIndex(i);
        continue;
      }

      // Trigger synchronized keyframe audio & spark bursts
      for (let k = 0; k < s.variation.keyframes.length; k++) {
        const kf = s.variation.keyframes[k];
        if (!s.triggeredCueIndices.has(k) && s.progress >= kf.t) {
          s.triggeredCueIndices.add(k);
          if (kf.audioCue) {
            events.push({
              type: 'audio_cue',
              sessionId: s.id,
              attackerId: s.attackerId,
              targetId: s.targetId,
              isPlayerAttacker: s.isPlayerAttacker,
              isPlayerVictim: s.isPlayerVictim,
              audioCue: kf.audioCue,
              pos: { ...s.anchorPos },
            });
          }
          if (kf.sparkBurst) {
            events.push({
              type: 'spark_burst',
              sessionId: s.id,
              attackerId: s.attackerId,
              targetId: s.targetId,
              isPlayerAttacker: s.isPlayerAttacker,
              isPlayerVictim: s.isPlayerVictim,
              pos: { ...s.anchorPos },
            });
          }
        }
      }

      // Apply smooth interpolated choreography pose directly to actors
      const pose = evaluateTakedownPose(s.variation, s.progress, targetRadius);
      const cosA = Math.cos(s.anchorTargetAngle);
      const sinA = Math.sin(s.anchorTargetAngle);

      const attWorldX = s.anchorPos.x + (pose.attackerOffset.x * cosA - pose.attackerOffset.y * sinA);
      const attWorldY = s.anchorPos.y + (pose.attackerOffset.x * sinA + pose.attackerOffset.y * cosA);
      attacker.phys.pos.x = attWorldX;
      attacker.phys.pos.y = attWorldY;
      attacker.phys.vel.x = 0;
      attacker.phys.vel.y = 0;
      attacker.phys.bodyAngle = normalizeAngle(s.anchorTargetAngle + pose.attackerAngleOffset);
      attacker.phys.aimAngle = attacker.phys.bodyAngle;
      attacker.phys.tiltX = (pose.attackerSquash - 1) * 0.6;
      attacker.legs.update(
        sessDt,
        attacker.phys,
        {
          strideLength: attacker.spec.strideLength,
          stepHeight: attacker.spec.stepHeight,
          stepSpeed: attacker.spec.stepSpeed * 1.35,
          maxSpeed: attacker.stats.maxSpeed,
          footstepWeight: attacker.spec.footstepWeight,
        },
        attacker.health,
        [],
        { dashing: true }
      );

      if (targetMech) {
        const defWorldX = s.anchorPos.x + (pose.defenderOffset.x * cosA - pose.defenderOffset.y * sinA);
        const defWorldY = s.anchorPos.y + (pose.defenderOffset.x * sinA + pose.defenderOffset.y * cosA);
        targetMech.phys.pos.x = defWorldX;
        targetMech.phys.pos.y = defWorldY;
        targetMech.phys.vel.x = 0;
        targetMech.phys.vel.y = 0;
        targetMech.phys.bodyAngle = normalizeAngle(s.anchorTargetAngle + pose.defenderAngleOffset);
        targetMech.phys.tiltX = pose.defenderTilt * 0.28;
        targetMech.phys.bounceZ = -pose.defenderCollapse * 6;
        targetMech.legs.update(
          sessDt,
          targetMech.phys,
          {
            strideLength: targetMech.spec.strideLength,
            stepHeight: targetMech.spec.stepHeight,
            stepSpeed: targetMech.spec.stepSpeed,
            maxSpeed: targetMech.stats.maxSpeed,
            footstepWeight: targetMech.spec.footstepWeight,
          },
          targetMech.health,
          [],
          { anchored: true }
        );
      }

      if (s.state === 'finishing' && s.progress >= 1.0) {
        const perfBonus = s.minigame.perfectCount > 0 ? 1.45 : 1.0;
        events.push({
          type: s.isBossTarget ? 'boss_weakpoint_hit' : 'executed',
          sessionId: s.id,
          attackerId: s.attackerId,
          targetId: s.targetId,
          isPlayerAttacker: s.isPlayerAttacker,
          isPlayerVictim: s.isPlayerVictim,
          variant: s.minigame.variant,
          pos: { ...s.anchorPos },
          bonusDamageMult: perfBonus,
          isBossTarget: s.isBossTarget,
        });
        this.releaseSessionAtIndex(i);
      }
    }

    return events;
  }

  private releaseSessionAtIndex(index: number): void {
    const s = this.sessions[index];
    this.targetLocks.delete(s.targetId);
    this.attackerLocks.delete(s.attackerId);
    this.sessions.splice(index, 1);
  }
}
