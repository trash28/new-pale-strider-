import { MECH_LIST } from './mechRoster';
import { MechActor } from './mech';
import { normalizeAngle, shortestAngleDiff } from './physics';
import { hasLineOfSight, NavGrid } from './pathfinding';
import {
  assignReviveTargets,
  canMechRevive,
  isEligibleForRevive,
  REVIVE_RANGE,
} from './reviveSystem';
import { canDetectUnit } from './stealthSystem';
import { getEligibleReplicationTargets, pickAITransformTarget } from './transformSystem';
import { MapDefinition, MechClassId, Obstacle, SquadOrder, Vec2 } from './types';

export const MAX_SQUAD_SIZE = 5; // 1 Player + up to 4 AI Squadmates = 5 units
export const MAX_AI_WINGMEN = MAX_SQUAD_SIZE - 1;

export const SQUAD_ORDER_LABELS: Record<SquadOrder, string> = {
  follow: 'Follow Me',
  search: 'Search & Sweep',
  full_assault: 'Full Assault',
  hold: 'Hold Position',
  attack_target: 'Attack My Target',
  defend: 'Defend Location',
  spread: 'Spread Out',
  regroup: 'Regroup Tight',
  retreat: 'Tactical Retreat',
  focus: 'Focus Priority Enemy',
};

export interface AllyAIOutput {
  wishX: number;
  wishY: number;
  sprint: boolean;
  triggerDash: boolean;
  firePrimary: boolean;
  fireSecondary: boolean;
  useSpecial: boolean;
  aimAngle: number;
  statusText: string;
  targetEnemyId: string | null;
  revivingTargetId?: string | null;
  wantsStealth?: boolean;
  executionTargetId?: string | null;
  transformTargetId?: MechClassId | null;
}

/**
 * Adaptive 5-unit military chevron/echelon formation offsets relative to player heading:
 * - Slot 0 (Assault / VANGUARD-2): Forward-right vanguard flanker
 * - Slot 1 (Support / AEGIS-3): Close rear-left protective wingman & revive medic
 * - Slot 2 (Recon / SPECTRE-4): Deep overwatch rear-right sniper perch
 * - Slot 3 (Vanguard/Phase / PHANTOM-5): Forward-left rapid interceptor wingman
 */
const FIVE_UNIT_FORMATION_OFFSETS: Vec2[] = [
  { x: 75, y: 120 },
  { x: -90, y: -105 },
  { x: -175, y: 115 },
  { x: 65, y: -135 },
];

export interface SharedEnemyContact {
  enemyId: string;
  pos: Vec2;
  reporterId: string;
  age: number;
}

export class SquadController {
  public currentOrder: SquadOrder = 'follow';
  public orderTargetPos: Vec2 | null = null;
  public focusEnemyId: string | null = null;
  public sharedContact: SharedEnemyContact | null = null;
  private reviveAssignments: Map<string, string> = new Map();
  private lastAssignFrameKey = -1;

  public issueOrder(
    order: SquadOrder,
    allies: MechActor[],
    player: MechActor,
    cursorWorld: Vec2,
    enemies: MechActor[]
  ): string {
    this.currentOrder = order;
    this.sharedContact = null;

    if (order === 'defend') {
      this.orderTargetPos = { ...cursorWorld };
    } else if (order === 'hold') {
      this.orderTargetPos = null;
      for (const a of allies) {
        a.defendPos = { ...a.phys.pos };
      }
    } else if (order === 'attack_target' || order === 'focus') {
      let best: MechActor | null = null;
      let bestDist = 520;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.phys.pos.x - cursorWorld.x, e.phys.pos.y - cursorWorld.y);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      this.focusEnemyId = best ? best.id : null;
      if (!best) {
        this.orderTargetPos = { ...cursorWorld };
      }
    } else {
      this.focusEnemyId = null;
      this.orderTargetPos = null;
    }

    // Cleanly transition every squadmate out of previous order state (prevents stuck AI states)
    for (const a of allies) {
      a.squadOrder = order;
      a.aiPath = [];
      a.aiPathTimer = 0;
      a.searchWaypoint = null;
      a.searchExpandRadius = 560;
      a.lastKnownTargetPos = null;
      if (order === 'search') {
        a.visitedSearchPoints = [{ x: a.phys.pos.x, y: a.phys.pos.y }];
      }
      if (order === 'defend') a.defendPos = { ...cursorWorld };
      if (order === 'retreat') a.defendPos = { x: player.phys.pos.x - 190, y: player.phys.pos.y };
    }

    return SQUAD_ORDER_LABELS[order];
  }

  /**
   * Refreshes coordinated revive assignments once per tick across all allies.
   */
  public refreshSquadCoordination(allies: MechActor[], dt: number): void {
    this.reviveAssignments = assignReviveTargets(allies);
    if (this.sharedContact) {
      this.sharedContact.age += dt;
      if (this.sharedContact.age > 8.0) {
        this.sharedContact = null;
      }
    }
  }

  private pickSectorSearchWaypoint(
    ally: MechActor,
    allies: MechActor[],
    map: MapDefinition
  ): Vec2 {
    const slot = ally.formationSlot;
    const totalSlots = Math.max(4, allies.length);
    const margin = 150;
    const radius = Math.min(Math.max(map.width, map.height) * 0.72, ally.searchExpandRadius ?? 560);

    // Divide 360 degrees into distinct sectors per squadmate so 5 units fan out instead of single-file
    const baseSectorAngle = (slot / totalSlots) * Math.PI * 2 + 0.35;
    const visited = ally.visitedSearchPoints ?? [];

    let bestPt: Vec2 | null = null;
    let bestScore = -1e9;

    for (let attempt = 0; attempt < 10; attempt++) {
      const angOffset = ((attempt % 5) - 2) * 0.38 + (attempt >= 5 ? Math.PI * 0.35 : 0);
      const ang = baseSectorAngle + angOffset;
      const dist = radius * (0.55 + (attempt % 3) * 0.25);
      const cx = Math.max(margin, Math.min(map.width - margin, ally.phys.pos.x + Math.cos(ang) * dist));
      const cy = Math.max(margin, Math.min(map.height - margin, ally.phys.pos.y + Math.sin(ang) * dist));

      // Reject points inside solid obstacles
      let insideObs = false;
      for (let oi = 0; oi < map.obstacles.length; oi++) {
        const obs = map.obstacles[oi];
        if (obs.destroyed) continue;
        if (
          Math.abs(cx - obs.x) < obs.w * 0.5 + ally.spec.radius + 26 &&
          Math.abs(cy - obs.y) < obs.h * 0.5 + ally.spec.radius + 26
        ) {
          insideObs = true;
          break;
        }
      }
      if (insideObs) continue;

      // Score higher when far from already-visited locations and other squadmates' waypoints
      let minVisitedDist = 1400;
      for (let vi = 0; vi < visited.length; vi++) {
        const d = Math.hypot(cx - visited[vi].x, cy - visited[vi].y);
        if (d < minVisitedDist) minVisitedDist = d;
      }

      let minAllyWpDist = 1200;
      for (let ai = 0; ai < allies.length; ai++) {
        const other = allies[ai];
        if (other === ally || !other.alive) continue;
        const wp = other.searchWaypoint ?? other.phys.pos;
        const d = Math.hypot(cx - wp.x, cy - wp.y);
        if (d < minAllyWpDist) minAllyWpDist = d;
      }

      const score = minVisitedDist * 1.15 + minAllyWpDist * 0.95;
      if (score > bestScore) {
        bestScore = score;
        bestPt = { x: cx, y: cy };
      }
    }

    if (!bestPt) {
      // Fallback: pick opposite quadrant of map center
      const fallbackAngle = baseSectorAngle + Math.PI * 0.5;
      bestPt = {
        x: Math.max(margin, Math.min(map.width - margin, map.width * 0.5 + Math.cos(fallbackAngle) * (map.width * 0.3))),
        y: Math.max(margin, Math.min(map.height - margin, map.height * 0.5 + Math.sin(fallbackAngle) * (map.height * 0.3))),
      };
    }

    ally.searchExpandRadius = Math.min(Math.max(map.width, map.height) * 0.78, radius + 160);
    return bestPt;
  }

  public computeAllyAI(
    ally: MechActor,
    player: MechActor,
    allies: MechActor[],
    enemies: MechActor[],
    map: MapDefinition,
    navGrid: NavGrid,
    dt: number,
    bossTarget?: { pos: Vec2; alive: boolean; radius: number } | null,
    artilleryDangerZones?: { x: number; y: number; radius: number }[],
    unlockedUnits?: readonly string[]
  ): AllyAIOutput {
    const out: AllyAIOutput = {
      wishX: 0,
      wishY: 0,
      sprint: false,
      triggerDash: false,
      firePrimary: false,
      fireSecondary: false,
      useSpecial: false,
      aimAngle: ally.phys.aimAngle,
      statusText: 'READY',
      targetEnemyId: null,
      revivingTargetId: null,
    };

    ally.aiTimer -= dt;
    ally.aiPathTimer -= dt;

    // Ensure revive assignments are fresh even if caller invokes computeAllyAI directly in tests
    if (this.lastAssignFrameKey !== allies.length) {
      this.reviveAssignments = assignReviveTargets(allies);
      this.lastAssignFrameKey = allies.length;
    }

    const role =
      ally.squadRole ??
      (ally.classId === 'engineer'
        ? 'support'
        : ally.classId === 'sniper' || ally.classId === 'recon'
        ? 'recon'
        : 'assault');
    const hpRatio = ally.health.chassis / Math.max(1, ally.health.maxChassis);

    // Count how many other allies are already engaging each enemy (for smart target distribution)
    const targetClaimCount = new Map<string, number>();
    for (let i = 0; i < allies.length; i++) {
      const other = allies[i];
      if (other === ally || !other.alive || !other.targetId) continue;
      targetClaimCount.set(other.targetId, (targetClaimCount.get(other.targetId) ?? 0) + 1);
    }

    // 1. Target Detection & Prioritization
    let targetEnemy: MechActor | null = null;
    if ((ally.squadOrder === 'attack_target' || ally.squadOrder === 'focus') && this.focusEnemyId) {
      const candidate = enemies.find((e) => e.id === this.focusEnemyId && e.alive) ?? null;
      if (candidate && canDetectUnit(ally, candidate, map.obstacles, false)) {
        targetEnemy = candidate;
      }
    }

    let bestScore = -1e9;
    let hasLos = false;
    const isFullAssault = ally.squadOrder === 'full_assault';
    const isSearch = ally.squadOrder === 'search';
    const sensorMult = isFullAssault
      ? 3.6 // Full Assault scans wide battlefield independently
      : isSearch
      ? 1.65 // Search uses enhanced tactical vision
      : role === 'recon'
      ? 1.55
      : role === 'assault'
      ? 1.25
      : 1.15;

    if (!targetEnemy) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive || e.isDummy) continue;
        const attachedHostId =
          e.enemyArchetype === 'grappler' ? e.grapplerState?.attachedTargetId ?? null : null;
        const isClingingToSquad = Boolean(
          attachedHostId && (attachedHostId === player.id || allies.some((a) => a.id === attachedHostId && a.alive))
        );
        if (!isClingingToSquad && !canDetectUnit(ally, e, map.obstacles, isSearch)) continue;

        const dAlly = Math.hypot(e.phys.pos.x - ally.phys.pos.x, e.phys.pos.y - ally.phys.pos.y);
        const maxScanRange = isClingingToSquad
          ? Math.max(960, ally.stats.sensorRange * sensorMult)
          : ally.stats.sensorRange * sensorMult;
        if (dAlly > maxScanRange) continue;
        const dPlayer = Math.hypot(e.phys.pos.x - player.phys.pos.x, e.phys.pos.y - player.phys.pos.y);
        const los = hasLineOfSight(ally.phys.pos, e.phys.pos, map.obstacles);

        // During SEARCH, require genuine detection (LOS or close proximity) so allies actually discover enemies
        if (isSearch && !isClingingToSquad && !los && dAlly > 320) continue;

        let score = (los ? 420 : -90) - dAlly * (isFullAssault ? 0.55 : 0.85);

        if (isClingingToSquad) {
          // Highest rescue priority: shoot exposed grappling parasite off teammate or player!
          if (attachedHostId === player.id) {
            score += 2900;
          } else if (attachedHostId !== ally.id) {
            score += 2450;
          } else {
            score += 1150;
          }
          if (los) score += 320;
        } else {
          // Threatening player or high-value Revenant boosts priority
          if (dPlayer < 360) score += 260;
          if (e.targetId === player.id) score += 220;
          if (e.isRevenant) score += 380;

          // Low-health finish bonus
          const eHpRatio = e.health.chassis / Math.max(1, e.health.maxChassis);
          if (eHpRatio < 0.35) score += 120;

          // Smart target distribution across 5 squadmates (avoid all 5 shooting one weak enemy!)
          const claimedBy = targetClaimCount.get(e.id) ?? 0;
          if (claimedBy > 0 && !e.isRevenant) {
            score -= claimedBy * (isFullAssault ? 240 : 140);
          }

          // Archetype & role preferences
          if (role === 'assault' || ally.classId === 'phantom') {
            if (dAlly < 480) score += 190;
            if (e.enemyArchetype === 'heavy' || e.enemyArchetype === 'hunter' || e.enemyArchetype === 'assault') {
              score += 150;
            }
          } else if (role === 'support') {
            if (dPlayer < 420) score += 310;
            if (e.enemyArchetype === 'swarm' || e.enemyArchetype === 'scout') score += 130;
          } else if (role === 'recon' || ally.classId === 'artillery' || ally.classId === 'colossus') {
            if (
              e.enemyArchetype === 'sniper' ||
              e.enemyArchetype === 'rocket_hunter' ||
              e.enemyArchetype === 'sky_breaker' ||
              e.enemyArchetype === 'interceptor'
            ) {
              score += 360;
            }
            if (dAlly > 320 && dAlly < 1100) score += 160;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          targetEnemy = e;
          hasLos = los;
        }
      }
    } else {
      hasLos = hasLineOfSight(ally.phys.pos, targetEnemy.phys.pos, map.obstacles);
    }

    const rescuingClingTarget = Boolean(
      targetEnemy &&
        targetEnemy.enemyArchetype === 'grappler' &&
        targetEnemy.grapplerState?.attachedTargetId &&
        targetEnemy.grapplerState.attachedTargetId !== ally.id
    );

    // Track confirmed target vs last-known position & share contact during SEARCH
    if (targetEnemy) {
      ally.targetId = targetEnemy.id;
      if (hasLos) {
        ally.lastKnownTargetPos = { x: targetEnemy.phys.pos.x, y: targetEnemy.phys.pos.y };
        if (isSearch) {
          this.sharedContact = {
            enemyId: targetEnemy.id,
            pos: { x: targetEnemy.phys.pos.x, y: targetEnemy.phys.pos.y },
            reporterId: ally.id,
            age: 0,
          };
        }
      }
    } else {
      ally.targetId = null;
    }

    out.targetEnemyId = targetEnemy?.id ?? null;

    const aimBoss = !targetEnemy && bossTarget && bossTarget.alive ? bossTarget : null;
    const bossLos = aimBoss ? hasLineOfSight(ally.phys.pos, aimBoss.pos, map.obstacles) : false;

    // 2. Coordinated Revive Priority (ONLY for revive-capable units like PS-07 Engineer)
    let assignedReviveTarget: MechActor | null = null;
    if (canMechRevive(ally)) {
      const assignedId = this.reviveAssignments.get(ally.id) ?? ally.reviveTargetId;
      if (assignedId) {
        const candidate = allies.find((a) => a.id === assignedId && isEligibleForRevive(a)) ?? null;
        if (candidate) {
          assignedReviveTarget = candidate;
        }
      }
    }

    // Support role: scan alive player & squadmates for repair priority (when not reviving)
    let repairTarget: MechActor | null = null;
    if (!assignedReviveTarget && (role === 'support' || ally.classId === 'engineer')) {
      const candidates = [player, ...allies];
      let lowestRatio = 0.86;
      for (const c of candidates) {
        if (!c.alive || c === ally) continue;
        const r = Math.min(
          c.health.chassis / Math.max(1, c.health.maxChassis),
          c.health.leftLegs / Math.max(1, c.health.maxLeftLegs),
          c.health.rightLegs / Math.max(1, c.health.maxRightLegs)
        );
        const weighted = c.isPlayer ? r - 0.08 : r;
        if (weighted < lowestRatio) {
          lowestRatio = weighted;
          repairTarget = c;
        }
      }
    }

    // 3. Movement & Adaptive 5-Unit Formation / Search / Full Assault / Revive
    let moveGoal: Vec2 | null = null;
    const slotOffset = FIVE_UNIT_FORMATION_OFFSETS[ally.formationSlot % FIVE_UNIT_FORMATION_OFFSETS.length];
    const inActiveCombat = Boolean(targetEnemy || aimBoss);
    const spreadScale =
      ally.squadOrder === 'spread'
        ? 1.9
        : ally.squadOrder === 'regroup'
        ? 0.68
        : inActiveCombat
        ? 1.32
        : 1.0;

    const pCos = Math.cos(player.phys.bodyAngle);
    const pSin = Math.sin(player.phys.bodyAngle);
    const formationSpot: Vec2 = {
      x: player.phys.pos.x + (slotOffset.x * pCos - slotOffset.y * pSin) * spreadScale,
      y: player.phys.pos.y + (slotOffset.x * pSin + slotOffset.y * pCos) * spreadScale,
    };

    const distToPlayer = Math.hypot(player.phys.pos.x - ally.phys.pos.x, player.phys.pos.y - ally.phys.pos.y);

    if (assignedReviveTarget) {
      // Navigate to fallen squadmate & channel revive!
      const distRev = Math.hypot(
        assignedReviveTarget.phys.pos.x - ally.phys.pos.x,
        assignedReviveTarget.phys.pos.y - ally.phys.pos.y
      );
      out.statusText = `REVIVING ${assignedReviveTarget.callsign}`;
      if (distRev > REVIVE_RANGE * 0.78) {
        moveGoal = assignedReviveTarget.phys.pos;
        out.sprint = true;
        if (distRev > 280 && ally.dash?.canDash()) out.triggerDash = true;
      } else {
        // In revive range — channel arc-repair revive beam
        const revAim = Math.atan2(
          assignedReviveTarget.phys.pos.y - ally.phys.pos.y,
          assignedReviveTarget.phys.pos.x - ally.phys.pos.x
        );
        ally.phys.aimAngle = revAim;
        out.aimAngle = revAim;
        out.revivingTargetId = assignedReviveTarget.id;
        out.fireSecondary = true;
      }
    } else if (rescuingClingTarget && targetEnemy && ally.squadOrder !== 'hold') {
      const distRes = Math.hypot(
        targetEnemy.phys.pos.x - ally.phys.pos.x,
        targetEnemy.phys.pos.y - ally.phys.pos.y
      );
      out.statusText = 'RESCUING SQUADMATE';
      if (!hasLos || distRes > Math.min(340, ally.primary.spec.range * 0.78)) {
        moveGoal = targetEnemy.phys.pos;
        out.sprint = distRes > 220;
        if (distRes > 360 && ally.dash?.canDash()) out.triggerDash = true;
      } else if (distRes < 115) {
        const backA = Math.atan2(ally.phys.pos.y - targetEnemy.phys.pos.y, ally.phys.pos.x - targetEnemy.phys.pos.x);
        moveGoal = {
          x: ally.phys.pos.x + Math.cos(backA) * 120,
          y: ally.phys.pos.y + Math.sin(backA) * 120,
        };
      }
    } else if (repairTarget && role === 'support' && ally.squadOrder !== 'hold' && ally.squadOrder !== 'search') {
      const distR = Math.hypot(repairTarget.phys.pos.x - ally.phys.pos.x, repairTarget.phys.pos.y - ally.phys.pos.y);
      out.statusText = `REPAIR ${repairTarget.callsign}`;
      if (distR > 155) {
        moveGoal = repairTarget.phys.pos;
        if (distR > 260) out.sprint = true;
      }
      if (distR < 350) {
        const repAim = Math.atan2(repairTarget.phys.pos.y - ally.phys.pos.y, repairTarget.phys.pos.x - ally.phys.pos.x);
        ally.phys.aimAngle = repAim;
        out.aimAngle = repAim;
        out.fireSecondary = true;
        if (distR < 260 && ally.specialCooldownTimer <= 0) {
          out.useSpecial = true;
        }
      }
    } else if (ally.squadOrder === 'hold') {
      out.statusText = 'HOLDING';
      const anchor = ally.defendPos ?? ally.phys.pos;
      if (Math.hypot(anchor.x - ally.phys.pos.x, anchor.y - ally.phys.pos.y) > 45) {
        moveGoal = anchor;
      }
    } else if (ally.squadOrder === 'defend' && ally.defendPos) {
      out.statusText = 'DEFENDING';
      const anchor: Vec2 = {
        x: ally.defendPos.x + slotOffset.x * 0.85,
        y: ally.defendPos.y + slotOffset.y * 0.85,
      };
      if (Math.hypot(anchor.x - ally.phys.pos.x, anchor.y - ally.phys.pos.y) > 55) {
        moveGoal = anchor;
      }
    } else if (ally.squadOrder === 'retreat') {
      out.statusText = 'COVERING RETREAT';
      moveGoal = {
        x: Math.max(140, player.phys.pos.x - 180 + slotOffset.x * 0.55),
        y: Math.max(140, Math.min(map.height - 140, player.phys.pos.y + slotOffset.y)),
      };
      out.sprint = true;
    } else if (isSearch) {
      // ROAM / SEARCH FOR ENEMIES: Coordinated multi-sector sweep
      if (targetEnemy) {
        // Confirmed enemy detected -> switch seamlessly into combat engagement!
        const dE = Math.hypot(targetEnemy.phys.pos.x - ally.phys.pos.x, targetEnemy.phys.pos.y - ally.phys.pos.y);
        const angleToE = Math.atan2(targetEnemy.phys.pos.y - ally.phys.pos.y, targetEnemy.phys.pos.x - ally.phys.pos.x);
        out.statusText = 'CONTACT ENGAGED';
        const idealDist = role === 'recon' ? 460 : 250;
        if (dE > idealDist + 60) {
          moveGoal = targetEnemy.phys.pos;
          out.sprint = dE > 420;
        } else {
          const flankDir = ally.formationSlot % 2 === 0 ? 1 : -1;
          const strafeA = angleToE + flankDir * Math.PI * 0.45;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(strafeA) * 150,
            y: ally.phys.pos.y + Math.sin(strafeA) * 150,
          };
        }
      } else if (ally.lastKnownTargetPos) {
        // Investigate last known enemy position before resuming sweep
        out.statusText = 'INVESTIGATING';
        const dLast = Math.hypot(
          ally.lastKnownTargetPos.x - ally.phys.pos.x,
          ally.lastKnownTargetPos.y - ally.phys.pos.y
        );
        if (dLast < 85) {
          ally.lastKnownTargetPos = null;
        } else {
          moveGoal = ally.lastKnownTargetPos;
          out.sprint = dLast > 260;
        }
      } else if (this.sharedContact && this.sharedContact.age < 6.0) {
        // Respond to squadmate's reported enemy contact
        out.statusText = 'CONVERGING';
        const dShared = Math.hypot(
          this.sharedContact.pos.x - ally.phys.pos.x,
          this.sharedContact.pos.y - ally.phys.pos.y
        );
        if (dShared > 220) {
          moveGoal = this.sharedContact.pos;
          out.sprint = dShared > 380;
        }
      } else {
        // Sector sweep across unvisited areas
        out.statusText = 'SEARCHING SECTOR';
        if (
          !ally.searchWaypoint ||
          Math.hypot(ally.searchWaypoint.x - ally.phys.pos.x, ally.searchWaypoint.y - ally.phys.pos.y) < 95
        ) {
          if (ally.searchWaypoint) {
            ally.visitedSearchPoints = [...(ally.visitedSearchPoints ?? []).slice(-10), ally.searchWaypoint];
          }
          ally.searchWaypoint = this.pickSectorSearchWaypoint(ally, allies, map);
          ally.aiPathTimer = 0;
        }
        moveGoal = ally.searchWaypoint;
        out.sprint = true;
      }
    } else if (isFullAssault) {
      // FULL ASSAULT / INDEPENDENT ATTACK: Unrestricted aggressive battlefield combat
      if (hpRatio < 0.25 && targetEnemy && role !== 'assault') {
        out.statusText = 'TACTICAL EVADE';
        const awayA = Math.atan2(ally.phys.pos.y - targetEnemy.phys.pos.y, ally.phys.pos.x - targetEnemy.phys.pos.x);
        moveGoal = {
          x: ally.phys.pos.x + Math.cos(awayA) * 240,
          y: ally.phys.pos.y + Math.sin(awayA) * 240,
        };
        out.sprint = true;
        if (ally.dash?.canDash()) out.triggerDash = true;
      } else if (targetEnemy) {
        const dE = Math.hypot(targetEnemy.phys.pos.x - ally.phys.pos.x, targetEnemy.phys.pos.y - ally.phys.pos.y);
        const angleToE = Math.atan2(targetEnemy.phys.pos.y - ally.phys.pos.y, targetEnemy.phys.pos.x - ally.phys.pos.x);
        const isLongRangeUnit =
          role === 'recon' || ally.classId === 'sniper' || ally.classId === 'artillery' || ally.classId === 'colossus';
        const idealRange = isLongRangeUnit ? Math.min(620, ally.primary.spec.range * 0.72) : 230;
        const flankDir = ally.formationSlot % 2 === 0 ? 1 : -1;

        out.statusText = isLongRangeUnit ? 'ASSAULT OVERWATCH' : 'FULL ASSAULT';
        if (dE > idealRange + 75) {
          // Aggressive angled pursuit even if player is far away
          const pushA = angleToE + flankDir * 0.28;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(pushA) * 220,
            y: ally.phys.pos.y + Math.sin(pushA) * 220,
          };
          out.sprint = true;
          if (dE > 480 && ally.dash?.canDash()) out.triggerDash = true;
        } else if (isLongRangeUnit && dE < idealRange * 0.52) {
          moveGoal = {
            x: ally.phys.pos.x - Math.cos(angleToE) * 190,
            y: ally.phys.pos.y - Math.sin(angleToE) * 190,
          };
          out.sprint = true;
          if (dE < 220 && ally.dash?.canDash()) out.triggerDash = true;
        } else if (!hasLos) {
          const sideA = angleToE + flankDir * Math.PI * 0.45;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(sideA) * 160,
            y: ally.phys.pos.y + Math.sin(sideA) * 160,
          };
          out.sprint = true;
        } else {
          // Active combat strafe orbit
          const strafeA = angleToE + flankDir * Math.PI * 0.48;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(strafeA) * 155,
            y: ally.phys.pos.y + Math.sin(strafeA) * 155,
          };
        }
      } else if (aimBoss) {
        const dB = Math.hypot(aimBoss.pos.x - ally.phys.pos.x, aimBoss.pos.y - ally.phys.pos.y);
        const aB = Math.atan2(aimBoss.pos.y - ally.phys.pos.y, aimBoss.pos.x - ally.phys.pos.x);
        out.statusText = 'ASSAULTING BOSS';
        const preferredB = role === 'recon' ? 620 : 340;
        if (dB > preferredB + 90) {
          moveGoal = aimBoss.pos;
          out.sprint = true;
        } else if (dB < preferredB - 90) {
          moveGoal = {
            x: ally.phys.pos.x - Math.cos(aB) * 180,
            y: ally.phys.pos.y - Math.sin(aB) * 180,
          };
          out.sprint = true;
        } else {
          const orbA = aB + (ally.formationSlot % 2 === 0 ? 1 : -1) * Math.PI * 0.46;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(orbA) * 170,
            y: ally.phys.pos.y + Math.sin(orbA) * 170,
          };
        }
      } else {
        // No enemies detected yet during Full Assault -> actively hunt across sectors
        out.statusText = 'HUNTING';
        if (
          !ally.searchWaypoint ||
          Math.hypot(ally.searchWaypoint.x - ally.phys.pos.x, ally.searchWaypoint.y - ally.phys.pos.y) < 95
        ) {
          ally.searchWaypoint = this.pickSectorSearchWaypoint(ally, allies, map);
          ally.aiPathTimer = 0;
        }
        moveGoal = ally.searchWaypoint;
        out.sprint = true;
      }
    } else if (hpRatio < 0.34 && targetEnemy && role !== 'assault') {
      // Critically damaged Support/Recon disengages behind player
      out.statusText = 'EVADING';
      const awayA = Math.atan2(ally.phys.pos.y - targetEnemy.phys.pos.y, ally.phys.pos.x - targetEnemy.phys.pos.x);
      moveGoal = {
        x: player.phys.pos.x + Math.cos(awayA) * 140,
        y: player.phys.pos.y + Math.sin(awayA) * 140,
      };
      out.sprint = true;
      if (ally.dash?.canDash()) out.triggerDash = true;
    } else if (targetEnemy && distToPlayer < 680 && ally.squadOrder !== 'regroup') {
      // Standard autonomous role-driven combat positioning
      const dE = Math.hypot(targetEnemy.phys.pos.x - ally.phys.pos.x, targetEnemy.phys.pos.y - ally.phys.pos.y);
      const angleToE = Math.atan2(targetEnemy.phys.pos.y - ally.phys.pos.y, targetEnemy.phys.pos.x - ally.phys.pos.x);

      if (role === 'assault') {
        out.statusText = 'FLANKING';
        const idealDist = 260;
        const flankDir = ally.formationSlot % 2 === 0 ? 1 : -1;
        if (dE > idealDist + 80) {
          const pushA = angleToE + flankDir * 0.42;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(pushA) * 180,
            y: ally.phys.pos.y + Math.sin(pushA) * 180,
          };
          out.sprint = dE > 420;
        } else {
          const strafeA = angleToE + flankDir * Math.PI * 0.5;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(strafeA) * 150,
            y: ally.phys.pos.y + Math.sin(strafeA) * 150,
          };
        }
      } else if (role === 'recon') {
        out.statusText = 'OVERWATCH';
        if (dE < 390) {
          out.statusText = 'REPOSITIONING';
          moveGoal = {
            x: ally.phys.pos.x - Math.cos(angleToE) * 210,
            y: ally.phys.pos.y - Math.sin(angleToE) * 210,
          };
          out.sprint = true;
          if (dE < 220 && ally.dash?.canDash()) out.triggerDash = true;
        } else if (!hasLos) {
          const sideA = angleToE + Math.PI * 0.48;
          moveGoal = {
            x: ally.phys.pos.x + Math.cos(sideA) * 140,
            y: ally.phys.pos.y + Math.sin(sideA) * 140,
          };
        } else {
          moveGoal = formationSpot;
        }
      } else {
        out.statusText = 'ESCORTING';
        moveGoal = formationSpot;
        if (distToPlayer > 240) out.sprint = true;
      }
    } else if (aimBoss && distToPlayer < 750) {
      const dB = Math.hypot(aimBoss.pos.x - ally.phys.pos.x, aimBoss.pos.y - ally.phys.pos.y);
      const aB = Math.atan2(aimBoss.pos.y - ally.phys.pos.y, aimBoss.pos.x - ally.phys.pos.x);
      out.statusText = 'ENGAGING BOSS';
      const preferredB = role === 'recon' ? 680 : role === 'assault' ? 380 : 480;
      if (dB < preferredB - 90) {
        moveGoal = {
          x: ally.phys.pos.x - Math.cos(aB) * 190,
          y: ally.phys.pos.y - Math.sin(aB) * 190,
        };
        out.sprint = true;
        if (dB < 230 && ally.dash?.canDash()) out.triggerDash = true;
      } else {
        const orbitDir = ally.formationSlot % 2 === 0 ? 1 : -1;
        const orbA = aB + orbitDir * Math.PI * 0.45;
        moveGoal = {
          x: ally.phys.pos.x + Math.cos(orbA) * 165,
          y: ally.phys.pos.y + Math.sin(orbA) * 165,
        };
      }
    } else {
      out.statusText = ally.squadOrder === 'spread' ? 'SPREAD' : role === 'recon' ? 'OVERWATCH' : 'FORMATION';
      const dForm = Math.hypot(formationSpot.x - ally.phys.pos.x, formationSpot.y - ally.phys.pos.y);
      if (dForm > 45) {
        moveGoal = formationSpot;
        if (dForm > 260) out.sprint = true;
        if (dForm > 520 && ally.dash?.canDash()) out.triggerDash = true;
      }
    }

    // Navigate toward moveGoal using NavGrid when obstructed
    if (moveGoal) {
      moveGoal.x = Math.max(70, Math.min(map.width - 70, moveGoal.x));
      moveGoal.y = Math.max(70, Math.min(map.height - 70, moveGoal.y));

      if (ally.aiPathTimer <= 0) {
        ally.aiPathTimer = 0.5 + Math.random() * 0.25;
        if (!hasLineOfSight(ally.phys.pos, moveGoal, map.obstacles)) {
          ally.aiPath = navGrid.findPath(ally.phys.pos, moveGoal);
        } else {
          ally.aiPath = [moveGoal];
        }
      }
      const wp = ally.aiPath[0] ?? moveGoal;
      const wdx = wp.x - ally.phys.pos.x;
      const wdy = wp.y - ally.phys.pos.y;
      const wDist = Math.hypot(wdx, wdy);
      if (wDist < 38 && ally.aiPath.length > 1) {
        ally.aiPath.shift();
      }
      if (wDist > 14) {
        out.wishX = wdx / wDist;
        out.wishY = wdy / wDist;
      }
    }

    // Artillery / AoE danger evasion so 5-unit squad scatters out of incoming strikes!
    if (artilleryDangerZones && artilleryDangerZones.length > 0) {
      for (let i = 0; i < artilleryDangerZones.length; i++) {
        const dz = artilleryDangerZones[i];
        const dx = ally.phys.pos.x - dz.x;
        const dy = ally.phys.pos.y - dz.y;
        const d = Math.hypot(dx, dy);
        if (d < dz.radius + ally.spec.radius + 32) {
          const nx = d > 1 ? dx / d : Math.cos(ally.formationSlot * 1.5);
          const ny = d > 1 ? dy / d : Math.sin(ally.formationSlot * 1.5);
          out.wishX += nx * 2.8;
          out.wishY += ny * 2.8;
          out.sprint = true;
          if (ally.dash?.canDash()) out.triggerDash = true;
        }
      }
    }

    // Strong separation across ALL 5 squad units so nobody ever stacks or blocks each other
    const friendlyGroup = [player, ...allies];
    for (let i = 0; i < friendlyGroup.length; i++) {
      const other = friendlyGroup[i];
      if (other === ally || !other.alive) continue;
      const sx = ally.phys.pos.x - other.phys.pos.x;
      const sy = ally.phys.pos.y - other.phys.pos.y;
      const sDist = Math.hypot(sx, sy);
      const minSep = ally.spec.radius + other.spec.radius + (ally.squadOrder === 'spread' ? 125 : 74);
      if (sDist > 0.1 && sDist < minSep) {
        const push = (minSep - sDist) / minSep;
        out.wishX += (sx / sDist) * push * 2.25;
        out.wishY += (sy / sDist) * push * 2.25;
      }
    }

    // Obstacle avoidance feeler
    for (let i = 0; i < map.obstacles.length; i++) {
      const obs: Obstacle = map.obstacles[i];
      if (obs.destroyed) continue;
      const ox = ally.phys.pos.x - obs.x;
      const oy = ally.phys.pos.y - obs.y;
      const safeDist = Math.max(obs.w, obs.h) * 0.5 + ally.spec.radius + 26;
      const oDist = Math.hypot(ox, oy);
      if (oDist > 0.1 && oDist < safeDist) {
        const push = (safeDist - oDist) / safeDist;
        out.wishX += (ox / oDist) * push * 1.9;
        out.wishY += (oy / oDist) * push * 1.9;
      }
    }

    const wMag = Math.hypot(out.wishX, out.wishY);
    if (wMag > 1) {
      out.wishX /= wMag;
      out.wishY /= wMag;
    }

    // 4. Aim & fire at targetEnemy or Boss (unless currently firing repair/revive beam)
    if (!out.fireSecondary && targetEnemy) {
      const distE = Math.hypot(targetEnemy.phys.pos.x - ally.phys.pos.x, targetEnemy.phys.pos.y - ally.phys.pos.y);
      const leadT = Math.min(0.45, distE / Math.max(400, ally.primary.spec.projectileSpeed));
      const tx = targetEnemy.phys.pos.x + targetEnemy.phys.vel.x * leadT;
      const ty = targetEnemy.phys.pos.y + targetEnemy.phys.vel.y * leadT;
      const desiredAim = Math.atan2(ty - ally.phys.pos.y, tx - ally.phys.pos.x);
      const diff = shortestAngleDiff(ally.phys.aimAngle, desiredAim);
      const aimTurnRate = rescuingClingTarget ? 7.8 : role === 'recon' ? 6.2 : 5.6;
      ally.phys.aimAngle = normalizeAngle(
        ally.phys.aimAngle + Math.max(-aimTurnRate * dt, Math.min(aimTurnRate * dt, diff))
      );
      out.aimAngle = ally.phys.aimAngle;

      const fireTol = rescuingClingTarget ? 0.34 : 0.26;
      if (hasLos && Math.abs(diff) < fireTol && distE <= ally.primary.spec.range * 1.05) {
        out.firePrimary = true;
        if (
          !rescuingClingTarget &&
          (role === 'assault' ||
            ally.classId === 'standard' ||
            ally.classId === 'heavy' ||
            ally.classId === 'phantom' ||
            ally.classId === 'assassin') &&
          distE > 170 &&
          ally.secondary.cooldown <= 0
        ) {
          out.fireSecondary = true;
        }
      }
      if (ally.classId === 'assassin') {
        if (distE > 170 && ally.stealth?.supported && (ally.stealth.energy > 34 || ally.stealth.active)) {
          out.wantsStealth = true;
        }
        const execRange = ally.spec.specialAbility.kind === 'assassin_crimson_tempest' ? 580 : 420;
        if (ally.specialCooldownTimer <= 0 && distE <= execRange && !targetEnemy.downed) {
          out.executionTargetId = targetEnemy.id;
        } else if (
          ally.spec.specialAbility.kind === 'assassin_crimson_tempest' &&
          ally.specialCooldownTimer <= 0 &&
          distE <= 260
        ) {
          out.useSpecial = true;
        }
      } else if (
        ally.spec.specialAbility.kind !== 'total_replication' &&
        ally.specialCooldownTimer <= 0 &&
        (hpRatio < 0.65 ||
          (ally.classId === 'phantom' && inActiveCombat) ||
          (ally.isProteusOrigin && inActiveCombat && distE < 680) ||
          (role === 'assault' && distE < 340))
      ) {
        out.useSpecial = true;
      }
    } else if (!out.fireSecondary && aimBoss) {
      const distB = Math.hypot(aimBoss.pos.x - ally.phys.pos.x, aimBoss.pos.y - ally.phys.pos.y);
      const desiredAim = Math.atan2(aimBoss.pos.y - ally.phys.pos.y, aimBoss.pos.x - ally.phys.pos.x);
      const diff = shortestAngleDiff(ally.phys.aimAngle, desiredAim);
      ally.phys.aimAngle = normalizeAngle(ally.phys.aimAngle + Math.max(-5.5 * dt, Math.min(5.5 * dt, diff)));
      out.aimAngle = ally.phys.aimAngle;
      out.statusText = isFullAssault ? 'ASSAULTING BOSS' : 'ENGAGING BOSS';

      if (bossLos && Math.abs(diff) < 0.3 && distB <= ally.primary.spec.range + aimBoss.radius + 80) {
        out.firePrimary = true;
        if (distB > 200 && ally.secondary.cooldown <= 0) {
          out.fireSecondary = true;
        }
      }
      if (
        ally.specialCooldownTimer <= 0 &&
        (ally.classId === 'phantom' || (ally.isProteusOrigin && ally.spec.specialAbility.kind !== 'total_replication'))
      ) {
        out.useSpecial = true;
      }
    } else if (!out.fireSecondary && Math.hypot(ally.phys.vel.x, ally.phys.vel.y) > 20) {
      const moveAngle = Math.atan2(ally.phys.vel.y, ally.phys.vel.x);
      const diff = shortestAngleDiff(ally.phys.aimAngle, moveAngle);
      ally.phys.aimAngle = normalizeAngle(ally.phys.aimAngle + Math.max(-3.8 * dt, Math.min(3.8 * dt, diff)));
      out.aimAngle = ally.phys.aimAngle;
    }

    // Tactical Total Replication evaluation for AI-controlled TX-10 Proteus squadmates
    if (ally.isProteusOrigin && !ally.transform?.active && ally.transformCooldownTimer <= 0) {
      const downedAlliesCount = allies.filter((a) => isEligibleForRevive(a)).length;
      if (inActiveCombat || downedAlliesCount > 0 || Boolean(aimBoss)) {
        const squadList = [player, ...allies];
        const alliesNeedRepair = squadList.filter(
          (u) => u.alive && u.health.chassis + u.health.armor < (u.health.maxChassis + u.health.maxArmor) * 0.65
        ).length;
        const cloakedCount = enemies.filter((e) => e.alive && e.stealth?.active).length;
        const airborneCount = enemies.filter((e) => e.alive && (e.flight?.altitude ?? 0) > 15).length;
        const heavyThreat =
          Boolean(aimBoss) ||
          enemies.some((e) => e.alive && (e.enemyArchetype === 'heavy' || e.isRevenant));
        const allowedList = unlockedUnits ?? MECH_LIST.map((m) => m.id);
        const eligible = getEligibleReplicationTargets(MECH_LIST, allowedList, ally.classId);
        const picked = pickAITransformTarget({
          eligibleTargets: eligible,
          currentClassId: ally.classId,
          alliesNeedRepairCount: alliesNeedRepair,
          downedAlliesCount,
          cloakedEnemyCount: cloakedCount,
          airborneEnemyCount: airborneCount,
          heavyOrBossThreat: heavyThreat,
          enemyCount: enemies.filter((e) => e.alive && !e.isDummy).length,
        });
        if (picked) {
          out.transformTargetId = picked;
        }
      }
    }

    return out;
  }
}
