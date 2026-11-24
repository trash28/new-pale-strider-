import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_ASSET_MANIFEST } from './audioAssets';
import { applyTransformedUnitForm, createPlayableMech } from './mech';
import { MECH_LIST, MECH_ROSTER } from './mechRoster';
import {
  createMorphRigState,
  getMorphChargeSpeedMultiplier,
  getMorphDashCooldownMultiplier,
  getMorphFireRateMultiplier,
  getMorphIncomingDamageReduction,
  getMorphSpeedMultiplier,
  getProteusMorphProfile,
  getProteusMorphSpec,
  PROTEUS_MORPH_TARGET_IDS,
  stepMorphRigState,
} from './proteusMorphs';
import {
  buildTransformChoreographyProfile,
  canInitiateTransformation,
  createTransformRuntime,
  getEligibleReplicationTargets,
  pickAITransformTarget,
  stepTransformRuntime,
  TRANSFORM_COOLDOWN_SEC,
} from './transformSystem';
import { MechClassSpec } from './types';

test('TX-10 Proteus registration, silhouette, 6-leg geometry, and 60s Total Replication ability spec', () => {
  const p = MECH_ROSTER.proteus;
  assert.ok(p);
  assert.equal(p.code, 'TX-10 Proteus');
  assert.equal(p.silhouette, 'proteus');
  assert.equal(p.legs.length, 6);
  assert.equal(p.specialAbility.kind, 'total_replication');
  assert.equal(p.specialAbility.cooldown, 60);
  assert.equal(TRANSFORM_COOLDOWN_SEC, 60);

  const actor = createPlayableMech({ id: 'p1', callsign: 'Wardog-1', isPlayer: true, classId: 'proteus', x: 500, y: 500 });
  assert.equal(actor.isProteusOrigin, true);
  assert.equal(actor.transformCooldownTimer, 0);
});

test('Total Replication enforces allied-only registry, unlock progression, and dynamic future unit discovery', () => {
  const partialUnlocks = ['recon', 'standard', 'proteus', 'colossus'];
  const targets = getEligibleReplicationTargets(MECH_LIST, partialUnlocks, 'proteus');

  assert.equal(targets.some((t) => t.id === 'proteus'), false);
  assert.equal(targets.find((t) => t.id === 'colossus')?.unlocked, true);
  assert.equal(targets.find((t) => t.id === 'colossus')?.morphCode, 'TX-09');
  assert.equal(targets.find((t) => t.id === 'valkyrie')?.unlocked, false);

  // Reject locked target
  const lockedRes = canInitiateTransformation({
    isProteusLineage: true,
    alive: true,
    transforming: false,
    inTakedown: false,
    transformCooldownRemaining: 0,
    currentClassId: 'proteus',
    targetClassId: 'valkyrie',
    alliedRoster: MECH_LIST,
    unlockedUnits: partialUnlocks,
  });
  assert.equal(lockedRes.allowed, false);
  assert.equal(lockedRes.reason, 'UNIT_LOCKED');

  // Reject hostile / non-allied / invalid target ID
  const hostileRes = canInitiateTransformation({
    isProteusLineage: true,
    alive: true,
    transforming: false,
    inTakedown: false,
    transformCooldownRemaining: 0,
    currentClassId: 'proteus',
    targetClassId: 'scout' as unknown as import('./types').MechClassId,
    alliedRoster: MECH_LIST,
    unlockedUnits: ['scout', 'proteus'],
  });
  assert.equal(hostileRes.allowed, false);
  assert.equal(hostileRes.reason, 'NON_ALLIED_OR_UNKNOWN');

  // Dynamic synthetic future allied unit support (no hardcoded target switch needed!)
  const futureAlliedUnit: MechClassSpec = {
    ...MECH_ROSTER.standard,
    id: 'future_unit' as unknown as import('./types').MechClassId,
    code: 'FX-99 Future',
    name: 'Future Frame',
    mass: 44,
    radius: 25,
  };
  const extendedRoster = [...MECH_LIST, futureAlliedUnit];
  const extTargets = getEligibleReplicationTargets(extendedRoster, [futureAlliedUnit.id], 'proteus');
  assert.equal(extTargets.find((t) => t.id === futureAlliedUnit.id)?.unlocked, true);
  const autoProfile = buildTransformChoreographyProfile(futureAlliedUnit);
  assert.ok(autoProfile.durationSec >= 3.0 && autoProfile.durationSec <= 4.2);
});

test('Multi-stage choreography sweeps all 8 stages, synchronized audio keyframes, and bounded IK leg morphing across every allied target', () => {
  const baseSpec = MECH_ROSTER.proteus;
  const targets = MECH_LIST.filter((m) => m.id !== 'proteus');
  assert.equal(targets.length, 11);

  for (const tgt of targets) {
    const morphSpec = getProteusMorphSpec(tgt);
    const actor = createPlayableMech({
      id: 'tf_test',
      callsign: 'Proteus',
      isPlayer: true,
      classId: 'proteus',
      x: 1000,
      y: 1000,
    });
    const rt = createTransformRuntime({
      baseClassId: 'proteus',
      sourceSpec: baseSpec,
      targetSpec: morphSpec,
      sourcePaint: actor.paint,
      targetPaint: { primary: morphSpec.defaultColor, secondary: '#262b33', accent: morphSpec.accentColor },
    });

    const stagesSeen: string[] = [];
    const cuesSeen: string[] = [];
    let completed = false;

    for (let step = 0; step < 300; step++) {
      const res = stepTransformRuntime(rt, 0.02);
      if (!stagesSeen.includes(rt.pose.stage)) {
        stagesSeen.push(rt.pose.stage);
      }
      for (const ev of res.events) {
        cuesSeen.push(ev.cue);
      }

      // Continuous IK leg morph must stay strictly finite & bounded without detaching
      actor.legs.syncMorphSpecs(rt.pose.targetLegs, actor.phys.pos, actor.phys.bodyAngle);
      actor.legs.update(
        0.02,
        actor.phys,
        {
          strideLength: morphSpec.strideLength,
          stepHeight: morphSpec.stepHeight,
          stepSpeed: morphSpec.stepSpeed,
          maxSpeed: morphSpec.maxSpeed,
          footstepWeight: morphSpec.footstepWeight,
        },
        actor.health,
        []
      );

      assert.ok(Number.isFinite(rt.pose.interpolatedRadius) && rt.pose.interpolatedRadius >= 14);
      assert.ok(rt.pose.cowlSpread >= 0 && rt.pose.cowlSpread <= 1.01);
      assert.ok(rt.pose.pistonExtension >= 0 && rt.pose.pistonExtension <= 1.01);
      for (const leg of actor.legs.legs) {
        assert.ok(Number.isFinite(leg.footPos.x) && Number.isFinite(leg.footPos.y));
        const reach = (leg.spec.femurLength + leg.spec.tibiaLength) * 1.06;
        const d = Math.hypot(leg.footPos.x - leg.hipPos.x, leg.footPos.y - leg.hipPos.y);
        assert.ok(d <= reach, `Morph ${tgt.id} leg distance ${d} > maxReach ${reach}`);
      }

      if (res.completed) {
        completed = true;
        break;
      }
    }

    assert.equal(completed, true, `Transform into ${tgt.id} failed to complete`);
    assert.deepEqual(stagesSeen, [
      'unlock',
      'retract_armor',
      'core_rotation',
      'limb_reposition',
      'structural_reform',
      'weapon_deploy',
      'staggered_lock',
      'reactor_stabilize',
    ]);
    assert.deepEqual(cuesSeen, [
      'unlock',
      'retract_armor',
      'core_rotation',
      'limb_reposition',
      'structural_reform',
      'weapon_deploy',
      'clamp_lock_a',
      'clamp_lock_b',
      'stabilize',
    ]);
  }
});

test('All 11 TX Proteus morphs are heavily upgraded with distinct unique special abilities while base MECH_ROSTER units remain unmodified', () => {
  assert.equal(PROTEUS_MORPH_TARGET_IDS.length, 11);

  const uniqueKinds = new Set<string>();
  for (const id of PROTEUS_MORPH_TARGET_IDS) {
    const baseSpec = MECH_ROSTER[id];
    const txSpec = getProteusMorphSpec(baseSpec);
    const profile = getProteusMorphProfile(id);
    assert.ok(profile, `Missing profile for ${id}`);

    // Base MECH_ROSTER must remain strictly untouched (no accidental buff leak to non-Proteus units)
    assert.notEqual(txSpec.code, baseSpec.code);
    assert.notEqual(txSpec.specialAbility.kind, baseSpec.specialAbility.kind);
    assert.equal(txSpec.specialAbility.kind, profile.specialAbility.kind);
    assert.ok(txSpec.baseArmor > baseSpec.baseArmor, `${id} TX armor should exceed base`);
    assert.ok(txSpec.baseChassis > baseSpec.baseChassis, `${id} TX chassis should exceed base`);
    assert.ok(txSpec.primaryWeapon.damage >= baseSpec.primaryWeapon.damage, `${id} TX primary should meet/exceed base`);
    assert.equal(uniqueKinds.has(txSpec.specialAbility.kind), false, `Duplicate TX ability kind for ${id}`);
    uniqueKinds.add(txSpec.specialAbility.kind);

    // Creating a standard non-Proteus actor must strictly use original baseSpec (not TX morph)
    const normalAlly = createPlayableMech({
      id: `norm_${id}`,
      callsign: 'Base-1',
      isPlayer: false,
      classId: id,
      x: 200,
      y: 200,
    });
    assert.equal(normalAlly.isProteusOrigin, false);
    assert.equal(normalAlly.spec.specialAbility.kind, baseSpec.specialAbility.kind);
    assert.equal(normalAlly.morphRig, undefined);
  }
  assert.equal(uniqueKinds.size, 11);
});

test('Post-transformation form adopts TX stats, MorphRigState, unique TX abilities, and enforces non-bypassable 60s cooldown', () => {
  const actor = createPlayableMech({
    id: 'p_adopt',
    callsign: 'Wardog-1',
    isPlayer: true,
    classId: 'proteus',
    x: 400,
    y: 400,
  });
  actor.transformCooldownTimer = TRANSFORM_COOLDOWN_SEC;

  // Morph to TX-06 Colossus (8 legs, mortar ammo, colossus_apocalypse_salvo)
  applyTransformedUnitForm(actor, MECH_ROSTER.colossus);
  assert.equal(actor.classId, 'colossus');
  assert.equal(actor.legs.legs.length, 8);
  assert.equal(actor.spec.specialAbility.kind, 'colossus_apocalypse_salvo');
  assert.equal(actor.activeMortarAmmo, 'he');
  assert.equal(actor.isProteusOrigin, true);
  assert.equal(actor.morphRig?.targetId, 'colossus');
  assert.equal(actor.transformCooldownTimer, 60);

  // Cooldown blocks premature re-transform while still allowing adopted Colossus special!
  assert.equal(actor.specialCooldownTimer, 0);
  const blocked = canInitiateTransformation({
    isProteusLineage: true,
    alive: true,
    transforming: false,
    inTakedown: false,
    transformCooldownRemaining: actor.transformCooldownTimer,
    currentClassId: actor.classId,
    targetClassId: 'valkyrie',
    alliedRoster: MECH_LIST,
    unlockedUnits: MECH_LIST.map((m) => m.id),
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'COOLDOWN_ACTIVE');

  // Morph to TX-09 Valkyrie (canFly = true, 4 legs, valkyrie_seraphim_strike)
  applyTransformedUnitForm(actor, MECH_ROSTER.valkyrie);
  assert.equal(actor.classId, 'valkyrie');
  assert.equal(actor.legs.legs.length, 4);
  assert.ok(actor.flight);
  assert.equal(actor.spec.specialAbility.kind, 'valkyrie_seraphim_strike');
  assert.equal(actor.morphRig?.targetId, 'valkyrie');

  // Morph to TX-11 Assassin (stealth cloak + assassin_crimson_tempest)
  applyTransformedUnitForm(actor, MECH_ROSTER.assassin);
  assert.equal(actor.classId, 'assassin');
  assert.equal(actor.stealth?.supported, true);
  assert.equal(actor.spec.specialAbility.kind, 'assassin_crimson_tempest');
  assert.equal(actor.morphRig?.targetId, 'assassin');
});

test('MorphRigState transitions smoothly and gameplay multipliers reflect active TX specials', () => {
  const rig = createMorphRigState('sniper');
  assert.ok(rig);
  for (let i = 0; i < 40; i++) {
    stepMorphRigState(rig, {
      dt: 0.025,
      speedRatio: 0.75,
      sprinting: false,
      angularVel: 0.8,
      tiltX: 0.6,
      recoilOffset: 4.5,
      reloading: false,
      reloadProgress: 0,
      chargingOrPreparing: true,
      braced: true,
      specialActive: true,
      airborne: false,
      boosting: false,
    });
  }
  assert.ok(rig.abilityDeploy > 0.85);
  assert.ok(rig.anchorSpades > 0.85);
  assert.ok(rig.weaponExtend > 0.85);
  assert.ok(rig.radarSpin > 1.5);

  // Deactivating special smoothly resets deploy & spades without NaN
  for (let i = 0; i < 60; i++) {
    stepMorphRigState(rig, {
      dt: 0.025,
      speedRatio: 0,
      sprinting: false,
      angularVel: 0,
      tiltX: 0,
      recoilOffset: 0,
      reloading: false,
      reloadProgress: 0,
      chargingOrPreparing: false,
      braced: false,
      specialActive: false,
      airborne: false,
      boosting: false,
    });
  }
  assert.ok(rig.abilityDeploy < 0.08);
  assert.ok(rig.anchorSpades < 0.08);

  assert.equal(getMorphIncomingDamageReduction('heavy_siege_ram', 3), 0.68);
  assert.equal(getMorphFireRateMultiplier('standard_bulwark_salvo', 4), 1.4);
  assert.equal(getMorphSpeedMultiplier('recon_apex_scan', 2), 1.48);
  assert.equal(getMorphDashCooldownMultiplier('phantom_overclock_aegis', 2), 0.55);
  assert.equal(getMorphChargeSpeedMultiplier('sniper_hyper_lockdown', 2), 1.6);
});

test('AI Proteus target selection adapts intelligently to battlefield context', () => {
  const allUnlocked = MECH_LIST.map((m) => m.id);
  const eligible = getEligibleReplicationTargets(MECH_LIST, allUnlocked, 'proteus');

  assert.equal(
    pickAITransformTarget({
      eligibleTargets: eligible,
      currentClassId: 'proteus',
      alliesNeedRepairCount: 1,
      downedAlliesCount: 1,
      cloakedEnemyCount: 0,
      airborneEnemyCount: 0,
      heavyOrBossThreat: false,
      enemyCount: 2,
    }),
    'engineer'
  );

  assert.equal(
    pickAITransformTarget({
      eligibleTargets: eligible,
      currentClassId: 'proteus',
      alliesNeedRepairCount: 0,
      downedAlliesCount: 0,
      cloakedEnemyCount: 0,
      airborneEnemyCount: 3,
      heavyOrBossThreat: false,
      enemyCount: 3,
    }),
    'valkyrie'
  );

  assert.equal(
    pickAITransformTarget({
      eligibleTargets: eligible,
      currentClassId: 'proteus',
      alliesNeedRepairCount: 0,
      downedAlliesCount: 0,
      cloakedEnemyCount: 0,
      airborneEnemyCount: 0,
      heavyOrBossThreat: true,
      enemyCount: 2,
    }),
    'colossus'
  );
});

test('All transformation and TX morph audio manifest files exist locally on disk and contain valid non-empty MP3 data', () => {
  const transformIds = (Object.keys(AUDIO_ASSET_MANIFEST) as (keyof typeof AUDIO_ASSET_MANIFEST)[]).filter((id) =>
    id.startsWith('transform_')
  );
  assert.equal(transformIds.length, 10);

  const morphIds = (Object.keys(AUDIO_ASSET_MANIFEST) as (keyof typeof AUDIO_ASSET_MANIFEST)[]).filter((id) =>
    id.startsWith('morph_')
  );
  assert.equal(morphIds.length, 9);

  for (const id of [...transformIds, ...morphIds]) {
    const meta = AUDIO_ASSET_MANIFEST[id];
    assert.ok(meta.sourceUrl.startsWith('https://archive.org/'), `Missing verified source URL for ${id}`);
    assert.ok(meta.license.includes('CC0'), `Non-CC0 license for ${id}`);
    const filePath = path.join(process.cwd(), 'public', meta.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Missing audio asset file: ${filePath}`);
    const st = fs.statSync(filePath);
    assert.ok(st.size > 2000, `Audio asset file too small/corrupt: ${filePath} (${st.size} bytes)`);
  }
});

