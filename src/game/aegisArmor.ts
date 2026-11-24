import type { MechActor } from './mech';
import type { MechClassSpec } from './types';

/** Exact protection duration in seconds for every shielded squadmate. */
export const AEGIS_ARMOR_DURATION = 30.0;
export const AEGIS_DEPLOY_TIME = 0.48;
export const AEGIS_RETRACT_TIME = 0.55;

export interface AegisArmorState {
  active: boolean;
  remaining: number; // Exact independent countdown (30s -> 0s)
  maxDuration: number;
  deployProgress: number; // 0..1 mechanical assembly animation
  retractProgress: number; // 0..1 mechanical retraction animation
  hitFlash: number; // Brief deflection gleam when absorbing an attack
  deflectedCount: number; // Telemetry for visual spark cadence (never reduces durability — infinite HP)
}

export interface AegisVisualProfile {
  style:
    | 'stealth_shroud'
    | 'vanguard_reactive'
    | 'sniper_cowl'
    | 'juggernaut_bulkhead'
    | 'siege_bastion'
    | 'ewar_resonance'
    | 'engineer_exo'
    | 'valkyrie_aero'
    | 'phantom_carapace'
    | 'assassin_shroud';
  primaryPlateColor: string;
  secondaryTrimColor: string;
  energyLineColor: string;
  plateThickness: number;
  legArmorScale: number;
  hasWingStrakes: boolean;
  hasShoulderPauldrons: boolean;
  hasDorsalFin: boolean;
}

export function createInactiveAegisState(): AegisArmorState {
  return {
    active: false,
    remaining: 0,
    maxDuration: AEGIS_ARMOR_DURATION,
    deployProgress: 0,
    retractProgress: 0,
    hitFlash: 0,
    deflectedCount: 0,
  };
}

/**
 * Deploys an independently tracked 30-second Infinite-HP adaptive armor upgrade
 * onto every currently active friendly squadmate (including the caster).
 */
export function activateAegisArmorForSquad(units: MechActor[]): number {
  let applied = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.alive || u.downed) continue;
    u.aegisArmor = {
      active: true,
      remaining: AEGIS_ARMOR_DURATION,
      maxDuration: AEGIS_ARMOR_DURATION,
      deployProgress: 0,
      retractProgress: 0,
      hitFlash: 0.25,
      deflectedCount: 0,
    };
    applied++;
  }
  return applied;
}

/**
 * Ticks a single mech's independent Aegis protective armor timer and transformation phases.
 * Returns 'retracted' on the exact frame the 30s protection expires.
 */
export function stepAegisArmor(mech: MechActor, dt: number): 'none' | 'active' | 'retracted' {
  const st = mech.aegisArmor;
  if (!st || !st.active) return 'none';

  // Clean up immediately if unit dies, is downed, or despawns
  if (!mech.alive || mech.downed) {
    st.active = false;
    st.remaining = 0;
    st.deployProgress = 0;
    st.retractProgress = 0;
    return 'retracted';
  }

  st.remaining = Math.max(0, st.remaining - dt);
  if (st.hitFlash > 0) {
    st.hitFlash = Math.max(0, st.hitFlash - dt * 2.8);
  }

  const elapsed = st.maxDuration - st.remaining;
  st.deployProgress = Math.min(1, elapsed / AEGIS_DEPLOY_TIME);

  if (st.remaining <= AEGIS_RETRACT_TIME) {
    st.retractProgress = Math.min(1, 1 - st.remaining / AEGIS_RETRACT_TIME);
  } else {
    st.retractProgress = 0;
  }

  if (st.remaining <= 0) {
    st.active = false;
    st.deployProgress = 0;
    st.retractProgress = 1;
    return 'retracted';
  }

  return 'active';
}

export function isAegisArmorActive(mech: Pick<MechActor, 'alive' | 'downed' | 'aegisArmor'>): boolean {
  return Boolean(mech.alive && !mech.downed && mech.aegisArmor?.active && mech.aegisArmor.remaining > 0);
}

/**
 * Records an absorbed/deflected hit for visual feedback only.
 * NEVER reduces durability or remaining duration (INFINITE HP).
 */
export function triggerAegisDeflectFlash(mech: MechActor): void {
  if (!mech.aegisArmor?.active) return;
  mech.aegisArmor.hitFlash = 1.0;
  mech.aegisArmor.deflectedCount += 1;
}

/**
 * Returns a tailored armor upgrade visual profile matching each mech's original silhouette
 * so every squadmate receives a unique upgraded configuration of its own armor design.
 */
export function getAegisVisualProfile(silhouette: MechClassSpec['silhouette']): AegisVisualProfile {
  switch (silhouette) {
    case 'wedge':
      return {
        style: 'stealth_shroud',
        primaryPlateColor: '#cbd5e1',
        secondaryTrimColor: '#0ea5e9',
        energyLineColor: '#38bdf8',
        plateThickness: 2.0,
        legArmorScale: 0.9,
        hasWingStrakes: true,
        hasShoulderPauldrons: false,
        hasDorsalFin: true,
      };
    case 'sniper':
      return {
        style: 'sniper_cowl',
        primaryPlateColor: '#dbeafe',
        secondaryTrimColor: '#0284c7',
        energyLineColor: '#67e8f9',
        plateThickness: 2.2,
        legArmorScale: 0.95,
        hasWingStrakes: false,
        hasShoulderPauldrons: true,
        hasDorsalFin: true,
      };
    case 'juggernaut':
      return {
        style: 'juggernaut_bulkhead',
        primaryPlateColor: '#e2e8f0',
        secondaryTrimColor: '#d97706',
        energyLineColor: '#38bdf8',
        plateThickness: 3.4,
        legArmorScale: 1.25,
        hasWingStrakes: false,
        hasShoulderPauldrons: true,
        hasDorsalFin: false,
      };
    case 'artillery':
    case 'colossus':
      return {
        style: 'siege_bastion',
        primaryPlateColor: '#e2e8f0',
        secondaryTrimColor: '#f59e0b',
        energyLineColor: '#22d3ee',
        plateThickness: 3.2,
        legArmorScale: 1.2,
        hasWingStrakes: false,
        hasShoulderPauldrons: true,
        hasDorsalFin: false,
      };
    case 'ewar':
      return {
        style: 'ewar_resonance',
        primaryPlateColor: '#ede9fe',
        secondaryTrimColor: '#7c3aed',
        energyLineColor: '#a78bfa',
        plateThickness: 2.3,
        legArmorScale: 1.0,
        hasWingStrakes: false,
        hasShoulderPauldrons: true,
        hasDorsalFin: true,
      };
    case 'engineer':
      return {
        style: 'engineer_exo',
        primaryPlateColor: '#d1fae5',
        secondaryTrimColor: '#059669',
        energyLineColor: '#34d399',
        plateThickness: 2.6,
        legArmorScale: 1.05,
        hasWingStrakes: false,
        hasShoulderPauldrons: true,
        hasDorsalFin: false,
      };
    case 'valkyrie':
      return {
        style: 'valkyrie_aero',
        primaryPlateColor: '#e0f2fe',
        secondaryTrimColor: '#0284c7',
        energyLineColor: '#7dd3fc',
        plateThickness: 2.1,
        legArmorScale: 0.85,
        hasWingStrakes: true,
        hasShoulderPauldrons: false,
        hasDorsalFin: true,
      };
    case 'phantom':
      return {
        style: 'phantom_carapace',
        primaryPlateColor: '#ecfeff',
        secondaryTrimColor: '#0891b2',
        energyLineColor: '#22d3ee',
        plateThickness: 2.5,
        legArmorScale: 1.05,
        hasWingStrakes: true,
        hasShoulderPauldrons: true,
        hasDorsalFin: true,
      };
    case 'assassin':
      return {
        style: 'assassin_shroud',
        primaryPlateColor: '#1e293b',
        secondaryTrimColor: '#e11d48',
        energyLineColor: '#fb7185',
        plateThickness: 2.0,
        legArmorScale: 0.92,
        hasWingStrakes: true,
        hasShoulderPauldrons: false,
        hasDorsalFin: true,
      };
    case 'proteus':
      return {
        style: 'vanguard_reactive',
        primaryPlateColor: '#cbd5e1',
        secondaryTrimColor: '#0ea5e9',
        energyLineColor: '#38bdf8',
        plateThickness: 2.8,
        legArmorScale: 1.1,
        hasWingStrakes: true,
        hasShoulderPauldrons: true,
        hasDorsalFin: true,
      };
    case 'standard':
    default:
      return {
        style: 'vanguard_reactive',
        primaryPlateColor: '#e2e8f0',
        secondaryTrimColor: '#0284c7',
        energyLineColor: '#38bdf8',
        plateThickness: 2.6,
        legArmorScale: 1.05,
        hasWingStrakes: false,
        hasShoulderPauldrons: true,
        hasDorsalFin: false,
      };
  }
}
