import { BOSS_VARIANT_LIST } from './bossVariants';
import { BossVariantId } from './bossTypes';
import { MECH_LIST } from './mechRoster';
import { EnemyArchetype, MechClassId } from './types';

export type SandboxCategoryId =
  | 'player_units'
  | 'friendly_units'
  | 'hostile_units'
  | 'elite_units'
  | 'bosses'
  | 'revenants';

export type SandboxTeamChoice = 'player' | 'enemy';

export type SandboxBehaviorMode =
  | 'aggressive'
  | 'attack_player'
  | 'attack_hostiles'
  | 'follow'
  | 'patrol'
  | 'defensive'
  | 'friendly_support'
  | 'idle';

export interface SandboxRegistryEntry {
  id: string;
  category: SandboxCategoryId;
  name: string;
  code: string;
  subtitle: string;
  defaultTeam: SandboxTeamChoice;
  supportsTeamToggle: boolean;
  accentColor: string;
  kind: 'switch_player' | 'mech_unit' | 'enemy_archetype' | 'flying_enemy' | 'boss' | 'revenant';
  mechClassId?: MechClassId;
  enemyArchetype?: EnemyArchetype;
  bossVariantId?: BossVariantId;
}

export const SANDBOX_CATEGORY_LABELS: Record<SandboxCategoryId, string> = {
  player_units: 'PLAYER UNITS',
  friendly_units: 'FRIENDLY UNITS',
  hostile_units: 'HOSTILE UNITS',
  elite_units: 'ELITE UNITS',
  bosses: 'BOSSES',
  revenants: 'REVENANTS',
};

export const SANDBOX_BEHAVIOR_LABELS: Record<SandboxBehaviorMode, string> = {
  aggressive: 'AGGRESSIVE',
  attack_player: 'HUNT PLAYER',
  attack_hostiles: 'ENGAGE HOSTILES',
  follow: 'FOLLOW',
  patrol: 'PATROL',
  defensive: 'DEFENSIVE',
  friendly_support: 'SUPPORT',
  idle: 'IDLE',
};

export const SANDBOX_MAX_ACTIVE_UNITS = 28;
export const SANDBOX_MAX_ACTIVE_BOSSES = 4;

const STANDARD_GROUND_ENEMIES: { arch: EnemyArchetype; code: string; name: string; sub: string }[] = [
  { arch: 'scout', code: 'EN-SC', name: 'Raider Scout', sub: 'Fast recon flanker' },
  { arch: 'assault', code: 'EN-AS', name: 'Ironclad Trooper', sub: 'Mid-range autocannon' },
  { arch: 'swarm', code: 'EN-SW', name: 'Swarm Skitter', sub: 'Pack rush skirmisher' },
  { arch: 'sniper', code: 'EN-SN', name: 'Deadeye Rail', sub: 'Long-range precision' },
  { arch: 'heavy', code: 'EN-HV', name: 'Siege Goliath', sub: 'Heavy armored gunship' },
];

const ELITE_ENEMIES: { arch: EnemyArchetype; code: string; name: string; sub: string; flying: boolean }[] = [
  { arch: 'hunter', code: 'EL-HN', name: 'Apex Hunter', sub: 'High-speed elite flanker', flying: false },
  { arch: 'assassin', code: 'EL-AS', name: 'Kurokage Stalker', sub: 'Stealth ambush & CQC assassin', flying: false },
  { arch: 'grappler', code: 'RP-05', name: 'Raptis-05 Grapplers (x5)', sub: 'Swinging parasite pack · Bullet-immune free · 5 DPS cling', flying: false },
  { arch: 'interceptor', code: 'AIR-01', name: 'Sky Interceptor', sub: 'Rocket-boosted aerial striker', flying: true },
  { arch: 'rocket_hunter', code: 'AIR-02', name: 'Rocket Hunter', sub: 'Aerial missile hunter', flying: true },
  { arch: 'sky_breaker', code: 'AIR-03', name: 'Sky Breaker', sub: 'Heavy airborne gunship', flying: true },
];

/**
 * Dynamically builds the complete Sandbox spawn registry from the game's
 * live MECH_LIST, enemy archetypes, BOSS_VARIANT_LIST, and all REVENANT classes.
 * Newly added playable units or bosses automatically appear here.
 */
export function buildSandboxRegistry(): SandboxRegistryEntry[] {
  const entries: SandboxRegistryEntry[] = [];

  // 1. PLAYER UNITS — instant chassis switch for the player
  for (const m of MECH_LIST) {
    entries.push({
      id: `player_${m.id}`,
      category: 'player_units',
      name: m.name,
      code: m.code,
      subtitle: m.role,
      defaultTeam: 'player',
      supportsTeamToggle: false,
      accentColor: m.accentColor,
      kind: 'switch_player',
      mechClassId: m.id,
    });
  }

  // 2. FRIENDLY UNITS — spawnable allied AI mechs (team toggleable for mirror duels!)
  for (const m of MECH_LIST) {
    entries.push({
      id: `ally_${m.id}`,
      category: 'friendly_units',
      name: `${m.name} (AI)`,
      code: m.code,
      subtitle: `${m.role} · Allied/Duelist`,
      defaultTeam: 'player',
      supportsTeamToggle: true,
      accentColor: '#38bdf8',
      kind: 'mech_unit',
      mechClassId: m.id,
    });
  }

  // 3. HOSTILE UNITS — standard ground enemies (team toggleable)
  for (const e of STANDARD_GROUND_ENEMIES) {
    entries.push({
      id: `hostile_${e.arch}`,
      category: 'hostile_units',
      name: e.name,
      code: e.code,
      subtitle: e.sub,
      defaultTeam: 'enemy',
      supportsTeamToggle: true,
      accentColor: '#ef4444',
      kind: 'enemy_archetype',
      enemyArchetype: e.arch,
    });
  }

  // 4. ELITE UNITS — elite hunters + airborne rocket wings
  for (const el of ELITE_ENEMIES) {
    entries.push({
      id: `elite_${el.arch}`,
      category: 'elite_units',
      name: el.name,
      code: el.code,
      subtitle: el.sub,
      defaultTeam: 'enemy',
      supportsTeamToggle: true,
      accentColor: el.flying ? '#38bdf8' : '#f97316',
      kind: el.flying ? 'flying_enemy' : 'enemy_archetype',
      enemyArchetype: el.arch,
    });
  }

  // 5. BOSSES — all Thunderhead super-heavy boss variants
  for (const b of BOSS_VARIANT_LIST) {
    entries.push({
      id: `boss_${b.id}`,
      category: 'bosses',
      name: b.name,
      code: b.code,
      subtitle: `${b.legs.length}-Leg Boss · ${b.ultimateName}`,
      defaultTeam: 'enemy',
      supportsTeamToggle: false,
      accentColor: '#f59e0b',
      kind: 'boss',
      bossVariantId: b.id,
    });
  }

  // 6. REVENANTS — corrupted extreme-speed versions of EVERY playable mech class
  for (const m of MECH_LIST) {
    entries.push({
      id: `revenant_${m.id}`,
      category: 'revenants',
      name: `REVENANT // ${m.name}`,
      code: `RV-${m.code}`,
      subtitle: `Corrupted ${m.role} · Extreme Threat`,
      defaultTeam: 'enemy',
      supportsTeamToggle: true,
      accentColor: '#c084fc',
      kind: 'revenant',
      mechClassId: m.id,
    });
  }

  return entries;
}

export interface SandboxStateSnapshot {
  simPaused: boolean;
  godMode: boolean;
  infiniteAmmo: boolean;
  aggressionMult: number;
  speedMult: number;
  behaviorMode: SandboxBehaviorMode;
  activeSpawnedCount: number;
  maxSpawnedCount: number;
  activeBossCount: number;
  activeRevenantCount: number;
}
