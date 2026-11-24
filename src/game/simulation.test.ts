import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MECH_LIST, MECH_ROSTER, computeEffectiveMechStats } from './mechRoster';
import {
  applyRecoilImpulse,
  createPhysicsState,
  resolveObstacleCollisions,
  stepMechPhysics,
} from './physics';
import {
  createComponentHealth,
  applyComponentDamage,
  repairComponents,
  checkUnitDamageImmunity,
} from './combat';
import {
  AEGIS_ARMOR_DURATION,
  activateAegisArmorForSquad,
  getAegisVisualProfile,
  isAegisArmorActive,
  stepAegisArmor,
  triggerAegisDeflectFlash,
} from './aegisArmor';
import {
  REVIVE_CAPABLE_CLASSES,
  assignReviveTargets,
  canMechRevive,
  completeSquadmateRevive,
  isEligibleForRevive,
} from './reviveSystem';
import { LegAnimator, solveTwoBoneIK } from './proceduralLegs';
import { buildMap, getTerrainAt } from './maps';
import { NavGrid, hasLineOfSight } from './pathfinding';
import { BOSS_VARIANT_LIST, BOSS_VARIANTS } from './bossVariants';
import { BossCinematicController } from './bossCinematics';
import {
  BossEncounterDirector,
  BossSpawnManager,
  DEFAULT_SKIRMISH_BOSS_CONFIG,
  pickSurvivalBossForWave,
} from './bossDirector';
import {
  MORTAR_AMMO_ORDER,
  MORTAR_AMMO_SPECS,
  MORTAR_MAX_RANGE,
  MORTAR_MIN_RANGE,
  MortarAmmoManager,
  MortarTargetingSystem,
  OverwatchBarrageController,
  doesSegmentCrossSmoke,
  isPointInSmoke,
} from './mortarSystem';
import { ThunderheadBoss } from './thunderheadBoss';
import { ProjectilePool } from './weapons';
import { Camera } from './camera';
import { AfterimagePool, DashController } from './dashSystem';
import { GrappleController, GrappleTargetRegistry } from './grappleSystem';
import { createFlightState, stepFlightPhysics, VALKYRIE_FLIGHT_CONFIG } from './flightSystem';
import { createFlyingEnemy, computeFlyingEnemyAI, stepFlyingEnemyMotion } from './flyingEnemies';
import { createPlayableMech } from './mech';
import { ALL_AUDIO_ASSET_IDS, AUDIO_ASSET_MANIFEST } from './audioAssets';
import { computeSpatialAudioParams, selectTerrainFootstepAsset, VoiceLimiter } from './audioMixer';
import { AntiAirController } from './antiAirController';
import { ANTI_AIR_UPGRADES, computeEffectiveAntiAirSpec, mapMechClassToAntiAirKey } from './antiAirUpgrades';
import { computeAntiAirHitChance } from './antiAirWeapon';
import { CombatThreatManager } from './combatThreatManager';
import { createEnemyMech, computeEnemyAI } from './enemies';
import { stepCounterInterceptorProjectile, stepMissileProjectile } from './missileController';
import { computeMissileGuidance, isSolidMissileCover } from './missileGuidance';
import { ALL_MISSILE_TYPES, MISSILE_PROFILES } from './missileTypes';
import {
  computeContextualHudState,
  computeDamageResponsiveState,
  computeOffscreenThreats,
  computeRadarBlips,
} from './hudController';
import { ALL_VOICE_LINES } from './dialogueDatabase';
import { MechBootSequence } from './mechBootSequence';
import { SquadController } from './alliedAI';
import { MatchPerformanceTracker, VictoryCinematicManager } from './victoryCinematic';
import {
  FailedRunTracker,
  getEligibleRevenantClasses,
  getRevenantProfileForClass,
  pickRandomRevenantClass,
  resolveGuaranteedRevenantClass,
  RevenantManager,
  RevenantVariantFactory,
} from './revenantSystem';
import {
  computeGrapplerSlowMultiplier,
  countAttachedGrapplersForUnit,
  createGrapplerEnemyUnit,
  createGrapplerGroup,
  detachGrappler,
  GRAPPLER_CHASSIS_SPEC,
  GRAPPLER_CLING_DPS,
  GRAPPLER_GROUP_SIZE,
  GRAPPLER_MAX_SWING_SPEED,
  GRAPPLER_SPAWN_MAX_SEC,
  GRAPPLER_SPAWN_MIN_SEC,
  GrapplerSpawnScheduler,
  isGrapplerImmuneToProjectile,
  MAX_ACTIVE_GRAPPLERS,
  pickGrapplerApproachAnchor,
  rollNextGrapplerSpawnInterval,
  stepGrapplerEnemyAI,
  syncClingingGrapplers,
} from './grapplerEnemy';
import { CAMPAIGN_MISSIONS, buildSurvivalWave } from './missions';
import { RadioCommunicationManager } from './radioCommunicationManager';
import {
  ALL_MUSIC_TRACK_IDS,
  mapMusicStateToTrack,
  MUSIC_TRACK_MANIFEST,
  MusicState,
} from './musicManager';
import { BossLegAnimator } from './bossLegs';
import { buildSandboxRegistry } from './sandboxRegistry';
import { HudSnapshot, MapId, Obstacle } from './types';

test('all 12 playable mechs have distinct physics and leg configurations including TX-10 Proteus, PS-08 Phase Strider, AS-09 Kurokage Stalker, M-09 Colossus, and A-12 Valkyrie', () => {
  assert.equal(MECH_LIST.length, 12);
  const speeds = new Set(MECH_LIST.map((m) => m.maxSpeed));
  const masses = new Set(MECH_LIST.map((m) => m.mass));
  assert.equal(speeds.size >= 11, true);
  assert.equal(masses.size, 12);
  assert.equal(MECH_ROSTER.recon.legs.length, 4);
  assert.equal(MECH_ROSTER.standard.legs.length, 6);
  assert.equal(MECH_ROSTER.heavy.legs.length, 8);
  assert.equal(MECH_ROSTER.colossus.legs.length, 8);
  assert.equal(MECH_ROSTER.colossus.silhouette, 'colossus');
  assert.equal(MECH_ROSTER.colossus.specialAbility.kind, 'overwatch_barrage');
  assert.equal(MECH_ROSTER.valkyrie.legs.length, 4);
  assert.equal(MECH_ROSTER.valkyrie.canFly, true);
  assert.equal(MECH_ROSTER.valkyrie.silhouette, 'valkyrie');
  assert.equal(MECH_ROSTER.valkyrie.specialAbility.kind, 'flight_overdrive');
  assert.equal(MECH_ROSTER.phantom.legs.length, 6);
  assert.equal(MECH_ROSTER.phantom.silhouette, 'phantom');
  assert.equal(MECH_ROSTER.phantom.specialAbility.kind, 'aegis_armor');
  assert.equal(MECH_ROSTER.assassin.legs.length, 6);
  assert.equal(MECH_ROSTER.assassin.silhouette, 'assassin');
  assert.equal(MECH_ROSTER.assassin.specialAbility.kind, 'phantom_execution');
});

test('upgrades apply trade-offs without making units identical', () => {
  const recon = computeEffectiveMechStats(MECH_ROSTER.recon, {
    upgrades: { composite_armor: 3 },
    paintId: 'spearhead',
    weaponVariant: 'standard',
    armorPackage: 'reactive',
    supportModule: 'none',
  });
  const baseRecon = computeEffectiveMechStats(MECH_ROSTER.recon);
  assert.ok(recon.armor > baseRecon.armor);
  assert.ok(recon.mass > baseRecon.mass);
  assert.ok(recon.acceleration < baseRecon.acceleration);
});

test('mech physics obeys heavy acceleration, coasting momentum, emergency braking, and terrain penalties', () => {
  const spec = MECH_ROSTER.heavy;
  const cfg = {
    mass: spec.mass,
    acceleration: spec.acceleration,
    maxSpeed: spec.maxSpeed,
    sprintMultiplier: spec.sprintMultiplier,
    reverseMultiplier: spec.reverseMultiplier,
    turnAccel: spec.turnAccel,
    maxTurnSpeed: spec.maxTurnSpeed,
    lateralGrip: spec.lateralGrip,
    radius: spec.radius,
    suspensionStiffness: spec.suspensionStiffness,
    terrainPenaltyMult: 1,
  };
  const health = createComponentHealth(spec.baseChassis, spec.baseArmor, spec.legDurability);
  const concreteState = createPhysicsState(500, 500, 0);
  const mudState = createPhysicsState(500, 500, 0);

  for (let i = 0; i < 40; i++) {
    stepMechPhysics(concreteState, cfg, { wishX: 1, wishY: 0, sprint: false, time: i * 0.016 }, 'concrete', health, 1 / 60);
    stepMechPhysics(mudState, cfg, { wishX: 1, wishY: 0, sprint: false, time: i * 0.016 }, 'mud', health, 1 / 60);
  }

  const speedConcrete = Math.hypot(concreteState.vel.x, concreteState.vel.y);
  const speedMud = Math.hypot(mudState.vel.x, mudState.vel.y);
  assert.ok(speedConcrete > 12 && speedConcrete < spec.maxSpeed, `Unexpected heavy speed: ${speedConcrete}`);
  assert.ok(speedMud < speedConcrete, `Expected mud speed (${speedMud}) < concrete speed (${speedConcrete})`);

  // Releasing input retains heavy coasting momentum rather than stopping instantly
  stepMechPhysics(concreteState, cfg, { wishX: 0, wishY: 0, sprint: false, time: 0.7 }, 'concrete', health, 1 / 60);
  assert.ok(Math.hypot(concreteState.vel.x, concreteState.vel.y) > 8);

  // Reversing input triggers emergency braking resistance and forward chassis pitch
  for (let i = 0; i < 5; i++) {
    stepMechPhysics(concreteState, cfg, { wishX: -1, wishY: 0, sprint: false, time: 0.8 + i * 0.016 }, 'concrete', health, 1 / 60);
  }
  assert.equal(concreteState.braking, true);
  assert.ok(concreteState.tiltX > 0, 'Expected forward chassis lean during emergency braking');
});

test('physics-based recoil applies backward impulse, rotational torque, stability loss, and leg-damage amplification', () => {
  const artSpec = MECH_ROSTER.artillery;
  const healthy = createPhysicsState(400, 400, 0);
  const crippled = createPhysicsState(400, 400, 0);

  // Off-axis shot (+PI/3) produces linear pushback + rotational yaw torque + stability depletion
  applyRecoilImpulse(healthy, Math.PI / 3, artSpec.primaryWeapon.recoilImpulse, artSpec.mass, {
    recoilTorque: artSpec.primaryWeapon.recoilTorque,
    barrelOffsetY: 6,
    stabilityCost: artSpec.primaryWeapon.stabilityCost,
    legAvgRatio: 1.0,
  });

  assert.ok(healthy.vel.x < -10, 'Expected strong backward X impulse');
  assert.ok(healthy.vel.y < -15, 'Expected strong backward Y impulse');
  assert.ok(Math.abs(healthy.angularVel) > 0.1, 'Expected off-axis rotational torque');
  assert.ok(healthy.stability < 1.0, 'Expected weapon fire to deplete stability');
  assert.ok(healthy.recoilOffset > 5, 'Expected barrel recoil slide');

  // Damaged legs absorb far less recoil
  applyRecoilImpulse(crippled, Math.PI / 3, artSpec.primaryWeapon.recoilImpulse, artSpec.mass, {
    recoilTorque: artSpec.primaryWeapon.recoilTorque,
    barrelOffsetY: 6,
    stabilityCost: artSpec.primaryWeapon.stabilityCost,
    legAvgRatio: 0.25,
  });
  assert.ok(Math.hypot(crippled.vel.x, crippled.vel.y) > Math.hypot(healthy.vel.x, healthy.vel.y));
  assert.ok(crippled.stability < healthy.stability);
});

test('procedural spider-leg IK stays within reach, plants feet, compresses on slam, and widens when braced', () => {
  const spec = MECH_ROSTER.standard;
  const health = createComponentHealth(spec.baseChassis, spec.baseArmor, spec.legDurability);
  const phys = createPhysicsState(600, 600, 0);
  const animator = new LegAnimator(spec.legs, phys.pos, phys.bodyAngle);
  const cfg = {
    mass: spec.mass,
    acceleration: spec.acceleration,
    maxSpeed: spec.maxSpeed,
    sprintMultiplier: spec.sprintMultiplier,
    reverseMultiplier: spec.reverseMultiplier,
    turnAccel: spec.turnAccel,
    maxTurnSpeed: spec.maxTurnSpeed,
    lateralGrip: spec.lateralGrip,
    radius: spec.radius,
    suspensionStiffness: spec.suspensionStiffness,
    terrainPenaltyMult: 1,
  };
  const legCfg = {
    strideLength: spec.strideLength,
    stepHeight: spec.stepHeight,
    stepSpeed: spec.stepSpeed,
    maxSpeed: spec.maxSpeed,
    footstepWeight: spec.footstepWeight,
  };

  // Verify solveTwoBoneIK never produces NaN or over-extension
  const ik = solveTwoBoneIK({ x: 0, y: 0 }, { x: 200, y: 0 }, 21, 25, 1, 0, 0, 0.5);
  assert.ok(Number.isFinite(ik.knee.x) && Number.isFinite(ik.knee.y));
  assert.ok(Math.hypot(ik.clampedFoot.x, ik.clampedFoot.y) <= 21 + 25);

  // Move forward for 65 frames and verify footsteps + leg compression occur
  let sawFootstep = false;
  let sawCompression = false;
  for (let i = 0; i < 65; i++) {
    stepMechPhysics(phys, cfg, { wishX: 1, wishY: 0, sprint: false, time: i / 60 }, 'concrete', health, 1 / 60);
    const steps = animator.update(1 / 60, phys, legCfg, health, []);
    if (steps.length > 0) sawFootstep = true;
    if (animator.legs.some((l) => l.compression > 0.2)) sawCompression = true;
    const swingingCount = animator.legs.filter((l) => l.isSwinging).length;
    assert.ok(swingingCount < animator.legs.length, 'Never lift all legs simultaneously');
  }
  assert.equal(sawFootstep, true);
  assert.equal(sawCompression, true);
  assert.notEqual(animator.gaitState, 'idle');

  // Entering weapon brace locks gait to anchored
  for (let i = 0; i < 30; i++) {
    stepMechPhysics(phys, cfg, { wishX: 0, wishY: 0, sprint: false, bracing: true, time: 1.2 + i / 60 }, 'concrete', health, 1 / 60);
    animator.update(1 / 60, phys, legCfg, health, []);
  }
  assert.equal(animator.gaitState, 'anchored');

  // Crippling left legs marks left leg destroyed/damaged
  health.leftLegs = 0;
  animator.update(1 / 60, phys, legCfg, health, []);
  const leftDestroyed = animator.legs.some((l) => l.spec.side === 'left' && l.destroyed);
  assert.equal(leftDestroyed, true);
});

test('component damage routes armor, rear engine, and flank leg hits accurately', () => {
  const h = createComponentHealth(200, 100, 100);
  const rear = applyComponentDamage(h, 50, Math.PI, { rng: 0.1 });
  assert.equal(rear.componentDamaged, 'engine');
  assert.ok(h.engine < h.maxEngine);
  assert.ok(h.armor < h.maxArmor);

  const flank = applyComponentDamage(h, 60, -Math.PI * 0.5, { rng: 0.1 });
  assert.equal(flank.componentDamaged, 'leftLegs');
  assert.ok(h.leftLegs < h.maxLeftLegs);

  repairComponents(h, 100);
  assert.ok(h.leftLegs > 80);
});

test('maps terrain lookup, obstacle collision, LOS, and A* pathfinding', () => {
  const map = buildMap('training');
  assert.equal(getTerrainAt(map, 760, 520), 'mud');
  assert.equal(getTerrainAt(map, 760, 940), 'sand');
  assert.equal(getTerrainAt(map, 760, 1360), 'rocky');
  assert.equal(getTerrainAt(map, 760, 1860), 'water');

  const nav = new NavGrid(map);
  const path = nav.findPath({ x: 1020, y: 1260 }, { x: 1460, y: 1260 });
  assert.ok(path.length > 0);

  assert.equal(hasLineOfSight({ x: 1080, y: 1260 }, { x: 1400, y: 1260 }, map.obstacles), false);

  const pos = { x: 1240, y: 1260 };
  const vel = { x: 10, y: 0 };
  const collided = resolveObstacleCollisions(pos, vel, 20, map.obstacles, map.width, map.height);
  assert.equal(collided, true);
});

test('all 5 Thunderhead boss variants have distinct scales, leg counts (10-16), and warheads', () => {
  assert.equal(BOSS_VARIANT_LIST.length, 5);
  assert.equal(BOSS_VARIANTS.siege.legs.length, 12);
  assert.equal(BOSS_VARIANTS.cataclysm.legs.length, 16);
  assert.equal(BOSS_VARIANTS.stormbringer.legs.length, 10);
  assert.equal(BOSS_VARIANTS.fortress.legs.length, 14);
  assert.equal(BOSS_VARIANTS.blackout.legs.length, 12);
  assert.ok(BOSS_VARIANTS.cataclysm.radius > BOSS_VARIANTS.siege.radius);
  assert.ok(BOSS_VARIANTS.fortress.frontArmorMult < 0.5 && BOSS_VARIANTS.fortress.rearWeakMult > 1.5);
  assert.equal(BOSS_VARIANTS.blackout.canDeployDecoys, true);
  assert.equal(BOSS_VARIANTS.fortress.canDeployTurrets, true);
});

test('ThunderheadBoss leg wave gait, component weak points, mortar disabling, and collapse sequence work', () => {
  const boss = new ThunderheadBoss('fortress', 1800, 1000, 1.0);
  // Boss initially faces Math.PI (left), so rear powerCore is at +X (local -X -> world +X)
  const rearHit = boss.applyDamage(200, boss.phys.pos.x + boss.spec.radius * 0.7, boss.phys.pos.y);
  assert.equal(rearHit.hitComponent, 'powerCore');

  // Front glacis hit on Fortress deals heavily reduced damage compared to exposed rear core
  const frontBoss = new ThunderheadBoss('fortress', 1800, 1000, 1.0);
  const frontHit = frontBoss.applyDamage(200, frontBoss.phys.pos.x - boss.spec.radius * 0.7, frontBoss.phys.pos.y);
  assert.ok(rearHit.hullDamage > frontHit.hullDamage * 2);

  // Destroying lateral ammoBays triggers secondary cook-off explosion & extra hull chunk damage
  const hullBefore = boss.hull;
  const ammoRes = boss.applyDamage(2000, boss.phys.pos.x, boss.phys.pos.y - boss.spec.radius * 0.55, {
    forcedComponent: 'ammoBays',
  });
  assert.equal(ammoRes.componentJustDestroyed, 'ammoBays');
  assert.equal(ammoRes.secondaryCookOff, true);
  assert.ok(boss.hull < hullBefore - 800);

  // Step boss leg wave gait and verify max concurrent swinging stays bounded (<40%)
  for (let i = 0; i < 40; i++) {
    boss.update(1 / 60, { x: 400, y: 1000 }, [], null, 'concrete', [], 2800, 2000);
    const swinging = boss.legs.legs.filter((l) => l.isSwinging).length;
    assert.ok(swinging <= Math.ceil(boss.legs.legs.length * 0.35));
  }

  // Depleting hull triggers multi-stage 'destroying' sequence rather than instant vanish
  boss.applyDamage(99999, boss.phys.pos.x, boss.phys.pos.y);
  assert.equal(boss.destroying, true);
  assert.equal(boss.alive, true);
  let finalDetonated = false;
  for (let i = 0; i < 200; i++) {
    const act = boss.update(1 / 60, { x: 400, y: 1000 }, [], null, 'concrete', [], 2800, 2000);
    if (act.finalDetonation) finalDetonated = true;
  }
  assert.equal(finalDetonated, true);
  assert.equal(boss.alive, false);
});

test('boss mortar projectiles configure high ballistic arcs and warhead types', () => {
  const pool = new ProjectilePool();
  const p = pool.spawn({
    team: 'enemy',
    ownerId: 'boss_blackout',
    kind: 'artillery',
    x: 2000,
    y: 1000,
    angle: Math.PI,
    speed: 440,
    damage: 140,
    splashRadius: 230,
    range: 2800,
    piercing: false,
    caliber: 14,
    targetX: 600,
    targetY: 1000,
    warheadType: 'emp',
    isBossMortar: true,
  });
  assert.equal(p.isBallistic, true);
  assert.equal(p.isBossMortar, true);
  assert.equal(p.warheadType, 'emp');
  assert.ok(p.arcHeight >= 200);
});

test('M-09 Colossus mortar ammo switching, range clamping, Overwatch Barrage, and smoke LOS disruption', () => {
  const ammoMgr = new MortarAmmoManager();
  assert.equal(ammoMgr.activeAmmo, 'he');
  const seen = new Set<string>([ammoMgr.activeAmmo]);
  for (let i = 0; i < MORTAR_AMMO_ORDER.length; i++) {
    seen.add(ammoMgr.cycleAmmo());
  }
  assert.equal(seen.size, 5);
  assert.ok(MORTAR_AMMO_SPECS.ap.bossArmorMult > MORTAR_AMMO_SPECS.he.bossArmorMult);

  const targeting = new MortarTargetingSystem();
  const tooClose = targeting.computeSolution({ x: 1000, y: 1000 }, { x: 1040, y: 1000 }, 'he');
  assert.equal(tooClose.inRange, false);
  assert.equal(tooClose.clampedDist, MORTAR_MIN_RANGE);

  const tooFar = targeting.computeSolution({ x: 1000, y: 1000 }, { x: 4000, y: 1000 }, 'ap');
  assert.equal(tooFar.inRange, false);
  assert.equal(tooFar.clampedDist, MORTAR_MAX_RANGE);

  const good = targeting.computeSolution({ x: 1000, y: 1000 }, { x: 1700, y: 1000 }, 'he', { braced: true });
  assert.equal(good.inRange, true);
  assert.ok(good.travelTime >= 0.65 && good.travelTime <= 3.15);

  const barrage = new OverwatchBarrageController();
  barrage.trigger(1600, 900, 'cluster');
  const firedTargets = [];
  for (let i = 0; i < 120; i++) {
    const res = barrage.update(1 / 60);
    if (res) firedTargets.push(res);
  }
  assert.equal(firedTargets.length, 5);

  const clouds = [{ id: 's1', x: 500, y: 500, radius: 180, life: 10, maxLife: 10 }];
  assert.equal(isPointInSmoke(520, 500, clouds), true);
  assert.equal(doesSegmentCrossSmoke(200, 500, 800, 500, clouds), true);
  assert.equal(doesSegmentCrossSmoke(200, 100, 800, 100, clouds), false);
});

test('Thunderhead high-speed mobility, all 9 dynamic postures, and 5 unique ultimates execute cleanly', () => {
  assert.ok(BOSS_VARIANTS.stormbringer.maxSpeed >= 180);
  assert.ok(BOSS_VARIANTS.siege.maxSpeed >= 140);

  const seenPostures = new Set<string>();
  const storm = new ThunderheadBoss('stormbringer', 2200, 1000, 1.0);
  for (let i = 0; i < 90; i++) {
    storm.update(1 / 60, { x: 300, y: 1000 }, [], null, 'concrete', [], 3200, 2200);
    seenPostures.add(storm.posture);
  }
  assert.ok(seenPostures.has('rapid_move') || seenPostures.has('full_pursuit') || seenPostures.has('fast_walk'));

  // Test emergency_brake + recoil_recover + critical_damage + artillery_deploy + all 5 ultimates
  for (const bv of BOSS_VARIANT_LIST) {
    const b = new ThunderheadBoss(bv.id, 1800, 1000, 1.0);
    const triggered = b.triggerUltimate({ x: 800, y: 1000 }, true);
    assert.equal(triggered, true, `Failed to trigger ultimate for ${bv.id}`);
    assert.equal(b.ultimateActive, true);
    let sawShellOrAction = false;
    for (let s = 0; s < 180; s++) {
      const act = b.update(1 / 60, { x: 800, y: 1000 }, [], null, 'concrete', [], 3000, 2000);
      if (
        (act.fireMortarShells && act.fireMortarShells.length > 0) ||
        (act.fireAuxShots && act.fireAuxShots.length > 0) ||
        act.spawnDeployable ||
        act.empPulse
      ) {
        sawShellOrAction = true;
      }
      seenPostures.add(b.posture);
    }
    assert.equal(sawShellOrAction, true, `Expected ultimate combat output for ${bv.id}`);
  }
  assert.ok(seenPostures.size >= 4);
});

test('BossCinematicController respects full/short/off modes and BossEncounterDirector spawns cleanly', () => {
  const cine = new BossCinematicController();
  const playerPos = { x: 400, y: 900 };
  cine.startUltimateCinematic('stormbringer', 'Hellfire Pursuit', 'TH-03', { x: 1000, y: 900 }, playerPos, 'full');
  assert.equal(cine.getCameraOverride(playerPos).active, true);
  cine.setMode('off');
  assert.equal(cine.getCameraOverride(playerPos).active, false);
  cine.startUltimateCinematic('stormbringer', 'Hellfire Pursuit', 'TH-03', { x: 1000, y: 900 }, playerPos, 'full');
  cine.update(5);
  assert.equal(cine.getCameraOverride(playerPos).active, false);

  const map = buildMap('urban');
  const spawnPos = BossSpawnManager.findValidSpawnPoint(map, map.playerSpawn, 74, 'medium');
  assert.ok(Math.hypot(spawnPos.x - map.playerSpawn.x, spawnPos.y - map.playerSpawn.y) >= 500);
  const overlapping = map.obstacles.some((o) => {
    if (o.destroyed) return false;
    const cx = Math.max(o.x, Math.min(spawnPos.x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(spawnPos.y, o.y + o.h));
    return Math.hypot(spawnPos.x - cx, spawnPos.y - cy) < 40;
  });
  assert.equal(overlapping, false);

  const director = new BossEncounterDirector();
  const skReq = director.checkSkirmishSpawn(
    false,
    { ...DEFAULT_SKIRMISH_BOSS_CONFIG, variant: 'stormbringer' },
    map,
    map.playerSpawn
  );
  assert.ok(skReq && skReq.variantId === 'stormbringer');

  assert.equal(pickSurvivalBossForWave(3), null);
  assert.ok(['siege', 'stormbringer'].includes(pickSurvivalBossForWave(5)!.variantId));
  assert.ok(['fortress', 'blackout'].includes(pickSurvivalBossForWave(10)!.variantId));
  assert.equal(pickSurvivalBossForWave(15)!.variantId, 'cataclysm');
});

test('Camera shake OFF guarantees zero displacement across all categories while LOW/MEDIUM/HIGH scale cleanly', () => {
  const cam = new Camera();
  cam.snapTo(500, 500, 1);
  cam.setShakeLevel('off');

  const categories = ['recoil', 'explosion', 'artillery', 'ultimate', 'footstep', 'dash', 'grapple', 'flight'] as const;
  for (const cat of categories) {
    cam.addShake(1.0, cat);
  }
  cam.update(1 / 60, { x: 500, y: 500 }, { x: 0, y: 0 }, { x: 600, y: 500 }, 1.0);
  assert.equal(cam.trauma, 0);
  assert.equal(cam.shakeX, 0);
  assert.equal(cam.shakeY, 0);

  // Verify LOW produces strictly smaller displacement than HIGH
  cam.setShakeLevel('low');
  cam.addShake(0.8, 'explosion');
  cam.update(1 / 60, { x: 500, y: 500 }, { x: 0, y: 0 }, { x: 600, y: 500 }, 1.0);
  const lowMag = Math.hypot(cam.shakeX, cam.shakeY);

  const highCam = new Camera();
  highCam.snapTo(500, 500, 1);
  highCam.setShakeLevel('high');
  highCam.addShake(0.8, 'explosion');
  highCam.update(1 / 60, { x: 500, y: 500 }, { x: 0, y: 0 }, { x: 600, y: 500 }, 1.0);
  const highMag = Math.hypot(highCam.shakeX, highCam.shakeY);

  assert.ok(lowMag > 0, 'Expected non-zero shake on LOW');
  assert.ok(highMag > lowMag * 2.5, `Expected HIGH shake (${highMag}) > LOW shake (${lowMag})`);
});

test('DashController and AfterimagePool preserve momentum, record leg poses, and respect zero intensity', () => {
  const recon = createPlayableMech({
    id: 'p1',
    callsign: 'Test-1',
    isPlayer: true,
    classId: 'recon',
    x: 400,
    y: 400,
  });
  const pool = new AfterimagePool(48);
  const dash = new DashController('recon');

  assert.equal(dash.charges, 2);
  const ok = dash.trigger(recon.phys, 1, 0, 0);
  assert.equal(ok, true);
  assert.equal(dash.isDashing(), true);
  assert.equal(dash.charges, 1);
  assert.ok(recon.phys.vel.x > 300, 'Expected high directional dash velocity');

  for (let i = 0; i < 12; i++) {
    recon.phys.pos.x += recon.phys.vel.x * (1 / 60);
    recon.legs.update(
      1 / 60,
      recon.phys,
      {
        strideLength: recon.spec.strideLength,
        stepHeight: recon.spec.stepHeight,
        stepSpeed: recon.spec.stepSpeed,
        maxSpeed: recon.spec.maxSpeed,
        footstepWeight: recon.spec.footstepWeight,
      },
      recon.health,
      [],
      { dashing: true }
    );
    dash.update(1 / 60, recon.phys, pool, {
      altitude: 0,
      radius: recon.spec.radius,
      silhouette: recon.spec.silhouette,
      legs: recon.legs.legs,
      afterimageIntensity: 0.9,
      dashVfxEnabled: true,
    });
  }
  assert.equal(recon.legs.gaitState, 'dashing');
  const activeCount = pool.items.filter((a) => a.active).length;
  assert.ok(activeCount >= 2, `Expected multiple afterimages spawned, got ${activeCount}`);

  // When afterimageIntensity === 0, zero afterimages are spawned
  const poolZero = new AfterimagePool(48);
  const dashZero = new DashController('recon');
  dashZero.trigger(recon.phys, 0, 1, 0);
  for (let i = 0; i < 10; i++) {
    dashZero.update(1 / 60, recon.phys, poolZero, {
      altitude: 0,
      radius: recon.spec.radius,
      silhouette: recon.spec.silhouette,
      legs: recon.legs.legs,
      afterimageIntensity: 0,
      dashVfxEnabled: true,
    });
  }
  assert.equal(poolZero.items.filter((a) => a.active).length, 0);
});

test('GrappleTargetRegistry and GrappleController latch to buildings, apply swing/pull physics, and auto-detach on destroy', () => {
  const obstacles: Obstacle[] = [
    {
      id: 'crate_1',
      x: 700,
      y: 400,
      w: 28,
      h: 28,
      kind: 'crate',
      destructible: true,
      explosive: false,
      hp: 40,
      maxHp: 40,
      destroyed: false,
      height: 18,
      blocksLos: false,
    },
    {
      id: 'bldg_1',
      x: 760,
      y: 400,
      w: 110,
      h: 110,
      kind: 'building',
      destructible: true,
      explosive: false,
      hp: 400,
      maxHp: 400,
      destroyed: false,
      height: 64,
      blocksLos: true,
    },
  ];

  assert.equal(GrappleTargetRegistry.isObstacleGrappleable(obstacles[0]), false);
  assert.equal(GrappleTargetRegistry.isObstacleGrappleable(obstacles[1]), true);

  const grapple = new GrappleController();
  const phys = createPhysicsState(400, 400, 0);
  const fireRes = grapple.toggleFire(phys.pos, { x: 740, y: 400 }, obstacles);
  assert.equal(fireRes, 'fired');
  assert.equal(grapple.targetObstacleId, 'bldg_1');

  let latched = false;
  for (let i = 0; i < 25; i++) {
    const step = grapple.update(1 / 60, phys, 28, 0, 1, obstacles);
    if (step.justLatched) latched = true;
    phys.pos.x += phys.vel.x * (1 / 60);
    phys.pos.y += phys.vel.y * (1 / 60);
  }
  assert.equal(latched, true);
  assert.equal(grapple.state, 'attached');
  assert.ok(phys.vel.x > 40, 'Expected grapple pull velocity toward anchor');
  assert.ok(Math.abs(phys.vel.y) > 10, 'Expected tangential swing force from perpendicular wishY');

  // Anchor destruction causes immediate clean detach and opens Grapple-Dash synergy window
  obstacles[1].destroyed = true;
  grapple.update(1 / 60, phys, 28, 0, 0, obstacles);
  assert.notEqual(grapple.state, 'attached');
  assert.ok(grapple.releaseBoostWindow > 0);
});

test('A-12 Valkyrie flight physics handles takeoff, hover, overheat recovery, and landing impacts', () => {
  const valk = createPlayableMech({
    id: 'v1',
    callsign: 'Valkyrie-1',
    isPlayer: true,
    classId: 'valkyrie',
    x: 500,
    y: 500,
  });
  assert.ok(valk.flight);
  const fl = valk.flight!;
  assert.equal(fl.isAirborne, false);

  let tookOff = false;
  for (let i = 0; i < 50; i++) {
    const evt = stepFlightPhysics(
      valk.phys,
      fl,
      VALKYRIE_FLIGHT_CONFIG,
      { wishX: 1, wishY: 0, ascend: true, descend: false, boost: true },
      valk.health,
      'concrete',
      1 / 60
    );
    if (evt.justTookOff) tookOff = true;
  }
  assert.equal(tookOff, true);
  assert.equal(fl.isAirborne, true);
  assert.ok(fl.altitude > 20);
  assert.ok(valk.phys.vel.x > 120);
  assert.ok(fl.heat > 0);

  // Legs tuck cleanly when airborne
  valk.legs.update(
    1 / 60,
    valk.phys,
    {
      strideLength: valk.spec.strideLength,
      stepHeight: valk.spec.stepHeight,
      stepSpeed: valk.spec.stepSpeed,
      maxSpeed: valk.spec.maxSpeed,
      footstepWeight: valk.spec.footstepWeight,
    },
    valk.health,
    [],
    { airborne: true, altitude: fl.altitude }
  );
  assert.equal(valk.legs.gaitState, 'midair');

  // Descend until touchdown triggers landing impact
  let landed = false;
  for (let i = 0; i < 160; i++) {
    const evt = stepFlightPhysics(
      valk.phys,
      fl,
      VALKYRIE_FLIGHT_CONFIG,
      { wishX: 0, wishY: 0, ascend: false, descend: true, boost: false },
      valk.health,
      'concrete',
      1 / 60
    );
    if (evt.justLanded) {
      landed = true;
      break;
    }
  }
  assert.equal(landed, true);
  assert.equal(fl.isAirborne, false);
  assert.equal(fl.altitude, 0);
});

test('Rocket-powered flying enemies spawn airborne and step aerial AI/motion smoothly', () => {
  const map = buildMap('urban');
  const player = createPlayableMech({
    id: 'player',
    callsign: 'Wardog-1',
    isPlayer: true,
    classId: 'valkyrie',
    x: 600,
    y: 600,
  });

  const airWing = [
    createFlyingEnemy({ id: 'air_1', archetype: 'interceptor', x: 1100, y: 520 }),
    createFlyingEnemy({ id: 'air_2', archetype: 'rocket_hunter', x: 1200, y: 680 }),
    createFlyingEnemy({ id: 'air_3', archetype: 'sky_breaker', x: 1300, y: 800 }),
  ];

  for (const e of airWing) {
    assert.ok(e.flight?.isAirborne, `${e.enemyArchetype} should spawn airborne`);
    assert.ok(e.flight!.altitude > 50);
  }

  const tokens = { used: 0, max: 4 };
  for (let frame = 0; frame < 45; frame++) {
    tokens.used = 0;
    for (const e of airWing) {
      const ai = computeFlyingEnemyAI(e, [player], airWing, map, 1 / 60, tokens);
      stepFlyingEnemyMotion(e, ai, map, 1 / 60);
      assert.ok(Number.isFinite(e.phys.pos.x) && Number.isFinite(e.phys.pos.y));
      assert.ok(e.flight!.altitude > 10);
    }
  }
});

function createMockHudSnapshot(overrides: Partial<HudSnapshot> = {}): HudSnapshot {
  const health = createComponentHealth(100, 120, 80);
  return {
    screen: 'playing',
    mode: 'skirmish',
    unitId: 'standard',
    unitName: 'Vanguard',
    unitCode: 'MK-II',
    hp: 120,
    maxHp: 120,
    armor: 100,
    maxArmor: 100,
    components: health,
    speed: 0,
    maxSpeed: 160,
    stability: 100,
    braced: false,
    terrain: 'concrete',
    gaitState: 'IDLE',
    activeSlot: 1,
    primaryWeapon: { name: '35mm Autocannon', ammo: 24, maxAmmo: 24, reloading: false, reloadProgress: 1, chargeProgress: 0, prepProgress: 0 },
    secondaryWeapon: { name: 'Coaxial MG', ammo: 60, maxAmmo: 60, reloading: false, reloadProgress: 1 },
    specialAbility: { name: 'Stabilizer', active: false, activeRemaining: 0, cooldownRemaining: 0, cooldownTotal: 12 },
    squadOrder: 'follow',
    squadMembers: [],
    missionTitle: 'SKIRMISH',
    objectiveText: 'Eliminate hostiles',
    objectiveProgress: 0.4,
    enemiesRemaining: 4,
    wave: 1,
    elapsedSeconds: 10,
    kills: 2,
    damageDealt: 500,
    creditsEarned: 100,
    radioFeed: [],
    warningMessage: null,
    minimapVisible: true,
    tacticalOpen: false,
    squadWheelOpen: false,
    victory: false,
    endReason: '',
    trainingGodMode: false,
    trainingBossTuning: { healthMult: 1, speedMult: 1, aggression: 1 },
    boss: null,
    bossIntroActive: false,
    cinematicBanner: null,
    mortarHud: null,
    incomingWarnings: [],
    empDisruptTimer: 0,
    defendObjective: null,
    dashHud: { supported: true, active: false, ready: true, cooldownRemaining: 0, cooldownTotal: 2.2, charges: 1 },
    grappleHud: { supported: true, state: 'idle', hasValidTarget: false, targetDist: 0, cableLength: 0, tension: 0, cooldownRemaining: 0 },
    flightHud: null,
    missileLockWarning: false,
    airborneEnemiesCount: 0,
    minimapEntities: [],
    minimapObstacles: [],
    mapWidth: 2400,
    mapHeight: 1800,
    playerX: 1000,
    playerY: 1000,
    playerAimAngle: 0,
    ...overrides,
  };
}

test('Minimalist HUD context-sensitivity hides idle dash/grapple/flight/mortar/boss and reveals on activation', () => {
  const idleSnap = createMockHudSnapshot();
  const idleCtx = computeContextualHudState(idleSnap);
  assert.equal(idleCtx.showDash, false);
  assert.equal(idleCtx.showGrapple, false);
  assert.equal(idleCtx.showFlightFull, false);
  assert.equal(idleCtx.showMortar, false);
  assert.equal(idleCtx.showBoss, false);

  const activeSnap = createMockHudSnapshot({
    dashHud: { supported: true, active: true, ready: false, cooldownRemaining: 1.5, cooldownTotal: 2.2, charges: 0 },
    grappleHud: { supported: true, state: 'attached', hasValidTarget: true, targetDist: 210, cableLength: 195, tension: 0.72, cooldownRemaining: 0 },
    flightHud: { isFlyingMech: true, airborne: true, altitude: 85, maxAltitude: 150, verticalVel: 14, heat: 0.82, overheated: false, boosting: true, stability: 90 },
    mortarHud: { activeAmmo: 'he', minRange: 260, maxRange: 1350, travelTime: 1.8, scatterRadius: 42, inRange: true, targetX: 1500, targetY: 1000, barrageActive: false },
  });
  const activeCtx = computeContextualHudState(activeSnap);
  assert.equal(activeCtx.showDash, true);
  assert.equal(activeCtx.showGrapple, true);
  assert.equal(activeCtx.showFlightFull, true);
  assert.equal(activeCtx.showMortar, true);
});

test('Damage-responsive HUD detects sensor degradation, low hull flicker, disabled subsystems, and overheat', () => {
  const healthy = computeDamageResponsiveState(createMockHudSnapshot(), 1.2);
  assert.equal(healthy.sensorsDamaged, false);
  assert.equal(healthy.radarDegraded, false);
  assert.equal(healthy.hudFlickerOpacity, 1.0);
  assert.equal(healthy.disabledSubsystems.length, 0);

  const comp = createComponentHealth(100, 120, 80);
  comp.sensors = 2;
  comp.leftLegs = 5;
  const damagedSnap = createMockHudSnapshot({
    hp: 24,
    components: comp,
    empDisruptTimer: 1.5,
    flightHud: { isFlyingMech: true, airborne: true, altitude: 60, maxAltitude: 150, verticalVel: 0, heat: 1.0, overheated: true, boosting: false, stability: 65 },
  });
  const dmgState = computeDamageResponsiveState(damagedSnap, 2.5);
  assert.equal(dmgState.sensorsDamaged, true);
  assert.equal(dmgState.radarDegraded, true);
  assert.equal(dmgState.rangefinderLost, true);
  assert.equal(dmgState.lowHullCritical, true);
  assert.equal(dmgState.heatWarning, true);
  assert.ok(dmgState.disabledSubsystems.includes('L-LEG'));
  assert.ok(dmgState.disabledSubsystems.includes('SNS'));
});

test('Offscreen threat indicators and circular radar blips project & clamp accurately', () => {
  const enemy = createPlayableMech({ id: 'e1', callsign: 'Hostile', isPlayer: false, classId: 'recon', x: 2400, y: 1000 });
  enemy.team = 'enemy';
  enemy.detected = true;

  const threats = computeOffscreenThreats(1000, 1000, 1.0, 1280, 720, { x: 1000, y: 1000 }, [enemy], null, false);
  assert.equal(threats.length, 1);
  assert.ok(threats[0].screenX > 1200 && threats[0].screenX <= 1254);

  const blips = computeRadarBlips(
    createMockHudSnapshot({
      minimapEntities: [
        { x: 1300, y: 1000, team: 'enemy', detected: true },
        { x: 2800, y: 1000, team: 'boss', detected: true },
        { x: 1200, y: 1000, team: 'enemy', detected: false },
      ],
    }),
    1000
  );
  assert.equal(blips.length, 2);
  assert.equal(blips[1].clampedEdge, true);
});

test('All 96 CC0 real-world audio assets and 188 spoken voice MP3s exist on disk with valid manifest & spatial mixer', () => {
  assert.equal(ALL_AUDIO_ASSET_IDS.length, 96);
  for (const id of ALL_AUDIO_ASSET_IDS) {
    const meta = AUDIO_ASSET_MANIFEST[id];
    assert.ok(meta.license.includes('CC0'));
    assert.ok(meta.sourceUrl.startsWith('https://archive.org/'));
    const diskPath = path.join(process.cwd(), 'public', meta.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Missing audio asset on disk: ${diskPath}`);
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 1500, `Audio file too small: ${diskPath}`);
  }

  assert.equal(ALL_VOICE_LINES.length, 188);
  for (const line of ALL_VOICE_LINES) {
    const diskPath = path.join(process.cwd(), 'public', line.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Missing voice MP3 on disk: ${diskPath}`);
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 2000, `Voice file too small (${stat.size}B): ${diskPath}`);
    assert.ok(line.text.trim().length > 4, `Voice line text missing for ${line.id}`);
  }

  assert.equal(selectTerrainFootstepAsset('mud', 0.6), 'footstep_mud');
  assert.equal(selectTerrainFootstepAsset('water', 0.6), 'footstep_water');
  assert.equal(selectTerrainFootstepAsset('sand', 0.5), 'footstep_dirt');
  assert.equal(selectTerrainFootstepAsset('concrete', 0.95), 'footstep_heavy_mech');

  const farLeft = computeSpatialAudioParams(-900, 0, 1350, false, true);
  assert.ok(farLeft.pan < -0.8);
  assert.ok(farLeft.distanceScale > 0.25 && farLeft.distanceScale < 0.4);
  assert.ok(farLeft.delaySeconds > 0.1);

  const limiter = new VoiceLimiter();
  assert.equal(limiter.canPlay('autocannon', 50, 'weapons', 2, 1000), true);
  assert.equal(limiter.canPlay('autocannon', 50, 'weapons', 2, 1010), false); // cooldown blocks
  assert.equal(limiter.canPlay('mg', 50, 'weapons', 2, 1010), true);
  assert.equal(limiter.canPlay('railgun', 50, 'weapons', 2, 1020), false); // polyphony cap blocks
});

test('Missile profiles define 6 distinct speed, turn, damage, and HP curves', () => {
  assert.equal(ALL_MISSILE_TYPES.length, 6);
  const std = MISSILE_PROFILES.standard;
  const intc = MISSILE_PROFILES.interceptor;
  const hvy = MISSILE_PROFILES.heavy;
  const swm = MISSILE_PROFILES.swarm;
  const rng = MISSILE_PROFILES.long_range;
  const adv = MISSILE_PROFILES.advanced_tracking;

  assert.ok(intc.maxSpeed > std.maxSpeed && intc.acceleration > std.acceleration);
  assert.ok(hvy.damage > std.damage && hvy.missileHp > std.missileHp && hvy.maxSpeed < std.maxSpeed);
  assert.ok(swm.weaveAmplitude > 0 && swm.missileHp < std.missileHp);
  assert.ok(rng.maxTrackRange > std.maxTrackRange && rng.maxLifetime > std.maxLifetime);
  assert.ok(adv.leadFactor > std.leadFactor && adv.seekerConeRad > hvy.seekerConeRad);
});

test('Missiles accelerate rapidly after launch and overshoot sharp perpendicular dodges', () => {
  const pool = new ProjectilePool();
  const m = pool.spawn({
    team: 'enemy',
    ownerId: 'e1',
    kind: 'missile',
    missileType: 'interceptor',
    x: 400,
    y: 400,
    angle: 0,
    speed: 930,
    damage: 54,
    splashRadius: 48,
    range: 1180,
    piercing: false,
    caliber: 5,
    homingTurnRate: 4.45,
    targetId: 'player',
  });

  const initialSpeed = Math.hypot(m.vx, m.vy);
  assert.ok(initialSpeed <= 340, 'Starts at booster launch velocity');

  // Target performs rapid high-speed perpendicular dash across missile nose
  const target = { id: 'player', x: 520, y: 400, vx: 0, vy: 520, altitude: 0, alive: true };
  for (let i = 0; i < 45; i++) {
    m.life += 1 / 60;
    target.y += target.vy * (1 / 60);
    stepMissileProjectile(m, target, [], [], 1 / 60);
    m.x += m.vx * (1 / 60);
    m.y += m.vy * (1 / 60);
  }

  const cruiseSpeed = Math.hypot(m.vx, m.vy);
  assert.ok(cruiseSpeed > 800, `Expected rapid acceleration > 800, got ${cruiseSpeed}`);
  const distAfterPass = Math.hypot(m.x - target.x, m.y - target.y);
  assert.ok(distAfterPass > 65, `High-speed perpendicular dodge should avoid direct impact, got dist=${distAfterPass}`);
});

test('Smoke clouds and solid building cover break missile lock and force forward coasting', () => {
  const profile = MISSILE_PROFILES.standard;
  const target = { id: 'player', x: 700, y: 400, vx: 0, vy: 0, altitude: 0, alive: true };

  // Smoke cloud between missile (300,400) and target (700,400)
  const smokeRes = computeMissileGuidance(
    {
      x: 300,
      y: 400,
      vx: 500,
      vy: 0,
      life: 0.4,
      missileAlt: 10,
      trackingLost: false,
      lastKnownX: 700,
      lastKnownY: 400,
      swarmSeed: 0,
    },
    profile,
    target,
    [],
    [
      { id: 's1', x: 500, y: 400, radius: 90, life: 5, maxLife: 8 },
    ]
  );
  assert.equal(smokeRes.trackingLost, true);
  assert.equal(smokeRes.desiredAngle, null);

  // Solid building obstacle blocks LOS
  const building: import('./types').Obstacle = {
    id: 'b1',
    x: 500,
    y: 400,
    w: 80,
    h: 120,
    kind: 'building',
    destructible: false,
    explosive: false,
    hp: 999,
    maxHp: 999,
    destroyed: false,
    height: 75,
    blocksLos: true,
  };
  assert.equal(isSolidMissileCover(building), true);
  const coverRes = computeMissileGuidance(
    {
      x: 300,
      y: 400,
      vx: 500,
      vy: 0,
      life: 0.4,
      missileAlt: 10,
      trackingLost: false,
      lastKnownX: 700,
      lastKnownY: 400,
      swarmSeed: 0,
    },
    profile,
    target,
    [building],
    []
  );
  assert.equal(coverRes.trackingLost, true);
});

test('Universal Anti-Air system is installed on all 9 playable units, enemies, flyers, and boss variants', () => {
  for (const mSpec of MECH_LIST) {
    const actor = createPlayableMech({
      id: `p_${mSpec.id}`,
      callsign: mSpec.code,
      isPlayer: true,
      classId: mSpec.id,
      x: 500,
      y: 500,
    });
    assert.ok(actor.antiAir instanceof AntiAirController, `Missing AA on ${mSpec.id}`);
    assert.ok(actor.antiAir.spec.range >= 320);
  }

  for (const arch of ['scout', 'assault', 'sniper', 'heavy', 'swarm', 'hunter'] as const) {
    const e = createEnemyMech({ id: `e_${arch}`, archetype: arch, x: 500, y: 500 });
    assert.ok(e.antiAir instanceof AntiAirController, `Missing AA on ground enemy ${arch}`);
  }

  for (const fArch of ['interceptor', 'rocket_hunter', 'sky_breaker'] as const) {
    const f = createFlyingEnemy({ id: `f_${fArch}`, archetype: fArch, x: 500, y: 500 });
    assert.ok(f.antiAir instanceof AntiAirController, `Missing AA on flying enemy ${fArch}`);
    assert.equal(f.antiAir.spec.arcHalfRad, Math.PI, 'Aerial units should have 360-degree AA coverage');
  }

  for (const bv of BOSS_VARIANT_LIST) {
    const boss = new ThunderheadBoss(bv.id, 1200, 1000);
    assert.ok(boss.antiAir instanceof AntiAirController, `Missing AA on boss ${bv.id}`);
  }
});

test('Anti-Air gun enforces rear blind arcs, point-blank deadzone, slew delay, and heat/overheat lockout', () => {
  const pool = new ProjectilePool();
  const threats = new CombatThreatManager();

  // Heavy ground unit has limited arc (cannot engage missile behind it at PI radians)
  const heavyAA = AntiAirController.forMechClass('heavy', undefined, 0);
  pool.spawn({
    team: 'enemy',
    ownerId: 'e1',
    kind: 'missile',
    missileType: 'standard',
    x: 350, // strictly behind unit at (500, 500) facing 0 rad
    y: 500,
    angle: 0,
    speed: 690,
    damage: 74,
    splashRadius: 72,
    range: 1000,
    piercing: false,
    caliber: 6,
    targetId: 'player',
  });
  threats.collect(pool.items);

  const rearRes = heavyAA.update(0.05, {
    ownerId: 'player',
    team: 'player',
    x: 500,
    y: 500,
    altitude: 0,
    bodyAngle: 0,
    radius: 24,
    jammedTimer: 0,
    subsystemHealth: 1,
    threats: threats.getThreatsForTeam('player'),
    obstacles: [],
    smokeClouds: [],
    rng: () => 0.2,
  });
  assert.equal(rearRes.trackingCount, 0, 'Ground AA must have a rear blind spot');

  // Point-blank deadzone check (< minEngageDist)
  pool.clear();
  pool.spawn({
    team: 'enemy',
    ownerId: 'e1',
    kind: 'missile',
    missileType: 'standard',
    x: 520,
    y: 500,
    angle: Math.PI,
    speed: 690,
    damage: 74,
    splashRadius: 72,
    range: 1000,
    piercing: false,
    caliber: 6,
    targetId: 'player',
  });
  threats.collect(pool.items);
  const deadzoneRes = heavyAA.update(0.05, {
    ownerId: 'player',
    team: 'player',
    x: 500,
    y: 500,
    altitude: 0,
    bodyAngle: 0,
    radius: 24,
    jammedTimer: 0,
    subsystemHealth: 1,
    threats: threats.getThreatsForTeam('player'),
    obstacles: [],
    smokeClouds: [],
    rng: () => 0.2,
  });
  assert.equal(deadzoneRes.trackingCount, 0, 'Point-blank missile inside minEngageDist cannot be intercepted');

  // Sustained frontal engagement builds heat -> triggers overheat lockout -> cools & recovers
  pool.clear();
  const toughMissile = pool.spawn({
    team: 'enemy',
    ownerId: 'e1',
    kind: 'missile',
    missileType: 'heavy',
    x: 780,
    y: 500,
    angle: Math.PI,
    speed: 515,
    damage: 132,
    splashRadius: 108,
    range: 1120,
    piercing: false,
    caliber: 8,
    targetId: 'player',
  });
  toughMissile.missileHp = 9999; // Keep alive to force overheat
  threats.collect(pool.items);

  let triggeredOverheat = false;
  for (let i = 0; i < 240; i++) {
    const r = heavyAA.update(0.05, {
      ownerId: 'player',
      team: 'player',
      x: 500,
      y: 500,
      altitude: 0,
      bodyAngle: 0,
      radius: 24,
      jammedTimer: 0,
      subsystemHealth: 1,
      threats: threats.getThreatsForTeam('player'),
      obstacles: [],
      smokeClouds: [],
      rng: () => 0.2,
    });
    if (r.overheatedJustNow) {
      triggeredOverheat = true;
      break;
    }
  }
  assert.equal(triggeredOverheat, true, 'Sustained AA fire must trigger barrel overheat');
  assert.equal(heavyAA.overheated, true);

  // While overheated, AA refuses to fire even on clear frontal threat
  const lockedRes = heavyAA.update(0.05, {
    ownerId: 'player',
    team: 'player',
    x: 500,
    y: 500,
    altitude: 0,
    bodyAngle: 0,
    radius: 24,
    jammedTimer: 0,
    subsystemHealth: 1,
    threats: threats.getThreatsForTeam('player'),
    obstacles: [],
    smokeClouds: [],
    rng: () => 0.2,
  });
  assert.equal(lockedRes.fired, false);

  // Cool down without threats to recover below lockout threshold
  for (let i = 0; i < 120; i++) {
    heavyAA.update(0.05, {
      ownerId: 'player',
      team: 'player',
      x: 500,
      y: 500,
      altitude: 0,
      bodyAngle: 0,
      radius: 24,
      jammedTimer: 0,
      subsystemHealth: 1,
      threats: [],
      obstacles: [],
      smokeClouds: [],
    });
  }
  assert.equal(heavyAA.overheated, false, 'AA should exit overheat after cooling below recovery threshold');
});

test('Swarm saturation & sensor/weapon damage degrade AA reliability and never grant 100% immunity', () => {
  assert.equal(ANTI_AIR_UPGRADES.length, 9);

  // Even fully maxed-out upgrades strictly cap hit chance below 86%
  const maxedCustom: import('./types').MechLoadoutCustomization = {
    paintId: 'spearhead',
    weaponVariant: 'standard',
    armorPackage: 'standard',
    supportModule: 'none',
    upgrades: {
      aa_targeting: 3,
      aa_servos: 3,
      aa_rapid_fire: 3,
      aa_ammo: 3,
      aa_detection: 3,
      aa_cooling: 3,
      aa_multitarget: 3,
      aa_reinforced: 3,
      aa_intercept_ai: 3,
    },
  };

  for (const mSpec of MECH_LIST) {
    const eff = computeEffectiveAntiAirSpec(mapMechClassToAntiAirKey(mSpec.id), maxedCustom);
    assert.ok(eff.maxHitChanceCap <= 0.86 && eff.baseAccuracy <= 0.86);
    const bestCaseHit = computeAntiAirHitChance({
      spec: eff,
      missileSpeed: 500,
      missileType: 'standard',
      angularErrorRad: 0,
      nearbyThreatsCount: 1,
      subsystemHealthFactor: 1,
      distance: 280,
    });
    assert.ok(bestCaseHit < 0.87, `Maxed AA for ${mSpec.id} exceeded safety cap: ${bestCaseHit}`);

    const swarmSaturatedHit = computeAntiAirHitChance({
      spec: eff,
      missileSpeed: 760,
      missileType: 'swarm',
      angularErrorRad: 0.12,
      nearbyThreatsCount: 6,
      subsystemHealthFactor: 0.4,
      distance: 150,
    });
    assert.ok(swarmSaturatedHit < bestCaseHit, 'Swarm saturation & damage must reduce hit chance');
  }

  // Boss subsystem damage degrades Boss AA readiness
  const boss = new ThunderheadBoss('siege', 1000, 1000);
  const fullSub = boss.getAntiAirSubsystemHealth();
  boss.components.auxWeapons.destroyed = true;
  boss.components.auxWeapons.hp = 0;
  boss.components.sensors.destroyed = true;
  boss.components.sensors.hp = 0;
  const crippledSub = boss.getAntiAirSubsystemHealth();
  assert.ok(crippledSub < fullSub * 0.4, 'Destroyed boss sensors & aux weapons must cripple AA');
});

test('Heavy enemy secondary weapon increments attackTokens.used', () => {
  const map = { ...buildMap('urban'), obstacles: [] };
  const nav = new NavGrid(map);
  const heavy = createEnemyMech({ id: 'h1', archetype: 'heavy', x: 700, y: 700 });
  const player = createPlayableMech({ id: 'player', callsign: 'P1', isPlayer: true, classId: 'standard', x: 900, y: 700 });
  heavy.phys.aimAngle = 0;
  heavy.primary.cooldown = 5; // Force primary on cooldown so secondary fires
  const tokens = { used: 0, max: 3 };
  const out = computeEnemyAI(heavy, [player], [heavy], map, nav, 0.016, tokens);
  assert.equal(out.fireSecondary, true);
  assert.equal(tokens.used, 1, 'Heavy secondary fire must consume an attack token');
});

test('Buffed Anti-Air delivers >= 75% base intercept accuracy and rotary minigun fire rate across all classes', () => {
  for (const mSpec of MECH_LIST) {
    const eff = computeEffectiveAntiAirSpec(mapMechClassToAntiAirKey(mSpec.id));
    assert.ok(eff.baseAccuracy >= 0.75, `${mSpec.id} AA baseAccuracy must be >= 0.75, got ${eff.baseAccuracy}`);
    assert.ok(eff.fireRate >= 20, `${mSpec.id} AA minigun fireRate must be >= 20 rps, got ${eff.fireRate}`);
    assert.ok(eff.interceptorRange >= 900, `${mSpec.id} must have long-range counter-interceptor envelope`);

    const typicalHit = computeAntiAirHitChance({
      spec: eff,
      missileSpeed: 640,
      missileType: 'standard',
      angularErrorRad: 0.01,
      nearbyThreatsCount: 1,
      subsystemHealthFactor: 1,
      distance: 320,
    });
    assert.ok(typicalHit >= 0.72 && typicalHit <= 0.86, `Expected ~75% effective AA hit chance, got ${typicalHit}`);
  }
});

test('Long-range incoming missiles trigger defensive counter-interceptor missiles that destroy threats mid-air', () => {
  const pool = new ProjectilePool();
  const threats = new CombatThreatManager();
  const aa = AntiAirController.forMechClass('standard', undefined, 0);

  // Incoming long-range cruise missile at 780m heading directly toward player at (500, 500)
  const incoming = pool.spawn({
    team: 'enemy',
    ownerId: 'enemy_artillery',
    kind: 'missile',
    missileType: 'long_range',
    x: 1280,
    y: 500,
    angle: Math.PI,
    speed: 745,
    damage: 92,
    splashRadius: 82,
    range: 1750,
    piercing: false,
    caliber: 7,
    targetId: 'player',
  });

  threats.collect(pool.items);
  const stepRes = aa.update(0.05, {
    ownerId: 'player',
    team: 'player',
    x: 500,
    y: 500,
    altitude: 0,
    bodyAngle: 0,
    radius: 22,
    jammedTimer: 0,
    subsystemHealth: 1,
    threats: threats.getThreatsForTeam('player'),
    obstacles: [],
    smokeClouds: [],
    alreadyTargetedByInterceptor: threats.targetedByInterceptor,
  });

  assert.ok(stepRes.launchInterceptor !== null, 'AA battery must launch a counter-interceptor at long-range incoming missile');
  assert.equal(stepRes.launchInterceptor.targetProjectile, incoming);

  // Spawn the counter-interceptor and verify CombatThreatManager excludes it from offensive threats
  const li = stepRes.launchInterceptor;
  const counter = pool.spawn({
    team: 'player',
    ownerId: 'player',
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
    isCounterInterceptor: true,
    interceptTarget: incoming,
    interceptReliability: li.reliability,
  });

  threats.collect(pool.items);
  assert.equal(threats.hostileToEnemy.length, 0, 'Counter-interceptor must not be listed as an offensive threat');
  assert.equal(threats.targetedByInterceptor.has(incoming), true, 'Incoming missile must be marked as already targeted');

  // Step flight simulation until mid-air proximity detonation
  let intercepted = false;
  for (let i = 0; i < 120; i++) {
    const dt = 0.016;
    incoming.prevX = incoming.x;
    incoming.prevY = incoming.y;
    incoming.x += incoming.vx * dt;
    incoming.y += incoming.vy * dt;
    counter.prevX = counter.x;
    counter.prevY = counter.y;
    counter.x += counter.vx * dt;
    counter.y += counter.vy * dt;
    counter.life += dt;
    const res = stepCounterInterceptorProjectile(counter, dt, pool.items, () => 0.25);
    if (res.interceptedTarget === incoming) {
      intercepted = true;
      break;
    }
  }

  assert.equal(intercepted, true, 'Counter-interceptor must pursue and destroy incoming long-range missile in mid-air');
  assert.equal(incoming.active, false);
  assert.equal(counter.active, false);
});

test('MechBootSequence progresses through 4 stages, unlocks controls early, and stabilizes cleanly with zero flicker', () => {
  const boot = new MechBootSequence();
  const s1 = boot.start('colossus', false);
  assert.equal(s1.stage, 1);
  assert.equal(boot.active, true);
  assert.equal(boot.isControlsUnlocked(), false);

  const triggeredStages: number[] = [s1.stage];
  let unlockedAtSec = -1;
  const dt = 0.05;
  for (let i = 0; i < 60; i++) {
    const trig = boot.update(dt);
    if (trig) triggeredStages.push(trig.stage);
    if (unlockedAtSec < 0 && boot.isControlsUnlocked()) {
      unlockedAtSec = boot.elapsed;
    }
  }

  assert.deepEqual(triggeredStages, [1, 2, 3, 4], 'All 4 boot stages must trigger exactly once in order');
  assert.ok(unlockedAtSec > 1.0 && unlockedAtSec < 1.4, `Controls should unlock early around 48% (~1.22s), got ${unlockedAtSec}`);
  assert.equal(boot.active, false, 'Boot sequence must deactivate after duration completes');

  const finalSnap = boot.getHudSnapshot();
  assert.equal(finalSnap.active, false);
  assert.equal(finalSnap.screenDimAlpha, 0);
  assert.equal(finalSnap.scanlineAlpha, 0);
  assert.equal(finalSnap.flickerJitterX, 0);
  assert.equal(finalSnap.hudOpacity, 1);
  assert.equal(finalSnap.controlsUnlocked, true);

  // Abbreviated boot for chassis switching completes faster (~1.45s)
  const abbrev = boot.start('recon', true);
  assert.equal(abbrev.abbreviated, true);
  assert.ok(boot.duration < 1.6);
});

test('RadioCommunicationManager enforces priority preemption, cooldowns, anti-repeat, and distinct ally damage vs death flow', () => {
  const playedIds: string[] = [];
  let stopCount = 0;
  const manager = new RadioCommunicationManager(
    {
      playVoiceLine: (line) => {
        playedIds.push(line.id);
      },
      stopVoiceLine: () => {
        stopCount++;
      },
    },
    () => 0
  );

  // Low-priority squad reaction starts playing
  const lowTx = manager.trigger('squad_reaction');
  assert.ok(lowTx !== null);
  assert.equal(lowTx.priority, 1);

  // Duplicate squad reaction immediately blocked by cooldown
  assert.equal(manager.trigger('squad_reaction'), null);

  // High-priority missile warning preempts low-priority chatter cleanly
  const highTx = manager.trigger('missile_warning');
  assert.ok(highTx !== null);
  assert.ok(highTx.priority >= 4, `Expected missile warning priority >= 4, got ${highTx.priority}`);
  assert.equal(stopCount, 1, 'Higher priority transmission must cleanly stop active lower-priority audio');
  assert.equal(manager.active?.lineId, highTx.lineId);

  // Advance past missile warning duration & cooldown, then verify anti-repeat picks a different line
  for (let i = 0; i < 100; i++) manager.update(0.1);
  const secondMissileTx = manager.trigger('missile_warning');
  assert.ok(secondMissileTx !== null);
  assert.notEqual(secondMissileTx.lineId, highTx.lineId, 'Anti-repeat must select a different variation');

  // Clear active transmission and test ally health lifecycle: critical -> near-death -> final -> delayed confirmed destruction
  for (let i = 0; i < 60; i++) manager.update(0.1);
  manager.evaluateAllyUnitHealth('ally_1', 'VANGUARD-3', 0.35, true, 'pilot_bravo');
  assert.ok(manager.active?.lineId.startsWith('ally_crit_'), '<=42% HP must trigger ally_critical, not death');

  for (let i = 0; i < 60; i++) manager.update(0.1);
  manager.evaluateAllyUnitHealth('ally_1', 'VANGUARD-3', 0.12, true, 'pilot_bravo');
  assert.ok(manager.active?.lineId.startsWith('ally_near_'), '<=18% HP must trigger ally_near_death');

  // Ally dies: triggers final distress immediately, then confirmed ally_destroyed after respectful silence delay
  manager.evaluateAllyUnitHealth('ally_1', 'VANGUARD-3', 0, false, 'pilot_bravo');
  assert.ok(manager.active?.lineId.startsWith('ally_final_'), 'Death must trigger final distress transmission');

  let sawDestroyedConfirm = false;
  for (let i = 0; i < 60; i++) {
    manager.update(0.1);
    if (manager.active?.lineId.startsWith('ally_lost_')) {
      sawDestroyedConfirm = true;
      break;
    }
  }
  assert.equal(sawDestroyedConfirm, true, 'Confirmed ally destruction reaction must play after brief silence gap');
  assert.ok(playedIds.length >= 6);
});

test('4-Unit SquadController assigns distinct assault/support/recon roles and applies anti-stacking separation', () => {
  const map = buildMap('urban');
  const nav = new NavGrid(map);
  const player = createPlayableMech({ id: 'player', callsign: 'WARDOG-1', isPlayer: true, classId: 'standard', x: 600, y: 600 });
  const a1 = createPlayableMech({ id: 'ally_1', callsign: 'VANGUARD-2', isPlayer: false, classId: 'standard', x: 605, y: 605 });
  a1.squadRole = 'assault';
  a1.formationSlot = 0;
  const a2 = createPlayableMech({ id: 'ally_2', callsign: 'AEGIS-3', isPlayer: false, classId: 'engineer', x: 606, y: 606 });
  a2.squadRole = 'support';
  a2.formationSlot = 1;
  const a3 = createPlayableMech({ id: 'ally_3', callsign: 'SPECTRE-4', isPlayer: false, classId: 'sniper', x: 607, y: 607 });
  a3.squadRole = 'recon';
  a3.formationSlot = 2;

  const ctrl = new SquadController();
  const cmd1 = ctrl.computeAllyAI(a1, player, [a1, a2, a3], [], map, nav, 0.05);
  const cmd2 = ctrl.computeAllyAI(a2, player, [a1, a2, a3], [], map, nav, 0.05);
  const cmd3 = ctrl.computeAllyAI(a3, player, [a1, a2, a3], [], map, nav, 0.05);

  assert.ok(Math.hypot(cmd1.wishX, cmd1.wishY) > 0.1, 'Assault squadmate must move out of stacked overlap');
  assert.ok(Math.hypot(cmd2.wishX, cmd2.wishY) > 0.1, 'Support squadmate must move out of stacked overlap');
  assert.ok(Math.hypot(cmd3.wishX, cmd3.wishY) > 0.1, 'Recon squadmate must move out of stacked overlap');
});

test('High-speed Thunderhead Boss overhaul increases mobility across all 5 variants while keeping variant hierarchy', () => {
  for (const bv of BOSS_VARIANT_LIST) {
    assert.ok(bv.maxSpeed >= 95, `${bv.id} maxSpeed should be significantly faster (>=95), got ${bv.maxSpeed}`);
    assert.ok(bv.acceleration >= 165, `${bv.id} acceleration should be >=165, got ${bv.acceleration}`);
    assert.ok(bv.stepSpeed >= 3.2, `${bv.id} leg stepSpeed should be >=3.2, got ${bv.stepSpeed}`);
  }
  const fastest = Math.max(...BOSS_VARIANT_LIST.map((b) => b.maxSpeed));
  assert.ok(fastest > BOSS_VARIANTS.siege.maxSpeed, 'Faster Thunderhead variants must remain faster than Siege');
});

test('MatchPerformanceTracker & VictoryCinematicManager award AI MVP/Best Teammate and enforce single-trigger & skip', () => {
  const tracker = new MatchPerformanceTracker();
  tracker.registerUnit({ unitId: 'player', callsign: 'WARDOG-1', unitName: 'Vanguard', classId: 'standard', role: 'commander', isPlayer: true });
  tracker.registerUnit({ unitId: 'ally_1', callsign: 'VANGUARD-2', unitName: 'Vanguard', classId: 'standard', role: 'assault', isPlayer: false });
  tracker.registerUnit({ unitId: 'ally_2', callsign: 'AEGIS-3', unitName: 'Bastion', classId: 'engineer', role: 'support', isPlayer: false });
  tracker.registerUnit({ unitId: 'ally_3', callsign: 'SPECTRE-4', unitName: 'Longbow', classId: 'sniper', role: 'recon', isPlayer: false });

  // AI assault dominates kills & damage; AI support dominates repairs & saves
  tracker.recordDamageDealt('ally_1', 'e1', 900, true, 10);
  tracker.recordElimination('ally_1', 'e1', 10, false);
  tracker.recordElimination('ally_1', 'e2', 11, false);
  tracker.recordElimination('ally_1', 'e3', 12, false);
  tracker.recordRepair('ally_2', 240);
  tracker.recordElimination('ally_2', 'e4', 13, true);
  tracker.recordDamageDealt('player', 'e5', 220, false, 14);
  tracker.recordElimination('player', 'e5', 14, false);

  const { mvp, bestTeammate, awards } = tracker.computeAwards();
  assert.ok(mvp !== null && mvp.callsign === 'VANGUARD-2' && mvp.isPlayer === false, 'AI squadmate must be eligible to win MVP');
  assert.ok(bestTeammate !== null && bestTeammate.callsign === 'AEGIS-3', 'Support AI should win Best Teammate');
  assert.ok(awards.some((a) => a.id === 'boss_hunter' && a.callsign === 'VANGUARD-2'));

  const cin = new VictoryCinematicManager();
  const first = cin.trigger({
    squadCenter: { x: 800, y: 800 },
    bossWreckPos: { x: 1000, y: 800 },
    tracker,
    creditsEarned: 450,
    missionTitle: 'MISSION 01',
    elapsedMatchSeconds: 95,
  });
  const second = cin.trigger({
    squadCenter: { x: 800, y: 800 },
    bossWreckPos: null,
    tracker,
    creditsEarned: 450,
    missionTitle: 'MISSION 01',
    elapsedMatchSeconds: 95,
  });
  assert.equal(first, true);
  assert.equal(second, false, 'Victory cinematic must only trigger once per round');
  assert.equal(cin.phase, 'settle');

  cin.skipToAwards();
  assert.equal(cin.phase, 'awards');
  const snap = cin.getSnapshot();
  assert.ok(snap !== null && snap.phase === 'awards' && snap.mvp?.callsign === 'VANGUARD-2');
});

test('FailedRunTracker & Revenant system enforce mode-specific isolation, corrupted stat scaling, and single spawn', () => {
  let save: import('./types').SaveData = {
    credits: 1000,
    unlockedUnits: ['standard', 'heavy', 'valkyrie'],
    selectedUnit: 'heavy',
    completedMissions: [],
    highestSurvivalWave: 0,
    customLoadouts: {},
    failedModeUnits: {},
    settings: {} as import('./types').SettingsData,
  };

  // Failing skirmish with 'heavy' only sets Revenant for 'skirmish'
  save = FailedRunTracker.recordFailure(save, 'skirmish', 'heavy');
  assert.equal(FailedRunTracker.getPendingRevenantClass(save, 'skirmish'), 'heavy');
  assert.equal(FailedRunTracker.getPendingRevenantClass(save, 'campaign'), null, 'Revenant must never bleed across game modes');
  assert.equal(FailedRunTracker.getPendingRevenantClass(save, 'survival'), null);

  // Failing skirmish again with 'valkyrie' updates skirmish Revenant to 'valkyrie'
  save = FailedRunTracker.recordFailure(save, 'skirmish', 'valkyrie');
  assert.equal(FailedRunTracker.getPendingRevenantClass(save, 'skirmish'), 'valkyrie');

  // Revenant variant is white-and-purple, corrupted, and strictly stronger than base mech class
  const baseHeavy = createPlayableMech({ id: 'base_h', callsign: 'BASE', isPlayer: false, classId: 'heavy', x: 500, y: 500 });
  const revHeavy = RevenantVariantFactory.createRevenant({ sourceClassId: 'heavy', x: 1000, y: 1000 });
  assert.equal(revHeavy.isRevenant, true);
  assert.equal(revHeavy.team, 'enemy');
  assert.equal(revHeavy.revenantSourceClass, 'heavy');
  assert.ok(revHeavy.health.maxChassis > baseHeavy.health.maxChassis * 1.8, 'Revenant hull must be significantly stronger');
  assert.ok(revHeavy.stats.maxSpeed > baseHeavy.stats.maxSpeed * 1.25, 'Revenant must be faster than base unit');
  assert.ok(revHeavy.primary.spec.damage > baseHeavy.primary.spec.damage * 1.25, 'Revenant weapons must deal more damage');

  // RevenantManager schedules once, fires warning -> spawns exactly once
  const mgr = new RevenantManager();
  mgr.scheduleIfEligible('heavy', 8.0);
  let warned = false;
  let spawnedClass: import('./types').MechClassId | null = null;
  let elapsed = 0;
  for (let i = 0; i < 120; i++) {
    elapsed += 0.1;
    const res = mgr.update(0.1, elapsed);
    if (res.startInterference) warned = true;
    if (res.shouldSpawnNow) spawnedClass = res.sourceClassId;
  }
  assert.equal(warned, true);
  assert.equal(spawnedClass, 'heavy');
  assert.equal(mgr.state.spawned, true);

  // Subsequent updates never spawn a second Revenant
  const afterRes = mgr.update(1.0, elapsed + 1.0);
  assert.equal(afterRes.shouldSpawnNow, false);

  // Clearing mode on victory removes Revenant for that mode
  save = FailedRunTracker.clearModeFailure(save, 'skirmish');
  assert.equal(FailedRunTracker.getPendingRevenantClass(save, 'skirmish'), null);
});

test('Suspenseful CC0 music overhaul: all 13 normalized tracks exist on disk, cover all music states, and enforce safe volume cap', () => {
  assert.equal(ALL_MUSIC_TRACK_IDS.length, 13);

  const publicRoot = path.resolve(process.cwd(), 'public');
  for (const id of ALL_MUSIC_TRACK_IDS) {
    const entry = MUSIC_TRACK_MANIFEST[id];
    assert.ok(entry, `Missing music manifest entry for ${id}`);
    assert.ok(entry.url.startsWith('/assets/audio/music/'), `Music track ${id} must be stored locally`);
    const diskPath = path.join(publicRoot, entry.url.replace(/^\//, ''));
    assert.equal(fs.existsSync(diskPath), true, `Missing music asset on disk: ${diskPath}`);
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 100_000, `Music asset ${id} is unexpectedly small (${stat.size} bytes)`);
    assert.ok(entry.baseGain > 0 && entry.baseGain <= 1.0, `Track ${id} baseGain out of safe bounds (${entry.baseGain})`);
  }

  const allStates: MusicState[] = [
    'menu',
    'exploration',
    'suspense',
    'combat',
    'heavy_combat',
    'boss',
    'revenant',
    'victory',
    'defeat',
  ];
  for (const state of allStates) {
    const mapped = mapMusicStateToTrack(state);
    assert.ok(MUSIC_TRACK_MANIFEST[mapped], `MusicState ${state} must map to a valid track`);
  }
});

test('Extreme-speed procedural leg animation stress test: all 5 Thunderhead bosses stay within IK bounds across idle, sprint, turns, and multi-boss', () => {
  const dt = 1 / 60;
  for (const variant of BOSS_VARIANT_LIST) {
    const phys = createPhysicsState(1000, 1000, 0);
    const anim = new BossLegAnimator(variant.legs, { x: 1000, y: 1000 }, 0);
    const baseCfg = {
      strideLength: variant.strideLength,
      stepHeight: variant.stepHeight,
      stepSpeed: variant.stepSpeed,
      footstepWeight: 1.4,
      posture: 'heavy_idle' as const,
      leftLegRatio: 1,
      rightLegRatio: 1,
      destroying: false,
      destroyProgress: 0,
    };

    // 1. Standing still (0.5s)
    for (let i = 0; i < 30; i++) {
      anim.update(dt, phys, baseCfg, []);
    }

    // 2. Slow walk (1.5s) -> count steps
    let slowSteps = 0;
    for (let i = 0; i < 90; i++) {
      phys.vel.x = Math.cos(phys.bodyAngle) * 45;
      phys.vel.y = Math.sin(phys.bodyAngle) * 45;
      phys.angularVel = 0;
      phys.pos.x += phys.vel.x * dt;
      phys.pos.y += phys.vel.y * dt;
      slowSteps += anim.update(dt, phys, baseCfg, []).length;
    }

    // 3. Extreme high-speed sprint + sudden 90 deg and 180 deg turns + dashing (3.0s)
    let fastSteps = 0;
    for (let i = 0; i < 180; i++) {
      let speed = variant.maxSpeed * 2.2;
      let angVel = 0;
      if (i >= 45 && i < 75) {
        angVel = Math.PI * 1.1;
      } else if (i >= 95 && i < 125) {
        angVel = -Math.PI * 1.6;
      } else if (i >= 130 && i < 150) {
        speed = variant.maxSpeed * 3.4;
      }
      phys.angularVel = angVel;
      phys.bodyAngle += angVel * dt;
      phys.vel.x = Math.cos(phys.bodyAngle) * speed;
      phys.vel.y = Math.sin(phys.bodyAngle) * speed;
      phys.pos.x += phys.vel.x * dt;
      phys.pos.y += phys.vel.y * dt;
      fastSteps += anim.update(dt, phys, baseCfg, []).length;

      for (const leg of anim.legs) {
        assert.ok(Number.isFinite(leg.hipPos.x) && Number.isFinite(leg.hipPos.y), `${variant.id} hip NaN`);
        assert.ok(Number.isFinite(leg.kneePos.x) && Number.isFinite(leg.kneePos.y), `${variant.id} knee NaN`);
        assert.ok(Number.isFinite(leg.footPos.x) && Number.isFinite(leg.footPos.y), `${variant.id} foot NaN`);
        const maxPhysicalReach = (leg.spec.femurLength + leg.spec.tibiaLength) * 1.02;
        const dist = Math.hypot(leg.footPos.x - leg.hipPos.x, leg.footPos.y - leg.hipPos.y);
        assert.ok(
          dist <= maxPhysicalReach,
          `${variant.id} leg ${leg.spec.id} over-stretched: ${dist.toFixed(1)} > ${maxPhysicalReach.toFixed(1)}`
        );
      }
    }

    assert.ok(
      fastSteps > slowSteps,
      `${variant.id} must step faster at extreme speed (${fastSteps}) than slow walk (${slowSteps})`
    );

    // 4. Sudden stop -> gait settles cleanly
    phys.vel.x = 0;
    phys.vel.y = 0;
    phys.angularVel = 0;
    for (let i = 0; i < 60; i++) {
      anim.update(dt, phys, baseCfg, []);
    }
    for (const leg of anim.legs) {
      assert.ok(Number.isFinite(leg.footPos.x) && Number.isFinite(leg.footPos.y));
    }
  }
});

test('Extreme-buffed Revenants: all 9 classes receive massive stat buffs, unique corrupted abilities, and rock-solid extreme-speed leg IK', () => {
  const dt = 1 / 60;
  const abilityNames = new Set<string>();

  for (const m of MECH_LIST) {
    const profile = getRevenantProfileForClass(m.id);
    assert.ok(profile.speedMult >= 1.85, `${m.id} Revenant speedMult too low: ${profile.speedMult}`);
    assert.ok(profile.accelMult >= 2.25, `${m.id} Revenant accelMult too low: ${profile.accelMult}`);
    assert.ok(profile.damageMult >= 1.7, `${m.id} Revenant damageMult too low: ${profile.damageMult}`);
    assert.ok(profile.hullMult >= 2.8, `${m.id} Revenant hullMult too low: ${profile.hullMult}`);
    assert.ok(profile.damageResist >= 0.2, `${m.id} Revenant damageResist too low`);
    abilityNames.add(profile.corruptedAbilityName);

    const base = createPlayableMech({ id: `b_${m.id}`, callsign: 'BASE', isPlayer: false, classId: m.id, x: 500, y: 500 });
    const rev = RevenantVariantFactory.createRevenant({ sourceClassId: m.id, x: 900, y: 900 });
    assert.equal(rev.isRevenant, true);
    assert.ok(rev.stats.maxSpeed >= base.stats.maxSpeed * 1.8, `${m.id} Revenant maxSpeed must be >= 1.8x base`);
    assert.ok(rev.health.maxChassis >= base.health.maxChassis * 2.75, `${m.id} Revenant hull must be >= 2.75x base`);
    assert.ok(rev.primary.spec.damage >= base.primary.spec.damage * 1.65, `${m.id} Revenant primary damage must be >= 1.65x base`);

    for (let i = 0; i < 150; i++) {
      const speed = i >= 80 && i < 105 ? rev.stats.maxSpeed * 1.9 : rev.stats.maxSpeed;
      const angVel = i >= 50 && i < 80 ? Math.PI * 2.2 : 0;
      rev.phys.angularVel = angVel;
      rev.phys.bodyAngle += angVel * dt;
      rev.phys.vel.x = Math.cos(rev.phys.bodyAngle) * speed;
      rev.phys.vel.y = Math.sin(rev.phys.bodyAngle) * speed;
      rev.phys.pos.x += rev.phys.vel.x * dt;
      rev.phys.pos.y += rev.phys.vel.y * dt;
      rev.legs.update(
        dt,
        rev.phys,
        {
          strideLength: m.strideLength,
          stepHeight: m.stepHeight,
          stepSpeed: m.stepSpeed * 1.85,
          maxSpeed: rev.stats.maxSpeed,
          footstepWeight: m.footstepWeight,
        },
        rev.health,
        [],
        { dashing: i >= 80 && i < 105 }
      );
      for (const leg of rev.legs.legs) {
        assert.ok(Number.isFinite(leg.footPos.x) && Number.isFinite(leg.footPos.y), `Revenant ${m.id} leg NaN`);
        const maxReach = (leg.spec.femurLength + leg.spec.tibiaLength) * 1.05;
        const dist = Math.hypot(leg.footPos.x - leg.hipPos.x, leg.footPos.y - leg.hipPos.y);
        assert.ok(dist <= maxReach, `Revenant ${m.id} leg stretched: ${dist.toFixed(1)} > ${maxReach.toFixed(1)}`);
      }
    }
  }

  assert.equal(abilityNames.size, 12, 'All 12 Revenant classes must have distinct corrupted surge abilities');
});

test('Sandbox Mode registry dynamically covers all 6 categories and stays isolated from normal campaign/failed-run progression', () => {
  const registry = buildSandboxRegistry();
  const byCat = (cat: string) => registry.filter((e) => e.category === cat);

  assert.equal(byCat('player_units').length, MECH_LIST.length);
  assert.equal(byCat('friendly_units').length, MECH_LIST.length);
  assert.ok(byCat('hostile_units').length >= 5, 'Sandbox must include all standard hostile ground units');
  assert.ok(byCat('elite_units').length >= 4, 'Sandbox must include elite hunters and airborne wings');
  assert.equal(byCat('bosses').length, BOSS_VARIANT_LIST.length, 'Sandbox must include all 5 bosses');
  assert.equal(byCat('revenants').length, MECH_LIST.length, 'Sandbox must include all 10 Revenant variants');

  let save: import('./types').SaveData = {
    credits: 500,
    unlockedUnits: ['standard'],
    selectedUnit: 'standard',
    completedMissions: [],
    highestSurvivalWave: 0,
    customLoadouts: {},
    failedModeUnits: {},
    settings: {} as import('./types').SettingsData,
  };
  save = FailedRunTracker.recordFailure(save, 'training', 'colossus');
  assert.equal(FailedRunTracker.getPendingRevenantClass(save, 'training'), null);
  assert.deepEqual(save.failedModeUnits, {});
});

test('PS-08 Phase Strider reuses DashController for collision-safe teleportation and strict active-frame damage immunity', () => {
  const phantom = createPlayableMech({
    id: 'player_phantom',
    callsign: 'PHANTOM-1',
    isPlayer: true,
    classId: 'phantom',
    x: 500,
    y: 500,
  });
  const afterimages = new AfterimagePool();
  const dash = phantom.dash;
  assert.ok(dash, 'Phantom must have DashController');

  // Solid building directly ahead along +X at x=620 (width 80 -> left edge x=580)
  const wall: Obstacle = {
    id: 'wall_1',
    x: 620,
    y: 500,
    w: 80,
    h: 160,
    kind: 'building',
    destructible: false,
    explosive: false,
    hp: 999,
    maxHp: 999,
    destroyed: false,
    height: 80,
    blocksLos: true,
  };

  assert.equal(dash.spec.teleportMode, true);
  assert.equal(dash.spec.invulnerableDuringDash, true);
  assert.equal(dash.isInvulnerableDuringDash(), false);

  // Trigger teleport dash toward the solid wall (+X)
  const triggered = dash.trigger(
    phantom.phys,
    1,
    0,
    0,
    { obstacles: [wall], mapWidth: 2400, mapHeight: 2400, radius: phantom.spec.radius }
  );
  assert.equal(triggered, true);
  assert.equal(dash.isInvulnerableDuringDash(), true, 'Must be strictly invulnerable during active teleport frames');
  assert.equal(
    checkUnitDamageImmunity({
      trainingGodMode: false,
      dashInvulnerable: dash.isInvulnerableDuringDash(),
      aegisArmorActive: false,
    }),
    'teleport_dash'
  );
  // Must stop cleanly BEFORE the solid wall (x < 580 - radius) and never pass through or get stuck inside
  assert.ok(
    phantom.phys.pos.x > 510 && phantom.phys.pos.x <= 580 - phantom.spec.radius + 1,
    `Expected safe clamp before wall, got x=${phantom.phys.pos.x}`
  );
  assert.ok(dash.teleportOrigin !== null && dash.teleportDest !== null);
  assert.ok(dash.teleportVisualTimer > 0);

  // Step through the dash duration until it finishes
  for (let i = 0; i < 30; i++) {
    dash.update(0.016, phantom.phys, afterimages, {
      altitude: 0,
      radius: phantom.spec.radius,
      silhouette: phantom.spec.silhouette,
      legs: phantom.legs.legs,
      afterimageIntensity: 1,
      dashVfxEnabled: true,
    });
  }
  assert.equal(dash.isDashing(), false);
  assert.equal(dash.isInvulnerableDuringDash(), false, 'Damage immunity must end immediately once dash finishes');
  assert.equal(
    checkUnitDamageImmunity({
      trainingGodMode: false,
      dashInvulnerable: dash.isInvulnerableDuringDash(),
      aegisArmorActive: false,
    }),
    'none'
  );

  // Diagonal teleport in open space (-X, -Y)
  const diagStartX = phantom.phys.pos.x;
  const diagStartY = phantom.phys.pos.y;
  const diagOk = dash.trigger(
    phantom.phys,
    -1,
    -1,
    0,
    { obstacles: [wall], mapWidth: 2400, mapHeight: 2400, radius: phantom.spec.radius }
  );
  assert.equal(diagOk, true);
  assert.ok(
    phantom.phys.pos.x < diagStartX - 100 && phantom.phys.pos.y < diagStartY - 100,
    'Diagonal teleport must displace along both axes'
  );
});

test('Aegis Phase-Armor grants infinite-HP 30-second independent protection across all 5 squadmates with silhouette-matched armor profiles', () => {
  const squad = [
    createPlayableMech({ id: 'player', callsign: 'PHANTOM-1', isPlayer: true, classId: 'phantom', x: 500, y: 500 }),
    createPlayableMech({ id: 'ally_1', callsign: 'VANGUARD-2', isPlayer: false, classId: 'heavy', x: 600, y: 500 }),
    createPlayableMech({ id: 'ally_2', callsign: 'AEGIS-3', isPlayer: false, classId: 'engineer', x: 650, y: 550 }),
    createPlayableMech({ id: 'ally_3', callsign: 'SPECTRE-4', isPlayer: false, classId: 'sniper', x: 700, y: 500 }),
    createPlayableMech({ id: 'ally_4', callsign: 'VALKYRIE-5', isPlayer: false, classId: 'valkyrie', x: 750, y: 550 }),
  ];

  // Mark one unit downed to ensure only active standing friendlies receive Aegis
  squad[4].alive = false;
  squad[4].downed = true;
  const shieldedCount = activateAegisArmorForSquad(squad);
  assert.equal(shieldedCount, 4);
  assert.equal(isAegisArmorActive(squad[4]), false, 'Downed unit should not receive active Aegis');

  for (let i = 0; i < 4; i++) {
    assert.equal(isAegisArmorActive(squad[i]), true);
    assert.equal(squad[i].aegisArmor?.remaining, AEGIS_ARMOR_DURATION);
    assert.equal(
      checkUnitDamageImmunity({
        trainingGodMode: false,
        dashInvulnerable: false,
        aegisArmorActive: isAegisArmorActive(squad[i]),
      }),
      'aegis_armor'
    );
  }

  // Repeated heavy hits trigger deflect flash without reducing HP or duration (Infinite HP)
  for (let hit = 0; hit < 25; hit++) {
    triggerAegisDeflectFlash(squad[0]);
  }
  assert.equal(squad[0].aegisArmor?.remaining, AEGIS_ARMOR_DURATION);

  // Step 29.5s: still active
  for (let s = 0; s < 59; s++) {
    for (const u of squad) stepAegisArmor(u, 0.5);
  }
  assert.equal(isAegisArmorActive(squad[0]), true);

  // Step another 1.0s (past 30.0s): expires cleanly
  for (let s = 0; s < 2; s++) {
    for (const u of squad) stepAegisArmor(u, 0.5);
  }
  assert.equal(isAegisArmorActive(squad[0]), false);
  assert.equal(squad[0].aegisArmor?.remaining, 0);

  // Every mech silhouette has an adaptive visual armor profile (distinct shapes, not uniform bubbles)
  const styles = new Set(MECH_LIST.map((m) => getAegisVisualProfile(m.silhouette).style));
  assert.ok(styles.size >= 8, 'Adaptive Aegis armor must tailor geometry across mech silhouettes');
});

test('5-Unit SquadController supports Search & Sweep, Full Assault distributed targeting, and rapid order switching', () => {
  const map = buildMap('urban');
  const nav = new NavGrid(map);
  const player = createPlayableMech({ id: 'player', callsign: 'WARDOG-1', isPlayer: true, classId: 'standard', x: 600, y: 600 });
  const allies = [
    createPlayableMech({ id: 'ally_1', callsign: 'VANGUARD-2', isPlayer: false, classId: 'heavy', x: 605, y: 605 }),
    createPlayableMech({ id: 'ally_2', callsign: 'AEGIS-3', isPlayer: false, classId: 'engineer', x: 606, y: 606 }),
    createPlayableMech({ id: 'ally_3', callsign: 'SPECTRE-4', isPlayer: false, classId: 'sniper', x: 607, y: 607 }),
    createPlayableMech({ id: 'ally_4', callsign: 'PHANTOM-5', isPlayer: false, classId: 'phantom', x: 608, y: 608 }),
  ];
  allies.forEach((a, idx) => {
    a.formationSlot = idx;
  });

  const ctrl = new SquadController();
  ctrl.issueOrder('search', allies, player, { x: 600, y: 600 }, []);

  // With no enemies nearby, all 4 AI squadmates pick distinct search waypoints and move out
  const waypoints: Array<{ x: number; y: number }> = [];
  for (const a of allies) {
    const out = ctrl.computeAllyAI(a, player, allies, [], map, nav, 0.05);
    assert.ok(Math.hypot(out.wishX, out.wishY) > 0.1, `${a.callsign} must actively roam under Search order`);
    assert.ok(a.searchWaypoint, `${a.callsign} should establish a sector search waypoint`);
    waypoints.push(a.searchWaypoint);
  }
  const spreadDist = Math.hypot(waypoints[0].x - waypoints[2].x, waypoints[0].y - waypoints[2].y);
  assert.ok(spreadDist > 120, 'Search order should partition squadmates across distinct sectors');

  // Switch to Full Assault with multiple distant enemies -> squadmates pursue independently beyond player tether
  const e1 = createEnemyMech({ id: 'e1', archetype: 'assault', x: 1650, y: 650 });
  const e2 = createEnemyMech({ id: 'e2', archetype: 'heavy', x: 1700, y: 950 });
  const e3 = createEnemyMech({ id: 'e3', archetype: 'scout', x: 1550, y: 1200 });
  const enemies = [e1, e2, e3];
  ctrl.issueOrder('full_assault', allies, player, { x: 1650, y: 900 }, enemies);

  const claimedTargets = new Set<string>();
  for (const a of allies) {
    const out = ctrl.computeAllyAI(a, player, allies, enemies, map, nav, 0.05);
    assert.ok(out.statusText.toUpperCase().includes('ASSAULT') || out.targetEnemyId !== null, `Expected Full Assault engagement, got ${out.statusText}`);
    if (out.targetEnemyId) {
      a.targetId = out.targetEnemyId;
      claimedTargets.add(out.targetEnemyId);
    }
  }
  assert.ok(claimedTargets.size >= 2, 'Full Assault should distribute 5-unit squad fire across multiple hostiles');

  // Rapid order switching (follow -> search -> full_assault -> follow) never leaves units stuck
  for (const ord of ['follow', 'search', 'full_assault', 'follow'] as const) {
    ctrl.issueOrder(ord, allies, player, { x: 800, y: 800 }, enemies);
    for (const a of allies) {
      const out = ctrl.computeAllyAI(a, player, allies, enemies, map, nav, 0.05);
      assert.ok(Number.isFinite(out.wishX) && Number.isFinite(out.wishY));
    }
  }
});

test('Coordinated Revive System restricts revival strictly to Engineer units, prevents duplicate assignment, and hands over on unreachable timeout', () => {
  // Audit verification: ONLY engineer is revive-capable
  assert.deepEqual(REVIVE_CAPABLE_CLASSES, ['engineer']);
  for (const m of MECH_LIST) {
    const unit = createPlayableMech({ id: `u_${m.id}`, callsign: m.code, isPlayer: false, classId: m.id, x: 400, y: 400 });
    assert.equal(canMechRevive(unit), m.id === 'engineer', `${m.id} revive capability mismatch`);
  }

  const engNear = createPlayableMech({ id: 'eng_1', callsign: 'AEGIS-3', isPlayer: false, classId: 'engineer', x: 540, y: 500 });
  const engFar = createPlayableMech({ id: 'eng_2', callsign: 'AEGIS-5', isPlayer: false, classId: 'engineer', x: 920, y: 500 });
  const downedAlly = createPlayableMech({ id: 'ally_1', callsign: 'VANGUARD-2', isPlayer: false, classId: 'heavy', x: 500, y: 500 });
  const livingAlly = createPlayableMech({ id: 'ally_4', callsign: 'SPECTRE-4', isPlayer: false, classId: 'sniper', x: 600, y: 500 });
  const enemy = createEnemyMech({ id: 'enemy_1', archetype: 'assault', x: 510, y: 510 });

  downedAlly.alive = false;
  downedAlly.downed = true;
  downedAlly.health.chassis = 0;

  assert.equal(isEligibleForRevive(downedAlly), true);
  assert.equal(isEligibleForRevive(livingAlly), false);
  assert.equal(isEligibleForRevive(enemy), false);

  // Two Engineers present, one downed ally -> only the closest Engineer is assigned
  const map1 = assignReviveTargets([engNear, engFar, downedAlly, livingAlly]);
  assert.equal(map1.size, 1, 'Only one Engineer should be assigned to a single downed ally');
  assert.equal(map1.get('eng_1'), 'ally_1');
  assert.equal(engFar.reviveTargetId, null);

  // If engNear fails to reach downedAlly (unreachable timeout), engFar takes over cleanly
  engNear.lastFailedReviveTargetId = 'ally_1';
  engNear.reviveTargetId = null;
  const map2 = assignReviveTargets([engNear, engFar, downedAlly, livingAlly]);
  assert.equal(map2.get('eng_2'), 'ally_1', 'Second Engineer must take over when first Engineer cannot reach downed ally');

  // Complete revive restores downed ally to standing combat readiness
  completeSquadmateRevive(engFar, downedAlly);
  assert.equal(downedAlly.downed, false);
  assert.equal(downedAlly.alive, true);
  assert.ok(downedAlly.health.chassis > 0 && downedAlly.health.armor > 0);
  assert.equal(engFar.reviveTargetId, null);
});

test('AS-09 Kurokage Stalker Optical Cloak suppresses footsteps, conceals from radar/AI at range, and reveals cleanly on fire or intrusion', async () => {
  const {
    createStealthState,
    toggleStealth,
    stepStealthState,
    getStealthNoiseMultiplier,
    canDetectUnit,
    revealStealth,
  } = await import('./stealthSystem');

  const kurokage = createPlayableMech({
    id: 'p_assn',
    callsign: 'KUROKAGE-1',
    isPlayer: true,
    classId: 'assassin',
    x: 400,
    y: 400,
  });
  assert.ok(kurokage.stealth && kurokage.stealth.supported);

  const farObserver = createEnemyMech({ id: 'obs_far', archetype: 'assault', x: 900, y: 400 });
  const closeObserver = createEnemyMech({ id: 'obs_close', archetype: 'scout', x: 460, y: 400 });

  assert.equal(toggleStealth(kurokage.stealth), 'activated');
  stepStealthState(kurokage.stealth, 0.25, { isEnemy: false });
  assert.ok(kurokage.stealth!.cloakAlpha < 0.7 && kurokage.stealth!.cloakAlpha > 0.15, 'Cloak alpha must fade smoothly');
  assert.equal(getStealthNoiseMultiplier(kurokage.stealth), 0.06, 'Cloak must silence footsteps');

  assert.equal(canDetectUnit(farObserver, kurokage, []), false, 'Far enemy cannot detect cloaked assassin');
  assert.equal(canDetectUnit(closeObserver, kurokage, []), true, 'Point-blank intrusion detects cloaked assassin');

  revealStealth(kurokage.stealth, 1.0);
  assert.equal(canDetectUnit(farObserver, kurokage, []), true, 'Firing weapon reveals cloaked assassin briefly');

  // Verify standalone stealth creation also works cleanly
  const uncloaked = createStealthState(false);
  assert.equal(toggleStealth(uncloaked), 'unavailable');
});

test('22 choreographed takedown variations produce distinct smooth cubic-eased poses and collision-safe rear teleports', async () => {
  const { TAKEDOWN_VARIATIONS, evaluateTakedownPose } = await import('./takedownVariations');
  const { findSafeRearTeleportPos } = await import('./takedownSystem');

  assert.equal(TAKEDOWN_VARIATIONS.length, 22, 'Must implement all 22 distinct takedown choreographies');
  const ids = new Set(TAKEDOWN_VARIATIONS.map((v) => v.id));
  const names = new Set(TAKEDOWN_VARIATIONS.map((v) => v.name));
  assert.equal(ids.size, 22);
  assert.equal(names.size, 22);

  for (const v of TAKEDOWN_VARIATIONS) {
    assert.ok(v.keyframes.length >= 4, `${v.id} needs >= 4 keyframes`);
    let prev = evaluateTakedownPose(v, 0, 20);
    for (let step = 1; step <= 20; step++) {
      const t = step / 20;
      const cur = evaluateTakedownPose(v, t, 20);
      assert.ok(Number.isFinite(cur.attackerOffset.x) && Number.isFinite(cur.defenderOffset.y));
      const jump = Math.hypot(cur.attackerOffset.x - prev.attackerOffset.x, cur.attackerOffset.y - prev.attackerOffset.y);
      assert.ok(jump < 45, `${v.id} had abrupt teleport jump (${jump.toFixed(1)}) at t=${t}`);
      prev = cur;
    }
  }

  // Target backing against a solid concrete building -> rear teleport MUST NOT place assassin inside wall
  const wall: Obstacle = {
    id: 'rear_wall',
    x: 420,
    y: 500,
    w: 90,
    h: 220,
    kind: 'building',
    destructible: false,
    explosive: false,
    hp: 999,
    maxHp: 999,
    destroyed: false,
    height: 80,
    blocksLos: true,
  };
  const safe = findSafeRearTeleportPos({
    targetPos: { x: 495, y: 500 },
    targetBodyAngle: 0, // facing +X, so direct rear is inside rear_wall at x~445
    targetRadius: 20,
    attackerRadius: 17,
    obstacles: [wall],
    mapWidth: 2400,
    mapHeight: 1800,
  });
  const insideWall =
    Math.abs(safe.pos.x - wall.x) < wall.w * 0.5 + 17 &&
    Math.abs(safe.pos.y - wall.y) < wall.h * 0.5 + 17;
  assert.equal(insideWall, false, 'Safe rear teleport must never place assassin inside a solid obstacle');
});

test('TakedownManager enforces interactive slash-dodging (2-10s interval), flat 50% AI execution rate, concurrency, 1st-person POV ambush, and boss non-OHKO sabotage', async () => {
  const {
    TakedownManager,
    evaluateTimingJudgment,
    evaluateSlashDodge,
    sampleSlashInterval,
    SLASH_INTERVAL_MIN,
    SLASH_INTERVAL_MAX,
    FAST_SLASH_INTERVAL_MIN,
    FAST_SLASH_INTERVAL_MAX,
    BOSS_AMBUSH_DAMAGE_BASE,
  } = await import('./takedownSystem');

  // Legacy timing judgment helper accuracy
  assert.equal(evaluateTimingJudgment(0.5, [0.44, 0.56], [0.3, 0.7]), 'PERFECT');
  assert.equal(evaluateTimingJudgment(0.35, [0.44, 0.56], [0.3, 0.7]), 'GOOD');
  assert.equal(evaluateTimingJudgment(0.12, [0.44, 0.56], [0.3, 0.7]), 'MISS');

  // 2-10 second slash interval bounds across 500 samples
  let intervalRngState = 42;
  const intervalRng = () => {
    intervalRngState = (intervalRngState * 1664525 + 1013904223) >>> 0;
    return intervalRngState / 4294967296;
  };
  let minObserved = Infinity;
  let maxObserved = -Infinity;
  for (let i = 0; i < 500; i++) {
    const iv = sampleSlashInterval(intervalRng);
    assert.ok(
      iv >= SLASH_INTERVAL_MIN && iv <= SLASH_INTERVAL_MAX,
      `Slash interval ${iv} out of [${SLASH_INTERVAL_MIN}, ${SLASH_INTERVAL_MAX}]`
    );
    if (iv < minObserved) minObserved = iv;
    if (iv > maxObserved) maxObserved = iv;
  }
  assert.ok(minObserved < 2.5 && maxObserved > 8.5, 'Slash intervals must span the 2-10s distribution');

  // Small-bar dodge overlap / razor-edge PERFECT / safe GOOD evaluation
  assert.equal(evaluateSlashDodge(0.5, 0.042, 0.52, 0.14).hit, true);
  assert.equal(evaluateSlashDodge(0.5, 0.042, 0.52, 0.14).judgment, 'MISS');
  assert.equal(evaluateSlashDodge(0.72, 0.042, 0.5, 0.14).hit, false);
  assert.equal(evaluateSlashDodge(0.72, 0.042, 0.5, 0.14).judgment, 'PERFECT');
  assert.equal(evaluateSlashDodge(0.88, 0.042, 0.5, 0.14).hit, false);
  assert.equal(evaluateSlashDodge(0.88, 0.042, 0.5, 0.14).judgment, 'GOOD');

  // Interactive slash-dodging cycle: choreography -> minigame -> telegraph -> strike -> recover -> interval -> executed
  const dodgeMgr = new TakedownManager(() => 0.45);
  const pAssn = createPlayableMech({ id: 'player', callsign: 'KURO-1', isPlayer: true, classId: 'assassin', x: 500, y: 500 });
  const targetE = createEnemyMech({ id: 'e_dodge', archetype: 'assault', x: 640, y: 500 });
  const dodgeStart = dodgeMgr.startMechTakedown({
    attacker: pAssn,
    target: targetE,
    obstacles: [],
    mapWidth: 2400,
    mapHeight: 1800,
    variant: 'blade_sweep',
  });
  assert.ok(dodgeStart);
  const dodgeActors = new Map([[pAssn.id, pAssn], [targetE.id, targetE]]);

  let sawTelegraph = false;
  let sawStrike = false;
  let sawRecoverInterval = false;
  let executedViaDodge = false;
  for (let stepIdx = 0; stepIdx < 450; stepIdx++) {
    const evs = dodgeMgr.step(0.05, dodgeActors, null);
    const activeSess = dodgeMgr.getPlayerMinigameSession();
    if (evs.some((e) => e.type === 'slash_telegraph')) sawTelegraph = true;
    if (evs.some((e) => e.type === 'slash_strike')) sawStrike = true;

    // Actively steer cursor away from incoming slash danger zone during telegraph
    if (activeSess?.minigame.slash?.phase === 'telegraph') {
      const zc = activeSess.minigame.slash.zoneCenter;
      const safeTarget = zc > 0.5 ? 0.12 : 0.88;
      dodgeMgr.setPlayerDodgeInput(0, safeTarget);
      if (Math.abs(activeSess.minigame.cursor - zc) < activeSess.minigame.slash.zoneHalfWidth + 0.06) {
        dodgeMgr.triggerPlayerDodgeDash(zc > 0.5 ? -1 : 1);
      }
    }
    if (activeSess && !activeSess.minigame.slash && activeSess.minigame.stage > 1) {
      assert.ok(
        activeSess.minigame.nextSlashDuration >= FAST_SLASH_INTERVAL_MIN &&
          activeSess.minigame.nextSlashDuration <= FAST_SLASH_INTERVAL_MAX,
        `Next slash interval duration must fall in [${FAST_SLASH_INTERVAL_MIN}, ${FAST_SLASH_INTERVAL_MAX}]s, got ${activeSess.minigame.nextSlashDuration}`
      );
      assert.ok(activeSess.minigame.nextSlashTimer <= activeSess.minigame.nextSlashDuration);
      sawRecoverInterval = true;
    }
    if (evs.some((e) => e.type === 'executed')) {
      executedViaDodge = true;
      break;
    }
  }
  assert.equal(sawTelegraph, true, 'Must emit slash_telegraph');
  assert.equal(sawStrike, true, 'Must emit slash_strike');
  assert.equal(sawRecoverInterval, true, 'Must schedule fast interval between slashes');
  assert.equal(executedViaDodge, true, 'Dodging required stages must execute target');

  // Taking direct slash hits fills instability and causes escape
  const hitMgr = new TakedownManager(() => 0.5);
  const p2 = createPlayableMech({ id: 'player', callsign: 'KURO-1', isPlayer: true, classId: 'assassin', x: 500, y: 500 });
  const t2 = createEnemyMech({ id: 'e_hit', archetype: 'heavy', x: 640, y: 500 });
  hitMgr.startMechTakedown({ attacker: p2, target: t2, obstacles: [], mapWidth: 2400, mapHeight: 1800 });
  const hitActors = new Map([[p2.id, p2], [t2.id, t2]]);
  let escapedFromHits = false;
  for (let stepIdx = 0; stepIdx < 450; stepIdx++) {
    const s = hitMgr.getPlayerMinigameSession();
    if (s?.minigame.slash) {
      // Intentionally steer INTO the slash zone to verify hit instability buildup
      hitMgr.setPlayerDodgeInput(0, s.minigame.slash.zoneCenter);
    }
    const evs = hitMgr.step(0.05, hitActors, null);
    if (evs.some((e) => e.type === 'escaped')) {
      escapedFromHits = true;
      break;
    }
  }
  assert.equal(escapedFromHits, true, 'Standing inside repeated piercing slashes must trigger escape/breach');

  // Strict Flat 50% AI takedown success rate verification across 1,000 deterministic trials
  let rngState = 1337;
  const detRng = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };
  const statMgr = new TakedownManager(detRng);
  let executedCount = 0;
  let escapedCount = 0;
  const TRIALS = 1000;
  for (let i = 0; i < TRIALS; i++) {
    const allyA = createPlayableMech({ id: `ai_a_${i}`, callsign: 'AI-A', isPlayer: false, classId: 'assassin', x: 500, y: 500 });
    const enemyT = createEnemyMech({ id: `ai_t_${i}`, archetype: 'assault', x: 640, y: 500 });
    const started = statMgr.startMechTakedown({ attacker: allyA, target: enemyT, obstacles: [], mapWidth: 2400, mapHeight: 1800 });
    assert.ok(started);
    const actors = new Map([[allyA.id, allyA], [enemyT.id, enemyT]]);
    for (let f = 0; f < 220; f++) {
      const evs = statMgr.step(0.05, actors, null);
      if (evs.some((e) => e.type === 'executed')) {
        executedCount++;
        break;
      }
      if (evs.some((e) => e.type === 'escaped')) {
        escapedCount++;
        break;
      }
    }
    statMgr.clear();
  }
  assert.equal(executedCount + escapedCount, TRIALS);
  const winRate = executedCount / TRIALS;
  assert.ok(winRate >= 0.44 && winRate <= 0.56, `Expected strictly flat ~50% AI rate, got ${(winRate * 100).toFixed(1)}%`);

  // Concurrent independent AI takedown sessions + First-Person POV player ambush + mid-takedown death interruption
  const mgr = new TakedownManager(() => 0.1);
  const player = createPlayableMech({ id: 'player', callsign: 'Wardog-1', isPlayer: true, classId: 'standard', x: 700, y: 700 });
  const kuroEnemy = createEnemyMech({ id: 'e_assn', archetype: 'assassin', x: 760, y: 700 });
  const allyAssn = createPlayableMech({ id: 'ally_0', callsign: 'Kuro-2', isPlayer: false, classId: 'assassin', x: 1100, y: 700 });
  const enemy2 = createEnemyMech({ id: 'e_2', archetype: 'scout', x: 1180, y: 700 });

  const s1 = mgr.startMechTakedown({ attacker: kuroEnemy, target: player, obstacles: [], mapWidth: 2400, mapHeight: 1800 });
  const s2 = mgr.startMechTakedown({ attacker: allyAssn, target: enemy2, obstacles: [], mapWidth: 2400, mapHeight: 1800 });
  assert.ok(s1 && s2, 'Multiple independent takedown sessions must run concurrently');
  assert.equal(s1!.session.isPlayerVictim, true);
  assert.equal(s1!.session.minigame.mode, 'first_person_escape');
  assert.ok(mgr.getFirstPersonVictimSession() !== null);

  // Killing the ambushing enemy assassin mid-takedown MUST immediately interrupt and free the player!
  kuroEnemy.alive = false;
  const actorMap = new Map([
    [player.id, player],
    [kuroEnemy.id, kuroEnemy],
    [allyAssn.id, allyAssn],
    [enemy2.id, enemy2],
  ]);
  const interruptEvs = mgr.step(0.016, actorMap, null);
  assert.ok(interruptEvs.some((e) => e.type === 'interrupted' && e.isPlayerVictim));
  assert.equal(mgr.isUnitLocked(player.id), false, 'Player control must cleanly restore when ambusher dies');
  assert.equal(mgr.isUnitLocked(allyAssn.id), true, 'Other concurrent AI takedown must continue undisturbed');

  // Boss non-instant-kill weakpoint sabotage verification
  mgr.clear();
  const boss = new ThunderheadBoss('siege', 1600, 900, 1.0);
  const playerAssn = createPlayableMech({ id: 'p_kuro', callsign: 'Wardog-1', isPlayer: true, classId: 'assassin', x: 1420, y: 900 });
  const bStart = mgr.startBossAmbushTakedown({ attacker: playerAssn, boss, obstacles: [], mapWidth: 2400, mapHeight: 1800 });
  assert.ok(bStart && bStart.session.isBossTarget);
  assert.ok(boss.hull > BOSS_AMBUSH_DAMAGE_BASE * 2, 'Boss must survive Phantom Execution as high-damage sabotage rather than instant kill');
});

test('Guaranteed Random Revenant spawns across every game mode, varies on reset, avoids duplicates, and respects obstacles', () => {
  const eligible = getEligibleRevenantClasses();
  assert.equal(eligible.length, MECH_LIST.length, 'Every complete mech class in MECH_LIST must be eligible as a Revenant variant');

  const modes = ['campaign', 'skirmish', 'survival', 'training', 'freeroam', 'boss_challenge'] as const;
  let lastPicked: string | null = null;
  for (let i = 0; i < modes.length; i++) {
    const picked = resolveGuaranteedRevenantClass(null, lastPicked as never, () => (i * 0.19 + 0.07) % 1);
    assert.ok(eligible.includes(picked), `Mode ${modes[i]} must resolve a valid eligible Revenant class`);
    if (lastPicked) {
      assert.notEqual(picked, lastPicked, 'Consecutive random resets should rotate variants instead of repeating');
    }
    lastPicked = picked;
  }

  // Pending failed-run variant still takes precedence when present
  const fromFailure = resolveGuaranteedRevenantClass('colossus', 'standard', () => 0.5);
  assert.equal(fromFailure, 'colossus');

  // Single guaranteed entrance per session in RevenantManager
  const mgr = new RevenantManager();
  assert.equal(mgr.scheduleIfEligible(pickRandomRevenantClass('colossus', () => 0.35), 4.5), true);
  let triggers = 0;
  for (let t = 0; t <= 10; t += 0.5) {
    const ev = mgr.update(0.5, t);
    if (ev.shouldSpawnNow) triggers++;
  }
  assert.equal(triggers, 1, 'RevenantManager must spawn exactly one guaranteed Revenant per session');

  // Entrance point never clips inside solid map obstacles
  const wallObstacles: Obstacle[] = [
    { id: 'wall_a', kind: 'building', x: 1850, y: 1100, w: 320, h: 320, hp: 5000, maxHp: 5000, destructible: false, destroyed: false, explosive: false, height: 70, blocksLos: true },
    { id: 'wall_b', kind: 'bunker', x: 700, y: 800, w: 260, h: 260, hp: 5000, maxHp: 5000, destructible: false, destroyed: false, explosive: false, height: 60, blocksLos: true },
  ];
  const entrance = mgr.pickSafeEntrancePoint({ x: 1100, y: 950 }, 2400, 1800, wallObstacles);
  for (const obs of wallObstacles) {
    const insideX = Math.abs(entrance.x - obs.x) < obs.w * 0.5 + 36;
    const insideY = Math.abs(entrance.y - obs.y) < obs.h * 0.5 + 36;
    assert.equal(insideX && insideY, false, 'Safe entrance must stay clear of obstacle geometry');
  }
});

test('Raptis-05 Grapplers spawn in packs of 5, swing, deflect unattached bullets, inflict exact 5 DPS + stacking slow, and trigger Allied rescue AI', () => {
  const map = buildMap('urban');
  const player = createPlayableMech({ id: 'player', callsign: 'Wardog-1', isPlayer: true, classId: 'standard', x: 900, y: 900 });
  const ally = createPlayableMech({ id: 'ally_1', callsign: 'Rail-2', isPlayer: false, classId: 'sniper', x: 1080, y: 930 });

  const pack = createGrapplerGroup({
    groupId: 'grp_test',
    baseSpawnIndex: 1,
    anchorPos: { x: 1450, y: 920 },
    mapWidth: map.width,
    mapHeight: map.height,
    obstacles: map.obstacles,
    playerPos: player.phys.pos,
  });

  assert.equal(pack.length, GRAPPLER_GROUP_SIZE);
  assert.equal(pack.length, 5);
  for (let i = 0; i < pack.length; i++) {
    assert.equal(pack[i].enemyArchetype, 'grappler');
    for (let j = i + 1; j < pack.length; j++) {
      const dist = Math.hypot(pack[i].phys.pos.x - pack[j].phys.pos.x, pack[i].phys.pos.y - pack[j].phys.pos.y);
      assert.ok(dist >= 40, 'Grappler pack members must spawn non-overlapping');
    }
  }

  // Bullet immunity while unattached vs vulnerability once clinging or struck by AoE/EMP
  const scoutGrappler = pack[0];
  assert.equal(isGrapplerImmuneToProjectile(scoutGrappler, 'autocannon', 0), true);
  assert.equal(isGrapplerImmuneToProjectile(scoutGrappler, 'machinegun', 0), true);
  assert.equal(isGrapplerImmuneToProjectile(scoutGrappler, 'railgun', 0), true);
  assert.equal(isGrapplerImmuneToProjectile(scoutGrappler, 'ewar_pulse', 0), false);
  assert.equal(isGrapplerImmuneToProjectile(scoutGrappler, 'artillery', 70), false);

  // Grapple-swinging across obstacle -> launch -> cling
  const swingerMap = {
    ...map,
    obstacles: [
      { id: 'swing_pillar', kind: 'building' as const, x: 1160, y: 840, w: 96, h: 96, hp: 5000, maxHp: 5000, destructible: false, destroyed: false, explosive: false, height: 72, blocksLos: true },
    ],
  };
  scoutGrappler.phys.pos.x = 1360;
  scoutGrappler.phys.pos.y = 900;
  scoutGrappler.grapplerState!.hookCooldown = 0;
  let sawHookState = false;
  for (let f = 0; f < 60; f++) {
    stepGrapplerEnemyAI(scoutGrappler, [player, ally], pack, swingerMap, 0.05);
    const mode = scoutGrappler.grapplerState!.mode;
    if (mode === 'hook_deploy' || mode === 'swinging' || mode === 'air_launch') {
      sawHookState = true;
    }
    if (scoutGrappler.grapplerState!.attachedTargetId) break;
  }
  assert.equal(sawHookState, true, 'Grappler must fire hook/swing via obstacle anchors toward targets');

  // Stuck recovery fallback check
  const stuckGrappler = pack[1];
  stuckGrappler.grapplerState!.mode = 'scuttle';
  stuckGrappler.grapplerState!.hookCooldown = 99;
  stuckGrappler.grapplerState!.stuckTimer = 0.72;
  stuckGrappler.phys.pos.x = 1600;
  stuckGrappler.phys.pos.y = 900;
  stuckGrappler.grapplerState!.lastProgressPos = { x: 1600, y: 900 };
  const evStuck = stepGrapplerEnemyAI(stuckGrappler, [player], pack, swingerMap, 0.05);
  assert.equal(evStuck.propulsionBurst || stuckGrappler.grapplerState!.airborne, true, 'Stuck grappler must trigger recovery vault');

  // Exact 5 DPS per clinging unit, stacking slowdown, and zero residual state when killed/detached
  pack[0].grapplerState!.attachedTargetId = player.id;
  pack[0].grapplerState!.mode = 'clinging';
  pack[1].grapplerState!.attachedTargetId = player.id;
  pack[1].grapplerState!.mode = 'clinging';
  syncClingingGrapplers(pack, [player, ally]);
  assert.equal(countAttachedGrapplersForUnit(player.id, pack), 2);
  assert.equal(GRAPPLER_CLING_DPS, 5);
  assert.equal(computeGrapplerSlowMultiplier(0), 1.0);
  assert.equal(computeGrapplerSlowMultiplier(1), 0.62);
  assert.equal(computeGrapplerSlowMultiplier(2), 0.42);
  assert.ok(computeGrapplerSlowMultiplier(3) < computeGrapplerSlowMultiplier(2));

  // Verify clinging unit becomes bullet-vulnerable
  assert.equal(isGrapplerImmuneToProjectile(pack[0], 'autocannon', 0), false);

  // Allied AI rescue priority + aim directly onto attached grappler
  const squad = new SquadController();
  const navGrid = new NavGrid(swingerMap);
  ally.phys.pos = { x: 1450, y: 920 }; // far outside normal melee range (>500px), still rescues player
  let cmd = squad.computeAllyAI(ally, player, [ally], pack, swingerMap, navGrid, 0.05);
  assert.equal(cmd.statusText, 'RESCUING SQUADMATE');
  for (let tick = 0; tick < 12 && !cmd.firePrimary; tick++) {
    cmd = squad.computeAllyAI(ally, player, [ally], pack, swingerMap, navGrid, 0.05);
  }
  assert.equal(cmd.statusText, 'RESCUING SQUADMATE');
  assert.equal(cmd.firePrimary, true, 'Rescuing ally must lock and open fire on clinging grappler');

  // Cleanup on kill/detach leaves zero residual slow
  pack[0].alive = false;
  detachGrappler(pack[1]);
  syncClingingGrapplers(pack, [player, ally]);
  assert.equal(countAttachedGrapplersForUnit(player.id, pack), 0);
  assert.equal(computeGrapplerSlowMultiplier(countAttachedGrapplersForUnit(player.id, pack)), 1.0);
});

test('Reworked player Grapple extends reach, converts pull into swing velocity, and preserves post-release slingshot momentum', () => {
  const obstacles: Obstacle[] = [
    { id: 'anchor_tower', kind: 'building', x: 750, y: 200, w: 90, h: 90, hp: 5000, maxHp: 5000, destructible: false, destroyed: false, explosive: false, height: 72, blocksLos: true },
  ];
  const ctrl = new GrappleController();
  assert.ok(ctrl.maxReach >= 840);
  const phys = createPhysicsState(200, 350, 0);
  const fireRes = ctrl.toggleFire(phys.pos, { x: 750, y: 200 }, obstacles);
  assert.equal(fireRes, 'fired');

  for (let i = 0; i < 18; i++) {
    ctrl.update(0.016, phys, 28, 0, 1, obstacles);
  }
  assert.equal(ctrl.state, 'attached');
  assert.equal(phys.grappleActive, true);
  const swingSpeed = Math.hypot(phys.vel.x, phys.vel.y);
  assert.ok(swingSpeed > 180, `Expected strong swing speed, got ${swingSpeed}`);

  ctrl.detach(phys);
  assert.equal(phys.grappleActive, false);
  assert.ok(phys.grappleMomentumTimer > 1.0, 'Release must grant post-grapple momentum glide window');
  const postReleaseSpeed = Math.hypot(phys.vel.x, phys.vel.y);
  assert.ok(postReleaseSpeed > swingSpeed, 'Slingshot release should inject carry boost');

  // Verify stepMechPhysics retains momentum cleanly without slamming velocity to maxSpeed instantly
  const spec = MECH_ROSTER.standard;
  const cfg = {
    mass: spec.mass,
    acceleration: spec.acceleration,
    maxSpeed: spec.maxSpeed,
    sprintMultiplier: spec.sprintMultiplier,
    reverseMultiplier: spec.reverseMultiplier,
    turnAccel: spec.turnAccel,
    maxTurnSpeed: spec.maxTurnSpeed,
    lateralGrip: spec.lateralGrip,
    radius: spec.radius,
    suspensionStiffness: spec.suspensionStiffness,
    terrainPenaltyMult: 1.0,
  };
  stepMechPhysics(
    phys,
    cfg,
    { wishX: 0, wishY: 0, sprint: false, time: 1.0 },
    'concrete',
    createComponentHealth(100, 100, 100),
    0.016
  );
  assert.ok(Math.hypot(phys.vel.x, phys.vel.y) > spec.maxSpeed, 'Post-grapple glide must carry smoothly above ground walk speed');
});

test('All 5 Thunderhead Boss variants actively evaluate & dodge incoming player mortars and missiles while respecting fairness locks', () => {
  for (const spec of BOSS_VARIANT_LIST) {
    const boss = new ThunderheadBoss(spec.id, 1200, 900, 1.0);
    boss.aiState = 'repositioning';

    const mortarThreat = {
      id: 'm_1',
      kind: 'mortar' as const,
      x: 400,
      y: 900,
      vx: 0,
      vy: 0,
      targetX: 1205,
      targetY: 905,
      remainingFlightSec: 0.72,
      splashRadius: 110,
      damage: 140,
      piercing: true,
      homing: false,
    };

    const resMortar = boss.evaluateIncomingProjectiles([mortarThreat], [], 2400, 1800);
    assert.equal(resMortar.triggered, true, `${spec.id} must dodge lethal incoming player mortar`);
    assert.ok(resMortar.dodgeDir !== null && resMortar.threatCount >= 1);

    // Respect fatigue/cooldown and avoid jittering when harmless missile flies far away
    const freshBoss = new ThunderheadBoss(spec.id, 1200, 900, 1.0);
    freshBoss.aiState = 'acquiring';
    const harmlessRes = freshBoss.evaluateIncomingProjectiles(
      [
        {
          id: 'harmless',
          kind: 'missile',
          x: 200,
          y: 200,
          vx: 500,
          vy: 0,
          remainingFlightSec: 1.5,
          splashRadius: 40,
          damage: 60,
          piercing: false,
          homing: false,
        },
      ],
      [],
      2400,
      1800
    );
    assert.equal(harmlessRes.triggered, false, `${spec.id} should not twitch on off-target projectiles`);

    // Honed commitment lock during active firing
    freshBoss.aiState = 'firing';
    const lockedRes = freshBoss.evaluateIncomingProjectiles([mortarThreat], [], 2400, 1800);
    assert.equal(lockedRes.triggered, false, `${spec.id} must honor commitment lock during firing`);
  }
});

test('Upgraded Grapplers have compact radius=10 proportions, valid IK bounds at 820px/s, and zero sub-stepped obstacle tunneling', () => {
  assert.equal(GRAPPLER_CHASSIS_SPEC.radius, 10);
  assert.ok(GRAPPLER_CHASSIS_SPEC.radius < MECH_ROSTER.recon.radius, 'Grappler must be smaller than Recon mech');
  assert.equal(GRAPPLER_CHASSIS_SPEC.legs.length, 6);

  // Verify two-bone IK stay strictly within [8px, maxReach] for all 6 scaled legs at extreme swing speed
  const thinWall: Obstacle = {
    id: 'thin_divider',
    kind: 'ruin',
    x: 1100,
    y: 900,
    w: 22,
    h: 500,
    hp: 5000,
    maxHp: 5000,
    destructible: false,
    destroyed: false,
    explosive: false,
    height: 75,
    blocksLos: true,
  };
  const testMap = {
    ...buildMap('urban'),
    obstacles: [thinWall],
  };
  const player = createPlayableMech({ id: 'p', callsign: 'W1', isPlayer: true, classId: 'standard', x: 1450, y: 900 });
  const g = createGrapplerEnemyUnit({
    id: 'g_tunnel',
    groupId: 'grp_tunnel',
    groupIndex: 0,
    x: 980,
    y: 900,
    angle: 0,
  });
  g.grapplerState!.huntPhase = 'dive';
  g.grapplerState!.hookCooldown = 99;
  // Drive straight toward the thin 22px wall at max swing velocity (820 px/s) across steps
  g.phys.vel.x = GRAPPLER_MAX_SWING_SPEED;
  g.phys.vel.y = 0;

  for (let i = 0; i < 16; i++) {
    stepGrapplerEnemyAI(g, [player], [g], testMap, 0.05);
    assert.equal(Number.isFinite(g.phys.pos.x) && Number.isFinite(g.phys.pos.y), true);
    // Must never tunnel past thin wall center x=1100
    assert.ok(
      g.phys.pos.x <= thinWall.x - thinWall.w * 0.5 - GRAPPLER_CHASSIS_SPEC.radius + 2.5,
      `Sub-stepped collision prevented tunneling through 22px wall at high speed (x=${g.phys.pos.x})`
    );
    // Validate leg IK joint geometry stays non-NaN and bounded
    for (let li = 0; li < g.spec.legs.length; li++) {
      const m = g.spec.legs[li];
      const legState = g.legs.legs[li];
      assert.ok(Number.isFinite(legState.hipPos.x) && Number.isFinite(legState.hipPos.y));
      assert.ok(Number.isFinite(legState.kneePos.x) && Number.isFinite(legState.kneePos.y));
      assert.ok(Number.isFinite(legState.footPos.x) && Number.isFinite(legState.footPos.y));
      const hipToFoot = Math.hypot(legState.footPos.x - legState.hipPos.x, legState.footPos.y - legState.hipPos.y);
      assert.ok(hipToFoot >= 7.5 && hipToFoot <= m.femurLength + m.tibiaLength + 0.5);
    }
  }
});

test('Upgraded Grapplers execute human-like randomized approaches, zip straight without forced circling, and emit feeding audio once latched', () => {
  const obstacles: Obstacle[] = [
    { id: 'p_mid', kind: 'bridge_pylon', x: 1180, y: 890, w: 64, h: 64, hp: 9999, maxHp: 9999, destructible: false, destroyed: false, explosive: false, height: 38, blocksLos: true },
    { id: 'p1', kind: 'building', x: 1050, y: 740, w: 92, h: 92, hp: 9999, maxHp: 9999, destructible: false, destroyed: false, explosive: false, height: 74, blocksLos: true },
    { id: 'p2', kind: 'building', x: 1320, y: 880, w: 92, h: 92, hp: 9999, maxHp: 9999, destructible: false, destroyed: false, explosive: false, height: 74, blocksLos: true },
    { id: 'p3', kind: 'building', x: 1120, y: 1120, w: 92, h: 92, hp: 9999, maxHp: 9999, destructible: false, destroyed: false, explosive: false, height: 74, blocksLos: true },
    { id: 'p4', kind: 'building', x: 840, y: 980, w: 92, h: 92, hp: 9999, maxHp: 9999, destructible: false, destroyed: false, explosive: false, height: 74, blocksLos: true },
  ];
  const map = { ...buildMap('urban'), obstacles };
  const player = createPlayableMech({ id: 'p', callsign: 'W1', isPlayer: true, classId: 'standard', x: 1080, y: 930 });

  // Verify pack exhibits randomized organic micro-adjustments & varied approach styles (not robotic identical circling)
  const styles = new Set<string>();
  const jukes = new Set<number>();
  for (let i = 0; i < 20; i++) {
    const sample = createGrapplerEnemyUnit({ id: `s_${i}`, groupId: 'grp_mix', groupIndex: i % 5, x: 1500, y: 930 });
    styles.add(sample.grapplerState!.approachStyle);
    jukes.add(Math.round(sample.grapplerState!.jukeBias * 100));
  }
  assert.ok(styles.size >= 2, 'Grapplers must pick varied randomized approach styles instead of all circling');
  assert.ok(jukes.size >= 5, 'Grapplers must have randomized human-like micro-adjustment biases');

  // Verify direct/straight grapple rush moves forward toward target without circling sideways
  const straightHunter = createGrapplerEnemyUnit({
    id: 'g_straight',
    groupId: 'grp_straight',
    groupIndex: 0,
    x: 1520,
    y: 930,
    angle: Math.PI,
  });
  straightHunter.grapplerState!.huntPhase = 'approach';
  straightHunter.grapplerState!.approachStyle = 'direct';
  straightHunter.grapplerState!.decisionTimer = 99;
  const startDist = Math.hypot(straightHunter.phys.pos.x - player.phys.pos.x, straightHunter.phys.pos.y - player.phys.pos.y);

  let sawSwing = false;
  let sawAirLaunch = false;
  let sawDivePhase = false;
  let sawDiveScream = false;
  let sawFeedBite = false;
  let maxObservedSpeed = 0;
  let maxLateralDrift = 0;

  for (let step = 0; step < 32; step++) {
    const ev = stepGrapplerEnemyAI(straightHunter, [player], [straightHunter], map, 0.04);
    const gs = straightHunter.grapplerState!;
    const spd = Math.hypot(straightHunter.phys.vel.x, straightHunter.phys.vel.y);
    if (spd > maxObservedSpeed) maxObservedSpeed = spd;
    maxLateralDrift = Math.max(maxLateralDrift, Math.abs(straightHunter.phys.pos.y - 930));
    if (gs.mode === 'swinging') sawSwing = true;
    if (gs.mode === 'air_launch') sawAirLaunch = true;
    if (gs.huntPhase === 'dive' || gs.huntPhase === 'cling' || ev.clampedTarget) sawDivePhase = true;
    if (ev.diveScream) sawDiveScream = true;
    if (ev.feedBite) sawFeedBite = true;
  }

  const endDist = Math.hypot(straightHunter.phys.pos.x - player.phys.pos.x, straightHunter.phys.pos.y - player.phys.pos.y);
  assert.ok(endDist < startDist - 120 || straightHunter.grapplerState!.attachedTargetId !== null, 'Direct Grappler must close distance straight toward target');
  assert.ok(maxLateralDrift < 150, `Direct straight approach must not circle widely around target (drift=${maxLateralDrift})`);

  // Continue simulation until swing/launch/dive/latch triggers cleanly
  for (let step = 0; step < 200; step++) {
    const ev = stepGrapplerEnemyAI(straightHunter, [player], [straightHunter], map, 0.04);
    const gs = straightHunter.grapplerState!;
    const spd = Math.hypot(straightHunter.phys.vel.x, straightHunter.phys.vel.y);
    if (spd > maxObservedSpeed) maxObservedSpeed = spd;
    if (gs.mode === 'swinging') sawSwing = true;
    if (gs.mode === 'air_launch') sawAirLaunch = true;
    if (gs.huntPhase === 'dive' || gs.huntPhase === 'cling' || ev.clampedTarget) sawDivePhase = true;
    if (ev.diveScream) sawDiveScream = true;
    if (ev.feedBite) sawFeedBite = true;
  }

  assert.equal(sawSwing || sawDivePhase, true, 'Grappler must swing or dive cleanly into combat');
  assert.ok(maxObservedSpeed > 440, `Expected high grapple/rush speed, got ${maxObservedSpeed}`);
  assert.equal(sawDivePhase, true, 'Grappler must transition smoothly into dive strike');
  assert.equal(sawDiveScream, true, 'Grappler must emit scream trigger during dive attack');

  if (!straightHunter.grapplerState!.attachedTargetId) {
    straightHunter.grapplerState!.huntPhase = 'dive';
    straightHunter.grapplerState!.clingCooldown = 0;
    straightHunter.phys.pos.x = player.phys.pos.x + 65;
    straightHunter.phys.pos.y = player.phys.pos.y;
    const clampEv = stepGrapplerEnemyAI(straightHunter, [player], [straightHunter], map, 0.04);
    if (clampEv.feedBite) sawFeedBite = true;
  }
  assert.ok(straightHunter.grapplerState!.attachedTargetId !== null);
  for (let f = 0; f < 65; f++) {
    const fe = stepGrapplerEnemyAI(straightHunter, [player], [straightHunter], map, 0.04);
    if (fe.feedBite) sawFeedBite = true;
  }
  assert.equal(sawFeedBite, true, 'Latched Grappler must emit periodic feeding/eating audio events');
});

test('Closer Grappler approach anchors stay in valid medium-range flanks across all maps and Survival waves escalate cleanly', () => {
  const allMaps: MapId[] = ['urban', 'grassland', 'mountain', 'desert', 'industrial', 'forest', 'snow', 'training'];
  for (const mapId of allMaps) {
    const map = buildMap(mapId);
    const playerPos = map.playerSpawn;
    const friendlies = [
      playerPos,
      { x: playerPos.x - 80, y: playerPos.y + 100 },
      { x: playerPos.x - 110, y: playerPos.y - 100 },
    ];
    const anchor = pickGrapplerApproachAnchor({
      playerPos,
      friendlies,
      mapWidth: map.width,
      mapHeight: map.height,
      obstacles: map.obstacles,
      seedIndex: 3,
    });
    const dist = Math.hypot(anchor.x - playerPos.x, anchor.y - playerPos.y);
    assert.ok(dist >= 400 && dist <= 840, `Expected closer valid anchor on ${mapId}, got ${dist}`);

    const pack = createGrapplerGroup({
      groupId: `grp_${mapId}`,
      baseSpawnIndex: 1,
      anchorPos: anchor,
      mapWidth: map.width,
      mapHeight: map.height,
      obstacles: map.obstacles,
      playerPos,
    });
    assert.equal(pack.length, GRAPPLER_GROUP_SIZE);
    for (const unit of pack) {
      const unitDist = Math.hypot(unit.phys.pos.x - playerPos.x, unit.phys.pos.y - playerPos.y);
      assert.ok(unitDist >= 260, `Grappler must not spawn directly on top of player on ${mapId}`);
      for (const obs of map.obstacles) {
        if (obs.destroyed) continue;
        const dx = Math.abs(unit.phys.pos.x - obs.x);
        const dy = Math.abs(unit.phys.pos.y - obs.y);
        assert.equal(
          dx < obs.w * 0.5 + unit.spec.radius - 2 && dy < obs.h * 0.5 + unit.spec.radius - 2,
          false,
          `Grappler spawned inside obstacle on ${mapId}`
        );
      }
    }
  }

  // Verify mission progression & survival waves cover grappler packs smoothly
  assert.ok(CAMPAIGN_MISSIONS.length >= 5);
  assert.equal(buildSurvivalWave(2).some((w) => w.archetype === 'grappler' && w.count === 5), true);
});

test('Directional offscreen threat indicators always track incoming Grapplers, cluster tightly, respect viewports, and clear on death', () => {
  const player = createPlayableMech({ id: 'p', callsign: 'W1', isPlayer: true, classId: 'standard', x: 1200, y: 900 });
  const cam = new Camera();
  cam.snapTo(1200, 900, 1.0);

  // Two undetected offscreen grapplers on the same right-hand bearing + one urgent diving grappler left
  const g1 = createGrapplerEnemyUnit({ id: 'g1', groupId: 'grp', groupIndex: 0, x: 2350, y: 900 });
  g1.detected = false;
  const g2 = createGrapplerEnemyUnit({ id: 'g2', groupId: 'grp', groupIndex: 1, x: 2420, y: 930 });
  g2.detected = false;
  const g3 = createGrapplerEnemyUnit({ id: 'g3', groupId: 'grp', groupIndex: 2, x: 100, y: 900 });
  g3.detected = false;
  g3.grapplerState!.huntPhase = 'dive';

  const standardUndetected = createEnemyMech({ id: 's1', archetype: 'scout', x: 1200, y: 100 });
  standardUndetected.detected = false;

  const viewports = [
    { w: 1440, h: 900 },
    { w: 1280, h: 720 },
    { w: 390, h: 844 },
  ];
  for (const vp of viewports) {
    const threats = computeOffscreenThreats(
      cam.x,
      cam.y,
      cam.zoom,
      vp.w,
      vp.h,
      player.phys.pos,
      [g1, g2, g3, standardUndetected],
      null,
      false
    );
    const grapplerInds = threats.filter((t) => t.kind === 'grappler');
    // g1 and g2 cluster cleanly into count=2 while g3 stays separate on opposite edge; undetected standard stays hidden
    assert.equal(grapplerInds.length, 2, `Expected 2 clustered grappler bearings on ${vp.w}x${vp.h}`);
    assert.equal(threats.some((t) => t.id === 's1'), false);
    const totalCount = grapplerInds.reduce((acc, t) => acc + (t.count ?? 1), 0);
    assert.equal(totalCount, 3);
    assert.equal(grapplerInds.some((t) => t.urgent === true), true);
    for (const ind of grapplerInds) {
      assert.ok(ind.screenX >= 22 && ind.screenX <= vp.w - 22);
      assert.ok(ind.screenY >= 22 && ind.screenY <= vp.h - 22);
    }
  }

  // Killing/removing Grapplers immediately clears their directional indicators
  g1.alive = false;
  g2.alive = false;
  g3.alive = false;
  const afterKill = computeOffscreenThreats(cam.x, cam.y, cam.zoom, 1440, 900, player.phys.pos, [g1, g2, g3], null, false);
  assert.equal(afterKill.length, 0);
});

test('All maps are vastly expanded with rich grappleable obstacle variety, missile cover, and NavGrid traversal', () => {
  const combatIds = ['urban', 'grassland', 'mountain', 'desert', 'industrial', 'forest', 'snow'] as const;
  const training = buildMap('training');
  assert.equal(training.width, 4400);
  assert.equal(training.height, 3200);
  assert.ok(training.obstacles.length >= 85, `Expected dense training obstacles, got ${training.obstacles.length}`);
  const trainingKinds = new Set(training.obstacles.map((o) => o.kind));
  const newTallVarieties = ['watchtower', 'crane', 'bridge_pylon', 'radar_dish', 'silo', 'monolith'] as const;
  for (const kind of newTallVarieties) {
    assert.equal(trainingKinds.has(kind), true, `Training map should showcase ${kind}`);
  }
  assert.equal(trainingKinds.size, 14, 'Training map should span all 14 obstacle varieties');

  for (const kind of newTallVarieties) {
    const sample = training.obstacles.find((o) => o.kind === kind);
    assert.ok(sample, `Missing obstacle sample for ${kind}`);
    assert.equal(GrappleTargetRegistry.isObstacleGrappleable(sample!), true, `${kind} must be grappleable`);
    assert.equal(isSolidMissileCover(sample!), true, `${kind} must act as solid missile cover`);

    const player = createPlayableMech({
      id: 'p_grapple',
      callsign: 'W1',
      isPlayer: true,
      classId: 'standard',
      x: sample!.x - 240,
      y: sample!.y,
    });
    const gp = new GrappleController();
    const fired = gp.toggleFire(
      player.phys.pos,
      { x: sample!.x, y: sample!.y },
      [sample!]
    );
    assert.equal(fired, 'fired', `Player grapple must latch onto ${kind}`);
  }

  for (const mapId of combatIds) {
    const map = buildMap(mapId);
    assert.equal(map.width, 5600, `${mapId} width must be 5600`);
    assert.equal(map.height, 4000, `${mapId} height must be 4000`);
    assert.ok(map.obstacles.length >= 150, `Expected >= 150 obstacles on ${mapId}, got ${map.obstacles.length}`);

    const distinctKinds = new Set(map.obstacles.map((o) => o.kind));
    assert.ok(distinctKinds.size >= 7, `Expected >= 7 obstacle varieties on ${mapId}, got ${distinctKinds.size}`);

    const grappleableCount = map.obstacles.filter((o) => GrappleTargetRegistry.isObstacleGrappleable(o)).length;
    assert.ok(grappleableCount >= 110, `Expected >= 110 grappleable objects on ${mapId}, got ${grappleableCount}`);

    // Every single grappleable obstacle across every combat map must be indestructible
    for (const obs of map.obstacles) {
      if (GrappleTargetRegistry.isObstacleGrappleable(obs)) {
        assert.equal(obs.destructible, false, `Grappleable obstacle ${obs.kind} (${obs.id}) on ${mapId} must be indestructible`);
        assert.equal(obs.explosive, false, `Grappleable obstacle ${obs.kind} (${obs.id}) on ${mapId} must not be explosive`);
      }
    }

    // Verify NavGrid crosses the expanded 5600x4000 arena reliably
    const nav = new NavGrid(map);
    const crossPath = nav.findPath(map.playerSpawn, { x: map.width - 700, y: map.height * 0.5 });
    assert.ok(crossPath.length > 0, `Expected valid NavGrid path across ${mapId}`);
  }

  // Also verify every grappleable object on training is indestructible and player straight grapple pulls straight without circling
  for (const obs of training.obstacles) {
    if (GrappleTargetRegistry.isObstacleGrappleable(obs)) {
      assert.equal(obs.destructible, false, `Training grappleable obstacle ${obs.kind} must be indestructible`);
    }
  }
  const straightCtrl = new GrappleController();
  const anchorObs: Obstacle = {
    id: 'straight_pylon',
    kind: 'bridge_pylon',
    x: 800,
    y: 400,
    w: 64,
    h: 64,
    hp: 9999,
    maxHp: 9999,
    destructible: false,
    destroyed: false,
    explosive: false,
    height: 38,
    blocksLos: true,
  };
  const straightPhys = createPhysicsState(300, 400, 0);
  straightPhys.vel.y = 65; // residual slight sideways drift
  assert.equal(straightCtrl.toggleFire(straightPhys.pos, { x: 800, y: 400 }, [anchorObs]), 'fired');
  for (let i = 0; i < 20; i++) {
    straightCtrl.update(0.016, straightPhys, 28, 1, 0, [anchorObs]);
  }
  assert.ok(straightPhys.vel.x > 250, 'Straight grapple steering must pull strongly forward');
  assert.ok(Math.abs(straightPhys.vel.y) < 60, 'Straight grapple steering must damp unwanted circling drift');
});

test('Grapplers spawn continuously every 10-15 seconds and deal exact 5 DPS per attached unit', () => {
  assert.equal(GRAPPLER_CLING_DPS, 5);
  assert.equal(GRAPPLER_SPAWN_MIN_SEC, 10);
  assert.equal(GRAPPLER_SPAWN_MAX_SEC, 15);

  for (let i = 0; i <= 10; i++) {
    const interval = rollNextGrapplerSpawnInterval(i / 10);
    assert.ok(interval >= 10 && interval <= 15, `Interval ${interval} must stay within [10, 15]s`);
  }

  const scheduler = new GrapplerSpawnScheduler(12);
  // Before 10-15s elapses, does not trigger
  for (let s = 0; s < 11; s++) {
    assert.equal(scheduler.step(1.0, 5, true, 0.4), false);
  }
  // At 12s, spawns even while earlier 5 Grapplers are still alive
  assert.equal(scheduler.step(1.0, 5, true, 0.5), true);
  // Next timer rolled strictly inside [10, 15]
  assert.ok(scheduler.timerSec >= 10 && scheduler.timerSec <= 15);
  // Respects MAX_ACTIVE_GRAPPLERS cap cleanly
  assert.equal(scheduler.step(20.0, MAX_ACTIVE_GRAPPLERS, true, 0.2), false);
  // Does not spawn when primary combat has ended
  assert.equal(scheduler.step(20.0, 0, false, 0.2), false);
});






