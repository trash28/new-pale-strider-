import type { BossHudSnapshot, IncomingArtilleryWarning } from './bossTypes';
import type { MissileType } from './missileTypes';
export type { MissileType };

export interface Vec2 {
  x: number;
  y: number;
}

export type TerrainType = 'concrete' | 'mud' | 'sand' | 'rocky' | 'water' | 'slope_n' | 'slope_s' | 'slope_e' | 'slope_w';

export type MapId =
  | 'urban'
  | 'grassland'
  | 'mountain'
  | 'desert'
  | 'industrial'
  | 'forest'
  | 'snow'
  | 'training';

export type MechClassId =
  | 'recon'
  | 'standard'
  | 'sniper'
  | 'heavy'
  | 'artillery'
  | 'colossus'
  | 'ewar'
  | 'engineer'
  | 'valkyrie'
  | 'phantom'
  | 'assassin'
  | 'proteus';

export type MortarAmmoType = 'he' | 'ap' | 'cluster' | 'smoke' | 'emp';

export interface MortarAmmoSpec {
  id: MortarAmmoType;
  code: string;
  name: string;
  shortDesc: string;
  damageMult: number;
  splashRadius: number;
  reloadMult: number;
  flightSpeed: number;
  piercing: boolean;
  bossArmorMult: number;
  color: string;
}

export type EnemyArchetype =
  | 'scout'
  | 'assault'
  | 'sniper'
  | 'heavy'
  | 'swarm'
  | 'hunter'
  | 'interceptor'
  | 'rocket_hunter'
  | 'sky_breaker'
  | 'assassin'
  | 'grappler';

export type WeaponKind =
  | 'autocannon'
  | 'machinegun'
  | 'railgun'
  | 'artillery'
  | 'missile'
  | 'ewar_pulse'
  | 'repair_beam';

export type ComponentId =
  | 'chassis'
  | 'armor'
  | 'engine'
  | 'sensors'
  | 'weapons'
  | 'leftLegs'
  | 'rightLegs';

export interface ComponentHealth {
  chassis: number;
  maxChassis: number;
  armor: number;
  maxArmor: number;
  engine: number;
  maxEngine: number;
  sensors: number;
  maxSensors: number;
  weapons: number;
  maxWeapons: number;
  leftLegs: number;
  maxLeftLegs: number;
  rightLegs: number;
  maxRightLegs: number;
}

export type SpecialAbilityKind =
  | 'overdrive'
  | 'stabilizer'
  | 'siege_stance'
  | 'fortress_armor'
  | 'artillery_salvo'
  | 'overwatch_barrage'
  | 'ecm_pulse'
  | 'repair_field'
  | 'flight_overdrive'
  | 'aegis_armor'
  | 'phantom_execution'
  | 'total_replication'
  | 'recon_apex_scan'
  | 'standard_bulwark_salvo'
  | 'sniper_hyper_lockdown'
  | 'heavy_siege_ram'
  | 'artillery_earthshaker'
  | 'colossus_apocalypse_salvo'
  | 'ewar_tempest_storm'
  | 'engineer_fabricator_rig'
  | 'valkyrie_seraphim_strike'
  | 'phantom_overclock_aegis'
  | 'assassin_crimson_tempest';

export interface FriendlyDeployable {
  id: string;
  kind: 'recon_beacon' | 'ewar_decoy' | 'engineer_sentry';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  life: number;
  maxLife: number;
  aimAngle: number;
  cooldown: number;
  ownerId: string;
  hitFlashTimer: number;
  pulsePhase: number;
}

export interface WeaponSpec {
  id: string;
  name: string;
  kind: WeaponKind;
  damage: number;
  splashRadius: number;
  fireRate: number; // shots per second
  projectileSpeed: number;
  range: number;
  spreadRad: number;
  recoilImpulse: number;
  recoilTorque: number; // rotational twist multiplier when off-center
  recoilSpreadGain: number;
  stabilityCost: number; // 0..1 stability consumed per shot
  prepTime: number; // firing preparation / breech lock delay (seconds)
  requiresBrace: boolean; // mech slows/anchors & spreads legs before firing
  barrelOffsetY: number; // lateral offset from turret center
  magazineSize: number;
  reloadTime: number;
  chargeTime: number; // for railguns
  burstCount: number;
  piercing: boolean;
  homingTurnRate: number; // rad/s for missiles
  missileType?: MissileType;
  barrelLength: number;
  caliber: number;
}

export interface LegMountSpec {
  side: 'left' | 'right';
  attachX: number; // forward (+X) or backward (-X) in mech local frame
  attachY: number; // right (+Y) or left (-Y) in mech local frame
  restX: number;
  restY: number;
  femurLength: number;
  tibiaLength: number;
  gaitGroup: 0 | 1;
  bendSign: 1 | -1;
}

export interface MechClassSpec {
  id: MechClassId;
  code: string;
  name: string;
  role: string;
  description: string;
  unlockCost: number;
  mass: number;
  acceleration: number;
  maxSpeed: number;
  sprintMultiplier: number;
  reverseMultiplier: number;
  turnAccel: number;
  maxTurnSpeed: number;
  lateralGrip: number; // higher = less drift
  radius: number;
  baseArmor: number;
  baseChassis: number;
  legDurability: number;
  sensorRange: number;
  suspensionStiffness: number;
  footstepWeight: number; // 0.3 light .. 1.0 heavy
  strideLength: number;
  stepHeight: number;
  stepSpeed: number;
  primaryWeapon: WeaponSpec;
  secondaryWeapon: WeaponSpec;
  specialAbility: {
    kind: SpecialAbilityKind;
    name: string;
    description: string;
    duration: number;
    cooldown: number;
  };
  legs: LegMountSpec[];
  silhouette: 'wedge' | 'standard' | 'sniper' | 'juggernaut' | 'artillery' | 'colossus' | 'ewar' | 'engineer' | 'valkyrie' | 'phantom' | 'assassin' | 'proteus';
  defaultColor: string;
  accentColor: string;
  canFly?: boolean;
  canDash?: boolean;
  canGrapple?: boolean;
}

export type UpgradeId =
  | 'engine_output'
  | 'turn_servos'
  | 'composite_armor'
  | 'recoil_dampeners'
  | 'auto_loader'
  | 'optics_suite'
  | 'leg_actuators'
  | 'suspension_kit'
  | 'aa_targeting'
  | 'aa_servos'
  | 'aa_rapid_fire'
  | 'aa_ammo'
  | 'aa_detection'
  | 'aa_cooling'
  | 'aa_multitarget'
  | 'aa_reinforced'
  | 'aa_intercept_ai';

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  description: string;
  tradeOff: string;
  maxLevel: number;
  costPerLevel: number;
  category?: 'chassis' | 'anti_air';
}

export interface PaintScheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

export type SquadOrder =
  | 'follow'
  | 'hold'
  | 'attack_target'
  | 'defend'
  | 'spread'
  | 'regroup'
  | 'retreat'
  | 'focus'
  | 'search'
  | 'full_assault';

export type GameMode = 'campaign' | 'skirmish' | 'survival' | 'training' | 'freeroam' | 'boss_challenge';

export type AppScreen =
  | 'title'
  | 'hangar'
  | 'briefing'
  | 'skirmish_setup'
  | 'boss_setup'
  | 'settings'
  | 'playing'
  | 'paused'
  | 'gameover';

export type CameraShakeLevel = 'off' | 'low' | 'medium' | 'high';

export interface KeyBindings {
  moveForward: string;
  moveBackward: string;
  moveLeft: string;
  moveRight: string;
  sprint: string;
  dash: string;
  grapple: string;
  descend: string;
  special: string;
  stealth: string;
  reload: string;
  interact: string;
  squadMenu: string;
  tacticalMap: string;
  weapon1: string;
  weapon2: string;
  weapon3: string;
  toggleMinimap: string;
  pause: string;
}

export interface SettingsData {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  weaponsVolume: number;
  explosionsVolume: number;
  mechanicalVolume: number;
  enginesVolume: number;
  ambienceVolume: number;
  radioVolume: number;
  uiVolume: number;
  dynamicAudioMix: boolean;
  cameraShake: number;
  cameraShakeLevel: CameraShakeLevel;
  recoilVisualIntensity: number;
  displayScale: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  mouseSensitivity: number;
  flightSensitivity: number;
  cameraZoom: number;
  bossCinematics: 'full' | 'short' | 'off';
  dashVfx: boolean;
  afterimageIntensity: number;
  grappleVfx: boolean;
  flightVfx: boolean;
  rocketExhaustVfx: boolean;
  keyBindings: KeyBindings;
}

export interface MechLoadoutCustomization {
  upgrades: Partial<Record<UpgradeId, number>>;
  paintId: string;
  weaponVariant: 'standard' | 'heavy_barrel' | 'rapid_feed';
  armorPackage: 'standard' | 'reactive' | 'lightweight';
  supportModule: 'none' | 'auto_repair' | 'ecm_baffle' | 'capacitor';
}

export interface SaveData {
  credits: number;
  unlockedUnits: MechClassId[];
  selectedUnit: MechClassId;
  completedMissions: number[];
  highestSurvivalWave: number;
  customLoadouts: Partial<Record<MechClassId, MechLoadoutCustomization>>;
  failedModeUnits?: Partial<Record<GameMode, MechClassId>>;
  settings: SettingsData;
}

export type ObstacleKind =
  | 'building'
  | 'ruin'
  | 'rock'
  | 'tank_wreck'
  | 'fuel_tank'
  | 'tree'
  | 'bunker'
  | 'crate'
  | 'watchtower'
  | 'crane'
  | 'bridge_pylon'
  | 'radar_dish'
  | 'silo'
  | 'monolith';

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ObstacleKind;
  destructible: boolean;
  explosive: boolean;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  height: number; // visual 2.5D extrusion height
  blocksLos: boolean;
}

export interface TerrainZone {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rect' | 'ellipse';
  type: TerrainType;
}

export interface RoadSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface ObjectivePoint {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  completed: boolean;
  progress: number; // 0..1
  kind: 'capture' | 'destroy' | 'extract' | 'survive';
}

export interface MapDefinition {
  id: MapId;
  name: string;
  region: string;
  description: string;
  width: number;
  height: number;
  groundColor: string;
  groundDetailColor: string;
  ambientTint: string;
  playerSpawn: Vec2;
  enemySpawns: Vec2[];
  terrainZones: TerrainZone[];
  roads: RoadSegment[];
  obstacles: Obstacle[];
  objectives: ObjectivePoint[];
}

export interface HudSnapshot {
  screen: AppScreen;
  mode: GameMode;
  unitId: MechClassId;
  unitName: string;
  unitCode: string;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  components: ComponentHealth;
  speed: number;
  maxSpeed: number;
  stability: number; // 0..100
  braced: boolean;
  terrain: TerrainType;
  gaitState: string;
  activeSlot: 1 | 2 | 3;
  primaryWeapon: {
    name: string;
    ammo: number;
    maxAmmo: number;
    reloading: boolean;
    reloadProgress: number;
    chargeProgress: number;
    prepProgress: number;
  };
  secondaryWeapon: {
    name: string;
    ammo: number;
    maxAmmo: number;
    reloading: boolean;
    reloadProgress: number;
  };
  specialAbility: {
    kind?: SpecialAbilityKind;
    name: string;
    active: boolean;
    activeRemaining: number;
    cooldownRemaining: number;
    cooldownTotal: number;
  };
  squadOrder: SquadOrder;
  playerAegisRemaining?: number;
  squadMembers: {
    id: string;
    callsign: string;
    unitName: string;
    role?: 'assault' | 'support' | 'recon';
    hpRatio: number;
    armorRatio: number;
    alive: boolean;
    downed?: boolean;
    reviveProgress?: number;
    aegisRemaining?: number;
    order: SquadOrder;
    statusText: string;
  }[];
  missionTitle: string;
  objectiveText: string;
  objectiveProgress: number;
  enemiesRemaining: number;
  wave: number;
  elapsedSeconds: number;
  kills: number;
  damageDealt: number;
  creditsEarned: number;
  radioFeed: { speaker: string; text: string; id: number }[];
  warningMessage: string | null;
  minimapVisible: boolean;
  tacticalOpen: boolean;
  squadWheelOpen: boolean;
  victory: boolean;
  endReason: string;
  trainingGodMode: boolean;
  trainingBossTuning: {
    healthMult: number;
    speedMult: number;
    aggression: number;
  };
  boss: BossHudSnapshot | null;
  bossIntroActive: boolean;
  cinematicBanner: string | null;
  mortarHud: {
    activeAmmo: MortarAmmoType;
    minRange: number;
    maxRange: number;
    travelTime: number;
    scatterRadius: number;
    inRange: boolean;
    targetX: number;
    targetY: number;
    barrageActive: boolean;
  } | null;
  incomingWarnings: IncomingArtilleryWarning[];
  empDisruptTimer: number;
  defendObjective: { label: string; hp: number; maxHp: number } | null;
  dashHud: {
    supported: boolean;
    active: boolean;
    ready: boolean;
    cooldownRemaining: number;
    cooldownTotal: number;
    charges: number;
  };
  grappleHud: {
    supported: boolean;
    state: 'idle' | 'deploying' | 'attached' | 'retracting';
    hasValidTarget: boolean;
    targetDist: number;
    cableLength: number;
    tension: number;
    cooldownRemaining: number;
  };
  flightHud: {
    isFlyingMech: boolean;
    airborne: boolean;
    altitude: number;
    maxAltitude: number;
    verticalVel: number;
    heat: number;
    overheated: boolean;
    boosting: boolean;
    stability: number;
  } | null;
  missileLockWarning: boolean;
  airborneEnemiesCount: number;
  aaHud?: {
    heat: number;
    overheated: boolean;
    active: boolean;
    trackingCount: number;
    damaged: boolean;
  };
  activeRadio?: {
    id: number;
    speaker: string;
    text: string;
    priority: number;
    signalProfile: 'clean' | 'field' | 'degraded' | 'distress' | 'corrupted';
    progress: number;
  } | null;
  boot?: import('./mechBootSequence').HudBootSnapshot;
  victoryCinematic?: import('./victoryCinematic').VictoryCinematicSnapshot | null;
  revenantBanner?: string | null;
  revenantInterference?: number;
  revenantActive?: boolean;
  stealthHud?: {
    supported: boolean;
    active: boolean;
    energy: number;
    maxEnergy: number;
    cooldownRemaining: number;
    revealed: boolean;
    detectedByEnemy: boolean;
    cloakAlpha: number;
    executionTargetCallsign: string | null;
    executionTargetInRange: boolean;
    executionTargetIsBoss: boolean;
  } | null;
  takedownHud?: {
    active: boolean;
    mode: 'player_execution' | 'first_person_escape';
    variant?: import('./takedownSystem').TakedownMinigameVariant;
    stage: number;
    totalStages: number;
    cursor: number;
    cursorWidth: number;
    cursorVel: number;
    evadeCooldownRatio: number;
    instability: number;
    lastJudgment: 'PERFECT' | 'GOOD' | 'MISS' | null;
    judgmentTimer: number;
    ringRadius: number;
    ringTargetRadius: number;
    needleA: number;
    needleB: number;
    targetZoneCenter: number;
    targetZoneHalfWidth: number;
    activeLane: 0 | 1 | 2;
    dangerLanes: [boolean, boolean, boolean];
    slash: {
      phase: 'idle' | 'telegraph' | 'strike' | 'recover';
      progress: number;
      zoneCenter: number;
      zoneHalfWidth: number;
      secondaryZoneCenter: number | null;
      secondaryZoneHalfWidth: number;
      angleRad: number;
      side: -1 | 0 | 1;
      dodged: boolean;
      wasHit: boolean;
      nextIntervalProgress: number;
    } | null;
    isBossAmbush: boolean;
  } | null;
  transformHud?: {
    isProteus: boolean;
    isTransforming: boolean;
    isTransformed: boolean;
    baseClassId: MechClassId | null;
    activeTargetId: MechClassId | null;
    activeTargetName: string | null;
    stage: string | null;
    stageLabel: string | null;
    progress: number;
    selectorOpen: boolean;
    totalReplicationCooldown: number;
    totalReplicationCooldownTotal: number;
    eligibleTargets: {
      id: MechClassId;
      code: string;
      name: string;
      morphCode: string;
      morphName: string;
      category: string;
      role: string;
      enhancedSummary: string;
      uniqueAbilityName: string;
      uniqueAbilityDesc: string;
      weaponSummary: string;
      silhouette: MechClassSpec['silhouette'];
      primaryColor: string;
      accentColor: string;
      unlocked: boolean;
      isCurrent: boolean;
      canFly: boolean;
      legsCount: number;
    }[];
  } | null;
  sandbox?: import('./sandboxRegistry').SandboxStateSnapshot | null;
  minimapEntities: {
    x: number;
    y: number;
    team: 'player' | 'ally' | 'enemy' | 'objective' | 'boss' | 'decoy' | 'revenant';
    detected: boolean;
    label?: string;
  }[];
  minimapObstacles: {
    x: number;
    y: number;
    w: number;
    h: number;
  }[];
  mapWidth: number;
  mapHeight: number;
  playerX: number;
  playerY: number;
  playerAimAngle: number;
  grapplerClingHud?: {
    attachedToPlayerCount: number;
    attachedToAlliesCount: number;
    totalDpsOnPlayer: number;
    slowPenaltyPct: number;
    attachedHosts: { callsign: string; count: number; isPlayer: boolean }[];
  };
}
