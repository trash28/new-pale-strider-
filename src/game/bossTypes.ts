import { MapId, MechClassId, Vec2 } from './types';

export type BossVariantId =
  | 'siege'
  | 'cataclysm'
  | 'stormbringer'
  | 'fortress'
  | 'blackout';

export type BossWarheadType =
  | 'strategic'
  | 'cluster'
  | 'emp'
  | 'thermoblast'
  | 'bunker_buster';

export type BossComponentId =
  | 'mortar'
  | 'ammoBays'
  | 'sensors'
  | 'leftLegs'
  | 'rightLegs'
  | 'auxWeapons'
  | 'powerCore';

export type BossAIState =
  | 'repositioning'
  | 'acquiring'
  | 'bracing'
  | 'loading'
  | 'warning'
  | 'firing'
  | 'reloading'
  | 'destroying';

export type BossPosture =
  | 'heavy_idle'
  | 'fast_walk'
  | 'rapid_move'
  | 'full_pursuit'
  | 'high_speed_turn'
  | 'emergency_brake'
  | 'artillery_deploy'
  | 'recoil_recover'
  | 'critical_damage';

export type BossUltimateId =
  | 'deadfall_protocol'
  | 'extinction_salvo'
  | 'hellfire_pursuit'
  | 'iron_judgment'
  | 'silent_apocalypse';

export interface BossTuningOverrides {
  healthMult?: number;
  damageMult?: number;
  speedMult?: number;
  aggressionMult?: number;
  attackFreqMult?: number;
}

export type BossTeleportPersonality =
  | 'artillery_reposition'
  | 'cataclysm_shift'
  | 'stormbringer_flank'
  | 'fortress_anchor'
  | 'blackout_ambush';

export interface BossTeleportConfig {
  personality: BossTeleportPersonality;
  cooldown: number;
  minDist: number;
  maxDist: number;
  telegraphSec: number;
  burstMaxCount: number;
  warpColor: string;
}

export interface BossComponentState {
  id: BossComponentId;
  label: string;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

export interface BossLegMountSpec {
  id: number;
  side: 'left' | 'right';
  attachX: number;
  attachY: number;
  restX: number;
  restY: number;
  femurLength: number;
  tibiaLength: number;
  gaitGroup: 0 | 1 | 2 | 3;
  bendSign: 1 | -1;
}

export interface BossVariantSpec {
  id: BossVariantId;
  code: string;
  name: string;
  subtitle: string;
  role: string;
  threatClass: 'PRIMARY BOSS' | 'FINAL CAMPAIGN BOSS' | 'RAPID ASSAULT BOSS' | 'SIEGE BASTION' | 'EWAR ARTILLERY';
  description: string;
  ultimateId: BossUltimateId;
  ultimateName: string;
  ultimateDesc: string;
  radius: number;
  hullWidth: number;
  hullLength: number;
  mass: number;
  maxHull: number;
  maxArmor: number;
  frontArmorMult: number; // < 1 means strong directional front armor
  rearWeakMult: number; // > 1 means exposed rear weak point
  maxSpeed: number;
  acceleration: number;
  turnAccel: number;
  maxTurnSpeed: number;
  strideLength: number;
  stepHeight: number;
  stepSpeed: number;
  footstepWeight: number;
  preferredRangeMin: number;
  preferredRangeMax: number;
  repositionAfterSalvo: boolean;
  mortarDamage: number;
  mortarSplashRadius: number;
  mortarWarningTime: number;
  mortarLoadTime: number;
  mortarReloadTime: number;
  mortarSalvoCount: number;
  mortarScatter: number;
  warheadRotation: BossWarheadType[];
  auxWeaponKind: 'autocannon' | 'missile' | 'flak' | 'emp_lance';
  auxWeaponDamage: number;
  auxWeaponRange: number;
  auxFireRate: number;
  auxBurstCount: number;
  canDeployTurrets: boolean;
  canDeployDecoys: boolean;
  delayedSecondaryDetonation: boolean;
  silhouette: 'siege' | 'cataclysm' | 'stormbringer' | 'fortress' | 'blackout';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  warningColor: string;
  legs: BossLegMountSpec[];
  componentHealth: Record<BossComponentId, number>;
  teleport: BossTeleportConfig;
}

export interface HazardZone {
  id: string;
  kind: 'radiation' | 'fire';
  team?: 'player' | 'enemy';
  ownerId?: string;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  dps: number;
  tickAccum: number;
}

export interface BossDeployable {
  id: string;
  kind: 'turret' | 'decoy';
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  aimAngle: number;
  cooldown: number;
  life: number;
  maxLife: number;
  hitFlashTimer: number;
}

export interface IncomingArtilleryWarning {
  id: string;
  x: number;
  y: number;
  radius: number;
  remaining: number;
  total: number;
  warheadType: BossWarheadType;
}

export interface DefendStructureState {
  label: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
}

export interface BossHudSnapshot {
  id: string;
  variantId: BossVariantId;
  code: string;
  name: string;
  subtitle: string;
  threatClass: string;
  hull: number;
  maxHull: number;
  armor: number;
  maxArmor: number;
  phase: 1 | 2 | 3 | 4;
  aiState: BossAIState;
  posture: BossPosture;
  activeWarhead: BossWarheadType;
  ultimateActive: boolean;
  ultimateName: string;
  alive: boolean;
  destroying: boolean;
  teleporting?: boolean;
  teleportProgress?: number;
  components: {
    id: BossComponentId;
    label: string;
    hpRatio: number;
    destroyed: boolean;
  }[];
  warningText: string | null;
}

export interface BossChallengeConfig {
  variantId: BossVariantId;
  mapId: MapId;
  playerUnit: MechClassId;
  allyUnits: MechClassId[];
  difficulty: 'standard' | 'veteran' | 'cataclysmic';
}

export const WARHEAD_LABELS: Record<BossWarheadType, string> = {
  strategic: 'STRATEGIC NUCLEAR',
  cluster: 'AIRBURST CLUSTER',
  emp: 'EMP NUCLEAR',
  thermoblast: 'THERMOBLAST INCENDIARY',
  bunker_buster: 'BUNKER-BUSTER PENETRATOR',
};

export const WARHEAD_COLORS: Record<BossWarheadType, string> = {
  strategic: '#f97316',
  cluster: '#fbbf24',
  emp: '#67e8f9',
  thermoblast: '#ef4444',
  bunker_buster: '#a855f7',
};

export type BossTargetVec = Vec2;
