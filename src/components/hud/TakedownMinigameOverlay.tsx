import React, { useRef } from 'react';
import { HudSnapshot } from '../../game/types';

interface TakedownMinigameOverlayProps {
  takedown: NonNullable<HudSnapshot['takedownHud']>;
  onSetDodgeTarget: (normX: number | null) => void;
  onTriggerDodgeDash: (explicitDir?: -1 | 1) => void;
  onSelectLane?: (lane: 0 | 1 | 2) => void;
}

export const TakedownMinigameOverlay: React.FC<TakedownMinigameOverlayProps> = ({
  takedown,
  onSetDodgeTarget,
  onTriggerDodgeDash,
  onSelectLane,
}) => {
  const railRef = useRef<HTMLDivElement | null>(null);

  const isEscape = takedown.mode === 'first_person_escape';
  const variant = takedown.variant ?? 'blade_sweep';
  const slash = takedown.slash;
  const cursorNorm = Math.max(0.04, Math.min(0.96, takedown.cursor));
  const cursorWidthPct = Math.max(5.0, Math.min(11, takedown.cursorWidth * 100));
  const cursorLeftPct = cursorNorm * 100;
  const velLeanDeg = Math.max(-18, Math.min(18, -takedown.cursorVel * 6.5));

  const hitPrimary =
    Boolean(slash && (slash.phase === 'telegraph' || slash.phase === 'strike')) &&
    Math.abs(cursorNorm - slash!.zoneCenter) < slash!.zoneHalfWidth + takedown.cursorWidth * 0.5;
  const hitSecondary =
    Boolean(
      slash &&
        (slash.phase === 'telegraph' || slash.phase === 'strike') &&
        slash.secondaryZoneCenter !== null &&
        Math.abs(cursorNorm - slash.secondaryZoneCenter) <
          slash.secondaryZoneHalfWidth + takedown.cursorWidth * 0.5
    );
  const inDangerNow = hitPrimary || hitSecondary;

  const judgmentFlash =
    takedown.judgmentTimer > 0 && takedown.lastJudgment ? takedown.lastJudgment : null;
  const isMissFlash = judgmentFlash === 'MISS';
  const isPerfFlash = judgmentFlash === 'PERFECT';
  const isGoodFlash = judgmentFlash === 'GOOD';

  const instabRatio = Math.max(0, Math.min(1, takedown.instability));
  const instabCells = 6;

  // Compute SVG strike geometry inside a fixed 420x84 viewBox centered vertically on the rail
  const svgW = 420;
  const svgH = 84;
  const zoneX = (slash?.zoneCenter ?? 0.5) * svgW;
  const zoneW = (slash?.zoneHalfWidth ?? 0.14) * 2 * svgW;
  const secZoneX = slash?.secondaryZoneCenter !== null && slash?.secondaryZoneCenter !== undefined
    ? slash.secondaryZoneCenter * svgW
    : null;
  const slashAngle = slash?.angleRad ?? -0.75;
  const dx = Math.cos(slashAngle) * 145;
  const dy = Math.sin(slashAngle) * 145;

  const computeNormX = (clientX: number): number | null => {
    const el = railRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width));
  };

  const showTrail = Math.abs(takedown.cursorVel) > 0.14;
  const trailDir = takedown.cursorVel >= 0 ? -1 : 1;
  const trailOffsets = [2.6, 5.4, 8.6];

  const recoilShiftPx = isMissFlash
    ? Math.sin(takedown.judgmentTimer * 68) * 5
    : 0;

  // Chrono-ring derived SVG state
  const ringTargetNorm = Math.max(0.12, Math.min(0.44, takedown.ringTargetRadius));
  const ringCurrentNorm = Math.max(0.02, Math.min(1.15, takedown.ringRadius));
  const ringInParryWindow = Math.abs(ringCurrentNorm - ringTargetNorm) <= 0.095;
  const ringPerfectWindow = Math.abs(ringCurrentNorm - ringTargetNorm) <= 0.042;

  // Dual-arc & Pulse-cadence derived bracket metrics
  const bracketLeftPct = Math.max(0, (takedown.targetZoneCenter - takedown.targetZoneHalfWidth) * 100);
  const bracketWidthPct = Math.max(6, takedown.targetZoneHalfWidth * 2 * 100);
  const dualInSweet = Math.abs(takedown.needleA - takedown.targetZoneCenter) <= takedown.targetZoneHalfWidth * 1.12;
  const pulseInSweet = Math.abs(takedown.needleA - takedown.targetZoneCenter) <= takedown.targetZoneHalfWidth * 1.15;

  const handleLeftAction = () => {
    if (variant === 'tri_vector') {
      const next = Math.max(0, takedown.activeLane - 1) as 0 | 1 | 2;
      if (onSelectLane) onSelectLane(next);
      else onTriggerDodgeDash(-1);
    } else if (variant === 'blade_sweep') {
      onTriggerDodgeDash(-1);
    } else {
      onTriggerDodgeDash();
    }
  };

  const handleRightAction = () => {
    if (variant === 'tri_vector') {
      const next = Math.min(2, takedown.activeLane + 1) as 0 | 1 | 2;
      if (onSelectLane) onSelectLane(next);
      else onTriggerDodgeDash(1);
    } else if (variant === 'blade_sweep') {
      onTriggerDodgeDash(1);
    } else {
      onTriggerDodgeDash();
    }
  };

  const renderSlashSvgEffects = () => {
    if (
      !slash ||
      !(
        slash.phase === 'telegraph' ||
        slash.phase === 'strike' ||
        (slash.phase === 'recover' && slash.progress < 0.65)
      )
    ) {
      return null;
    }

    return (
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-y-5 inset-x-0 w-full h-[calc(100%+40px)] overflow-visible z-20"
        aria-hidden="true"
      >
        {slash.phase === 'telegraph' && (
          <g opacity={0.42 + slash.progress * 0.58}>
            <line
              x1={zoneX - dx * (1 - slash.progress * 0.22)}
              y1={svgH * 0.5 - dy * (1 - slash.progress * 0.22)}
              x2={zoneX + dx * (1 - slash.progress * 0.22)}
              y2={svgH * 0.5 + dy * (1 - slash.progress * 0.22)}
              stroke="#fb7185"
              strokeWidth={1.5 + slash.progress * 1.7}
              strokeDasharray={slash.progress > 0.7 ? undefined : '7 5'}
            />
            <circle
              cx={zoneX}
              cy={svgH * 0.5}
              r={Math.max(4, 15 - slash.progress * 9)}
              fill="none"
              stroke="#fda4af"
              strokeWidth="1.5"
            />
            <circle
              cx={zoneX}
              cy={svgH * 0.5}
              r={2.5}
              fill="#ffffff"
              opacity={0.5 + slash.progress * 0.5}
            />
            {secZoneX !== null && (
              <>
                <line
                  x1={secZoneX + dx * 0.72}
                  y1={svgH * 0.5 - dy * 0.72}
                  x2={secZoneX - dx * 0.72}
                  y2={svgH * 0.5 + dy * 0.72}
                  stroke="#fbbf24"
                  strokeWidth={1.4 + slash.progress * 1.4}
                  strokeDasharray="6 4"
                />
                <circle
                  cx={secZoneX}
                  cy={svgH * 0.5}
                  r={Math.max(3.5, 13 - slash.progress * 8)}
                  fill="none"
                  stroke="#fde68a"
                  strokeWidth="1.4"
                />
              </>
            )}
          </g>
        )}

        {(slash.phase === 'strike' || slash.phase === 'recover') &&
          (() => {
            const decayAlpha =
              slash.phase === 'strike'
                ? Math.max(0.28, 1 - slash.progress * 0.45)
                : Math.max(0, 0.55 * (1 - slash.progress / 0.65));
            const widthDecay =
              slash.phase === 'strike'
                ? 1 - slash.progress * 0.5
                : 0.4 * (1 - slash.progress / 0.65);
            return (
              <g opacity={decayAlpha}>
                <line
                  x1={zoneX - dx * 1.25}
                  y1={svgH * 0.5 - dy * 1.25}
                  x2={zoneX + dx * 1.25}
                  y2={svgH * 0.5 + dy * 1.25}
                  stroke="#f43f5e"
                  strokeWidth={Math.max(2, 18 * widthDecay)}
                  strokeLinecap="round"
                  opacity="0.72"
                />
                <line
                  x1={zoneX - dx * 1.1}
                  y1={svgH * 0.5 - dy * 1.1}
                  x2={zoneX + dx * 1.1}
                  y2={svgH * 0.5 + dy * 1.1}
                  stroke="#c084fc"
                  strokeWidth={Math.max(1.5, 9 * widthDecay)}
                  strokeLinecap="round"
                  opacity="0.82"
                />
                <line
                  x1={zoneX - dx * 1.35}
                  y1={svgH * 0.5 - dy * 1.35}
                  x2={zoneX + dx * 1.35}
                  y2={svgH * 0.5 + dy * 1.35}
                  stroke="#ffffff"
                  strokeWidth={Math.max(1, 4.4 * widthDecay)}
                  strokeLinecap="round"
                />
                {secZoneX !== null && (
                  <>
                    <line
                      x1={secZoneX + dx * 1.05}
                      y1={svgH * 0.5 - dy * 1.05}
                      x2={secZoneX - dx * 1.05}
                      y2={svgH * 0.5 + dy * 1.05}
                      stroke="#fb7185"
                      strokeWidth={Math.max(1.8, 13 * widthDecay)}
                      strokeLinecap="round"
                      opacity="0.78"
                    />
                    <line
                      x1={secZoneX + dx * 1.1}
                      y1={svgH * 0.5 - dy * 1.1}
                      x2={secZoneX - dx * 1.1}
                      y2={svgH * 0.5 + dy * 1.1}
                      stroke="#ffffff"
                      strokeWidth={Math.max(1, 3.6 * widthDecay)}
                      strokeLinecap="round"
                    />
                  </>
                )}
                <ellipse
                  cx={zoneX}
                  cy={svgH * 0.5}
                  rx={zoneW * (0.28 + (slash.phase === 'strike' ? slash.progress : 1) * 0.55)}
                  ry={14 + (slash.phase === 'strike' ? slash.progress : 1) * 26}
                  fill="none"
                  stroke={slash.wasHit ? '#f43f5e' : '#34d399'}
                  strokeWidth="2.2"
                  opacity={slash.phase === 'strike' ? 1 - slash.progress * 0.75 : decayAlpha * 0.8}
                />
              </g>
            );
          })()}
      </svg>
    );
  };

  return (
    <div
      data-testid="takedown-minigame-overlay"
      data-variant={variant}
      aria-label={isEscape ? 'CQC Defense Minigame' : 'Phantom Execution Minigame'}
      className="pointer-events-auto fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-[470px] max-w-[92vw] select-none"
      style={{ transform: `translate(calc(-50% + ${recoilShiftPx.toFixed(1)}px), 0)` }}
    >
      {/* Top Diamond Stage Pips (5 or 6 stages, zero text) */}
      <div className="flex items-center justify-center gap-2 mb-1.5">
        {Array.from({ length: takedown.totalStages }).map((_, idx) => {
          const stageNum = idx + 1;
          const cleared = stageNum < takedown.stage;
          const current = stageNum === takedown.stage && takedown.active;
          return (
            <div
              key={idx}
              className={`w-2.5 h-2.5 rotate-45 border transition-all duration-150 ${
                cleared
                  ? isEscape
                    ? 'bg-cyan-400 border-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.9)]'
                    : 'bg-emerald-400 border-emerald-200 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                  : current
                  ? isEscape
                    ? 'bg-rose-500/40 border-rose-300 scale-125 shadow-[0_0_10px_rgba(244,63,94,0.85)]'
                    : 'bg-cyan-400/30 border-cyan-300 scale-125 shadow-[0_0_10px_rgba(34,211,238,0.85)]'
                  : 'bg-[#090d16]/80 border-slate-700/80'
              }`}
            />
          );
        })}
      </div>

      {/* Main Optical Tactical Frame */}
      <div
        className={`relative bg-[#060910]/92 border px-2 py-2 shadow-[0_0_32px_rgba(0,0,0,0.85)] transition-colors duration-150 ${
          isMissFlash
            ? 'border-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.6)]'
            : isPerfFlash
            ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.55)]'
            : isGoodFlash
            ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)]'
            : isEscape
            ? 'border-rose-500/75'
            : 'border-cyan-500/70'
        }`}
      >
        {/* Crisp Optical Corner Ticks */}
        <span className="pointer-events-none absolute -top-[1px] -left-[1px] w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-300/85" />
        <span className="pointer-events-none absolute -top-[1px] -right-[1px] w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-300/85" />
        <span className="pointer-events-none absolute -bottom-[1px] -left-[1px] w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-300/85" />
        <span className="pointer-events-none absolute -bottom-[1px] -right-[1px] w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-300/85" />

        {/* Quiet Symmetrical Cadence Horizon Line */}
        <div className="relative h-[2px] w-full bg-slate-900/90 mb-1.5 overflow-hidden">
          {slash?.phase === 'idle' ? (
            <div
              className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 transition-all duration-75 ${
                slash.nextIntervalProgress > 0.72
                  ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]'
                  : 'bg-cyan-400/75'
              }`}
              style={{ width: `${Math.round(slash.nextIntervalProgress * 100)}%` }}
            />
          ) : slash?.phase === 'telegraph' ? (
            <div
              className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 bg-rose-500 shadow-[0_0_10px_#f43f5e]"
              style={{ width: `${Math.round((1 - slash.progress) * 100)}%` }}
            />
          ) : slash?.phase === 'strike' ? (
            <div className="absolute inset-0 bg-white shadow-[0_0_12px_#ffffff]" />
          ) : null}
        </div>

        {/* Row: Left Tactile Chevron + Variant Arena + Right Tactile Chevron */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Action Left"
            data-testid="takedown-evade-left"
            onClick={(e) => {
              e.currentTarget.blur();
              handleLeftAction();
            }}
            className={`relative w-7 h-12 flex items-center justify-center border cursor-pointer shrink-0 overflow-hidden transition-colors ${
              takedown.evadeCooldownRatio > 0.05 && variant === 'blade_sweep'
                ? 'bg-[#0a101b] border-slate-800 text-slate-600'
                : 'bg-[#0b1420] border-cyan-500/60 hover:border-cyan-300 hover:bg-cyan-950/50 text-cyan-300'
            }`}
          >
            {variant === 'blade_sweep' && takedown.evadeCooldownRatio > 0.01 && (
              <div
                className="absolute bottom-0 left-0 right-0 bg-cyan-500/20"
                style={{ height: `${Math.round((1 - takedown.evadeCooldownRatio) * 100)}%` }}
              />
            )}
            <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
              {variant === 'blade_sweep' || variant === 'tri_vector' ? (
                <path d="M9.5 2L3.5 8L9.5 14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              ) : (
                <path d="M6 2L10 8L6 14L2 8Z" stroke="currentColor" strokeWidth="1.6" />
              )}
            </svg>
          </button>

          {/* VARIANT 1: BLADE SWEEP (Razor Cursor Bar Dodge + Pincer Danger Zones) */}
          {variant === 'blade_sweep' && (
            <div
              ref={railRef}
              data-testid="takedown-dodge-rail"
              onPointerMove={(e) => {
                const nx = computeNormX(e.clientX);
                if (nx !== null) onSetDodgeTarget(nx);
              }}
              onPointerDown={(e) => {
                const nx = computeNormX(e.clientX);
                if (nx !== null) {
                  onSetDodgeTarget(nx);
                  if (Math.abs(nx - cursorNorm) > 0.085) {
                    onTriggerDodgeDash(nx < cursorNorm ? -1 : 1);
                  } else {
                    onTriggerDodgeDash();
                  }
                }
              }}
              onPointerLeave={() => onSetDodgeTarget(null)}
              className="relative flex-1 h-12 bg-[#0b101a] border border-slate-700/85 overflow-visible cursor-crosshair"
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800/90" />
              <div className="pointer-events-none absolute inset-x-2 bottom-0 flex justify-between">
                {Array.from({ length: 11 }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`w-[1px] ${idx === 5 ? 'h-2 bg-slate-500/70' : 'h-1 bg-slate-700/70'}`}
                  />
                ))}
              </div>

              {slash && (slash.phase === 'telegraph' || slash.phase === 'strike') && (
                <>
                  <div
                    data-testid="takedown-slash-zone"
                    className="pointer-events-none absolute top-0 bottom-0"
                    style={{
                      left: `${(slash.zoneCenter - slash.zoneHalfWidth) * 100}%`,
                      width: `${slash.zoneHalfWidth * 2 * 100}%`,
                      backgroundImage:
                        'repeating-linear-gradient(-45deg, rgba(244,63,94,0.24) 0px, rgba(244,63,94,0.24) 5px, transparent 5px, transparent 10px)',
                      backgroundColor:
                        slash.phase === 'strike'
                          ? 'rgba(244,63,94,0.58)'
                          : `rgba(225,29,72,${0.24 + slash.progress * 0.36})`,
                      boxShadow:
                        slash.phase === 'strike'
                          ? '0 0 24px rgba(251,113,133,0.95)'
                          : `inset 0 0 14px rgba(244,63,94,${0.35 + slash.progress * 0.45})`,
                    }}
                  >
                    <div className="absolute inset-y-0 left-0 w-[2px] bg-rose-400/95" />
                    <div className="absolute inset-y-0 right-0 w-[2px] bg-rose-400/95" />
                  </div>

                  {slash.secondaryZoneCenter !== null && (
                    <div
                      data-testid="takedown-slash-zone-secondary"
                      className="pointer-events-none absolute top-0 bottom-0"
                      style={{
                        left: `${(slash.secondaryZoneCenter - slash.secondaryZoneHalfWidth) * 100}%`,
                        width: `${slash.secondaryZoneHalfWidth * 2 * 100}%`,
                        backgroundImage:
                          'repeating-linear-gradient(45deg, rgba(251,191,36,0.25) 0px, rgba(251,191,36,0.25) 5px, transparent 5px, transparent 10px)',
                        backgroundColor:
                          slash.phase === 'strike'
                            ? 'rgba(244,63,94,0.5)'
                            : `rgba(245,158,11,${0.2 + slash.progress * 0.32})`,
                      }}
                    >
                      <div className="absolute inset-y-0 left-0 w-[2px] bg-amber-300/90" />
                      <div className="absolute inset-y-0 right-0 w-[2px] bg-amber-300/90" />
                    </div>
                  )}

                  {slash.phase === 'telegraph' && (
                    <>
                      <div
                        className="pointer-events-none absolute -top-1 -bottom-1 w-[2px] bg-amber-300 shadow-[0_0_8px_#fcd34d]"
                        style={{
                          left: `${(slash.zoneCenter - slash.zoneHalfWidth - (1 - slash.progress) * 0.14) * 100}%`,
                          opacity: 0.45 + slash.progress * 0.55,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute -top-1 -bottom-1 w-[2px] bg-amber-300 shadow-[0_0_8px_#fcd34d]"
                        style={{
                          left: `${(slash.zoneCenter + slash.zoneHalfWidth + (1 - slash.progress) * 0.14) * 100}%`,
                          opacity: 0.45 + slash.progress * 0.55,
                        }}
                      />
                    </>
                  )}
                </>
              )}

              {renderSlashSvgEffects()}

              {showTrail &&
                trailOffsets.map((off, idx) => {
                  const ghostLeft = Math.max(4, Math.min(96, cursorLeftPct + trailDir * off));
                  const ghostAlpha = idx === 0 ? 0.42 : idx === 1 ? 0.24 : 0.11;
                  return (
                    <div
                      key={idx}
                      className="pointer-events-none absolute -top-0.5 -bottom-0.5 bg-cyan-300/60 border border-cyan-200/50"
                      style={{
                        left: `${ghostLeft}%`,
                        width: `${cursorWidthPct * 0.82}%`,
                        opacity: ghostAlpha,
                        transform: `translateX(-50%) skewX(${velLeanDeg}deg)`,
                      }}
                    />
                  );
                })}

              <div
                data-testid="takedown-cursor-bar"
                className={`pointer-events-none absolute -top-1.5 -bottom-1.5 border transition-colors duration-75 z-30 ${
                  isMissFlash
                    ? 'bg-rose-500 border-white shadow-[0_0_18px_#f43f5e]'
                    : isPerfFlash
                    ? 'bg-emerald-300 border-white shadow-[0_0_18px_#34d399]'
                    : isGoodFlash
                    ? 'bg-cyan-300 border-white shadow-[0_0_16px_#22d3ee]'
                    : inDangerNow
                    ? 'bg-amber-400 border-rose-200 shadow-[0_0_16px_rgba(251,191,36,0.95)]'
                    : 'bg-cyan-400 border-white/95 shadow-[0_0_14px_rgba(34,211,238,0.85)]'
                }`}
                style={{
                  left: `${cursorLeftPct}%`,
                  width: `${cursorWidthPct}%`,
                  transform: `translateX(-50%) skewX(${velLeanDeg}deg)`,
                }}
              >
                <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-[2px] bg-white" />
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-white" />
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-white" />
              </div>
            </div>
          )}

          {/* VARIANT 2: CHRONO RING (Collapsing Optical Ring Timing Parry) */}
          {variant === 'chrono_ring' && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Chrono Parry"
              data-testid="takedown-chrono-ring"
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerDodgeDash();
              }}
              className="relative flex-1 h-12 bg-[#0b101a] border border-slate-700/85 overflow-visible cursor-pointer flex items-center justify-center"
            >
              {/* Horizontal precision convergence gauge behind center radial sight */}
              <div className="pointer-events-none absolute inset-x-3 h-[2px] bg-slate-800" />
              <div
                className="pointer-events-none absolute h-3 w-2 bg-cyan-400/45 border border-cyan-300"
                style={{ left: `${50 - ringTargetNorm * 40}%`, transform: 'translateX(-50%)' }}
              />
              <div
                className="pointer-events-none absolute h-3 w-2 bg-cyan-400/45 border border-cyan-300"
                style={{ left: `${50 + ringTargetNorm * 40}%`, transform: 'translateX(-50%)' }}
              />
              <div
                className={`pointer-events-none absolute h-5 w-1.5 ${
                  ringPerfectWindow ? 'bg-emerald-300 shadow-[0_0_10px_#34d399]' : ringInParryWindow ? 'bg-cyan-300' : 'bg-rose-400'
                }`}
                style={{ left: `${50 - Math.min(0.95, ringCurrentNorm) * 40}%`, transform: 'translateX(-50%)' }}
              />
              <div
                className={`pointer-events-none absolute h-5 w-1.5 ${
                  ringPerfectWindow ? 'bg-emerald-300 shadow-[0_0_10px_#34d399]' : ringInParryWindow ? 'bg-cyan-300' : 'bg-rose-400'
                }`}
                style={{ left: `${50 + Math.min(0.95, ringCurrentNorm) * 40}%`, transform: 'translateX(-50%)' }}
              />

              {/* Concentric Radial Chrono Reticle */}
              <svg width="96" height="96" viewBox="0 0 96 96" className="pointer-events-none overflow-visible z-20" aria-hidden="true">
                <circle
                  cx="48"
                  cy="48"
                  r={Math.max(8, ringTargetNorm * 82)}
                  fill="none"
                  stroke={ringPerfectWindow ? '#34d399' : '#22d3ee'}
                  strokeWidth="3.2"
                  strokeDasharray="6 4"
                  opacity="0.92"
                />
                {slash?.phase === 'telegraph' && (
                  <circle
                    cx="48"
                    cy="48"
                    r={Math.max(4, Math.min(44, ringCurrentNorm * 38))}
                    fill="none"
                    stroke={ringPerfectWindow ? '#34d399' : ringInParryWindow ? '#67e8f9' : '#f43f5e'}
                    strokeWidth={ringInParryWindow ? '3.5' : '2.2'}
                  />
                )}
                <polygon
                  points="48,40 56,48 48,56 40,48"
                  fill={ringPerfectWindow ? '#34d399' : ringInParryWindow ? '#22d3ee' : '#1e293b'}
                  stroke="#e2e8f0"
                  strokeWidth="1.4"
                />
              </svg>
              {renderSlashSvgEffects()}
            </button>
          )}

          {/* VARIANT 3: DUAL ARC (Opposing Twin Blades Converging Inside Bracket) */}
          {variant === 'dual_arc' && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Blade Clash"
              data-testid="takedown-dual-arc"
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerDodgeDash();
              }}
              className="relative flex-1 h-12 bg-[#0b101a] border border-slate-700/85 overflow-visible cursor-pointer"
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800/90" />

              {/* Sweet-Spot Clash Bracket */}
              <div
                className={`pointer-events-none absolute top-1 bottom-1 border-x-2 transition-colors ${
                  dualInSweet
                    ? 'bg-emerald-400/25 border-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.7)]'
                    : 'bg-cyan-500/15 border-cyan-400/80'
                }`}
                style={{ left: `${bracketLeftPct}%`, width: `${bracketWidthPct}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 border border-white/80" />
              </div>

              {/* Opposing Converging Blade Needles */}
              <div
                className="pointer-events-none absolute -top-1 -bottom-1 w-2.5 bg-cyan-400 border border-white shadow-[0_0_12px_#22d3ee] z-30"
                style={{
                  left: `${Math.max(2, Math.min(98, takedown.needleA * 100))}%`,
                  transform: 'translateX(-50%) skewX(-18deg)',
                }}
              />
              <div
                className="pointer-events-none absolute -top-1 -bottom-1 w-2.5 bg-rose-500 border border-white shadow-[0_0_12px_#f43f5e] z-30"
                style={{
                  left: `${Math.max(2, Math.min(98, takedown.needleB * 100))}%`,
                  transform: 'translateX(-50%) skewX(18deg)',
                }}
              />
              {renderSlashSvgEffects()}
            </button>
          )}

          {/* VARIANT 4: TRI VECTOR (3 Laser Corridor Dodge Bays) */}
          {variant === 'tri_vector' && (
            <div
              data-testid="takedown-tri-vector"
              className="relative flex-1 h-12 bg-[#0b101a] border border-slate-700/85 overflow-visible grid grid-cols-3 gap-1 p-1"
            >
              {([0, 1, 2] as const).map((lane) => {
                const isDanger = Boolean(
                  takedown.dangerLanes[lane] &&
                    slash &&
                    (slash.phase === 'telegraph' || slash.phase === 'strike')
                );
                const isActive = takedown.activeLane === lane;
                return (
                  <button
                    key={lane}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Lane ${lane + 1}`}
                    data-testid={`takedown-lane-${lane}`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      if (onSelectLane) onSelectLane(lane);
                    }}
                    className={`relative h-full border cursor-pointer flex items-center justify-center transition-all ${
                      isDanger && isActive
                        ? 'bg-rose-500/45 border-amber-300 shadow-[0_0_14px_rgba(244,63,94,0.85)]'
                        : isDanger
                        ? 'bg-rose-500/30 border-rose-500/90'
                        : isActive
                        ? 'bg-cyan-500/25 border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.65)]'
                        : 'bg-slate-900/80 border-slate-700 hover:border-slate-500'
                    }`}
                    style={
                      isDanger
                        ? {
                            backgroundImage:
                              'repeating-linear-gradient(-45deg, rgba(244,63,94,0.32) 0px, rgba(244,63,94,0.32) 4px, transparent 4px, transparent 8px)',
                          }
                        : undefined
                    }
                  >
                    {isActive && (
                      <div className="w-3.5 h-3.5 rotate-45 bg-cyan-300 border-2 border-white shadow-[0_0_10px_#22d3ee]" />
                    )}
                    {isDanger && !isActive && (
                      <div className="w-1.5 h-5 bg-rose-400/90" />
                    )}
                  </button>
                );
              })}
              {renderSlashSvgEffects()}
            </div>
          )}

          {/* VARIANT 5: PULSE CADENCE (Oscillating Rapid Lock Timing) */}
          {variant === 'pulse_cadence' && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Cadence Lock"
              data-testid="takedown-pulse-cadence"
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerDodgeDash();
              }}
              className="relative flex-1 h-12 bg-[#0b101a] border border-slate-700/85 overflow-visible cursor-pointer"
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800/90" />

              {/* Shifting Lock Bracket */}
              <div
                className={`pointer-events-none absolute top-0.5 bottom-0.5 border-x-2 transition-colors ${
                  pulseInSweet
                    ? 'bg-emerald-400/28 border-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.75)]'
                    : 'bg-rose-500/18 border-cyan-400/85'
                }`}
                style={{ left: `${bracketLeftPct}%`, width: `${bracketWidthPct}%` }}
              >
                <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-[1px] bg-white/75" />
              </div>

              {/* Oscillating Pulse Needle */}
              <div
                className={`pointer-events-none absolute -top-1.5 -bottom-1.5 w-2.5 border z-30 ${
                  pulseInSweet
                    ? 'bg-emerald-300 border-white shadow-[0_0_16px_#34d399]'
                    : 'bg-cyan-400 border-white shadow-[0_0_14px_#22d3ee]'
                }`}
                style={{
                  left: `${Math.max(3, Math.min(97, takedown.needleA * 100))}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-white" />
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-white" />
              </div>
              {renderSlashSvgEffects()}
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            aria-label="Action Right"
            data-testid="takedown-evade-right"
            onClick={(e) => {
              e.currentTarget.blur();
              handleRightAction();
            }}
            className={`relative w-7 h-12 flex items-center justify-center border cursor-pointer shrink-0 overflow-hidden transition-colors ${
              takedown.evadeCooldownRatio > 0.05 && variant === 'blade_sweep'
                ? 'bg-[#0a101b] border-slate-800 text-slate-600'
                : 'bg-[#0b1420] border-cyan-500/60 hover:border-cyan-300 hover:bg-cyan-950/50 text-cyan-300'
            }`}
          >
            {variant === 'blade_sweep' && takedown.evadeCooldownRatio > 0.01 && (
              <div
                className="absolute bottom-0 left-0 right-0 bg-cyan-500/20"
                style={{ height: `${Math.round((1 - takedown.evadeCooldownRatio) * 100)}%` }}
              />
            )}
            <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
              {variant === 'blade_sweep' || variant === 'tri_vector' ? (
                <path d="M2.5 2L8.5 8L2.5 14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              ) : (
                <path d="M6 2L10 8L6 14L2 8Z" stroke="currentColor" strokeWidth="1.6" />
              )}
            </svg>
          </button>
        </div>

        {/* Bottom Dual-Wing Segmented Instability Meter (Zero Text) */}
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          <div className="flex-1 flex items-center justify-end gap-1">
            {Array.from({ length: instabCells }).map((_, idx) => {
              const cellIndexFromCenter = instabCells - 1 - idx;
              const lit = instabRatio >= (cellIndexFromCenter + 0.5) / instabCells;
              return (
                <div
                  key={`l-${idx}`}
                  className={`h-1 flex-1 transition-all duration-150 ${
                    lit
                      ? cellIndexFromCenter >= 4
                        ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                        : 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                      : 'bg-slate-800/85'
                  }`}
                />
              );
            })}
          </div>

          <div
            className={`w-2 h-2 rotate-45 border transition-colors ${
              instabRatio > 0.5
                ? 'bg-rose-500 border-rose-200 shadow-[0_0_8px_#f43f5e]'
                : instabRatio > 0.1
                ? 'bg-amber-400 border-amber-200'
                : 'bg-slate-900 border-slate-600'
            }`}
          />

          <div className="flex-1 flex items-center justify-start gap-1">
            {Array.from({ length: instabCells }).map((_, idx) => {
              const lit = instabRatio >= (idx + 0.5) / instabCells;
              return (
                <div
                  key={`r-${idx}`}
                  className={`h-1 flex-1 transition-all duration-150 ${
                    lit
                      ? idx >= 4
                        ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                        : 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                      : 'bg-slate-800/85'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
