import type { MechActor } from './mech';
import type { MechClassId } from './types';

/**
 * Only units originally designed with repair/revival engineering hardware can revive fallen teammates.
 * Currently PS-07 Engineer Support Walker (`engineer`).
 */
export const REVIVE_CAPABLE_CLASSES: readonly MechClassId[] = ['engineer'];

export const REVIVE_RANGE = 135;
export const REVIVE_CHANNEL_DURATION = 3.0; // seconds to restore a downed ally
export const REVIVE_COOLDOWN = 10.0; // seconds per reviver after completing a revive
export const REVIVE_UNREACHABLE_TIMEOUT = 9.0; // seconds without progress before another reviver takes over

export function canMechRevive(mech: Pick<MechActor, 'classId' | 'team' | 'alive'>): boolean {
  return mech.alive && mech.team === 'player' && REVIVE_CAPABLE_CLASSES.includes(mech.classId);
}

export function isEligibleForRevive(ally: Pick<MechActor, 'team' | 'alive' | 'downed' | 'isPlayer'>): boolean {
  return ally.team === 'player' && !ally.isPlayer && !ally.alive && Boolean(ally.downed);
}

/**
 * Coordinates revive assignments across ALL revive-capable units in a 5-unit squad.
 * - Ensures only ONE revive-capable unit is assigned per downed teammate (prevents duplication).
 * - Picks the closest eligible reviver whose cooldown is ready.
 * - If an assigned reviver dies, becomes busy/unreachable, or times out, another eligible reviver takes over.
 */
export function assignReviveTargets(allies: MechActor[]): Map<string, string> {
  // Map<reviverId, downedTargetId>
  const assignments = new Map<string, string>();
  const claimedTargets = new Set<string>();

  const downedAllies = allies.filter((a) => isEligibleForRevive(a));
  if (downedAllies.length === 0) {
    for (const a of allies) {
      a.reviveTargetId = null;
      a.reviveStuckTimer = 0;
    }
    return assignments;
  }

  const revivers = allies.filter((a) => canMechRevive(a) && (a.reviveCooldownTimer ?? 0) <= 0);
  if (revivers.length === 0) return assignments;

  // Keep valid existing assignments first (unless stuck/unreachable)
  for (const r of revivers) {
    if (!r.reviveTargetId) continue;
    const tgt = downedAllies.find((d) => d.id === r.reviveTargetId);
    if (tgt && !claimedTargets.has(tgt.id) && (r.reviveStuckTimer ?? 0) < REVIVE_UNREACHABLE_TIMEOUT) {
      assignments.set(r.id, tgt.id);
      claimedTargets.add(tgt.id);
    } else {
      r.reviveTargetId = null;
      r.reviveStuckTimer = 0;
    }
  }

  // Assign remaining unclaimed downed teammates to the closest available reviver
  for (const downed of downedAllies) {
    if (claimedTargets.has(downed.id)) continue;
    let bestReviver: MechActor | null = null;
    let bestDist = Infinity;

    for (const r of revivers) {
      if (assignments.has(r.id)) continue;
      // Skip a reviver that just timed out on this exact target if another exists
      if (r.lastFailedReviveTargetId === downed.id && revivers.length > 1) continue;
      const d = Math.hypot(downed.phys.pos.x - r.phys.pos.x, downed.phys.pos.y - r.phys.pos.y);
      if (d < bestDist) {
        bestDist = d;
        bestReviver = r;
      }
    }

    if (bestReviver) {
      bestReviver.reviveTargetId = downed.id;
      bestReviver.reviveStuckTimer = 0;
      assignments.set(bestReviver.id, downed.id);
      claimedTargets.add(downed.id);
    }
  }

  return assignments;
}

/**
 * Restores a downed friendly squadmate to active combat state cleanly.
 */
export function completeSquadmateRevive(reviver: MechActor, target: MechActor): boolean {
  if (!canMechRevive(reviver) || !isEligibleForRevive(target)) return false;
  target.alive = true;
  target.downed = false;
  target.koTimer = 0;
  target.reviveProgress = 0;
  target.hitFlashTimer = 0.15;
  target.health.chassis = Math.round(target.health.maxChassis * 0.6);
  target.health.armor = Math.round(target.health.maxArmor * 0.55);
  target.health.leftLegs = Math.round(target.health.maxLeftLegs * 0.7);
  target.health.rightLegs = Math.round(target.health.maxRightLegs * 0.7);
  target.health.engine = Math.round(target.health.maxEngine * 0.75);
  target.health.sensors = Math.round(target.health.maxSensors * 0.75);
  target.health.weapons = Math.round(target.health.maxWeapons * 0.75);
  target.phys.vel.x = 0;
  target.phys.vel.y = 0;

  reviver.reviveCooldownTimer = REVIVE_COOLDOWN;
  reviver.reviveTargetId = null;
  reviver.reviveStuckTimer = 0;
  reviver.lastFailedReviveTargetId = null;
  return true;
}
