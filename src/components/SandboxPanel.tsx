import React, { useMemo, useState } from 'react';
import {
  buildSandboxRegistry,
  SANDBOX_BEHAVIOR_LABELS,
  SANDBOX_CATEGORY_LABELS,
  SandboxBehaviorMode,
  SandboxCategoryId,
  SandboxStateSnapshot,
  SandboxTeamChoice,
} from '../game/sandboxRegistry';
import { HudSnapshot } from '../game/types';

interface SandboxPanelProps {
  hud: HudSnapshot;
  sandbox: SandboxStateSnapshot;
  onSpawnEntry: (
    entryId: string,
    count: number,
    team?: SandboxTeamChoice,
    behavior?: SandboxBehaviorMode
  ) => void;
  onRemoveLast: () => void;
  onClearAll: () => void;
  onResetEnvironment: () => void;
  onToggleSimPause: () => void;
  onToggleGodMode: () => void;
  onToggleInfiniteAmmo: () => void;
  onHealAll: () => void;
  onDamageLimb: () => void;
  onTriggerBossUltimate: () => void;
  onSetBehavior: (behavior: SandboxBehaviorMode) => void;
  onSetTuning: (partial: Partial<{ speedMult: number; aggressionMult: number }>) => void;
}

const CATEGORIES: SandboxCategoryId[] = [
  'player_units',
  'friendly_units',
  'hostile_units',
  'elite_units',
  'bosses',
  'revenants',
];

const BEHAVIORS: SandboxBehaviorMode[] = [
  'aggressive',
  'attack_player',
  'attack_hostiles',
  'follow',
  'patrol',
  'defensive',
  'friendly_support',
  'idle',
];

const SPAWN_COUNTS = [1, 2, 3, 5];

export const SandboxPanel: React.FC<SandboxPanelProps> = ({
  hud,
  sandbox,
  onSpawnEntry,
  onRemoveLast,
  onClearAll,
  onResetEnvironment,
  onToggleSimPause,
  onToggleGodMode,
  onToggleInfiniteAmmo,
  onHealAll,
  onDamageLimb,
  onTriggerBossUltimate,
  onSetBehavior,
  onSetTuning,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SandboxCategoryId>('revenants');
  const [spawnCount, setSpawnCount] = useState<number>(1);
  const [teamChoice, setTeamChoice] = useState<SandboxTeamChoice>('enemy');

  const registry = useMemo(() => buildSandboxRegistry(), []);
  const categoryEntries = useMemo(
    () => registry.filter((e) => e.category === activeCategory),
    [registry, activeCategory]
  );

  const handleSelectCategory = (cat: SandboxCategoryId) => {
    setActiveCategory(cat);
    if (cat === 'friendly_units' || cat === 'player_units') {
      setTeamChoice('player');
    } else {
      setTeamChoice('enemy');
    }
  };

  const quickSpawnBoss = () => {
    const bosses = registry.filter((e) => e.category === 'bosses');
    if (bosses.length === 0) return;
    const pick = bosses[Math.floor(Math.random() * bosses.length)];
    onSpawnEntry(pick.id, 1, 'enemy', sandbox.behaviorMode);
  };

  const quickSpawnRevenant = () => {
    const revs = registry.filter((e) => e.category === 'revenants');
    if (revs.length === 0) return;
    const pick = revs[Math.floor(Math.random() * revs.length)];
    onSpawnEntry(pick.id, 1, 'enemy', sandbox.behaviorMode);
  };

  if (collapsed) {
    return (
      <div
        data-testid="sandbox-panel-collapsed"
        className="self-center pointer-events-auto flex items-center gap-1.5"
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            setCollapsed(false);
          }}
          className="px-3 py-1 bg-[#0a0e14]/90 border border-amber-500/60 hover:border-amber-400 text-[10px] font-mono-tabular font-semibold tracking-wider text-amber-300 cursor-pointer"
        >
          + SANDBOX [{sandbox.activeSpawnedCount}/{sandbox.maxSpawnedCount}]
        </button>
        {sandbox.simPaused && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleSimPause();
            }}
            className="px-2 py-1 bg-amber-500 text-slate-950 text-[10px] font-mono-tabular font-bold cursor-pointer"
          >
            SIM PAUSED · RESUME
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="sandbox-panel"
      className="self-center pointer-events-auto w-full max-w-[920px] bg-[#0a0e14]/92 border border-slate-700/85 shadow-[0_6px_28px_rgba(0,0,0,0.65)] px-2.5 py-2 flex flex-col gap-1.5 text-[10px] font-mono-tabular"
    >
      {/* Top Control & Environment Strip */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800/90 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold tracking-widest">SANDBOX</span>
          <span className="text-slate-400">
            UNITS {sandbox.activeSpawnedCount}/{sandbox.maxSpawnedCount}
          </span>
          {sandbox.activeBossCount > 0 && (
            <span className="text-red-400 font-semibold">BOSS:{sandbox.activeBossCount}</span>
          )}
          {sandbox.activeRevenantCount > 0 && (
            <span className="text-purple-300 font-semibold">REV:{sandbox.activeRevenantCount}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            data-testid="sandbox-quick-boss"
            onClick={(e) => {
              e.currentTarget.blur();
              quickSpawnBoss();
            }}
            className="px-1.5 py-0.5 bg-red-950/85 hover:bg-red-900 border border-red-600/70 text-red-200 cursor-pointer"
          >
            +BOSS
          </button>
          <button
            type="button"
            tabIndex={-1}
            data-testid="sandbox-quick-revenant"
            onClick={(e) => {
              e.currentTarget.blur();
              quickSpawnRevenant();
            }}
            className="px-1.5 py-0.5 bg-purple-950/85 hover:bg-purple-900 border border-purple-500/70 text-purple-200 cursor-pointer"
          >
            +REVENANT
          </button>
          {hud.boss && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerBossUltimate();
              }}
              className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold cursor-pointer"
            >
              BOSS ULT
            </button>
          )}
          <span className="text-slate-700">|</span>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleSimPause();
            }}
            className={`px-1.5 py-0.5 border cursor-pointer ${
              sandbox.simPaused
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {sandbox.simPaused ? 'RESUME' : 'PAUSE AI'}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleGodMode();
            }}
            className={`px-1.5 py-0.5 border cursor-pointer ${
              sandbox.godMode
                ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            GOD:{sandbox.godMode ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleInfiniteAmmo();
            }}
            className={`px-1.5 py-0.5 border cursor-pointer ${
              sandbox.infiniteAmmo
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            INF AMMO
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onHealAll();
            }}
            className="px-1.5 py-0.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/70 text-emerald-200 cursor-pointer"
          >
            HEAL
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onDamageLimb();
            }}
            className="px-1.5 py-0.5 bg-red-950/70 hover:bg-red-900 border border-red-800/70 text-red-200 cursor-pointer"
            title="Test limb damage on player"
          >
            LIMB DMG
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRemoveLast();
            }}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
          >
            UNDO
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onClearAll();
            }}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-red-950 border border-slate-700 text-slate-200 cursor-pointer"
          >
            CLEAR
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onResetEnvironment();
            }}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 cursor-pointer"
          >
            RESET
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setCollapsed(true);
            }}
            className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 cursor-pointer"
            title="Collapse Sandbox Panel"
          >
            –
          </button>
        </div>
      </div>

      {/* Category Tabs + Spawn Modifiers */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Sandbox Categories">
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            const isRev = cat === 'revenants';
            const isBoss = cat === 'bosses';
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`sandbox-tab-${cat}`}
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleSelectCategory(cat);
                }}
                className={`px-2 py-0.5 border tracking-wider cursor-pointer transition-colors ${
                  active
                    ? isRev
                      ? 'bg-purple-600 text-white border-purple-400 font-bold'
                      : isBoss
                      ? 'bg-red-600 text-white border-red-400 font-bold'
                      : 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-[#121720] text-slate-300 border-slate-700/80 hover:bg-slate-800'
                }`}
              >
                {SANDBOX_CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>

        {/* Count, Team, AI Behavior & Speed/Aggro Steppers */}
        <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
          {activeCategory !== 'player_units' && activeCategory !== 'bosses' && (
            <div className="flex items-center gap-0.5">
              <span className="text-slate-500 mr-0.5">QTY</span>
              {SPAWN_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setSpawnCount(n);
                  }}
                  className={`px-1.5 py-0.5 border cursor-pointer ${
                    spawnCount === n
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
                      : 'bg-[#121720] border-slate-700 text-slate-400'
                  }`}
                >
                  {n}x
                </button>
              ))}
            </div>
          )}

          {activeCategory !== 'player_units' && activeCategory !== 'bosses' && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setTeamChoice('player');
                }}
                className={`px-1.5 py-0.5 border cursor-pointer ${
                  teamChoice === 'player'
                    ? 'bg-sky-500/25 border-sky-400 text-sky-200 font-bold'
                    : 'bg-[#121720] border-slate-700 text-slate-400'
                }`}
              >
                ALLY
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setTeamChoice('enemy');
                }}
                className={`px-1.5 py-0.5 border cursor-pointer ${
                  teamChoice === 'enemy'
                    ? 'bg-red-500/25 border-red-400 text-red-200 font-bold'
                    : 'bg-[#121720] border-slate-700 text-slate-400'
                }`}
              >
                HOSTILE
              </button>
            </div>
          )}

          <select
            aria-label="AI Behavior Mode"
            value={sandbox.behaviorMode}
            onChange={(e) => {
              onSetBehavior(e.target.value as SandboxBehaviorMode);
              e.currentTarget.blur();
            }}
            className="bg-[#121720] border border-slate-700 text-slate-200 px-1.5 py-0.5 text-[9px] font-mono-tabular cursor-pointer"
          >
            {BEHAVIORS.map((b) => (
              <option key={b} value={b}>
                AI: {SANDBOX_BEHAVIOR_LABELS[b]}
              </option>
            ))}
          </select>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              const next = sandbox.speedMult >= 1.8 ? 0.75 : Number((sandbox.speedMult + 0.25).toFixed(2));
              onSetTuning({ speedMult: next });
            }}
            className="px-1.5 py-0.5 bg-[#121720] hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
            title="Cycle Sandbox Unit Speed Multiplier"
          >
            SPD {sandbox.speedMult.toFixed(2)}x
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              const next = sandbox.aggressionMult >= 2.0 ? 0.75 : Number((sandbox.aggressionMult + 0.25).toFixed(2));
              onSetTuning({ aggressionMult: next });
            }}
            className="px-1.5 py-0.5 bg-[#121720] hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
            title="Cycle Sandbox AI Aggression Multiplier"
          >
            AGG {sandbox.aggressionMult.toFixed(2)}x
          </button>
        </div>
      </div>

      {/* Spawnable Unit Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 max-h-[112px] overflow-y-auto pr-0.5">
        {categoryEntries.map((entry) => {
          const isActivePlayer =
            entry.kind === 'switch_player' && entry.mechClassId === hud.unitId;
          const isActiveBoss =
            entry.kind === 'boss' && hud.boss?.variantId === entry.bossVariantId;

          return (
            <button
              key={entry.id}
              type="button"
              tabIndex={-1}
              data-testid={`sandbox-spawn-${entry.id}`}
              onClick={(e) => {
                e.currentTarget.blur();
                const effTeam = entry.supportsTeamToggle ? teamChoice : entry.defaultTeam;
                const effCount = entry.kind === 'switch_player' || entry.kind === 'boss' ? 1 : spawnCount;
                onSpawnEntry(entry.id, effCount, effTeam, sandbox.behaviorMode);
              }}
              className={`px-2 py-1 text-left border cursor-pointer transition-colors flex flex-col gap-0.5 ${
                isActivePlayer
                  ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                  : isActiveBoss
                  ? 'bg-red-600/30 border-red-400 text-red-100'
                  : entry.kind === 'revenant'
                  ? 'bg-[#170f24]/90 hover:bg-[#241538] border-purple-700/70 text-purple-100'
                  : 'bg-[#121720]/90 hover:bg-[#1c2432] border-slate-700/80 text-slate-200'
              }`}
              title={`${entry.name} — ${entry.subtitle}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className="text-[9px] font-bold tracking-wider truncate"
                  style={{ color: entry.accentColor }}
                >
                  {entry.code}
                </span>
                {entry.kind !== 'switch_player' && entry.kind !== 'boss' && (
                  <span className="text-[8px] text-slate-500">+{spawnCount}</span>
                )}
              </div>
              <span className="text-[10px] font-medium truncate leading-tight">
                {entry.name.replace('REVENANT // ', '')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
