import React from 'react';
import { VictoryCinematicSnapshot } from '../game/victoryCinematic';

interface VictoryOverlayProps {
  victory: VictoryCinematicSnapshot;
  onSkip: () => void;
  onContinue: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  commander: 'CMD',
  assault: 'ASL',
  support: 'SUP',
  recon: 'RCN',
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const VictoryOverlay: React.FC<VictoryOverlayProps> = ({
  victory,
  onSkip,
  onContinue,
}) => {
  const inAwards = victory.phase === 'awards';

  if (!inAwards) {
    const progressPct = Math.min(100, Math.round((victory.elapsed / Math.max(0.1, victory.duration)) * 100));
    return (
      <div
        data-testid="victory-cinematic-letterbox"
        className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between"
      >
        {/* Top Letterbox Bar */}
        <div className="bg-[#05080d]/92 border-b border-amber-500/40 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono-tabular tracking-[0.26em] text-amber-400">
              {victory.missionTitle} · OPERATION COMPLETE
            </div>
            <div className="text-xl md:text-2xl font-mono-tabular font-bold tracking-[0.18em] text-slate-100 mt-0.5">
              {victory.headline}
            </div>
            <div className="text-[11px] font-mono-tabular tracking-[0.14em] text-slate-400">
              {victory.subline}
            </div>
          </div>

          <button
            type="button"
            data-testid="victory-skip-btn"
            onClick={onSkip}
            className="pointer-events-auto px-3 py-1.5 bg-[#0f1621] hover:bg-amber-500/20 border border-amber-400/70 text-[11px] font-mono-tabular tracking-widest text-amber-300 cursor-pointer"
          >
            SKIP [SPACE]
          </button>
        </div>

        {/* Bottom Letterbox Bar */}
        <div className="bg-[#05080d]/92 border-t border-slate-700/70 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[10px] font-mono-tabular tracking-[0.2em] text-emerald-400">
            <span className="inline-block w-2 h-2 bg-emerald-400" />
            <span>{victory.cameraLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-36 h-1 bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] font-mono-tabular text-slate-400">
              +{victory.creditsEarned} CR
            </span>
          </div>
        </div>
      </div>
    );
  }

  const secondaryAwards = victory.awards.filter(
    (a) => a.id !== 'mvp' && a.id !== 'best_teammate'
  );

  return (
    <div
      data-testid="victory-awards-screen"
      className="fixed inset-0 z-30 pointer-events-auto bg-[#05080d]/90 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-[920px] bg-[#0a0f17]/96 border border-amber-500/55 shadow-2xl">
        {/* Header Strip */}
        <div className="border-b border-slate-700/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-[#0d1420]">
          <div>
            <div className="text-[10px] font-mono-tabular tracking-[0.26em] text-amber-400">
              AFTER-ACTION REPORT · {victory.missionTitle}
            </div>
            <h2 className="text-2xl font-mono-tabular font-bold tracking-[0.16em] text-slate-100 mt-0.5">
              {victory.headline}
            </h2>
            <p className="text-[11px] font-mono-tabular tracking-wider text-slate-400">
              {victory.subline}
            </p>
          </div>
          <div className="flex items-center gap-5 font-mono-tabular text-right">
            <div>
              <div className="text-[9px] text-slate-500 tracking-widest">TIME</div>
              <div className="text-sm font-bold text-slate-200">
                {formatDuration(victory.elapsedMatchSeconds)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 tracking-widest">REWARD</div>
              <div className="text-sm font-bold text-amber-400">
                +{victory.creditsEarned} CR
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Primary Spotlights: MVP & BEST TEAMMATE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {victory.mvp && (
              <div
                data-testid="award-mvp-card"
                className="bg-[#111926] border border-amber-400/80 p-4 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono-tabular font-bold tracking-[0.22em] text-amber-400">
                    ★ {victory.mvp.title}
                  </span>
                  <span className="text-[9px] font-mono-tabular px-1.5 py-0.5 border border-amber-500/50 text-amber-200">
                    {victory.mvp.isPlayer ? 'PLAYER' : 'AI SQUAD'}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="text-lg font-mono-tabular font-bold text-slate-100 tracking-wider">
                    {victory.mvp.callsign}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">
                    {victory.mvp.unitName} · {victory.mvp.subtitle}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] font-mono-tabular font-semibold text-amber-300">
                  {victory.mvp.metricLabel}
                </div>
              </div>
            )}

            {victory.bestTeammate && (
              <div
                data-testid="award-teammate-card"
                className="bg-[#111926] border border-sky-400/75 p-4 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono-tabular font-bold tracking-[0.22em] text-sky-400">
                    ◆ {victory.bestTeammate.title}
                  </span>
                  <span className="text-[9px] font-mono-tabular px-1.5 py-0.5 border border-sky-500/50 text-sky-200">
                    {victory.bestTeammate.isPlayer ? 'PLAYER' : 'AI SQUAD'}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="text-lg font-mono-tabular font-bold text-slate-100 tracking-wider">
                    {victory.bestTeammate.callsign}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">
                    {victory.bestTeammate.unitName} · {victory.bestTeammate.subtitle}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] font-mono-tabular font-semibold text-sky-300">
                  {victory.bestTeammate.metricLabel}
                </div>
              </div>
            )}
          </div>

          {/* Additional Earned Commendations */}
          {secondaryAwards.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {secondaryAwards.map((aw) => (
                <div
                  key={aw.id}
                  className="bg-[#0e141e] border border-slate-700/80 px-3 py-2.5 font-mono-tabular"
                >
                  <div className="text-[9px] tracking-[0.18em] text-emerald-400 font-bold">
                    {aw.title}
                  </div>
                  <div className="text-xs font-bold text-slate-100 mt-0.5">
                    {aw.callsign}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {aw.metricLabel}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 4-Unit Squad Performance Breakdown */}
          <div className="border border-slate-800 bg-[#080c12]">
            <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-mono-tabular tracking-[0.2em] text-slate-400">
              SQUAD COMBAT TELEMETRY
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono-tabular text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800/80 text-[9px] text-slate-500">
                    <th className="px-3 py-1.5">UNIT</th>
                    <th className="px-2 py-1.5">ROLE</th>
                    <th className="px-2 py-1.5">STATUS</th>
                    <th className="px-2 py-1.5 text-right">KILLS</th>
                    <th className="px-2 py-1.5 text-right">AST</th>
                    <th className="px-2 py-1.5 text-right">DAMAGE</th>
                    <th className="px-2 py-1.5 text-right">REPAIR</th>
                    <th className="px-3 py-1.5 text-right">SAVES</th>
                  </tr>
                </thead>
                <tbody>
                  {victory.squadStats.map((u) => (
                    <tr
                      key={u.unitId}
                      className="border-b border-slate-800/40 last:border-b-0"
                    >
                      <td className="px-3 py-1.5">
                        <span className={u.isPlayer ? 'text-amber-300 font-bold' : 'text-slate-200 font-semibold'}>
                          {u.callsign}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-2">{u.unitName}</span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-400">{ROLE_LABELS[u.role] ?? 'UNIT'}</td>
                      <td className="px-2 py-1.5">
                        <span className={u.alive ? 'text-emerald-400' : 'text-red-400'}>
                          {u.alive ? 'ACTIVE' : 'KIA'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-100">{u.eliminations}</td>
                      <td className="px-2 py-1.5 text-right text-slate-300">{u.assists}</td>
                      <td className="px-2 py-1.5 text-right text-slate-200">
                        {Math.round(u.damageDealt).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right text-sky-300">
                        {Math.round(u.repairDone)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-emerald-300">{u.threatSaves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              data-testid="victory-continue-btn"
              onClick={onContinue}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono-tabular font-bold text-xs tracking-[0.2em] cursor-pointer"
            >
              CONTINUE [ENTER]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
