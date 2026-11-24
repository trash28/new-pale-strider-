import { ComponentHealth, ComponentId } from './types';

export type DamageImmunityReason = 'none' | 'god_mode' | 'teleport_dash' | 'aegis_armor';

/**
 * Centralized absolute damage-immunity gate enforced across ALL damage types:
 * bullets, heavy shells, homing/unguided missiles, explosions, artillery,
 * AoE hazards, EMP blasts, and melee/special enemy abilities.
 */
export function checkUnitDamageImmunity(params: {
  trainingGodMode?: boolean;
  dashInvulnerable?: boolean;
  aegisArmorActive?: boolean;
}): DamageImmunityReason {
  if (params.trainingGodMode) return 'god_mode';
  if (params.dashInvulnerable) return 'teleport_dash';
  if (params.aegisArmorActive) return 'aegis_armor';
  return 'none';
}

export interface DamageHitResult {
  armorAbsorbed: number;
  chassisDamage: number;
  componentDamaged: ComponentId;
  componentDamageAmount: number;
  destroyed: boolean;
  limbCrippled: boolean;
}

export function createComponentHealth(
  chassis: number,
  armor: number,
  legDurability: number
): ComponentHealth {
  return {
    chassis,
    maxChassis: chassis,
    armor,
    maxArmor: armor,
    engine: Math.round(chassis * 0.75),
    maxEngine: Math.round(chassis * 0.75),
    sensors: Math.round(chassis * 0.55),
    maxSensors: Math.round(chassis * 0.55),
    weapons: Math.round(chassis * 0.65),
    maxWeapons: Math.round(chassis * 0.65),
    leftLegs: legDurability,
    maxLeftLegs: legDurability,
    rightLegs: legDurability,
    maxRightLegs: legDurability,
  };
}

/**
 * Resolves incoming weapon damage against armor plating first, then routes residual/piercing
 * damage to chassis and specific hit components based on relative hit angle and weapon type.
 */
export function applyComponentDamage(
  health: ComponentHealth,
  rawDamage: number,
  relHitAngle: number, // hit angle relative to mech bodyAngle (-PI..PI)
  options?: {
    piercing?: boolean;
    splash?: boolean;
    emp?: boolean;
    damageReduction?: number; // 0..0.85
    rng?: number; // deterministic 0..1 for testing
    forcedComponent?: ComponentId; // Precision spatial component hit override
    componentDamageMult?: number;
  }
): DamageHitResult {
  const reduction = options?.damageReduction ?? 0;
  const dmg = Math.max(0, rawDamage * (1 - reduction));
  const piercing = Boolean(options?.piercing);
  const splash = Boolean(options?.splash);
  const emp = Boolean(options?.emp);
  const roll = options?.rng ?? Math.random();
  const compMult = options?.componentDamageMult ?? 1.0;

  let armorAbsorbed = 0;
  let hullLeak = dmg;

  if (emp) {
    // EMP targets sensors & weapons primarily, minimal hull damage
    const sDmg = dmg * 0.85 * compMult;
    const wDmg = dmg * 0.45 * compMult;
    health.sensors = Math.max(0, health.sensors - sDmg);
    health.weapons = Math.max(0, health.weapons - wDmg);
    health.chassis = Math.max(0, health.chassis - dmg * 0.15);
    return {
      armorAbsorbed: 0,
      chassisDamage: dmg * 0.15,
      componentDamaged: options?.forcedComponent ?? 'sensors',
      componentDamageAmount: sDmg,
      destroyed: health.chassis <= 0,
      limbCrippled: false,
    };
  }

  if (health.armor > 0) {
    const absorbRatio = piercing ? 0.35 : 0.78;
    armorAbsorbed = Math.min(health.armor, dmg * absorbRatio);
    health.armor = Math.max(0, health.armor - armorAbsorbed);
    hullLeak = Math.max(dmg * (piercing ? 0.55 : 0.22), dmg - armorAbsorbed);
  }

  health.chassis = Math.max(0, health.chassis - hullLeak);

  // Determine which subsystem takes directional/precision/splash hit
  let targetComp: ComponentId = options?.forcedComponent ?? 'chassis';
  let compDmg = hullLeak * 0.7 * compMult;

  if (splash) {
    // Explosions rattle both left and right legs
    const legHit = dmg * 0.42;
    health.leftLegs = Math.max(0, health.leftLegs - legHit);
    health.rightLegs = Math.max(0, health.rightLegs - legHit);
    targetComp = options?.forcedComponent ?? (roll < 0.5 ? 'leftLegs' : 'rightLegs');
    compDmg = legHit;
  } else if (options?.forcedComponent && options.forcedComponent !== 'chassis' && options.forcedComponent !== 'armor') {
    const fc = options.forcedComponent;
    const scale = fc === 'engine' ? 1.15 : fc === 'sensors' || fc === 'weapons' ? 1.05 : 0.95;
    compDmg = Math.max(dmg * 0.42, hullLeak * scale) * compMult;
    health[fc] = Math.max(0, health[fc] - compDmg);
  } else {
    const absAngle = Math.abs(relHitAngle);
    if (absAngle > Math.PI * 0.72) {
      // Rear shot -> hits engine!
      targetComp = 'engine';
      compDmg = hullLeak * 0.95 * compMult;
      health.engine = Math.max(0, health.engine - compDmg);
    } else if (relHitAngle < -0.45 && relHitAngle > -2.35 && roll < 0.68) {
      // Left flank hit -> left legs
      targetComp = 'leftLegs';
      compDmg = hullLeak * 0.85 * compMult;
      health.leftLegs = Math.max(0, health.leftLegs - compDmg);
    } else if (relHitAngle > 0.45 && relHitAngle < 2.35 && roll < 0.68) {
      // Right flank hit -> right legs
      targetComp = 'rightLegs';
      compDmg = hullLeak * 0.85 * compMult;
      health.rightLegs = Math.max(0, health.rightLegs - compDmg);
    } else if (absAngle < 0.65 && roll < 0.55) {
      // Front turret hit -> weapons or sensors
      targetComp = roll < 0.28 ? 'sensors' : 'weapons';
      compDmg = hullLeak * 0.75 * compMult;
      health[targetComp] = Math.max(0, health[targetComp] - compDmg);
    }
  }

  const limbCrippled =
    health.leftLegs <= health.maxLeftLegs * 0.2 || health.rightLegs <= health.maxRightLegs * 0.2;

  return {
    armorAbsorbed,
    chassisDamage: hullLeak,
    componentDamaged: targetComp,
    componentDamageAmount: compDmg,
    destroyed: health.chassis <= 0,
    limbCrippled,
  };
}

export function repairComponents(health: ComponentHealth, amount: number): void {
  health.chassis = Math.min(health.maxChassis, health.chassis + amount);
  health.armor = Math.min(health.maxArmor, health.armor + amount * 0.7);
  health.leftLegs = Math.min(health.maxLeftLegs, health.leftLegs + amount * 0.9);
  health.rightLegs = Math.min(health.maxRightLegs, health.rightLegs + amount * 0.9);
  health.engine = Math.min(health.maxEngine, health.engine + amount * 0.8);
  health.sensors = Math.min(health.maxSensors, health.sensors + amount * 0.8);
  health.weapons = Math.min(health.maxWeapons, health.weapons + amount * 0.8);
}

export function getComponentStatusLabel(cur: number, max: number): 'OPTIMAL' | 'DAMAGED' | 'CRITICAL' | 'OFFLINE' {
  const r = cur / Math.max(1, max);
  if (r <= 0.05) return 'OFFLINE';
  if (r <= 0.35) return 'CRITICAL';
  if (r <= 0.75) return 'DAMAGED';
  return 'OPTIMAL';
}
