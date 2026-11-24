import { ThunderheadBoss } from './thunderheadBoss';
import { BossComponentId } from './bossTypes';
import { MechActor } from './mech';
import { ComponentId, EnemyArchetype, Vec2 } from './types';

export interface MechPrecisionHitResult {
  component: ComponentId;
  zoneLabel: string;
  damageMultiplier: number;
  componentDamageMult: number;
  isWeakPoint: boolean;
  isCritical: boolean;
}

export interface HoverPrecisionTargetInfo {
  targetType: 'enemy' | 'boss';
  unitId: string;
  componentId: string;
  zoneLabel: string;
  hpRatio: number;
  destroyed: boolean;
  isExposed: boolean;
  isCritical: boolean;
  x: number;
  y: number;
}

export interface BossVulnerabilityEvaluation {
  component: BossComponentId;
  zoneLabel: string;
  exposed: boolean;
  damageMultiplier: number;
  componentDamageMultiplier: number;
  staggerOnBreak: boolean;
  reason: string;
}

function getSubsystemLabel(component: ComponentId, isFlying: boolean): string {
  switch (component) {
    case 'weapons':
      return isFlying ? 'WING HARDPOINT' : 'WEAPON MOUNT';
    case 'sensors':
      return isFlying ? 'NOSE RADAR' : 'OPTICS ARRAY';
    case 'engine':
      return isFlying ? 'JET THRUSTER' : 'REAR ENGINE';
    case 'leftLegs':
      return isFlying ? 'PORT WING' : 'PORT STRUTS';
    case 'rightLegs':
      return isFlying ? 'STBD WING' : 'STBD STRUTS';
    case 'armor':
      return 'ARMOR PLATE';
    case 'chassis':
    default:
      return 'HULL';
  }
}

/**
 * Resolves exact projectile hit coordinates against a mech's archetype-specific
 * mechanical silhouette (weapon mounts, sensors, rear engine, port/starboard legs or wings).
 */
export function resolveMechPrecisionHit(
  mech: Pick<MechActor, 'phys' | 'spec' | 'enemyArchetype' | 'flight'>,
  hitX: number,
  hitY: number,
  _prevX?: number,
  _prevY?: number
): MechPrecisionHitResult {
  const dx = hitX - mech.phys.pos.x;
  const dy = hitY - mech.phys.pos.y;
  const r = Math.max(12, mech.spec.radius);
  const isFlying = Boolean(mech.flight?.isAirborne || mech.spec.canFly);
  const arch: EnemyArchetype | undefined = mech.enemyArchetype;

  // Transform world impact into body-local coordinates
  const cb = Math.cos(-mech.phys.bodyAngle);
  const sb = Math.sin(-mech.phys.bodyAngle);
  const lx = dx * cb - dy * sb;
  const ly = dx * sb + dy * cb;

  // Also check offset against aiming turret orientation for turret-mounted weapons & optics
  const ca = Math.cos(-mech.phys.aimAngle);
  const sa = Math.sin(-mech.phys.aimAngle);
  const ax = dx * ca - dy * sa;
  const ay = dx * sa + dy * ca;

  // 1. Rear engine / thruster reactor core weakpoint
  if (lx < -r * 0.34 && Math.abs(ly) < r * (isFlying ? 0.52 : 0.62)) {
    return {
      component: 'engine',
      zoneLabel: getSubsystemLabel('engine', isFlying),
      damageMultiplier: isFlying ? 1.32 : 1.25,
      componentDamageMult: 1.45,
      isWeakPoint: true,
      isCritical: true,
    };
  }

  // 2. Forward nose optics / dorsal sensor pod (precise center-front line along aim vector)
  const sensorTightness = arch === 'sniper' || arch === 'hunter' ? 0.32 : 0.25;
  if (ax > r * 0.28 && Math.abs(ay) <= r * sensorTightness) {
    return {
      component: 'sensors',
      zoneLabel: getSubsystemLabel('sensors', isFlying),
      damageMultiplier: 1.22,
      componentDamageMult: 1.45,
      isWeakPoint: true,
      isCritical: true,
    };
  }

  // 3. Primary / secondary weapon mounts (flanking aim turret or heavy shoulder pod)
  const isMissileCarrier = arch === 'heavy' || arch === 'rocket_hunter' || arch === 'sky_breaker';
  if (
    ax > r * 0.08 &&
    Math.abs(ay) > r * sensorTightness &&
    Math.abs(ay) <= r * (isMissileCarrier ? 0.86 : 0.72)
  ) {
    return {
      component: 'weapons',
      zoneLabel: isMissileCarrier ? 'MISSILE POD' : getSubsystemLabel('weapons', isFlying),
      damageMultiplier: isMissileCarrier ? 1.2 : 1.15,
      componentDamageMult: 1.42,
      isWeakPoint: true,
      isCritical: false,
    };
  }

  // 4. Outer port / starboard legs or aerodynamic wings
  if (ly < -r * 0.42) {
    return {
      component: 'leftLegs',
      zoneLabel: getSubsystemLabel('leftLegs', isFlying),
      damageMultiplier: 1.05,
      componentDamageMult: 1.35,
      isWeakPoint: false,
      isCritical: false,
    };
  }
  if (ly > r * 0.42) {
    return {
      component: 'rightLegs',
      zoneLabel: getSubsystemLabel('rightLegs', isFlying),
      damageMultiplier: 1.05,
      componentDamageMult: 1.35,
      isWeakPoint: false,
      isCritical: false,
    };
  }

  // 5. Fallback forward turret check for dead-on shots slightly inside body radius
  if (ax > r * 0.55) {
    return {
      component: 'weapons',
      zoneLabel: getSubsystemLabel('weapons', isFlying),
      damageMultiplier: 1.1,
      componentDamageMult: 1.25,
      isWeakPoint: false,
      isCritical: false,
    };
  }

  return {
    component: 'chassis',
    zoneLabel: 'HULL',
    damageMultiplier: 1.0,
    componentDamageMult: 1.0,
    isWeakPoint: false,
    isCritical: false,
  };
}

/**
 * Evaluates Thunderhead boss attack-state vulnerability windows so timing precision
 * shots against open ammo vaults, glowing mortar breeches, active radar dishes,
 * extended pursuit legs, or vented rear cores yields real tactical disruption.
 */
export function evaluateBossVulnerabilityWindow(
  boss: Pick<
    ThunderheadBoss,
    'aiState' | 'posture' | 'hatchOpenAmount' | 'ultimateActive' | 'components'
  > & { auxExposedTimer?: number },
  component: BossComponentId,
  opts?: { isRearWeakPoint?: boolean; isFrontArmor?: boolean }
): BossVulnerabilityEvaluation {
  const compState = boss.components[component];
  const label = compState?.label?.toUpperCase() ?? component.toUpperCase();

  if (component === 'ammoBays') {
    const exposed =
      boss.aiState === 'loading' ||
      boss.aiState === 'warning' ||
      boss.hatchOpenAmount > 0.16;
    return {
      component,
      zoneLabel: exposed ? 'AMMO BAY [OPEN]' : label,
      exposed,
      damageMultiplier: exposed ? 1.52 : 1.08,
      componentDamageMultiplier: exposed ? 1.75 : 1.15,
      staggerOnBreak: true,
      reason: exposed ? 'Ordnance hatches open during shell load' : 'Closed armor shutters',
    };
  }

  if (component === 'mortar') {
    const exposed =
      boss.aiState === 'warning' ||
      boss.aiState === 'firing' ||
      boss.ultimateActive;
    return {
      component,
      zoneLabel: exposed ? 'MORTAR BREECH [VENT]' : label,
      exposed,
      damageMultiplier: exposed ? 1.38 : 1.0,
      componentDamageMultiplier: exposed ? 1.62 : 1.0,
      staggerOnBreak: true,
      reason: exposed ? 'Hot nuclear breech exposed before launch' : 'Stabilized mortar shield',
    };
  }

  if (component === 'powerCore') {
    const firingHeat = boss.aiState === 'firing' || boss.aiState === 'reloading' || boss.ultimateActive;
    const exposed = Boolean(opts?.isRearWeakPoint) || firingHeat;
    return {
      component,
      zoneLabel: firingHeat ? 'REAR CORE [OVERHEAT]' : 'REAR CORE',
      exposed,
      damageMultiplier: firingHeat ? 1.35 : 1.15,
      componentDamageMultiplier: firingHeat ? 1.55 : 1.25,
      staggerOnBreak: true,
      reason: firingHeat ? 'Thermal louvers wide open after salvo' : 'Rear reactor weakpoint',
    };
  }

  if (component === 'sensors') {
    const exposed = boss.aiState === 'acquiring' || boss.aiState === 'bracing';
    return {
      component,
      zoneLabel: exposed ? 'RADAR [LOCKING]' : label,
      exposed,
      damageMultiplier: exposed ? 1.28 : 1.0,
      componentDamageMultiplier: exposed ? 1.5 : 1.0,
      staggerOnBreak: true,
      reason: exposed ? 'Radar array active on target lock' : 'Retracted dish housing',
    };
  }

  if (component === 'leftLegs' || component === 'rightLegs') {
    const exposed =
      boss.posture === 'rapid_move' ||
      boss.posture === 'full_pursuit' ||
      boss.posture === 'high_speed_turn';
    return {
      component,
      zoneLabel: exposed ? `${label} [EXTENDED]` : label,
      exposed,
      damageMultiplier: exposed ? 1.22 : 1.0,
      componentDamageMultiplier: exposed ? 1.48 : 1.0,
      staggerOnBreak: true,
      reason: exposed ? 'Hydraulic struts under peak sprint load' : 'Braced leg armor',
    };
  }

  if (component === 'auxWeapons') {
    const exposed = (boss.auxExposedTimer ?? 0) > 0;
    return {
      component,
      zoneLabel: exposed ? 'CLOSE DEF [COOLING]' : label,
      exposed,
      damageMultiplier: exposed ? 1.25 : 1.0,
      componentDamageMultiplier: exposed ? 1.4 : 1.0,
      staggerOnBreak: false,
      reason: exposed ? 'Sponson gun vents cooling after burst' : 'Armored turret cupola',
    };
  }

  return {
    component,
    zoneLabel: label,
    exposed: false,
    damageMultiplier: 1.0,
    componentDamageMultiplier: 1.0,
    staggerOnBreak: false,
    reason: 'Standard hull plating',
  };
}

/**
 * Computes subtle reticle weakpoint callout telemetry when the player hovers
 * directly over an enemy mech or Thunderhead boss subsystem.
 */
export function inspectHoverPrecisionTarget(
  cursorWorld: Vec2,
  enemies: MechActor[],
  boss: ThunderheadBoss | null
): HoverPrecisionTargetInfo | null {
  // Check boss first if cursor lies inside boss footprint
  if (boss && boss.alive && !boss.destroying) {
    const dxB = cursorWorld.x - boss.phys.pos.x;
    const dyB = cursorWorld.y - boss.phys.pos.y;
    if (Math.hypot(dxB, dyB) <= boss.spec.radius * 1.18) {
      const hit = boss.resolveHitComponent(cursorWorld.x, cursorWorld.y);
      const evalInfo = evaluateBossVulnerabilityWindow(boss, hit.component, hit);
      const cState = boss.components[hit.component];
      return {
        targetType: 'boss',
        unitId: boss.id,
        componentId: hit.component,
        zoneLabel: evalInfo.zoneLabel,
        hpRatio: cState.hp / Math.max(1, cState.maxHp),
        destroyed: cState.destroyed,
        isExposed: evalInfo.exposed,
        isCritical: hit.isRearWeakPoint || hit.component === 'ammoBays' || hit.component === 'powerCore',
        x: cursorWorld.x,
        y: cursorWorld.y,
      };
    }
  }

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || !e.detected) continue;
    const ey = e.phys.pos.y - (e.flight?.altitude ?? 0) * 0.52;
    const d = Math.hypot(e.phys.pos.x - cursorWorld.x, ey - cursorWorld.y);
    if (d <= e.spec.radius + 14) {
      // Map screen-hovered Y back to body plane for accurate component lookup
      const hit = resolveMechPrecisionHit(e, cursorWorld.x, cursorWorld.y + (e.flight?.altitude ?? 0) * 0.52);
      if (hit.component === 'chassis') return null;
      const comp = hit.component;
      const maxKey =
        comp === 'weapons'
          ? 'maxWeapons'
          : comp === 'sensors'
          ? 'maxSensors'
          : comp === 'engine'
          ? 'maxEngine'
          : comp === 'leftLegs'
          ? 'maxLeftLegs'
          : 'maxRightLegs';
      const curHp = e.health[comp] ?? e.health.chassis;
      const maxHp = Math.max(1, e.health[maxKey] ?? e.health.maxChassis);
      return {
        targetType: 'enemy',
        unitId: e.id,
        componentId: comp,
        zoneLabel: hit.zoneLabel,
        hpRatio: curHp / maxHp,
        destroyed: curHp <= maxHp * 0.08,
        isExposed: hit.isWeakPoint,
        isCritical: hit.isCritical,
        x: cursorWorld.x,
        y: cursorWorld.y,
      };
    }
  }

  return null;
}
