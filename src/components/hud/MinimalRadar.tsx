import React from 'react';
import { computeRadarBlips } from '../../game/hudController';
import { HudSnapshot } from '../../game/types';

interface MinimalRadarProps {
  hud: HudSnapshot;
  degraded: boolean;
  empActive: boolean;
}

export const MinimalRadar: React.FC<MinimalRadarProps> = ({ hud, degraded, empActive }) => {
  const size = 108;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const blips = computeRadarBlips(hud, 1450);

  // Rotating radar sweep angle driven smoothly by elapsed clock / aim
  const sweepDeg = ((hud.elapsedSeconds * 55 + (Date.now() % 4000) * 0.09) % 360);
  const sweepRad = (sweepDeg * Math.PI) / 180;
  const aimDeg = (hud.playerAimAngle * 180) / Math.PI;

  return (
    <div
      data-testid="minimal-radar"
      className="relative bg-[#0a0e14]/82 border border-emerald-500/35 rounded-full p-1"
      style={{ width: size + 8, height: size + 8 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block rounded-full">
        {/* Background & Range Rings */}
        <circle cx={cx} cy={cy} r={r} fill="rgba(7, 11, 16, 0.9)" stroke="rgba(16, 185, 129, 0.35)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r * 0.66} fill="none" stroke="rgba(16, 185, 129, 0.16)" strokeWidth="0.8" />
        <circle cx={cx} cy={cy} r={r * 0.33} fill="none" stroke="rgba(16, 185, 129, 0.16)" strokeWidth="0.8" />

        {/* Cross Axis Ticks */}
        <line x1={cx} y1={4} x2={cx} y2={size - 4} stroke="rgba(16, 185, 129, 0.14)" strokeWidth="0.8" />
        <line x1={4} y1={cy} x2={size - 4} y2={cy} stroke="rgba(16, 185, 129, 0.14)" strokeWidth="0.8" />

        {/* Player Aim Sector Cone */}
        <g transform={`translate(${cx}, ${cy}) rotate(${aimDeg})`}>
          <path
            d={`M0,0 L${r * 0.85},${-r * 0.28} A${r * 0.9},${r * 0.9} 0 0,1 ${r * 0.85},${r * 0.28} Z`}
            fill="rgba(56, 189, 248, 0.1)"
          />
          {/* Player directional triangle */}
          <polygon points="5,0 -3.5,-3 -2,0 -3.5,3" fill="#f8fafc" />
        </g>

        {/* Rotating Radar Sweep Line */}
        {!empActive && (
          <line
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(sweepRad) * r}
            y2={cy + Math.sin(sweepRad) * r}
            stroke="rgba(34, 197, 94, 0.48)"
            strokeWidth="1.2"
          />
        )}

        {/* Blips (Symbols only — no text) */}
        {!empActive &&
          blips.map((b, idx) => {
            const bx = cx + b.nx * (r - 4);
            const by = cy + b.ny * (r - 4);
            if (b.team === 'boss') {
              return (
                <g key={idx} transform={`translate(${bx}, ${by})`}>
                  <polygon points="0,-4.5 4.5,0 0,4.5 -4.5,0" fill="#f97316" stroke="#fef3c7" strokeWidth="0.8" />
                </g>
              );
            }
            if (b.team === 'enemy') {
              return (
                <polygon
                  key={idx}
                  points={`${bx},${by - 3} ${bx + 3},${by} ${bx},${by + 3} ${bx - 3},${by}`}
                  fill="#ef4444"
                  opacity={degraded ? 0.55 : 0.95}
                />
              );
            }
            if (b.team === 'ally') {
              return <circle key={idx} cx={bx} cy={by} r={2.3} fill="#38bdf8" />;
            }
            if (b.team === 'revenant') {
              return (
                <g key={idx} transform={`translate(${bx}, ${by})`}>
                  <polygon points="0,-4.4 4.4,0 0,4.4 -4.4,0" fill="#a855f7" stroke="#f3e8ff" strokeWidth="1" />
                </g>
              );
            }
            if (b.team === 'decoy') {
              return <circle key={idx} cx={bx} cy={by} r={2.1} fill="#a855f7" opacity={0.8} />;
            }
            return (
              <rect
                key={idx}
                x={bx - 2.3}
                y={by - 2.3}
                width="4.6"
                height="4.6"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.3"
              />
            );
          })}

        {/* Sensor interference / EMP static overlay */}
        {(empActive || degraded) && (
          <g opacity={empActive ? 0.75 : 0.35}>
            <line x1={12} y1={cy - 14} x2={size - 16} y2={cy - 14} stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 4" />
            <line x1={18} y1={cy + 16} x2={size - 12} y2={cy + 16} stroke="#ef4444" strokeWidth="1" strokeDasharray="5 3" />
          </g>
        )}
      </svg>

      {/* Ultra-minimal numeric badge at bottom edge */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0 bg-[#0a0e14] border border-slate-700/80 text-[9px] font-mono-tabular leading-tight text-emerald-400">
        {empActive ? 'JAM' : degraded ? 'LOW' : `${hud.kills}`}
      </div>
    </div>
  );
};
