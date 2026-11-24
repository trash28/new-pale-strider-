import React, { useState } from 'react';
import {
  BossEncounterConfig,
  BossSpawnDistance,
  DEFAULT_SKIRMISH_BOSS_CONFIG,
} from '../game/bossDirector';
import { BOSS_VARIANT_LIST } from '../game/bossVariants';
import { MECH_LIST } from '../game/mechRoster';
import { MAP_OPTIONS, SkirmishConfig } from '../game/missions';
import { MapId, MechClassId } from '../game/types';

interface SkirmishSetupProps {
  defaultUnit: MechClassId;
  unlockedUnits: MechClassId[];
  onLaunch: (cfg: SkirmishConfig) => void;
  onClose: () => void;
}

export const SkirmishSetup: React.FC<SkirmishSetupProps> = ({
  defaultUnit,
  unlockedUnits,
  onLaunch,
  onClose,
}) => {
  const [mapId, setMapId] = useState<MapId>('urban');
  const [playerUnit, setPlayerUnit] = useState<MechClassId>(defaultUnit);
  const [allyUnits, setAllyUnits] = useState<MechClassId[]>(['heavy', 'engineer', 'sniper', 'phantom']);
  const [difficulty, setDifficulty] = useState<'recruit' | 'veteran' | 'ace'>('veteran');
  const [enemyCount, setEnemyCount] = useState<number>(6);
  const [bossConfig, setBossConfig] = useState<BossEncounterConfig>(DEFAULT_SKIRMISH_BOSS_CONFIG);

  const toggleAlly = (idx: number, id: MechClassId) => {
    const next = [...allyUnits];
    next[idx] = id;
    setAllyUnits(next);
  };

  const addAlly = () => {
    if (allyUnits.length < 4) setAllyUnits([...allyUnits, 'standard']);
  };

  const removeAlly = () => {
    if (allyUnits.length > 0) setAllyUnits(allyUnits.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-30 bg-[#0b0e12] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">Skirmish Configuration</h2>
          <p className="text-xs text-slate-400">Customize battlefield sector, squad composition, and hostile force.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-sm cursor-pointer"
        >
          Back to Menu
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Battlefield Selector */}
          <div className="space-y-3">
            <h3 className="font-display text-lg font-semibold text-slate-200">Battlefield Sector</h3>
            <div className="space-y-2">
              {MAP_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMapId(m.id)}
                  className={`w-full px-4 py-2.5 rounded-sm border text-left flex items-center justify-between cursor-pointer ${
                    mapId === m.id
                      ? 'bg-[#1a222d] border-amber-400 text-slate-100'
                      : 'bg-[#12161d] border-slate-800 text-slate-300 hover:bg-[#171d26]'
                  }`}
                >
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="text-xs font-mono-tabular text-slate-400">{m.region}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Squad & Enemy Parameters */}
          <div className="space-y-5">
            <div>
              <label htmlFor="skirmish-unit" className="block text-xs font-mono-tabular text-slate-400 mb-1.5">
                Player Chassis
              </label>
              <select
                id="skirmish-unit"
                value={playerUnit}
                onChange={(e) => setPlayerUnit(e.target.value as MechClassId)}
                className="w-full bg-[#131820] border border-slate-700 px-3 py-2 text-sm text-slate-100 rounded-sm"
              >
                {MECH_LIST.filter((m) => unlockedUnits.includes(m.id)).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono-tabular text-slate-400">
                  Allied Wingmen ({allyUnits.length}/4 · {allyUnits.length + 1}/5 Squad)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={removeAlly}
                    disabled={allyUnits.length === 0}
                    className="px-2 py-0.5 text-xs bg-slate-800 disabled:opacity-40 text-slate-200 rounded-sm cursor-pointer"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={addAlly}
                    disabled={allyUnits.length >= 4}
                    className="px-2 py-0.5 text-xs bg-slate-800 disabled:opacity-40 text-slate-200 rounded-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {allyUnits.map((allyId, idx) => (
                  <select
                    key={idx}
                    aria-label={`Wingman ${idx + 2} Chassis`}
                    value={allyId}
                    onChange={(e) => toggleAlly(idx, e.target.value as MechClassId)}
                    className="w-full bg-[#131820] border border-slate-700 px-3 py-2 text-xs text-slate-200 rounded-sm"
                  >
                    {MECH_LIST.map((m) => (
                      <option key={m.id} value={m.id}>
                        Wardog-{idx + 2}: {m.name}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-mono-tabular text-slate-400 mb-1.5">AI Difficulty</span>
              <div className="grid grid-cols-3 gap-2">
                {(['recruit', 'veteran', 'ace'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`py-2 text-xs font-medium capitalize rounded-sm border cursor-pointer ${
                      difficulty === d
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                        : 'bg-[#131820] text-slate-300 border-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono-tabular text-slate-400 mb-1.5">
                <label htmlFor="enemy-count">Hostile Force Size</label>
                <span className="text-amber-400">{enemyCount} Units</span>
              </div>
              <input
                id="enemy-count"
                type="range"
                min={3}
                max={16}
                step={1}
                value={enemyCount}
                onChange={(e) => setEnemyCount(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Thunderhead Boss Encounter */}
            <div className="p-3.5 bg-[#11161d] border border-red-900/50 rounded-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono-tabular font-semibold text-red-400">
                  THUNDERHEAD BOSS ENCOUNTER
                </span>
                <span className="text-[11px] font-mono-tabular text-slate-400">
                  {bossConfig.variant === 'none' ? 'Disabled' : 'Enabled'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="boss-variant" className="block text-[11px] font-mono-tabular text-slate-400 mb-1">
                    Boss Variant
                  </label>
                  <select
                    id="boss-variant"
                    value={bossConfig.variant}
                    onChange={(e) =>
                      setBossConfig({
                        ...bossConfig,
                        variant: e.target.value as BossEncounterConfig['variant'],
                      })
                    }
                    className="w-full bg-[#151b24] border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100 rounded-sm"
                  >
                    <option value="none">None (Standard Forces)</option>
                    <option value="random">Random Thunderhead</option>
                    {BOSS_VARIANT_LIST.map((bv) => (
                      <option key={bv.id} value={bv.id}>
                        {bv.code} · {bv.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="boss-dist" className="block text-[11px] font-mono-tabular text-slate-400 mb-1">
                    Spawn Distance
                  </label>
                  <select
                    id="boss-dist"
                    disabled={bossConfig.variant === 'none'}
                    value={bossConfig.spawnDistance}
                    onChange={(e) =>
                      setBossConfig({
                        ...bossConfig,
                        spawnDistance: e.target.value as BossSpawnDistance,
                      })
                    }
                    className="w-full bg-[#151b24] border border-slate-700 disabled:opacity-45 px-2.5 py-1.5 text-xs text-slate-100 rounded-sm"
                  >
                    <option value="near">Near (Immediate Contact)</option>
                    <option value="medium">Medium Sector</option>
                    <option value="far">Far Artillery Horizon</option>
                  </select>
                </div>
              </div>

              {bossConfig.variant !== 'none' && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 text-[11px] font-mono-tabular">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-0.5">
                      <span>Hull / Armor</span>
                      <span className="text-red-300">{bossConfig.healthMult.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.25}
                      value={bossConfig.healthMult}
                      onChange={(e) =>
                        setBossConfig({ ...bossConfig, healthMult: parseFloat(e.target.value) })
                      }
                      className="w-full accent-red-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400 mb-0.5">
                      <span>Mobility Speed</span>
                      <span className="text-red-300">{bossConfig.speedMult.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.75}
                      max={1.5}
                      step={0.05}
                      value={bossConfig.speedMult}
                      onChange={(e) =>
                        setBossConfig({ ...bossConfig, speedMult: parseFloat(e.target.value) })
                      }
                      className="w-full accent-red-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400 mb-0.5">
                      <span>Ordnance Damage</span>
                      <span className="text-red-300">{bossConfig.damageMult.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.1}
                      value={bossConfig.damageMult}
                      onChange={(e) =>
                        setBossConfig({ ...bossConfig, damageMult: parseFloat(e.target.value) })
                      }
                      className="w-full accent-red-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400 mb-0.5">
                      <span>Aggression & Cadence</span>
                      <span className="text-red-300">{bossConfig.aggression.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.75}
                      max={1.5}
                      step={0.05}
                      value={bossConfig.aggression}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setBossConfig({ ...bossConfig, aggression: val, attackFreq: val });
                      }}
                      className="w-full accent-red-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              data-start="true"
              onClick={() =>
                onLaunch({
                  mapId,
                  playerUnit,
                  allyUnits,
                  difficulty,
                  enemyCount,
                  bossConfig,
                })
              }
              className="w-full py-3 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-sm cursor-pointer mt-4"
            >
              Launch Skirmish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
