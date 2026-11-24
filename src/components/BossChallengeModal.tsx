import React, { useState } from 'react';
import { BossChallengeConfig, BossVariantId, WARHEAD_LABELS } from '../game/bossTypes';
import { BOSS_VARIANT_LIST, BOSS_VARIANTS } from '../game/bossVariants';
import { MECH_LIST } from '../game/mechRoster';
import { MAP_OPTIONS } from '../game/missions';
import { MapId, MechClassId } from '../game/types';

interface BossChallengeModalProps {
  defaultUnit: MechClassId;
  unlockedUnits: MechClassId[];
  onLaunch: (cfg: BossChallengeConfig) => void;
  onClose: () => void;
}

export const BossChallengeModal: React.FC<BossChallengeModalProps> = ({
  defaultUnit,
  unlockedUnits,
  onLaunch,
  onClose,
}) => {
  const [variantId, setVariantId] = useState<BossVariantId>('siege');
  const [mapId, setMapId] = useState<MapId>('desert');
  const [playerUnit, setPlayerUnit] = useState<MechClassId>(defaultUnit);
  const [difficulty, setDifficulty] = useState<BossChallengeConfig['difficulty']>('veteran');

  const spec = BOSS_VARIANTS[variantId];

  return (
    <div className="fixed inset-0 z-30 bg-[#0b0e12] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-100">Thunderhead Boss Hunt</h2>
          <p className="text-xs text-slate-400">Select Strategic Artillery Variant · Target Weak Points to Cripple Bombardment</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-sm cursor-pointer"
        >
          Back to Menu
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left: 5 Thunderhead Variants */}
        <div className="lg:col-span-5 border-r border-slate-800 p-5 space-y-2.5 overflow-y-auto">
          <div className="text-xs font-mono-tabular text-slate-400 mb-1">Select Thunderhead Variant (5 Active Classes)</div>
          {BOSS_VARIANT_LIST.map((v) => {
            const active = variantId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={`w-full p-4 rounded-sm border text-left cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#1a222d] border-amber-400'
                    : 'bg-[#12161d] border-slate-800 hover:bg-[#171d26]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-amber-400 font-semibold">{v.code}</span>
                  <span className="text-red-400">{v.threatClass}</span>
                </div>
                <div className="text-base font-semibold text-slate-100 mt-1">{v.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{v.subtitle} · {v.legs.length} Legs</div>
              </button>
            );
          })}
        </div>

        {/* Right: Selected Variant Telemetry & Deployment Config */}
        <div className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
          <div className="max-w-2xl space-y-5">
            <div>
              <div className="text-xs font-mono-tabular text-amber-400">
                {spec.code} · {spec.threatClass} · {spec.legs.length} Articulated Legs
              </div>
              <h3 className="font-display text-3xl font-bold text-slate-100 mt-1">{spec.name}</h3>
              <p className="text-sm text-slate-300 leading-relaxed mt-2">{spec.description}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tabular text-xs border-y border-slate-800 py-4">
              <div>
                <div className="text-slate-400">Chassis Hull</div>
                <div className="text-lg font-semibold text-slate-100">{spec.maxHull}</div>
              </div>
              <div>
                <div className="text-slate-400">Armor Plating</div>
                <div className="text-lg font-semibold text-amber-400">{spec.maxArmor}</div>
              </div>
              <div>
                <div className="text-slate-400">Mass</div>
                <div className="text-lg font-semibold text-slate-100">{spec.mass} t</div>
              </div>
              <div>
                <div className="text-slate-400">Salvo Size</div>
                <div className="text-lg font-semibold text-red-400">{spec.mortarSalvoCount}x Shell</div>
              </div>
            </div>

            <div className="text-xs">
              <div className="font-mono-tabular text-slate-400 mb-1.5">Strategic Warhead Loadout</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(spec.warheadRotation)).map((w) => (
                  <span
                    key={w}
                    className="px-2.5 py-1 bg-[#141a23] border border-slate-700 text-slate-200 font-mono-tabular rounded-sm"
                  >
                    {WARHEAD_LABELS[w]}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="boss-map-select" className="block font-mono-tabular text-slate-400 mb-1.5">
                  Battlefield Sector
                </label>
                <select
                  id="boss-map-select"
                  value={mapId}
                  onChange={(e) => setMapId(e.target.value as MapId)}
                  className="w-full px-3 py-2 bg-[#141922] border border-slate-700 text-slate-100 rounded-sm"
                >
                  {MAP_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.region})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="boss-unit-select" className="block font-mono-tabular text-slate-400 mb-1.5">
                  Player Chassis
                </label>
                <select
                  id="boss-unit-select"
                  value={playerUnit}
                  onChange={(e) => setPlayerUnit(e.target.value as MechClassId)}
                  className="w-full px-3 py-2 bg-[#141922] border border-slate-700 text-slate-100 rounded-sm"
                >
                  {MECH_LIST.filter((m) => unlockedUnits.includes(m.id)).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="text-xs font-mono-tabular text-slate-400 mb-1.5">Engagement Difficulty</div>
              <div className="flex gap-2">
                {(['standard', 'veteran', 'cataclysmic'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`px-3.5 py-2 text-xs font-mono-tabular uppercase rounded-sm border cursor-pointer ${
                      difficulty === d
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                        : 'bg-[#141922] text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-6 mt-6 border-t border-slate-800 max-w-2xl">
            <button
              type="button"
              data-start="true"
              onClick={() =>
                onLaunch({
                  variantId,
                  mapId,
                  playerUnit,
                  allyUnits: ['heavy', 'engineer', 'sniper', 'phantom'],
                  difficulty,
                })
              }
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-sm cursor-pointer"
            >
              Engage {spec.code} {spec.name}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 bg-[#171d26] hover:bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
