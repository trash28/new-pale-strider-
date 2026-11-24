import { SquadController, SQUAD_ORDER_LABELS } from './alliedAI';
import { AudioEngine } from './audio';
import { computeSpatialAudioParams } from './audioMixer';
import { BossCinematicController } from './bossCinematics';
import { BossEncounterConfig, BossEncounterDirector } from './bossDirector';
import {
  BossChallengeConfig,
  BossDeployable,
  BossTuningOverrides,
  BossVariantId,
  BossWarheadType,
  DefendStructureState,
  HazardZone,
  IncomingArtilleryWarning,
  WARHEAD_LABELS,
} from './bossTypes';
import { BOSS_VARIANTS } from './bossVariants';
import { Camera } from './camera';
import {
  activateAegisArmorForSquad,
  isAegisArmorActive,
  stepAegisArmor,
  triggerAegisDeflectFlash,
} from './aegisArmor';
import { applyComponentDamage, checkUnitDamageImmunity, repairComponents } from './combat';
import {
  completeSquadmateRevive,
  isEligibleForRevive,
  REVIVE_CHANNEL_DURATION,
  REVIVE_UNREACHABLE_TIMEOUT,
} from './reviveSystem';
import { CombatThreatManager } from './combatThreatManager';
import { AfterimagePool } from './dashSystem';
import { computeEnemyAI, createEnemyMech } from './enemies';
import { stepFlightPhysics, VALKYRIE_FLIGHT_CONFIG } from './flightSystem';
import {
  computeFlyingEnemyAI,
  createFlyingEnemy,
  isFlyingArchetype,
  stepFlyingEnemyMotion,
} from './flyingEnemies';
import {
  computeGrapplerSlowMultiplier,
  countAttachedGrapplersForUnit,
  createGrapplerGroup,
  detachGrappler,
  GRAPPLER_CLING_DPS,
  GRAPPLER_GROUP_SIZE,
  GrapplerSpawnScheduler,
  isGrapplerImmuneToProjectile,
  pickGrapplerApproachAnchor,
  stepGrapplerEnemyAI,
  syncClingingGrapplers,
} from './grapplerEnemy';
import { GrappleController, GrappleTargetRegistry } from './grappleSystem';
import { buildMap, getTerrainAt } from './maps';
import { applyTransformedUnitForm, createPlayableMech, MechActor } from './mech';
import { MECH_LIST, MECH_ROSTER, PAINT_SCHEMES } from './mechRoster';
import { buildSurvivalWave, CAMPAIGN_MISSIONS, SkirmishConfig } from './missions';
import {
  getMorphChargeSpeedMultiplier,
  getMorphDashCooldownMultiplier,
  getMorphFireRateMultiplier,
  getMorphIncomingDamageReduction,
  getMorphRecoilMultiplier,
  getMorphSpeedMultiplier,
  getMorphSpreadMultiplier,
  getProteusMorphSpec,
  stepMorphRigState,
} from './proteusMorphs';
import {
  canInitiateTransformation,
  createTransformRuntime,
  getEligibleReplicationTargets,
  stepTransformRuntime,
  TRANSFORM_COOLDOWN_SEC,
} from './transformSystem';
import { MechBootSequence } from './mechBootSequence';
import { stepCounterInterceptorProjectile, stepMissileProjectile } from './missileController';
import { isSolidMissileCover, MissileTargetState } from './missileGuidance';
import { getMissileProfile, MissileType } from './missileTypes';
import { RadioSpeakerRole } from './dialogueDatabase';
import { RadioCommunicationManager } from './radioCommunicationManager';
import {
  FailedRunTracker,
  getRevenantProfileForClass,
  resolveGuaranteedRevenantClass,
  RevenantManager,
  RevenantVariantFactory,
} from './revenantSystem';
import {
  buildSandboxRegistry,
  SANDBOX_MAX_ACTIVE_UNITS,
  SandboxBehaviorMode,
  SandboxTeamChoice,
} from './sandboxRegistry';
import { MusicState } from './musicManager';
import { MatchPerformanceTracker, VictoryCinematicManager } from './victoryCinematic';
import {
  doesSegmentCrossSmoke,
  isPointInSmoke,
  MORTAR_AMMO_SPECS,
  MortarAmmoManager,
  MortarTargetingSolution,
  MortarTargetingSystem,
  OverwatchBarrageController,
  SmokeCloud,
} from './mortarSystem';
import { hasLineOfSight, NavGrid, segmentIntersectsAABB } from './pathfinding';
import { ParticleSystem } from './particles';
import { applyRecoilImpulse, resolveObstacleCollisions, stepMechPhysics } from './physics';
import { renderBattlefield } from './renderer';
import {
  canDetectUnit,
  forceActivateStealth,
  getStealthNoiseMultiplier,
  revealStealth,
  stepStealthState,
  toggleStealth,
} from './stealthSystem';
import { getCameraShakeScale, loadSaveData, persistSaveData } from './storage';
import { BOSS_AMBUSH_DAMAGE_BASE, TakedownManager } from './takedownSystem';
import { BossIncomingProjectileThreat, ThunderheadBoss } from './thunderheadBoss';
import {
  AppScreen,
  EnemyArchetype,
  FriendlyDeployable,
  GameMode,
  HudSnapshot,
  MapDefinition,
  MapId,
  MechClassId,
  MortarAmmoType,
  SaveData,
  SquadOrder,
  Vec2,
} from './types';
import { Projectile, ProjectilePool, WeaponRuntime } from './weapons';

const FIXED_DT = 1 / 60;

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public audio = new AudioEngine();
  public camera = new Camera();
  public particles = new ParticleSystem();
  public projectiles = new ProjectilePool();
  public squadCtrl = new SquadController();

  public save: SaveData;
  public screen: AppScreen = 'title';
  public mode: GameMode = 'skirmish';

  public map: MapDefinition;
  private navGrid: NavGrid;
  public player: MechActor;
  public allies: MechActor[] = [];
  public enemies: MechActor[] = [];

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private accumulator = 0;
  private simTime = 0;
  private hitstopTimer = 0;
  private hudPushTimer = 0;

  // Input state
  private keysHeld = new Set<string>();
  private mouseScreen: Vec2 = { x: 720, y: 450 };
  private mouseWorld: Vec2 = { x: 720, y: 450 };
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private viewW = 1440;
  private viewH = 900;

  // Match / mission state
  private currentMissionId = 1;
  private currentSkirmish: SkirmishConfig = {
    mapId: 'urban',
    playerUnit: 'standard',
    allyUnits: ['recon', 'engineer'],
    difficulty: 'veteran',
    enemyCount: 6,
  };
  private waveNumber = 1;
  private elapsedSeconds = 0;
  private kills = 0;
  private damageDealt = 0;
  private creditsEarned = 0;
  private radioFeed: { speaker: string; text: string; id: number }[] = [];
  private radioCounter = 1;
  private warningMessage: string | null = null;
  private warningTimer = 0;
  private minimapVisible = true;
  private tacticalOpen = false;
  private squadWheelOpen = false;
  private transformSelectorOpen = false;
  private preTransformZoom: number | null = null;
  private playerTransformCooldown = 0;
  private victory = false;
  private endReason = '';
  private defeatDelayTimer = 0;
  private trainingGodMode = false;
  private sandboxSimPaused = false;
  private sandboxInfiniteAmmo = false;
  private sandboxBehaviorMode: SandboxBehaviorMode = 'aggressive';
  private sandboxSpeedMult = 1.0;
  private sandboxAggressionMult = 1.0;
  private sandboxSpawnHistory: { kind: 'ally' | 'enemy' | 'boss'; id: string }[] = [];
  private musicUpdateTimer = 0;
  private spawnCounter = 1;
  private freeRoamReinforceTimer = 0;

  // Thunderhead Boss & Strategic Battlefield State
  public boss: ThunderheadBoss | null = null;
  private bossIntroTimer = 0;
  private currentBossConfig: BossChallengeConfig = {
    variantId: 'siege',
    mapId: 'desert',
    playerUnit: 'heavy',
    allyUnits: ['standard', 'engineer'],
    difficulty: 'veteran',
  };
  private hazards: HazardZone[] = [];
  private incomingWarnings: IncomingArtilleryWarning[] = [];
  private bossDeployables: BossDeployable[] = [];
  private friendlyDeployables: FriendlyDeployable[] = [];
  private defendStructure: DefendStructureState | null = null;
  private empDisruptTimer = 0;
  private nuclearDimAlpha = 0;
  private delayedBlasts: { x: number; y: number; radius: number; damage: number; warheadType: BossWarheadType; timer: number }[] = [];

  // M-09 Colossus Mortar, Smoke, Cinematics & Boss Spawn Director
  private mortarAmmo = new MortarAmmoManager();
  private mortarTargeting = new MortarTargetingSystem();
  private overwatchBarrage = new OverwatchBarrageController();
  private smokeClouds: SmokeCloud[] = [];
  private bossCinematics = new BossCinematicController();
  private bossDirector = new BossEncounterDirector();
  private trainingBossTuning = { healthMult: 1, speedMult: 1, aggression: 1 };

  // Mobility, Dash Afterimages, Grappling Hook, Threat & Anti-Air Warfare
  private afterimages = new AfterimagePool(48);
  private grapple = new GrappleController();
  private threatManager = new CombatThreatManager();
  private missileLockWarning = false;
  private rocketBoostAudioCooldown = 0;
  private lockBeepCooldown = 0;
  private bootSequence = new MechBootSequence();
  private radioManager = new RadioCommunicationManager();
  private performanceTracker = new MatchPerformanceTracker();
  private victoryCinematic = new VictoryCinematicManager();
  private revenantManager = new RevenantManager();
  private lastGuaranteedRevenantClass: MechClassId | null = null;
  private grapplerDpsTextAccum = 0;
  private grapplerSpawnScheduler = new GrapplerSpawnScheduler();
  private currentDifficultyMult = 1.0;
  private victoryAwardsAudioPlayed = false;
  private deployOrderTimer = 0;
  public takedowns = new TakedownManager();

  private onHudUpdate: (snap: HudSnapshot) => void;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, onHudUpdate: (snap: HudSnapshot) => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D canvas context');
    this.ctx = ctx;
    this.onHudUpdate = onHudUpdate;
    this.save = loadSaveData();
    this.applySettings(this.save.settings);
    this.radioManager.setAdapter({
      playVoiceLine: (line, onEnded) => {
        if (this.screen === 'playing' || this.screen === 'gameover') {
          this.audio.playVoiceTransmission(line, onEnded);
        } else {
          onEnded();
        }
      },
      stopVoiceLine: () => this.audio.stopVoiceTransmission(),
    });

    this.map = buildMap('urban');
    this.navGrid = new NavGrid(this.map);
    this.player = createPlayableMech({
      id: 'player',
      callsign: 'Wardog-1',
      isPlayer: true,
      classId: this.save.selectedUnit,
      x: this.map.playerSpawn.x,
      y: this.map.playerSpawn.y,
      customization: this.save.customLoadouts[this.save.selectedUnit],
    });

    this.setupTitleShowcase();
    this.bindEvents();
    this.syncBodyState();
  }

  public applySettings(settings: SaveData['settings']): void {
    this.save.settings = settings;
    this.audio.updateSettings(settings);
    this.camera.setShakeLevel(settings.cameraShakeLevel);
    this.camera.targetZoom = Math.max(0.7, Math.min(1.35, settings.cameraZoom ?? 1.0));
    this.bossCinematics.setMode(settings.bossCinematics);
  }

  private setupTitleShowcase(): void {
    this.mode = 'skirmish';
    this.map = buildMap('urban');
    this.navGrid = new NavGrid(this.map);
    this.particles.clear();
    this.projectiles.clear();
    this.afterimages.clear();
    this.grapple.reset();
    this.missileLockWarning = false;
    this.boss = null;
    this.hazards = [];
    this.incomingWarnings = [];
    this.bossDeployables = [];
    this.defendStructure = null;
    this.delayedBlasts = [];
    this.bossIntroTimer = 0;
    this.empDisruptTimer = 0;
    this.nuclearDimAlpha = 0;
    this.smokeClouds = [];
    this.overwatchBarrage.reset();
    this.bossCinematics.reset();
    this.bossDirector.reset();
    this.audio.setBossIntensity(false);

    const cx = Math.round(this.map.width * 0.35);
    const cy = Math.round(this.map.height * 0.5);
    this.player = createPlayableMech({
      id: 'player',
      callsign: 'Wardog-1',
      isPlayer: true,
      classId: this.save.selectedUnit,
      x: cx - 300,
      y: cy,
      angle: 0,
      customization: this.save.customLoadouts[this.save.selectedUnit],
    });
    this.allies = [
      createPlayableMech({
        id: 'ally_1',
        callsign: 'Wardog-2',
        isPlayer: false,
        classId: 'recon',
        x: cx - 400,
        y: cy - 110,
        angle: 0.2,
        formationSlot: 0,
      }),
      createPlayableMech({
        id: 'ally_2',
        callsign: 'Wardog-3',
        isPlayer: false,
        classId: 'heavy',
        x: cx - 440,
        y: cy + 100,
        angle: -0.1,
        formationSlot: 1,
      }),
    ];
    this.enemies = [
      createEnemyMech({ id: 'title_e1', archetype: 'scout', x: cx + 440, y: cy - 90 }),
      createEnemyMech({ id: 'title_e2', archetype: 'assault', x: cx + 560, y: cy + 80 }),
    ];
    this.camera.snapTo(cx, cy, 1.0);
  }

  public start(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const clampedDt = Math.min(0.05, Math.max(0.001, rawDt));

      this.updateFrame(clampedDt);
      if (
        this.screen === 'title' ||
        this.screen === 'playing' ||
        this.screen === 'paused' ||
        this.screen === 'gameover'
      ) {
        this.renderFrame();
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unbindEvents();
    this.resizeObserver?.disconnect();
    this.audio.dispose();
  }

  public setScreen(screen: AppScreen): void {
    this.screen = screen;
    this.keysHeld.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.squadWheelOpen = false;
    this.tacticalOpen = false;
    if (screen === 'title') {
      this.setupTitleShowcase();
    }
    this.updateDynamicMusic(true);
    this.syncBodyState();
    this.pushHudSnapshot();
  }

  private syncBodyState(): void {
    if (typeof document === 'undefined') return;
    const mapped =
      this.screen === 'playing'
        ? 'playing'
        : this.screen === 'paused'
        ? 'paused'
        : this.screen === 'gameover'
        ? 'gameover'
        : 'title';
    document.body.dataset.state = mapped;
    document.body.dataset.screen = this.screen;
  }

  public startCampaignMission(missionId: number): void {
    const mission = CAMPAIGN_MISSIONS.find((m) => m.id === missionId) ?? CAMPAIGN_MISSIONS[0];
    this.currentMissionId = mission.id;
    this.mode = 'campaign';
    this.initBattlefield({
      mapId: mission.mapId,
      playerUnit: this.save.selectedUnit,
      allySpecs: mission.allies,
      enemies: mission.enemyWaves,
      difficultyMult: mission.difficultyMult,
      title: `${mission.code}: ${mission.title}`,
      objective: mission.objectivesSummary,
      bossVariant: mission.bossVariant,
      defendObjectiveLabel: mission.defendObjectiveLabel,
    });
    for (const line of mission.dialogue) {
      this.pushRadio(line.speaker, line.text);
    }
  }

  public startBossChallenge(cfg: BossChallengeConfig): void {
    this.currentBossConfig = cfg;
    this.mode = 'boss_challenge';
    const diffMult = cfg.difficulty === 'standard' ? 0.85 : cfg.difficulty === 'cataclysmic' ? 1.25 : 1.0;
    const spec = BOSS_VARIANTS[cfg.variantId];
    this.initBattlefield({
      mapId: cfg.mapId,
      playerUnit: cfg.playerUnit,
      allySpecs: cfg.allyUnits.map((u, idx) => ({ callsign: `Wardog-${idx + 2}`, classId: u })),
      enemies: [],
      difficultyMult: diffMult,
      title: `Boss Hunt: ${spec.code} ${spec.name}`,
      objective: `Neutralize ${spec.name} (${spec.threatClass}). Target weak points to cripple artillery systems.`,
      bossVariant: cfg.variantId,
    });
    this.pushRadio('Tactical Control', `Seismic alert! ${spec.code} ${spec.name} detected on long-range radar!`);
  }

  public startSkirmish(cfg: SkirmishConfig): void {
    this.currentSkirmish = cfg;
    this.mode = 'skirmish';
    const diffMult = cfg.difficulty === 'recruit' ? 0.78 : cfg.difficulty === 'ace' ? 1.25 : 1.0;
    const archetypes: EnemyArchetype[] = [
      'scout',
      'assault',
      'interceptor',
      'sniper',
      'swarm',
      'rocket_hunter',
      'hunter',
      'heavy',
      'sky_breaker',
    ];
    const waves: { archetype: EnemyArchetype; count: number }[] = [];
    for (let i = 0; i < cfg.enemyCount; i++) {
      const arch = archetypes[i % archetypes.length];
      const existing = waves.find((w) => w.archetype === arch);
      if (existing) existing.count++;
      else waves.push({ archetype: arch, count: 1 });
    }
    this.initBattlefield({
      mapId: cfg.mapId,
      playerUnit: cfg.playerUnit,
      allySpecs: cfg.allyUnits.map((u, idx) => ({ callsign: `Wardog-${idx + 2}`, classId: u })),
      enemies: waves,
      difficultyMult: diffMult,
      title: 'Skirmish Engagement',
      objective: 'Eliminate all hostile forces in sector.',
      bossConfig: cfg.bossConfig,
    });
    this.pushRadio('Tactical Control', 'Skirmish perimeter hot. Engage all autonomous hostiles.');
  }

  public startSurvival(): void {
    this.mode = 'survival';
    this.waveNumber = 1;
    this.initBattlefield({
      mapId: 'industrial',
      playerUnit: this.save.selectedUnit,
      allySpecs: [
        { callsign: 'Wardog-2', classId: 'standard' },
        { callsign: 'Wardog-3', classId: 'engineer' },
      ],
      enemies: buildSurvivalWave(1),
      difficultyMult: 0.9,
      title: 'Survival Protocol',
      objective: 'Survive endless hostile waves. Wave 1 active.',
    });
    this.pushRadio('Tactical Control', 'Endless Legion assault inbound. Hold the foundry as long as possible.');
  }

  public startTraining(overrideUnit?: MechClassId): void {
    this.mode = 'training';
    this.trainingGodMode = false;
    this.sandboxSimPaused = false;
    this.sandboxInfiniteAmmo = false;
    this.sandboxBehaviorMode = 'aggressive';
    this.sandboxSpeedMult = 1.0;
    this.sandboxAggressionMult = 1.0;
    this.sandboxSpawnHistory = [];
    this.initBattlefield({
      mapId: 'training',
      playerUnit: overrideUnit ?? this.save.selectedUnit,
      allySpecs: [
        { callsign: 'VANGUARD-2', classId: 'heavy' },
        { callsign: 'AEGIS-3', classId: 'engineer' },
        { callsign: 'SPECTRE-4', classId: 'sniper' },
        { callsign: 'PHANTOM-5', classId: 'phantom' },
      ],
      enemies: [],
      difficultyMult: 1.0,
      title: 'SANDBOX SECTOR',
      objective: 'Open Sandbox — Spawn any unit, enemy, boss, or REVENANT freely.',
    });
    this.spawnTrainingTargets();
    this.pushRadio('Sandbox Control', 'Sandbox Sector online. Spawn any mech, boss, or REVENANT from the command drawer.');
  }

  public startFreeRoam(mapId: MapId = 'grassland'): void {
    this.mode = 'freeroam';
    this.freeRoamReinforceTimer = 18;
    this.initBattlefield({
      mapId,
      playerUnit: this.save.selectedUnit,
      allySpecs: [
        { callsign: 'Wardog-2', classId: 'recon' },
        { callsign: 'Wardog-3', classId: 'standard' },
      ],
      enemies: [
        { archetype: 'scout', count: 2 },
        { archetype: 'assault', count: 2 },
        { archetype: 'sniper', count: 1 },
      ],
      difficultyMult: 0.95,
      title: 'Free Roam Sector',
      objective: 'Explore the battlefield freely. Engage enemy patrols at will.',
    });
    this.pushRadio('Wardog-2', 'Patrol grid open. Moving at your lead, commander.');
  }

  public restartCurrentMode(): void {
    if (this.mode === 'campaign') this.startCampaignMission(this.currentMissionId);
    else if (this.mode === 'skirmish') this.startSkirmish(this.currentSkirmish);
    else if (this.mode === 'boss_challenge') this.startBossChallenge(this.currentBossConfig);
    else if (this.mode === 'survival') this.startSurvival();
    else if (this.mode === 'training') this.startTraining();
    else this.startFreeRoam(this.map.id);
  }

  private initBattlefield(params: {
    mapId: MapId;
    playerUnit: MechClassId;
    allySpecs: { callsign: string; classId: MechClassId }[];
    enemies: { archetype: EnemyArchetype; count: number }[];
    difficultyMult: number;
    title: string;
    objective: string;
    bossVariant?: BossVariantId;
    bossConfig?: BossEncounterConfig;
    defendObjectiveLabel?: string;
  }): void {
    this.map = buildMap(params.mapId);
    this.navGrid = new NavGrid(this.map);
    this.particles.clear();
    this.projectiles.clear();
    this.afterimages.clear();
    this.takedowns.clear();
    this.grapple.reset();
    this.missileLockWarning = false;
    this.keysHeld.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.elapsedSeconds = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.creditsEarned = 0;
    this.radioFeed = [];
    this.radioManager.reset();
    this.deployOrderTimer = 3.2;
    this.warningMessage = null;
    this.warningTimer = 0;
    this.victory = false;
    this.endReason = '';
    this.defeatDelayTimer = 0;
    this.hitstopTimer = 0;
    this.squadWheelOpen = false;
    this.tacticalOpen = false;
    this.transformSelectorOpen = false;
    this.preTransformZoom = null;
    this.playerTransformCooldown = 0;
    this.squadCtrl = new SquadController();
    this.hazards = [];
    this.incomingWarnings = [];
    this.bossDeployables = [];
    this.friendlyDeployables = [];
    this.delayedBlasts = [];
    this.smokeClouds = [];
    this.overwatchBarrage.reset();
    this.mortarAmmo.setAmmo('he');
    this.bossCinematics.reset();
    this.bossCinematics.setMode(this.save.settings.bossCinematics);
    this.bossDirector.reset();
    this.camera.setShakeLevel(this.save.settings.cameraShakeLevel);
    this.empDisruptTimer = 0;
    this.nuclearDimAlpha = 0;
    this.boss = null;
    this.bossIntroTimer = 0;
    this.defendStructure = null;
    this.audio.setBossIntensity(Boolean(params.bossVariant));

    this.player = createPlayableMech({
      id: 'player',
      callsign: 'Wardog-1',
      isPlayer: true,
      classId: params.playerUnit,
      x: this.map.playerSpawn.x,
      y: this.map.playerSpawn.y,
      angle: 0,
      customization: this.save.customLoadouts[params.playerUnit],
    });
    this.player.activeMortarAmmo = this.mortarAmmo.activeAmmo;

    // Deploy up to 4 distinct AI squadmates (5-unit squad total: Player + 4 AI Wingmen)
    const defaultSquadBlueprints: {
      callsign: string;
      classId: MechClassId;
      role: 'assault' | 'support' | 'recon';
      personality: MechActor['personality'];
      offsetX: number;
      offsetY: number;
    }[] = [
      {
        callsign: 'VANGUARD-2',
        classId: 'heavy',
        role: 'assault',
        personality: 'aggressive',
        offsetX: -65,
        offsetY: 115,
      },
      {
        callsign: 'AEGIS-3',
        classId: 'engineer',
        role: 'support',
        personality: 'support',
        offsetX: -95,
        offsetY: -100,
      },
      {
        callsign: 'SPECTRE-4',
        classId: 'sniper',
        role: 'recon',
        personality: 'cautious',
        offsetX: -175,
        offsetY: 105,
      },
      {
        callsign: 'PHANTOM-5',
        classId: 'phantom',
        role: 'assault',
        personality: 'disciplined',
        offsetX: -80,
        offsetY: -145,
      },
    ];

    // Respect custom allySpecs (up to 4 wingmen = 5 total squad) while defaulting to a full 4-wingman squad
    const resolvedBlueprints =
      params.allySpecs.length >= 4
        ? params.allySpecs.slice(0, 4).map((sp, idx) => {
            const base = defaultSquadBlueprints[idx];
            const inferredRole: 'assault' | 'support' | 'recon' =
              sp.classId === 'engineer'
                ? 'support'
                : sp.classId === 'sniper' || sp.classId === 'recon'
                ? 'recon'
                : 'assault';
            return {
              callsign: sp.callsign || base.callsign,
              classId: sp.classId,
              role: inferredRole,
              personality: inferredRole === 'support' ? ('support' as const) : inferredRole === 'recon' ? ('cautious' as const) : ('aggressive' as const),
              offsetX: base.offsetX,
              offsetY: base.offsetY,
            };
          })
        : defaultSquadBlueprints.map((base, idx) => {
            const custom = params.allySpecs[idx];
            const classId = custom?.classId ?? base.classId;
            const role: 'assault' | 'support' | 'recon' =
              classId === 'engineer'
                ? 'support'
                : classId === 'sniper' || classId === 'recon'
                ? 'recon'
                : base.role;
            return {
              ...base,
              callsign: custom?.callsign ?? base.callsign,
              classId,
              role,
            };
          });

    this.allies = resolvedBlueprints.map((bp, idx) =>
      createPlayableMech({
        id: `ally_${idx}`,
        callsign: bp.callsign,
        isPlayer: false,
        classId: bp.classId,
        x: Math.max(85, Math.min(this.map.width - 85, this.map.playerSpawn.x + bp.offsetX)),
        y: Math.max(85, Math.min(this.map.height - 85, this.map.playerSpawn.y + bp.offsetY)),
        angle: 0,
        formationSlot: idx,
        personality: bp.personality,
        squadRole: bp.role,
      })
    );

    // Register all 4 squad units for authentic match performance tracking & awards
    this.performanceTracker.reset();
    this.performanceTracker.registerUnit({
      unitId: this.player.id,
      callsign: this.player.callsign,
      unitName: this.player.spec.name,
      classId: this.player.classId,
      role: 'commander',
      isPlayer: true,
    });
    for (const a of this.allies) {
      this.performanceTracker.registerUnit({
        unitId: a.id,
        callsign: a.callsign,
        unitName: a.spec.name,
        classId: a.classId,
        role: a.squadRole ?? 'assault',
        isPlayer: false,
      });
    }

    this.victoryCinematic.reset();
    this.victoryAwardsAudioPlayed = false;
    this.grapplerDpsTextAccum = 0;
    this.currentDifficultyMult = params.difficultyMult;
    this.grapplerSpawnScheduler.reset();
    const pendingFailureRev = FailedRunTracker.getPendingRevenantClass(this.save, this.mode);
    const guaranteedRev = resolveGuaranteedRevenantClass(pendingFailureRev, this.lastGuaranteedRevenantClass);
    if (!pendingFailureRev) {
      this.lastGuaranteedRevenantClass = guaranteedRev;
    }
    const revDelay =
      this.mode === 'training' || this.mode === 'freeroam' || this.mode === 'boss_challenge' ? 4.5 : 6.5;
    this.revenantManager.scheduleIfEligible(guaranteedRev, revDelay);

    if (params.defendObjectiveLabel) {
      this.defendStructure = {
        label: params.defendObjectiveLabel,
        x: Math.max(680, this.map.playerSpawn.x + 280),
        y: this.map.height * 0.5,
        radius: 46,
        hp: 2400,
        maxHp: 2400,
      };
    }

    if (params.bossVariant) {
      this.spawnBossEntity(params.bossVariant, params.difficultyMult, true);
    } else if (params.bossConfig) {
      const req = this.bossDirector.checkSkirmishSpawn(
        false,
        params.bossConfig,
        this.map,
        this.player.phys.pos
      );
      if (req) {
        this.spawnBossEntity(req.variantId, params.difficultyMult, true, req.spawnPos, req.tuning);
        this.pushRadio('Tactical Control', req.alertText);
      }
    }

    this.enemies = [];
    this.spawnWaveEnemies(params.enemies, params.difficultyMult);
    if (this.mode !== 'training') {
      this.ensureGuaranteedGrapplerPack(params.difficultyMult);
    }
    const bootTrig = this.bootSequence.start(params.playerUnit, false);
    this.audio.playBootStageSound(bootTrig.stage, bootTrig.mechClass, bootTrig.abbreviated);

    const baseZoom = params.bossVariant ? 0.85 : Math.max(0.7, Math.min(1.35, this.save.settings.cameraZoom ?? 1.0));
    this.camera.snapTo(this.player.phys.pos.x, this.player.phys.pos.y, baseZoom);
    this.screen = 'playing';
    this.syncBodyState();
    this.pushHudSnapshot();
  }

  private spawnBossEntity(
    variantId: BossVariantId,
    difficultyMult: number,
    triggerIntro: boolean,
    customPos?: Vec2,
    tuning?: BossTuningOverrides
  ): void {
    const bx = customPos ? customPos.x : this.map.id === 'training' ? 2150 : this.map.width - 520;
    const by = customPos ? customPos.y : this.map.height * 0.5;
    // Clear small obstacles around colossal boss dropzone so legs never spawn wedged in walls
    for (const obs of this.map.obstacles) {
      if (Math.hypot(obs.x - bx, obs.y - by) < 220) {
        obs.destroyed = true;
      }
    }
    // Reposition nearby training drones so they don't stand underneath the boss chassis
    if (this.map.id === 'training') {
      for (const en of this.enemies) {
        if (!en.alive) continue;
        if (Math.hypot(en.phys.pos.x - bx, en.phys.pos.y - by) < 235) {
          en.phys.pos.x = Math.max(1200, bx - 360);
          en.phys.pos.y = en.phys.pos.y < by ? by - 420 : by + 420;
          en.legs.reset(en.spec.legs, en.phys.pos, en.phys.bodyAngle);
        }
      }
    }
    this.navGrid.rebuild(this.map.obstacles);
    this.boss = new ThunderheadBoss(variantId, bx, by, difficultyMult, tuning);
    this.audio.setBossIntensity(true);
    if (triggerIntro) {
      this.bossIntroTimer = 2.4;
      this.showWarning(`STRATEGIC THREAT DETECTED: ${this.boss.spec.code} ${this.boss.spec.name.toUpperCase()}`);
      this.audio.playBossFootstep(1.6, 0.85);
    }
  }

  public spawnTrainingBoss(variantId: BossVariantId | null): void {
    if (this.mode !== 'training') return;
    if (!variantId) {
      this.boss = null;
      this.hazards = [];
      this.incomingWarnings = [];
      this.bossDeployables = [];
      this.audio.setBossIntensity(false);
      this.pushRadio('Range Control', 'Thunderhead boss target cleared.');
      this.pushHudSnapshot();
      return;
    }
    this.spawnBossEntity(variantId, 0.85, true, undefined, {
      healthMult: this.trainingBossTuning.healthMult,
      speedMult: this.trainingBossTuning.speedMult,
      aggressionMult: this.trainingBossTuning.aggression,
      attackFreqMult: this.trainingBossTuning.aggression,
    });
    this.pushRadio('Range Control', `Spawned ${BOSS_VARIANTS[variantId].code} ${BOSS_VARIANTS[variantId].name} on test range.`);
    this.pushHudSnapshot();
  }

  public triggerTrainingBossUltimate(): void {
    if (this.mode !== 'training' || !this.boss || !this.boss.alive) return;
    if (this.boss.triggerUltimate(this.player.phys.pos, true)) {
      this.pushRadio('Range Control', `Manual override: ${this.boss.spec.code} executing ${this.boss.spec.ultimateName}!`);
      this.pushHudSnapshot();
    }
  }

  public setTrainingBossTuning(
    partial: Partial<{ healthMult: number; speedMult: number; aggression: number }>
  ): void {
    this.trainingBossTuning = { ...this.trainingBossTuning, ...partial };
    if (this.boss && this.boss.alive) {
      this.boss.applyTuningOverrides({
        healthMult: this.trainingBossTuning.healthMult * 0.85,
        speedMult: this.trainingBossTuning.speedMult,
        aggressionMult: this.trainingBossTuning.aggression,
        attackFreqMult: this.trainingBossTuning.aggression,
      });
    }
    this.pushHudSnapshot();
  }

  public setPlayerMortarAmmo(ammo: MortarAmmoType): void {
    if (this.player.classId !== 'colossus') return;
    this.mortarAmmo.setAmmo(ammo);
    this.player.activeMortarAmmo = ammo;
    if (this.screen === 'playing') {
      this.audio.playMortarAmmoSwitch();
    }
    this.pushHudSnapshot();
  }

  public cyclePlayerMortarAmmo(): void {
    if (this.player.classId !== 'colossus') return;
    const next = this.mortarAmmo.cycleAmmo();
    this.player.activeMortarAmmo = next;
    if (this.screen === 'playing') {
      this.audio.playMortarAmmoSwitch();
    }
    this.pushRadio('Ordnance', `Loaded ${MORTAR_AMMO_SPECS[next].name}.`);
    this.pushHudSnapshot();
  }

  public getMortarSolution(): MortarTargetingSolution | null {
    if (this.player.classId !== 'colossus') return null;
    const spd = Math.hypot(this.player.phys.vel.x, this.player.phys.vel.y);
    return this.mortarTargeting.computeSolution(
      this.player.phys.pos,
      this.mouseWorld,
      this.mortarAmmo.activeAmmo,
      {
        speedRatio: Math.min(1, spd / Math.max(40, this.player.physCfg.maxSpeed)),
        stability: this.player.phys.stability,
        braced: this.player.phys.bracingFactor > 0.4 || this.overwatchBarrage.active,
        mapWidth: this.map.width,
        mapHeight: this.map.height,
      }
    );
  }

  private spawnGrapplerPack(diffMult: number, tag = 'periodic'): void {
    const anchor = pickGrapplerApproachAnchor({
      playerPos: this.player.phys.pos,
      friendlies: [this.player.phys.pos, ...this.allies.map((a) => a.phys.pos)],
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      obstacles: this.map.obstacles,
      seedIndex: this.spawnCounter,
    });
    const pack = createGrapplerGroup({
      groupId: `grp_${tag}_${this.spawnCounter}`,
      baseSpawnIndex: this.spawnCounter,
      anchorPos: anchor,
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      obstacles: this.map.obstacles,
      difficultyMult: diffMult,
      playerPos: this.player.phys.pos,
    });
    this.spawnCounter += pack.length;
    for (const unit of pack) {
      this.enemies.push(unit);
    }
  }

  private ensureGuaranteedGrapplerPack(diffMult: number): void {
    if (this.enemies.some((e) => e.alive && e.enemyArchetype === 'grappler')) return;
    this.spawnGrapplerPack(diffMult, 'guaranteed');
  }

  private spawnWaveEnemies(waves: { archetype: EnemyArchetype; count: number }[], diffMult: number): void {
    let spIdx = 0;
    for (const w of waves) {
      if (w.archetype === 'grappler') {
        const groupsNeeded = Math.max(1, Math.ceil(w.count / GRAPPLER_GROUP_SIZE));
        for (let g = 0; g < groupsNeeded; g++) {
          const anchor = pickGrapplerApproachAnchor({
            playerPos: this.player.phys.pos,
            friendlies: [this.player.phys.pos, ...this.allies.map((a) => a.phys.pos)],
            mapWidth: this.map.width,
            mapHeight: this.map.height,
            obstacles: this.map.obstacles,
            seedIndex: this.spawnCounter + g,
          });
          spIdx++;
          const pack = createGrapplerGroup({
            groupId: `grp_wave_${this.spawnCounter}`,
            baseSpawnIndex: this.spawnCounter,
            anchorPos: anchor,
            mapWidth: this.map.width,
            mapHeight: this.map.height,
            obstacles: this.map.obstacles,
            difficultyMult: diffMult,
            playerPos: this.player.phys.pos,
          });
          this.spawnCounter += pack.length;
          for (const unit of pack) {
            this.enemies.push(unit);
          }
        }
        continue;
      }

      for (let i = 0; i < w.count; i++) {
        const sp = this.map.enemySpawns[spIdx % this.map.enemySpawns.length];
        spIdx++;
        const jx = sp.x + ((spIdx * 73) % 160) - 80;
        const jy = sp.y + ((spIdx * 97) % 160) - 80;
        const sx = Math.max(100, Math.min(this.map.width - 100, jx));
        const sy = Math.max(100, Math.min(this.map.height - 100, jy));
        const e = isFlyingArchetype(w.archetype)
          ? createFlyingEnemy({
              id: `enemy_${this.spawnCounter++}`,
              archetype: w.archetype,
              x: sx,
              y: sy,
              difficultyMult: diffMult,
            })
          : createEnemyMech({
              id: `enemy_${this.spawnCounter++}`,
              archetype: w.archetype,
              x: sx,
              y: sy,
              difficultyMult: diffMult,
            });
        if (!isFlyingArchetype(w.archetype)) {
          resolveObstacleCollisions(e.phys.pos, e.phys.vel, e.spec.radius, this.map.obstacles, this.map.width, this.map.height);
        }
        e.legs.reset(e.spec.legs, e.phys.pos, e.phys.bodyAngle);
        this.enemies.push(e);
      }
    }
  }

  private stepAntiAirSystems(dt: number): void {
    const allUnits = [this.player, ...this.allies, ...this.enemies];
    for (let i = 0; i < allUnits.length; i++) {
      const unit = allUnits[i];
      if (!unit.alive || unit.isDummy) continue;
      const sensR = unit.health.sensors / Math.max(1, unit.health.maxSensors);
      const wepR = unit.health.weapons / Math.max(1, unit.health.maxWeapons);
      const subHealth = Math.max(0.1, sensR * 0.6 + wepR * 0.4);
      const res = unit.antiAir.update(dt, {
        ownerId: unit.id,
        team: unit.team,
        x: unit.phys.pos.x,
        y: unit.phys.pos.y,
        altitude: unit.flight?.altitude ?? 0,
        bodyAngle: unit.phys.bodyAngle,
        radius: unit.spec.radius,
        jammedTimer: unit.jammedTimer,
        subsystemHealth: subHealth,
        threats: this.threatManager.getThreatsForTeam(unit.team),
        obstacles: this.map.obstacles,
        smokeClouds: this.smokeClouds,
        alreadyTargetedByInterceptor: this.threatManager.targetedByInterceptor,
      });
      this.handleAntiAirStepFeedback(
        res,
        unit.id,
        unit.team,
        unit.phys.pos.x,
        unit.phys.pos.y,
        unit.isPlayer,
        unit.flight?.altitude ?? 0
      );
    }

    if (this.boss && this.boss.alive && !this.boss.destroying) {
      const bossRes = this.boss.antiAir.update(dt, {
        ownerId: this.boss.id,
        team: 'enemy',
        x: this.boss.phys.pos.x,
        y: this.boss.phys.pos.y,
        altitude: 18,
        bodyAngle: this.boss.phys.bodyAngle,
        radius: this.boss.spec.radius,
        jammedTimer: this.boss.empScrambleTimer,
        subsystemHealth: this.boss.getAntiAirSubsystemHealth(),
        threats: this.threatManager.getThreatsForTeam('enemy'),
        obstacles: this.map.obstacles,
        smokeClouds: this.smokeClouds,
        alreadyTargetedByInterceptor: this.threatManager.targetedByInterceptor,
      });
      this.handleAntiAirStepFeedback(
        bossRes,
        this.boss.id,
        'enemy',
        this.boss.phys.pos.x,
        this.boss.phys.pos.y,
        false,
        18
      );
    }
  }

  private handleAntiAirStepFeedback(
    res: ReturnType<MechActor['antiAir']['update']>,
    ownerId: string,
    team: 'player' | 'enemy',
    ux: number,
    uy: number,
    isPlayer: boolean,
    altitude: number
  ): void {
    const distCam = Math.hypot(ux - this.camera.x, uy - this.camera.y);
    const atten = isPlayer ? 0.9 : Math.max(0, 1 - distCam / 1450);
    const pan = isPlayer ? 0 : Math.max(-0.85, Math.min(0.85, (ux - this.camera.x) / 620));

    if (res.launchInterceptor) {
      const li = res.launchInterceptor;
      this.threatManager.targetedByInterceptor.add(li.targetProjectile);
      this.projectiles.spawn({
        team,
        ownerId,
        kind: 'missile',
        missileType: 'interceptor',
        x: li.launchX,
        y: li.launchY,
        angle: li.angle,
        speed: 440,
        damage: 0,
        splashRadius: 0,
        range: 1400,
        piercing: false,
        caliber: 3,
        homingTurnRate: 9.2,
        launchAltitude: altitude + 8,
        isCounterInterceptor: true,
        interceptTarget: li.targetProjectile,
        interceptReliability: li.reliability,
      });
      this.particles.emit(
        'smoke',
        li.launchX,
        li.launchY,
        -Math.cos(li.angle) * 45,
        -Math.sin(li.angle) * 45,
        3.5,
        11,
        0.26,
        '#bae6fd',
        0.75,
        altitude * 0.52 + 10
      );
      this.particles.emit(
        'spark',
        li.launchX,
        li.launchY,
        Math.cos(li.angle) * 70,
        Math.sin(li.angle) * 70,
        3.2,
        0.5,
        0.14,
        '#38bdf8',
        0.95,
        altitude * 0.52 + 10
      );
      if (this.screen === 'playing') {
        this.audio.playInterceptorLaunch(atten, pan);
      }
    }

    if (res.fired) {
      this.particles.emit(
        'spark',
        res.muzzleX,
        res.muzzleY,
        (Math.random() - 0.5) * 65,
        (Math.random() - 0.5) * 65,
        2.4,
        0.5,
        0.09,
        '#fde047',
        0.95,
        altitude * 0.52 + 8
      );
      if (this.screen === 'playing') {
        this.audio.playAntiAirFire(atten, pan, res.caliberScale);
      }
    }

    if (res.intercepted) {
      this.particles.spawnExplosion(res.hitX, res.hitY, 28);
      this.particles.emit('shockwave', res.hitX, res.hitY, 0, 0, 5, 28, 0.24, '#fde047', 0.85, 8);
      for (let k = 0; k < 5; k++) {
        this.particles.emit(
          'spark',
          res.hitX,
          res.hitY,
          (Math.random() - 0.5) * 180,
          (Math.random() - 0.5) * 180,
          2.6,
          0.4,
          0.22,
          '#fbbf24',
          0.95,
          10
        );
      }
      if (this.screen === 'playing') {
        this.audio.playMissileIntercept(atten, pan);
      }
    }

    if (res.overheatedJustNow && isPlayer && this.screen === 'playing') {
      this.audio.playAntiAirOverheat();
    }
  }

  public spawnTrainingTargets(): void {
    const cy = Math.round(this.map.height * 0.5);
    this.enemies = [
      createEnemyMech({ id: `dummy_${this.spawnCounter++}`, archetype: 'scout', x: 1750, y: cy - 380, isDummy: true }),
      createEnemyMech({ id: `dummy_${this.spawnCounter++}`, archetype: 'assault', x: 1880, y: cy, isDummy: true }),
      createEnemyMech({ id: `dummy_${this.spawnCounter++}`, archetype: 'heavy', x: 1780, y: cy + 380, isDummy: true }),
      createEnemyMech({ id: `patrol_${this.spawnCounter++}`, archetype: 'scout', x: 2280, y: cy, isDummy: false }),
    ];
    this.ensureGuaranteedGrapplerPack(1.0);
  }

  public spawnTrainingAirWing(): void {
    if (this.mode !== 'training') return;
    const cy = Math.round(this.map.height * 0.5);
    this.enemies.push(
      createFlyingEnemy({ id: `air_${this.spawnCounter++}`, archetype: 'interceptor', x: 2050, y: cy - 420, difficultyMult: 0.9 }),
      createFlyingEnemy({ id: `air_${this.spawnCounter++}`, archetype: 'rocket_hunter', x: 2220, y: cy - 60, difficultyMult: 0.9 }),
      createFlyingEnemy({ id: `air_${this.spawnCounter++}`, archetype: 'sky_breaker', x: 2380, y: cy + 360, difficultyMult: 0.9 })
    );
    this.pushRadio('Range Control', 'Hostile aerial wing deployed: Vesper-07, Harrier-11, and Goliath-14 airborne.');
    this.pushHudSnapshot();
  }

  public switchTrainingUnit(classId: MechClassId): void {
    if (this.mode !== 'training') return;
    const oldPos = { ...this.player.phys.pos };
    const oldAngle = this.player.phys.bodyAngle;
    const oldAim = this.player.phys.aimAngle;
    // Sandbox isolation: NEVER overwrite normal SaveData.selectedUnit
    this.grapple.reset();
    this.afterimages.clear();
    this.player = createPlayableMech({
      id: 'player',
      callsign: 'WARDOG-1',
      isPlayer: true,
      classId,
      x: oldPos.x,
      y: oldPos.y,
      angle: oldAngle,
      customization: this.save.customLoadouts[classId],
    });
    this.player.phys.aimAngle = oldAim;
    this.player.transformCooldownTimer = this.playerTransformCooldown;
    const bootTrig = this.bootSequence.start(classId, true);
    this.audio.playBootStageSound(bootTrig.stage, bootTrig.mechClass, bootTrig.abbreviated);
    this.pushRadio('Sandbox Control', `Switched chassis to ${this.player.spec.code} ${this.player.spec.name}.`);
    this.pushHudSnapshot();
  }

  public triggerTrainingLimbDamage(): void {
    if (this.mode !== 'training') return;
    const h = this.player.health;
    h.leftLegs = h.leftLegs > h.maxLeftLegs * 0.2 ? Math.round(h.maxLeftLegs * 0.12) : 0;
    h.armor = Math.max(0, h.armor - 45);
    this.showWarning('LEFT LEG ACTUATORS CRIPPLED — OBSERVE LIMP GAIT');
    this.audio.playWarningAlarm();
    this.pushHudSnapshot();
  }

  public repairTrainingPlayer(): void {
    if (this.mode !== 'training') return;
    repairComponents(this.player.health, 9999);
    for (const a of this.allies) {
      if (a.alive) repairComponents(a.health, 9999);
    }
    this.warningMessage = null;
    this.pushRadio('Sandbox Control', 'Player and allied squad health restored to 100%.');
    this.pushHudSnapshot();
  }

  public toggleTrainingGodMode(): void {
    this.trainingGodMode = !this.trainingGodMode;
    this.pushHudSnapshot();
  }

  // ==================== FULL SANDBOX MODE CONTROLS ====================

  public sandboxSpawnEntry(
    entryId: string,
    count = 1,
    teamOverride?: SandboxTeamChoice,
    behaviorOverride?: SandboxBehaviorMode
  ): void {
    if (this.mode !== 'training') return;
    const registry = buildSandboxRegistry();
    const entry = registry.find((e) => e.id === entryId);
    if (!entry) return;

    if (entry.kind === 'switch_player' && entry.mechClassId) {
      this.switchTrainingUnit(entry.mechClassId);
      return;
    }

    const behavior = behaviorOverride ?? this.sandboxBehaviorMode;
    const clampedCount = Math.max(1, Math.min(5, count));

    if (entry.kind === 'boss' && entry.bossVariantId) {
      this.spawnTrainingBoss(entry.bossVariantId);
      if (this.boss) {
        this.boss.applyTuningOverrides({
          healthMult: this.trainingBossTuning.healthMult,
          speedMult: this.sandboxSpeedMult,
          aggressionMult: this.sandboxAggressionMult,
        });
        this.sandboxSpawnHistory.push({ kind: 'boss', id: this.boss.id });
      }
      this.pushHudSnapshot();
      return;
    }

    const activeTotal = this.allies.filter((a) => a.alive).length + this.enemies.filter((e) => e.alive).length;
    const allowed = Math.max(0, SANDBOX_MAX_ACTIVE_UNITS - activeTotal);
    const team: SandboxTeamChoice = entry.supportsTeamToggle && teamOverride ? teamOverride : entry.defaultTeam;

    if (entry.enemyArchetype === 'grappler') {
      if (allowed < GRAPPLER_GROUP_SIZE) {
        this.showWarning(`SANDBOX PACK NEEDS ${GRAPPLER_GROUP_SIZE} SLOTS — CLEAR UNITS FIRST`);
        this.pushHudSnapshot();
        return;
      }
      const ang = (Math.PI * 2 * this.spawnCounter) / 7 + (team === 'player' ? Math.PI : 0);
      const anchorDist = team === 'player' ? 220 : 540;
      const anchorPos = {
        x: Math.max(160, Math.min(this.map.width - 160, this.player.phys.pos.x + Math.cos(ang) * anchorDist)),
        y: Math.max(160, Math.min(this.map.height - 160, this.player.phys.pos.y + Math.sin(ang) * anchorDist)),
      };
      const pack = createGrapplerGroup({
        groupId: `sb_grp_${this.spawnCounter}`,
        baseSpawnIndex: this.spawnCounter,
        anchorPos,
        mapWidth: this.map.width,
        mapHeight: this.map.height,
        obstacles: this.map.obstacles,
        difficultyMult: 1.0,
        playerPos: this.player.phys.pos,
      });
      this.spawnCounter += pack.length;
      for (const spawned of pack) {
        spawned.team = team;
        spawned.sandboxBehavior = behavior;
        if (this.sandboxSpeedMult !== 1.0) {
          spawned.physCfg.maxSpeed = Math.round(spawned.physCfg.maxSpeed * this.sandboxSpeedMult);
          spawned.physCfg.acceleration = Math.round(spawned.physCfg.acceleration * this.sandboxSpeedMult);
        }
        if (team === 'player') {
          this.allies.push(spawned);
          this.sandboxSpawnHistory.push({ kind: 'ally', id: spawned.id });
        } else {
          this.enemies.push(spawned);
          this.sandboxSpawnHistory.push({ kind: 'enemy', id: spawned.id });
        }
      }
      this.pushRadio('Sandbox Control', `Deployed 5x Raptis-05 Grappler Pack [${team === 'player' ? 'FRIENDLY' : 'HOSTILE'}].`);
      this.pushHudSnapshot();
      return;
    }

    const toSpawn = Math.min(clampedCount, allowed);
    if (toSpawn <= 0) {
      this.showWarning(`SANDBOX UNIT LIMIT REACHED (${SANDBOX_MAX_ACTIVE_UNITS}) — CLEAR UNITS FIRST`);
      this.pushHudSnapshot();
      return;
    }

    for (let i = 0; i < toSpawn; i++) {
      const angle = (Math.PI * 2 * (this.spawnCounter + i)) / Math.max(3, toSpawn + 2) + (team === 'player' ? Math.PI : 0);
      const dist = team === 'player' ? 160 + (i % 3) * 65 : 460 + (i % 4) * 95;
      const sx = Math.max(140, Math.min(this.map.width - 140, this.player.phys.pos.x + Math.cos(angle) * dist));
      const sy = Math.max(140, Math.min(this.map.height - 140, this.player.phys.pos.y + Math.sin(angle) * dist));

      let spawned: MechActor | null = null;

      if (entry.kind === 'revenant' && entry.mechClassId) {
        spawned = RevenantVariantFactory.createRevenant({
          sourceClassId: entry.mechClassId,
          x: sx,
          y: sy,
          angle: Math.atan2(this.player.phys.pos.y - sy, this.player.phys.pos.x - sx),
          team,
        });
        spawned.sandboxManual = true;
        this.audio.playRevenantSound('startup');
      } else if (entry.kind === 'mech_unit' && entry.mechClassId) {
        spawned = createPlayableMech({
          id: `sb_mech_${this.spawnCounter++}`,
          callsign: `${team === 'player' ? 'ALLY' : 'ROGUE'}-${entry.code}`,
          isPlayer: false,
          classId: entry.mechClassId,
          x: sx,
          y: sy,
          angle: Math.atan2(this.player.phys.pos.y - sy, this.player.phys.pos.x - sx),
        });
        spawned.team = team;
        spawned.squadRole = entry.mechClassId === 'engineer' ? 'support' : entry.mechClassId === 'sniper' || entry.mechClassId === 'recon' ? 'recon' : 'assault';
        spawned.formationSlot = this.allies.length % 3;
      } else if (entry.kind === 'flying_enemy' && entry.enemyArchetype) {
        spawned = createFlyingEnemy({
          id: `sb_air_${this.spawnCounter++}`,
          archetype: entry.enemyArchetype as 'interceptor' | 'rocket_hunter' | 'sky_breaker',
          x: sx,
          y: sy,
          difficultyMult: 1.0,
        });
        spawned.team = team;
      } else if (entry.kind === 'enemy_archetype' && entry.enemyArchetype) {
        spawned = createEnemyMech({
          id: `sb_en_${this.spawnCounter++}`,
          archetype: entry.enemyArchetype,
          x: sx,
          y: sy,
          isDummy: behavior === 'idle',
        });
        spawned.team = team;
      }

      if (spawned) {
        spawned.sandboxBehavior = behavior;
        if (this.sandboxSpeedMult !== 1.0) {
          spawned.physCfg.maxSpeed = Math.round(spawned.physCfg.maxSpeed * this.sandboxSpeedMult);
          spawned.physCfg.acceleration = Math.round(spawned.physCfg.acceleration * this.sandboxSpeedMult);
        }
        if (team === 'player') {
          this.allies.push(spawned);
          this.sandboxSpawnHistory.push({ kind: 'ally', id: spawned.id });
        } else {
          this.enemies.push(spawned);
          this.sandboxSpawnHistory.push({ kind: 'enemy', id: spawned.id });
        }
      }
    }

    this.pushRadio('Sandbox Control', `Deployed ${toSpawn}x ${entry.name} [${team === 'player' ? 'FRIENDLY' : 'HOSTILE'}].`);
    this.pushHudSnapshot();
  }

  public sandboxRemoveLast(): void {
    if (this.mode !== 'training') return;
    const last = this.sandboxSpawnHistory.pop();
    if (!last) return;
    if (last.kind === 'boss') {
      this.boss = null;
    } else if (last.kind === 'ally') {
      this.allies = this.allies.filter((a) => a.id !== last.id);
    } else {
      this.enemies = this.enemies.filter((e) => e.id !== last.id);
    }
    this.pushHudSnapshot();
  }

  public sandboxClearAll(): void {
    if (this.mode !== 'training') return;
    this.enemies = [];
    this.boss = null;
    this.bossDeployables = [];
    this.hazards = [];
    this.incomingWarnings = [];
    this.projectiles.clear();
    this.sandboxSpawnHistory = [];
    this.pushRadio('Sandbox Control', 'All spawned hostile units and bosses cleared.');
    this.pushHudSnapshot();
  }

  public sandboxResetEnvironment(): void {
    if (this.mode !== 'training') return;
    this.startTraining(this.player.classId);
  }

  public sandboxToggleSimPause(): void {
    if (this.mode !== 'training') return;
    this.sandboxSimPaused = !this.sandboxSimPaused;
    this.pushHudSnapshot();
  }

  public sandboxToggleInfiniteAmmo(): void {
    if (this.mode !== 'training') return;
    this.sandboxInfiniteAmmo = !this.sandboxInfiniteAmmo;
    this.pushHudSnapshot();
  }

  public sandboxSetBehavior(behavior: SandboxBehaviorMode): void {
    if (this.mode !== 'training') return;
    this.sandboxBehaviorMode = behavior;
    for (const e of this.enemies) {
      e.sandboxBehavior = behavior;
      e.isDummy = behavior === 'idle';
    }
    this.pushHudSnapshot();
  }

  public sandboxSetTuning(partial: Partial<{ speedMult: number; aggressionMult: number }>): void {
    if (this.mode !== 'training') return;
    if (partial.speedMult !== undefined) {
      this.sandboxSpeedMult = Math.max(0.5, Math.min(2.2, partial.speedMult));
      this.trainingBossTuning.speedMult = this.sandboxSpeedMult;
    }
    if (partial.aggressionMult !== undefined) {
      this.sandboxAggressionMult = Math.max(0.4, Math.min(2.5, partial.aggressionMult));
      this.trainingBossTuning.aggression = this.sandboxAggressionMult;
    }
    if (this.boss && this.boss.alive) {
      this.boss.applyTuningOverrides({
        healthMult: this.trainingBossTuning.healthMult,
        speedMult: this.sandboxSpeedMult,
        aggressionMult: this.sandboxAggressionMult,
      });
    }
    this.pushHudSnapshot();
  }

  private updateDynamicMusic(force = false): void {
    let desired: MusicState = 'menu';
    if (this.screen === 'gameover') {
      desired = this.victory ? 'victory' : 'defeat';
    } else if (this.screen === 'playing') {
      if (this.victoryCinematic.active) {
        desired = 'victory';
      } else if (
        this.revenantManager.state.warningTimer > 0 ||
        this.enemies.some((e) => e.alive && e.isRevenant)
      ) {
        desired = 'revenant';
      } else if (this.boss && (this.boss.alive || this.boss.destroying)) {
        desired = 'boss';
      } else {
        const liveHostiles = this.enemies.filter((e) => e.alive && !e.isDummy).length;
        const hullRatio = this.player.health.chassis / Math.max(1, this.player.health.maxChassis);
        if (this.mode === 'freeroam' || (this.mode === 'training' && liveHostiles === 0)) {
          desired = 'exploration';
        } else if (liveHostiles >= 6 || (liveHostiles > 0 && hullRatio < 0.38)) {
          desired = 'heavy_combat';
        } else if (liveHostiles > 0) {
          desired = 'combat';
        } else {
          desired = 'suspense';
        }
      }
    }

    if (force || desired !== this.audio.music.currentState) {
      const fadeSec = desired === 'revenant' || desired === 'boss' ? 1.5 : 2.2;
      this.audio.setMusicState(desired, fadeSec);
    }
    this.audio.music.setDucking(Boolean(this.radioManager.active));
  }

  public issueSquadOrder(order: SquadOrder): void {
    const label = this.squadCtrl.issueOrder(order, this.allies, this.player, this.mouseWorld, this.enemies);
    this.squadWheelOpen = false;
    this.audio.playUiClick();
    this.pushRadio('Wardog-1', `Squad Order: ${label}`);
    if (order === 'follow') {
      this.radioManager.trigger('order_squad_follow');
    } else if (order === 'hold' || order === 'defend') {
      this.radioManager.trigger('order_squad_hold');
    } else if (order === 'attack_target' || order === 'focus') {
      this.radioManager.trigger('order_squad_attack');
    } else {
      this.radioManager.trigger('order_squad_regroup');
    }
    this.pushHudSnapshot();
  }

  private pushRadio(speaker: string, text: string): void {
    this.radioFeed = [{ speaker, text, id: this.radioCounter++ }, ...this.radioFeed].slice(0, 4);
    if (this.screen === 'playing' && !this.radioManager.active) {
      this.audio.playRadioTransmission();
    }
  }

  private showWarning(msg: string): void {
    this.warningMessage = msg;
    this.warningTimer = 3.2;
  }

  private updateFrame(dt: number): void {
    this.simTime += dt;

    if (this.screen === 'paused' || this.screen === 'hangar' || this.screen === 'settings' || this.screen === 'briefing' || this.screen === 'skirmish_setup') {
      this.audio.updateContinuousAudio({
        active: false,
        speedRatio: 0,
        isFlying: false,
        airborne: false,
        boosting: false,
        flightHeat: 0,
        bossProximity: 0,
        grappleAttached: false,
        grappleTension: 0,
      });
      return;
    }

    if (this.warningTimer > 0) {
      this.warningTimer -= dt;
      if (this.warningTimer <= 0) this.warningMessage = null;
    }

    // Hitstop pauses simulation physics briefly while camera shake & particles feel punchy
    this.camera.setShakeLevel(this.save.settings.cameraShakeLevel);
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.camera.update(
        dt,
        this.player.phys.pos,
        this.player.phys.vel,
        this.mouseWorld,
        getCameraShakeScale(this.save.settings),
        this.map.width,
        this.map.height,
        this.viewW,
        this.viewH
      );
      return;
    }

    this.accumulator += dt;
    while (this.accumulator >= FIXED_DT) {
      this.stepSimulation(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.hudPushTimer += dt;
    const hudInterval = this.takedowns.getPlayerMinigameSession() ? 0.016 : 0.08;
    if (this.hudPushTimer >= hudInterval) {
      this.hudPushTimer = 0;
      this.pushHudSnapshot();
    }

    // Update continuous engine, Valkyrie rocket thrust, boss proximity reactor, and grapple cable audio
    const playerSpeed = Math.hypot(this.player.phys.vel.x, this.player.phys.vel.y);
    const speedRatio = Math.min(1, playerSpeed / Math.max(40, this.player.physCfg.maxSpeed));
    const bossDist =
      this.boss && (this.boss.alive || this.boss.destroying)
        ? Math.hypot(this.boss.phys.pos.x - this.player.phys.pos.x, this.boss.phys.pos.y - this.player.phys.pos.y)
        : 9999;
    const bossProximity = this.boss && (this.boss.alive || this.boss.destroying) ? Math.max(0, 1 - bossDist / 1600) : 0;

    this.audio.updateContinuousAudio({
      active: this.screen === 'playing' && this.player.alive,
      speedRatio,
      isFlying: Boolean(this.player.spec.canFly),
      airborne: Boolean(this.player.flight?.isAirborne),
      boosting: Boolean(this.player.flight?.boosting),
      flightHeat: Math.max(0, Math.min(1, (this.player.flight?.heat ?? 0) / 100)),
      bossProximity,
      grappleAttached: this.grapple.state === 'attached',
      grappleTension: this.grapple.tension,
    });
  }

  private stepSimulation(dt: number): void {
    if (this.screen === 'playing') {
      this.elapsedSeconds += dt;
    }
    if (this.bossIntroTimer > 0) {
      this.bossIntroTimer = Math.max(0, this.bossIntroTimer - dt);
    }
    if (this.empDisruptTimer > 0) {
      this.empDisruptTimer = Math.max(0, this.empDisruptTimer - dt);
    }
    if (this.nuclearDimAlpha > 0) {
      this.nuclearDimAlpha = Math.max(0, this.nuclearDimAlpha - dt * 0.14);
    }

    // Convert live mouse coordinates to world space
    this.mouseWorld = this.camera.screenToWorld(this.mouseScreen.x, this.mouseScreen.y, this.viewW, this.viewH);

    // 0a. Victory Cinematic Camera & Slow-Mo Settlement (triggers once per win, skippable)
    if (this.screen === 'playing' && this.victoryCinematic.active) {
      const vcCam = this.victoryCinematic.update(dt);
      this.radioManager.update(dt);
      if (this.victoryCinematic.phase === 'awards' && !this.victoryAwardsAudioPlayed) {
        this.victoryAwardsAudioPlayed = true;
        this.audio.playVictoryCinematicSound('awards');
      }
      if (vcCam) {
        this.particles.update(dt * vcCam.timeScale);
        this.camera.targetZoom = vcCam.zoom;
        this.camera.update(
          dt,
          { x: vcCam.x, y: vcCam.y },
          { x: 0, y: 0 },
          { x: vcCam.x, y: vcCam.y },
          0,
          this.map.width,
          this.map.height,
          this.viewW,
          this.viewH
        );
      }
      return;
    }

    // Dynamic CC0 soundtrack intensity evaluation
    this.musicUpdateTimer += dt;
    if (this.musicUpdateTimer >= 0.35) {
      this.musicUpdateTimer = 0;
      this.updateDynamicMusic();
    }

    // Sandbox simulation pause freeze (keeps UI, spawning & camera active)
    if (this.screen === 'playing' && this.mode === 'training' && this.sandboxSimPaused) {
      return;
    }

    // Sandbox infinite ammunition option
    if (this.screen === 'playing' && this.mode === 'training' && this.sandboxInfiniteAmmo) {
      this.player.primary.ammo = this.player.primary.spec.magazineSize;
      this.player.primary.reloading = false;
      this.player.secondary.ammo = this.player.secondary.spec.magazineSize;
      this.player.secondary.reloading = false;
    }

    if (this.screen === 'playing' && this.playerTransformCooldown > 0) {
      this.playerTransformCooldown = Math.max(0, this.playerTransformCooldown - dt);
      if (this.player) {
        this.player.transformCooldownTimer = this.playerTransformCooldown;
      }
    }

    // 0b. Step Mech Boot-Up Sequence, Military Radio Manager, Performance Tracker & Revenant Spawn
    if (this.screen === 'playing') {
      const bootStep = this.bootSequence.update(dt);
      if (bootStep) {
        this.audio.playBootStageSound(bootStep.stage, bootStep.mechClass, bootStep.abbreviated);
        if (bootStep.stage === 4 && !bootStep.abbreviated) {
          this.radioManager.trigger('boot_online', { force: true });
        }
      }
      this.radioManager.update(dt);

      const aliveIds = new Set<string>();
      if (this.player.alive) aliveIds.add(this.player.id);
      for (const a of this.allies) {
        if (a.alive) aliveIds.add(a.id);
      }
      this.performanceTracker.tickSurvival(dt, aliveIds);

      const revStep = this.revenantManager.update(dt, this.elapsedSeconds);
      if (revStep.startInterference) {
        this.audio.playRevenantSound('interference');
        this.pushRadio('OVERWATCH', 'UNKNOWN HOSTILE SIGNATURE DETECTED — CORRUPTED SIGNAL INTERFERENCE!');
      }
      if (revStep.shouldSpawnNow && revStep.sourceClassId) {
        const hasGuaranteedRev = this.enemies.some((e) => e.alive && e.isRevenant && !e.sandboxManual);
        if (!hasGuaranteedRev) {
          const pt = this.revenantManager.pickSafeEntrancePoint(
            this.player.phys.pos,
            this.map.width,
            this.map.height,
            this.map.obstacles
          );
          const rev = RevenantVariantFactory.createRevenant({
            sourceClassId: revStep.sourceClassId,
            x: pt.x,
            y: pt.y,
            angle: Math.atan2(this.player.phys.pos.y - pt.y, this.player.phys.pos.x - pt.x),
          });
          resolveObstacleCollisions(rev.phys.pos, rev.phys.vel, rev.spec.radius, this.map.obstacles, this.map.width, this.map.height);
          rev.legs.reset(rev.spec.legs, rev.phys.pos, rev.phys.bodyAngle);
          this.enemies.push(rev);
          this.audio.playRevenantSound('startup');
          this.radioManager.trigger('revenant_intro', { force: true });
          this.camera.addShake(0.45, 'explosion');
        }
      }

      if (this.deployOrderTimer > 0 && !this.bootSequence.active) {
        this.deployOrderTimer -= dt;
        if (this.deployOrderTimer <= 0) {
          if (this.boss && this.boss.alive) {
            this.radioManager.trigger('boss_detected');
          } else if (this.mode !== 'training') {
            this.radioManager.trigger('deploy');
          }
        }
      }

      // Continuous Raptis-05 Grappler Pack Spawner (every 10-15 seconds while combat is active)
      if (this.mode !== 'training') {
        const hasPrimaryThreats =
          this.mode === 'freeroam'
            ? true
            : this.mode === 'boss_challenge'
              ? Boolean(this.boss && (this.boss.alive || this.boss.destroying))
              : Boolean(this.boss && (this.boss.alive || this.boss.destroying)) ||
                (this.revenantManager.state.scheduled && !this.revenantManager.state.spawned) ||
                this.enemies.some((e) => e.alive && e.enemyArchetype !== 'grappler');
        let activeGrapplerCount = 0;
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.alive && e.enemyArchetype === 'grappler') activeGrapplerCount++;
        }
        if (this.grapplerSpawnScheduler.step(dt, activeGrapplerCount, hasPrimaryThreats)) {
          this.spawnGrapplerPack(this.currentDifficultyMult, 'periodic');
        }
      }
    }

    // 0c. Step Optical Cloak stealth meters smoothly for all active mechs
    if (this.player.stealth?.supported && this.player.alive) {
      this.player.stealth.detectedByEnemy = this.enemies.some(
        (e) => e.alive && !e.isDummy && canDetectUnit(e, this.player, this.map.obstacles)
      );
      stepStealthState(this.player.stealth, dt, {
        jammed: this.player.jammedTimer > 0,
        inTakedown: this.takedowns.isUnitLocked(this.player.id),
        isEnemy: false,
      });
    }
    for (let i = 0; i < this.allies.length; i++) {
      const a = this.allies[i];
      if (!a.alive || !a.stealth?.supported) continue;
      a.stealth.detectedByEnemy = this.enemies.some(
        (e) => e.alive && !e.isDummy && canDetectUnit(e, a, this.map.obstacles)
      );
      stepStealthState(a.stealth, dt, {
        jammed: a.jammedTimer > 0,
        inTakedown: this.takedowns.isUnitLocked(a.id),
        isEnemy: false,
      });
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive || !e.stealth?.supported) continue;
      e.stealth.detectedByEnemy = [this.player, ...this.allies].some(
        (f) => f.alive && canDetectUnit(f, e, this.map.obstacles)
      );
      stepStealthState(e.stealth, dt, {
        jammed: e.jammedTimer > 0,
        inTakedown: this.takedowns.isUnitLocked(e.id),
        isEnemy: true,
      });
    }

    // 1. Update Player (or Title autonomous demo)
    if (this.screen === 'title') {
      this.stepTitleShowcase(dt);
    } else if (this.screen === 'playing') {
      if (this.takedowns.isUnitLocked(this.player.id)) {
        this.player.hitFlashTimer = Math.max(0, this.player.hitFlashTimer - dt);
        this.player.specialCooldownTimer = Math.max(0, this.player.specialCooldownTimer - dt);
        if (this.takedowns.getPlayerMinigameSession()) {
          const kb = this.save.settings.keyBindings;
          const left = this.keysHeld.has(kb.moveLeft) || this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft');
          const right = this.keysHeld.has(kb.moveRight) || this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight');
          const wishDir: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;
          this.takedowns.setPlayerDodgeInput(wishDir, wishDir !== 0 ? null : undefined);
        }
      } else if (this.bootSequence.isControlsUnlocked()) {
        this.stepPlayerInput(dt);
      }
    }

    const bossTargetSummary =
      this.boss && this.boss.alive && !this.boss.destroying
        ? { pos: this.boss.phys.pos, alive: true, radius: this.boss.spec.radius }
        : null;

    // Update Overwatch Barrage rapid 5-shell salvo
    if (this.player.alive && this.overwatchBarrage.active) {
      const obAction = this.overwatchBarrage.update(dt);
      this.player.gantryCycle = this.overwatchBarrage.gantryPhase;
      this.player.mortarPitch = 0.88;
      if (obAction) {
        const spec = MORTAR_AMMO_SPECS[obAction.ammoType];
        const mx = this.player.phys.pos.x + Math.cos(this.player.phys.aimAngle) * 32;
        const my = this.player.phys.pos.y + Math.sin(this.player.phys.aimAngle) * 32;
        const isApocBarrage = this.player.spec.specialAbility.kind === 'colossus_apocalypse_salvo';
        this.projectiles.spawn({
          team: 'player',
          ownerId: this.player.id,
          kind: 'artillery',
          x: mx,
          y: my,
          angle: this.player.phys.aimAngle,
          speed: spec.flightSpeed * 1.15,
          damage: Math.round(this.player.primary.spec.damage * (isApocBarrage ? 0.92 : 0.78) * spec.damageMult),
          splashRadius: Math.round(spec.splashRadius * (isApocBarrage ? 1.45 : 1.0)),
          range: 2000,
          piercing: spec.piercing,
          caliber: 11,
          targetX: obAction.fireTarget.x,
          targetY: obAction.fireTarget.y,
          mortarAmmo: obAction.ammoType,
          isPlayerMortar: true,
        });
        this.particles.spawnMuzzleFlash(mx, my, this.player.phys.aimAngle, 11, false);
        this.audio.playWeaponFire('artillery', 0.9, false, 10);
        this.camera.addShake(0.32);
        this.boss?.notifyIncomingThreat(obAction.fireTarget.x, obAction.fireTarget.y);
      }
    } else if (this.player.classId === 'colossus') {
      const sol = this.getMortarSolution();
      if (sol) {
        const targetPitch = 0.35 + (1 - sol.clampedDist / sol.maxRange) * 0.55;
        this.player.mortarPitch = (this.player.mortarPitch ?? 0.6) + (targetPitch - (this.player.mortarPitch ?? 0.6)) * Math.min(1, dt * 6);
      }
      this.player.gantryCycle = this.player.primary.reloading
        ? (Math.sin(this.simTime * 7) * 0.5 + 0.5)
        : 0;
    }

    // 2. Update Allies (5-unit squad coordination, revive channeling, artillery evasion, teleport dash)
    this.squadCtrl.refreshSquadCoordination(this.allies, dt);
    const artilleryDangerZones = this.incomingWarnings.map((w) => ({
      x: w.x,
      y: w.y,
      radius: w.radius,
    }));

    for (let i = 0; i < this.allies.length; i++) {
      const ally = this.allies[i];
      if ((ally.reviveCooldownTimer ?? 0) > 0) {
        ally.reviveCooldownTimer = Math.max(0, (ally.reviveCooldownTimer ?? 0) - dt);
      }
      if (!ally.alive) {
        ally.koTimer = Math.max(0, ally.koTimer - dt);
        stepAegisArmor(ally, dt);
        continue;
      }
      if (this.takedowns.isUnitLocked(ally.id)) {
        ally.hitFlashTimer = Math.max(0, ally.hitFlashTimer - dt);
        ally.specialCooldownTimer = Math.max(0, ally.specialCooldownTimer - dt);
        stepAegisArmor(ally, dt);
        continue;
      }
      if (ally.enemyArchetype === 'grappler') {
        ally.hitFlashTimer = Math.max(0, ally.hitFlashTimer - dt);
        stepGrapplerEnemyAI(ally, this.enemies, [this.player, ...this.allies], this.map, dt);
        continue;
      }
      const ai = this.squadCtrl.computeAllyAI(
        ally,
        this.player,
        this.allies,
        this.enemies,
        this.map,
        this.navGrid,
        dt,
        bossTargetSummary,
        artilleryDangerZones,
        this.save.unlockedUnits
      );

      if (ai.transformTargetId) {
        this.triggerTransformation(ally, ai.transformTargetId);
      }

      if (ai.wantsStealth && ally.stealth?.supported && !ally.stealth.active) {
        forceActivateStealth(ally.stealth);
      }

      if (
        ai.executionTargetId &&
        ally.specialCooldownTimer <= 0 &&
        !this.takedowns.isUnitInRecovery(ally.id)
      ) {
        const execTarget = this.enemies.find((e) => e.id === ai.executionTargetId && e.alive && !e.downed);
        if (execTarget && this.executePhantomTeleport(ally, execTarget, null)) {
          continue;
        }
      }

      // Handle coordinated revive channeling & unreachable timeout fallback
      if (ai.revivingTargetId) {
        const downedTarget = this.allies.find((a) => a.id === ai.revivingTargetId && isEligibleForRevive(a));
        if (downedTarget) {
          ally.reviveStuckTimer = 0;
          const nearbyFabBoost = [this.player, ...this.allies].some(
            (u) =>
              u.alive &&
              u.specialActiveTimer > 0 &&
              u.spec.specialAbility.kind === 'engineer_fabricator_rig' &&
              Math.hypot(u.phys.pos.x - downedTarget.phys.pos.x, u.phys.pos.y - downedTarget.phys.pos.y) <= 360
          );
          const reviveRateMult = ally.spec.specialAbility.kind === 'engineer_fabricator_rig' || nearbyFabBoost ? 2.5 : 1.0;
          downedTarget.reviveProgress = Math.min(
            1,
            (downedTarget.reviveProgress ?? 0) + (dt / REVIVE_CHANNEL_DURATION) * reviveRateMult
          );
          if (Math.random() < dt * 12) {
            this.particles.emit(
              'repair',
              downedTarget.phys.pos.x + (Math.random() - 0.5) * 18,
              downedTarget.phys.pos.y + (Math.random() - 0.5) * 18,
              0,
              -28,
              5,
              1.5,
              0.38,
              '#34d399',
              0.92,
              10
            );
          }
          if (downedTarget.reviveProgress >= 1) {
            if (completeSquadmateRevive(ally, downedTarget)) {
              this.particles.emit('shockwave', downedTarget.phys.pos.x, downedTarget.phys.pos.y, 0, 0, 12, 85, 0.4, '#34d399', 0.9, 6);
              this.particles.addText(downedTarget.phys.pos.x, downedTarget.phys.pos.y - 26, 'REVIVED', '#34d399');
              this.performanceTracker.recordRepair(ally.id, downedTarget.health.maxChassis * 0.6);
              if (this.screen === 'playing') {
                this.pushRadio(ally.callsign, `${downedTarget.callsign} restored and back in the fight.`);
              }
            }
          }
        }
      } else if (ally.reviveTargetId) {
        // Moving toward downed teammate; track unreachable timeout so another reviver can take over
        const spd = Math.hypot(ally.phys.vel.x, ally.phys.vel.y);
        if (spd < 18) {
          ally.reviveStuckTimer = (ally.reviveStuckTimer ?? 0) + dt;
          if (ally.reviveStuckTimer >= REVIVE_UNREACHABLE_TIMEOUT) {
            ally.lastFailedReviveTargetId = ally.reviveTargetId;
            ally.reviveTargetId = null;
          }
        } else {
          ally.reviveStuckTimer = Math.max(0, (ally.reviveStuckTimer ?? 0) - dt * 0.5);
        }
      }

      if (ai.triggerDash && ally.dash?.canDash()) {
        const prevX = ally.phys.pos.x;
        const prevY = ally.phys.pos.y;
        const dashed = ally.dash.trigger(ally.phys, ai.wishX, ai.wishY, 0, {
          obstacles: this.map.obstacles,
          radius: ally.spec.radius,
          mapWidth: this.map.width,
          mapHeight: this.map.height,
        });
        if (dashed && ally.dash.spec.teleportMode) {
          this.spawnTeleportDashVfx(ally, prevX, prevY, ally.phys.pos.x, ally.phys.pos.y);
        }
      }

      this.updateSingleMech(ally, {
        wishX: ai.wishX,
        wishY: ai.wishY,
        sprint: ai.sprint,
        firePrimary: ai.firePrimary,
        fireSecondary: ai.fireSecondary,
        useSpecial: ai.useSpecial,
        targetWorld: {
          x: ally.phys.pos.x + Math.cos(ai.aimAngle) * 350,
          y: ally.phys.pos.y + Math.sin(ai.aimAngle) * 350,
        },
        dt,
      });
    }

    // Step pose-accurate afterimage pool & audio cooldowns
    this.afterimages.update(dt);
    if (this.rocketBoostAudioCooldown > 0) this.rocketBoostAudioCooldown = Math.max(0, this.rocketBoostAudioCooldown - dt);
    if (this.lockBeepCooldown > 0) this.lockBeepCooldown = Math.max(0, this.lockBeepCooldown - dt);

    // 3. Update Enemies (Ground + Rocket-Powered Flying Enemies) with Attack Token Pool & Smoke LOS disruption
    const attackTokens = { used: 0, max: this.mode === 'survival' ? 4 : 3 };
    const friendlies = [this.player, ...this.allies];
    let lockedByAir = false;
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive) {
        enemy.koTimer = Math.max(0, enemy.koTimer - dt);
        continue;
      }

      if (this.takedowns.isUnitLocked(enemy.id)) {
        enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
        enemy.specialCooldownTimer = Math.max(0, enemy.specialCooldownTimer - dt);
        const distPlayer = Math.hypot(enemy.phys.pos.x - this.player.phys.pos.x, enemy.phys.pos.y - this.player.phys.pos.y);
        const sensorFactor = 0.4 + 0.6 * (this.player.health.sensors / Math.max(1, this.player.health.maxSensors));
        const ecmBoost = this.player.specialActiveTimer > 0 && this.player.spec.specialAbility.kind === 'ecm_pulse' ? 2.5 : 1.0;
        enemy.detected =
          distPlayer <= this.player.stats.sensorRange * sensorFactor * ecmBoost &&
          canDetectUnit(this.player, enemy, this.map.obstacles, ecmBoost > 1);
        continue;
      }

      if (isFlyingArchetype(enemy.enemyArchetype)) {
        const airAi = computeFlyingEnemyAI(enemy, friendlies, this.enemies, this.map, dt, attackTokens);
        stepFlyingEnemyMotion(enemy, airAi, this.map, dt);
        if (airAi.lockingPlayer) lockedByAir = true;

        const distCam = Math.hypot(enemy.phys.pos.x - this.camera.x, enemy.phys.pos.y - this.camera.y);
        const atten = Math.max(0, 1 - distCam / 1400);
        const smokeBlocked = isPointInSmoke(this.player.phys.pos.x, this.player.phys.pos.y, this.smokeClouds);
        this.updateWeaponRuntime(
          enemy,
          enemy.primary,
          airAi.firePrimary && (!smokeBlocked || Math.random() < 0.25),
          {
            x: enemy.phys.pos.x + Math.cos(airAi.aimAngle) * 400,
            y: enemy.phys.pos.y + Math.sin(airAi.aimAngle) * 400,
          },
          dt,
          atten,
          false
        );
        this.updateWeaponRuntime(
          enemy,
          enemy.secondary,
          airAi.fireSecondary && !smokeBlocked,
          {
            x: enemy.phys.pos.x + Math.cos(airAi.aimAngle) * 420,
            y: enemy.phys.pos.y + Math.sin(airAi.aimAngle) * 420,
          },
          dt,
          atten,
          false
        );
        if (enemy.health.chassis < enemy.health.maxChassis * 0.45 && Math.random() < dt * 7) {
          this.particles.emit('smoke', enemy.phys.pos.x, enemy.phys.pos.y, (Math.random() - 0.5) * 20, -18, 6, 16, 0.55, '#333842', 0.55, (enemy.flight?.altitude ?? 80) * 0.52, 16);
        }
      } else if (enemy.enemyArchetype === 'grappler') {
        enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
        const gEv = stepGrapplerEnemyAI(enemy, friendlies, this.enemies, this.map, dt);
        const distCam = Math.hypot(enemy.phys.pos.x - this.camera.x, enemy.phys.pos.y - this.camera.y);
        const atten = Math.max(0, 1 - distCam / 1350);
        const pan = Math.max(-0.85, Math.min(0.85, (enemy.phys.pos.x - this.camera.x) / 620));
        if (this.screen === 'playing') {
          if (gEv.launchedHook) this.audio.playGrapplerHookLaunch(atten, pan);
          if (gEv.latchedStructure) this.audio.playGrapplerHookLatch(atten, pan);
          if (gEv.propulsionBurst) this.audio.playGrapplerPropulsion(atten, pan);
          if (gEv.releasedHook) this.audio.playGrapplerHookRelease(atten, pan);
          if (gEv.diveScream) this.audio.playGrapplerAttackScream(Math.max(0.28, atten), pan);
          if (gEv.clampedTarget) {
            this.audio.playGrapplerTargetClamp(Math.max(0.55, atten), pan);
            if (enemy.grapplerState?.attachedTargetId === this.player.id) {
              this.camera.addShake(0.24, 'impact');
            }
          }
          if (gEv.clampedTarget || gEv.feedBite) {
            this.audio.playGrapplerFeeding(Math.max(0.35, atten), pan);
          }
          if (gEv.struggleTick) this.audio.playGrapplerClingStruggle(Math.max(0.45, atten * 0.8), pan);
        }
        if (gEv.feedBite) {
          this.particles.emit(
            'spark',
            enemy.phys.pos.x,
            enemy.phys.pos.y,
            (Math.random() - 0.5) * 90,
            (Math.random() - 0.5) * 90,
            2.4,
            0.4,
            0.18,
            '#fb7185',
            0.9,
            (enemy.grapplerState?.altitude ?? 8) * 0.52 + 6
          );
        }
        const gs = enemy.grapplerState;
        if (gs && (gs.mode === 'swinging' || gs.mode === 'air_launch' || gEv.propulsionBurst) && Math.random() < dt * 22) {
          this.particles.emit(
            'spark',
            enemy.phys.pos.x - Math.cos(enemy.phys.bodyAngle) * 10,
            enemy.phys.pos.y - Math.sin(enemy.phys.bodyAngle) * 10,
            -enemy.phys.vel.x * 0.25 + (Math.random() - 0.5) * 40,
            -enemy.phys.vel.y * 0.25 + (Math.random() - 0.5) * 40,
            2.6,
            0.5,
            0.2,
            gEv.propulsionBurst ? '#fb7185' : '#fbbf24',
            0.9,
            gs.altitude * 0.52 + 4
          );
        }
      } else {
        const ai = computeEnemyAI(
          enemy,
          friendlies,
          this.enemies,
          this.map,
          this.navGrid,
          dt,
          attackTokens,
          this.friendlyDeployables
        );

        if (ai.wantsStealth && enemy.stealth?.supported && !enemy.stealth.active) {
          forceActivateStealth(enemy.stealth);
        }
        if (
          ai.executionTargetId &&
          enemy.specialCooldownTimer <= 0 &&
          !this.takedowns.isUnitInRecovery(enemy.id)
        ) {
          const execTarget = friendlies.find((f) => f.id === ai.executionTargetId && f.alive && !f.downed);
          if (execTarget && this.executePhantomTeleport(enemy, execTarget, null)) {
            enemy.detected = canDetectUnit(this.player, enemy, this.map.obstacles);
            continue;
          }
        }

        const smokeBlocked =
          isPointInSmoke(this.player.phys.pos.x, this.player.phys.pos.y, this.smokeClouds) ||
          doesSegmentCrossSmoke(enemy.phys.pos.x, enemy.phys.pos.y, this.player.phys.pos.x, this.player.phys.pos.y, this.smokeClouds);

        // Extreme REVENANT combat intelligence: high-speed dash bursts, predictive aim, corrupted class surges & violet speed trails
        let revFirePrimary = ai.firePrimary && (!smokeBlocked || Math.random() < 0.2);
        let revFireSecondary = ai.fireSecondary && !smokeBlocked;
        let revTargetWorld = {
          x: enemy.phys.pos.x + Math.cos(ai.aimAngle + (smokeBlocked ? (Math.random() - 0.5) * 0.35 : 0)) * 350,
          y: enemy.phys.pos.y + Math.sin(ai.aimAngle + (smokeBlocked ? (Math.random() - 0.5) * 0.35 : 0)) * 350,
        };

        if (enemy.isRevenant && enemy.alive) {
          enemy.revenantPulsePhase = (enemy.revenantPulsePhase ?? 0) + dt * 5.2;
          enemy.revenantSurgeTimer = Math.max(0, (enemy.revenantSurgeTimer ?? 3.5) - dt);
          const prof = getRevenantProfileForClass(enemy.revenantSourceClass ?? enemy.classId);

          // Predictive lead aiming against fast-moving player/allies
          const nearest = friendlies
            .filter((f) => f.alive)
            .sort(
              (a, b) =>
                Math.hypot(a.phys.pos.x - enemy.phys.pos.x, a.phys.pos.y - enemy.phys.pos.y) -
                Math.hypot(b.phys.pos.x - enemy.phys.pos.x, b.phys.pos.y - enemy.phys.pos.y)
            )[0];
          if (nearest) {
            const dNear = Math.hypot(nearest.phys.pos.x - enemy.phys.pos.x, nearest.phys.pos.y - enemy.phys.pos.y);
            const leadSec = Math.min(0.45, dNear / Math.max(320, enemy.primary.spec.projectileSpeed));
            revTargetWorld = {
              x: nearest.phys.pos.x + nearest.phys.vel.x * leadSec,
              y: nearest.phys.pos.y + nearest.phys.vel.y * leadSec,
            };
            if (dNear < enemy.primary.spec.range * 1.05) {
              revFirePrimary = true;
              if (dNear < enemy.secondary.spec.range * 1.05) revFireSecondary = true;
            }

            // Aggressive dash evasion / flanking burst
            if (enemy.dash && enemy.dash.canDash() && dNear > 170 && dNear < 720 && Math.random() < dt * 1.4) {
              const flankSign = Math.sin(enemy.revenantPulsePhase) >= 0 ? 1 : -1;
              const toAng = Math.atan2(nearest.phys.pos.y - enemy.phys.pos.y, nearest.phys.pos.x - enemy.phys.pos.x) + flankSign * 0.55;
              enemy.dash.trigger(enemy.phys, Math.cos(toAng), Math.sin(toAng), 0);
              this.particles.emit('spark', enemy.phys.pos.x, enemy.phys.pos.y, -Math.cos(toAng) * 140, -Math.sin(toAng) * 140, 4, 14, 0.28, '#c084fc', 0.9, 10, 4);
            }

            // Class-specific corrupted surge ability!
            if (enemy.revenantSurgeTimer <= 0 && dNear < 900) {
              enemy.revenantSurgeTimer = prof.surgeCooldown;
              this.audio.playRevenantSound('surge');
              this.particles.emit('shockwave', enemy.phys.pos.x, enemy.phys.pos.y, 0, 0, 14, 78, 0.35, '#a855f7', 0.85, 0, 0);
              const srcClass = enemy.revenantSourceClass ?? enemy.classId;
              if (srcClass === 'engineer') {
                repairComponents(enemy.health, 95);
              } else if (srcClass === 'ewar' && dNear < 380) {
                this.empDisruptTimer = Math.max(this.empDisruptTimer, 2.2);
              } else {
                // Fire a telegraphed 3-round corrupted fan salvo matching the class weapon
                const baseAng = Math.atan2(revTargetWorld.y - enemy.phys.pos.y, revTargetWorld.x - enemy.phys.pos.x);
                for (let k = -1; k <= 1; k++) {
                  const a = baseAng + k * 0.14;
                  this.projectiles.spawn({
                    team: enemy.team,
                    ownerId: enemy.id,
                    kind: srcClass === 'valkyrie' ? 'missile' : enemy.primary.spec.kind,
                    missileType: srcClass === 'valkyrie' ? 'interceptor' : undefined,
                    x: enemy.phys.pos.x + Math.cos(a) * (enemy.spec.radius + 14),
                    y: enemy.phys.pos.y + Math.sin(a) * (enemy.spec.radius + 14),
                    angle: a,
                    speed: Math.max(540, enemy.primary.spec.projectileSpeed * 1.1),
                    damage: Math.round(enemy.primary.spec.damage * 0.85),
                    splashRadius: Math.max(26, enemy.primary.spec.splashRadius),
                    range: enemy.primary.spec.range * 1.15,
                    piercing: enemy.primary.spec.piercing,
                    caliber: enemy.primary.spec.caliber,
                    homingTurnRate: srcClass === 'valkyrie' ? 3.8 : 0,
                    targetId: nearest.id,
                  });
                }
              }
            }
          }

          // Controlled purple energy speed trail when moving fast (never obscures legs)
          const revSpd = Math.hypot(enemy.phys.vel.x, enemy.phys.vel.y);
          if (revSpd > 175 && Math.random() < dt * 26) {
            this.particles.emit(
              'spark',
              enemy.phys.pos.x + (Math.random() - 0.5) * 14,
              enemy.phys.pos.y + (Math.random() - 0.5) * 14,
              -enemy.phys.vel.x * 0.2,
              -enemy.phys.vel.y * 0.2,
              3,
              9,
              0.24,
              '#c084fc',
              0.72,
              8,
              0
            );
          }
        }

        this.updateSingleMech(enemy, {
          wishX: ai.wishX,
          wishY: ai.wishY,
          sprint: enemy.isRevenant ? true : ai.sprint,
          firePrimary: revFirePrimary,
          fireSecondary: revFireSecondary,
          useSpecial: Boolean(enemy.isRevenant && enemy.specialCooldownTimer <= 0),
          targetWorld: revTargetWorld,
          dt,
        });
      }

      const distPlayer = Math.hypot(enemy.phys.pos.x - this.player.phys.pos.x, enemy.phys.pos.y - this.player.phys.pos.y);
      const sensorFactor = 0.4 + 0.6 * (this.player.health.sensors / Math.max(1, this.player.health.maxSensors));
      const ecmBoost = this.player.specialActiveTimer > 0 && this.player.spec.specialAbility.kind === 'ecm_pulse' ? 2.5 : 1.0;
      enemy.detected =
        distPlayer <= this.player.stats.sensorRange * sensorFactor * ecmBoost &&
        canDetectUnit(this.player, enemy, this.map.obstacles, ecmBoost > 1);
    }

    // 3z. Sync clinging Raptis-05 Grapplers to hosts & apply exact 5 DPS continuous damage per living attached grappler
    syncClingingGrapplers(this.enemies, friendlies);
    let activePlayerClingCount = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const g = this.enemies[i];
      const gs = g.grapplerState;
      if (!g.alive || g.enemyArchetype !== 'grappler' || !gs?.attachedTargetId) continue;
      const host =
        gs.attachedTargetId === this.player.id
          ? this.player
          : this.allies.find((a) => a.id === gs.attachedTargetId);
      if (!host || !host.alive || host.downed) continue;
      if (host.isPlayer && this.trainingGodMode) continue;

      const exactDmg = GRAPPLER_CLING_DPS * dt;
      host.health.chassis = Math.max(0, host.health.chassis - exactDmg);
      host.hitFlashTimer = Math.max(host.hitFlashTimer, 0.04);
      if (host.isPlayer) activePlayerClingCount++;
      if (this.screen === 'playing') {
        this.performanceTracker.recordDamageReceived(host.id, exactDmg);
      }
      if (host.health.chassis <= 0 && host.alive) {
        this.handleMechDestroyed(host, g.id);
      }
    }
    if (activePlayerClingCount > 0 && this.screen === 'playing') {
      this.grapplerDpsTextAccum += dt;
      if (this.grapplerDpsTextAccum >= 1.0) {
        this.grapplerDpsTextAccum = 0;
        this.particles.addText(
          this.player.phys.pos.x,
          this.player.phys.pos.y - 34,
          `-${activePlayerClingCount * GRAPPLER_CLING_DPS}/s`,
          '#fb7185'
        );
      }
    } else {
      this.grapplerDpsTextAccum = 0;
    }

    // 3a. Step Choreographed Takedown & Timing Minigame Sessions (Player, AI Squadmates, 1st-Person Enemy Ambushes)
    this.stepTakedownSessions(dt);

    // Track incoming homing missiles targeting player for lock-on warning & radio alert
    if (!lockedByAir) {
      for (let i = 0; i < this.projectiles.items.length; i++) {
        const p = this.projectiles.items[i];
        if (p.active && p.team === 'enemy' && !p.isCounterInterceptor && p.homingTurnRate > 0 && p.targetId === this.player.id) {
          lockedByAir = true;
          break;
        }
      }
    }
    this.missileLockWarning = lockedByAir && this.player.alive;
    if (this.missileLockWarning && this.screen === 'playing') {
      this.radioManager.trigger('missile_warning');
    }

    // Contextual battlefield radio monitoring (armor critical, artillery danger, contacts, ally health)
    if (this.screen === 'playing' && !this.bootSequence.active) {
      if (this.player.alive) {
        const hullRatio = this.player.health.chassis / Math.max(1, this.player.health.maxChassis);
        const armorRatio = this.player.health.armor / Math.max(1, this.player.health.maxArmor);
        if (hullRatio <= 0.38 || (armorRatio <= 0.08 && hullRatio <= 0.72)) {
          this.radioManager.trigger('armor_critical');
        }
      }
      if (this.incomingWarnings.length > 0 && this.player.alive) {
        for (let wIdx = 0; wIdx < this.incomingWarnings.length; wIdx++) {
          const w = this.incomingWarnings[wIdx];
          if (Math.hypot(w.x - this.player.phys.pos.x, w.y - this.player.phys.pos.y) <= w.radius + 140) {
            this.radioManager.trigger('artillery_warning');
            break;
          }
        }
      }
      let closeHostiles = 0;
      for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
        const e = this.enemies[eIdx];
        if (e.alive && !e.isDummy && e.detected) {
          if (Math.hypot(e.phys.pos.x - this.player.phys.pos.x, e.phys.pos.y - this.player.phys.pos.y) < 620) {
            closeHostiles++;
          }
        }
      }
      if (closeHostiles >= 4) {
        this.radioManager.trigger(closeHostiles >= 5 ? 'player_surrounded' : 'contacts_multiple');
      }
      const allyRoles: RadioSpeakerRole[] = ['pilot_bravo', 'pilot_alpha', 'recon_sniper'];
      for (let aIdx = 0; aIdx < this.allies.length; aIdx++) {
        const a = this.allies[aIdx];
        const aHp = a.health.chassis / Math.max(1, a.health.maxChassis);
        this.radioManager.evaluateAllyUnitHealth(a.id, a.callsign, aHp, a.alive, allyRoles[aIdx % allyRoles.length]);
      }
    }
    if (this.missileLockWarning && this.screen === 'playing' && this.lockBeepCooldown <= 0) {
      this.audio.playMissileLockBeep();
      this.lockBeepCooldown = 0.72;
    }

    // 3b. Update Colossal Thunderhead Boss, Deployables, Warnings, SmokeClouds & Hazards
    for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
      this.smokeClouds[i].life -= dt;
      if (this.smokeClouds[i].life <= 0) {
        this.smokeClouds.splice(i, 1);
      } else if (Math.random() < dt * 8) {
        const sc = this.smokeClouds[i];
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * sc.radius * 0.72;
        this.particles.emit('smoke', sc.x + Math.cos(a) * r, sc.y + Math.sin(a) * r, 0, -10, 14, 28, 0.9, '#cbd5e1', 0.38, 12, 14);
      }
    }
    this.stepBossAndHazards(dt);

    // 3c. Collect active missile threats and step Universal AI Anti-Air turrets
    this.threatManager.collect(this.projectiles.items);
    this.stepAntiAirSystems(dt);

    // 4. Update Projectiles & Collisions
    this.stepProjectiles(dt);

    // 5. Update Particles
    this.particles.update(dt);

    // 6. Camera follow (with non-blocking Boss Cinematics, Intro Pan, and OFF/LOW/MEDIUM/HIGH shake!)
    const shakeScale = getCameraShakeScale(this.save.settings);
    this.camera.setShakeLevel(this.save.settings.cameraShakeLevel);
    this.bossCinematics.setMode(this.save.settings.bossCinematics);
    this.bossCinematics.update(dt);
    const cineOverride = this.bossCinematics.getCameraOverride(this.player.phys.pos);

    const playerTd = this.takedowns.getSessionForPlayer();
    if (this.screen === 'title') {
      const camX = 1120 + Math.sin(this.simTime * 0.25) * 240;
      const camY = 950 + Math.cos(this.simTime * 0.2) * 120;
      this.camera.update(dt, { x: camX, y: camY }, { x: 0, y: 0 }, { x: camX, y: camY }, shakeScale * 0.3, this.map.width, this.map.height, this.viewW, this.viewH);
    } else if (playerTd && playerTd.isPlayerAttacker && !playerTd.isPlayerVictim) {
      // Dynamic close-in framing for 3rd-person Player Phantom Execution (never triggered when player is victim!)
      this.camera.targetZoom = 1.22;
      this.camera.update(
        dt,
        playerTd.anchorPos,
        { x: 0, y: 0 },
        playerTd.anchorPos,
        shakeScale,
        this.map.width,
        this.map.height,
        this.viewW,
        this.viewH
      );
    } else if (cineOverride.active && cineOverride.focusPos) {
      if (cineOverride.targetZoom !== null) {
        this.camera.targetZoom = cineOverride.targetZoom;
      }
      this.camera.update(
        dt,
        cineOverride.focusPos,
        { x: 0, y: 0 },
        cineOverride.focusPos,
        shakeScale,
        this.map.width,
        this.map.height,
        this.viewW,
        this.viewH
      );
    } else if (this.bossIntroTimer > 0 && this.boss && this.boss.alive) {
      const panWeight = Math.sin((this.bossIntroTimer / 2.4) * Math.PI) * 0.58;
      const focusPos = {
        x: this.player.phys.pos.x + (this.boss.phys.pos.x - this.player.phys.pos.x) * panWeight,
        y: this.player.phys.pos.y + (this.boss.phys.pos.y - this.player.phys.pos.y) * panWeight,
      };
      this.camera.targetZoom = 0.72;
      this.camera.update(dt, focusPos, { x: 0, y: 0 }, this.boss.phys.pos, shakeScale, this.map.width, this.map.height, this.viewW, this.viewH);
    } else if (this.player.alive && this.player.transform?.active) {
      // Subtle inspection camera zoom during player transformation without occluding threats
      this.camera.targetZoom = Math.min(1.22, Math.max(this.camera.targetZoom, 1.18));
      this.camera.update(
        dt,
        this.player.phys.pos,
        { x: 0, y: 0 },
        this.player.phys.pos,
        shakeScale * 0.45,
        this.map.width,
        this.map.height,
        this.viewW,
        this.viewH
      );
    } else {
      this.camera.update(
        dt,
        this.player.phys.pos,
        this.player.phys.vel,
        this.mouseWorld,
        shakeScale,
        this.map.width,
        this.map.height,
        this.viewW,
        this.viewH
      );
    }

    // 7. Mode Victory / Defeat / Survival Wave / Objectives
    if (this.screen === 'playing') {
      this.stepObjectivesAndRules(dt);
    }
  }

  private stepTitleShowcase(dt: number): void {
    // Player mech patrols smoothly in title demo so user watches procedural spider legs in action
    const targetX = 950 + Math.cos(this.simTime * 0.35) * 240;
    const targetY = 950 + Math.sin(this.simTime * 0.35) * 140;
    const dx = targetX - this.player.phys.pos.x;
    const dy = targetY - this.player.phys.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    this.player.phys.aimAngle = Math.atan2(dy, dx);
    this.updateSingleMech(this.player, {
      wishX: dx / d,
      wishY: dy / d,
      sprint: false,
      firePrimary: Math.sin(this.simTime * 2.5) > 0.85,
      fireSecondary: false,
      useSpecial: false,
      targetWorld: { x: 1650, y: 950 },
      dt,
    });
    // Keep title showcase actors healthy
    this.player.health.chassis = this.player.health.maxChassis;
    this.player.health.armor = this.player.health.maxArmor;
    for (const e of this.enemies) {
      e.health.chassis = e.health.maxChassis;
      e.health.armor = e.health.maxArmor;
    }
  }

  private stepPlayerInput(dt: number): void {
    if (!this.player.alive) {
      this.player.koTimer = Math.max(0, this.player.koTimer - dt);
      this.defeatDelayTimer += dt;
      if (this.defeatDelayTimer >= 0.65) {
        this.finishMatch(false, 'Chassis destroyed in combat.');
      }
      return;
    }

    const kb = this.save.settings.keyBindings;
    let wishX = 0;
    let wishY = 0;
    if (this.keysHeld.has(kb.moveForward) || this.keysHeld.has('ArrowUp')) wishY -= 1;
    if (this.keysHeld.has(kb.moveBackward) || this.keysHeld.has('ArrowDown')) wishY += 1;
    if (this.keysHeld.has(kb.moveLeft) || this.keysHeld.has('ArrowLeft')) wishX -= 1;
    if (this.keysHeld.has(kb.moveRight) || this.keysHeld.has('ArrowRight')) wishX += 1;

    const wMag = Math.hypot(wishX, wishY);
    if (wMag > 0) {
      wishX /= wMag;
      wishY /= wMag;
    }

    const sprint = this.keysHeld.has(kb.sprint) || this.keysHeld.has('ShiftRight');
    const ascend = this.player.spec.canFly && this.keysHeld.has(kb.dash);
    const descend = this.player.spec.canFly && (this.keysHeld.has(kb.descend) || this.keysHeld.has('ControlRight'));

    // Update Grappling Hook candidate & cable physics for player
    this.grapple.refreshCandidate(this.player.phys.pos, this.mouseWorld, this.map.obstacles);
    const grappleStep = this.grapple.update(
      dt,
      this.player.phys,
      this.player.stats.mass,
      wishX,
      wishY,
      this.map.obstacles
    );
    if (grappleStep.justLatched) {
      this.audio.playGrappleLatch();
      this.camera.addShake(0.18, 'grapple');
      for (let s = 0; s < 6; s++) {
        this.particles.emit(
          'spark',
          this.grapple.anchorPos.x,
          this.grapple.anchorPos.y,
          (Math.random() - 0.5) * 140,
          (Math.random() - 0.5) * 140,
          2.6,
          0.6,
          0.22,
          '#fbbf24',
          0.95,
          10
        );
      }
    }
    if (grappleStep.justReleased && this.screen === 'playing') {
      this.audio.playGrappleDetach();
    }

    // Aim turret independently toward mouseWorld (with sensor damage jitter if sensors damaged)
    const sensorRatio = this.player.health.sensors / Math.max(1, this.player.health.maxSensors);
    const jitter = sensorRatio < 0.6 ? Math.sin(this.simTime * 19) * (1 - sensorRatio) * 0.12 : 0;
    this.player.phys.aimAngle =
      Math.atan2(this.mouseWorld.y - this.player.phys.pos.y, this.mouseWorld.x - this.player.phys.pos.x) + jitter;

    const firePrimary = this.mouseLeftDown && this.player.activeSlot === 1;
    const fireSecondary = this.mouseRightDown || (this.mouseLeftDown && this.player.activeSlot === 2);

    this.updateSingleMech(this.player, {
      wishX,
      wishY,
      sprint,
      ascend,
      descend,
      firePrimary,
      fireSecondary,
      useSpecial: false,
      targetWorld: this.mouseWorld,
      dt,
    });
  }

  private spawnTeleportDashVfx(mech: MechActor, fromX: number, fromY: number, toX: number, toY: number): void {
    // Departure afterimage silhouette + spatial distortion ring
    if (this.save.settings.dashVfx) {
      this.afterimages.spawn({
        x: fromX,
        y: fromY,
        bodyAngle: mech.phys.bodyAngle,
        aimAngle: mech.phys.aimAngle,
        altitude: mech.flight?.altitude ?? 0,
        radius: mech.spec.radius,
        silhouette: mech.spec.silhouette,
        tintColor: '#22d3ee',
        maxLife: 0.34,
        legs: mech.legs.legs,
      });
      this.particles.emit('shockwave', fromX, fromY, 0, 0, 26, 6, 0.22, '#22d3ee', 0.9, 8);
      this.particles.emit('shockwave', toX, toY, 0, 0, 8, 56, 0.28, '#67e8f9', 0.95, 8);
      for (let s = 0; s < 12; s++) {
        const ang = (s / 12) * Math.PI * 2;
        this.particles.emit(
          'spark',
          toX,
          toY,
          Math.cos(ang) * (95 + Math.random() * 90),
          Math.sin(ang) * (95 + Math.random() * 90),
          3.4,
          0.5,
          0.26,
          s % 2 === 0 ? '#22d3ee' : '#e0f2fe',
          0.95,
          10
        );
      }
    }
    // Snap procedural legs cleanly to arrival position so zero leg stretching occurs
    mech.legs.reset(mech.spec.legs, { x: toX, y: toY }, mech.phys.bodyAngle);
  }

  public triggerPlayerDash(): boolean {
    if (!this.player.alive || !this.player.dash) return false;
    const kb = this.save.settings.keyBindings;
    let wishX = 0;
    let wishY = 0;
    if (this.keysHeld.has(kb.moveForward) || this.keysHeld.has('ArrowUp')) wishY -= 1;
    if (this.keysHeld.has(kb.moveBackward) || this.keysHeld.has('ArrowDown')) wishY += 1;
    if (this.keysHeld.has(kb.moveLeft) || this.keysHeld.has('ArrowLeft')) wishX -= 1;
    if (this.keysHeld.has(kb.moveRight) || this.keysHeld.has('ArrowRight')) wishX += 1;

    const prevX = this.player.phys.pos.x;
    const prevY = this.player.phys.pos.y;
    const triggered = this.player.dash.trigger(
      this.player.phys,
      wishX,
      wishY,
      this.grapple.releaseBoostWindow,
      {
        obstacles: this.map.obstacles,
        radius: this.player.spec.radius,
        mapWidth: this.map.width,
        mapHeight: this.map.height,
      }
    );
    if (triggered) {
      if (this.grapple.state === 'attached' || this.grapple.state === 'deploying') {
        this.grapple.detach(this.player.phys);
      }
      if (this.screen === 'playing') {
        this.audio.playDashBoost(this.player.stats.mass > 40);
        this.camera.addShake(this.player.dash.spec.cameraShake, 'dash');
      }
      if (this.player.dash.spec.teleportMode) {
        this.spawnTeleportDashVfx(this.player, prevX, prevY, this.player.phys.pos.x, this.player.phys.pos.y);
      } else if (this.save.settings.dashVfx) {
        for (let s = 0; s < 8; s++) {
          this.particles.emit(
            'spark',
            this.player.phys.pos.x,
            this.player.phys.pos.y,
            -this.player.dash.dashDir.x * (90 + Math.random() * 140) + (Math.random() - 0.5) * 80,
            -this.player.dash.dashDir.y * (90 + Math.random() * 140) + (Math.random() - 0.5) * 80,
            3.2,
            0.5,
            0.25,
            this.player.dash.spec.tintColor,
            0.9,
            10
          );
        }
      }
      if (this.player.dash.cooldownTimer > 0) {
        const cdMult = getMorphDashCooldownMultiplier(
          this.player.spec.specialAbility.kind,
          this.player.specialActiveTimer
        );
        if (cdMult < 0.99) {
          this.player.dash.cooldownTimer *= cdMult;
        }
      }
      this.pushHudSnapshot();
    }
    return triggered;
  }

  public triggerPlayerGrapple(): void {
    if (!this.player.alive || this.player.spec.canGrapple === false) return;
    if (this.grapple.state === 'attached' || this.grapple.state === 'deploying') {
      this.grapple.detach(this.player.phys);
      this.audio.playGrappleDetach();
      this.pushHudSnapshot();
      return;
    }
    const res = this.grapple.toggleFire(this.player.phys.pos, this.mouseWorld, this.map.obstacles);
    if (res === 'fired') {
      this.audio.playGrappleFire();
    } else if (res === 'detached') {
      this.audio.playGrappleDetach();
    }
    this.pushHudSnapshot();
  }

  private updateSingleMech(
    mech: MechActor,
    ctrl: {
      wishX: number;
      wishY: number;
      sprint: boolean;
      ascend?: boolean;
      descend?: boolean;
      firePrimary: boolean;
      fireSecondary: boolean;
      useSpecial: boolean;
      targetWorld: Vec2;
      dt: number;
    }
  ): void {
    const dt = ctrl.dt;

    if (mech.hitFlashTimer > 0) mech.hitFlashTimer = Math.max(0, mech.hitFlashTimer - dt);
    if (mech.jammedTimer > 0) mech.jammedTimer = Math.max(0, mech.jammedTimer - dt);
    if (mech.markedTimer && mech.markedTimer > 0) mech.markedTimer = Math.max(0, mech.markedTimer - dt);
    if (mech.specialCooldownTimer > 0) mech.specialCooldownTimer = Math.max(0, mech.specialCooldownTimer - dt);
    if (!mech.isPlayer && mech.transformCooldownTimer > 0) {
      mech.transformCooldownTimer = Math.max(0, mech.transformCooldownTimer - dt);
    }

    // Step active TX-10 Proteus multi-stage mechanical transformation sequence
    if (mech.transform?.active && mech.alive) {
      const tfRes = stepTransformRuntime(mech.transform, dt);
      mech.legs.syncMorphSpecs(mech.transform.pose.targetLegs, mech.phys.pos, mech.phys.bodyAngle);
      mech.physCfg.radius = mech.transform.pose.interpolatedRadius;

      const tfSpatial = computeSpatialAudioParams(
        mech.phys.pos.x - this.camera.x,
        mech.phys.pos.y - this.camera.y,
        1300,
        !mech.isPlayer && this.screen === 'playing' && !hasLineOfSight(this.player.phys.pos, mech.phys.pos, this.map.obstacles),
        false
      );

      for (let i = 0; i < tfRes.events.length; i++) {
        const ev = tfRes.events[i];
        if (this.screen === 'playing') {
          this.audio.playTransformStageCue(
            ev.cue,
            mech.transform.profile.massClass,
            mech.isPlayer ? 1.0 : tfSpatial.distanceScale * 0.72,
            tfSpatial.occluded,
            tfSpatial.pan
          );
          if (mech.isPlayer && ev.shakeAmount > 0) {
            this.camera.addShake(ev.shakeAmount, 'dash');
          }
        }
        if (ev.sparkBurst) {
          for (let s = 0; s < 6; s++) {
            const ang = (s / 6) * Math.PI * 2 + Math.random() * 0.4;
            this.particles.emit(
              'spark',
              mech.phys.pos.x + Math.cos(ang) * mech.physCfg.radius * 0.65,
              mech.phys.pos.y + Math.sin(ang) * mech.physCfg.radius * 0.65,
              Math.cos(ang) * (70 + Math.random() * 85),
              Math.sin(ang) * (70 + Math.random() * 85),
              2.8,
              0.4,
              0.24,
              s % 2 === 0 ? '#fbbf24' : '#38bdf8',
              0.92,
              10
            );
          }
        }
        if (ev.ventSteam) {
          for (let v = 0; v < 4; v++) {
            const ang = Math.random() * Math.PI * 2;
            this.particles.emit(
              'smoke',
              mech.phys.pos.x + Math.cos(ang) * mech.physCfg.radius * 0.6,
              mech.phys.pos.y + Math.sin(ang) * mech.physCfg.radius * 0.6,
              Math.cos(ang) * 42,
              Math.sin(ang) * 42 - 12,
              4,
              13,
              0.45,
              '#cbd5e1',
              0.55,
              10,
              14
            );
          }
        }
      }

      if (tfRes.completed) {
        const tgt = mech.transform.targetSpec;
        applyTransformedUnitForm(
          mech,
          tgt,
          mech.isPlayer ? this.save.customLoadouts[tgt.id] : undefined
        );
        mech.transform = null;
        if (mech.isPlayer) {
          this.camera.targetZoom = this.preTransformZoom ?? (this.save.settings.cameraZoom ?? 1.0);
          this.preTransformZoom = null;
          this.pushHudSnapshot();
        }
        this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 12, tgt.radius * 2.5, 0.38, tgt.accentColor, 0.9, 6);
        this.particles.addText(mech.phys.pos.x, mech.phys.pos.y - tgt.radius - 16, `${tgt.code} ONLINE`, tgt.accentColor);
        if (this.screen === 'playing') {
          this.pushRadio(mech.callsign, `Replication lock confirmed — ${tgt.code} ${tgt.name} combat systems online.`);
        }
      }
    }

    const aegisStatus = stepAegisArmor(mech, dt);
    if (aegisStatus === 'retracted') {
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, mech.spec.radius + 14, 6, 0.32, '#38bdf8', 0.7, 6);
    }

    if (ctrl.useSpecial && !mech.transform?.active) {
      this.activateSpecialAbility(mech);
    }

    if (mech.specialActiveTimer > 0) {
      mech.specialActiveTimer = Math.max(0, mech.specialActiveTimer - dt);
      // Engineer Repair Field & TX-07 Fabricator Rig Nanite Dome aura
      if (
        mech.spec.specialAbility.kind === 'repair_field' ||
        mech.spec.specialAbility.kind === 'engineer_fabricator_rig'
      ) {
        const isFab = mech.spec.specialAbility.kind === 'engineer_fabricator_rig';
        const auraRadius = isFab ? 360 : 260;
        const healPerSec = isFab ? 34 : 16;
        const recipients = mech.team === 'player' ? [this.player, ...this.allies] : this.enemies;
        for (const r of recipients) {
          if (!r.alive) continue;
          if (Math.hypot(r.phys.pos.x - mech.phys.pos.x, r.phys.pos.y - mech.phys.pos.y) <= auraRadius) {
            repairComponents(r.health, healPerSec * dt);
          }
        }
      }
    }

    // Overdrive / Siege / Heavy Weapon Preparation Bracing modifiers + TX Morph Rig modifiers
    const isOverdrive =
      mech.specialActiveTimer > 0 &&
      (mech.spec.specialAbility.kind === 'overdrive' || mech.spec.specialAbility.kind === 'recon_apex_scan');
    const isSiege =
      mech.specialActiveTimer > 0 &&
      (mech.spec.specialAbility.kind === 'siege_stance' ||
        mech.spec.specialAbility.kind === 'sniper_hyper_lockdown' ||
        mech.spec.specialAbility.kind === 'artillery_earthshaker' ||
        mech.spec.specialAbility.kind === 'colossus_apocalypse_salvo');
    const isWeaponBracing =
      (mech.primary.isPreparing && mech.primary.spec.requiresBrace) ||
      (mech.primary.isCharging && mech.primary.spec.requiresBrace);
    const morphSpeedMult = getMorphSpeedMultiplier(mech.spec.specialAbility.kind, mech.specialActiveTimer);
    const attachedGrapplers = countAttachedGrapplersForUnit(mech.id, this.enemies);
    const grapplerSlow = computeGrapplerSlowMultiplier(attachedGrapplers);
    const baseCfg =
      morphSpeedMult !== 1
        ? {
            ...mech.physCfg,
            acceleration: mech.physCfg.acceleration * morphSpeedMult,
            maxSpeed: mech.physCfg.maxSpeed * morphSpeedMult,
          }
        : isOverdrive
        ? {
            ...mech.physCfg,
            acceleration: mech.physCfg.acceleration * 1.48,
            maxSpeed: mech.physCfg.maxSpeed * 1.42,
          }
        : mech.physCfg;
    const effCfg =
      grapplerSlow < 1
        ? {
            ...baseCfg,
            acceleration: baseCfg.acceleration * grapplerSlow,
            maxSpeed: baseCfg.maxSpeed * grapplerSlow,
          }
        : baseCfg;

    const terrain = getTerrainAt(this.map, mech.phys.pos.x, mech.phys.pos.y);

    // Step Rocket-Powered Flight Physics if unit canFly
    let airborne = false;
    let landingImpact = false;
    if (mech.flight && mech.spec.canFly) {
      const flightEvt = stepFlightPhysics(
        mech.phys,
        mech.flight,
        VALKYRIE_FLIGHT_CONFIG,
        {
          wishX: ctrl.wishX,
          wishY: ctrl.wishY,
          ascend: Boolean(ctrl.ascend),
          descend: Boolean(ctrl.descend),
          boost: ctrl.sprint,
          sensitivity: this.save.settings.flightSensitivity,
        },
        mech.health,
        terrain,
        dt
      );
      airborne = mech.flight.isAirborne;
      landingImpact = mech.flight.landingImpactTimer > 0;
      if (flightEvt.justTookOff && this.screen === 'playing') {
        this.audio.playFlightTakeoff();
        this.camera.addShake(0.15, 'flight');
        this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 10, 48, 0.3, '#38bdf8', 0.75, 4);
      }
      if (flightEvt.justLanded && this.screen === 'playing') {
        const str = Math.max(0.55, Math.min(1.4, flightEvt.landingSpeed / 120));
        this.audio.playFlightLanding(str);
        this.camera.addShake(Math.min(0.28, 0.12 * str), 'flight');
        this.particles.spawnFootDust(mech.phys.pos.x, mech.phys.pos.y, 0.9 * str, terrain);
      }
      if (airborne && mech.flight.boosting && mech.isPlayer && this.screen === 'playing' && this.rocketBoostAudioCooldown <= 0) {
        this.audio.playRocketBoost(0.75);
        this.rocketBoostAudioCooldown = 0.24;
      }
    }

    // Step Ground Mech Physics (or tall-building collision only when flying high)
    let moveSpeed = Math.hypot(mech.phys.vel.x, mech.phys.vel.y);
    if (!airborne) {
      const moveRes = stepMechPhysics(
        mech.phys,
        effCfg,
        {
          wishX: ctrl.wishX,
          wishY: ctrl.wishY,
          sprint: ctrl.sprint,
          bracing: isWeaponBracing || (mech.isPlayer && this.overwatchBarrage.active),
          anchored:
            isSiege ||
            (mech.isPlayer && this.overwatchBarrage.active) ||
            ((mech.classId === 'artillery' || mech.classId === 'colossus') && mech.phys.recoilOffset > 3.5),
          time: this.simTime,
        },
        terrain,
        mech.health,
        dt
      );
      moveSpeed = moveRes.speed;
      resolveObstacleCollisions(
        mech.phys.pos,
        mech.phys.vel,
        mech.spec.radius,
        this.map.obstacles,
        this.map.width,
        this.map.height
      );
    } else {
      // Airborne Valkyrie flies smoothly over low cover/crates/trees, colliding only with tall buildings & map bounds
      const tallObstacles = this.map.obstacles.filter((o) => !o.destroyed && (o.height >= 48 || o.kind === 'building'));
      resolveObstacleCollisions(
        mech.phys.pos,
        mech.phys.vel,
        mech.spec.radius,
        tallObstacles,
        this.map.width,
        this.map.height
      );
    }

    // Step Directional Dash & Pose-Accurate Afterimages
    if (mech.dash) {
      mech.dash.update(dt, mech.phys, this.afterimages, {
        altitude: mech.flight?.altitude ?? 0,
        radius: mech.spec.radius,
        silhouette: mech.spec.silhouette,
        legs: mech.legs.legs,
        afterimageIntensity: this.save.settings.afterimageIntensity ?? 0.85,
        dashVfxEnabled: this.save.settings.dashVfx ?? true,
      });
    }

    // Step Procedural Spider Legs (handles idle, walk, sprint, dash, grapple, airborne, landing!)
    const stanceSpreadMult = isSiege || (mech.isPlayer && this.overwatchBarrage.active)
      ? 1.32
      : isWeaponBracing || ((mech.classId === 'artillery' || mech.classId === 'colossus') && mech.phys.recoilOffset > 2)
      ? 1.24
      : 1.0;

    const footsteps = mech.legs.update(
      dt,
      mech.phys,
      {
        strideLength: mech.spec.strideLength,
        stepHeight: mech.spec.stepHeight,
        stepSpeed: mech.spec.stepSpeed * (isOverdrive ? 1.35 : 1),
        maxSpeed: effCfg.maxSpeed,
        footstepWeight: mech.spec.footstepWeight,
      },
      mech.health,
      this.map.obstacles,
      {
        stanceSpreadMult,
        anchored: isSiege,
        dashing: Boolean(mech.dash?.isDashing()),
        grappling: mech.isPlayer && this.grapple.state === 'attached',
        airborne,
        altitude: mech.flight?.altitude ?? 0,
        landingImpact: landingImpact ? 1 : 0,
      }
    );

    // Emit terrain footprints, dust/mud/water splashes, subtle heavy step rumble, and spatial material-aware footstep audio!
    const spatial = computeSpatialAudioParams(
      mech.phys.pos.x - this.camera.x,
      mech.phys.pos.y - this.camera.y,
      1250,
      !mech.isPlayer &&
        this.screen === 'playing' &&
        !hasLineOfSight(this.player.phys.pos, mech.phys.pos, this.map.obstacles),
      false
    );
    const audioAtten = spatial.distanceScale;
    const occluded = spatial.occluded;

    const noiseMult = getStealthNoiseMultiplier(mech.stealth);
    if (!airborne) {
      for (let i = 0; i < footsteps.length; i++) {
        const fs = footsteps[i];
        if (noiseMult > 0.15) {
          this.particles.spawnFootDust(fs.x, fs.y, mech.spec.footstepWeight * noiseMult, terrain);
        }
        if (this.screen === 'playing' && (mech.isPlayer || moveSpeed > 12)) {
          const stepAtten = (mech.isPlayer ? 1 : audioAtten * 0.65) * noiseMult;
          if (stepAtten > 0.03) {
            this.audio.playFootstep(
              mech.spec.footstepWeight * noiseMult,
              stepAtten,
              occluded,
              terrain,
              mech.isPlayer ? 0 : spatial.pan
            );
          }
          if (mech.isPlayer && mech.spec.footstepWeight >= 0.8 && noiseMult > 0.3) {
            this.camera.addShake(mech.phys.sprinting ? 0.045 : 0.022, 'footstep');
          }
        }
      }
    }

    // Damaged component smoke
    if (mech.health.chassis < mech.health.maxChassis * 0.45 && Math.random() < dt * 8) {
      this.particles.emit('smoke', mech.phys.pos.x, mech.phys.pos.y, (Math.random() - 0.5) * 20, -18, 6, 16, 0.6, '#333842', 0.55, 12, 16);
    }

    // Step TX-series continuous articulated MorphRigState (lean, bank, radar spin, reload breech, ability hardware)
    if (mech.morphRig) {
      const forwardDot =
        (mech.phys.vel.x * Math.cos(mech.phys.bodyAngle) + mech.phys.vel.y * Math.sin(mech.phys.bodyAngle)) /
        Math.max(40, effCfg.maxSpeed);
      const activeWep = mech.activeSlot === 2 ? mech.secondary : mech.primary;
      const reloadProg = activeWep.reloading
        ? 1 - activeWep.reloadTimer / Math.max(0.1, activeWep.spec.reloadTime)
        : 0;
      stepMorphRigState(mech.morphRig, {
        dt,
        speedRatio: Math.min(1.5, moveSpeed / Math.max(40, effCfg.maxSpeed)),
        sprinting: mech.phys.sprinting,
        angularVel: mech.phys.angularVel,
        tiltX: Math.max(-1, Math.min(1, forwardDot)),
        recoilOffset: mech.phys.recoilOffset,
        reloading: mech.primary.reloading || mech.secondary.reloading,
        reloadProgress: reloadProg,
        chargingOrPreparing: mech.primary.isCharging || mech.primary.isPreparing,
        braced: mech.phys.bracingFactor > 0.5 || mech.primary.isPreparing,
        specialActive: mech.specialActiveTimer > 0,
        airborne,
        boosting: Boolean(mech.flight?.boosting),
      });
    }

    // Weapons update & firing (suppressed while weapons are physically stowed/transforming)
    const tfLocked = Boolean(mech.transform?.active);
    this.updateWeaponRuntime(mech, mech.primary, !tfLocked && ctrl.firePrimary, ctrl.targetWorld, dt, audioAtten, occluded);
    this.updateWeaponRuntime(mech, mech.secondary, !tfLocked && ctrl.fireSecondary, ctrl.targetWorld, dt, audioAtten, occluded);
  }

  private updateWeaponRuntime(
    mech: MechActor,
    w: WeaponRuntime,
    wantsFire: boolean,
    targetWorld: Vec2,
    dt: number,
    audioAtten: number,
    occluded: boolean
  ): void {
    w.cooldown = Math.max(0, w.cooldown - dt);
    w.spreadBloom = Math.max(0, w.spreadBloom - dt * 0.07);

    const weaponHealthRatio = Math.max(0.45, mech.health.weapons / Math.max(1, mech.health.maxWeapons));

    if (w.reloading) {
      w.reloadTimer -= dt * weaponHealthRatio;
      if (w.reloadTimer <= 0) {
        w.reloading = false;
        w.ammo = w.spec.magazineSize;
      }
      return;
    }

    if (w.ammo <= 0) {
      this.startReload(mech, w);
      return;
    }

    if (!wantsFire && !w.isPreparing) {
      w.isCharging = false;
      w.chargeTimer = Math.max(0, w.chargeTimer - dt * 2);
      w.prepTimer = Math.max(0, w.prepTimer - dt * 2.5);
      return;
    }

    if (w.cooldown > 0) return;

    // Firing preparation / breech lock delay (artillery & heavy stabilized cannons)
    if (w.spec.prepTime > 0) {
      if (!w.isPreparing) {
        w.isPreparing = true;
        w.prepTimer = 0;
        if (this.screen === 'playing' && (mech.isPlayer || audioAtten > 0.25)) {
          this.audio.playWeaponPrep(w.spec.kind, mech.isPlayer ? 1 : audioAtten * 0.65);
        }
      }
      w.prepTimer += dt;
      if (w.prepTimer < w.spec.prepTime) {
        return;
      }
      w.isPreparing = false;
      w.prepTimer = 0;
    }

    // Railgun electromagnetic charge-up
    if (w.spec.chargeTime > 0) {
      const chargeRate = getMorphChargeSpeedMultiplier(mech.spec.specialAbility.kind, mech.specialActiveTimer);
      if (!w.isCharging && this.screen === 'playing' && (mech.isPlayer || audioAtten > 0.25)) {
        this.audio.playWeaponCharge(w.spec.chargeTime / chargeRate, mech.isPlayer ? 1 : audioAtten * 0.7);
      }
      w.isCharging = true;
      w.chargeTimer += dt * chargeRate;
      if (w.chargeTimer < w.spec.chargeTime) {
        return;
      }
      w.isCharging = false;
      w.chargeTimer = 0;
    }

    this.fireWeapon(mech, w, targetWorld, audioAtten, occluded, weaponHealthRatio);
  }

  private startReload(mech: MechActor, w: WeaponRuntime): void {
    if (w.reloading || w.ammo >= w.spec.magazineSize) return;
    w.reloading = true;
    const ammoReloadMult =
      mech.isPlayer && mech.classId === 'colossus' && w === mech.primary
        ? this.mortarAmmo.getSpec().reloadMult
        : 1.0;
    w.reloadTimer = w.spec.reloadTime * ammoReloadMult;
    w.isCharging = false;
    w.chargeTimer = 0;
    w.isPreparing = false;
    w.prepTimer = 0;
    if (mech.isPlayer && this.screen === 'playing') {
      this.audio.playReload(w.spec.caliber >= 5.5);
    }
  }

  private fireWeapon(
    mech: MechActor,
    w: WeaponRuntime,
    targetWorld: Vec2,
    audioAtten: number,
    occluded: boolean,
    weaponHealthRatio: number
  ): void {
    const spKind = mech.spec.specialAbility.kind;
    const recoilMult = getMorphRecoilMultiplier(spKind, mech.specialActiveTimer);
    const spreadMult = getMorphSpreadMultiplier(spKind, mech.specialActiveTimer);
    const fireRateMorphMult = getMorphFireRateMultiplier(spKind, mech.specialActiveTimer);

    w.ammo--;
    w.cooldown = 1 / Math.max(0.2, w.spec.fireRate * fireRateMorphMult * weaponHealthRatio);
    revealStealth(mech.stealth, 1.15);

    const muzzleDist = w.spec.barrelLength + 6;
    const perpX = -Math.sin(mech.phys.aimAngle);
    const perpY = Math.cos(mech.phys.aimAngle);
    const mx = mech.phys.pos.x + Math.cos(mech.phys.aimAngle) * muzzleDist + perpX * w.spec.barrelOffsetY;
    const my = mech.phys.pos.y + Math.sin(mech.phys.aimAngle) * muzzleDist + perpY * w.spec.barrelOffsetY;

    // Repair beam special handling for Engineer
    if (w.spec.kind === 'repair_beam') {
      const recipients = mech.team === 'player' ? [this.player, ...this.allies] : this.enemies;
      let repairedAny = false;
      for (const r of recipients) {
        if (!r.alive || r === mech) continue;
        const d = Math.hypot(r.phys.pos.x - mx, r.phys.pos.y - my);
        if (d <= w.spec.range) {
          repairComponents(r.health, w.spec.damage);
          if (mech.team === 'player') {
            this.performanceTracker.recordRepair(mech.id, w.spec.damage);
          }
          this.particles.emit('repair', r.phys.pos.x, r.phys.pos.y, 0, -24, 6, 2, 0.35, '#34d399', 0.9, 10);
          repairedAny = true;
        }
      }
      if (repairedAny && mech.isPlayer) {
        this.particles.addText(mx, my - 15, '+REPAIR', '#34d399');
      }
    }

    // Homing target lookup for missiles (mechs + boss)
    let homingTargetId: string | null = null;
    let homingTargetPos: Vec2 = targetWorld;
    if (w.spec.homingTurnRate > 0) {
      const pool = mech.team === 'player' ? this.enemies : [this.player, ...this.allies];
      let bestD = 620;
      for (const t of pool) {
        if (!t.alive) continue;
        const d = Math.hypot(t.phys.pos.x - targetWorld.x, t.phys.pos.y - targetWorld.y);
        if (d < bestD) {
          bestD = d;
          homingTargetId = t.id;
          homingTargetPos = t.phys.pos;
        }
      }
      if (mech.team === 'player' && this.boss && this.boss.alive && !this.boss.destroying) {
        const db = Math.hypot(this.boss.phys.pos.x - targetWorld.x, this.boss.phys.pos.y - targetWorld.y);
        if (db < bestD) {
          homingTargetId = this.boss.id;
          homingTargetPos = this.boss.phys.pos;
        }
      }
    }

    // Resolve missile variant profile (customization weaponVariant can shift seeker behavior)
    let resolvedMissileType: MissileType = w.spec.missileType ?? 'standard';
    if (w.spec.kind === 'missile' && mech.isPlayer) {
      const wVar = this.save.customLoadouts[mech.classId]?.weaponVariant;
      if (wVar === 'heavy_barrel') {
        resolvedMissileType = mech.classId === 'valkyrie' ? 'advanced_tracking' : 'heavy';
      } else if (wVar === 'rapid_feed' && mech.classId === 'standard') {
        resolvedMissileType = 'interceptor';
      }
    }
    const missileProfile = w.spec.kind === 'missile' ? getMissileProfile(resolvedMissileType) : null;

    // Firing while moving or unstable adds inaccuracy bloom; bracing improves dispersion
    const instabilityBloom = (1 - mech.phys.stability) * 0.085 + mech.phys.recoilAccum * 0.04;
    const speedRatio = Math.min(1, Math.hypot(mech.phys.vel.x, mech.phys.vel.y) / Math.max(40, mech.physCfg.maxSpeed));
    const moveBloom = w.spec.requiresBrace ? speedRatio * 0.09 : speedRatio * 0.025;
    const totalSpread = (w.spec.spreadRad + w.spreadBloom + instabilityBloom + moveBloom) * spreadMult;

    const burst = Math.max(1, w.spec.burstCount);
    const isColossusPrimary = mech.isPlayer && mech.classId === 'colossus' && w === mech.primary;
    if (isColossusPrimary) {
      const sol = this.getMortarSolution();
      const ammoSpec = this.mortarAmmo.getSpec();
      const tx = (sol ? sol.targetX : targetWorld.x) + (Math.random() - 0.5) * (sol ? sol.scatterRadius : 45);
      const ty = (sol ? sol.targetY : targetWorld.y) + (Math.random() - 0.5) * (sol ? sol.scatterRadius : 45);
      this.projectiles.spawn({
        team: mech.team,
        ownerId: mech.id,
        kind: 'artillery',
        x: mx,
        y: my,
        angle: mech.phys.aimAngle,
        speed: ammoSpec.flightSpeed,
        damage: Math.round(w.spec.damage * ammoSpec.damageMult),
        splashRadius: ammoSpec.splashRadius,
        range: sol ? sol.maxRange + 150 : w.spec.range,
        piercing: ammoSpec.piercing,
        caliber: w.spec.caliber,
        targetX: Math.max(40, Math.min(this.map.width - 40, tx)),
        targetY: Math.max(40, Math.min(this.map.height - 40, ty)),
        mortarAmmo: ammoSpec.id,
        isPlayerMortar: true,
      });
      this.boss?.notifyIncomingThreat(tx, ty);
    } else {
      for (let b = 0; b < burst; b++) {
        const spread = (Math.random() - 0.5) * totalSpread;
        const fireAngle = mech.phys.aimAngle + spread;
        const effSpeed = missileProfile ? Math.max(w.spec.projectileSpeed, missileProfile.maxSpeed) : w.spec.projectileSpeed;
        const effDamage =
          missileProfile && resolvedMissileType === 'heavy' && mech.isPlayer
            ? Math.round(w.spec.damage * 1.45)
            : w.spec.damage;
        this.projectiles.spawn({
          team: mech.team,
          ownerId: mech.id,
          kind: w.spec.kind,
          x: mx,
          y: my,
          angle: fireAngle,
          speed: effSpeed,
          damage: effDamage,
          splashRadius: missileProfile ? Math.max(w.spec.splashRadius, missileProfile.splashRadius) : w.spec.splashRadius,
          range: missileProfile ? Math.max(w.spec.range, missileProfile.maxTrackRange) : w.spec.range,
          piercing: w.spec.piercing,
          caliber: w.spec.caliber,
          homingTurnRate: missileProfile ? Math.max(w.spec.homingTurnRate, missileProfile.turnRateRad) : w.spec.homingTurnRate,
          targetId: homingTargetId,
          targetX: targetWorld.x + (Math.random() - 0.5) * 40,
          targetY: targetWorld.y + (Math.random() - 0.5) * 40,
          missileType: w.spec.kind === 'missile' ? resolvedMissileType : undefined,
          launchAltitude: mech.flight?.altitude ?? 0,
          swarmSeed: b / Math.max(1, burst),
          lastKnownX: homingTargetPos.x,
          lastKnownY: homingTargetPos.y,
        });
      }
    }

    w.spreadBloom = Math.min(0.22, w.spreadBloom + w.spec.recoilSpreadGain * spreadMult);

    const leftLegRatio = mech.health.leftLegs / Math.max(1, mech.health.maxLeftLegs);
    const rightLegRatio = mech.health.rightLegs / Math.max(1, mech.health.maxRightLegs);
    const legAvgRatio = Math.max(0.2, (leftLegRatio + rightLegRatio) * 0.5);

    // Physical recoil impulse, off-axis torque, suspension slam & stability drain!
    applyRecoilImpulse(mech.phys, mech.phys.aimAngle, w.spec.recoilImpulse * recoilMult, mech.stats.mass, {
      recoilTorque: w.spec.recoilTorque,
      barrelOffsetY: w.spec.barrelOffsetY,
      stabilityCost: w.spec.stabilityCost,
      legAvgRatio,
      visualScale: this.save.settings.recoilVisualIntensity,
    });
    this.particles.spawnMuzzleFlash(mx, my, mech.phys.aimAngle, w.spec.caliber, w.spec.kind === 'railgun');

    if (mech.isPlayer && this.screen === 'playing') {
      const shakeAmt =
        w.spec.kind === 'artillery'
          ? 0.48
          : w.spec.kind === 'railgun'
          ? 0.38
          : Math.min(0.24, w.spec.recoilImpulse * 0.0022);
      this.camera.addShake(shakeAmt * recoilMult, 'recoil');
    }

    if (this.screen === 'playing') {
      const wPan = mech.isPlayer ? 0 : Math.max(-0.85, Math.min(0.85, (mech.phys.pos.x - this.camera.x) / 620));
      if (w.spec.kind === 'missile') {
        this.audio.playMissileVariantLaunch(resolvedMissileType, mech.isPlayer ? 1 : audioAtten, occluded, wPan);
      } else {
        this.audio.playWeaponFire(w.spec.kind, mech.isPlayer ? 1 : audioAtten, occluded, w.spec.caliber, wPan);
      }
    }

    if (w.ammo <= 0) {
      this.startReload(mech, w);
    }
  }

  public openTransformSelector(): void {
    if (!this.player.alive || !this.player.isProteusOrigin || this.player.transform?.active) return;
    if (this.takedowns.isUnitLocked(this.player.id)) return;
    if (this.playerTransformCooldown > 0.01) {
      this.particles.addText(
        this.player.phys.pos.x,
        this.player.phys.pos.y - 30,
        `REPLICATION COOLDOWN ${Math.ceil(this.playerTransformCooldown)}s`,
        '#94a3b8'
      );
      this.audio.playMinigameCue('miss');
      return;
    }
    this.transformSelectorOpen = !this.transformSelectorOpen;
    if (this.transformSelectorOpen) {
      this.squadWheelOpen = false;
      this.tacticalOpen = false;
    }
    this.pushHudSnapshot();
  }

  public closeTransformSelector(): void {
    if (!this.transformSelectorOpen) return;
    this.transformSelectorOpen = false;
    this.pushHudSnapshot();
  }

  public selectPlayerTransformTarget(targetClassId: MechClassId): boolean {
    this.transformSelectorOpen = false;
    const ok = this.triggerTransformation(this.player, targetClassId);
    this.pushHudSnapshot();
    return ok;
  }

  public triggerTransformation(mech: MechActor, targetClassId: MechClassId): boolean {
    const check = canInitiateTransformation({
      isProteusLineage: Boolean(mech.isProteusOrigin),
      alive: mech.alive,
      downed: mech.downed,
      transforming: Boolean(mech.transform?.active),
      inTakedown: this.takedowns.isUnitLocked(mech.id),
      transformCooldownRemaining: mech.isPlayer ? this.playerTransformCooldown : mech.transformCooldownTimer,
      currentClassId: mech.classId,
      targetClassId,
      alliedRoster: MECH_LIST,
      unlockedUnits: this.save.unlockedUnits,
    });
    if (!check.allowed || !check.targetSpec) {
      if (mech.isPlayer && this.screen === 'playing') {
        const msg =
          check.reason === 'UNIT_LOCKED'
            ? 'UNIT LOCKED — CANNOT REPLICATE'
            : check.reason === 'COOLDOWN_ACTIVE'
            ? `COOLDOWN ${Math.ceil(this.playerTransformCooldown)}s`
            : 'REPLICATION BLOCKED';
        this.particles.addText(mech.phys.pos.x, mech.phys.pos.y - 30, msg, '#f87171');
        this.audio.playMinigameCue('miss');
      }
      return false;
    }

    const targetSpec = mech.isProteusOrigin ? getProteusMorphSpec(check.targetSpec) : check.targetSpec;
    // Start strict 60s cooldown immediately upon transformation initiation (immune to cancel/respawn/switch!)
    mech.transformCooldownTimer = TRANSFORM_COOLDOWN_SEC;
    if (mech.isPlayer) {
      this.playerTransformCooldown = TRANSFORM_COOLDOWN_SEC;
      this.preTransformZoom = this.camera.targetZoom;
      this.transformSelectorOpen = false;
      if (this.grapple.state === 'attached') {
        this.grapple.detach();
      }
    }

    const customPaint = mech.isPlayer
      ? PAINT_SCHEMES.find((p) => p.id === this.save.customLoadouts[targetSpec.id]?.paintId)
      : undefined;
    const targetPaint = customPaint
      ? { primary: customPaint.primary, secondary: customPaint.secondary, accent: customPaint.accent }
      : { primary: targetSpec.defaultColor, secondary: '#262b33', accent: targetSpec.accentColor };

    mech.transform = createTransformRuntime({
      baseClassId: 'proteus',
      sourceSpec: mech.spec,
      targetSpec,
      sourcePaint: mech.paint,
      targetPaint,
    });

    if (this.screen === 'playing') {
      this.pushRadio(
        mech.callsign,
        `Total Replication engaged — reconfiguring frame to ${targetSpec.code} ${targetSpec.name}.`
      );
    }
    return true;
  }

  public activateSpecialAbility(mech: MechActor): void {
    if (!mech.alive || mech.transform?.active) return;
    const sp = mech.spec.specialAbility;

    if (sp.kind === 'total_replication') {
      if (mech.isPlayer) {
        this.openTransformSelector();
      }
      return;
    }

    if (mech.specialCooldownTimer > 0) return;

    if (sp.kind === 'phantom_execution' || sp.kind === 'assassin_crimson_tempest') {
      const targetPool = mech.team === 'player' ? this.enemies : [this.player, ...this.allies];
      const maxRange = sp.kind === 'assassin_crimson_tempest' ? 620 : undefined;
      const targetRef = this.takedowns.findExecutionTarget(
        mech,
        targetPool,
        mech.team === 'player' ? this.boss : null,
        mech.isPlayer ? this.mouseWorld : mech.phys.pos,
        maxRange
      );
      if (targetRef) {
        if (sp.kind === 'assassin_crimson_tempest' && this.screen === 'playing') {
          this.audio.playMorphAbilityCue('assassin_crimson_tempest', 'deploy', mech.isPlayer ? 1 : 0.6);
        }
        this.executePhantomTeleport(
          mech,
          targetRef.kind === 'mech' ? targetRef.target : undefined,
          targetRef.kind === 'boss' ? targetRef.boss : undefined
        );
        return;
      }
      if (sp.kind === 'phantom_execution') {
        if (mech.isPlayer && this.screen === 'playing') {
          this.particles.addText(mech.phys.pos.x, mech.phys.pos.y - 30, 'NO TARGET IN EXECUTION RANGE', '#f43f5e');
          this.audio.playMinigameCue('miss');
        }
        return;
      }
      // Fallback for assassin_crimson_tempest when no target in execution lock: Shadow Blitz Whirling Crescent Dash!
      mech.specialActiveTimer = sp.duration;
      mech.specialCooldownTimer = sp.cooldown;
      const aimTarget = mech.isPlayer
        ? this.mouseWorld
        : { x: mech.phys.pos.x + Math.cos(mech.phys.aimAngle) * 260, y: mech.phys.pos.y + Math.sin(mech.phys.aimAngle) * 260 };
      const dashAng = Math.atan2(aimTarget.y - mech.phys.pos.y, aimTarget.x - mech.phys.pos.x);
      const stepDist = 250;
      const startX = mech.phys.pos.x;
      const startY = mech.phys.pos.y;
      const endX = Math.max(48, Math.min(this.map.width - 48, startX + Math.cos(dashAng) * stepDist));
      const endY = Math.max(48, Math.min(this.map.height - 48, startY + Math.sin(dashAng) * stepDist));
      mech.phys.pos.x = endX;
      mech.phys.pos.y = endY;
      mech.phys.vel.x = Math.cos(dashAng) * 260;
      mech.phys.vel.y = Math.sin(dashAng) * 260;
      resolveObstacleCollisions(mech.phys.pos, mech.phys.vel, mech.spec.radius, this.map.obstacles, this.map.width, this.map.height);
      mech.legs.reset(mech.spec.legs, mech.phys.pos, mech.phys.bodyAngle);
      if (mech.stealth?.supported) {
        forceActivateStealth(mech.stealth);
      }
      // Piercing cleave along dash path
      for (let i = 0; i < targetPool.length; i++) {
        const e = targetPool[i];
        if (!e.alive || e.downed) continue;
        const dLine = pointToSegmentDist(e.phys.pos.x, e.phys.pos.y, startX, startY, mech.phys.pos.x, mech.phys.pos.y);
        if (dLine <= e.spec.radius + 78) {
          const res = applyComponentDamage(e.health, 190, 0, { piercing: true });
          e.hitFlashTimer = 0.14;
          if (mech.isPlayer && this.screen === 'playing') {
            this.damageDealt += 190;
            this.particles.addText(e.phys.pos.x, e.phys.pos.y - 26, 'CLEAVE 190', '#fb7185');
          }
          if (res.destroyed && e.alive) this.handleMechDestroyed(e, mech.id);
        }
      }
      if (mech.team === 'player' && this.boss && this.boss.alive && !this.boss.destroying) {
        const dBoss = pointToSegmentDist(this.boss.phys.pos.x, this.boss.phys.pos.y, startX, startY, mech.phys.pos.x, mech.phys.pos.y);
        if (dBoss <= this.boss.spec.radius + 78) {
          this.boss.applyDamage(190, mech.phys.pos.x, mech.phys.pos.y, { piercing: true });
        }
      }
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 12, 96, 0.35, '#fb7185', 0.95, 6);
      if (this.screen === 'playing') {
        this.audio.playMorphAbilityCue('assassin_crimson_tempest', 'deploy', mech.isPlayer ? 1 : 0.6);
        this.camera.addShake(0.28, 'dash');
        if (mech.isPlayer) this.pushHudSnapshot();
      }
      return;
    }

    mech.specialActiveTimer = sp.duration;
    mech.specialCooldownTimer = sp.cooldown;
    const isMorphKind =
      sp.kind !== 'overdrive' &&
      sp.kind !== 'stabilizer' &&
      sp.kind !== 'siege_stance' &&
      sp.kind !== 'artillery_salvo' &&
      sp.kind !== 'overwatch_barrage' &&
      sp.kind !== 'ecm_pulse' &&
      sp.kind !== 'repair_field' &&
      sp.kind !== 'flight_overdrive' &&
      sp.kind !== 'aegis_armor';
    if (this.screen === 'playing') {
      if (isMorphKind) {
        this.audio.playMorphAbilityCue(sp.kind, 'deploy', mech.isPlayer ? 1 : 0.55);
      } else {
        this.audio.playWeaponFire('ewar_pulse', mech.isPlayer ? 1 : 0.4);
      }
    }

    const aimTarget = mech.isPlayer
      ? this.mouseWorld
      : { x: mech.phys.pos.x + Math.cos(mech.phys.aimAngle) * 420, y: mech.phys.pos.y + Math.sin(mech.phys.aimAngle) * 420 };
    const enemyPool = mech.team === 'player' ? this.enemies : [this.player, ...this.allies];

    if (sp.kind === 'recon_apex_scan') {
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 18, 720, 0.6, '#38bdf8', 0.92, 6);
      for (const e of enemyPool) {
        if (!e.alive) continue;
        if (Math.hypot(e.phys.pos.x - mech.phys.pos.x, e.phys.pos.y - mech.phys.pos.y) <= 1300) {
          e.detected = true;
          e.markedTimer = 7.0;
          if (e.stealth) e.stealth.revealedTimer = Math.max(e.stealth.revealedTimer, 7.0);
        }
      }
      this.friendlyDeployables.push({
        id: `fdep_${this.spawnCounter++}`,
        kind: 'recon_beacon',
        ownerId: mech.id,
        x: mech.phys.pos.x,
        y: mech.phys.pos.y,
        radius: 14,
        hp: 140,
        maxHp: 140,
        aimAngle: 0,
        cooldown: 0,
        life: 12.0,
        maxLife: 12.0,
        hitFlashTimer: 0,
        pulsePhase: 0,
      });
      this.particles.addText(mech.phys.pos.x, mech.phys.pos.y - 30, 'TELEMETRY SWEEP', '#38bdf8');
    } else if (sp.kind === 'standard_bulwark_salvo') {
      const aimAng = Math.atan2(aimTarget.y - mech.phys.pos.y, aimTarget.x - mech.phys.pos.x);
      for (let m = 0; m < 4; m++) {
        const offsetAng = aimAng + (m - 1.5) * 0.22;
        this.projectiles.spawn({
          team: mech.team,
          ownerId: mech.id,
          kind: 'missile',
          missileType: 'interceptor',
          x: mech.phys.pos.x + Math.cos(offsetAng) * (mech.spec.radius + 8),
          y: mech.phys.pos.y + Math.sin(offsetAng) * (mech.spec.radius + 8),
          angle: offsetAng,
          speed: 580,
          damage: 68,
          splashRadius: 54,
          range: 900,
          piercing: false,
          caliber: 4.5,
          homingTurnRate: 4.4,
          targetX: aimTarget.x,
          targetY: aimTarget.y,
        });
      }
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 12, 82, 0.38, '#fbbf24', 0.9, 6);
    } else if (sp.kind === 'sniper_hyper_lockdown') {
      const fireAng = Math.atan2(aimTarget.y - mech.phys.pos.y, aimTarget.x - mech.phys.pos.x);
      const mx = mech.phys.pos.x + Math.cos(fireAng) * (mech.spec.radius + 14);
      const my = mech.phys.pos.y + Math.sin(fireAng) * (mech.spec.radius + 14);
      this.projectiles.spawn({
        team: mech.team,
        ownerId: mech.id,
        kind: 'railgun',
        x: mx,
        y: my,
        angle: fireAng,
        speed: 2200,
        damage: 420,
        splashRadius: 24,
        range: 1450,
        piercing: true,
        caliber: 9,
      });
      this.particles.spawnMuzzleFlash(mx, my, fireAng, 9, true);
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 10, 68, 0.3, '#22d3ee', 0.9, 6);
      if (mech.isPlayer) this.camera.addShake(0.36, 'recoil');
    } else if (sp.kind === 'heavy_siege_ram') {
      if (mech.morphRig) mech.morphRig.ramStroke = 1;
      const aimAng = Math.atan2(aimTarget.y - mech.phys.pos.y, aimTarget.x - mech.phys.pos.x);
      const ramX = mech.phys.pos.x + Math.cos(aimAng) * (mech.spec.radius + 42);
      const ramY = mech.phys.pos.y + Math.sin(aimAng) * (mech.spec.radius + 42);
      this.particles.spawnExplosion(ramX, ramY, 125);
      this.particles.emit('shockwave', ramX, ramY, 0, 0, 18, 195, 0.42, '#f97316', 0.95, 6);
      for (const e of enemyPool) {
        if (!e.alive) continue;
        const d = Math.hypot(e.phys.pos.x - mech.phys.pos.x, e.phys.pos.y - mech.phys.pos.y);
        if (d <= 220) {
          const angTo = Math.atan2(e.phys.pos.y - mech.phys.pos.y, e.phys.pos.x - mech.phys.pos.x);
          let diff = angTo - aimAng;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) <= 1.15 || d < 85) {
            const res = applyComponentDamage(e.health, 320, 0, { piercing: true });
            e.jammedTimer = Math.max(e.jammedTimer, 2.2);
            e.phys.vel.x += Math.cos(angTo) * 290;
            e.phys.vel.y += Math.sin(angTo) * 290;
            e.hitFlashTimer = 0.14;
            if (mech.isPlayer && this.screen === 'playing') {
              this.damageDealt += 320;
              this.particles.addText(e.phys.pos.x, e.phys.pos.y - 26, 'RAM 320', '#f97316');
            }
            if (res.destroyed && e.alive) this.handleMechDestroyed(e, mech.id);
          }
        }
      }
      if (mech.team === 'player' && this.boss && this.boss.alive && !this.boss.destroying) {
        if (Math.hypot(this.boss.phys.pos.x - ramX, this.boss.phys.pos.y - ramY) <= this.boss.spec.radius + 140) {
          this.boss.applyDamage(320, ramX, ramY, { piercing: true });
        }
      }
      let navChanged = false;
      for (const obs of this.map.obstacles) {
        if (obs.destroyed || !obs.destructible || GrappleTargetRegistry.isObstacleGrappleable(obs)) continue;
        if (Math.hypot(obs.x - ramX, obs.y - ramY) <= 170) {
          obs.hp = 0;
          obs.destroyed = true;
          navChanged = true;
          this.particles.spawnExplosion(obs.x, obs.y, 70);
        }
      }
      if (navChanged) this.navGrid.rebuild(this.map.obstacles);
      if (mech.isPlayer) this.camera.addShake(0.45, 'explosion');
    } else if (sp.kind === 'artillery_earthshaker') {
      // Instant primary auto-reload + 5 staggered incendiary earthshaker shells around cursor
      mech.primary.reloading = false;
      mech.primary.ammo = mech.primary.spec.magazineSize;
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.4;
        const dist = i === 0 ? 0 : 75 + Math.random() * 55;
        this.projectiles.spawn({
          team: mech.team,
          ownerId: mech.id,
          kind: 'artillery',
          x: mech.phys.pos.x,
          y: mech.phys.pos.y,
          angle: mech.phys.aimAngle,
          speed: 590,
          damage: 145,
          splashRadius: 135,
          range: 1480,
          piercing: false,
          caliber: 9.5,
          targetX: aimTarget.x + Math.cos(ang) * dist,
          targetY: aimTarget.y + Math.sin(ang) * dist,
          spawnIncendiaryZone: true,
        });
      }
      if (mech.isPlayer) this.camera.addShake(0.48, 'artillery');
    } else if (sp.kind === 'colossus_apocalypse_salvo') {
      const sol = mech.isPlayer ? this.getMortarSolution() : null;
      const tx = sol ? sol.targetX : aimTarget.x;
      const ty = sol ? sol.targetY : aimTarget.y;
      const activeAmmo = mech.isPlayer ? this.mortarAmmo.activeAmmo : 'he';
      if (mech.isPlayer) {
        this.overwatchBarrage.trigger(tx, ty, activeAmmo);
        this.bossCinematics.startOverwatchCinematic(
          mech.phys.pos,
          { x: tx, y: ty },
          this.save.settings.bossCinematics
        );
      }
      // Spawn 2 extra immediate heavy flanking shells -> full 7-shell Apocalypse saturation!
      const ammoSpec = MORTAR_AMMO_SPECS[activeAmmo];
      for (const side of [-1, 1]) {
        this.projectiles.spawn({
          team: mech.team,
          ownerId: mech.id,
          kind: 'artillery',
          x: mech.phys.pos.x,
          y: mech.phys.pos.y,
          angle: mech.phys.aimAngle,
          speed: ammoSpec.flightSpeed * 1.18,
          damage: Math.round(mech.primary.spec.damage * 0.95 * ammoSpec.damageMult),
          splashRadius: Math.round(ammoSpec.splashRadius * 1.45),
          range: 2100,
          piercing: ammoSpec.piercing,
          caliber: 11,
          targetX: tx + side * 120,
          targetY: ty + (Math.random() - 0.5) * 90,
          mortarAmmo: activeAmmo,
          isPlayerMortar: true,
        });
      }
      if (mech.isPlayer) this.camera.addShake(0.46, 'artillery');
    } else if (sp.kind === 'ewar_tempest_storm') {
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 22, 900, 0.65, '#c084fc', 0.95, 6);
      for (const e of enemyPool) {
        if (!e.alive) continue;
        if (Math.hypot(e.phys.pos.x - mech.phys.pos.x, e.phys.pos.y - mech.phys.pos.y) <= 900) {
          e.jammedTimer = Math.max(e.jammedTimer, 8.0);
          e.detected = true;
          const res = applyComponentDamage(e.health, 110, 0, { emp: true });
          e.hitFlashTimer = 0.1;
          if (mech.isPlayer && this.screen === 'playing') {
            this.damageDealt += 110;
            this.particles.addText(e.phys.pos.x, e.phys.pos.y - 24, 'EMP 110', '#c084fc');
          }
          if (res.destroyed && e.alive) this.handleMechDestroyed(e, mech.id);
        }
      }
      if (mech.team === 'player' && this.boss && this.boss.alive && !this.boss.destroying) {
        if (Math.hypot(this.boss.phys.pos.x - mech.phys.pos.x, this.boss.phys.pos.y - mech.phys.pos.y) <= 900) {
          this.boss.empScrambleTimer = Math.max(this.boss.empScrambleTimer, 7.0);
          this.boss.applyDamage(140, mech.phys.pos.x, mech.phys.pos.y, { emp: true });
        }
      }
      // Destroy hostile missiles mid-air inside EMP storm
      for (let i = 0; i < this.projectiles.items.length; i++) {
        const p = this.projectiles.items[i];
        if (!p.active || p.team === mech.team || p.kind !== 'missile') continue;
        if (Math.hypot(p.x - mech.phys.pos.x, p.y - mech.phys.pos.y) <= 900) {
          this.particles.spawnExplosion(p.x, p.y, 26);
          p.active = false;
        }
      }
      // Spawn 2 flanking holographic EWAR decoys
      for (const side of [-1, 1]) {
        const dAng = mech.phys.bodyAngle + side * 1.1;
        this.friendlyDeployables.push({
          id: `fdep_${this.spawnCounter++}`,
          kind: 'ewar_decoy',
          ownerId: mech.id,
          x: Math.max(48, Math.min(this.map.width - 48, mech.phys.pos.x + Math.cos(dAng) * 110)),
          y: Math.max(48, Math.min(this.map.height - 48, mech.phys.pos.y + Math.sin(dAng) * 110)),
          radius: 18,
          hp: 210,
          maxHp: 210,
          aimAngle: mech.phys.aimAngle,
          cooldown: 0,
          life: 10.0,
          maxLife: 10.0,
          hitFlashTimer: 0,
          pulsePhase: 0,
        });
      }
    } else if (sp.kind === 'engineer_fabricator_rig') {
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 22, 360, 0.52, '#34d399', 0.9, 6);
      const sx = Math.max(48, Math.min(this.map.width - 48, mech.phys.pos.x + Math.cos(mech.phys.aimAngle) * 56));
      const sy = Math.max(48, Math.min(this.map.height - 48, mech.phys.pos.y + Math.sin(mech.phys.aimAngle) * 56));
      this.friendlyDeployables.push({
        id: `fdep_${this.spawnCounter++}`,
        kind: 'engineer_sentry',
        ownerId: mech.id,
        x: sx,
        y: sy,
        radius: 15,
        hp: 240,
        maxHp: 240,
        aimAngle: mech.phys.aimAngle,
        cooldown: 0.25,
        life: 18.0,
        maxLife: 18.0,
        hitFlashTimer: 0,
        pulsePhase: 0,
      });
    } else if (sp.kind === 'valkyrie_seraphim_strike') {
      if (mech.flight) {
        mech.flight.heat = 0;
        mech.flight.overheated = false;
        mech.flight.afterburnerTimer = sp.duration;
        if (mech.flight.altitude < 48) {
          mech.flight.verticalVel = Math.max(mech.flight.verticalVel, 165);
        }
      }
      const aimAng = Math.atan2(aimTarget.y - mech.phys.pos.y, aimTarget.x - mech.phys.pos.x);
      for (let m = 0; m < 8; m++) {
        const sgn = m % 2 === 0 ? 1 : -1;
        const spread = aimAng + sgn * (0.28 + Math.floor(m / 2) * 0.16);
        this.projectiles.spawn({
          team: mech.team,
          ownerId: mech.id,
          kind: 'missile',
          missileType: 'advanced_tracking',
          x: mech.phys.pos.x + Math.cos(spread) * 18,
          y: mech.phys.pos.y + Math.sin(spread) * 18,
          angle: spread,
          speed: 610,
          damage: 72,
          splashRadius: 56,
          range: 1150,
          piercing: false,
          caliber: 4.8,
          homingTurnRate: 4.8,
          launchAltitude: mech.flight?.altitude ?? 35,
          targetX: aimTarget.x,
          targetY: aimTarget.y,
        });
      }
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 12, 86, 0.36, '#38bdf8', 0.92, (mech.flight?.altitude ?? 12) * 0.52);
    } else if (sp.kind === 'phantom_overclock_aegis') {
      const squadUnits = mech.team === 'player' ? [this.player, ...this.allies] : [mech];
      const shieldedCount = activateAegisArmorForSquad(squadUnits);
      for (const u of squadUnits) {
        if (!u.alive) continue;
        this.particles.emit('shockwave', u.phys.pos.x, u.phys.pos.y, 0, 0, 8, u.spec.radius * 2.4, 0.45, '#22d3ee', 0.92, 8);
        this.particles.addText(u.phys.pos.x, u.phys.pos.y - 30, 'OVERCLOCK AEGIS', '#22d3ee');
      }
      if (mech.dash) {
        mech.dash.cooldownTimer = 0;
        mech.dash.charges = mech.dash.spec.maxCharges;
      }
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 16, 280, 0.44, '#67e8f9', 0.95, 8);
      for (const e of enemyPool) {
        if (!e.alive) continue;
        const d = Math.hypot(e.phys.pos.x - mech.phys.pos.x, e.phys.pos.y - mech.phys.pos.y);
        if (d <= 280) {
          const res = applyComponentDamage(e.health, 140, 0, { emp: true });
          e.jammedTimer = Math.max(e.jammedTimer, 1.8);
          const ang = Math.atan2(e.phys.pos.y - mech.phys.pos.y, e.phys.pos.x - mech.phys.pos.x);
          e.phys.vel.x += Math.cos(ang) * 230;
          e.phys.vel.y += Math.sin(ang) * 230;
          if (mech.isPlayer && this.screen === 'playing') this.damageDealt += 140;
          if (res.destroyed && e.alive) this.handleMechDestroyed(e, mech.id);
        }
      }
      if (this.screen === 'playing') {
        this.pushRadio(mech.callsign, `Overclock Aegis deployed on ${shieldedCount} squad units — phase capacitors refreshed.`);
      }
    } else if (sp.kind === 'flight_overdrive' && mech.flight) {
      mech.flight.heat = Math.max(0, mech.flight.heat - 65);
      mech.flight.overheated = false;
      mech.flight.afterburnerTimer = sp.duration;
      if (mech.flight.altitude < 42) {
        mech.flight.verticalVel = Math.max(mech.flight.verticalVel, 145);
      }
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 12, 70, 0.35, '#38bdf8', 0.9, (mech.flight.altitude || 12) * 0.52);
    } else if (sp.kind === 'overwatch_barrage') {
      const sol = mech.isPlayer ? this.getMortarSolution() : null;
      const tx = sol ? sol.targetX : this.mouseWorld.x;
      const ty = sol ? sol.targetY : this.mouseWorld.y;
      this.overwatchBarrage.trigger(tx, ty, this.mortarAmmo.activeAmmo);
      this.bossCinematics.startOverwatchCinematic(
        mech.phys.pos,
        { x: tx, y: ty },
        this.save.settings.bossCinematics
      );
      this.camera.addShake(0.42, 'artillery');
    } else if (sp.kind === 'artillery_salvo') {
      // Launch 3 precision barrage shells onto cursor!
      for (let i = 0; i < 3; i++) {
        const ox = (Math.random() - 0.5) * 110;
        const oy = (Math.random() - 0.5) * 110;
        this.projectiles.spawn({
          team: mech.team,
          ownerId: mech.id,
          kind: 'artillery',
          x: mech.phys.pos.x,
          y: mech.phys.pos.y,
          angle: mech.phys.aimAngle,
          speed: 560,
          damage: 115,
          splashRadius: 115,
          range: 1300,
          piercing: false,
          caliber: 8,
          targetX: this.mouseWorld.x + ox,
          targetY: this.mouseWorld.y + oy,
        });
      }
      this.camera.addShake(0.45, 'artillery');
    } else if (sp.kind === 'ecm_pulse') {
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 20, 620, 0.55, '#a78bfa', 0.9, 4);
      const enemiesPool = mech.team === 'player' ? this.enemies : [this.player, ...this.allies];
      for (const e of enemiesPool) {
        if (!e.alive) continue;
        if (Math.hypot(e.phys.pos.x - mech.phys.pos.x, e.phys.pos.y - mech.phys.pos.y) <= 700) {
          e.jammedTimer = 7.0;
          e.detected = true;
        }
      }
    } else if (sp.kind === 'repair_field') {
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 20, 260, 0.45, '#34d399', 0.85, 4);
    } else if (sp.kind === 'aegis_armor') {
      // Deploy 30s Infinite-HP individually adaptive protective armor around EVERY active friendly squadmate
      const squadUnits = mech.team === 'player' ? [this.player, ...this.allies] : [mech];
      const shieldedCount = activateAegisArmorForSquad(squadUnits);
      for (const u of squadUnits) {
        if (!u.alive) continue;
        this.particles.emit('shockwave', u.phys.pos.x, u.phys.pos.y, 0, 0, 8, u.spec.radius * 2.4, 0.45, '#22d3ee', 0.92, 8);
        this.particles.addText(u.phys.pos.x, u.phys.pos.y - 30, 'AEGIS ARMOR 30s', '#22d3ee');
      }
      if (this.screen === 'playing') {
        this.pushRadio(mech.callsign, `Aegis Phase-Armor materialized on ${shieldedCount} squad units — 30 seconds.`);
      }
    } else {
      this.particles.emit('shockwave', mech.phys.pos.x, mech.phys.pos.y, 0, 0, 14, 58, 0.3, mech.paint.accent, 0.8, 4);
    }

    if (mech.isPlayer) {
      this.pushRadio('Systems', `${sp.name} engaged.`);
      this.pushHudSnapshot();
    }
  }

  private stepBossAndHazards(dt: number): void {
    // 1. Update active incoming artillery countdown rings
    for (let i = this.incomingWarnings.length - 1; i >= 0; i--) {
      this.incomingWarnings[i].remaining -= dt;
      if (this.incomingWarnings[i].remaining <= 0) {
        this.incomingWarnings.splice(i, 1);
      }
    }

    // 2. Update delayed bunker-buster / cataclysm secondary detonations
    for (let i = this.delayedBlasts.length - 1; i >= 0; i--) {
      const db = this.delayedBlasts[i];
      db.timer -= dt;
      if (db.timer <= 0) {
        this.detonateBossWarhead(db.x, db.y, db.radius, db.damage, db.warheadType, false);
        this.delayedBlasts.splice(i, 1);
      }
    }

    // 3. Update persistent radiation & thermoblast fire zones
    const targets = [this.player, ...this.allies];
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.life -= dt;
      if (hz.life <= 0) {
        this.hazards.splice(i, 1);
        continue;
      }
      if (Math.random() < dt * 7) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * hz.radius * 0.85;
        this.particles.emit(
          hz.kind === 'fire' ? 'fire' : 'smoke',
          hz.x + Math.cos(ang) * rad,
          hz.y + Math.sin(ang) * rad,
          0,
          -14,
          6,
          14,
          0.55,
          hz.kind === 'fire' ? '#f97316' : '#84cc16',
          0.45,
          4,
          18
        );
      }
      hz.tickAccum += dt;
      if (hz.tickAccum >= 0.45) {
        hz.tickAccum = 0;
        const zoneTargets = hz.team === 'player' ? this.enemies : targets;
        for (const u of zoneTargets) {
          if (!u.alive) continue;
          if (hz.team !== 'player') {
            const imm = checkUnitDamageImmunity({
              trainingGodMode: u.isPlayer && this.trainingGodMode,
              dashInvulnerable: u.dash?.isInvulnerableDuringDash(),
              aegisArmorActive: isAegisArmorActive(u),
            });
            if (imm !== 'none') {
              if (imm === 'aegis_armor') triggerAegisDeflectFlash(u);
              continue;
            }
          }
          if (Math.hypot(u.phys.pos.x - hz.x, u.phys.pos.y - hz.y) <= hz.radius) {
            const dmgMult = u.markedTimer && u.markedTimer > 0 ? 1.28 : 1.0;
            const res = applyComponentDamage(u.health, hz.dps * 0.45 * dmgMult, 0, { splash: true });
            if (hz.team === 'player' && hz.ownerId === 'player' && this.screen === 'playing') {
              this.damageDealt += Math.round(hz.dps * 0.45 * dmgMult);
            }
            if (res.destroyed && u.alive) this.handleMechDestroyed(u, hz.ownerId ?? 'hazard');
          }
        }
        if (hz.team === 'player' && this.boss && this.boss.alive && !this.boss.destroying) {
          if (Math.hypot(this.boss.phys.pos.x - hz.x, this.boss.phys.pos.y - hz.y) <= hz.radius + this.boss.spec.radius) {
            this.boss.applyDamage(hz.dps * 0.45, hz.x, hz.y);
          }
        }
      }
    }

    // 3b. Update friendly deployables (Recon Sensor Beacon, EWAR Decoy, Engineer Sentry)
    for (let i = this.friendlyDeployables.length - 1; i >= 0; i--) {
      const dep = this.friendlyDeployables[i];
      dep.life -= dt;
      if (dep.hitFlashTimer > 0) dep.hitFlashTimer = Math.max(0, dep.hitFlashTimer - dt);
      if (dep.hp <= 0 || dep.life <= 0) {
        this.particles.emit('shockwave', dep.x, dep.y, 0, 0, 6, 38, 0.28, '#38bdf8', 0.8, 4);
        this.friendlyDeployables.splice(i, 1);
        continue;
      }
      if (dep.kind === 'recon_beacon') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.phys.pos.x - dep.x, e.phys.pos.y - dep.y) <= 720) {
            e.detected = true;
            if (e.stealth) e.stealth.revealedTimer = Math.max(e.stealth.revealedTimer, 0.5);
          }
        }
      } else if (dep.kind === 'engineer_sentry') {
        dep.cooldown -= dt;
        // Intercept incoming enemy missiles near sentry OR fire bursts at nearest hostile
        let fired = false;
        if (dep.cooldown <= 0) {
          for (let pIdx = 0; pIdx < this.projectiles.items.length; pIdx++) {
            const p = this.projectiles.items[pIdx];
            if (!p.active || p.team !== 'enemy' || p.kind !== 'missile') continue;
            if (Math.hypot(p.x - dep.x, p.y - dep.y) <= 320) {
              dep.aimAngle = Math.atan2(p.y - dep.y, p.x - dep.x);
              this.particles.spawnExplosion(p.x, p.y, 24);
              p.active = false;
              dep.cooldown = 0.45;
              fired = true;
              break;
            }
          }
          if (!fired) {
            let nearest: MechActor | null = null;
            let bestD = 540;
            for (const e of this.enemies) {
              if (!e.alive) continue;
              const d = Math.hypot(e.phys.pos.x - dep.x, e.phys.pos.y - dep.y);
              if (d < bestD && hasLineOfSight({ x: dep.x, y: dep.y }, e.phys.pos, this.map.obstacles)) {
                bestD = d;
                nearest = e;
              }
            }
            if (nearest) {
              dep.aimAngle = Math.atan2(nearest.phys.pos.y - dep.y, nearest.phys.pos.x - dep.x);
              dep.cooldown = 0.42;
              this.projectiles.spawn({
                team: 'player',
                ownerId: dep.ownerId,
                kind: 'autocannon',
                x: dep.x + Math.cos(dep.aimAngle) * (dep.radius + 6),
                y: dep.y + Math.sin(dep.aimAngle) * (dep.radius + 6),
                angle: dep.aimAngle + (Math.random() - 0.5) * 0.05,
                speed: 740,
                damage: 22,
                splashRadius: 0,
                range: 560,
                piercing: false,
                caliber: 3.4,
              });
              this.particles.spawnMuzzleFlash(dep.x + Math.cos(dep.aimAngle) * 16, dep.y + Math.sin(dep.aimAngle) * 16, dep.aimAngle, 3.4);
            }
          }
        }
      }
    }

    // 4. Update boss deployables (autonomous turrets & radar decoys)
    for (let i = this.bossDeployables.length - 1; i >= 0; i--) {
      const dep = this.bossDeployables[i];
      dep.life -= dt;
      if (dep.hitFlashTimer > 0) dep.hitFlashTimer = Math.max(0, dep.hitFlashTimer - dt);
      if (dep.hp <= 0 || dep.life <= 0) {
        this.particles.spawnExplosion(dep.x, dep.y, 45);
        this.bossDeployables.splice(i, 1);
        continue;
      }
      if (dep.kind === 'turret') {
        const dx = this.player.phys.pos.x - dep.x;
        const dy = this.player.phys.pos.y - dep.y;
        const dist = Math.hypot(dx, dy);
        dep.aimAngle = Math.atan2(dy, dx);
        dep.cooldown -= dt;
        if (dep.cooldown <= 0 && dist < 560 && this.player.alive) {
          dep.cooldown = 1.15;
          this.projectiles.spawn({
            team: 'enemy',
            ownerId: dep.id,
            kind: 'autocannon',
            x: dep.x + Math.cos(dep.aimAngle) * (dep.radius + 8),
            y: dep.y + Math.sin(dep.aimAngle) * (dep.radius + 8),
            angle: dep.aimAngle + (Math.random() - 0.5) * 0.08,
            speed: 580,
            damage: 14,
            splashRadius: 0,
            range: 620,
            piercing: false,
            caliber: 3.5,
          });
          this.particles.spawnMuzzleFlash(dep.x + Math.cos(dep.aimAngle) * 18, dep.y + Math.sin(dep.aimAngle) * 18, dep.aimAngle, 3.5);
        }
      }
    }

    // 5. Update Thunderhead Boss
    if (!this.boss || (!this.boss.alive && !this.boss.destroying)) return;

    const prevState = this.boss.aiState;
    const terrain = getTerrainAt(this.map, this.boss.phys.pos.x, this.boss.phys.pos.y);

    // Smarter Boss Threat Detection: evaluate all incoming player mortars & missiles
    const bossThreats: BossIncomingProjectileThreat[] = [];
    for (let i = 0; i < this.projectiles.items.length; i++) {
      const p = this.projectiles.items[i];
      if (!p.active || p.team !== 'player' || p.isCounterInterceptor) continue;
      if (!p.isPlayerMortar && p.kind !== 'artillery' && p.kind !== 'missile') continue;
      bossThreats.push({
        id: `p_${i}_${p.ownerId}`,
        kind: p.isBallistic || p.kind === 'artillery' ? 'mortar' : 'missile',
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        targetX: p.targetX,
        targetY: p.targetY,
        remainingFlightSec: p.isBallistic
          ? Math.max(0.01, p.flightDuration - p.flightTime)
          : Math.max(0.01, p.maxLife - p.life),
        splashRadius: p.splashRadius,
        damage: p.damage,
        piercing: Boolean(p.piercing),
        homing: p.homingTurnRate > 0,
      });
    }
    this.boss.evaluateIncomingProjectiles(bossThreats, this.map.obstacles, this.map.width, this.map.height);

    const actions = this.boss.update(
      dt,
      this.player.phys.pos,
      this.allies.filter((a) => a.alive).map((a) => a.phys.pos),
      this.defendStructure && this.defendStructure.hp > 0 ? { x: this.defendStructure.x, y: this.defendStructure.y } : null,
      terrain,
      this.map.obstacles,
      this.map.width,
      this.map.height
    );

    const bossSpatial = computeSpatialAudioParams(
      this.boss.phys.pos.x - this.camera.x,
      this.boss.phys.pos.y - this.camera.y,
      1900,
      false,
      false
    );
    const atten = Math.max(0.15, bossSpatial.distanceScale);

    // Loading shell sound cue when entering loading phase
    if (prevState !== 'loading' && this.boss.aiState === 'loading' && this.screen === 'playing') {
      this.audio.playBossLoadShell(atten, bossSpatial.pan);
    }

    // Heavy footstep impacts
    for (const fs of actions.footsteps) {
      this.particles.spawnFootDust(fs.x, fs.y, fs.weight, terrain);
      if (this.screen === 'playing') {
        this.audio.playBossFootstep(fs.weight, atten * 0.85, bossSpatial.pan);
        this.camera.addShake(0.065 * atten);
      }
    }

    if (actions.phaseChangedTo) {
      this.pushRadio(
        'Tactical Control',
        `${this.boss.spec.code} entering Phase ${actions.phaseChangedTo}! Strike intensity escalating!`
      );
      this.audio.playWarningAlarm();
    }

    if (actions.startUltimate) {
      this.bossCinematics.startUltimateCinematic(
        actions.startUltimate.variantId,
        actions.startUltimate.ultimateName,
        this.boss.spec.code,
        this.boss.phys.pos,
        actions.startUltimate.targetPos,
        this.save.settings.bossCinematics
      );
      if (this.screen === 'playing') {
        this.audio.playBossUltimateAlarm(actions.startUltimate.variantId);
        this.showWarning(`BOSS ULTIMATE: ${actions.startUltimate.ultimateName.toUpperCase()}!`);
      }
      this.pushRadio(
        'Tactical Control',
        `${this.boss.spec.code} unleashing ${actions.startUltimate.ultimateName}: ${this.boss.spec.ultimateDesc}`
      );
    }

    if (actions.startWarning) {
      const estDist = Math.hypot(actions.startWarning.x - this.boss.phys.pos.x, actions.startWarning.y - this.boss.phys.pos.y);
      const estFlight = Math.max(0.85, Math.min(3.4, estDist / 440));
      const allWarns = [actions.startWarning, ...(actions.extraWarnings ?? [])];
      for (const w of allWarns) {
        const tot = w.duration + estFlight;
        this.incomingWarnings.push({
          id: `warn_${this.spawnCounter++}`,
          x: w.x,
          y: w.y,
          radius: w.radius,
          remaining: tot,
          total: tot,
          warheadType: w.warheadType,
        });
      }
      if (this.screen === 'playing') {
        this.audio.playBossSirenWarning();
        this.showWarning(`NUCLEAR MORTAR LOCK: ${WARHEAD_LABELS[actions.startWarning.warheadType]} — EVADE IMPACT ZONE!`);
      }
    }

    if (actions.fireMortarShells) {
      for (const sh of actions.fireMortarShells) {
        this.projectiles.spawn({
          team: 'enemy',
          ownerId: this.boss.id,
          kind: 'artillery',
          x: sh.startX,
          y: sh.startY,
          angle: this.boss.turretAngle,
          speed: 440,
          damage: sh.damage,
          splashRadius: sh.splashRadius,
          range: 2800,
          piercing: false,
          caliber: 14,
          targetX: sh.targetX,
          targetY: sh.targetY,
          warheadType: sh.warheadType,
          isBossMortar: true,
          delayedSecondary: sh.delayedSecondary,
        });
        this.particles.spawnMuzzleFlash(sh.startX, sh.startY, this.boss.turretAngle, 14, sh.warheadType === 'emp');
      }
      if (this.screen === 'playing') {
        this.audio.playBossArtilleryFire(atten);
        this.camera.addShake(0.55 * atten);
      }
    }

    if (actions.fireAuxShots) {
      const bossMissileType: MissileType =
        this.boss.spec.id === 'cataclysm'
          ? 'heavy'
          : this.boss.spec.id === 'stormbringer'
          ? 'swarm'
          : 'standard';
      const friendlyPool = [this.player, ...this.allies].filter((u) => u.alive);
      let nearestFriendly = this.player;
      let nearestDist = 1e9;
      for (const f of friendlyPool) {
        const d = Math.hypot(f.phys.pos.x - this.boss.phys.pos.x, f.phys.pos.y - this.boss.phys.pos.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestFriendly = f;
        }
      }

      for (let idx = 0; idx < actions.fireAuxShots.length; idx++) {
        const s = actions.fireAuxShots[idx];
        const isMissile = s.kind === 'missile';
        this.projectiles.spawn({
          team: 'enemy',
          ownerId: this.boss.id,
          kind: isMissile ? 'missile' : s.kind === 'emp_lance' ? 'ewar_pulse' : 'autocannon',
          x: s.x,
          y: s.y,
          angle: s.angle,
          speed: isMissile ? getMissileProfile(bossMissileType).maxSpeed : 680,
          damage: s.damage,
          splashRadius: isMissile ? getMissileProfile(bossMissileType).splashRadius : s.kind === 'flak' ? 38 : 0,
          range: isMissile ? 1150 : 820,
          piercing: false,
          caliber: isMissile ? 5 : 4.2,
          homingTurnRate: isMissile ? getMissileProfile(bossMissileType).turnRateRad : 0,
          targetId: isMissile ? nearestFriendly.id : null,
          missileType: isMissile ? bossMissileType : undefined,
          launchAltitude: 18,
          swarmSeed: idx / Math.max(1, actions.fireAuxShots.length),
          lastKnownX: nearestFriendly.phys.pos.x,
          lastKnownY: nearestFriendly.phys.pos.y,
        });
        this.particles.spawnMuzzleFlash(s.x, s.y, s.angle, 4.5, s.kind === 'emp_lance');
      }
      if (this.screen === 'playing') {
        if (actions.fireAuxShots[0].kind === 'missile') {
          this.audio.playMissileVariantLaunch(bossMissileType, atten * 0.78, false, bossSpatial.pan);
        } else {
          this.audio.playWeaponFire('autocannon', atten * 0.75, false, 4.8, bossSpatial.pan);
        }
      }
    }

    if (actions.spawnDeployable) {
      this.bossDeployables.push({
        id: `dep_${this.spawnCounter++}`,
        kind: actions.spawnDeployable.kind,
        x: actions.spawnDeployable.x,
        y: actions.spawnDeployable.y,
        radius: 18,
        hp: actions.spawnDeployable.kind === 'turret' ? 160 : 95,
        maxHp: actions.spawnDeployable.kind === 'turret' ? 160 : 95,
        aimAngle: Math.PI,
        cooldown: 1.0,
        life: 28,
        maxLife: 28,
        hitFlashTimer: 0,
      });
      this.particles.emit('shockwave', actions.spawnDeployable.x, actions.spawnDeployable.y, 0, 0, 8, 42, 0.35, actions.spawnDeployable.kind === 'turret' ? '#eab308' : '#67e8f9', 0.9, 4);
    }

    if (actions.empPulse) {
      this.particles.emit('shockwave', actions.empPulse.x, actions.empPulse.y, 0, 0, 20, actions.empPulse.radius, 0.65, '#67e8f9', 0.9, 4);
      if (Math.hypot(this.player.phys.pos.x - actions.empPulse.x, this.player.phys.pos.y - actions.empPulse.y) <= actions.empPulse.radius) {
        this.empDisruptTimer = Math.max(this.empDisruptTimer, 3.2);
        this.showWarning('EMP WAVE HIT — RADAR & OPTICS DISRUPTED');
      }
    }

    if (actions.cookOffExplosion) {
      this.particles.spawnExplosion(actions.cookOffExplosion.x, actions.cookOffExplosion.y, actions.cookOffExplosion.radius);
      if (this.screen === 'playing') {
        this.audio.playExplosion(actions.cookOffExplosion.radius, atten * 0.9, false);
        this.camera.addShake(0.32);
      }
    }

    if (actions.finalDetonation) {
      this.particles.spawnNuclearExplosion(actions.finalDetonation.x, actions.finalDetonation.y, actions.finalDetonation.radius, 'strategic');
      this.nuclearDimAlpha = 0.25;
      this.audio.playBossDestruction();
      this.camera.addShake(0.95, 'boss');
      this.hitstopTimer = 0.08;
      this.kills++;
      this.creditsEarned += this.boss.spec.id === 'cataclysm' ? 1200 : 650;
      this.audio.setBossIntensity(false);
      this.bossDirector.notifyBossDefeated();
      this.pushRadio('Tactical Control', `${this.boss.spec.code} ${this.boss.spec.name} DESTROYED! Colossal kill confirmed!`);
    }
  }

  private detonateBossWarhead(
    x: number,
    y: number,
    radius: number,
    damage: number,
    warhead: BossWarheadType,
    allowDelayedSecondary: boolean
  ): void {
    this.particles.spawnNuclearExplosion(x, y, radius, warhead);
    const distCam = Math.hypot(x - this.camera.x, y - this.camera.y);
    const atten = Math.max(0.2, 1 - distCam / 2100);

    if (this.screen === 'playing') {
      this.audio.playBossNuclearDetonation(warhead, atten);
      this.camera.addShake(Math.min(0.92, (warhead === 'strategic' ? 0.85 : 0.65) * atten), 'boss');
    }

    if (warhead === 'strategic' || warhead === 'thermoblast') {
      this.nuclearDimAlpha = Math.max(this.nuclearDimAlpha, 0.28);
    }

    // Bunker buster shatters non-grappleable obstacles aggressively while preserving grapple anchors
    const obsHitRad = warhead === 'bunker_buster' ? radius * 1.1 : radius * 0.72;
    let rebuiltGrid = false;
    for (const obs of this.map.obstacles) {
      if (obs.destroyed || GrappleTargetRegistry.isObstacleGrappleable(obs)) continue;
      if (Math.hypot(obs.x - x, obs.y - y) <= obsHitRad) {
        if (obs.destructible || warhead === 'bunker_buster' || warhead === 'strategic') {
          obs.destroyed = true;
          rebuiltGrid = true;
        }
      }
    }
    if (rebuiltGrid) this.navGrid.rebuild(this.map.obstacles);

    // Apply damage to friendlies inside blast
    const targets = [this.player, ...this.allies];
    for (const t of targets) {
      if (!t.alive) continue;
      const d = Math.hypot(t.phys.pos.x - x, t.phys.pos.y - y);
      if (d <= radius + t.spec.radius) {
        const imm = checkUnitDamageImmunity({
          trainingGodMode: t.isPlayer && this.trainingGodMode,
          dashInvulnerable: t.dash?.isInvulnerableDuringDash(),
          aegisArmorActive: isAegisArmorActive(t),
        });
        if (imm !== 'none') {
          if (imm === 'aegis_armor') {
            triggerAegisDeflectFlash(t);
            this.particles.emit('shockwave', t.phys.pos.x, t.phys.pos.y, 0, 0, 10, t.spec.radius + 16, 0.22, '#22d3ee', 0.85, 8);
          } else if (imm === 'teleport_dash') {
            this.particles.addText(t.phys.pos.x, t.phys.pos.y - 24, 'PHASE EVADE', '#67e8f9');
          }
          continue;
        }
        const falloff = Math.max(0.3, 1 - d / (radius + t.spec.radius));
        const res = applyComponentDamage(t.health, damage * falloff, 0, {
          splash: true,
          emp: warhead === 'emp',
        });
        t.hitFlashTimer = 0.08;
        const pushD = d || 1;
        t.phys.vel.x += ((t.phys.pos.x - x) / pushD) * 145 * falloff;
        t.phys.vel.y += ((t.phys.pos.y - y) / pushD) * 145 * falloff;
        if (t.isPlayer && warhead === 'emp') {
          this.empDisruptTimer = Math.max(this.empDisruptTimer, 3.8);
          this.showWarning('EMP NUCLEAR BLAST — SENSORS & RADAR SCRAMBLED');
        }
        if (res.destroyed && t.alive) this.handleMechDestroyed(t, 'boss_mortar');
      }
    }

    // Apply damage to Strategic Defense Relay if hit
    if (this.defendStructure && this.defendStructure.hp > 0) {
      const dd = Math.hypot(this.defendStructure.x - x, this.defendStructure.y - y);
      if (dd <= radius + this.defendStructure.radius) {
        const falloff = Math.max(0.35, 1 - dd / (radius + this.defendStructure.radius));
        this.defendStructure.hp = Math.max(0, this.defendStructure.hp - damage * 1.15 * falloff);
      }
    }

    // Spawn lingering hazard zones (radiation for strategic nuclear, fire for thermoblast)
    if (warhead === 'strategic') {
      this.hazards.push({
        id: `hz_${this.spawnCounter++}`,
        kind: 'radiation',
        x,
        y,
        radius: radius * 0.78,
        life: 9.5,
        maxLife: 9.5,
        dps: 14,
        tickAccum: 0,
      });
    } else if (warhead === 'thermoblast') {
      this.hazards.push({
        id: `hz_${this.spawnCounter++}`,
        kind: 'fire',
        x,
        y,
        radius: radius * 0.82,
        life: 8.5,
        maxLife: 8.5,
        dps: 22,
        tickAccum: 0,
      });
    }

    // Cataclysm delayed secondary shockwave detonation
    if (allowDelayedSecondary) {
      this.delayedBlasts.push({
        x: x + (Math.random() - 0.5) * 90,
        y: y + (Math.random() - 0.5) * 90,
        radius: radius * 0.65,
        damage: damage * 0.55,
        warheadType: 'thermoblast',
        timer: 0.95,
      });
    }
  }

  private stepProjectiles(dt: number): void {
    const allUnits = [this.player, ...this.allies, ...this.enemies];

    for (let i = 0; i < this.projectiles.items.length; i++) {
      const p = this.projectiles.items[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        if (p.isBallistic) {
          if (p.isBossMortar && p.warheadType) {
            this.detonateBossWarhead(p.targetX, p.targetY, p.splashRadius, p.damage, p.warheadType, Boolean(p.delayedSecondary));
          } else {
            this.detonateSplash(p.targetX, p.targetY, p.splashRadius, p.damage, p.team, p.ownerId);
          }
        }
        p.active = false;
        continue;
      }

      p.prevX = p.x;
      p.prevY = p.y;

      if (p.isBallistic) {
        p.flightTime += dt;
        const t = p.flightTime / p.flightDuration;
        p.x = p.startX + (p.targetX - p.startX) * t;
        p.y = p.startY + (p.targetY - p.startY) * t;

        if (p.isPlayerMortar) {
          const arcZ = Math.sin(t * Math.PI) * p.arcHeight;
          const col = p.mortarAmmo ? MORTAR_AMMO_SPECS[p.mortarAmmo].color : '#fb923c';
          if (Math.random() < 0.72) {
            this.particles.emit('smoke', p.x, p.y, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 7, 16, 0.55, col, 0.45, arcZ, 8);
          }
          // Cluster mortar splits mid-descent into 6 sub-munitions!
          if (p.mortarAmmo === 'cluster' && !p.clusterSplitDone && t >= 0.6) {
            p.clusterSplitDone = true;
            this.particles.emit('shockwave', p.x, p.y - arcZ, 0, 0, 8, 52, 0.35, '#fbbf24', 0.9, arcZ);
            for (let c = 0; c < 6; c++) {
              const ca = (c / 6) * Math.PI * 2 + Math.random() * 0.35;
              const cr = 55 + Math.random() * 75;
              this.projectiles.spawn({
                team: 'player',
                ownerId: p.ownerId,
                kind: 'artillery',
                x: p.x,
                y: p.y,
                angle: Math.atan2(p.targetY - p.y, p.targetX - p.x),
                speed: 480,
                damage: p.damage * 0.52,
                splashRadius: 92,
                range: 1200,
                piercing: false,
                caliber: 7,
                targetX: p.targetX + Math.cos(ca) * cr,
                targetY: p.targetY + Math.sin(ca) * cr,
                mortarAmmo: 'he',
                isPlayerMortar: true,
              });
            }
          }
        }

        if (p.isBossMortar) {
          const arcZ = Math.sin(t * Math.PI) * p.arcHeight;
          if (Math.random() < 0.7) {
            this.particles.emit('smoke', p.x, p.y, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 9, 22, 0.75, '#475569', 0.52, arcZ, 8);
          }
          // Cluster airburst warhead splits mid-descent into 5 sub-munitions!
          if (p.warheadType === 'cluster' && !p.clusterSplitDone && t >= 0.62) {
            p.clusterSplitDone = true;
            this.particles.emit('shockwave', p.x, p.y - arcZ, 0, 0, 8, 52, 0.35, '#fbbf24', 0.9, arcZ);
            for (let c = 0; c < 5; c++) {
              const ca = (c / 5) * Math.PI * 2 + Math.random() * 0.4;
              const cr = 65 + Math.random() * 85;
              this.projectiles.spawn({
                team: 'enemy',
                ownerId: p.ownerId,
                kind: 'artillery',
                x: p.x,
                y: p.y,
                angle: Math.atan2(p.targetY - p.y, p.targetX - p.x),
                speed: 420,
                damage: p.damage * 0.48,
                splashRadius: 95,
                range: 1400,
                piercing: false,
                caliber: 8,
                targetX: p.targetX + Math.cos(ca) * cr,
                targetY: p.targetY + Math.sin(ca) * cr,
                warheadType: 'thermoblast',
                isBossMortar: false,
              });
            }
          }
        }

        if (p.flightTime >= p.flightDuration) {
          if (p.isBossMortar && p.warheadType) {
            this.detonateBossWarhead(p.targetX, p.targetY, p.splashRadius, p.damage, p.warheadType, Boolean(p.delayedSecondary));
          } else if (p.isPlayerMortar && p.mortarAmmo) {
            this.detonatePlayerMortar(p.targetX, p.targetY, p.splashRadius, p.damage, p.mortarAmmo, p.ownerId);
          } else {
            this.detonateSplash(p.targetX, p.targetY, p.splashRadius, p.damage, p.team, p.ownerId);
            if (p.spawnIncendiaryZone) {
              this.hazards.push({
                id: `hz_${this.spawnCounter++}`,
                kind: 'fire',
                team: 'player',
                ownerId: p.ownerId,
                x: p.targetX,
                y: p.targetY,
                radius: 85,
                life: 5.0,
                maxLife: 5.0,
                dps: 22,
                tickAccum: 0,
              });
            }
          }
          p.active = false;
        }
        continue;
      }

      // Defensive Counter-Interceptor Missile pursuit & mid-air proximity detonation
      if (p.kind === 'missile' && p.isCounterInterceptor) {
        const icRes = stepCounterInterceptorProjectile(p, dt, this.projectiles.items);
        const altZ = (p.missileAlt ?? 0) * 0.52 + 6;
        if (p.active && Math.random() < 0.85) {
          this.particles.emit(
            'smoke',
            p.x,
            p.y,
            -p.vx * 0.03,
            -p.vy * 0.03,
            2.1,
            6.5,
            0.22,
            '#e0f2fe',
            0.65,
            altZ
          );
        }
        if (icRes.interceptedTarget) {
          const tx = icRes.interceptedTarget.x;
          const ty = icRes.interceptedTarget.y;
          this.particles.spawnExplosion(tx, ty, 34);
          this.particles.emit('shockwave', tx, ty, 0, 0, 6, 38, 0.26, '#38bdf8', 0.9, altZ);
          for (let k = 0; k < 7; k++) {
            this.particles.emit(
              'spark',
              tx,
              ty,
              (Math.random() - 0.5) * 230,
              (Math.random() - 0.5) * 230,
              2.8,
              0.4,
              0.24,
              k % 2 === 0 ? '#7dd3fc' : '#fde047',
              0.95,
              altZ + 2
            );
          }
          if (this.screen === 'playing') {
            const distCam = Math.hypot(tx - this.camera.x, ty - this.camera.y);
            const atten = Math.max(0, 1 - distCam / 1550);
            const pan = Math.max(-0.85, Math.min(0.85, (tx - this.camera.x) / 620));
            this.audio.playMissileIntercept(atten, pan);
          }
        } else if (icRes.selfDestructed) {
          this.particles.emit('shockwave', p.x, p.y, 0, 0, 3, 18, 0.18, '#bae6fd', 0.6, altZ);
        }
        continue;
      }

      // Advanced multi-profile missile acceleration, lead guidance & lock-loss coasting
      if (p.kind === 'missile') {
        let targetState: MissileTargetState | null = null;
        if (p.targetId) {
          if (this.boss && this.boss.id === p.targetId && this.boss.alive && !this.boss.destroying) {
            targetState = {
              id: this.boss.id,
              x: this.boss.phys.pos.x,
              y: this.boss.phys.pos.y,
              vx: this.boss.phys.vel.x,
              vy: this.boss.phys.vel.y,
              altitude: 14,
              alive: true,
            };
          } else {
            const tgt = allUnits.find((u) => u.id === p.targetId && u.alive);
            if (tgt) {
              targetState = {
                id: tgt.id,
                x: tgt.phys.pos.x,
                y: tgt.phys.pos.y,
                vx: tgt.phys.vel.x,
                vy: tgt.phys.vel.y,
                altitude: tgt.flight?.altitude ?? 0,
                alive: true,
              };
            }
          }
        }

        const stepRes = stepMissileProjectile(
          p,
          targetState,
          this.map.obstacles,
          this.smokeClouds,
          dt,
          this.player.phys.pos
        );
        if (stepRes.shouldPlayPassBy && this.screen === 'playing') {
          const mPan = Math.max(-0.85, Math.min(0.85, (p.x - this.player.phys.pos.x) / 360));
          this.audio.playMissilePassBy(0.75, mPan);
        }
        const mProf = getMissileProfile(p.missileType);
        const exhaustChance = p.trackingLost ? 0.25 : 0.78;
        if (Math.random() < exhaustChance) {
          const altZ = (p.missileAlt ?? 0) * 0.52 + 4;
          this.particles.emit(
            'smoke',
            p.x,
            p.y,
            -p.vx * 0.04,
            -p.vy * 0.04,
            p.trackingLost ? 2.5 : 3.2 * mProf.scale,
            8.5 * mProf.scale,
            p.trackingLost ? 0.18 : 0.3,
            mProf.trailColor,
            p.trackingLost ? 0.28 : 0.52,
            altZ
          );
          if (!p.trackingLost && Math.random() < 0.45) {
            this.particles.emit(
              'fire',
              p.x - Math.cos(Math.atan2(p.vy, p.vx)) * 5,
              p.y - Math.sin(Math.atan2(p.vy, p.vx)) * 5,
              0,
              0,
              2.2 * mProf.scale,
              0.8,
              0.12,
              mProf.flameColor,
              0.85,
              altZ
            );
          }
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Obstacle intersection (low-altitude missiles hit solid cover; airborne shots & high missiles clear low props < 42px)
      const ownerUnit = allUnits.find((u) => u.id === p.ownerId);
      const isHighMissile = p.kind === 'missile' && (p.missileAlt ?? 0) > 38;
      const isAirShot = p.kind === 'missile' ? isHighMissile : Boolean((ownerUnit?.flight?.altitude ?? 0) > 36);
      let hitObs = false;
      for (let o = 0; o < this.map.obstacles.length; o++) {
        const obs = this.map.obstacles[o];
        if (obs.destroyed) continue;
        if (p.kind === 'missile' && !isSolidMissileCover(obs) && !obs.destructible) continue;
        if (isAirShot && obs.kind !== 'building' && obs.height < 42) continue;
        if (segmentIntersectsAABB(p.prevX, p.prevY, p.x, p.y, obs.x, obs.y, obs.w, obs.h)) {
          hitObs = true;
          if (obs.destructible && !GrappleTargetRegistry.isObstacleGrappleable(obs)) {
            obs.hp -= p.damage;
            this.particles.emit('spark', p.x, p.y, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 3, 1, 0.2, '#fbbf24', 0.9, 8);
            if (obs.hp <= 0) {
              obs.destroyed = true;
              this.navGrid.rebuild(this.map.obstacles);
              this.particles.spawnExplosion(obs.x, obs.y, obs.explosive ? 130 : 55);
              if (obs.explosive) {
                this.detonateSplash(obs.x, obs.y, 145, 130, 'player', 'fuel_tank');
              } else {
                this.audio.playExplosion(50, 0.5);
              }
            }
          } else {
            this.particles.emit('spark', p.x, p.y, -p.vx * 0.15, -p.vy * 0.15, 3, 1, 0.18, '#cbd5e1', 0.9, 8);
          }
          if (!p.piercing) {
            if (p.splashRadius > 0) {
              this.detonateSplash(p.x, p.y, p.splashRadius, p.damage, p.team, p.ownerId);
            }
            p.active = false;
            break;
          }
        }
      }
      if (!p.active || (hitObs && !p.piercing)) continue;

      // Boss & Deployable hits (player team projectiles)
      if (p.team === 'player') {
        // Check boss deployables
        for (let d = 0; d < this.bossDeployables.length; d++) {
          const dep = this.bossDeployables[d];
          if (dep.hp <= 0) continue;
          const distD = pointToSegmentDist(dep.x, dep.y, p.prevX, p.prevY, p.x, p.y);
          if (distD <= dep.radius + 4) {
            dep.hp -= p.damage;
            dep.hitFlashTimer = 0.06;
            if (p.ownerId === 'player') {
              this.damageDealt += Math.round(p.damage);
              this.particles.addText(dep.x, dep.y - 20, `${Math.round(p.damage)}`, '#fbbf24');
            }
            if (!p.piercing) {
              p.active = false;
              break;
            }
          }
        }
        if (!p.active) continue;

        // Check Thunderhead Boss sub-component hitboxes
        if (this.boss && this.boss.alive && !this.boss.destroying && !p.hitIds.has(this.boss.id)) {
          const distB = pointToSegmentDist(this.boss.phys.pos.x, this.boss.phys.pos.y, p.prevX, p.prevY, p.x, p.y);
          if (distB <= this.boss.spec.radius + 14) {
            p.hitIds.add(this.boss.id);
            if (p.splashRadius > 0) {
              this.detonateSplash(p.x, p.y, p.splashRadius, p.damage, p.team, p.ownerId);
            } else {
              this.applyHitToBoss(p);
            }
            if (!p.piercing) {
              p.active = false;
              continue;
            }
          }
        }
      } else if (p.team === 'enemy' && this.friendlyDeployables.length > 0) {
        // Enemy projectiles hit EWAR Holo-Decoys & Engineer Sentries
        for (let d = 0; d < this.friendlyDeployables.length; d++) {
          const dep = this.friendlyDeployables[d];
          if (dep.kind === 'recon_beacon' || dep.hp <= 0) continue;
          const distD = pointToSegmentDist(dep.x, dep.y, p.prevX, p.prevY, p.x, p.y);
          if (distD <= dep.radius + 4) {
            dep.hp -= p.damage;
            dep.hitFlashTimer = 0.06;
            this.particles.emit('spark', p.x, p.y, (Math.random() - 0.5) * 110, (Math.random() - 0.5) * 110, 2.5, 0.4, 0.18, '#c084fc', 0.9, 8);
            if (!p.piercing) {
              p.active = false;
              break;
            }
          }
        }
        if (!p.active) continue;
      }

      // Standard Unit hits
      for (let u = 0; u < allUnits.length; u++) {
        const target = allUnits[u];
        if (!target.alive) continue;
        if (target.team === p.team) continue;
        if (p.hitIds.has(target.id)) continue;

        const dist = pointToSegmentDist(target.phys.pos.x, target.phys.pos.y, p.prevX, p.prevY, p.x, p.y);
        if (dist <= target.spec.radius + 4) {
          p.hitIds.add(target.id);
          if (p.splashRadius > 0) {
            this.detonateSplash(p.x, p.y, p.splashRadius, p.damage, p.team, p.ownerId);
          } else {
            this.applyHitToMech(target, p);
          }
          if (!p.piercing) {
            p.active = false;
            break;
          }
        }
      }
    }
  }

  private applyHitToBoss(p: Projectile): void {
    if (!this.boss || !this.boss.alive || this.boss.destroying) return;
    const res = this.boss.applyDamage(p.damage, p.x, p.y, {
      piercing: p.piercing,
      emp: p.kind === 'ewar_pulse',
    });

    for (let s = 0; s < 5; s++) {
      this.particles.emit('spark', p.x, p.y, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, 2.6, 0.5, 0.22, res.hitComponent === 'powerCore' ? '#fb7185' : '#fbbf24', 0.95, 8);
    }

    const totalBossDmg = Math.round(res.hullDamage + res.armorDamage * 0.35);
    if (p.team === 'player' && this.screen === 'playing' && totalBossDmg > 0) {
      this.performanceTracker.recordDamageDealt(p.ownerId, 'boss', totalBossDmg, true, this.simTime);
      if (this.boss.hull / Math.max(1, this.boss.maxHull) < 0.5) {
        this.radioManager.trigger('boss_damaged');
      }
    }
    if (p.ownerId === 'player' && this.screen === 'playing') {
      this.damageDealt += totalBossDmg;
      const isCrit = res.hitComponent === 'powerCore' || res.hitComponent === 'ammoBays';
      this.particles.addText(p.x, p.y - 22, `${totalBossDmg}`, isCrit ? '#fb7185' : '#fbbf24');
    }

    if (res.componentJustDestroyed) {
      this.particles.spawnExplosion(p.x, p.y, res.secondaryCookOff ? 120 : 65);
      this.audio.playExplosion(res.secondaryCookOff ? 115 : 70, 0.9, false);
      this.camera.addShake(res.secondaryCookOff ? 0.5 : 0.28, 'explosion');
      this.hitstopTimer = 0.05;
      this.pushRadio(
        'Tactical Control',
        `${this.boss.spec.code} ${this.boss.components[res.componentJustDestroyed].label.toUpperCase()} DESTROYED!`
      );
      this.radioManager.trigger('boss_damaged');
    }
  }

  private applyHitToMech(target: MechActor, p: Projectile): void {
    const imm = checkUnitDamageImmunity({
      trainingGodMode: target.isPlayer && this.trainingGodMode,
      dashInvulnerable: target.dash?.isInvulnerableDuringDash(),
      aegisArmorActive: isAegisArmorActive(target),
    });
    if (imm !== 'none') {
      if (imm === 'aegis_armor') {
        triggerAegisDeflectFlash(target);
        for (let s = 0; s < 4; s++) {
          this.particles.emit(
            'spark',
            p.x,
            p.y,
            (Math.random() - 0.5) * 150,
            (Math.random() - 0.5) * 150,
            2.6,
            0.5,
            0.2,
            '#38bdf8',
            0.9,
            10
          );
        }
      } else if (imm === 'teleport_dash') {
        this.particles.emit('spark', p.x, p.y, (Math.random() - 0.5) * 110, (Math.random() - 0.5) * 110, 2.4, 0.4, 0.16, '#67e8f9', 0.85, 8);
      }
      return;
    }

    if (isGrapplerImmuneToProjectile(target, p.kind, p.splashRadius)) {
      if (target.grapplerState) {
        target.grapplerState.deflectFlashTimer = 0.16;
        if (target.grapplerState.deflectTextCooldown <= 0) {
          target.grapplerState.deflectTextCooldown = 0.55;
          if (p.ownerId === 'player' && this.screen === 'playing') {
            this.particles.addText(target.phys.pos.x, target.phys.pos.y - 22, 'DEFLECT', '#94a3b8');
          }
        }
      }
      for (let s = 0; s < 3; s++) {
        this.particles.emit(
          'spark',
          p.x,
          p.y,
          (Math.random() - 0.5) * 140,
          (Math.random() - 0.5) * 140,
          2.2,
          0.4,
          0.16,
          '#e2e8f0',
          0.9,
          8
        );
      }
      if (this.screen === 'playing') {
        const distCam = Math.hypot(target.phys.pos.x - this.camera.x, target.phys.pos.y - this.camera.y);
        const atten = Math.max(0, 1 - distCam / 1100);
        const pan = Math.max(-0.85, Math.min(0.85, (target.phys.pos.x - this.camera.x) / 620));
        this.audio.playGrapplerBulletDeflect(atten, pan);
      }
      return;
    }

    const hitFromAngle = Math.atan2(p.prevY - target.phys.pos.y, p.prevX - target.phys.pos.x);
    let relAngle = hitFromAngle - target.phys.bodyAngle;
    while (relAngle > Math.PI) relAngle -= Math.PI * 2;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;

    let reduction = getMorphIncomingDamageReduction(target.spec.specialAbility.kind, target.specialActiveTimer);
    if (target.team === 'player') {
      const inFabDome = [this.player, ...this.allies].some(
        (u) =>
          u.alive &&
          u.specialActiveTimer > 0 &&
          u.spec.specialAbility.kind === 'engineer_fabricator_rig' &&
          Math.hypot(u.phys.pos.x - target.phys.pos.x, u.phys.pos.y - target.phys.pos.y) <= 360
      );
      if (inFabDome) {
        reduction = Math.min(0.75, reduction + 0.25);
      }
    }
    if (target.isRevenant) {
      const revProf = getRevenantProfileForClass(target.revenantSourceClass ?? target.classId);
      reduction = Math.min(0.75, reduction + revProf.damageResist);
    }

    const markMult = target.markedTimer && target.markedTimer > 0 ? 1.28 : 1.0;

    const res = applyComponentDamage(target.health, p.damage * markMult, relAngle, {
      piercing: p.piercing,
      emp: p.kind === 'ewar_pulse',
      damageReduction: reduction,
    });

    const dealtVal = Math.round(res.chassisDamage + res.armorAbsorbed * 0.4);
    if (this.screen === 'playing' && dealtVal > 0) {
      if (p.team === 'player' && target.team === 'enemy') {
        this.performanceTracker.recordDamageDealt(p.ownerId, target.id, dealtVal, false, this.simTime);
        if (target.isRevenant && target.health.chassis < target.health.maxChassis * 0.6) {
          this.radioManager.trigger('revenant_damaged');
        }
      } else if (target.team === 'player') {
        this.performanceTracker.recordDamageReceived(target.id, dealtVal);
      }
    }

    if (p.kind === 'ewar_pulse') {
      target.jammedTimer = 4.0;
    }

    target.hitFlashTimer = 0.055;
    const distCam = Math.hypot(target.phys.pos.x - this.camera.x, target.phys.pos.y - this.camera.y);
    const atten = Math.max(0, 1 - distCam / 1000);

    // Physical knockback & suspension impact
    const pSpd = Math.hypot(p.vx, p.vy) || 1;
    target.phys.vel.x += (p.vx / pSpd) * Math.min(55, p.damage * 0.65);
    target.phys.vel.y += (p.vy / pSpd) * Math.min(55, p.damage * 0.65);
    target.phys.bounceVelZ -= 14;

    for (let s = 0; s < 5; s++) {
      this.particles.emit(
        'spark',
        p.x,
        p.y,
        (Math.random() - 0.5) * 140,
        (Math.random() - 0.5) * 140,
        2.4,
        0.5,
        0.2,
        res.armorAbsorbed > 0 ? '#fde047' : '#ef4444',
        0.95,
        8
      );
    }

    if (p.ownerId === 'player' && this.screen === 'playing') {
      this.damageDealt += Math.round(p.damage);
      this.particles.addText(
        target.phys.pos.x,
        target.phys.pos.y - 24,
        `${Math.round(res.chassisDamage + res.armorAbsorbed)}`,
        p.piercing ? '#67e8f9' : '#fbbf24'
      );
    }

    const occluded =
      !target.isPlayer &&
      this.screen === 'playing' &&
      !hasLineOfSight(this.player.phys.pos, target.phys.pos, this.map.obstacles);

    if (target.isPlayer && this.screen === 'playing') {
      this.camera.addShake(Math.min(0.35, p.damage * 0.004), 'impact');
      this.audio.playImpact(p.damage > 35, 1, false);
      if (res.limbCrippled) {
        this.showWarning('LEG ACTUATORS CRIPPLED — MOBILITY COMPROMISED');
        this.audio.playWarningAlarm();
      } else if (res.componentDamaged === 'engine' && target.health.engine < target.health.maxEngine * 0.4) {
        this.showWarning('ENGINE DAMAGE — ACCELERATION REDUCED');
      }
    } else if (this.screen === 'playing') {
      this.audio.playImpact(p.damage > 35, atten * 0.65, occluded);
    }

    if (res.destroyed && target.alive) {
      this.handleMechDestroyed(target, p.ownerId);
    }
  }

  private detonateSplash(
    x: number,
    y: number,
    radius: number,
    damage: number,
    team: 'player' | 'enemy',
    ownerId: string
  ): void {
    this.particles.spawnExplosion(x, y, radius);
    const occluded =
      this.screen === 'playing' && !hasLineOfSight(this.player.phys.pos, { x, y }, this.map.obstacles);
    const expSpatial = computeSpatialAudioParams(
      x - this.camera.x,
      y - this.camera.y,
      1450,
      occluded,
      true
    );
    const atten = expSpatial.distanceScale;
    if (this.screen === 'playing') {
      this.audio.playExplosion(radius, atten, occluded, expSpatial.pan, expSpatial.delaySeconds);
      this.camera.addShake(Math.min(0.68, (radius / 105) * atten * 0.58), 'explosion');
    }

    const targets = [this.player, ...this.allies, ...this.enemies];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alive) continue;
      if (t.team === team && ownerId !== 'fuel_tank') continue;

      const d = Math.hypot(t.phys.pos.x - x, t.phys.pos.y - y);
      if (d <= radius + t.spec.radius) {
        const imm = checkUnitDamageImmunity({
          trainingGodMode: t.isPlayer && this.trainingGodMode,
          dashInvulnerable: t.dash?.isInvulnerableDuringDash(),
          aegisArmorActive: isAegisArmorActive(t),
        });
        if (imm !== 'none') {
          if (imm === 'aegis_armor') triggerAegisDeflectFlash(t);
          continue;
        }
        const falloff = Math.max(0.25, 1 - d / (radius + t.spec.radius));
        const markMult = t.markedTimer && t.markedTimer > 0 ? 1.28 : 1.0;
        const dmgReduction = getMorphIncomingDamageReduction(t.spec.specialAbility.kind, t.specialActiveTimer);
        const effSplashDmg = damage * falloff * markMult;
        const res = applyComponentDamage(t.health, effSplashDmg, 0, { splash: true, damageReduction: dmgReduction });
        t.hitFlashTimer = 0.06;
        // Blast push
        const pushD = d || 1;
        t.phys.vel.x += ((t.phys.pos.x - x) / pushD) * 90 * falloff;
        t.phys.vel.y += ((t.phys.pos.y - y) / pushD) * 90 * falloff;
        if (ownerId === 'player' && this.screen === 'playing') {
          this.damageDealt += Math.round(effSplashDmg);
          this.particles.addText(t.phys.pos.x, t.phys.pos.y - 26, `${Math.round(effSplashDmg)}`, '#fb923c');
        }
        if (res.destroyed && t.alive) {
          this.handleMechDestroyed(t, ownerId);
        }
      }
    }

    // Splash hits boss if fired by player team
    if (team === 'player' && this.boss && this.boss.alive && !this.boss.destroying) {
      const db = Math.hypot(this.boss.phys.pos.x - x, this.boss.phys.pos.y - y);
      if (db <= radius + this.boss.spec.radius + 10) {
        const falloff = Math.max(0.35, 1 - db / (radius + this.boss.spec.radius + 10));
        const res = this.boss.applyDamage(damage * falloff, x, y);
        if (ownerId === 'player' && this.screen === 'playing') {
          const dealt = Math.round(res.hullDamage + res.armorDamage * 0.35);
          this.damageDealt += dealt;
          this.particles.addText(x, y - 24, `${dealt}`, '#fb923c');
        }
        if (res.componentJustDestroyed) {
          this.pushRadio('Tactical Control', `${this.boss.spec.code} ${this.boss.components[res.componentJustDestroyed].label.toUpperCase()} DESTROYED!`);
        }
      }
    }
  }

  private detonatePlayerMortar(
    x: number,
    y: number,
    radius: number,
    damage: number,
    ammoType: MortarAmmoType,
    ownerId: string
  ): void {
    const spec = MORTAR_AMMO_SPECS[ammoType];
    if (ammoType === 'smoke') {
      this.smokeClouds.push({
        id: `smk_${this.spawnCounter++}`,
        x,
        y,
        radius,
        life: 13.0,
        maxLife: 13.0,
      });
      this.particles.emit('shockwave', x, y, 0, 0, 18, radius, 0.65, '#cbd5e1', 0.8, 6);
      this.audio.playSmokeDeploy(0.95);
    } else if (ammoType === 'emp') {
      this.particles.emit('shockwave', x, y, 0, 0, 20, radius, 0.6, '#67e8f9', 0.95, 6);
      this.audio.playExplosion(radius * 0.75, 0.9, false);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.phys.pos.x - x, e.phys.pos.y - y) <= radius) {
          e.jammedTimer = Math.max(e.jammedTimer, 6.5);
        }
      }
      if (this.boss && this.boss.alive && !this.boss.destroying) {
        const db = Math.hypot(this.boss.phys.pos.x - x, this.boss.phys.pos.y - y);
        if (db <= radius + this.boss.spec.radius) {
          this.boss.empScrambleTimer = Math.max(this.boss.empScrambleTimer, 7.0);
          const res = this.boss.applyDamage(damage * spec.bossArmorMult, x, y, { emp: true });
          const dealt = Math.round(res.hullDamage + res.armorDamage * 0.35);
          this.damageDealt += dealt;
          this.particles.addText(x, y - 24, `EMP ${dealt}`, '#67e8f9');
        }
      }
    } else {
      // HE / AP / Cluster standard + AP boss armor multiplier
      if (ammoType === 'ap' && this.boss && this.boss.alive && !this.boss.destroying) {
        const db = Math.hypot(this.boss.phys.pos.x - x, this.boss.phys.pos.y - y);
        if (db <= radius + this.boss.spec.radius + 12) {
          const res = this.boss.applyDamage(damage * spec.bossArmorMult, x, y, { piercing: true });
          const dealt = Math.round(res.hullDamage + res.armorDamage * 0.35);
          this.damageDealt += dealt;
          this.particles.addText(x, y - 26, `AP ${dealt}`, '#38bdf8');
          if (res.componentJustDestroyed) {
            this.pushRadio('Tactical Control', `${this.boss.spec.code} ${this.boss.components[res.componentJustDestroyed].label.toUpperCase()} DESTROYED!`);
          }
        }
      }
      this.detonateSplash(x, y, radius, damage, 'player', ownerId);
    }

    // Destructibles hit by HE / AP (preserve all grappleable anchors)
    if (ammoType === 'he' || ammoType === 'ap') {
      let rebuilt = false;
      for (const obs of this.map.obstacles) {
        if (obs.destroyed || !obs.destructible || GrappleTargetRegistry.isObstacleGrappleable(obs)) continue;
        if (Math.hypot(obs.x - x, obs.y - y) <= radius * 0.72) {
          obs.hp -= damage;
          if (obs.hp <= 0) {
            obs.destroyed = true;
            rebuilt = true;
          }
        }
      }
      if (rebuilt) this.navGrid.rebuild(this.map.obstacles);
    }
  }

  private handleMechDestroyed(target: MechActor, killerId: string): void {
    target.alive = false;
    target.koTimer = 0.45;
    if (target.enemyArchetype === 'grappler') {
      detachGrappler(target);
      if (this.screen === 'playing') {
        const distCam = Math.hypot(target.phys.pos.x - this.camera.x, target.phys.pos.y - this.camera.y);
        const atten = Math.max(0, 1 - distCam / 1350);
        const pan = Math.max(-0.85, Math.min(0.85, (target.phys.pos.x - this.camera.x) / 620));
        this.audio.playGrapplerDestroy(atten, pan);
      }
    } else {
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.grapplerState?.attachedTargetId === target.id) {
          detachGrappler(e, 0.8);
        }
      }
    }
    // Clean up Aegis protective armor on unit death/downed
    if (target.aegisArmor) {
      target.aegisArmor.active = false;
      target.aegisArmor.remaining = 0;
    }
    // Friendly AI squadmates enter a revivable downed state so revive-capable units (Engineer) can rescue them
    if (target.team === 'player' && !target.isPlayer) {
      target.downed = true;
      target.reviveProgress = 0;
    }
    this.particles.spawnExplosion(target.phys.pos.x, target.phys.pos.y, target.spec.radius * 3.0);
    const distCam = Math.hypot(target.phys.pos.x - this.camera.x, target.phys.pos.y - this.camera.y);
    const atten = Math.max(0, 1 - distCam / 1450);
    const occluded =
      this.screen === 'playing' && !hasLineOfSight(this.player.phys.pos, target.phys.pos, this.map.obstacles);

    if (this.screen === 'playing') {
      this.audio.playExplosion(95, atten, occluded);
      this.camera.addShake(0.45 * atten, 'explosion');
      if (killerId === 'player' || target.team === 'enemy') {
        this.hitstopTimer = 0.045;
        this.kills++;
        const nearPlayer = Math.hypot(target.phys.pos.x - this.player.phys.pos.x, target.phys.pos.y - this.player.phys.pos.y) < 380;
        this.performanceTracker.recordElimination(killerId, target.id, this.simTime, nearPlayer && killerId !== 'player');
        this.creditsEarned += target.isRevenant
          ? 220
          : target.enemyArchetype === 'heavy' || target.enemyArchetype === 'sky_breaker'
          ? 85
          : 35;

        if (target.isRevenant) {
          this.revenantManager.state.defeated = true;
          this.radioManager.trigger('revenant_defeated', { force: true });
        } else if (nearPlayer && killerId !== 'player') {
          this.radioManager.trigger('player_assisted');
        } else if (this.allies.some((a) => a.alive) && Math.random() < 0.45) {
          this.radioManager.trigger(Math.random() < 0.55 ? 'combat_kill' : 'squad_reaction');
        }
      }
      if (target.team === 'player' && !target.isPlayer) {
        const role: RadioSpeakerRole =
          target.squadRole === 'recon' ? 'recon_sniper' : target.squadRole === 'support' ? 'pilot_alpha' : 'pilot_bravo';
        this.pushRadio('Tactical Control', `${target.callsign} is down! Revive beacon active.`);
        this.radioManager.evaluateAllyUnitHealth(target.id, target.callsign, 0, false, role);
      }
    }
  }

  private stepObjectivesAndRules(dt: number): void {
    // Update ground capture objectives if present
    for (const obj of this.map.objectives) {
      if (obj.completed) continue;
      if (obj.kind === 'capture') {
        const d = Math.hypot(this.player.phys.pos.x - obj.x, this.player.phys.pos.y - obj.y);
        if (d <= obj.radius) {
          obj.progress = Math.min(1, obj.progress + dt * 0.25);
          if (obj.progress >= 1) {
            obj.completed = true;
            this.pushRadio('Tactical Control', `${obj.label} secured.`);
            this.radioManager.trigger('objective_change');
          }
        }
      }
    }

    const livingEnemies = this.enemies.filter((e) => e.alive && !e.isDummy).length;
    const bossStillAlive = Boolean(this.boss && (this.boss.alive || this.boss.destroying));

    if (this.defendStructure && this.defendStructure.hp <= 0) {
      this.finishMatch(false, `${this.defendStructure.label} was destroyed.`);
      return;
    }

    if (this.mode === 'boss_challenge') {
      if (!bossStillAlive) {
        this.finishMatch(true, `${this.boss?.spec.name ?? 'Thunderhead'} neutralized!`);
      }
    } else if (this.mode === 'campaign' || this.mode === 'skirmish') {
      if (livingEnemies === 0 && !bossStillAlive) {
        if (this.revenantManager.state.scheduled && !this.revenantManager.state.spawned) {
          this.revenantManager.state.spawnDelaySec = Math.min(
            this.revenantManager.state.spawnDelaySec,
            this.elapsedSeconds + 2.25
          );
          return;
        }
        this.finishMatch(true, 'All hostile forces neutralized.');
      }
    } else if (this.mode === 'survival') {
      if (livingEnemies === 0) {
        this.waveNumber++;
        this.creditsEarned += 60;
        if (this.waveNumber > this.save.highestSurvivalWave) {
          this.save.highestSurvivalWave = this.waveNumber;
        }
        this.spawnWaveEnemies(buildSurvivalWave(this.waveNumber), 0.9 + this.waveNumber * 0.08);
        this.pushRadio('Tactical Control', `Wave ${this.waveNumber} incoming!`);
        this.radioManager.trigger('reinforcements');
        const survBoss = this.bossDirector.checkSurvivalWave(
          this.waveNumber,
          bossStillAlive,
          this.map,
          this.player.phys.pos
        );
        if (survBoss) {
          this.spawnBossEntity(survBoss.variantId, 1.0, true, survBoss.spawnPos, survBoss.tuning);
          this.pushRadio('Tactical Control', survBoss.alertText);
          this.radioManager.trigger('boss_detected');
        }
      }
    } else if (this.mode === 'freeroam') {
      const roamUpdate = this.bossDirector.updateFreeRoam(
        dt,
        bossStillAlive,
        this.map,
        this.player.phys.pos
      );
      if (roamUpdate.preAlert) {
        this.pushRadio('Sensors', roamUpdate.preAlert);
        this.showWarning('SEISMIC ALERT — HEAVY THREAT APPROACHING SECTOR');
      }
      if (roamUpdate.spawn) {
        this.spawnBossEntity(
          roamUpdate.spawn.variantId,
          1.0,
          true,
          roamUpdate.spawn.spawnPos,
          roamUpdate.spawn.tuning
        );
        this.pushRadio('Tactical Control', roamUpdate.spawn.alertText);
      }
      if (livingEnemies < 3) {
        this.freeRoamReinforceTimer -= dt;
        if (this.freeRoamReinforceTimer <= 0) {
          this.freeRoamReinforceTimer = 15;
          this.spawnWaveEnemies(
            [
              { archetype: 'scout', count: 1 },
              { archetype: 'assault', count: 1 },
            ],
            0.95
          );
          this.pushRadio('Sensors', 'New hostile patrol detected on long-range radar.');
        }
      }
    }
  }

  private finishMatch(victory: boolean, reason: string): void {
    this.victory = victory;
    this.endReason = reason;

    if (victory && this.mode === 'campaign') {
      const mission = CAMPAIGN_MISSIONS.find((m) => m.id === this.currentMissionId);
      if (mission) {
        if (!this.save.completedMissions.includes(mission.id)) {
          this.save.completedMissions.push(mission.id);
        }
        this.creditsEarned += mission.rewardCredits;
        if (mission.unlockUnit && !this.save.unlockedUnits.includes(mission.unlockUnit)) {
          this.save.unlockedUnits.push(mission.unlockUnit);
          this.pushRadio('Command', `Unlocked chassis: ${MECH_ROSTER[mission.unlockUnit].name}!`);
        }
      }
    }

    if (victory) {
      this.save = FailedRunTracker.clearModeFailure(this.save, this.mode);
    } else {
      this.save = FailedRunTracker.recordFailure(this.save, this.mode, this.save.selectedUnit);
    }

    this.save.credits += this.creditsEarned;
    persistSaveData(this.save);
    this.radioManager.trigger(victory ? 'victory' : 'defeat', { force: true });

    if (victory) {
      const triggered = this.victoryCinematic.trigger({
        squadCenter: { ...this.player.phys.pos },
        bossWreckPos: this.boss ? { ...this.boss.phys.pos } : null,
        tracker: this.performanceTracker,
        creditsEarned: this.creditsEarned,
        missionTitle:
          this.mode === 'campaign'
            ? CAMPAIGN_MISSIONS.find((m) => m.id === this.currentMissionId)?.title ?? 'Campaign'
            : this.mode.toUpperCase(),
        elapsedMatchSeconds: Math.floor(this.elapsedSeconds),
      });
      if (triggered) {
        this.audio.playVictoryCinematicSound('start');
        this.screen = 'playing';
        this.syncBodyState();
        this.pushHudSnapshot();
        return;
      }
    }

    this.screen = 'gameover';
    this.syncBodyState();
    this.pushHudSnapshot();
  }

  public skipVictoryCinematic(): void {
    if (!this.victoryCinematic.active) return;
    this.victoryCinematic.skipToAwards();
    if (!this.victoryAwardsAudioPlayed) {
      this.victoryAwardsAudioPlayed = true;
      this.audio.playVictoryCinematicSound('awards');
    }
    this.pushHudSnapshot();
  }

  public completeVictoryCinematic(): void {
    if (!this.victoryCinematic.active) return;
    this.victoryCinematic.active = false;
    this.screen = 'gameover';
    this.syncBodyState();
    this.pushHudSnapshot();
  }

  public triggerPlayerStealth(): void {
    if (!this.player.alive || !this.player.stealth?.supported) return;
    if (this.takedowns.isUnitLocked(this.player.id)) return;
    const res = toggleStealth(this.player.stealth);
    if (res === 'activated' || res === 'deactivated') {
      if (this.screen === 'playing') {
        this.audio.playStealthToggle(res === 'activated');
      }
      this.particles.emit(
        'shockwave',
        this.player.phys.pos.x,
        this.player.phys.pos.y,
        0,
        0,
        12,
        54,
        0.26,
        res === 'activated' ? '#f43f5e' : '#94a3b8',
        0.75,
        8
      );
      this.pushHudSnapshot();
    }
  }

  public setPlayerDodgeTarget(normX: number | null): void {
    this.takedowns.setPlayerDodgeInput(0, normX);
  }

  public submitPlayerTakedownTiming(explicitDir?: -1 | 1): void {
    const dash = this.takedowns.triggerPlayerDodgeDash(explicitDir);
    if (!dash) return;
    if (this.screen === 'playing') {
      const pan = Math.max(-0.65, Math.min(0.65, (dash.session.minigame.cursor - 0.5) * 0.9));
      this.audio.playPiercingSlash('dodge', 0.85, pan);
      this.camera.addShake(0.08, 'impact');
      for (let s = 0; s < 5; s++) {
        this.particles.emit(
          'spark',
          this.player.phys.pos.x + (Math.random() - 0.5) * 12,
          this.player.phys.pos.y + (Math.random() - 0.5) * 12,
          -dash.dir * (110 + Math.random() * 140),
          (Math.random() - 0.5) * 90,
          2.2,
          0.3,
          0.18,
          '#22d3ee',
          0.9,
          10
        );
      }
    }
    this.pushHudSnapshot();
  }

  private executePhantomTeleport(
    attacker: MechActor,
    targetMech?: MechActor,
    targetBoss?: ThunderheadBoss | null
  ): boolean {
    const startRes = targetBoss
      ? this.takedowns.startBossAmbushTakedown({
          attacker,
          boss: targetBoss,
          obstacles: this.map.obstacles,
          mapWidth: this.map.width,
          mapHeight: this.map.height,
        })
      : targetMech
      ? this.takedowns.startMechTakedown({
          attacker,
          target: targetMech,
          obstacles: this.map.obstacles,
          mapWidth: this.map.width,
          mapHeight: this.map.height,
        })
      : null;

    if (!startRes) return false;

    attacker.specialCooldownTimer = attacker.spec.specialAbility.cooldown;
    attacker.specialActiveTimer = attacker.spec.specialAbility.duration;

    // Departure & Arrival crimson-violet stealth teleport VFX & audio
    if (this.save.settings.dashVfx) {
      this.afterimages.spawn({
        x: startRes.teleportOrigin.x,
        y: startRes.teleportOrigin.y,
        bodyAngle: attacker.phys.bodyAngle,
        aimAngle: attacker.phys.aimAngle,
        altitude: attacker.flight?.altitude ?? 0,
        radius: attacker.spec.radius,
        silhouette: attacker.spec.silhouette,
        tintColor: '#f43f5e',
        maxLife: 0.36,
        legs: attacker.legs.legs,
      });
      this.particles.emit('shockwave', startRes.teleportOrigin.x, startRes.teleportOrigin.y, 0, 0, 26, 6, 0.22, '#f43f5e', 0.9, 8);
      this.particles.emit('shockwave', startRes.teleportDest.x, startRes.teleportDest.y, 0, 0, 8, 60, 0.28, '#a855f7', 0.95, 8);
    }

    if (this.screen === 'playing') {
      const distCam = Math.hypot(startRes.teleportDest.x - this.camera.x, startRes.teleportDest.y - this.camera.y);
      const atten = Math.max(0.15, 1 - distCam / 1450);
      const pan = Math.max(-0.85, Math.min(0.85, (startRes.teleportDest.x - this.camera.x) / 620));
      this.audio.playTeleportPhantom('vanish', atten, pan);
      this.audio.playTeleportPhantom('appear', atten, pan);
    }
    return true;
  }

  private stepTakedownSessions(dt: number): void {
    if (this.takedowns.sessions.length === 0 && !this.takedowns.isUnitInRecovery(this.player.id)) {
      return;
    }
    const actorsById = new Map<string, MechActor>();
    actorsById.set(this.player.id, this.player);
    for (let i = 0; i < this.allies.length; i++) actorsById.set(this.allies[i].id, this.allies[i]);
    for (let i = 0; i < this.enemies.length; i++) actorsById.set(this.enemies[i].id, this.enemies[i]);

    const events = this.takedowns.step(dt, actorsById, this.boss);
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const distCam = Math.hypot(ev.pos.x - this.camera.x, ev.pos.y - this.camera.y);
      const atten = Math.max(0.12, 1 - distCam / 1400);
      const pan = Math.max(-0.85, Math.min(0.85, (ev.pos.x - this.camera.x) / 620));

      if (ev.type === 'audio_cue' && ev.audioCue && this.screen === 'playing') {
        this.audio.playTakedownCue(ev.audioCue, ev.isPlayerAttacker || ev.isPlayerVictim ? 1 : atten, pan);
      } else if (ev.type === 'spark_burst') {
        for (let s = 0; s < 7; s++) {
          this.particles.emit(
            'spark',
            ev.pos.x + (Math.random() - 0.5) * 14,
            ev.pos.y + (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 210,
            (Math.random() - 0.5) * 210,
            2.8,
            0.5,
            0.22,
            s % 2 === 0 ? '#fda4af' : '#fbbf24',
            0.95,
            10
          );
        }
        if (this.screen === 'playing') {
          this.camera.addShake(ev.isPlayerAttacker || ev.isPlayerVictim ? 0.16 : 0.05 * atten, 'impact');
        }
      } else if (ev.type === 'minigame_prompt') {
        if ((ev.isPlayerAttacker || ev.isPlayerVictim) && this.screen === 'playing') {
          this.audio.playMinigameCue('prompt');
          this.pushHudSnapshot();
        }
      } else if (ev.type === 'slash_telegraph') {
        if (this.screen === 'playing') {
          const isPlayerInvolved = ev.isPlayerAttacker || ev.isPlayerVictim;
          this.audio.playPiercingSlash('telegraph', isPlayerInvolved ? 0.95 : atten * 0.72, pan);
          if (isPlayerInvolved) {
            this.pushHudSnapshot();
          }
        }
      } else if (ev.type === 'slash_strike') {
        if (this.screen === 'playing') {
          const isPlayerInvolved = ev.isPlayerAttacker || ev.isPlayerVictim;
          this.audio.playPiercingSlash('slash', isPlayerInvolved ? 1.0 : atten * 0.85, pan);
          this.camera.addShake(isPlayerInvolved ? 0.24 : 0.06 * atten, 'impact');
          const baseAng = ev.slashAngle ?? 0;
          for (let s = 0; s < 10; s++) {
            const dir = s % 2 === 0 ? 1 : -1;
            const spread = (Math.random() - 0.5) * 0.45;
            const spd = 160 + Math.random() * 210;
            this.particles.emit(
              'spark',
              ev.pos.x + (Math.random() - 0.5) * 16,
              ev.pos.y + (Math.random() - 0.5) * 16,
              Math.cos(baseAng + spread) * spd * dir,
              Math.sin(baseAng + spread) * spd * dir,
              3.0,
              0.4,
              0.22,
              s % 3 === 0 ? '#ffffff' : '#fb7185',
              0.95,
              10
            );
          }
          if (isPlayerInvolved) {
            this.pushHudSnapshot();
          }
        }
      } else if (ev.type === 'minigame_judgment') {
        if ((ev.isPlayerAttacker || ev.isPlayerVictim) && this.screen === 'playing' && ev.judgment) {
          if (ev.judgment === 'MISS') {
            this.audio.playPiercingSlash('hit', 1.0, pan);
            this.camera.addShake(0.32, 'impact');
            for (let s = 0; s < 9; s++) {
              this.particles.emit(
                'spark',
                ev.pos.x + (Math.random() - 0.5) * 14,
                ev.pos.y + (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 260,
                (Math.random() - 0.5) * 260,
                3.2,
                0.5,
                0.24,
                '#f43f5e',
                0.95,
                10
              );
            }
          } else {
            this.audio.playPiercingSlash('dodge', ev.judgment === 'PERFECT' ? 1.0 : 0.82, pan);
          }
          this.pushHudSnapshot();
        }
      } else if (ev.type === 'executed') {
        const target = actorsById.get(ev.targetId);
        const attacker = actorsById.get(ev.attackerId);
        if (target && target.alive) {
          if (target.isPlayer) {
            if (!this.trainingGodMode) {
              const breachDmg = Math.round(target.health.maxChassis * 0.62);
              target.health.chassis = Math.max(0, target.health.chassis - breachDmg);
              target.hitFlashTimer = 0.22;
              this.camera.addShake(0.45, 'impact');
              this.particles.addText(target.phys.pos.x, target.phys.pos.y - 32, `BREACH -${breachDmg}`, '#f43f5e');
              if (this.screen === 'playing') this.audio.playMinigameCue('miss');
              if (target.health.chassis <= 0) {
                this.handleMechDestroyed(target, ev.attackerId);
              }
            }
          } else {
            target.health.chassis = 0;
            this.handleMechDestroyed(target, ev.attackerId);
            this.particles.emit('shockwave', ev.pos.x, ev.pos.y, 0, 0, 12, 86, 0.34, '#f43f5e', 0.92, 8);
            if (ev.isPlayerAttacker) {
              if (this.screen === 'playing') this.audio.playMinigameCue('execute');
              const isPerf = (ev.bonusDamageMult ?? 1) > 1.2;
              this.particles.addText(
                ev.pos.x,
                ev.pos.y - 34,
                isPerf ? 'PERFECT EXECUTION!' : 'EXECUTED',
                isPerf ? '#34d399' : '#fda4af'
              );
              if (attacker && isPerf) {
                attacker.specialCooldownTimer *= 0.65;
                if (attacker.stealth?.supported) {
                  attacker.stealth.energy = Math.min(attacker.stealth.maxEnergy, attacker.stealth.energy + 35);
                }
              }
            }
          }
        }
      } else if (ev.type === 'boss_weakpoint_hit') {
        if (this.boss && this.boss.alive && !this.boss.destroying) {
          const dmg = Math.round(BOSS_AMBUSH_DAMAGE_BASE * (ev.bonusDamageMult ?? 1));
          const res = this.boss.applyDamage(dmg, ev.pos.x, ev.pos.y, {
            piercing: true,
            forcedComponent: 'powerCore',
          });
          const dealt = Math.round(res.hullDamage + res.armorDamage * 0.35);
          if (ev.isPlayerAttacker && this.screen === 'playing') {
            this.damageDealt += dealt;
            this.performanceTracker.recordDamageDealt(ev.attackerId, this.boss.id, dealt, true, this.simTime);
            this.audio.playMinigameCue('execute');
            this.camera.addShake(0.38, 'explosion');
            this.particles.addText(ev.pos.x, ev.pos.y - 32, `WEAK-POINT -${dealt}`, '#fb7185');
            const attacker = actorsById.get(ev.attackerId);
            if (attacker && (ev.bonusDamageMult ?? 1) > 1.2) {
              attacker.specialCooldownTimer *= 0.55;
              if (attacker.stealth?.supported) {
                attacker.stealth.energy = Math.min(attacker.stealth.maxEnergy, attacker.stealth.energy + 40);
              }
            }
          }
        }
      } else if (ev.type === 'escaped') {
        const attacker = actorsById.get(ev.attackerId);
        if (ev.isPlayerVictim) {
          if (this.screen === 'playing') this.audio.playMinigameCue('escape');
          this.particles.emit('shockwave', this.player.phys.pos.x, this.player.phys.pos.y, 0, 0, 14, 96, 0.36, '#22d3ee', 0.92, 8);
          this.particles.addText(this.player.phys.pos.x, this.player.phys.pos.y - 30, 'COUNTER PARRY!', '#22d3ee');
          if (attacker && attacker.alive) {
            const parryRes = applyComponentDamage(attacker.health, 135, 0, { piercing: true });
            attacker.hitFlashTimer = 0.16;
            if (parryRes.destroyed) {
              this.handleMechDestroyed(attacker, this.player.id);
            }
          }
        } else if (ev.isPlayerAttacker) {
          if (this.screen === 'playing') this.audio.playMinigameCue('miss');
          this.particles.addText(ev.pos.x, ev.pos.y - 28, 'TARGET ESCAPED', '#f87171');
        }
      } else if (ev.type === 'interrupted') {
        if (ev.isPlayerAttacker || ev.isPlayerVictim) {
          this.particles.addText(ev.pos.x, ev.pos.y - 26, 'CQC INTERRUPTED', '#fbbf24');
        }
      }
    }
  }

  private renderFrame(): void {
    let executionTargetPos: Vec2 | null = null;
    if (
      this.screen === 'playing' &&
      this.player.alive &&
      (this.player.spec.specialAbility.kind === 'phantom_execution' ||
        this.player.spec.specialAbility.kind === 'assassin_crimson_tempest') &&
      this.player.specialCooldownTimer <= 0 &&
      !this.takedowns.isUnitLocked(this.player.id)
    ) {
      const rangeOverride = this.player.spec.specialAbility.kind === 'assassin_crimson_tempest' ? 620 : undefined;
      const tgt = this.takedowns.findExecutionTarget(this.player, this.enemies, this.boss, this.mouseWorld, rangeOverride);
      if (tgt) {
        executionTargetPos = tgt.kind === 'mech' ? tgt.target.phys.pos : tgt.boss.phys.pos;
      }
    }

    renderBattlefield(
      this.ctx,
      this.viewW,
      this.viewH,
      this.camera,
      this.map,
      this.player,
      this.allies,
      this.enemies,
      this.projectiles,
      this.particles,
      this.mouseWorld,
      {
        showReticle: this.screen === 'playing',
        time: this.simTime,
        hideNameplates: this.screen === 'title',
        boss: this.boss,
        hazards: this.hazards,
        smokeClouds: this.smokeClouds,
        mortarSolution: this.screen === 'playing' ? this.getMortarSolution() : null,
        incomingWarnings: this.incomingWarnings,
        deployables: this.bossDeployables,
        friendlyDeployables: this.friendlyDeployables,
        defendStructure: this.defendStructure,
        nuclearDimAlpha: this.nuclearDimAlpha,
        empDisruptTimer: this.empDisruptTimer,
        afterimages: this.afterimages.items,
        afterimageIntensity: this.save.settings.afterimageIntensity ?? 0.85,
        grapple: this.screen === 'playing' ? this.grapple : null,
        grappleVfx: this.save.settings.grappleVfx ?? true,
        rocketExhaustVfx: this.save.settings.rocketExhaustVfx ?? true,
        flightVfx: this.save.settings.flightVfx ?? true,
        missileLockWarning: this.missileLockWarning,
        takedownSessions: this.takedowns.sessions,
        firstPersonTakedown: this.screen === 'playing' ? this.takedowns.getFirstPersonVictimSession() : null,
        executionTargetPos,
      }
    );
  }

  public pushHudSnapshot(): void {
    const terrain = getTerrainAt(this.map, this.player.phys.pos.x, this.player.phys.pos.y);
    const livingEnemies = this.enemies.filter((e) => e.alive && !e.isDummy);
    const totalEnemies = this.enemies.filter((e) => !e.isDummy).length;

    const bossAliveCount = this.boss && (this.boss.alive || this.boss.destroying) ? 1 : 0;

    let objectiveText = '';
    let objectiveProgress = 0;
    if (this.mode === 'campaign') {
      const m = CAMPAIGN_MISSIONS.find((c) => c.id === this.currentMissionId);
      objectiveText = m?.objectivesSummary ?? 'Eliminate hostile forces';
      const denom = totalEnemies + (m?.bossVariant ? 1 : 0);
      objectiveProgress = denom > 0 ? (denom - (livingEnemies.length + bossAliveCount)) / denom : 1;
    } else if (this.mode === 'boss_challenge') {
      objectiveText = this.boss
        ? `Eliminate ${this.boss.spec.code} ${this.boss.spec.name}`
        : 'Eliminate strategic artillery threat';
      objectiveProgress = this.boss ? 1 - this.boss.hull / Math.max(1, this.boss.maxHull) : 1;
    } else if (this.mode === 'survival') {
      objectiveText = `Wave ${this.waveNumber} — ${livingEnemies.length} hostiles active`;
      objectiveProgress = totalEnemies > 0 ? (totalEnemies - livingEnemies.length) / totalEnemies : 0;
    } else if (this.mode === 'training') {
      objectiveText = 'Proving Grounds — Test leg kinematics, terrain & weapons';
      objectiveProgress = 1;
    } else if (this.mode === 'freeroam') {
      objectiveText = `Free Roam — ${livingEnemies.length} patrols in sector`;
      objectiveProgress = 0;
    } else {
      objectiveText = `Eliminate hostile forces (${livingEnemies.length + bossAliveCount} remaining)`;
      objectiveProgress = totalEnemies > 0 ? (totalEnemies - livingEnemies.length) / totalEnemies : 1;
    }

    const snap: HudSnapshot = {
      screen: this.screen,
      mode: this.mode,
      unitId: this.player.classId,
      unitName: this.player.spec.name,
      unitCode: this.player.spec.code,
      hp: Math.round(this.player.health.chassis),
      maxHp: Math.round(this.player.health.maxChassis),
      armor: Math.round(this.player.health.armor),
      maxArmor: Math.round(this.player.health.maxArmor),
      components: { ...this.player.health },
      speed: Math.round(Math.hypot(this.player.phys.vel.x, this.player.phys.vel.y)),
      maxSpeed: Math.round(this.player.physCfg.maxSpeed),
      stability: Math.round(this.player.phys.stability * 100),
      braced:
        this.player.phys.bracingFactor > 0.5 ||
        this.player.primary.isPreparing ||
        (this.player.specialActiveTimer > 0 && this.player.spec.specialAbility.kind === 'siege_stance'),
      terrain,
      gaitState: this.player.legs.gaitState.toUpperCase(),
      activeSlot: this.player.activeSlot,
      primaryWeapon: {
        name: this.player.primary.spec.name,
        ammo: this.player.primary.ammo,
        maxAmmo: this.player.primary.spec.magazineSize,
        reloading: this.player.primary.reloading,
        reloadProgress: this.player.primary.reloading
          ? 1 - this.player.primary.reloadTimer / this.player.primary.spec.reloadTime
          : 1,
        chargeProgress: this.player.primary.isCharging
          ? this.player.primary.chargeTimer / Math.max(0.05, this.player.primary.spec.chargeTime)
          : 0,
        prepProgress: this.player.primary.isPreparing
          ? this.player.primary.prepTimer / Math.max(0.05, this.player.primary.spec.prepTime)
          : 0,
      },
      secondaryWeapon: {
        name: this.player.secondary.spec.name,
        ammo: this.player.secondary.ammo,
        maxAmmo: this.player.secondary.spec.magazineSize,
        reloading: this.player.secondary.reloading,
        reloadProgress: this.player.secondary.reloading
          ? 1 - this.player.secondary.reloadTimer / this.player.secondary.spec.reloadTime
          : 1,
      },
      specialAbility: {
        kind: this.player.spec.specialAbility.kind,
        name: this.player.spec.specialAbility.name,
        active: this.player.specialActiveTimer > 0,
        activeRemaining: this.player.specialActiveTimer,
        cooldownRemaining: this.player.specialCooldownTimer,
        cooldownTotal: this.player.spec.specialAbility.cooldown,
      },
      squadOrder: this.squadCtrl.currentOrder,
      playerAegisRemaining: isAegisArmorActive(this.player) ? this.player.aegisArmor?.remaining ?? 0 : 0,
      squadMembers: this.allies.map((a) => ({
        id: a.id,
        callsign: a.callsign,
        unitName: a.spec.name,
        role: a.squadRole,
        hpRatio: Math.max(0, a.health.chassis / a.health.maxChassis),
        armorRatio: Math.max(0, a.health.armor / Math.max(1, a.health.maxArmor)),
        alive: a.alive,
        downed: Boolean(a.downed),
        reviveProgress: a.reviveProgress ?? 0,
        aegisRemaining: isAegisArmorActive(a) ? a.aegisArmor?.remaining ?? 0 : 0,
        order: a.squadOrder,
        statusText: a.alive
          ? SQUAD_ORDER_LABELS[a.squadOrder]
          : a.downed
          ? 'DOWNED'
          : 'KIA',
      })),
      missionTitle:
        this.mode === 'campaign'
          ? CAMPAIGN_MISSIONS.find((m) => m.id === this.currentMissionId)?.title ?? 'Campaign'
          : this.mode === 'boss_challenge'
          ? 'BOSS HUNT'
          : this.mode === 'freeroam'
          ? 'FREE ROAM'
          : this.mode.toUpperCase(),
      objectiveText,
      objectiveProgress,
      enemiesRemaining: livingEnemies.length + bossAliveCount,
      wave: this.waveNumber,
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      kills: this.kills,
      damageDealt: this.damageDealt,
      creditsEarned: this.creditsEarned,
      radioFeed: this.radioManager.active
        ? [{ speaker: this.radioManager.active.speaker, text: this.radioManager.active.text, id: this.radioManager.active.id }, ...this.radioFeed].slice(0, 4)
        : this.radioFeed,
      activeRadio: this.radioManager.active
        ? {
            id: this.radioManager.active.id,
            speaker: this.radioManager.active.speaker,
            text: this.radioManager.active.text,
            priority: this.radioManager.active.priority,
            signalProfile: this.radioManager.active.signalProfile,
            progress: Math.min(1, this.radioManager.active.elapsedSec / Math.max(0.1, this.radioManager.active.durationSec)),
          }
        : null,
      boot: this.bootSequence.getHudSnapshot(),
      warningMessage: this.warningMessage,
      minimapVisible: this.minimapVisible,
      tacticalOpen: this.tacticalOpen,
      squadWheelOpen: this.squadWheelOpen,
      victory: this.victory,
      endReason: this.endReason,
      trainingGodMode: this.trainingGodMode,
      trainingBossTuning: { ...this.trainingBossTuning },
      sandbox:
        this.mode === 'training'
          ? {
              simPaused: this.sandboxSimPaused,
              godMode: this.trainingGodMode,
              infiniteAmmo: this.sandboxInfiniteAmmo,
              aggressionMult: this.sandboxAggressionMult,
              speedMult: this.sandboxSpeedMult,
              behaviorMode: this.sandboxBehaviorMode,
              activeSpawnedCount:
                this.allies.filter((a) => a.alive).length + this.enemies.filter((e) => e.alive).length,
              maxSpawnedCount: SANDBOX_MAX_ACTIVE_UNITS,
              activeBossCount: this.boss && (this.boss.alive || this.boss.destroying) ? 1 : 0,
              activeRevenantCount: this.enemies.filter((e) => e.alive && e.isRevenant).length,
            }
          : null,
      boss: this.boss ? this.boss.toHudSnapshot(this.warningMessage) : null,
      bossIntroActive: this.bossIntroTimer > 0,
      cinematicBanner: this.bossCinematics.getCameraOverride(this.player.phys.pos).bannerText,
      mortarHud: (() => {
        const sol = this.getMortarSolution();
        if (!sol) return null;
        return {
          activeAmmo: this.mortarAmmo.activeAmmo,
          minRange: sol.minRange,
          maxRange: sol.maxRange,
          travelTime: sol.travelTime,
          scatterRadius: sol.scatterRadius,
          inRange: sol.inRange,
          targetX: sol.targetX,
          targetY: sol.targetY,
          barrageActive: this.overwatchBarrage.active,
        };
      })(),
      incomingWarnings: this.incomingWarnings.map((w) => ({ ...w })),
      empDisruptTimer: this.empDisruptTimer,
      defendObjective: this.defendStructure
        ? { label: this.defendStructure.label, hp: Math.round(this.defendStructure.hp), maxHp: this.defendStructure.maxHp }
        : null,
      minimapEntities: [
        ...this.allies.filter((a) => a.alive).map((a) => ({ x: a.phys.pos.x, y: a.phys.pos.y, team: 'ally' as const, detected: true })),
        ...this.enemies
          .filter((e) => e.alive)
          .map((e) => ({
            x: e.phys.pos.x,
            y: e.phys.pos.y,
            team: (e.isRevenant ? 'revenant' : 'enemy') as 'revenant' | 'enemy',
            detected:
              this.empDisruptTimer > 0
                ? false
                : e.detected || Boolean(e.isRevenant) || e.enemyArchetype === 'grappler',
            label: e.isRevenant ? 'REVENANT' : undefined,
          })),
        ...(this.boss && (this.boss.alive || this.boss.destroying)
          ? [{ x: this.boss.phys.pos.x, y: this.boss.phys.pos.y, team: 'boss' as const, detected: this.empDisruptTimer <= 0, label: this.boss.spec.code }]
          : []),
        ...this.bossDeployables
          .filter((d) => d.kind === 'decoy')
          .map((d) => ({ x: d.x, y: d.y, team: 'decoy' as const, detected: true })),
        ...this.friendlyDeployables.map((d) => ({
          x: d.x,
          y: d.y,
          team: (d.kind === 'ewar_decoy' ? 'decoy' : 'ally') as 'decoy' | 'ally',
          detected: true,
        })),
        ...this.map.objectives
          .filter((o) => !o.completed)
          .map((o) => ({ x: o.x, y: o.y, team: 'objective' as const, detected: true, label: o.label })),
      ],
      minimapObstacles: this.map.obstacles
        .filter((o) => !o.destroyed)
        .map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      playerX: this.player.phys.pos.x,
      playerY: this.player.phys.pos.y,
      playerAimAngle: this.player.phys.aimAngle,
      dashHud: {
        supported: Boolean(this.player.dash?.spec.supported && !this.player.spec.canFly),
        active: Boolean(this.player.dash?.isDashing()),
        ready: Boolean(this.player.dash?.canDash()),
        cooldownRemaining: this.player.dash?.cooldownTimer ?? 0,
        cooldownTotal: this.player.dash?.spec.cooldown ?? 2.2,
        charges: this.player.dash?.charges ?? 0,
      },
      grappleHud: {
        supported: this.player.spec.canGrapple !== false,
        state: this.grapple.state,
        hasValidTarget: Boolean(this.grapple.hoveredCandidate?.valid),
        targetDist: Math.round(this.grapple.hoveredCandidate?.distance ?? 0),
        cableLength: Math.round(this.grapple.ropeLength),
        tension: this.grapple.tension,
        cooldownRemaining: this.grapple.cooldownTimer,
      },
      flightHud: this.player.spec.canFly && this.player.flight
        ? {
            isFlyingMech: true,
            airborne: Boolean(this.player.flight.isAirborne),
            altitude: Math.round(this.player.flight.altitude),
            maxAltitude: VALKYRIE_FLIGHT_CONFIG.maxAltitude,
            verticalVel: Math.round(this.player.flight.verticalVel),
            heat: Math.max(0, Math.min(1, this.player.flight.heat / 100)),
            overheated: Boolean(this.player.flight.overheated),
            boosting: Boolean(this.player.flight.boosting),
            stability: Math.round(this.player.flight.flightStability * 100),
          }
        : null,
      missileLockWarning: this.missileLockWarning,
      airborneEnemiesCount: livingEnemies.filter((e) => (e.flight?.altitude ?? 0) > 12).length,
      aaHud: {
        heat: this.player.antiAir.getHeatRatio(),
        overheated: this.player.antiAir.overheated,
        active: this.player.antiAir.trackingCount > 0 || this.player.antiAir.muzzleFlashTimer > 0,
        trackingCount: this.player.antiAir.trackingCount,
        damaged: this.player.antiAir.damagedDegraded,
      },
      victoryCinematic: this.victoryCinematic.getSnapshot(),
      revenantBanner: this.revenantManager.state.bannerText,
      revenantInterference: this.revenantManager.state.interferenceAlpha,
      revenantActive: this.enemies.some((e) => e.alive && e.isRevenant),
      stealthHud: this.player.stealth?.supported
        ? (() => {
            const st = this.player.stealth!;
            const execKind = this.player.spec.specialAbility.kind;
            const execTgt =
              (execKind === 'phantom_execution' || execKind === 'assassin_crimson_tempest') &&
              this.player.specialCooldownTimer <= 0 &&
              !this.takedowns.isUnitLocked(this.player.id)
                ? this.takedowns.findExecutionTarget(
                    this.player,
                    this.enemies,
                    this.boss,
                    this.mouseWorld,
                    execKind === 'assassin_crimson_tempest' ? 620 : undefined
                  )
                : null;
            return {
              supported: true,
              active: st.active,
              energy: Math.round(st.energy),
              maxEnergy: st.maxEnergy,
              cooldownRemaining: st.cooldownTimer,
              revealed: st.revealedTimer > 0,
              detectedByEnemy: st.detectedByEnemy,
              cloakAlpha: st.cloakAlpha,
              executionTargetCallsign: execTgt
                ? execTgt.kind === 'mech'
                  ? execTgt.target.callsign
                  : execTgt.boss.spec.code
                : null,
              executionTargetInRange: Boolean(execTgt),
              executionTargetIsBoss: Boolean(execTgt && execTgt.kind === 'boss'),
            };
          })()
        : null,
      transformHud: this.player.isProteusOrigin
        ? {
            isProteus: true,
            isTransforming: Boolean(this.player.transform?.active),
            isTransformed: this.player.classId !== 'proteus',
            baseClassId: 'proteus',
            activeTargetId: this.player.transform?.active ? this.player.transform.targetSpec.id : this.player.classId,
            activeTargetName: this.player.transform?.active
              ? `${this.player.transform.targetSpec.code} ${this.player.transform.targetSpec.name}`
              : `${this.player.spec.code} ${this.player.spec.name}`,
            stage: this.player.transform?.active ? this.player.transform.pose.stage : null,
            stageLabel: this.player.transform?.active ? this.player.transform.pose.stageLabel : null,
            progress: this.player.transform?.active ? this.player.transform.pose.u : 0,
            selectorOpen: this.transformSelectorOpen,
            totalReplicationCooldown: Math.max(0, this.playerTransformCooldown),
            totalReplicationCooldownTotal: TRANSFORM_COOLDOWN_SEC,
            eligibleTargets: getEligibleReplicationTargets(
              MECH_LIST,
              this.save.unlockedUnits,
              this.player.classId
            ),
          }
        : null,
      takedownHud: (() => {
        const s = this.takedowns.getSessionForPlayer();
        if (!s || (!s.isPlayerAttacker && !s.isPlayerVictim)) return null;
        if (!s.minigame.active && !(s.minigame.lastJudgment && s.minigame.judgmentTimer > 0)) return null;
        const mg = s.minigame;
        const sl = mg.slash;
        return {
          active: mg.active,
          mode: s.isPlayerVictim ? 'first_person_escape' : 'player_execution',
          variant: mg.variant,
          stage: mg.stage,
          totalStages: mg.totalStages,
          cursor: mg.cursor,
          cursorWidth: mg.cursorWidth,
          cursorVel: mg.cursorVel,
          evadeCooldownRatio: Math.max(0, Math.min(1, mg.evadeCooldown / Math.max(0.05, mg.evadeMaxCooldown))),
          instability: mg.instability,
          lastJudgment: mg.lastJudgment,
          judgmentTimer: mg.judgmentTimer,
          ringRadius: mg.ringRadius,
          ringTargetRadius: mg.ringTargetRadius,
          needleA: mg.needleA,
          needleB: mg.needleB,
          targetZoneCenter: mg.targetZoneCenter,
          targetZoneHalfWidth: mg.targetZoneHalfWidth,
          activeLane: mg.activeLane,
          dangerLanes: [...mg.dangerLanes] as [boolean, boolean, boolean],
          slash: sl
            ? {
                phase: sl.phase,
                progress: Math.max(0, Math.min(1, 1 - sl.phaseTimer / Math.max(0.05, sl.phaseDuration))),
                zoneCenter: sl.zoneCenter,
                zoneHalfWidth: sl.zoneHalfWidth,
                secondaryZoneCenter: sl.secondaryZoneCenter,
                secondaryZoneHalfWidth: sl.secondaryZoneHalfWidth,
                angleRad: sl.angleRad,
                side: sl.side,
                dodged: sl.dodged,
                wasHit: sl.wasHit,
                nextIntervalProgress: 1,
              }
            : mg.active
            ? {
                phase: 'idle' as const,
                progress: 0,
                zoneCenter: 0.5,
                zoneHalfWidth: 0.14,
                secondaryZoneCenter: null,
                secondaryZoneHalfWidth: 0.1,
                angleRad: 0,
                side: 0 as const,
                dodged: false,
                wasHit: false,
                nextIntervalProgress: Math.max(
                  0,
                  Math.min(1, 1 - mg.nextSlashTimer / Math.max(0.1, mg.nextSlashDuration))
                ),
              }
            : null,
          isBossAmbush: s.isBossTarget,
        };
      })(),
      grapplerClingHud: (() => {
        const attachedToPlayerCount = countAttachedGrapplersForUnit(this.player.id, this.enemies);
        let attachedToAlliesCount = 0;
        const attachedHosts: { callsign: string; count: number; isPlayer: boolean }[] = [];
        if (attachedToPlayerCount > 0) {
          attachedHosts.push({ callsign: this.player.callsign, count: attachedToPlayerCount, isPlayer: true });
        }
        for (let i = 0; i < this.allies.length; i++) {
          const a = this.allies[i];
          if (!a.alive) continue;
          const cnt = countAttachedGrapplersForUnit(a.id, this.enemies);
          if (cnt > 0) {
            attachedToAlliesCount += cnt;
            attachedHosts.push({ callsign: a.callsign, count: cnt, isPlayer: false });
          }
        }
        return {
          attachedToPlayerCount,
          attachedToAlliesCount,
          totalDpsOnPlayer: attachedToPlayerCount * GRAPPLER_CLING_DPS,
          slowPenaltyPct: Math.round((1 - computeGrapplerSlowMultiplier(attachedToPlayerCount)) * 100),
          attachedHosts,
        };
      })(),
    };

    this.onHudUpdate(snap);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const kb = this.save.settings.keyBindings;

    if (this.screen === 'playing') {
      if (this.victoryCinematic.active) {
        if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
          e.preventDefault();
          if (this.victoryCinematic.phase === 'awards') {
            this.completeVictoryCinematic();
          } else {
            this.skipVictoryCinematic();
          }
        }
        return;
      }
      if (this.transformSelectorOpen) {
        if (e.code === 'Escape') {
          e.preventDefault();
          this.closeTransformSelector();
          return;
        }
        if (e.code === 'KeyB' || e.code === kb.special) {
          e.preventDefault();
          this.closeTransformSelector();
          return;
        }
        if (e.code.startsWith('Digit') && !e.repeat) {
          const idx = parseInt(e.code.slice(5), 10) - 1;
          const targets = getEligibleReplicationTargets(MECH_LIST, this.save.unlockedUnits, this.player.classId);
          if (idx >= 0 && idx < targets.length) {
            e.preventDefault();
            this.selectPlayerTransformTarget(targets[idx].id);
            return;
          }
        }
      }
      if (e.code === 'KeyB' && !e.repeat && this.player.isProteusOrigin) {
        e.preventDefault();
        this.openTransformSelector();
        return;
      }
      if (e.code === kb.pause || e.code === 'KeyP') {
        e.preventDefault();
        this.setScreen('paused');
        return;
      }
      if (e.code === kb.tacticalMap) {
        e.preventDefault();
        this.tacticalOpen = !this.tacticalOpen;
        this.pushHudSnapshot();
        return;
      }
      if (e.code === kb.squadMenu) {
        e.preventDefault();
        this.squadWheelOpen = !this.squadWheelOpen;
        this.pushHudSnapshot();
        return;
      }
      if (e.code === kb.toggleMinimap) {
        this.minimapVisible = !this.minimapVisible;
        this.pushHudSnapshot();
        return;
      }
      if (this.takedowns.getPlayerMinigameSession()) {
        if (
          (e.code === 'Space' ||
            e.code === 'KeyF' ||
            e.code === 'Enter' ||
            e.code === 'ShiftLeft' ||
            e.code === 'ShiftRight') &&
          !e.repeat
        ) {
          e.preventDefault();
          this.submitPlayerTakedownTiming();
          return;
        }
      }
      if (e.code === kb.dash && !e.repeat) {
        if (!this.player.spec.canFly) {
          e.preventDefault();
          this.triggerPlayerDash();
        }
      }
      if (e.code === kb.grapple && !e.repeat) {
        e.preventDefault();
        this.triggerPlayerGrapple();
      }
      if (e.code === kb.stealth && !e.repeat) {
        e.preventDefault();
        this.triggerPlayerStealth();
      }
      if (e.code === kb.reload) {
        this.startReload(this.player, this.player.activeSlot === 2 ? this.player.secondary : this.player.primary);
      }
      if (e.code === kb.special) {
        e.preventDefault();
        this.activateSpecialAbility(this.player);
      }
      if (e.code === kb.weapon1) {
        this.player.activeSlot = 1;
        this.pushHudSnapshot();
      }
      if (e.code === kb.weapon2) {
        this.player.activeSlot = 2;
        this.pushHudSnapshot();
      }
      if (e.code === kb.weapon3) {
        this.player.activeSlot = 3;
        this.activateSpecialAbility(this.player);
      }
      if (e.code === 'KeyF' && this.player.classId === 'colossus') {
        e.preventDefault();
        this.cyclePlayerMortarAmmo();
      }
      if (e.code === kb.interact && this.mode === 'training') {
        this.spawnTrainingTargets();
      }
    } else if (this.screen === 'paused') {
      if (e.code === kb.pause || e.code === 'KeyP') {
        e.preventDefault();
        this.setScreen('playing');
        return;
      }
    } else if (this.screen === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.startCampaignMission(1);
        return;
      }
    }

    this.keysHeld.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreen.x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    this.mouseScreen.y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
  };

  private onMouseDown = (e: MouseEvent) => {
    this.audio.unlock();
    if (this.screen !== 'playing') return;
    if (e.button === 0 && this.takedowns.getPlayerMinigameSession()) {
      this.submitPlayerTakedownTiming();
      return;
    }
    if (e.button === 0) this.mouseLeftDown = true;
    if (e.button === 2) this.mouseRightDown = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseLeftDown = false;
    if (e.button === 2) this.mouseRightDown = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.screen !== 'playing') return;
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    this.camera.targetZoom = Math.max(0.7, Math.min(1.45, this.camera.targetZoom + delta));
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.screen === 'playing') e.preventDefault();
  };

  private onBlur = () => {
    this.keysHeld.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
  };

  private handleResize = () => {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.save.settings.displayScale;
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.canvas);
    this.handleResize();
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
