import React, { useMemo, useState } from 'react';
import { HudSnapshot, MechClassId } from '../../game/types';

type TransformHud = NonNullable<HudSnapshot['transformHud']>;
type TargetItem = TransformHud['eligibleTargets'][number];

function MiniMechGlyph({
  id,
  primary,
  accent,
}: {
  id: MechClassId;
  primary: string;
  accent: string;
}) {
  return (
    <svg width="32" height="32" viewBox="-16 -16 32 32" className="shrink-0">
      {id === 'recon' ? (
        <>
          <polygon points="11,0 1,-6 -10,-6 -11,0 -10,6 1,6" fill={primary} stroke="#0f172a" strokeWidth="1" />
          <line x1="-10" y1="-10" x2="4" y2="10" stroke={accent} strokeWidth="1.6" />
          <line x1="4" y1="-10" x2="-10" y2="10" stroke={accent} strokeWidth="1.6" />
          <circle cx="-3" cy="0" r="2.5" fill={accent} />
          <rect x="4" y="-1.5" width="9" height="3" fill={accent} />
        </>
      ) : id === 'standard' ? (
        <>
          <polygon points="10,-4 10,4 2,8 -9,7 -10,0 -9,-7 2,-8" fill={primary} stroke={accent} strokeWidth="1.2" />
          <rect x="7" y="-11" width="3" height="7" fill="#64748b" stroke={accent} strokeWidth="0.9" />
          <rect x="7" y="4" width="3" height="7" fill="#64748b" stroke={accent} strokeWidth="0.9" />
          <rect x="2" y="-2" width="11" height="4" fill={accent} />
        </>
      ) : id === 'sniper' ? (
        <>
          <polygon points="9,-3 9,3 -9,6 -12,0 -9,-6" fill={primary} stroke="#0f172a" strokeWidth="1.2" />
          <rect x="2" y="-3.2" width="12" height="2" fill={accent} />
          <rect x="2" y="1.2" width="12" height="2" fill={accent} />
          <line x1="-9" y1="-6" x2="-13" y2="-11" stroke={accent} strokeWidth="1.4" />
          <line x1="-9" y1="6" x2="-13" y2="11" stroke={accent} strokeWidth="1.4" />
        </>
      ) : id === 'heavy' ? (
        <>
          <polygon points="9,-7 9,7 2,11 -10,10 -12,0 -10,-10 2,-11" fill={primary} stroke={accent} strokeWidth="1.2" />
          <rect x="4" y="-11" width="8" height="4" fill="#94a3b8" stroke={accent} strokeWidth="0.9" />
          <rect x="4" y="7" width="8" height="4" fill="#94a3b8" stroke={accent} strokeWidth="0.9" />
          <rect x="2" y="-2.4" width="11" height="4.8" fill={accent} />
        </>
      ) : id === 'artillery' || id === 'colossus' ? (
        <>
          <rect x="-10" y="-9" width="17" height="18" rx="2" fill={primary} stroke="#0f172a" strokeWidth="1.2" />
          <line x1="-8" y1="-9" x2="-13" y2="-13" stroke={accent} strokeWidth="1.8" />
          <line x1="-8" y1="9" x2="-13" y2="13" stroke={accent} strokeWidth="1.8" />
          <rect x="-1" y="-4" width="14" height="3" fill={accent} />
          <rect x="-1" y="1" width="14" height="3" fill={accent} />
        </>
      ) : id === 'ewar' ? (
        <>
          <polygon points="10,-5 10,5 0,9 -10,7 -11,0 -10,-7 0,-9" fill={primary} stroke={accent} strokeWidth="1.1" />
          <circle cx="-1" cy="0" r="5" fill="none" stroke={accent} strokeWidth="1.2" strokeDasharray="2 2" />
          <line x1="-1" y1="-12" x2="-1" y2="12" stroke={accent} strokeWidth="1.4" />
          <circle cx="-1" cy="0" r="2.2" fill={accent} />
        </>
      ) : id === 'engineer' ? (
        <>
          <rect x="-10" y="-8" width="18" height="16" rx="2" fill={primary} stroke={accent} strokeWidth="1.1" />
          <polyline points="2,-8 8,-12 12,-7" fill="none" stroke={accent} strokeWidth="1.6" />
          <polyline points="2,8 8,12 12,7" fill="none" stroke={accent} strokeWidth="1.6" />
          <rect x="1" y="-2.2" width="10" height="4.4" fill={accent} />
        </>
      ) : id === 'valkyrie' ? (
        <>
          <polygon points="-2,-15 7,-4 -7,-2" fill={primary} stroke={accent} strokeWidth="1" />
          <polygon points="-2,15 7,4 -7,2" fill={primary} stroke={accent} strokeWidth="1" />
          <polygon points="13,0 2,-5 -11,-4 -11,4 2,5" fill={primary} stroke={accent} strokeWidth="1.2" />
          <polygon points="-11,-3 -15,-1.5 -11,0 -15,1.5 -11,3" fill={accent} />
        </>
      ) : id === 'phantom' ? (
        <>
          <polygon points="12,0 2,-8 -10,-9 -7,0 -10,9 2,8" fill={primary} stroke={accent} strokeWidth="1.2" />
          <circle cx="0" cy="0" r="6" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="3 2" />
          <rect x="3" y="-1.5" width="10" height="3" fill={accent} />
        </>
      ) : (
        <>
          <polygon points="12,0 1,-7 -10,-8 -7,0 -10,8 1,7" fill={primary} stroke={accent} strokeWidth="1.2" />
          <path d="M 3,-6 Q 13,-13 11,-2" fill="none" stroke={accent} strokeWidth="2" />
          <path d="M 3,6 Q 13,13 11,2" fill="none" stroke={accent} strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

interface TransformSelectorOverlayProps {
  transformHud: TransformHud;
  onSelectTarget: (id: MechClassId) => void;
  onClose: () => void;
}

export const TransformSelectorOverlay: React.FC<TransformSelectorOverlayProps> = ({
  transformHud,
  onSelectTarget,
  onClose,
}) => {
  const [hoveredId, setHoveredId] = useState<MechClassId | null>(null);

  const inspectedTarget = useMemo(() => {
    if (hoveredId) {
      const found = transformHud.eligibleTargets.find((t) => t.id === hoveredId);
      if (found) return found;
    }
    return (
      transformHud.eligibleTargets.find((t) => !t.isCurrent && t.unlocked) ??
      transformHud.eligibleTargets[0] ??
      null
    );
  }, [hoveredId, transformHud.eligibleTargets]);

  const cooldownRem = Math.ceil(transformHud.totalReplicationCooldown);
  const cooldownBlocked = transformHud.totalReplicationCooldown > 0.05;

  return (
    <div
      data-testid="transform-selector-overlay"
      className="self-center mb-12 pointer-events-auto bg-[#080c12]/96 backdrop-blur-sm border border-sky-400/80 shadow-2xl p-3.5 w-[780px] max-w-[96vw]"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
        <div>
          <div className="flex items-center gap-2 font-mono-tabular text-xs font-bold tracking-wider text-sky-300">
            <span>TOTAL REPLICATION MATRIX · TX-SERIES MORPH CONFIGURATIONS</span>
            <span
              className={`px-1.5 py-0.5 text-[9px] border ${
                cooldownBlocked
                  ? 'bg-amber-950/60 border-amber-500/70 text-amber-300'
                  : 'bg-emerald-950/60 border-emerald-500/70 text-emerald-300'
              }`}
            >
              {cooldownBlocked ? `COOLDOWN ${cooldownRem}s` : 'CORE READY'}
            </span>
          </div>
          <div className="font-mono-tabular text-[10px] text-slate-400 mt-0.5">
            Select upgraded TX chassis [1–9 / Click] · 60s morph cooldown starts on activation · [ESC] Cancel free
          </div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          data-testid="transform-cancel-btn"
          onClick={onClose}
          className="px-2 py-1 text-[10px] font-mono-tabular bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 cursor-pointer"
        >
          ESC · CANCEL
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto pr-0.5">
        {transformHud.eligibleTargets.map((t: TargetItem, idx: number) => {
          const selectable = t.unlocked && !t.isCurrent && !cooldownBlocked;
          const statusLabel = !t.unlocked
            ? 'LOCKED'
            : t.isCurrent
            ? 'ACTIVE'
            : cooldownBlocked
            ? `CD ${cooldownRem}s`
            : t.canFly
            ? 'VTOL'
            : `${t.legsCount}L · READY`;

          return (
            <button
              key={t.id}
              type="button"
              tabIndex={-1}
              aria-disabled={!selectable}
              data-testid={`transform-target-${t.id}`}
              onMouseEnter={() => setHoveredId(t.id)}
              onFocus={() => setHoveredId(t.id)}
              onClick={() => selectable && onSelectTarget(t.id)}
              className={`p-2 border text-left transition-colors flex items-center gap-2 ${
                t.isCurrent
                  ? 'bg-sky-950/50 border-sky-400/80 text-sky-200 cursor-default'
                  : selectable
                  ? 'bg-[#111722] border-slate-700/85 hover:border-amber-400 hover:bg-[#192232] text-slate-100 cursor-pointer'
                  : 'bg-[#0c1016] border-slate-800/70 text-slate-500 opacity-55 cursor-not-allowed'
              }`}
            >
              <MiniMechGlyph id={t.id} primary={t.primaryColor} accent={t.accentColor} />
              <div className="min-w-0 flex-1 font-mono-tabular">
                <div className="flex items-center justify-between gap-1 text-[10px]">
                  <span className={selectable ? 'text-amber-400 font-bold' : 'text-slate-400 font-bold'}>
                    {idx < 9 ? `[${idx + 1}] ` : ''}
                    {t.morphCode}
                  </span>
                  <span className="text-[9px] text-slate-400">{statusLabel}</span>
                </div>
                <div className="text-[11px] font-semibold truncate text-slate-100">{t.morphName}</div>
                <div className="text-[9px] text-sky-300/90 truncate">{t.uniqueAbilityName}</div>
              </div>
            </button>
          );
        })}
      </div>

      {inspectedTarget && (
        <div
          data-testid="transform-target-inspector"
          className="mt-2.5 pt-2 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono-tabular"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="font-bold text-amber-300">
                {inspectedTarget.morphCode} · {inspectedTarget.morphName}
              </span>
              <span className="px-1 py-0.5 text-[9px] bg-slate-800 text-slate-300 border border-slate-700">
                {inspectedTarget.category}
              </span>
              <span className="text-[10px] text-slate-400 truncate">
                Base: {inspectedTarget.code} {inspectedTarget.name}
              </span>
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              <span className="text-sky-300 font-semibold">[V] {inspectedTarget.uniqueAbilityName}:</span>{' '}
              {inspectedTarget.uniqueAbilityDesc}
            </div>
          </div>
          <div className="text-[10px] text-amber-200/90 shrink-0 sm:text-right">
            <div className="text-[9px] text-slate-400">TX WEAPONS</div>
            <div>{inspectedTarget.weaponSummary}</div>
          </div>
        </div>
      )}
    </div>
  );
};

