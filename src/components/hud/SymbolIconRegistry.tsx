import React from 'react';
import { ComponentHealth } from '../../game/types';

export function statusColor(cur: number, max: number): string {
  const r = cur / Math.max(1, max);
  if (r <= 0.1) return '#ef4444';
  if (r <= 0.4) return '#f97316';
  if (r <= 0.72) return '#f59e0b';
  return '#22c55e';
}

export const CircularProgressRing: React.FC<{
  size?: number;
  strokeWidth?: number;
  progress: number; // 0..1
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}> = ({
  size = 28,
  strokeWidth = 2.5,
  progress,
  color = '#f59e0b',
  trackColor = 'rgba(51, 65, 85, 0.55)',
  children,
}) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamped);
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 block">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="butt"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
};

export const ArmorChassisSilhouette: React.FC<{
  components: ComponentHealth;
  size?: number;
}> = ({ components: c, size = 50 }) => {
  const h = Math.round(size * 1.15);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 56 64"
      aria-label="Chassis Integrity"
      className="block shrink-0"
    >
      {/* Left Legs */}
      <path
        d="M17 19 L5 11 M15 32 L4 32 M17 45 L5 53"
        stroke={statusColor(c.leftLegs, c.maxLeftLegs)}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Right Legs */}
      <path
        d="M39 19 L51 11 M41 32 L52 32 M39 45 L51 53"
        stroke={statusColor(c.rightLegs, c.maxRightLegs)}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Outer Armor Frame */}
      <rect
        x="16"
        y="10"
        width="24"
        height="44"
        rx="2"
        fill="rgba(10, 14, 20, 0.9)"
        stroke={statusColor(c.armor, c.maxArmor)}
        strokeWidth="2.4"
      />
      {/* Sensors */}
      <rect x="22" y="14" width="12" height="5" fill={statusColor(c.sensors, c.maxSensors)} />
      {/* Weapons */}
      <rect x="20" y="22" width="16" height="9" fill={statusColor(c.weapons, c.maxWeapons)} />
      {/* Core */}
      <rect x="21" y="34" width="14" height="8" fill={statusColor(c.chassis, c.maxChassis)} />
      {/* Engine */}
      <rect x="22" y="45" width="12" height="5" fill={statusColor(c.engine, c.maxEngine)} />
    </svg>
  );
};

export const ShellAmmoIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M7 1.5L9 1.5L10 4.5V12.5H6V4.5L7 1.5ZM5.5 13.5H10.5V15H5.5V13.5Z" />
  </svg>
);

export const DashArrowIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M2 12L8 4L14 12" strokeLinecap="square" />
    <path d="M5 13L8 9L11 13" strokeLinecap="square" opacity="0.65" />
  </svg>
);

export const GrappleHookIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
    <path d="M8 14V5M8 5L4 2M8 5L12 2M4 2V5.5M12 2V5.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="8" cy="13.5" r="1.2" fill="currentColor" />
  </svg>
);

export const ThrusterIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M8 1.5L12.5 8.5H9.5V11H6.5V8.5H3.5L8 1.5Z" />
    <path d="M6 12L8 15L10 12H6Z" opacity="0.85" />
  </svg>
);

export const HeatWarningIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
    <path d="M8 2L14.5 13.5H1.5L8 2Z" />
    <path d="M8 6.5V9.5M8 11.5V12" strokeLinecap="round" />
  </svg>
);

export const HostileDiamondIcon: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M8 2L14 8L8 14L2 8L8 2Z" />
  </svg>
);

export const BossThreatIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
    <polygon points="8,1.5 14.5,5.5 12.5,13.5 3.5,13.5 1.5,5.5" />
    <circle cx="8" cy="8.5" r="2" fill="currentColor" />
  </svg>
);

export const RadioWaveIcon: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
    <path d="M3 12C5 9 5 7 3 4M6.5 10.5C7.8 8.8 7.8 7.2 6.5 5.5M10 8H14" strokeLinecap="round" />
  </svg>
);

export const SoundIcon: React.FC<{ muted: boolean; className?: string }> = ({
  muted,
  className = 'w-3.5 h-3.5',
}) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
    <path d="M2.5 6H5.5L9 3V13L5.5 10H2.5V6Z" fill="currentColor" />
    {muted ? (
      <path d="M11.5 5.5L14.5 10.5M14.5 5.5L11.5 10.5" strokeLinecap="round" />
    ) : (
      <path d="M11.5 5.5C12.8 6.8 12.8 9.2 11.5 10.5M13.5 3.8C15.5 6 15.5 10 13.5 12.2" strokeLinecap="round" />
    )}
  </svg>
);

export const PauseGlyph: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <rect x="3.5" y="3" width="3" height="10" />
    <rect x="9.5" y="3" width="3" height="10" />
  </svg>
);

export const RestartGlyph: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
    <path d="M13 8A5 5 0 1 1 11.5 4.5M13 2.5V5.5H10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
