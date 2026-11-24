import React from 'react';
import { MECH_ROSTER } from '../game/mechRoster';
import { MechClassId } from '../game/types';

interface MainMenuProps {
  selectedUnit: MechClassId;
  credits: number;
  completedMissions: number[];
  highestWave: number;
  onQuickDeploy: () => void;
  onOpenCampaign: () => void;
  onOpenBossChallenge: () => void;
  onOpenSkirmish: () => void;
  onStartSurvival: () => void;
  onStartTraining: () => void;
  onStartFreeRoam: () => void;
  onOpenHangar: () => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  selectedUnit,
  credits,
  completedMissions,
  highestWave,
  onQuickDeploy,
  onOpenCampaign,
  onOpenBossChallenge,
  onOpenSkirmish,
  onStartSurvival,
  onStartTraining,
  onStartFreeRoam,
  onOpenHangar,
  onOpenSettings,
}) => {
  const unit = MECH_ROSTER[selectedUnit];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none select-none">
      {/* Left dark tactical scrim leaving right 55% battlefield live & clearly visible */}
      <div
        className="absolute inset-y-0 left-0 w-full max-w-[600px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(11, 14, 18, 0.96) 0%, rgba(11, 14, 18, 0.88) 72%, rgba(11, 14, 18, 0) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col justify-between h-full px-8 py-8 md:px-12 md:py-10 max-w-[520px] pointer-events-auto">
        {/* Top Title Lockup with bespoke inline SVG emblem */}
        <div>
          <div className="flex items-center gap-3.5 mb-4">
            <svg
              width="44"
              height="44"
              viewBox="0 0 44 44"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <polygon
                points="22,3 39,12 39,32 22,41 5,32 5,12"
                fill="#161b22"
                stroke="#f59e0b"
                strokeWidth="1.8"
              />
              <path
                d="M15 22L22 13L29 22L22 27L15 22Z"
                fill="#e5e8ec"
              />
              <path
                d="M9 17L15 21M35 17L29 21M9 28L16 25M35 28L28 25"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-slate-100 leading-none">
                PALE STRIDER
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-mono-tabular">
                Tactical Multi-Legged Combat Simulator
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 font-mono-tabular border-y border-slate-800/90 py-2.5 mt-4 whitespace-nowrap">
            <span className="text-slate-200">{unit.code} {unit.name}</span>
            <span aria-hidden="true">·</span>
            <span>{credits} CR</span>
            <span aria-hidden="true">·</span>
            <span>Ops {completedMissions.length}/9</span>
            <span aria-hidden="true">·</span>
            <span>Wave {highestWave}</span>
          </div>
        </div>

        {/* Main Navigation Menu */}
        <nav aria-label="Main Menu" className="flex flex-col gap-2 my-6">
          <button
            type="button"
            data-start="true"
            onClick={onQuickDeploy}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-base rounded-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300"
          >
            <span>Deploy Now</span>
            <span className="text-xs font-mono-tabular font-medium opacity-80">Enter</span>
          </button>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={onOpenCampaign}
              className="px-4 py-2.5 bg-[#161b23]/95 hover:bg-[#1e2530] border border-slate-700/70 text-slate-100 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
            >
              Campaign
            </button>
            <button
              type="button"
              onClick={onOpenSkirmish}
              className="px-4 py-2.5 bg-[#161b23]/95 hover:bg-[#1e2530] border border-slate-700/70 text-slate-100 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
            >
              Skirmish
            </button>
            <button
              type="button"
              onClick={onStartSurvival}
              className="px-4 py-2.5 bg-[#161b23]/95 hover:bg-[#1e2530] border border-slate-700/70 text-slate-100 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
            >
              Survival
            </button>
            <button
              type="button"
              data-testid="menu-sandbox-btn"
              onClick={onStartTraining}
              className="px-4 py-2.5 bg-[#161b23]/95 hover:bg-[#1e2530] border border-purple-500/45 text-slate-100 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
            >
              Sandbox Mode
            </button>
            <button
              type="button"
              onClick={onStartFreeRoam}
              className="px-4 py-2.5 bg-[#161b23]/95 hover:bg-[#1e2530] border border-slate-700/70 text-slate-100 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
            >
              Free Roam
            </button>
            <button
              type="button"
              onClick={onOpenBossChallenge}
              className="px-4 py-2.5 bg-[#231518]/95 hover:bg-[#311c21] border border-red-500/50 text-red-200 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
            >
              Boss Hunt
            </button>
            <button
              type="button"
              onClick={onOpenHangar}
              className="col-span-2 px-4 py-2.5 bg-[#1c232e]/95 hover:bg-[#252e3c] border border-amber-500/40 text-amber-300 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
            >
              Unit Selection
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full mt-1 px-4 py-2.5 bg-[#12161c]/90 hover:bg-[#1a2029] border border-slate-800 text-slate-300 text-sm font-medium rounded-sm text-left transition-colors cursor-pointer"
          >
            Settings & Controls
          </button>
        </nav>

        {/* Flat Borderless Control Hint Line */}
        <p className="text-xs text-slate-400 font-mono-tabular whitespace-nowrap">
          WASD Move · Mouse Aim · LMB/RMB Fire · Shift Boost · Space Dash/Ascend · E Grapple · V Ability · Q Squad
        </p>
      </div>
    </div>
  );
};
