import React, { useEffect, useMemo, useRef, useState } from 'react';
import { computeEffectiveAntiAirSpec, mapMechClassToAntiAirKey } from '../game/antiAirUpgrades';
import { createFlightState } from '../game/flightSystem';
import { createPlayableMech } from '../game/mech';
import {
  computeEffectiveMechStats,
  MECH_LIST,
  MECH_ROSTER,
  PAINT_SCHEMES,
  UPGRADES,
} from '../game/mechRoster';
import { MORTAR_AMMO_ORDER, MORTAR_AMMO_SPECS } from '../game/mortarSystem';
import { createMorphRigState, getProteusMorphSpec, isProteusMorphTargetId, stepMorphRigState } from '../game/proteusMorphs';
import { drawMechActor } from '../game/renderer';
import { createTransformRuntime, stepTransformRuntime } from '../game/transformSystem';
import { MechClassId, MechLoadoutCustomization, SaveData, UpgradeId } from '../game/types';

interface UnitHangarProps {
  save: SaveData;
  onSelectUnit: (id: MechClassId) => void;
  onUnlockUnit: (id: MechClassId, cost: number) => void;
  onUpdateCustomization: (id: MechClassId, custom: MechLoadoutCustomization) => void;
  onPurchaseUpgrade: (id: MechClassId, upId: UpgradeId, cost: number) => void;
  onTestInTraining: (id: MechClassId) => void;
  onClose: () => void;
}

type PreviewAnimMode = 'idle' | 'walk' | 'sprint' | 'turn' | 'fire' | 'limp' | 'fly' | 'morph';

export const UnitHangar: React.FC<UnitHangarProps> = ({
  save,
  onSelectUnit,
  onUnlockUnit,
  onUpdateCustomization,
  onPurchaseUpgrade,
  onTestInTraining,
  onClose,
}) => {
  const [inspectId, setInspectId] = useState<MechClassId>(save.selectedUnit);
  const [compareId, setCompareId] = useState<MechClassId | 'none'>('none');
  const [animMode, setAnimMode] = useState<PreviewAnimMode>('walk');
  const [turntableAngle, setTurntableAngle] = useState<number>(0);
  const [tab, setTab] = useState<'specs' | 'upgrades' | 'paint'>('specs');
  const [upgradeFilter, setUpgradeFilter] = useState<'all' | 'chassis' | 'anti_air'>('all');

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const spec = MECH_ROSTER[inspectId];
  const isUnlocked = save.unlockedUnits.includes(inspectId);
  const custom: MechLoadoutCustomization = useMemo(
    () =>
      save.customLoadouts[inspectId] ?? {
        upgrades: {},
        paintId: 'spearhead',
        weaponVariant: 'standard',
        armorPackage: 'standard',
        supportModule: 'none',
      },
    [save.customLoadouts, inspectId]
  );
  const stats = computeEffectiveMechStats(spec, custom);
  const aaSpec = computeEffectiveAntiAirSpec(mapMechClassToAntiAirKey(inspectId), custom);
  const compareSpec = compareId !== 'none' ? MECH_ROSTER[compareId] : null;
  const compareStats = compareSpec ? computeEffectiveMechStats(compareSpec, save.customLoadouts[compareSpec.id]) : null;

  // Live procedural spider-leg preview canvas loop
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mech = createPlayableMech({
      id: 'preview',
      callsign: spec.code,
      isPlayer: true,
      classId: inspectId,
      x: 0,
      y: 0,
      angle: turntableAngle,
      customization: custom,
    });

    let raf = 0;
    let last = performance.now();
    let t = 0;

    const loop = (now: number) => {
      if (now - last < 32) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      t += dt;

      if (animMode === 'morph' && inspectId === 'proteus') {
        const previewTargets: MechClassId[] = ['colossus', 'valkyrie', 'recon', 'assassin'];
        const slotDur = 5.4;
        const targetId = previewTargets[Math.floor(t / slotDur) % previewTargets.length];
        const rawTargetSpec = MECH_ROSTER[targetId];
        const effTargetSpec = getProteusMorphSpec(rawTargetSpec);
        const cycleTime = t % slotDur;
        const cycleProgress = cycleTime / 3.4;

        if (!mech.transform && cycleProgress <= 1) {
          mech.classId = 'proteus';
          mech.spec = spec;
          mech.morphRig = undefined;
          mech.specialActiveTimer = 0;
          mech.transform = createTransformRuntime({
            baseClassId: 'proteus',
            sourceSpec: spec,
            targetSpec: effTargetSpec,
            sourcePaint: mech.paint,
            targetPaint: {
              primary: effTargetSpec.defaultColor,
              secondary: '#262b33',
              accent: effTargetSpec.accentColor,
            },
          });
        } else if (mech.transform && mech.transform.targetSpec.id !== targetId) {
          mech.classId = 'proteus';
          mech.spec = spec;
          mech.morphRig = undefined;
          mech.specialActiveTimer = 0;
          mech.transform = createTransformRuntime({
            baseClassId: 'proteus',
            sourceSpec: spec,
            targetSpec: effTargetSpec,
            sourcePaint: mech.paint,
            targetPaint: {
              primary: effTargetSpec.defaultColor,
              secondary: '#262b33',
              accent: effTargetSpec.accentColor,
            },
          });
        }

        if (cycleProgress <= 1 && mech.transform) {
          mech.transform.active = true;
          mech.transform.elapsed = cycleProgress * mech.transform.duration;
          stepTransformRuntime(mech.transform, 0);
          mech.legs.syncMorphSpecs(mech.transform.pose.targetLegs, mech.phys.pos, mech.phys.bodyAngle);
        } else {
          if (mech.transform) {
            mech.transform = null;
          }
          mech.classId = effTargetSpec.id;
          mech.spec = effTargetSpec;
          mech.legs.syncMorphSpecs(effTargetSpec.legs, mech.phys.pos, mech.phys.bodyAngle);
          if (!mech.morphRig || mech.morphRig.targetId !== targetId) {
            if (isProteusMorphTargetId(targetId)) {
              mech.morphRig = createMorphRigState(targetId);
            }
          }
          mech.specialActiveTimer = 1.0;
          if (mech.morphRig) {
            stepMorphRigState(mech.morphRig, {
              dt,
              speedRatio: 0.2,
              sprinting: false,
              angularVel: 0,
              tiltX: 0,
              recoilOffset: 0,
              reloading: false,
              reloadProgress: 0,
              chargingOrPreparing: targetId === 'sniper',
              braced: targetId === 'sniper' || targetId === 'artillery' || targetId === 'colossus',
              specialActive: true,
              airborne: Boolean(effTargetSpec.canFly),
              boosting: Boolean(effTargetSpec.canFly),
            });
          }
        }
        mech.phys.vel.x = 0;
        mech.phys.vel.y = 0;
        mech.phys.bodyAngle = turntableAngle;
        mech.phys.aimAngle = turntableAngle + Math.sin(t * 1.1) * 0.25;
      } else {
        mech.transform = null;
        mech.classId = inspectId;
        mech.spec = spec;
        mech.morphRig = undefined;
        mech.specialActiveTimer = 0;
        mech.legs.syncMorphSpecs(spec.legs, mech.phys.pos, mech.phys.bodyAngle);
      }

      if (animMode === 'fly' && spec.canFly) {
        if (!mech.flight) mech.flight = createFlightState(true, 76);
        mech.flight.isAirborne = true;
        mech.flight.altitude = 74 + Math.sin(t * 2.2) * 5;
        mech.flight.exhaustPower = 0.85;
        mech.flight.boosting = true;
        mech.phys.sprinting = true;
        mech.phys.bodyAngle = turntableAngle;
        mech.phys.aimAngle = turntableAngle + Math.sin(t * 1.2) * 0.25;
        const spd = spec.maxSpeed * 1.3;
        mech.phys.vel.x = Math.cos(turntableAngle) * spd;
        mech.phys.vel.y = Math.sin(turntableAngle) * spd;
        mech.phys.pos.x += mech.phys.vel.x * dt;
        mech.phys.pos.y += mech.phys.vel.y * dt;
      } else if (animMode !== 'morph') {
        if (mech.flight) {
          mech.flight.isAirborne = false;
          mech.flight.altitude = 0;
          mech.flight.exhaustPower = 0;
          mech.flight.boosting = false;
        }
        if (animMode === 'idle') {
          mech.phys.vel.x = 0;
          mech.phys.vel.y = 0;
          mech.phys.angularVel = 0;
          mech.phys.bodyAngle = turntableAngle;
          mech.phys.aimAngle = turntableAngle + Math.sin(t * 1.4) * 0.4;
        } else if (animMode === 'walk' || animMode === 'sprint') {
          const spd = animMode === 'sprint' ? spec.maxSpeed * 1.15 : spec.maxSpeed * 0.55;
          mech.phys.sprinting = animMode === 'sprint';
          mech.phys.bodyAngle = turntableAngle;
          mech.phys.aimAngle = turntableAngle + Math.sin(t * 1.2) * 0.25;
          mech.phys.vel.x = Math.cos(turntableAngle) * spd;
          mech.phys.vel.y = Math.sin(turntableAngle) * spd;
          mech.phys.pos.x += mech.phys.vel.x * dt;
          mech.phys.pos.y += mech.phys.vel.y * dt;
        } else if (animMode === 'turn') {
          mech.phys.vel.x = 0;
          mech.phys.vel.y = 0;
          mech.phys.angularVel = spec.maxTurnSpeed * 0.7;
          mech.phys.bodyAngle += mech.phys.angularVel * dt;
          mech.phys.aimAngle = mech.phys.bodyAngle;
        } else if (animMode === 'fire') {
          mech.phys.vel.x = 0;
          mech.phys.vel.y = 0;
          mech.phys.bodyAngle = turntableAngle;
          mech.phys.aimAngle = turntableAngle;
          if (inspectId === 'colossus') {
            mech.mortarPitch = 0.72 + Math.sin(t * 2.5) * 0.2;
            mech.gantryCycle = (t * 0.9) % 1;
          } else {
            mech.mortarPitch = 0;
            mech.gantryCycle = 0;
          }
          if (Math.sin(t * 8) > 0.85) {
            mech.phys.recoilOffset = inspectId === 'colossus' ? 11 : 8;
          } else {
            mech.phys.recoilOffset *= Math.exp(-14 * dt);
          }
        } else if (animMode === 'limp') {
          mech.health.leftLegs = 0;
          mech.phys.bodyAngle = turntableAngle;
          mech.phys.aimAngle = turntableAngle;
          mech.phys.vel.x = Math.cos(turntableAngle) * spec.maxSpeed * 0.35;
          mech.phys.vel.y = Math.sin(turntableAngle) * spec.maxSpeed * 0.35;
          mech.phys.pos.x += mech.phys.vel.x * dt;
          mech.phys.pos.y += mech.phys.vel.y * dt;
        }
      }

      if (animMode !== 'limp') {
        mech.health.leftLegs = mech.health.maxLeftLegs;
      }

      mech.legs.update(
        dt,
        mech.phys,
        {
          strideLength: spec.strideLength,
          stepHeight: spec.stepHeight,
          stepSpeed: spec.stepSpeed,
          maxSpeed: spec.maxSpeed,
          footstepWeight: spec.footstepWeight,
        },
        mech.health,
        [],
        {
          stanceSpreadMult:
            animMode === 'fire' && (inspectId === 'sniper' || inspectId === 'colossus') ? 1.32 : 1.0,
          airborne: animMode === 'fly' && spec.canFly,
        }
      );

      // Render centered on mech.phys.pos with scrolling floor grid to show foot planting!
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#10141a';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.scale(1.65, 1.65);
      ctx.translate(-mech.phys.pos.x, -mech.phys.pos.y);

      // Scrolling grid lines prove feet stay planted in world space!
      const grid = 48;
      const startX = Math.floor((mech.phys.pos.x - 200) / grid) * grid;
      const startY = Math.floor((mech.phys.pos.y - 160) / grid) * grid;
      ctx.strokeStyle = '#1c232d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = startX; gx <= mech.phys.pos.x + 200; gx += grid) {
        ctx.moveTo(gx, mech.phys.pos.y - 160);
        ctx.lineTo(gx, mech.phys.pos.y + 160);
      }
      for (let gy = startY; gy <= mech.phys.pos.y + 160; gy += grid) {
        ctx.moveTo(mech.phys.pos.x - 200, gy);
        ctx.lineTo(mech.phys.pos.x + 200, gy);
      }
      ctx.stroke();

      drawMechActor(ctx, mech, true);
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inspectId, animMode, turntableAngle, custom, spec]);

  const statRow = (label: string, val: number, max: number, unit: string, cmp?: number) => {
    const pct = Math.min(100, Math.round((val / max) * 100));
    const delta = cmp !== undefined ? val - cmp : 0;
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs font-mono-tabular">
          <span className="text-slate-400">{label}</span>
          <span className="text-slate-100">
            {Math.round(val)} {unit}
            {cmp !== undefined && delta !== 0 && (
              <span className={delta > 0 ? 'text-emerald-400 ml-1.5' : 'text-red-400 ml-1.5'}>
                ({delta > 0 ? '+' : ''}
                {Math.round(delta)})
              </span>
            )}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-800">
          <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-30 bg-[#0b0e12] flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">Unit Selection & Hangar</h2>
          <p className="text-xs text-slate-400">
            Inspect chassis kinematics, compare performance, configure upgrades, or deploy to Proving Grounds.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-mono-tabular text-amber-400 font-semibold">
            Credits: {save.credits}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-sm cursor-pointer"
          >
            Back to Menu
          </button>
        </div>
      </div>

      {/* Main 3-Column Hangar Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left: All 9 Mech Classes */}
        <div className="lg:col-span-3 border-r border-slate-800 overflow-y-auto p-4 space-y-2">
          {MECH_LIST.map((m) => {
            const unlocked = save.unlockedUnits.includes(m.id);
            const active = save.selectedUnit === m.id;
            const inspecting = inspectId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setInspectId(m.id);
                  if (!m.canFly && animMode === 'fly') setAnimMode('walk');
                  if (m.id !== 'proteus' && animMode === 'morph') setAnimMode('walk');
                }}
                className={`w-full p-3 rounded-sm border text-left transition-colors cursor-pointer ${
                  inspecting
                    ? 'bg-[#1a222e] border-amber-400'
                    : 'bg-[#12161d] border-slate-800 hover:bg-[#171d26]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-amber-400">{m.code}</span>
                  <span className={m.canFly && !active ? 'text-sky-400' : 'text-slate-400'}>
                    {active ? 'ACTIVE' : m.canFly ? 'VTOL · FLY' : unlocked ? `${m.legs.length} LEGS` : `${m.unlockCost} CR`}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-100 mt-0.5">{m.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{m.role}</div>
              </button>
            );
          })}
        </div>

        {/* Center: Live Procedural Leg & Flight Preview Canvas */}
        <div className="lg:col-span-5 flex flex-col border-r border-slate-800 bg-[#0e1217] p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display text-2xl font-bold text-slate-100">
                {spec.code} · {spec.name}
              </h3>
              <p className="text-xs text-slate-400">{spec.role}</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono-tabular text-slate-300 block">
                {spec.legs.length} Procedural Legs · {Math.round(stats.mass)}t
              </span>
              {spec.canFly && (
                <span className="text-[10px] font-mono-tabular text-sky-400 font-semibold">
                  CAN FLY · ROCKET THRUSTERS
                </span>
              )}
            </div>
          </div>

          <canvas
            ref={previewCanvasRef}
            width={520}
            height={300}
            className="w-full h-[270px] bg-[#10141a] border border-slate-800 rounded-sm"
          />

          {/* Animation State Tester */}
          <div className="mt-3">
            <div className="text-[11px] font-mono-tabular text-slate-400 mb-1.5">
              Procedural Gait & Mobility Preview State
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                (spec.canFly
                  ? ['idle', 'walk', 'sprint', 'fly', 'turn', 'fire', 'limp']
                  : inspectId === 'proteus'
                  ? ['idle', 'walk', 'sprint', 'turn', 'fire', 'limp', 'morph']
                  : ['idle', 'walk', 'sprint', 'turn', 'fire', 'limp']) as PreviewAnimMode[]
              ).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`hangar-anim-${mode}`}
                  onClick={() => setAnimMode(mode)}
                  className={`px-2.5 py-1 text-xs rounded-sm border cursor-pointer capitalize ${
                    animMode === mode
                      ? mode === 'fly' || mode === 'morph'
                        ? 'bg-sky-400 text-slate-950 border-sky-300 font-semibold'
                        : 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                      : 'bg-[#161b23] text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {mode === 'limp' ? 'Damaged Limp' : mode === 'fly' ? 'Rocket Flight' : mode === 'morph' ? 'Transform Preview' : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Rotation Slider */}
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="hangar-rotate" className="text-xs text-slate-400 font-mono-tabular shrink-0">
              Chassis Angle
            </label>
            <input
              id="hangar-rotate"
              type="range"
              min={-3.14}
              max={3.14}
              step={0.05}
              value={turntableAngle}
              onChange={(e) => setTurntableAngle(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500"
            />
          </div>

          <p className="text-xs text-slate-300 leading-relaxed mt-3">{spec.description}</p>

          {/* Action Footer */}
          <div className="flex flex-wrap gap-2.5 mt-auto pt-4">
            {!isUnlocked ? (
              <button
                type="button"
                disabled={save.credits < spec.unlockCost}
                onClick={() => onUnlockUnit(inspectId, spec.unlockCost)}
                className="flex-1 py-2.5 px-4 bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-sm cursor-pointer"
              >
                Unlock Chassis ({spec.unlockCost} Credits)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectUnit(inspectId)}
                className={`flex-1 py-2.5 px-4 font-semibold text-sm rounded-sm cursor-pointer ${
                  save.selectedUnit === inspectId
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {save.selectedUnit === inspectId ? 'Selected for Combat' : 'Select Active Chassis'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onTestInTraining(inspectId)}
              className="py-2.5 px-4 bg-[#1c2430] hover:bg-slate-700 border border-slate-600 text-slate-100 text-sm font-medium rounded-sm cursor-pointer"
            >
              Test in Training
            </button>
          </div>
        </div>

        {/* Right: Specs, Comparison, Upgrades & Paint */}
        <div className="lg:col-span-4 flex flex-col overflow-hidden p-5">
          <div className="flex gap-1.5 border-b border-slate-800 pb-3 shrink-0">
            {(['specs', 'upgrades', 'paint'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm capitalize cursor-pointer ${
                  tab === t ? 'bg-amber-500 text-slate-950 font-semibold' : 'bg-[#161b23] text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t === 'specs' ? 'Specs & Compare' : t === 'upgrades' ? 'Upgrades' : 'Loadout & Paint'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pt-4 space-y-4">
            {tab === 'specs' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="compare-select" className="text-xs text-slate-400">
                    Compare against:
                  </label>
                  <select
                    id="compare-select"
                    value={compareId}
                    onChange={(e) => setCompareId(e.target.value as MechClassId | 'none')}
                    className="bg-[#151a22] border border-slate-700 text-xs text-slate-100 px-2.5 py-1.5 rounded-sm"
                  >
                    <option value="none">No comparison</option>
                    {MECH_LIST.filter((m) => m.id !== inspectId).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2.5">
                  {statRow('Top Speed', stats.maxSpeed, 200, 'm/s', compareStats?.maxSpeed)}
                  {statRow('Acceleration', stats.acceleration, 320, 'N/t', compareStats?.acceleration)}
                  {statRow('Turn Speed', stats.turnSpeed * 57.3, 180, 'deg/s', compareStats ? compareStats.turnSpeed * 57.3 : undefined)}
                  {statRow('Hull Integrity', stats.chassis, 340, 'HP', compareStats?.chassis)}
                  {statRow('Armor Plating', stats.armor, 360, 'AP', compareStats?.armor)}
                  {statRow('Sensor Range', stats.sensorRange, 1400, 'm', compareStats?.sensorRange)}
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-2.5 text-xs">
                  <div>
                    <div className="text-slate-400 font-mono-tabular">Primary Weapon</div>
                    <div className="text-slate-100 font-semibold">{spec.primaryWeapon.name}</div>
                    <div className="text-slate-400">
                      Dmg {Math.round(spec.primaryWeapon.damage * stats.damageMult)} · Rate {spec.primaryWeapon.fireRate}/s · Range {spec.primaryWeapon.range}m
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-mono-tabular">Secondary Weapon</div>
                    <div className="text-slate-100 font-semibold">{spec.secondaryWeapon.name}</div>
                    <div className="text-slate-400">
                      Dmg {Math.round(spec.secondaryWeapon.damage * stats.damageMult)} · Mag {spec.secondaryWeapon.magazineSize}
                    </div>
                  </div>
                  <div>
                    <div className="text-sky-400 font-mono-tabular">Point Defense (AI AA)</div>
                    <div className="text-slate-100 font-semibold capitalize">
                      {aaSpec.mountStyle.replace('_', ' ')} + ICM
                    </div>
                    <div className="text-slate-400">
                      CIWS {aaSpec.range}m · {aaSpec.fireRate.toFixed(0)}/s · Hit {Math.round(aaSpec.baseAccuracy * 100)}% · ICM {aaSpec.interceptorRange}m
                    </div>
                  </div>
                  <div>
                    <div className="text-amber-400 font-mono-tabular">Special Ability</div>
                    <div className="text-slate-100 font-semibold">{spec.specialAbility.name}</div>
                    <div className="text-slate-400">{spec.specialAbility.description}</div>
                  </div>
                  {inspectId === 'colossus' && (
                    <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
                      <div className="text-amber-300 font-mono-tabular">240mm Mortar Munitions ([F] Switch)</div>
                      <div className="space-y-1">
                        {MORTAR_AMMO_ORDER.map((ammoId) => {
                          const ammo = MORTAR_AMMO_SPECS[ammoId];
                          return (
                            <div
                              key={ammo.id}
                              className="p-2 bg-[#131820] border border-slate-800 rounded-sm flex items-start gap-2"
                            >
                              <span
                                className="px-1.5 py-0.5 text-[10px] font-mono-tabular font-bold rounded-sm shrink-0 text-slate-950"
                                style={{ backgroundColor: ammo.color }}
                              >
                                {ammo.code}
                              </span>
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold text-slate-100">{ammo.name}</div>
                                <div className="text-[10px] text-slate-400 leading-snug">{ammo.shortDesc}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'upgrades' && (
              <div className="space-y-2.5">
                <div className="flex gap-1.5 pb-1">
                  {(
                    [
                      ['all', 'All Systems'],
                      ['chassis', 'Chassis'],
                      ['anti_air', 'Anti-Air PD'],
                    ] as const
                  ).map(([fk, flbl]) => (
                    <button
                      key={fk}
                      type="button"
                      onClick={() => setUpgradeFilter(fk)}
                      className={`px-2.5 py-1 text-[11px] font-mono-tabular rounded-sm border cursor-pointer ${
                        upgradeFilter === fk
                          ? fk === 'anti_air'
                            ? 'bg-sky-500 text-slate-950 border-sky-400 font-semibold'
                            : 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-[#131820] text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {flbl}
                    </button>
                  ))}
                </div>
                {UPGRADES.filter(
                  (u) => upgradeFilter === 'all' || (u.category ?? 'chassis') === upgradeFilter
                ).map((u) => {
                  const lvl = custom.upgrades[u.id] ?? 0;
                  const cost = u.costPerLevel * (lvl + 1);
                  const maxed = lvl >= u.maxLevel;
                  const isAA = u.category === 'anti_air';
                  return (
                    <div
                      key={u.id}
                      className={`p-3 bg-[#131820] border rounded-sm ${
                        isAA ? 'border-sky-900/65' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100">{u.name}</span>
                        <span
                          className={`text-[11px] font-mono-tabular ${
                            isAA ? 'text-sky-400' : 'text-amber-400'
                          }`}
                        >
                          Lv {lvl}/{u.maxLevel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1">{u.description}</p>
                      <p className="text-[11px] text-orange-400/90 mt-0.5">Trade-off: {u.tradeOff}</p>
                      <button
                        type="button"
                        disabled={maxed || save.credits < cost || !isUnlocked}
                        onClick={() => onPurchaseUpgrade(inspectId, u.id, cost)}
                        className="mt-2 w-full py-1.5 text-xs font-medium bg-slate-800 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-45 text-slate-100 rounded-sm cursor-pointer transition-colors"
                      >
                        {maxed ? 'Maxed Out' : !isUnlocked ? 'Unlock Unit First' : `Upgrade (${cost} Credits)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'paint' && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-slate-300 mb-2">Camouflage & Trim</div>
                  <div className="grid grid-cols-2 gap-2">
                    {PAINT_SCHEMES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onUpdateCustomization(inspectId, { ...custom, paintId: p.id })}
                        className={`p-2 rounded-sm border flex items-center gap-2 text-xs cursor-pointer ${
                          custom.paintId === p.id
                            ? 'border-amber-400 bg-[#1a222d] text-slate-100'
                            : 'border-slate-800 bg-[#13171e] text-slate-300'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: p.primary }} />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-300 mb-1.5">Weapon Feed Configuration</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['standard', 'Standard'],
                        ['heavy_barrel', 'Heavy Barrel'],
                        ['rapid_feed', 'Rapid Feed'],
                      ] as const
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onUpdateCustomization(inspectId, { ...custom, weaponVariant: k })}
                        className={`py-1.5 px-2 text-xs rounded-sm border cursor-pointer ${
                          custom.weaponVariant === k
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : 'border-slate-800 bg-[#13171e] text-slate-300'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-300 mb-1.5">Armor Configuration</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['standard', 'Balanced'],
                        ['reactive', 'Heavy Reactive'],
                        ['lightweight', 'Ultralight'],
                      ] as const
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onUpdateCustomization(inspectId, { ...custom, armorPackage: k })}
                        className={`py-1.5 px-2 text-xs rounded-sm border cursor-pointer ${
                          custom.armorPackage === k
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : 'border-slate-800 bg-[#13171e] text-slate-300'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
