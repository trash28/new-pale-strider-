import { getProteusMorphProfile, isProteusMorphTargetId } from './proteusMorphs';
import { LegMountSpec, MechClassId, MechClassSpec } from './types';

export const TRANSFORM_COOLDOWN_SEC = 60;
export const TRANSFORM_BASE_DURATION_SEC = 3.55;

export type TransformStageId =
  | 'unlock'
  | 'retract_armor'
  | 'core_rotation'
  | 'limb_reposition'
  | 'structural_reform'
  | 'weapon_deploy'
  | 'staggered_lock'
  | 'reactor_stabilize';

export type TransformMassClass = 'light' | 'standard' | 'heavy' | 'artillery' | 'ewar' | 'aerial';

export type TransformAudioCueId =
  | 'unlock'
  | 'retract_armor'
  | 'core_rotation'
  | 'limb_reposition'
  | 'structural_reform'
  | 'weapon_deploy'
  | 'clamp_lock_a'
  | 'clamp_lock_b'
  | 'stabilize';

export interface TransformChoreographyProfile {
  targetId: MechClassId;
  massClass: TransformMassClass;
  durationSec: number;
  maxCowlSlide: number; // px max outward displacement along guide rails
  coreTwistSign: 1 | -1;
  wingUnfoldAngle: number; // rad fold-out for aerial frames
  turretLiftPx: number;
  heavyShoulderFold: boolean;
  staggeredLockImpulse: number;
}

export interface TransformKeyframeEvent {
  cue: TransformAudioCueId;
  sparkBurst: boolean;
  ventSteam: boolean;
  shakeAmount: number;
}

export interface TransformRigPose {
  u: number; // normalized progress 0..1
  stage: TransformStageId;
  stageLabel: string;
  seamGlow: number; // 0..1
  cowlSpread: number; // 0..1
  pistonExtension: number; // 0..1
  coreRotationRad: number;
  gearAngleRad: number;
  morphBlend: number; // 0 (source) -> 1 (target)
  oldWeaponRetract: number; // 0 (deployed) -> 1 (retracted inside bay)
  newWeaponDeploy: number; // 0 (stowed) -> 1 (extended & locked)
  wingDeploy: number; // 0..1
  clampLeftLock: number; // 0 (open) -> 1 (slammed shut)
  clampRightLock: number; // 0 (open) -> 1 (slammed shut)
  dorsalLock: number; // 0 (open) -> 1 (slammed shut)
  lockBounce: number; // short damped vibration pulse during clamp hits
  visorIgnition: number; // 0..1
  chassisLiftPx: number;
  interpolatedRadius: number;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  sourceLegs: LegMountSpec[];
  targetLegs: LegMountSpec[];
}

export interface TransformRuntimeState {
  isProteusLineage: boolean;
  baseClassId: MechClassId;
  activeClassId: MechClassId;
  active: boolean;
  sourceSpec: MechClassSpec;
  targetSpec: MechClassSpec;
  profile: TransformChoreographyProfile;
  elapsed: number;
  duration: number;
  lastProgress: number;
  firedEvents: Set<string>;
  pose: TransformRigPose;
  sourcePaint: { primary: string; secondary: string; accent: string };
  targetPaint: { primary: string; secondary: string; accent: string };
}

export interface EligibleReplicationTarget {
  id: MechClassId;
  code: string;
  name: string;
  role: string;
  silhouette: MechClassSpec['silhouette'];
  primaryColor: string;
  accentColor: string;
  unlocked: boolean;
  isCurrent: boolean;
  canFly: boolean;
  legsCount: number;
  massClass: TransformMassClass;
  morphCode: string;
  morphName: string;
  category: string;
  enhancedSummary: string;
  uniqueAbilityName: string;
  uniqueAbilityDesc: string;
  weaponSummary: string;
}

const STAGE_WINDOWS: { id: TransformStageId; start: number; end: number; label: string }[] = [
  { id: 'unlock', start: 0.0, end: 0.12, label: 'UNLATCHING CHASSIS SEAMS' },
  { id: 'retract_armor', start: 0.12, end: 0.28, label: 'RETRACTING ARMOR PLATES' },
  { id: 'core_rotation', start: 0.28, end: 0.46, label: 'ROTATING INTERNAL GIMBAL' },
  { id: 'limb_reposition', start: 0.46, end: 0.65, label: 'RECONFIGURING ACTUATOR LEGS' },
  { id: 'structural_reform', start: 0.65, end: 0.80, label: 'SHIFTING SUPERSTRUCTURE' },
  { id: 'weapon_deploy', start: 0.80, end: 0.91, label: 'DEPLOYING ORDNANCE SYSTEMS' },
  { id: 'staggered_lock', start: 0.91, end: 0.97, label: 'ENGAGING STRUCTURAL CLAMPS' },
  { id: 'reactor_stabilize', start: 0.97, end: 1.0, label: 'REACTOR EQUILIBRIUM LOCK' },
];

const AUDIO_KEYFRAMES: { key: string; u: number; event: TransformKeyframeEvent }[] = [
  { key: 'unlock', u: 0.01, event: { cue: 'unlock', sparkBurst: true, ventSteam: true, shakeAmount: 0.14 } },
  { key: 'retract', u: 0.13, event: { cue: 'retract_armor', sparkBurst: false, ventSteam: true, shakeAmount: 0.1 } },
  { key: 'core', u: 0.29, event: { cue: 'core_rotation', sparkBurst: true, ventSteam: false, shakeAmount: 0.16 } },
  { key: 'limb', u: 0.47, event: { cue: 'limb_reposition', sparkBurst: false, ventSteam: true, shakeAmount: 0.12 } },
  { key: 'reform', u: 0.66, event: { cue: 'structural_reform', sparkBurst: true, ventSteam: false, shakeAmount: 0.14 } },
  { key: 'weapon', u: 0.81, event: { cue: 'weapon_deploy', sparkBurst: true, ventSteam: false, shakeAmount: 0.14 } },
  { key: 'clamp_a', u: 0.915, event: { cue: 'clamp_lock_a', sparkBurst: true, ventSteam: true, shakeAmount: 0.22 } },
  { key: 'clamp_b', u: 0.945, event: { cue: 'clamp_lock_b', sparkBurst: true, ventSteam: false, shakeAmount: 0.28 } },
  { key: 'stabilize', u: 0.975, event: { cue: 'stabilize', sparkBurst: false, ventSteam: true, shakeAmount: 0.08 } },
];

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeInOutQuart(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
}

export function easeOutBackWeighted(t: number, overshoot = 1.35): number {
  const x = clamp01(t);
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
}

export function subProgress(u: number, start: number, end: number): number {
  if (end <= start) return u >= end ? 1 : 0;
  return clamp01((u - start) / (end - start));
}

export function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 128,
      parseInt(clean[1] + clean[1], 16) || 128,
      parseInt(clean[2] + clean[2], 16) || 128,
    ];
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return [128, 128, 128];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function lerpHexColor(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const [r1, g1, b1] = parseHexColor(a);
  const [r2, g2, b2] = parseHexColor(b);
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const bl = Math.round(b1 + (b2 - b1) * k);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function classifyTransformMass(spec: MechClassSpec): TransformMassClass {
  if (spec.canFly || spec.silhouette === 'valkyrie') return 'aerial';
  if (spec.silhouette === 'ewar') return 'ewar';
  if (spec.silhouette === 'artillery' || spec.silhouette === 'colossus' || spec.primaryWeapon.kind === 'artillery') {
    return 'artillery';
  }
  if (spec.mass >= 48 || spec.silhouette === 'juggernaut') return 'heavy';
  if (spec.mass <= 26 || spec.silhouette === 'wedge' || spec.silhouette === 'assassin') return 'light';
  return 'standard';
}

const CUSTOM_PROFILE_TUNINGS: Partial<Record<MechClassId, Partial<TransformChoreographyProfile>>> = {
  recon: { massClass: 'light', durationSec: 3.1, maxCowlSlide: 9, coreTwistSign: 1, turretLiftPx: 3, heavyShoulderFold: false, staggeredLockImpulse: 0.72 },
  assassin: { massClass: 'light', durationSec: 3.15, maxCowlSlide: 10, coreTwistSign: -1, turretLiftPx: 3, heavyShoulderFold: false, staggeredLockImpulse: 0.78 },
  phantom: { massClass: 'standard', durationSec: 3.3, maxCowlSlide: 11, coreTwistSign: 1, turretLiftPx: 4, heavyShoulderFold: false, staggeredLockImpulse: 0.85 },
  standard: { massClass: 'standard', durationSec: 3.45, maxCowlSlide: 11, coreTwistSign: 1, turretLiftPx: 4, heavyShoulderFold: false, staggeredLockImpulse: 0.9 },
  sniper: { massClass: 'standard', durationSec: 3.55, maxCowlSlide: 12, coreTwistSign: -1, turretLiftPx: 5, heavyShoulderFold: false, staggeredLockImpulse: 0.92 },
  ewar: { massClass: 'ewar', durationSec: 3.5, maxCowlSlide: 12, coreTwistSign: 1, turretLiftPx: 5, heavyShoulderFold: false, staggeredLockImpulse: 0.88 },
  engineer: { massClass: 'standard', durationSec: 3.6, maxCowlSlide: 13, coreTwistSign: -1, turretLiftPx: 5, heavyShoulderFold: true, staggeredLockImpulse: 0.95 },
  heavy: { massClass: 'heavy', durationSec: 3.8, maxCowlSlide: 14, coreTwistSign: 1, turretLiftPx: 6, heavyShoulderFold: true, staggeredLockImpulse: 1.25 },
  artillery: { massClass: 'artillery', durationSec: 3.85, maxCowlSlide: 14, coreTwistSign: -1, turretLiftPx: 7, heavyShoulderFold: true, staggeredLockImpulse: 1.28 },
  colossus: { massClass: 'artillery', durationSec: 3.95, maxCowlSlide: 15, coreTwistSign: 1, turretLiftPx: 8, heavyShoulderFold: true, staggeredLockImpulse: 1.38 },
  valkyrie: { massClass: 'aerial', durationSec: 3.25, maxCowlSlide: 11, coreTwistSign: -1, wingUnfoldAngle: Math.PI * 0.44, turretLiftPx: 4, heavyShoulderFold: false, staggeredLockImpulse: 0.84 },
};

/**
 * Generates an explicit or automatic dynamic choreography profile for any MechClassSpec.
 * Works seamlessly for all current allied mechs AND any future unit added to MECH_ROSTER.
 */
export function buildTransformChoreographyProfile(spec: MechClassSpec): TransformChoreographyProfile {
  const massClass = classifyTransformMass(spec);
  const baseDur =
    massClass === 'artillery'
      ? 3.88
      : massClass === 'heavy'
      ? 3.78
      : massClass === 'aerial'
      ? 3.25
      : massClass === 'light'
      ? 3.12
      : 3.48;
  const custom = CUSTOM_PROFILE_TUNINGS[spec.id];
  return {
    targetId: spec.id,
    massClass: custom?.massClass ?? massClass,
    durationSec: custom?.durationSec ?? baseDur,
    maxCowlSlide: custom?.maxCowlSlide ?? Math.max(9, Math.min(15, spec.radius * 0.48)),
    coreTwistSign: custom?.coreTwistSign ?? (spec.legs.length >= 6 ? 1 : -1),
    wingUnfoldAngle: custom?.wingUnfoldAngle ?? (spec.canFly ? Math.PI * 0.42 : 0),
    turretLiftPx: custom?.turretLiftPx ?? Math.max(3, Math.min(8, spec.radius * 0.22)),
    heavyShoulderFold: custom?.heavyShoulderFold ?? (spec.mass >= 42),
    staggeredLockImpulse: custom?.staggeredLockImpulse ?? Math.max(0.7, Math.min(1.4, spec.mass / 44)),
  };
}

export function getTransformStageForProgress(u: number): { id: TransformStageId; label: string } {
  const x = clamp01(u);
  for (let i = 0; i < STAGE_WINDOWS.length; i++) {
    const w = STAGE_WINDOWS[i];
    if (x < w.end || i === STAGE_WINDOWS.length - 1) {
      return { id: w.id, label: w.label };
    }
  }
  return { id: 'reactor_stabilize', label: 'REACTOR EQUILIBRIUM LOCK' };
}

export function interpolateLegMountSpecs(
  srcLegs: LegMountSpec[],
  dstLegs: LegMountSpec[],
  t: number
): LegMountSpec[] {
  const k = easeInOutCubic(t);
  const targetCount = dstLegs.length;
  const result: LegMountSpec[] = [];

  for (let i = 0; i < targetCount; i++) {
    const dst = dstLegs[i];
    // Pair with matching side index from source if available, else unfold from nearest source mount
    const sameSideSrc = srcLegs.filter((l) => l.side === dst.side);
    const sameSideDstIdx = dstLegs.slice(0, i + 1).filter((l) => l.side === dst.side).length - 1;
    const src =
      sameSideSrc[sameSideDstIdx] ??
      sameSideSrc[sameSideSrc.length - 1] ??
      srcLegs[i % Math.max(1, srcLegs.length)] ??
      dst;

    result.push({
      side: dst.side,
      attachX: src.attachX + (dst.attachX - src.attachX) * k,
      attachY: src.attachY + (dst.attachY - src.attachY) * k,
      restX: src.restX + (dst.restX - src.restX) * k,
      restY: src.restY + (dst.restY - src.restY) * k,
      femurLength: src.femurLength + (dst.femurLength - src.femurLength) * k,
      tibiaLength: src.tibiaLength + (dst.tibiaLength - src.tibiaLength) * k,
      gaitGroup: k > 0.5 ? dst.gaitGroup : src.gaitGroup,
      bendSign: k > 0.5 ? dst.bendSign : src.bendSign,
    });
  }

  return result;
}

export function computeTransformRigPose(
  uRaw: number,
  sourceSpec: MechClassSpec,
  targetSpec: MechClassSpec,
  profile: TransformChoreographyProfile,
  sourcePaint: { primary: string; secondary: string; accent: string },
  targetPaint: { primary: string; secondary: string; accent: string }
): TransformRigPose {
  const u = clamp01(uRaw);
  const st = getTransformStageForProgress(u);

  const seamGlow =
    u < 0.12
      ? easeInOutCubic(subProgress(u, 0.0, 0.12))
      : u < 0.90
      ? 0.85 + 0.15 * Math.sin(u * 40)
      : 1 - easeInOutCubic(subProgress(u, 0.90, 1.0));

  // Armor plates expand outward during retract_armor -> structural_reform, then slam tightly shut in staggered_lock
  let cowlSpread = 0;
  if (u < 0.28) {
    cowlSpread = easeInOutCubic(subProgress(u, 0.08, 0.28));
  } else if (u < 0.72) {
    cowlSpread = 1.0;
  } else if (u < 0.94) {
    cowlSpread = 1 - easeInOutQuart(subProgress(u, 0.72, 0.94));
  } else {
    cowlSpread = 0;
  }

  const pistonExtension =
    u < 0.32
      ? easeInOutCubic(subProgress(u, 0.10, 0.32))
      : u < 0.76
      ? 1.0
      : 1 - easeInOutCubic(subProgress(u, 0.76, 0.93));

  const coreRotProgress = easeInOutQuart(subProgress(u, 0.26, 0.56));
  // Full mechanical half/full gimbal flip that returns squarely to facing forward at u=0.56
  const coreRotationRad = Math.sin(coreRotProgress * Math.PI) * Math.PI * 0.5 * profile.coreTwistSign;

  const gearAngleRad = u * Math.PI * 4.5 * profile.coreTwistSign;

  // Chassis geometry morphs cleanly between core rotation and structural reform (never instant swap!)
  const morphBlend = easeInOutCubic(subProgress(u, 0.34, 0.82));

  // Weapon transition: old retracts inside dorsal bay (0.14 -> 0.44), new unfolds/telescopes (0.76 -> 0.92)
  const oldWeaponRetract = easeInOutCubic(subProgress(u, 0.14, 0.44));
  const newWeaponDeploy = u < 0.74 ? 0 : Math.min(1.06, easeOutBackWeighted(subProgress(u, 0.74, 0.92), 0.9));

  const wingDeploy = targetSpec.canFly
    ? easeInOutCubic(subProgress(u, 0.68, 0.90))
    : sourceSpec.canFly
    ? 1 - easeInOutCubic(subProgress(u, 0.12, 0.36))
    : 0;

  // Staggered locking sequence (left clamp -> right clamp -> dorsal lock)
  const clampLeftLock =
    u < 0.20 ? 1 - subProgress(u, 0.02, 0.20) : u < 0.88 ? 0 : easeInOutQuart(subProgress(u, 0.88, 0.93));
  const clampRightLock =
    u < 0.22 ? 1 - subProgress(u, 0.04, 0.22) : u < 0.90 ? 0 : easeInOutQuart(subProgress(u, 0.90, 0.95));
  const dorsalLock =
    u < 0.24 ? 1 - subProgress(u, 0.06, 0.24) : u < 0.92 ? 0 : easeInOutQuart(subProgress(u, 0.92, 0.97));

  const lockPulseA = u >= 0.91 && u <= 0.95 ? Math.sin(((u - 0.91) / 0.04) * Math.PI) : 0;
  const lockPulseB = u >= 0.94 && u <= 0.98 ? Math.sin(((u - 0.94) / 0.04) * Math.PI) : 0;
  const lockBounce = (lockPulseA * 0.7 + lockPulseB * 1.0) * profile.staggeredLockImpulse;

  const visorIgnition = u < 0.86 ? 0.15 : easeInOutCubic(subProgress(u, 0.86, 0.99));

  // Hydraulic suspension heave while legs reposition and armor shifts
  const liftCurve =
    u < 0.18
      ? easeInOutCubic(subProgress(u, 0.02, 0.18))
      : u < 0.88
      ? 1.0
      : 1 - easeInOutQuart(subProgress(u, 0.88, 0.97));
  const chassisLiftPx = liftCurve * profile.turretLiftPx;

  const legBlend = subProgress(u, 0.44, 0.72);
  const interpolatedRadius = sourceSpec.radius + (targetSpec.radius - sourceSpec.radius) * morphBlend;

  const colorBlend = easeInOutCubic(subProgress(u, 0.38, 0.85));

  return {
    u,
    stage: st.id,
    stageLabel: st.label,
    seamGlow,
    cowlSpread,
    pistonExtension,
    coreRotationRad,
    gearAngleRad,
    morphBlend,
    oldWeaponRetract,
    newWeaponDeploy,
    wingDeploy,
    clampLeftLock,
    clampRightLock,
    dorsalLock,
    lockBounce,
    visorIgnition,
    chassisLiftPx,
    interpolatedRadius,
    colorPrimary: lerpHexColor(sourcePaint.primary, targetPaint.primary, colorBlend),
    colorSecondary: lerpHexColor(sourcePaint.secondary, targetPaint.secondary, colorBlend),
    colorAccent: lerpHexColor(sourcePaint.accent, targetPaint.accent, colorBlend),
    sourceLegs: interpolateLegMountSpecs(sourceSpec.legs, sourceSpec.legs, 0),
    targetLegs: interpolateLegMountSpecs(sourceSpec.legs, targetSpec.legs, legBlend),
  };
}

export function createTransformRuntime(params: {
  baseClassId: MechClassId;
  sourceSpec: MechClassSpec;
  targetSpec: MechClassSpec;
  sourcePaint: { primary: string; secondary: string; accent: string };
  targetPaint: { primary: string; secondary: string; accent: string };
}): TransformRuntimeState {
  const profile = buildTransformChoreographyProfile(params.targetSpec);
  const pose = computeTransformRigPose(
    0,
    params.sourceSpec,
    params.targetSpec,
    profile,
    params.sourcePaint,
    params.targetPaint
  );
  return {
    isProteusLineage: true,
    baseClassId: params.baseClassId,
    activeClassId: params.sourceSpec.id,
    active: true,
    sourceSpec: params.sourceSpec,
    targetSpec: params.targetSpec,
    profile,
    elapsed: 0,
    duration: profile.durationSec,
    lastProgress: 0,
    firedEvents: new Set<string>(),
    pose,
    sourcePaint: { ...params.sourcePaint },
    targetPaint: { ...params.targetPaint },
  };
}

export function stepTransformRuntime(
  state: TransformRuntimeState,
  dt: number
): { completed: boolean; events: TransformKeyframeEvent[]; progress: number } {
  if (!state.active) {
    return { completed: true, events: [], progress: 1 };
  }

  state.elapsed = Math.min(state.duration, state.elapsed + Math.max(0, dt));
  const u = clamp01(state.elapsed / Math.max(0.1, state.duration));
  state.lastProgress = u;

  const events: TransformKeyframeEvent[] = [];
  for (let i = 0; i < AUDIO_KEYFRAMES.length; i++) {
    const kf = AUDIO_KEYFRAMES[i];
    if (u >= kf.u && !state.firedEvents.has(kf.key)) {
      state.firedEvents.add(kf.key);
      events.push(kf.event);
    }
  }

  state.pose = computeTransformRigPose(
    u,
    state.sourceSpec,
    state.targetSpec,
    state.profile,
    state.sourcePaint,
    state.targetPaint
  );

  const completed = state.elapsed >= state.duration;
  if (completed) {
    state.active = false;
    state.activeClassId = state.targetSpec.id;
  }

  return { completed, events, progress: u };
}

/**
 * Dynamically builds the list of eligible allied units from MECH_LIST/registry.
 * Never includes hostile archetypes, bosses, or Revenants, and strictly enforces unlock state.
 */
export function getEligibleReplicationTargets(
  alliedRoster: readonly MechClassSpec[],
  unlockedUnits: readonly string[],
  currentClassId: MechClassId
): EligibleReplicationTarget[] {
  const unlockedSet = new Set(unlockedUnits);
  return alliedRoster
    .filter((m) => m.id !== 'proteus') // Only allied specialist units are replication targets
    .map((m) => {
      const profile = isProteusMorphTargetId(m.id) ? getProteusMorphProfile(m.id) : null;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        role: m.role,
        silhouette: m.silhouette,
        primaryColor: m.defaultColor,
        accentColor: profile?.accentColor ?? m.accentColor,
        unlocked: unlockedSet.has(m.id),
        isCurrent: m.id === currentClassId,
        canFly: Boolean(m.canFly),
        legsCount: m.legs.length,
        massClass: classifyTransformMass(m),
        morphCode: profile?.morphCode ?? m.code,
        morphName: profile?.morphName ?? m.name,
        category: profile?.category ?? 'ALLIED',
        enhancedSummary: profile?.enhancedSummary ?? m.description,
        uniqueAbilityName: profile?.specialAbility.name ?? m.specialAbility.name,
        uniqueAbilityDesc: profile?.specialAbility.description ?? m.specialAbility.description,
        weaponSummary: profile?.weaponSummary ?? `${m.primaryWeapon.name} · ${m.secondaryWeapon.name}`,
      };
    });
}

export function canInitiateTransformation(params: {
  isProteusLineage: boolean;
  alive: boolean;
  downed?: boolean;
  transforming: boolean;
  inTakedown: boolean;
  transformCooldownRemaining: number;
  currentClassId: MechClassId;
  targetClassId: MechClassId;
  alliedRoster: readonly MechClassSpec[];
  unlockedUnits: readonly string[];
}): { allowed: boolean; reason?: string; targetSpec?: MechClassSpec } {
  if (!params.isProteusLineage) return { allowed: false, reason: 'NOT_PROTEUS' };
  if (!params.alive || params.downed) return { allowed: false, reason: 'UNIT_INCAPACITATED' };
  if (params.transforming || params.inTakedown) return { allowed: false, reason: 'ACTION_LOCKED' };
  if (params.transformCooldownRemaining > 0.01) return { allowed: false, reason: 'COOLDOWN_ACTIVE' };
  if (params.targetClassId === 'proteus') return { allowed: false, reason: 'BASE_CHASSIS' };
  if (params.targetClassId === params.currentClassId) return { allowed: false, reason: 'ALREADY_IN_FORM' };

  const spec = params.alliedRoster.find((m) => m.id === params.targetClassId);
  if (!spec) return { allowed: false, reason: 'NON_ALLIED_OR_UNKNOWN' };
  if (!params.unlockedUnits.includes(params.targetClassId)) {
    return { allowed: false, reason: 'UNIT_LOCKED' };
  }
  return { allowed: true, targetSpec: spec };
}

/**
 * Context-aware AI target selection for AI-controlled TX-10 Proteus squadmates.
 */
export function pickAITransformTarget(params: {
  eligibleTargets: EligibleReplicationTarget[];
  currentClassId: MechClassId;
  alliesNeedRepairCount: number;
  downedAlliesCount: number;
  cloakedEnemyCount: number;
  airborneEnemyCount: number;
  heavyOrBossThreat: boolean;
  enemyCount: number;
}): MechClassId | null {
  const candidates = params.eligibleTargets.filter((t) => t.unlocked && !t.isCurrent);
  if (candidates.length === 0) return null;

  const hasId = (id: MechClassId) => candidates.some((c) => c.id === id);

  // Priority 1: Downed or badly damaged squadmates -> transform into Engineer
  if ((params.downedAlliesCount > 0 || params.alliesNeedRepairCount >= 2) && hasId('engineer')) {
    return 'engineer';
  }
  // Priority 2: Airborne pressure -> transform into Valkyrie
  if (params.airborneEnemyCount >= 2 && hasId('valkyrie')) {
    return 'valkyrie';
  }
  // Priority 3: Cloaked enemies or long-range recon need -> EWAR or Recon
  if (params.cloakedEnemyCount > 0 && (hasId('ewar') || hasId('recon'))) {
    return hasId('ewar') ? 'ewar' : 'recon';
  }
  // Priority 4: Boss or heavy armored waves -> Colossus / Heavy / Artillery
  if (params.heavyOrBossThreat) {
    if (hasId('colossus')) return 'colossus';
    if (hasId('heavy')) return 'heavy';
    if (hasId('artillery')) return 'artillery';
  }
  // Priority 5: Large infantry/drone skirmish -> Standard / Phantom / Sniper
  if (params.enemyCount >= 3) {
    if (hasId('heavy')) return 'heavy';
    if (hasId('standard')) return 'standard';
    if (hasId('phantom')) return 'phantom';
  }

  return candidates[0].id;
}
