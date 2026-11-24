import React from 'react';
import { SQUAD_ORDER_LABELS } from '../game/alliedAI';
import { WARHEAD_LABELS } from '../game/bossTypes';
import {
  computeContextualHudState,
  computeDamageResponsiveState,
} from '../game/hudController';
import { MORTAR_AMMO_ORDER, MORTAR_AMMO_SPECS } from '../game/mortarSystem';
import { SandboxBehaviorMode, SandboxTeamChoice } from '../game/sandboxRegistry';
import { HudSnapshot, MechClassId, MortarAmmoType, SquadOrder } from '../game/types';
import { MinimalRadar } from './hud/MinimalRadar';
import {
  ArmorChassisSilhouette,
  BossThreatIcon,
  CircularProgressRing,
  DashArrowIcon,
  GrappleHookIcon,
  HeatWarningIcon,
  HostileDiamondIcon,
  PauseGlyph,
  RadioWaveIcon,
  RestartGlyph,
  ShellAmmoIcon,
  SoundIcon,
  ThrusterIcon,
} from './hud/SymbolIconRegistry';
import { TakedownMinigameOverlay } from './hud/TakedownMinigameOverlay';
import { TransformSelectorOverlay } from './hud/TransformSelectorOverlay';
import { SandboxPanel } from './SandboxPanel';
import { VictoryOverlay } from './VictoryOverlay';

interface HudOverlayProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSelectWeapon: (slot: 1 | 2) => void;
  onSelectMortarAmmo: (ammo: MortarAmmoType) => void;
  onActivateSpecial: () => void;
  onTriggerDash: () => void;
  onTriggerGrapple: () => void;
  onToggleStealth: () => void;
  onSetDodgeTarget: (normX: number | null) => void;
  onTriggerDodgeDash: (explicitDir?: -1 | 1) => void;
  onIssueOrder: (order: SquadOrder) => void;
  onCloseTactical: () => void;
  onTrainingDamageLimb: () => void;
  onTrainingRepair: () => void;
  onTrainingToggleGod: () => void;
  onTrainingTriggerUltimate: () => void;
  onSandboxSpawn: (
    entryId: string,
    count: number,
    team?: SandboxTeamChoice,
    behavior?: SandboxBehaviorMode
  ) => void;
  onSandboxRemoveLast: () => void;
  onSandboxClearAll: () => void;
  onSandboxReset: () => void;
  onSandboxTogglePause: () => void;
  onSandboxToggleInfiniteAmmo: () => void;
  onSandboxSetBehavior: (behavior: SandboxBehaviorMode) => void;
  onSandboxSetTuning: (partial: Partial<{ speedMult: number; aggressionMult: number }>) => void;
  onSkipVictory: () => void;
  onCompleteVictory: () => void;
  onOpenTransformSelector: () => void;
  onSelectTransformTarget: (id: MechClassId) => void;
  onCloseTransformSelector: () => void;
}

const ORDERS: SquadOrder[] = [
  'follow',
  'hold',
  'attack_target',
  'defend',
  'search',
  'full_assault',
  'spread',
  'regroup',
  'retreat',
  'focus',
];

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  muted,
  onToggleMute,
  onPause,
  onRestart,
  onSelectWeapon,
  onSelectMortarAmmo,
  onActivateSpecial,
  onTriggerDash,
  onTriggerGrapple,
  onToggleStealth,
  onSetDodgeTarget,
  onTriggerDodgeDash,
  onIssueOrder,
  onCloseTactical,
  onTrainingDamageLimb,
  onTrainingRepair,
  onTrainingToggleGod,
  onTrainingTriggerUltimate,
  onSandboxSpawn,
  onSandboxRemoveLast,
  onSandboxClearAll,
  onSandboxReset,
  onSandboxTogglePause,
  onSandboxToggleInfiniteAmmo,
  onSandboxSetBehavior,
  onSandboxSetTuning,
  onSkipVictory,
  onCompleteVictory,
  onOpenTransformSelector,
  onSelectTransformTarget,
  onCloseTransformSelector,
}) => {

  const ctxHud = computeContextualHudState(hud);
  const dmgHud = computeDamageResponsiveState(hud, hud.elapsedSeconds + (Date.now() % 1000) * 0.001);
  const boss = hud.boss;

  const primaryBusy =
    hud.primaryWeapon.reloading ||
    hud.primaryWeapon.chargeProgress > 0 ||
    hud.primaryWeapon.prepProgress > 0;
  const primaryRingProgress = hud.primaryWeapon.reloading
    ? hud.primaryWeapon.reloadProgress
    : hud.primaryWeapon.prepProgress > 0
    ? hud.primaryWeapon.prepProgress
    : hud.primaryWeapon.chargeProgress > 0
    ? hud.primaryWeapon.chargeProgress
    : hud.primaryWeapon.ammo / Math.max(1, hud.primaryWeapon.maxAmmo);
  const primaryRingColor = hud.primaryWeapon.reloading
    ? '#ef4444'
    : hud.primaryWeapon.prepProgress > 0
    ? '#f97316'
    : hud.primaryWeapon.chargeProgress > 0
    ? '#38bdf8'
    : '#f59e0b';

  const secondaryRingProgress = hud.secondaryWeapon.reloading
    ? hud.secondaryWeapon.reloadProgress
    : hud.secondaryWeapon.ammo / Math.max(1, hud.secondaryWeapon.maxAmmo);

  const isBaseReplication = hud.specialAbility.kind === 'total_replication' && Boolean(hud.transformHud);
  const effSpecialCd = isBaseReplication
    ? hud.transformHud?.totalReplicationCooldown ?? 0
    : hud.specialAbility.cooldownRemaining;
  const effSpecialCdTotal = isBaseReplication
    ? hud.transformHud?.totalReplicationCooldownTotal ?? 60
    : hud.specialAbility.cooldownTotal;

  const specialRingProgress = hud.transformHud?.isTransforming
    ? hud.transformHud.progress
    : hud.specialAbility.active
    ? Math.max(
        0,
        Math.min(
          1,
          hud.specialAbility.activeRemaining /
            ((hud.playerAegisRemaining ?? 0) > 0 ? 30 : 6)
        )
      )
    : effSpecialCd <= 0
    ? 1
    : 1 - effSpecialCd / Math.max(1, effSpecialCdTotal);

  const boot = hud.boot;
  const bootActive = Boolean(boot?.active);
  const effectiveHudOpacity = bootActive
    ? Math.max(0.08, Math.min(1, (boot?.hudOpacity ?? 1) * dmgHud.hudFlickerOpacity))
    : dmgHud.hudFlickerOpacity;

  if (hud.victoryCinematic?.active) {
    return (
      <VictoryOverlay
        victory={hud.victoryCinematic}
        onSkip={onSkipVictory}
        onContinue={onCompleteVictory}
      />
    );
  }

  const revenantGlitch = hud.revenantInterference ?? 0;

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-3"
      style={{
        opacity: effectiveHudOpacity,
        transform: bootActive && boot?.flickerJitterX ? `translateX(${boot.flickerJitterX}px)` : undefined,
      }}
    >
      {/* Boot-up Stage 1-2 Power-On Dimming Veil & Horizontal Scanline Interference (Inactive in normal combat) */}
      {bootActive && boot && (
        <>
          {boot.screenDimAlpha > 0.01 && (
            <div
              className="pointer-events-none fixed inset-0 bg-[#05080d]"
              style={{ opacity: boot.screenDimAlpha }}
            />
          )}
          {boot.scanlineAlpha > 0.01 && (
            <div
              className="pointer-events-none fixed inset-0"
              style={{
                opacity: boot.scanlineAlpha,
                backgroundImage:
                  'repeating-linear-gradient(0deg, rgba(16,185,129,0.22) 0px, rgba(16,185,129,0.22) 1px, transparent 1px, transparent 4px)',
              }}
            />
          )}
          <div
            data-testid="mech-boot-overlay"
            className="pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-20 bg-[#070c12]/90 border border-emerald-500/60 px-4 py-2 min-w-[240px]"
          >
            <div className="flex items-center justify-between gap-4 text-[10px] font-mono-tabular text-emerald-400 tracking-widest">
              <span>{hud.unitCode} OS INIT</span>
              <span>{Math.round(boot.progress * 100)}%</span>
            </div>
            <div className="w-full h-1 bg-slate-900 mt-1 overflow-hidden">
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${Math.round(boot.progress * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10px] font-mono-tabular tracking-wider">
              {boot.subLines.slice(-3).map((line, idx, arr) => (
                <div
                  key={line}
                  className={idx === arr.length - 1 ? 'text-emerald-300 font-semibold' : 'text-slate-500'}
                >
                  ▸ {line}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Revenant Corrupted Signal Interference Veil */}
      {revenantGlitch > 0.01 && (
        <div
          data-testid="revenant-interference-veil"
          className="pointer-events-none fixed inset-0 z-20"
          style={{
            opacity: Math.min(0.65, revenantGlitch * 0.65),
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(168,85,247,0.28) 0px, rgba(168,85,247,0.28) 2px, transparent 2px, transparent 6px)',
            boxShadow: 'inset 0 0 80px rgba(168, 85, 247, 0.55)',
          }}
        />
      )}

      {/* Subtle Optical Corner Calibration Ticks (Zero Canvas Occlusion) */}
      <div
        className={`pointer-events-none fixed inset-2 border ${
          hud.revenantActive ? 'border-purple-500/25' : 'border-emerald-500/10'
        }`}
      >
        <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-400/35" />
        <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-400/35" />
        <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-emerald-400/35" />
        <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-emerald-400/35" />
      </div>

      {/* TOP PERIMETER: Compact Objective/Hostile Counter (Left), Boss/Alerts (Center), Icon Controls & Circular Radar (Right) */}
      <div
        className="flex items-start justify-between gap-3"
        style={{ opacity: !bootActive || boot?.topBarVisible ? 1 : 0.05 }}
      >
        {/* Top-Left: Minimal Tactical Counter + Squad Micro-Pips + Concise Radio Cue */}
        <div className="flex flex-col gap-1.5 max-w-[310px]">
          <div className="bg-[#0a0e14]/82 border border-slate-700/70 px-2.5 py-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 text-[11px] font-mono-tabular">
              <span className="text-amber-400 font-semibold tracking-wider truncate">
                {hud.missionTitle}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {hud.mode === 'survival' && (
                  <span className="text-slate-300">W{hud.wave}</span>
                )}
                <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                  <HostileDiamondIcon className="w-2.5 h-2.5" />
                  {hud.enemiesRemaining}
                </span>
                {hud.airborneEnemiesCount > 0 && (
                  <span className="text-sky-300">▲{hud.airborneEnemiesCount}</span>
                )}
              </div>
            </div>
            <div className="w-full h-1 bg-slate-800/90 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-200"
                style={{ width: `${Math.round(Math.max(0, Math.min(1, hud.objectiveProgress)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Compact 5-Unit AI Squad Strip (Player + up to 4 AI Wingmen) */}
          {ctxHud.showSquadCompact && (
            <div
              data-testid="squad-hud-strip"
              className="bg-[#0a0e14]/82 border border-slate-800/90 px-2 py-1 flex flex-col gap-1 text-[10px] font-mono-tabular"
            >
              <div className="flex items-center justify-between gap-2 text-[9px] text-slate-400">
                <span className="text-sky-400 font-semibold">[Q] SQUAD · {SQUAD_ORDER_LABELS[hud.squadOrder]}</span>
                <span>
                  {hud.squadMembers.filter((m) => m.alive && !m.downed).length + 1}/{hud.squadMembers.length + 1}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {hud.squadMembers.map((m) => {
                  const roleTag =
                    m.role === 'assault' ? 'ASL' : m.role === 'support' ? 'SUP' : m.role === 'recon' ? 'RCN' : 'SQD';
                  const critical = m.alive && !m.downed && m.hpRatio < 0.35;
                  const aegisSec = m.aegisRemaining ?? 0;
                  return (
                    <div
                      key={m.id}
                      data-testid={`squad-member-${m.id}`}
                      className="flex items-center justify-between gap-2"
                      title={`${m.callsign} (${m.unitName}) · ${m.statusText}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-[8px] px-1 border ${
                            !m.alive
                              ? 'border-red-900/70 text-red-500'
                              : m.downed
                              ? 'border-amber-500/80 text-amber-300'
                              : aegisSec > 0
                              ? 'border-cyan-400/80 text-cyan-300'
                              : m.role === 'support'
                              ? 'border-emerald-700/70 text-emerald-300'
                              : m.role === 'recon'
                              ? 'border-amber-700/70 text-amber-300'
                              : 'border-sky-700/70 text-sky-300'
                          }`}
                        >
                          {roleTag}
                        </span>
                        <span
                          className={`truncate ${
                            !m.alive
                              ? 'text-red-500/80 line-through'
                              : m.downed
                              ? 'text-amber-300 font-semibold'
                              : critical
                              ? 'text-red-300 font-semibold'
                              : 'text-slate-200'
                          }`}
                        >
                          {m.callsign}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.downed ? (
                          <span className="text-[9px] font-bold text-amber-300 tracking-wider">
                            {(m.reviveProgress ?? 0) > 0.01
                              ? `REV ${Math.round((m.reviveProgress ?? 0) * 100)}%`
                              : 'DOWNED'}
                          </span>
                        ) : m.alive ? (
                          <>
                            {aegisSec > 0 && (
                              <span
                                data-testid={`squad-aegis-${m.id}`}
                                className="text-[8px] px-1 border border-cyan-400/75 bg-cyan-950/70 text-cyan-200 font-semibold"
                              >
                                AEGIS {Math.ceil(aegisSec)}s
                              </span>
                            )}
                            <div className="w-12 h-1 bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-150 ${
                                  aegisSec > 0
                                    ? 'bg-cyan-400'
                                    : critical
                                    ? 'bg-red-500'
                                    : m.role === 'support'
                                    ? 'bg-emerald-400'
                                    : 'bg-sky-400'
                                }`}
                                style={{ width: `${Math.round(m.hpRatio * 100)}%` }}
                              />
                            </div>
                            <span className={`text-[9px] w-7 text-right ${critical ? 'text-red-400' : 'text-slate-400'}`}>
                              {Math.round(m.hpRatio * 100)}%
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] font-bold text-red-500 tracking-wider">KIA</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live Spoken Military Radio Transmission Subtitle Strip */}
          {hud.activeRadio ? (
            <div
              data-testid="radio-comms-box"
              className={`bg-[#0a0e14]/88 border-l-2 px-2.5 py-1.5 flex flex-col gap-0.5 text-[10px] font-mono-tabular ${
                hud.activeRadio.signalProfile === 'corrupted'
                  ? 'border-purple-400 text-purple-100 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : hud.activeRadio.priority >= 5
                  ? 'border-red-500 text-red-100'
                  : hud.activeRadio.priority === 4
                  ? 'border-orange-400 text-orange-100'
                  : 'border-amber-400 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold tracking-wider">
                  <RadioWaveIcon
                    className={`w-3 h-3 shrink-0 ${
                      hud.activeRadio.signalProfile === 'corrupted'
                        ? 'text-purple-400'
                        : hud.activeRadio.priority >= 5
                        ? 'text-red-400'
                        : hud.activeRadio.priority === 4
                        ? 'text-orange-400'
                        : 'text-amber-400'
                    }`}
                  />
                  <span
                    className={
                      hud.activeRadio.signalProfile === 'corrupted'
                        ? 'text-purple-300'
                        : hud.activeRadio.priority >= 5
                        ? 'text-red-400'
                        : hud.activeRadio.priority === 4
                        ? 'text-orange-300'
                        : 'text-amber-400'
                    }
                  >
                    {hud.activeRadio.speaker}
                  </span>
                </span>
                <span className="text-[9px] uppercase tracking-widest opacity-75">
                  {hud.activeRadio.signalProfile === 'corrupted'
                    ? 'ANOMALY'
                    : hud.activeRadio.signalProfile === 'distress'
                    ? 'MAYDAY'
                    : hud.activeRadio.priority >= 5
                    ? 'ALERT'
                    : 'TX'}
                </span>
              </div>
              <div className="leading-snug text-slate-100">{hud.activeRadio.text}</div>
            </div>
          ) : (
            ctxHud.showRadioBrief && (
              <div
                data-testid="radio-comms-box"
                className="bg-[#0a0e14]/78 border-l-2 border-amber-400/70 px-2 py-1 flex items-center gap-1.5 text-[10px] font-mono-tabular text-slate-300"
              >
                <RadioWaveIcon className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">
                  <span className="text-amber-400">{hud.radioFeed[0].speaker}:</span> {hud.radioFeed[0].text}
                </span>
              </div>
            )
          )}
        </div>

        {/* Top-Center: Context-Sensitive Boss Threat Strip & Critical Hazard Alerts */}
        <div className="flex-1 flex flex-col items-center gap-1.5 max-w-[440px]">
          {hud.revenantBanner && (
            <div
              data-testid="revenant-banner"
              className="w-full bg-[#13081f]/94 border border-purple-400 px-3 py-1.5 text-center text-[11px] font-mono-tabular font-bold tracking-[0.16em] text-purple-100 shadow-[0_0_20px_rgba(168,85,247,0.45)]"
            >
              {hud.revenantBanner}
            </div>
          )}

          {hud.cinematicBanner && (
            <div
              data-testid="cinematic-banner"
              className="w-full bg-[#0a0e14]/90 border border-amber-400/80 px-3 py-1 text-center text-[11px] font-mono-tabular font-bold tracking-wider text-amber-300"
            >
              {hud.cinematicBanner}
            </div>
          )}

          {hud.grapplerClingHud &&
            (hud.grapplerClingHud.attachedToPlayerCount > 0 || hud.grapplerClingHud.attachedToAlliesCount > 0) && (
              <div
                data-testid="grappler-cling-alert"
                className="w-full bg-[#1a0910]/92 border border-rose-500/85 px-3 py-1 flex items-center justify-between gap-3 text-[10px] font-mono-tabular text-rose-200"
              >
                <span className="font-bold tracking-wider text-rose-400">
                  {hud.grapplerClingHud.attachedToPlayerCount > 0
                    ? `PARASITE LATCHED x${hud.grapplerClingHud.attachedToPlayerCount}`
                    : `SQUADMATE LATCHED x${hud.grapplerClingHud.attachedToAlliesCount}`}
                </span>
                <span className="text-rose-200">
                  {hud.grapplerClingHud.attachedToPlayerCount > 0
                    ? `-${hud.grapplerClingHud.totalDpsOnPlayer} DPS · -${hud.grapplerClingHud.slowPenaltyPct}% SPD · SQUAD ENGAGING`
                    : `${hud.grapplerClingHud.attachedHosts.map((h) => `${h.callsign} (x${h.count})`).join(', ')}`}
                </span>
              </div>
            )}

          {ctxHud.showBoss && boss && (
            <div
              data-testid="boss-hud"
              className={`w-full bg-[#0a0e14]/88 border px-3 py-1.5 ${
                boss.ultimateActive ? 'border-amber-400' : 'border-red-500/65'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular">
                <span className="inline-flex items-center gap-1 text-red-400 font-bold tracking-wider">
                  <BossThreatIcon className="w-3.5 h-3.5" />
                  {boss.code} · {boss.name.toUpperCase()}
                </span>
                <span className="text-amber-300 font-semibold">
                  {boss.destroying
                    ? 'COLLAPSE'
                    : boss.ultimateActive
                    ? boss.ultimateName.toUpperCase()
                    : `P${boss.phase} · ${WARHEAD_LABELS[boss.activeWarhead]}`}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 space-y-0.5">
                  <div className="w-full h-2 bg-slate-900 border border-slate-700/60 overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all duration-150"
                      style={{ width: `${Math.max(0, Math.round((boss.hull / Math.max(1, boss.maxHull)) * 100))}%` }}
                    />
                  </div>
                  <div className="w-full h-1 bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-150"
                      style={{ width: `${Math.max(0, Math.round((boss.armor / Math.max(1, boss.maxArmor)) * 100))}%` }}
                    />
                  </div>
                </div>
                <span className="text-[10px] font-mono-tabular text-slate-300 shrink-0">
                  {boss.hull}
                </span>
              </div>

              {/* Compact 7 Subsystem Status Pips */}
              <div className="grid grid-cols-7 gap-1 mt-1">
                {boss.components.map((comp) => {
                  const shortCode: Record<string, string> = {
                    mortar: 'MRT',
                    ammoBays: 'AMM',
                    sensors: 'SNS',
                    leftLegs: 'L-L',
                    rightLegs: 'R-L',
                    auxWeapons: 'AUX',
                    powerCore: 'COR',
                  };
                  return (
                    <div
                      key={comp.id}
                      className={`text-center py-0.5 border text-[8px] font-mono-tabular ${
                        comp.destroyed
                          ? 'bg-red-950/90 border-red-600/80 text-red-400 line-through'
                          : comp.hpRatio < 0.45
                          ? 'bg-amber-950/70 border-amber-500/70 text-amber-300'
                          : 'bg-[#121720] border-slate-700/80 text-slate-400'
                      }`}
                    >
                      {shortCode[comp.id] ?? comp.id.slice(0, 3).toUpperCase()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hud.defendObjective && (
            <div className="w-full max-w-[260px] bg-[#0a0e14]/86 border border-sky-500/60 px-2.5 py-1">
              <div className="flex justify-between text-[10px] font-mono-tabular text-sky-300">
                <span>{hud.defendObjective.label}</span>
                <span>{hud.defendObjective.hp}</span>
              </div>
              <div className="w-full h-1 bg-slate-900 mt-0.5">
                <div
                  className="h-full bg-sky-400"
                  style={{
                    width: `${Math.max(0, Math.round((hud.defendObjective.hp / Math.max(1, hud.defendObjective.maxHp)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {hud.missileLockWarning && (
            <div
              data-testid="missile-lock-warning"
              className="bg-red-950/92 border border-red-400 px-3 py-1 text-[11px] font-mono-tabular font-bold tracking-widest text-red-100 flex items-center gap-1.5"
            >
              <HeatWarningIcon className="w-3.5 h-3.5 text-red-300" />
              LOCK WARNING
            </div>
          )}

          {hud.incomingWarnings.length > 0 && (
            <div className="bg-red-950/92 border border-red-400 px-3 py-1 text-[11px] font-mono-tabular font-bold text-red-100 flex items-center gap-1.5">
              <HeatWarningIcon className="w-3.5 h-3.5 text-amber-300" />
              {WARHEAD_LABELS[hud.incomingWarnings[0].warheadType]} · {hud.incomingWarnings[0].remaining.toFixed(1)}s
            </div>
          )}

          {hud.warningMessage && hud.incomingWarnings.length === 0 && (
            <div className="bg-red-950/90 border border-red-500/80 px-3 py-1 text-[11px] font-mono-tabular font-semibold text-red-200">
              {hud.warningMessage}
            </div>
          )}
        </div>

        {/* Top-Right: Compact Icon Controls + Circular Tactical Radar */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              title={muted ? 'Unmute Audio' : 'Mute Audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className={`p-1.5 bg-[#0a0e14]/84 hover:bg-slate-800 border rounded-sm cursor-pointer ${
                muted ? 'border-red-500/60 text-red-400' : 'border-slate-700/80 text-emerald-400'
              }`}
            >
              <SoundIcon muted={muted} />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart Mission"
              title="Restart"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="p-1.5 bg-[#0a0e14]/84 hover:bg-slate-800 border border-slate-700/80 text-slate-300 rounded-sm cursor-pointer"
            >
              <RestartGlyph />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Game"
              title="Pause [Esc]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="p-1.5 bg-[#0a0e14]/84 hover:bg-slate-800 border border-slate-700/80 text-amber-400 rounded-sm cursor-pointer"
            >
              <PauseGlyph />
            </button>
          </div>

          {hud.minimapVisible && (
            <MinimalRadar
              hud={hud}
              degraded={dmgHud.radarDegraded}
              empActive={dmgHud.empActive}
            />
          )}
        </div>
      </div>

      {/* TX-10 Proteus Total Replication Matrix Selector */}
      {hud.transformHud?.selectorOpen && !hud.takedownHud && (
        <TransformSelectorOverlay
          transformHud={hud.transformHud}
          onSelectTarget={onSelectTransformTarget}
          onClose={onCloseTransformSelector}
        />
      )}

      {/* Active Mechanical Transformation Telemetry Chip */}
      {hud.transformHud?.isTransforming && !hud.takedownHud && (
        <div
          data-testid="transform-active-banner"
          className="self-center bg-[#090d13]/92 border border-sky-400/80 px-3.5 py-2 w-[340px]"
        >
          <div className="flex items-center justify-between font-mono-tabular text-[10px] text-sky-300">
            <span className="font-bold tracking-wider">{hud.transformHud.stageLabel}</span>
            <span className="text-amber-300 font-bold">{Math.round(hud.transformHud.progress * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 mt-1 overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-all duration-75"
              style={{ width: `${Math.round(hud.transformHud.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Squad Command Overlay [Q] */}
      {hud.squadWheelOpen && !hud.takedownHud && (
        <div className="self-center pointer-events-auto bg-[#0a0e14]/94 border border-amber-500/65 p-3 max-w-[400px]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-tabular text-xs font-bold text-amber-400 tracking-wider">SQUAD ORDERS</span>
            <span className="text-[10px] font-mono-tabular text-slate-400">[Q]</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ORDERS.map((ord) => (
              <button
                key={ord}
                type="button"
                tabIndex={-1}
                data-testid={`squad-order-${ord}`}
                onClick={() => onIssueOrder(ord)}
                className={`px-2.5 py-1.5 text-[11px] font-mono-tabular text-left border cursor-pointer ${
                  hud.squadOrder === ord
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-[#121720] border-slate-700/80 text-slate-200 hover:bg-slate-800'
                }`}
              >
                {SQUAD_ORDER_LABELS[ord]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tactical Sector Overview Modal [Tab] */}
      {hud.tacticalOpen && !hud.takedownHud && (
        <div className="self-center pointer-events-auto bg-[#0a0e14]/95 border border-slate-600 p-4 w-[480px]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-tabular text-xs font-bold tracking-wider text-slate-200">SECTOR MAP [TAB]</span>
            <button
              type="button"
              onClick={onCloseTactical}
              className="px-2 py-0.5 text-[10px] font-mono-tabular bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              CLOSE
            </button>
          </div>
          <svg
            width="100%"
            height="280"
            viewBox={`0 0 ${hud.mapWidth} ${hud.mapHeight}`}
            className="bg-[#11161d] border border-slate-800"
          >
            {hud.minimapObstacles.map((o, idx) => (
              <rect
                key={`t-obs-${idx}`}
                x={o.x - o.w * 0.5}
                y={o.y - o.h * 0.5}
                width={o.w}
                height={o.h}
                fill="#334155"
              />
            ))}
            {hud.minimapEntities.map((ent, i) => {
              if (ent.team === 'enemy' && !ent.detected) return null;
              const col =
                ent.team === 'revenant'
                  ? '#a855f7'
                  : ent.team === 'ally'
                  ? '#38bdf8'
                  : ent.team === 'enemy'
                  ? '#ef4444'
                  : '#f59e0b';
              return <circle key={i} cx={ent.x} cy={ent.y} r={ent.team === 'revenant' ? 58 : 45} fill={col} />;
            })}
            <circle cx={hud.playerX} cy={hud.playerY} r={55} fill="#ffffff" />
          </svg>
        </div>
      )}

      {/* BOTTOM PERIMETER */}
      <div className="flex flex-col gap-1.5">
        {/* Full Sandbox Mode Control & Unit Spawning Drawer (hidden cleanly during CQC takedowns) */}
        {hud.mode === 'training' && hud.sandbox && !hud.takedownHud && (
          <SandboxPanel
            hud={hud}
            sandbox={hud.sandbox}
            onSpawnEntry={onSandboxSpawn}
            onRemoveLast={onSandboxRemoveLast}
            onClearAll={onSandboxClearAll}
            onResetEnvironment={onSandboxReset}
            onToggleSimPause={onSandboxTogglePause}
            onToggleGodMode={onTrainingToggleGod}
            onToggleInfiniteAmmo={onSandboxToggleInfiniteAmmo}
            onHealAll={onTrainingRepair}
            onDamageLimb={onTrainingDamageLimb}
            onTriggerBossUltimate={onTrainingTriggerUltimate}
            onSetBehavior={onSandboxSetBehavior}
            onSetTuning={onSandboxSetTuning}
          />
        )}

        <div className="flex items-end justify-between gap-3">
          {/* Bottom-Left: Context-Sensitive Mobility Chips + Minimalist Armor Chassis */}
          <div className="flex flex-col items-start gap-1.5">
            {/* Context-Sensitive Mobility Telemetry (Only shown when active/relevant) */}
            <div className="flex items-center gap-1.5 pointer-events-auto" data-testid="mobility-hud">
              {ctxHud.showFlightFull && hud.flightHud && (
                <div
                  data-testid="flight-hud"
                  className={`bg-[#0a0e14]/86 border px-2.5 py-1 flex items-center gap-2.5 text-[10px] font-mono-tabular ${
                    dmgHud.heatWarning ? 'border-red-500 text-red-300' : 'border-sky-500/65 text-sky-300'
                  }`}
                >
                  <ThrusterIcon className="w-3.5 h-3.5" />
                  <span>{Math.round(hud.flightHud.altitude)}m</span>
                  <span className="text-slate-400">
                    {hud.flightHud.verticalVel >= 0 ? '+' : ''}
                    {Math.round(hud.flightHud.verticalVel)}
                  </span>
                  <div className="flex items-center gap-1">
                    {dmgHud.heatWarning && <HeatWarningIcon className="w-3 h-3 text-red-400" />}
                    <div className="w-12 h-1.5 bg-slate-800 overflow-hidden">
                      <div
                        className={hud.flightHud.overheated ? 'h-full bg-red-500' : 'h-full bg-amber-400'}
                        style={{ width: `${Math.round(hud.flightHud.heat * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {ctxHud.showFlightStandby && (
                <div
                  data-testid="flight-hud"
                  className="bg-[#0a0e14]/75 border border-slate-700/70 px-2 py-0.5 flex items-center gap-1 text-[10px] font-mono-tabular text-sky-400"
                  title="Hold [SPACE] to Ignite Flight Thrusters"
                >
                  <ThrusterIcon className="w-3 h-3" />
                  <span>[SPC]</span>
                </div>
              )}

              {ctxHud.showDash && (
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="dash-hud-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onTriggerDash();
                  }}
                  className="bg-[#0a0e14]/86 border border-cyan-500/60 px-2 py-1 flex items-center gap-1.5 text-[10px] font-mono-tabular text-cyan-300 cursor-pointer"
                >
                  <CircularProgressRing
                    size={20}
                    strokeWidth={2}
                    progress={
                      hud.dashHud.active
                        ? 1
                        : 1 - hud.dashHud.cooldownRemaining / Math.max(0.2, hud.dashHud.cooldownTotal)
                    }
                    color={hud.dashHud.active ? '#22d3ee' : '#f59e0b'}
                  >
                    <DashArrowIcon className="w-2.5 h-2.5" />
                  </CircularProgressRing>
                  <span>
                    {hud.dashHud.active ? 'BOOST' : `${hud.dashHud.cooldownRemaining.toFixed(1)}s`}
                  </span>
                </button>
              )}

              {ctxHud.showGrapple && (
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="grapple-hud-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onTriggerGrapple();
                  }}
                  className={`bg-[#0a0e14]/86 border px-2 py-1 flex items-center gap-1.5 text-[10px] font-mono-tabular cursor-pointer ${
                    hud.grappleHud.state === 'attached'
                      ? 'border-amber-400 text-amber-300'
                      : hud.grappleHud.hasValidTarget
                      ? 'border-emerald-500/70 text-emerald-300'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  <GrappleHookIcon className="w-3.5 h-3.5" />
                  <span>
                    {hud.grappleHud.state === 'attached'
                      ? `${Math.round(hud.grappleHud.cableLength)}m`
                      : hud.grappleHud.cooldownRemaining > 0
                      ? `${hud.grappleHud.cooldownRemaining.toFixed(1)}s`
                      : `${Math.round(hud.grappleHud.targetDist)}m`}
                  </span>
                  {hud.grappleHud.state === 'attached' && (
                    <div className="w-8 h-1 bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${Math.round(Math.min(1, hud.grappleHud.tension) * 100)}%` }}
                      />
                    </div>
                  )}
                </button>
              )}

              {hud.stealthHud?.supported && (
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="stealth-hud-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleStealth();
                  }}
                  className={`bg-[#0a0e14]/88 border px-2 py-1 flex items-center gap-1.5 text-[10px] font-mono-tabular cursor-pointer ${
                    hud.stealthHud.detectedByEnemy && hud.stealthHud.active
                      ? 'border-amber-400 text-amber-300'
                      : hud.stealthHud.active
                      ? 'border-rose-400 text-rose-300'
                      : hud.stealthHud.cooldownRemaining > 0
                      ? 'border-slate-700 text-slate-400'
                      : 'border-slate-600 text-slate-300 hover:border-rose-400/70'
                  }`}
                  title="Toggle Optical Cloak [C]"
                >
                  <span>
                    {hud.stealthHud.active
                      ? hud.stealthHud.detectedByEnemy
                        ? '[C] EXPOSED'
                        : '[C] CLOAKED'
                      : hud.stealthHud.cooldownRemaining > 0
                      ? `[C] ${hud.stealthHud.cooldownRemaining.toFixed(1)}s`
                      : '[C] CLOAK'}
                  </span>
                  <div className="w-10 h-1 bg-slate-800 overflow-hidden">
                    <div
                      className={hud.stealthHud.active ? 'h-full bg-rose-400' : 'h-full bg-slate-400'}
                      style={{
                        width: `${Math.round(
                          (hud.stealthHud.energy / Math.max(1, hud.stealthHud.maxEnergy)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </button>
              )}
            </div>

            {/* Minimalist Chassis Integrity Block */}
            <div className="bg-[#0a0e14]/84 border border-slate-700/75 px-2.5 py-2 flex items-center gap-3">
              <ArmorChassisSilhouette components={hud.components} size={46} />

              <div className="min-w-[144px] space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular">
                  <span className="text-slate-200 font-bold tracking-wider">{hud.unitCode}</span>
                  <div className="flex items-center gap-1.5">
                    {(hud.playerAegisRemaining ?? 0) > 0 && (
                      <span
                        data-testid="player-aegis-badge"
                        className="px-1 border border-cyan-400/80 bg-cyan-950/80 text-cyan-200 font-bold text-[9px]"
                      >
                        AEGIS {Math.ceil(hud.playerAegisRemaining ?? 0)}s
                      </span>
                    )}
                    <span className="text-emerald-400">
                      {hud.speed}
                      <span className="text-slate-500">m/s</span>
                    </span>
                  </div>
                </div>

                {/* Hull Bar */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] font-mono-tabular">
                    <span className={dmgHud.lowHullCritical ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                      {hud.hp}
                    </span>
                    <span className="text-slate-500">{hud.armor}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        dmgHud.lowHullCritical ? 'bg-red-500' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.round(dmgHud.hullRatio * 100)}%` }}
                    />
                  </div>
                  <div className="w-full h-1 bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-150"
                      style={{ width: `${Math.round(dmgHud.armorRatio * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Compact Telemetry Codes / Disabled Warnings / Contextual AA Status */}
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono-tabular">
                  <span className={hud.braced ? 'text-amber-300' : hud.stability < 45 ? 'text-red-400' : 'text-slate-400'}>
                    {hud.braced ? 'BRACED' : `STB ${hud.stability}%`}
                  </span>
                  {hud.aaHud && (hud.aaHud.active || hud.aaHud.heat > 0.05 || hud.aaHud.overheated || hud.aaHud.damaged) && (
                    <span
                      data-testid="aa-hud-chip"
                      className={`inline-flex items-center gap-1 ${
                        hud.aaHud.overheated
                          ? 'text-red-400 font-bold'
                          : hud.aaHud.damaged
                          ? 'text-amber-400'
                          : 'text-emerald-300'
                      }`}
                      title="Automated Anti-Air Point Defense"
                    >
                      <span>{hud.aaHud.overheated ? 'AA OVR' : hud.aaHud.damaged ? 'AA DMG' : 'AA'}</span>
                      <span className="w-6 h-1 bg-slate-800 inline-block overflow-hidden align-middle">
                        <span
                          className={`block h-full ${hud.aaHud.overheated ? 'bg-red-500' : 'bg-amber-400'}`}
                          style={{ width: `${Math.round(hud.aaHud.heat * 100)}%` }}
                        />
                      </span>
                    </span>
                  )}
                  {dmgHud.disabledSubsystems.length > 0 ? (
                    <span className="text-red-400 font-bold">
                      !{dmgHud.disabledSubsystems[0]}
                    </span>
                  ) : dmgHud.sensorsDamaged ? (
                    <span className="text-amber-400">SNS LOW</span>
                  ) : (
                    <span className="text-slate-500">
                      {hud.flightHud?.airborne ? 'AIR' : hud.terrain.slice(0, 4).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom-Right: Context-Sensitive Mortar Ordnance + Compact Symbol Weapon Slots */}
          <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
            {ctxHud.showMortar && hud.mortarHud && (
              <div
                data-testid="mortar-ammo-bar"
                className="bg-[#0a0e14]/88 border border-amber-500/55 px-2 py-1 flex items-center gap-1.5"
              >
                <span className="text-[10px] font-mono-tabular text-amber-400">
                  [F] {hud.mortarHud.travelTime.toFixed(1)}s
                </span>
                <div className="flex items-center gap-1">
                  {MORTAR_AMMO_ORDER.map((ammoId) => {
                    const spec = MORTAR_AMMO_SPECS[ammoId];
                    const active = hud.mortarHud?.activeAmmo === ammoId;
                    return (
                      <button
                        key={ammoId}
                        type="button"
                        tabIndex={-1}
                        title={spec.shortDesc}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectMortarAmmo(ammoId);
                        }}
                        className={`px-1.5 py-0.5 text-[10px] font-mono-tabular font-semibold border cursor-pointer ${
                          active
                            ? 'text-slate-950 border-white/80'
                            : 'bg-[#121720] text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                        style={active ? { backgroundColor: spec.color } : undefined}
                      >
                        {spec.code}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-end gap-1.5">
              {/* Weapon Slot 1 */}
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectWeapon(1);
                }}
                className={`px-2.5 py-1.5 border flex items-center gap-2 cursor-pointer ${
                  hud.activeSlot === 1
                    ? 'bg-[#111722]/90 border-amber-400/90'
                    : 'bg-[#0a0e14]/82 border-slate-700/80'
                }`}
              >
                <CircularProgressRing size={28} strokeWidth={2.4} progress={primaryRingProgress} color={primaryRingColor}>
                  <ShellAmmoIcon className="w-3 h-3 text-amber-300" />
                </CircularProgressRing>
                <div className="text-left font-mono-tabular leading-tight">
                  <div className="text-[9px] text-slate-400 flex items-center gap-1">
                    <span>[1]</span>
                    {primaryBusy && (
                      <span className={hud.primaryWeapon.reloading ? 'text-red-400' : 'text-amber-300'}>
                        {hud.primaryWeapon.reloading ? 'REL' : hud.primaryWeapon.prepProgress > 0 ? 'LCK' : 'CHG'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold text-amber-400">{hud.primaryWeapon.ammo}</span>
                    <span className="text-[10px] text-slate-500">/{hud.primaryWeapon.maxAmmo}</span>
                  </div>
                </div>
              </button>

              {/* Weapon Slot 2 */}
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectWeapon(2);
                }}
                className={`px-2.5 py-1.5 border flex items-center gap-2 cursor-pointer ${
                  hud.activeSlot === 2
                    ? 'bg-[#111722]/90 border-amber-400/90'
                    : 'bg-[#0a0e14]/82 border-slate-700/80'
                }`}
              >
                <CircularProgressRing
                  size={28}
                  strokeWidth={2.4}
                  progress={secondaryRingProgress}
                  color={hud.secondaryWeapon.reloading ? '#ef4444' : '#38bdf8'}
                >
                  <ShellAmmoIcon className="w-3 h-3 text-sky-300" />
                </CircularProgressRing>
                <div className="text-left font-mono-tabular leading-tight">
                  <div className="text-[9px] text-slate-400 flex items-center gap-1">
                    <span>[2]</span>
                    {hud.secondaryWeapon.reloading && <span className="text-red-400">REL</span>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold text-slate-200">{hud.secondaryWeapon.ammo}</span>
                    <span className="text-[10px] text-slate-500">/{hud.secondaryWeapon.maxAmmo}</span>
                  </div>
                </div>
              </button>

              {/* Special Ability [V] */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-special-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onActivateSpecial();
                }}
                className={`px-2 py-1.5 border flex items-center gap-2 cursor-pointer ${
                  hud.specialAbility.active || hud.transformHud?.isTransforming
                    ? 'bg-sky-950/88 border-sky-400'
                    : effSpecialCd <= 0
                    ? 'bg-[#0c1614]/86 border-emerald-500/75 hover:bg-slate-800'
                    : 'bg-[#0a0e14]/80 border-slate-800 opacity-80'
                }`}
                title={hud.specialAbility.name}
              >
                <CircularProgressRing
                  size={28}
                  strokeWidth={2.4}
                  progress={specialRingProgress}
                  color={
                    hud.specialAbility.active || hud.transformHud?.isTransforming
                      ? '#38bdf8'
                      : effSpecialCd <= 0
                      ? '#22c55e'
                      : '#64748b'
                  }
                >
                  <span className="text-[9px] font-mono-tabular font-bold text-slate-200">V</span>
                </CircularProgressRing>
                <div className="text-left font-mono-tabular leading-tight min-w-[46px]">
                  <div className="text-[9px] text-slate-400">
                    {isBaseReplication ? 'MORPH' : hud.stealthHud?.executionTargetInRange ? 'EXEC' : 'SYS'}
                  </div>
                  <div className="text-[11px] font-bold">
                    {hud.transformHud?.isTransforming && isBaseReplication ? (
                      <span className="text-sky-300">{Math.round(hud.transformHud.progress * 100)}%</span>
                    ) : hud.specialAbility.active ? (
                      <span className="text-sky-300">{hud.specialAbility.activeRemaining.toFixed(1)}s</span>
                    ) : hud.stealthHud?.executionTargetInRange ? (
                      <span className="text-rose-400 animate-pulse">LOCK</span>
                    ) : effSpecialCd <= 0 ? (
                      <span className="text-emerald-400">RDY</span>
                    ) : (
                      <span className="text-slate-400">{effSpecialCd.toFixed(1)}s</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Independent 60s Total Replication Cooldown & Re-Transform Control when currently in a Replicated Chassis */}
              {hud.transformHud?.isProteus && hud.transformHud.isTransformed && (
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="hud-replicate-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenTransformSelector();
                  }}
                  className={`px-2 py-1.5 border flex items-center gap-2 cursor-pointer ${
                    hud.transformHud.totalReplicationCooldown <= 0
                      ? 'bg-[#0b1824]/88 border-sky-400/80 hover:bg-sky-950/75'
                      : 'bg-[#0a0e14]/82 border-slate-800 opacity-85'
                  }`}
                  title="Total Replication (B) — 60s cooldown"
                >
                  <CircularProgressRing
                    size={28}
                    strokeWidth={2.4}
                    progress={
                      hud.transformHud.totalReplicationCooldown <= 0
                        ? 1
                        : 1 -
                          hud.transformHud.totalReplicationCooldown /
                            Math.max(1, hud.transformHud.totalReplicationCooldownTotal)
                    }
                    color={hud.transformHud.totalReplicationCooldown <= 0 ? '#38bdf8' : '#64748b'}
                  >
                    <span className="text-[9px] font-mono-tabular font-bold text-sky-300">B</span>
                  </CircularProgressRing>
                  <div className="text-left font-mono-tabular leading-tight min-w-[46px]">
                    <div className="text-[9px] text-sky-400">MORPH</div>
                    <div className="text-[11px] font-bold">
                      {hud.transformHud.totalReplicationCooldown <= 0 ? (
                        <span className="text-sky-300">RDY</span>
                      ) : (
                        <span className="text-slate-400">
                          {Math.ceil(hud.transformHud.totalReplicationCooldown)}s
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Wordless Optical Small-Bar Slash-Dodging Minigame */}
      {hud.takedownHud && (hud.takedownHud.active || hud.takedownHud.judgmentTimer > 0) && (
        <TakedownMinigameOverlay
          takedown={hud.takedownHud}
          onSetDodgeTarget={onSetDodgeTarget}
          onTriggerDodgeDash={onTriggerDodgeDash}
        />
      )}
    </div>
  );
};
