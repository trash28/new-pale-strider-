import React from 'react';
import { HudSnapshot } from '../game/types';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onReturnToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenSettings,
  onReturnToMenu,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#07090d]/80">
      <div className="w-full max-w-md bg-[#11151c] border border-slate-700 p-6 rounded-sm shadow-2xl">
        <h2 className="font-display text-3xl font-bold text-slate-100">Simulation Paused</h2>
        <p className="text-sm text-slate-400 mt-1">All chassis actuators and weapons locked.</p>

        <div className="flex flex-col gap-2.5 mt-6">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-sm cursor-pointer"
          >
            Resume Combat [Esc]
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 bg-[#1a202a] hover:bg-slate-800 border border-slate-700 text-slate-100 font-medium text-sm rounded-sm cursor-pointer"
          >
            Restart Engagement
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full py-2.5 px-4 bg-[#1a202a] hover:bg-slate-800 border border-slate-700 text-slate-100 font-medium text-sm rounded-sm cursor-pointer"
          >
            Settings & Controls
          </button>
          <button
            type="button"
            onClick={onReturnToMenu}
            className="w-full py-2.5 px-4 bg-[#141820] hover:bg-red-950/60 border border-slate-800 text-slate-300 font-medium text-sm rounded-sm cursor-pointer"
          >
            Return to Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  hud: HudSnapshot;
  onPlayAgain: () => void;
  onNextMission?: () => void;
  onReturnToMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  hud,
  onPlayAgain,
  onNextMission,
  onReturnToMenu,
}) => {
  const mins = Math.floor(hud.elapsedSeconds / 60);
  const secs = hud.elapsedSeconds % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#07090d]/85">
      <div className="w-full max-w-lg bg-[#11151c] border border-slate-700 p-7 rounded-sm shadow-2xl">
        <div className="text-xs font-mono-tabular text-slate-400">{hud.missionTitle}</div>
        <h2
          className={`font-display text-4xl font-bold mt-1 ${
            hud.victory ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {hud.victory ? 'Operation Complete' : 'Chassis Lost'}
        </h2>
        <p className="text-sm text-slate-300 mt-1.5">{hud.endReason}</p>

        <div className="grid grid-cols-3 gap-3 mt-6 border-y border-slate-800 py-4 font-mono-tabular">
          <div>
            <div className="text-[11px] text-slate-400">Elapsed Time</div>
            <div className="text-xl font-semibold text-slate-100 mt-0.5">{timeStr}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Hostiles Destroyed</div>
            <div className="text-xl font-semibold text-slate-100 mt-0.5">{hud.kills}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Credits Earned</div>
            <div className="text-xl font-semibold text-amber-400 mt-0.5">+{hud.creditsEarned}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 mt-6">
          {hud.victory && onNextMission && (
            <button
              type="button"
              data-start="true"
              onClick={onNextMission}
              className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-sm cursor-pointer"
            >
              Next Operation
            </button>
          )}
          <button
            type="button"
            data-start={!hud.victory || !onNextMission ? 'true' : undefined}
            onClick={onPlayAgain}
            className="flex-1 py-2.5 px-4 bg-[#1c232e] hover:bg-slate-800 border border-slate-600 text-slate-100 font-semibold text-sm rounded-sm cursor-pointer"
          >
            {hud.victory ? 'Replay Mission' : 'Try Again'}
          </button>
          <button
            type="button"
            onClick={onReturnToMenu}
            className="py-2.5 px-4 bg-[#141820] hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-sm rounded-sm cursor-pointer"
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
