import { Vec2 } from './types';

export type TakedownAudioCue =
  | 'grab'
  | 'blade_slash'
  | 'joint_snap'
  | 'heavy_impact'
  | 'throw_whoosh'
  | 'core_pierce'
  | 'emp_arc';

export type TakedownCategory = 'standard' | 'heavy' | 'aerial' | 'boss_ambush';

export interface TakedownKeyframe {
  /** Normalized progress 0..1 */
  t: number;
  /** Attacker offset relative to target center along target's facing frame (+X = front, -X = behind, +Y = right) */
  attackerOffset: Vec2;
  /** Attacker facing relative to target's bodyAngle (0 = facing same way as target) */
  attackerAngleOffset: number;
  /** Forward blade/arm extension 0..1.4 */
  attackerLunge: number;
  /** Left mantis blade sweep angle (rad) */
  bladeLeftSwing: number;
  /** Right mantis blade sweep angle (rad) */
  bladeRightSwing: number;
  /** Attacker chassis lean/squash */
  attackerSquash: number;
  /** Defender body angle rotation offset (rad) */
  defenderAngleOffset: number;
  /** Defender torso tilt (pitch/roll simulation) -1..1 */
  defenderTilt: number;
  /** Defender leg compression / kneel / collapse 0..1 */
  defenderCollapse: number;
  /** Defender knock/stumble offset relative to initial anchor */
  defenderOffset: Vec2;
  /** Emit metal impact sparks on frame crossing */
  sparkBurst?: boolean;
  /** Synchronized audio cue */
  audioCue?: TakedownAudioCue;
}

export interface TakedownVariationSpec {
  id: string;
  name: string;
  category: TakedownCategory;
  compatible: {
    ground: boolean;
    heavy: boolean;
    aerial: boolean;
    boss: boolean;
  };
  duration: number;
  /** Normalized window [start, end] where the struggle/timing beat occurs */
  minigameBeatWindow: [number, number];
  stages: 1 | 2;
  camera: {
    zoomTarget: number;
    focusBiasTarget: number; // 0 = attacker, 1 = target
    lateralOffset: number;
    hitShake: number;
  };
  keyframes: TakedownKeyframe[];
}

export interface EvaluatedTakedownPose {
  attackerOffset: Vec2;
  attackerAngleOffset: number;
  attackerLunge: number;
  bladeLeftSwing: number;
  bladeRightSwing: number;
  attackerSquash: number;
  defenderAngleOffset: number;
  defenderTilt: number;
  defenderCollapse: number;
  defenderOffset: Vec2;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function evaluateTakedownPose(
  variation: TakedownVariationSpec,
  progress: number,
  targetRadius: number
): EvaluatedTakedownPose {
  const p = Math.max(0, Math.min(1, progress));
  const kfs = variation.keyframes;
  let a = kfs[0];
  let b = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (p >= kfs[i].t && p <= kfs[i + 1].t) {
      a = kfs[i];
      b = kfs[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, b.t - a.t);
  const localT = easeInOutCubic(Math.max(0, Math.min(1, (p - a.t) / span)));
  const radScale = Math.max(0.85, targetRadius / 20);

  return {
    attackerOffset: {
      x: lerp(a.attackerOffset.x, b.attackerOffset.x, localT) * radScale,
      y: lerp(a.attackerOffset.y, b.attackerOffset.y, localT) * radScale,
    },
    attackerAngleOffset: lerp(a.attackerAngleOffset, b.attackerAngleOffset, localT),
    attackerLunge: lerp(a.attackerLunge, b.attackerLunge, localT),
    bladeLeftSwing: lerp(a.bladeLeftSwing, b.bladeLeftSwing, localT),
    bladeRightSwing: lerp(a.bladeRightSwing, b.bladeRightSwing, localT),
    attackerSquash: lerp(a.attackerSquash, b.attackerSquash, localT),
    defenderAngleOffset: lerp(a.defenderAngleOffset, b.defenderAngleOffset, localT),
    defenderTilt: lerp(a.defenderTilt, b.defenderTilt, localT),
    defenderCollapse: lerp(a.defenderCollapse, b.defenderCollapse, localT),
    defenderOffset: {
      x: lerp(a.defenderOffset.x, b.defenderOffset.x, localT) * radScale,
      y: lerp(a.defenderOffset.y, b.defenderOffset.y, localT) * radScale,
    },
  };
}

/**
 * 22 genuinely distinct choreographed takedown variations covering rear strikes,
 * restraints, throws, aerial snatches, rapid joint dismantles, and colossal boss weak-point ambushes.
 */
export const TAKEDOWN_VARIATIONS: TakedownVariationSpec[] = [
  {
    id: 'rear_spine_sever',
    name: 'Rear Spine Sever',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.05,
    minigameBeatWindow: [0.34, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.24, focusBiasTarget: 0.6, lateralOffset: 14, hitShake: 0.24 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -38, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.2, bladeLeftSwing: -0.5, bladeRightSwing: 0.5, attackerSquash: 0.92, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.22, attackerOffset: { x: -24, y: -5 }, attackerAngleOffset: 0.12, attackerLunge: 0.75, bladeLeftSwing: 0.4, bladeRightSwing: -0.2, attackerSquash: 1.06, defenderAngleOffset: -0.18, defenderTilt: 0.25, defenderCollapse: 0.18, defenderOffset: { x: 4, y: -2 }, audioCue: 'grab', sparkBurst: true },
      { t: 0.55, attackerOffset: { x: -20, y: 2 }, attackerAngleOffset: -0.08, attackerLunge: 0.55, bladeLeftSwing: -1.1, bladeRightSwing: 1.1, attackerSquash: 0.95, defenderAngleOffset: 0.28, defenderTilt: -0.3, defenderCollapse: 0.4, defenderOffset: { x: 2, y: 3 }, audioCue: 'joint_snap' },
      { t: 0.82, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.32, bladeLeftSwing: 1.35, bladeRightSwing: -1.35, attackerSquash: 1.14, defenderAngleOffset: 0.45, defenderTilt: 0.75, defenderCollapse: 0.92, defenderOffset: { x: 14, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -34, y: -6 }, attackerAngleOffset: -0.15, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.55, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 18, y: 0 } },
    ],
  },
  {
    id: 'arm_lock_neck_snap',
    name: 'Arm-Lock Actuator Snap',
    category: 'standard',
    compatible: { ground: true, heavy: false, aerial: false, boss: false },
    duration: 2.1,
    minigameBeatWindow: [0.3, 0.7],
    stages: 1,
    camera: { zoomTarget: 1.26, focusBiasTarget: 0.55, lateralOffset: -18, hitShake: 0.22 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -36, y: 12 }, attackerAngleOffset: -0.3, attackerLunge: 0.2, bladeLeftSwing: -0.3, bladeRightSwing: 0.3, attackerSquash: 0.95, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.26, attackerOffset: { x: -18, y: 16 }, attackerAngleOffset: -0.55, attackerLunge: 0.85, bladeLeftSwing: 0.9, bladeRightSwing: 0.1, attackerSquash: 1.05, defenderAngleOffset: -0.65, defenderTilt: -0.4, defenderCollapse: 0.22, defenderOffset: { x: 0, y: 4 }, audioCue: 'grab', sparkBurst: true },
      { t: 0.6, attackerOffset: { x: -15, y: 8 }, attackerAngleOffset: -0.35, attackerLunge: 0.7, bladeLeftSwing: 1.2, bladeRightSwing: -0.7, attackerSquash: 0.92, defenderAngleOffset: -1.1, defenderTilt: -0.55, defenderCollapse: 0.55, defenderOffset: { x: -3, y: 6 }, audioCue: 'joint_snap', sparkBurst: true },
      { t: 0.86, attackerOffset: { x: -24, y: -4 }, attackerAngleOffset: 0.2, attackerLunge: 1.2, bladeLeftSwing: -0.6, bladeRightSwing: 1.3, attackerSquash: 1.1, defenderAngleOffset: -1.65, defenderTilt: 0.7, defenderCollapse: 1.0, defenderOffset: { x: 8, y: 10 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -34, y: -10 }, attackerAngleOffset: 0.05, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: -1.75, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 12, y: 12 } },
    ],
  },
  {
    id: 'leg_sweep_core_pierce',
    name: 'Leg Sweep & Core Pierce',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.15,
    minigameBeatWindow: [0.35, 0.74],
    stages: 1,
    camera: { zoomTarget: 1.22, focusBiasTarget: 0.6, lateralOffset: 10, hitShake: 0.26 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -40, y: -14 }, attackerAngleOffset: 0.35, attackerLunge: 0.3, bladeLeftSwing: -0.6, bladeRightSwing: 0.2, attackerSquash: 0.85, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.25, attackerOffset: { x: -12, y: 18 }, attackerAngleOffset: 1.25, attackerLunge: 1.05, bladeLeftSwing: 1.4, bladeRightSwing: -0.4, attackerSquash: 0.82, defenderAngleOffset: 0.7, defenderTilt: -0.65, defenderCollapse: 0.7, defenderOffset: { x: -6, y: -6 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.56, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0.1, attackerLunge: 0.4, bladeLeftSwing: -1.2, bladeRightSwing: -1.2, attackerSquash: 1.12, defenderAngleOffset: 0.85, defenderTilt: -0.8, defenderCollapse: 0.88, defenderOffset: { x: -4, y: -4 }, audioCue: 'heavy_impact' },
      { t: 0.84, attackerOffset: { x: -10, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.38, bladeLeftSwing: 1.4, bladeRightSwing: 1.4, attackerSquash: 1.15, defenderAngleOffset: 0.9, defenderTilt: 0.1, defenderCollapse: 1.0, defenderOffset: { x: 6, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -32, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.15, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.9, defenderTilt: 0.1, defenderCollapse: 1.0, defenderOffset: { x: 8, y: 0 } },
    ],
  },
  {
    id: 'double_blade_cross_cut',
    name: 'Twin-Blade X-Execution',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: true, boss: false },
    duration: 1.95,
    minigameBeatWindow: [0.32, 0.7],
    stages: 1,
    camera: { zoomTarget: 1.25, focusBiasTarget: 0.5, lateralOffset: 0, hitShake: 0.25 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -36, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.25, bladeLeftSwing: -1.25, bladeRightSwing: 1.25, attackerSquash: 0.9, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.24, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0.25, attackerLunge: 1.1, bladeLeftSwing: 1.15, bladeRightSwing: -1.15, attackerSquash: 1.1, defenderAngleOffset: 0.2, defenderTilt: 0.3, defenderCollapse: 0.3, defenderOffset: { x: 6, y: 0 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.56, attackerOffset: { x: -18, y: -8 }, attackerAngleOffset: -0.35, attackerLunge: 0.65, bladeLeftSwing: -1.35, bladeRightSwing: 1.35, attackerSquash: 0.94, defenderAngleOffset: -0.35, defenderTilt: -0.35, defenderCollapse: 0.55, defenderOffset: { x: 8, y: -4 }, audioCue: 'blade_slash' },
      { t: 0.82, attackerOffset: { x: 14, y: 4 }, attackerAngleOffset: Math.PI, attackerLunge: 1.35, bladeLeftSwing: 1.45, bladeRightSwing: -1.45, attackerSquash: 1.12, defenderAngleOffset: 0.45, defenderTilt: 0.7, defenderCollapse: 1.0, defenderOffset: { x: -8, y: 2 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: 32, y: 8 }, attackerAngleOffset: Math.PI, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.55, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: -10, y: 2 } },
    ],
  },
  {
    id: 'reactor_rip_overload',
    name: 'Reactor Core Rip & Kick',
    category: 'heavy',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.35,
    minigameBeatWindow: [0.3, 0.75],
    stages: 2,
    camera: { zoomTarget: 1.2, focusBiasTarget: 0.62, lateralOffset: 16, hitShake: 0.32 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -38, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.2, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 0.92, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.22, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.0, bladeLeftSwing: 0.8, bladeRightSwing: -0.8, attackerSquash: 1.06, defenderAngleOffset: 0.1, defenderTilt: 0.3, defenderCollapse: 0.25, defenderOffset: { x: 4, y: 0 }, audioCue: 'grab', sparkBurst: true },
      { t: 0.55, attackerOffset: { x: -28, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.4, bladeLeftSwing: -0.7, bladeRightSwing: 0.7, attackerSquash: 0.86, defenderAngleOffset: -0.2, defenderTilt: -0.45, defenderCollapse: 0.5, defenderOffset: { x: 0, y: 0 }, audioCue: 'joint_snap', sparkBurst: true },
      { t: 0.84, attackerOffset: { x: -42, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.35, bladeLeftSwing: 1.1, bladeRightSwing: -1.1, attackerSquash: 1.16, defenderAngleOffset: 0.35, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 26, y: 0 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -46, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.4, defenderTilt: 0.9, defenderCollapse: 1.0, defenderOffset: { x: 30, y: 0 } },
    ],
  },
  {
    id: 'shoulder_mount_flip_slam',
    name: 'Dorsal Vault & Back-Slam',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.2,
    minigameBeatWindow: [0.34, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.18, focusBiasTarget: 0.55, lateralOffset: -14, hitShake: 0.3 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -38, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.3, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 0.88, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.25, attackerOffset: { x: -4, y: 0 }, attackerAngleOffset: 0.15, attackerLunge: 0.9, bladeLeftSwing: 0.9, bladeRightSwing: -0.9, attackerSquash: 1.18, defenderAngleOffset: 0, defenderTilt: 0.2, defenderCollapse: 0.15, defenderOffset: { x: 0, y: 0 }, audioCue: 'grab' },
      { t: 0.55, attackerOffset: { x: 20, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 0.7, bladeLeftSwing: -1.0, bladeRightSwing: 1.0, attackerSquash: 1.12, defenderAngleOffset: 0.3, defenderTilt: -0.5, defenderCollapse: 0.45, defenderOffset: { x: -6, y: 0 }, audioCue: 'throw_whoosh' },
      { t: 0.84, attackerOffset: { x: 26, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 1.3, bladeLeftSwing: 1.25, bladeRightSwing: -1.25, attackerSquash: 0.84, defenderAngleOffset: 0.8, defenderTilt: -0.9, defenderCollapse: 1.0, defenderOffset: { x: -22, y: 4 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: 34, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 0.15, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.9, defenderTilt: -0.95, defenderCollapse: 1.0, defenderOffset: { x: -24, y: 4 } },
    ],
  },
  {
    id: 'rapid_joint_dismantle',
    name: 'Four-Point Rapid Dismantle',
    category: 'heavy',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.25,
    minigameBeatWindow: [0.3, 0.76],
    stages: 2,
    camera: { zoomTarget: 1.24, focusBiasTarget: 0.5, lateralOffset: 10, hitShake: 0.24 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -34, y: -16 }, attackerAngleOffset: 0.45, attackerLunge: 0.5, bladeLeftSwing: 1.0, bladeRightSwing: -0.4, attackerSquash: 1.0, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.26, attackerOffset: { x: 16, y: -22 }, attackerAngleOffset: 1.45, attackerLunge: 1.1, bladeLeftSwing: -1.2, bladeRightSwing: 1.2, attackerSquash: 1.05, defenderAngleOffset: -0.4, defenderTilt: -0.35, defenderCollapse: 0.35, defenderOffset: { x: 2, y: 4 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.54, attackerOffset: { x: 18, y: 22 }, attackerAngleOffset: -1.5, attackerLunge: 1.15, bladeLeftSwing: 1.3, bladeRightSwing: -1.1, attackerSquash: 1.05, defenderAngleOffset: 0.45, defenderTilt: 0.4, defenderCollapse: 0.65, defenderOffset: { x: -2, y: -4 }, audioCue: 'joint_snap', sparkBurst: true },
      { t: 0.82, attackerOffset: { x: -18, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.4, bladeLeftSwing: 1.4, bladeRightSwing: -1.4, attackerSquash: 1.15, defenderAngleOffset: 0.2, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: 12, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -34, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.25, defenderTilt: 0.8, defenderCollapse: 1.0, defenderOffset: { x: 14, y: 0 } },
    ],
  },
  {
    id: 'choke_and_drive_down',
    name: 'Hydraulic Collar Crush',
    category: 'standard',
    compatible: { ground: true, heavy: false, aerial: false, boss: false },
    duration: 2.1,
    minigameBeatWindow: [0.34, 0.74],
    stages: 1,
    camera: { zoomTarget: 1.28, focusBiasTarget: 0.6, lateralOffset: -12, hitShake: 0.28 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -34, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.3, bladeLeftSwing: -0.3, bladeRightSwing: 0.3, attackerSquash: 0.94, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.25, attackerOffset: { x: -18, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.85, bladeLeftSwing: 0.65, bladeRightSwing: -0.65, attackerSquash: 1.06, defenderAngleOffset: -0.25, defenderTilt: -0.4, defenderCollapse: 0.2, defenderOffset: { x: -3, y: 0 }, audioCue: 'grab', sparkBurst: true },
      { t: 0.6, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0.1, attackerLunge: 0.75, bladeLeftSwing: 0.8, bladeRightSwing: -0.8, attackerSquash: 1.14, defenderAngleOffset: 0.25, defenderTilt: -0.6, defenderCollapse: 0.55, defenderOffset: { x: -4, y: 0 }, audioCue: 'joint_snap' },
      { t: 0.85, attackerOffset: { x: -20, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.2, bladeLeftSwing: -0.9, bladeRightSwing: 0.9, attackerSquash: 0.82, defenderAngleOffset: 0.4, defenderTilt: 0.8, defenderCollapse: 1.0, defenderOffset: { x: 4, y: 0 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -34, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.45, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 6, y: 0 } },
    ],
  },
  {
    id: 'spinning_blade_decap',
    name: 'Cyclone Turret Sever',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: true, boss: false },
    duration: 2.0,
    minigameBeatWindow: [0.3, 0.7],
    stages: 1,
    camera: { zoomTarget: 1.22, focusBiasTarget: 0.55, lateralOffset: 15, hitShake: 0.26 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -38, y: -10 }, attackerAngleOffset: 0.25, attackerLunge: 0.3, bladeLeftSwing: -1.1, bladeRightSwing: 1.1, attackerSquash: 0.9, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.28, attackerOffset: { x: -8, y: -20 }, attackerAngleOffset: 1.2, attackerLunge: 1.15, bladeLeftSwing: 1.4, bladeRightSwing: 0.4, attackerSquash: 1.08, defenderAngleOffset: -0.6, defenderTilt: 0.25, defenderCollapse: 0.25, defenderOffset: { x: 3, y: 5 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.6, attackerOffset: { x: 18, y: 6 }, attackerAngleOffset: 2.6, attackerLunge: 1.25, bladeLeftSwing: -1.3, bladeRightSwing: -1.3, attackerSquash: 1.12, defenderAngleOffset: 1.2, defenderTilt: -0.4, defenderCollapse: 0.65, defenderOffset: { x: -2, y: -4 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.85, attackerOffset: { x: -18, y: 14 }, attackerAngleOffset: -0.45, attackerLunge: 1.35, bladeLeftSwing: 1.45, bladeRightSwing: -1.45, attackerSquash: 1.1, defenderAngleOffset: 2.4, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: 10, y: -6 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -32, y: 18 }, attackerAngleOffset: -0.2, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 2.5, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 12, y: -6 } },
    ],
  },
  {
    id: 'ankle_hook_collapse',
    name: 'Tendon Hook & Collapse',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.15,
    minigameBeatWindow: [0.34, 0.74],
    stages: 1,
    camera: { zoomTarget: 1.24, focusBiasTarget: 0.6, lateralOffset: -10, hitShake: 0.25 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -40, y: 8 }, attackerAngleOffset: -0.2, attackerLunge: 0.35, bladeLeftSwing: -0.5, bladeRightSwing: 0.8, attackerSquash: 0.84, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.26, attackerOffset: { x: -20, y: 12 }, attackerAngleOffset: -0.3, attackerLunge: 1.1, bladeLeftSwing: 1.1, bladeRightSwing: -0.9, attackerSquash: 0.8, defenderAngleOffset: 0.3, defenderTilt: -0.55, defenderCollapse: 0.6, defenderOffset: { x: -6, y: 2 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.58, attackerOffset: { x: -30, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.6, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.04, defenderAngleOffset: 0.4, defenderTilt: -0.8, defenderCollapse: 0.85, defenderOffset: { x: -12, y: 0 }, audioCue: 'heavy_impact' },
      { t: 0.85, attackerOffset: { x: -12, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.32, bladeLeftSwing: 1.35, bladeRightSwing: -1.35, attackerSquash: 1.14, defenderAngleOffset: 0.45, defenderTilt: -0.9, defenderCollapse: 1.0, defenderOffset: { x: -12, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -32, y: -4 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.45, defenderTilt: -0.95, defenderCollapse: 1.0, defenderOffset: { x: -12, y: 0 } },
    ],
  },
  {
    id: 'emp_blade_shortcircuit',
    name: 'Arc-Blade Short-Circuit',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: true, boss: false },
    duration: 2.05,
    minigameBeatWindow: [0.32, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.24, focusBiasTarget: 0.55, lateralOffset: 12, hitShake: 0.22 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -36, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.25, bladeLeftSwing: -0.9, bladeRightSwing: 0.9, attackerSquash: 0.94, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.24, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.18, bladeLeftSwing: 1.0, bladeRightSwing: -1.0, attackerSquash: 1.1, defenderAngleOffset: -0.15, defenderTilt: 0.25, defenderCollapse: 0.25, defenderOffset: { x: 4, y: 0 }, audioCue: 'emp_arc', sparkBurst: true },
      { t: 0.54, attackerOffset: { x: -18, y: 0 }, attackerAngleOffset: 0.05, attackerLunge: 1.05, bladeLeftSwing: 1.1, bladeRightSwing: -1.1, attackerSquash: 0.96, defenderAngleOffset: 0.35, defenderTilt: -0.35, defenderCollapse: 0.55, defenderOffset: { x: 3, y: 2 }, audioCue: 'emp_arc', sparkBurst: true },
      { t: 0.84, attackerOffset: { x: -24, y: -4 }, attackerAngleOffset: -0.1, attackerLunge: 1.35, bladeLeftSwing: -1.25, bladeRightSwing: 1.25, attackerSquash: 1.12, defenderAngleOffset: 0.1, defenderTilt: 0.65, defenderCollapse: 1.0, defenderOffset: { x: 8, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -38, y: -8 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.1, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: 10, y: 0 } },
    ],
  },
  {
    id: 'wall_pin_restraint',
    name: 'Momentum Ram & Restraint',
    category: 'standard',
    compatible: { ground: true, heavy: false, aerial: false, boss: false },
    duration: 2.1,
    minigameBeatWindow: [0.35, 0.74],
    stages: 1,
    camera: { zoomTarget: 1.22, focusBiasTarget: 0.62, lateralOffset: -15, hitShake: 0.28 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -42, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.4, bladeLeftSwing: -0.3, bladeRightSwing: 0.3, attackerSquash: 0.88, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.22, attackerOffset: { x: -12, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.95, bladeLeftSwing: 0.5, bladeRightSwing: -0.5, attackerSquash: 1.12, defenderAngleOffset: 0.1, defenderTilt: 0.55, defenderCollapse: 0.2, defenderOffset: { x: 14, y: 0 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 0.56, attackerOffset: { x: -6, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.75, bladeLeftSwing: 0.8, bladeRightSwing: -0.8, attackerSquash: 0.96, defenderAngleOffset: -0.2, defenderTilt: 0.6, defenderCollapse: 0.5, defenderOffset: { x: 18, y: 0 }, audioCue: 'grab' },
      { t: 0.84, attackerOffset: { x: -2, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.38, bladeLeftSwing: 1.35, bladeRightSwing: -1.35, attackerSquash: 1.15, defenderAngleOffset: 0, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 22, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -28, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0, defenderTilt: 0.9, defenderCollapse: 1.0, defenderOffset: { x: 24, y: 0 } },
    ],
  },
  {
    id: 'aerial_drop_execution',
    name: 'Shadow Pounce Drop',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: true, boss: false },
    duration: 2.05,
    minigameBeatWindow: [0.33, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.18, focusBiasTarget: 0.58, lateralOffset: 12, hitShake: 0.3 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -40, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.2, bladeLeftSwing: -0.8, bladeRightSwing: 0.8, attackerSquash: 0.82, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.26, attackerOffset: { x: -8, y: -4 }, attackerAngleOffset: 0.1, attackerLunge: 0.9, bladeLeftSwing: -1.3, bladeRightSwing: 1.3, attackerSquash: 1.24, defenderAngleOffset: 0.15, defenderTilt: 0.2, defenderCollapse: 0.25, defenderOffset: { x: 3, y: 0 }, audioCue: 'throw_whoosh' },
      { t: 0.58, attackerOffset: { x: -6, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.1, bladeLeftSwing: 1.1, bladeRightSwing: -1.1, attackerSquash: 0.84, defenderAngleOffset: -0.15, defenderTilt: 0.45, defenderCollapse: 0.65, defenderOffset: { x: 5, y: 0 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 0.84, attackerOffset: { x: -4, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.42, bladeLeftSwing: 1.45, bladeRightSwing: -1.45, attackerSquash: 0.9, defenderAngleOffset: 0.25, defenderTilt: 0.8, defenderCollapse: 1.0, defenderOffset: { x: 8, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -32, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.3, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 10, y: 0 } },
    ],
  },
  {
    id: 'turret_wrench_disarm',
    name: 'Barrel Wrench & Visor Cut',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.15,
    minigameBeatWindow: [0.32, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.26, focusBiasTarget: 0.52, lateralOffset: -16, hitShake: 0.24 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -32, y: -18 }, attackerAngleOffset: 0.55, attackerLunge: 0.3, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 0.94, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.26, attackerOffset: { x: 6, y: -18 }, attackerAngleOffset: 1.4, attackerLunge: 0.95, bladeLeftSwing: 0.9, bladeRightSwing: -0.2, attackerSquash: 1.06, defenderAngleOffset: -0.85, defenderTilt: -0.25, defenderCollapse: 0.15, defenderOffset: { x: 0, y: 3 }, audioCue: 'grab', sparkBurst: true },
      { t: 0.58, attackerOffset: { x: 16, y: -10 }, attackerAngleOffset: 2.2, attackerLunge: 0.85, bladeLeftSwing: 1.1, bladeRightSwing: -0.9, attackerSquash: 0.94, defenderAngleOffset: -1.45, defenderTilt: 0.35, defenderCollapse: 0.55, defenderOffset: { x: -4, y: 5 }, audioCue: 'joint_snap' },
      { t: 0.84, attackerOffset: { x: 14, y: 4 }, attackerAngleOffset: 2.85, attackerLunge: 1.35, bladeLeftSwing: -1.2, bladeRightSwing: 1.4, attackerSquash: 1.12, defenderAngleOffset: -1.8, defenderTilt: 0.7, defenderCollapse: 1.0, defenderOffset: { x: -10, y: 6 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: 28, y: 12 }, attackerAngleOffset: 2.95, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: -1.9, defenderTilt: 0.8, defenderCollapse: 1.0, defenderOffset: { x: -12, y: 6 } },
    ],
  },
  {
    id: 'reverse_throw_blitz',
    name: 'Reverse Throw & Blink Blitz',
    category: 'standard',
    compatible: { ground: true, heavy: false, aerial: false, boss: false },
    duration: 2.2,
    minigameBeatWindow: [0.3, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.16, focusBiasTarget: 0.55, lateralOffset: 14, hitShake: 0.28 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -36, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.3, bladeLeftSwing: -0.3, bladeRightSwing: 0.3, attackerSquash: 0.9, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.24, attackerOffset: { x: -14, y: 4 }, attackerAngleOffset: 0.2, attackerLunge: 0.85, bladeLeftSwing: 0.7, bladeRightSwing: -0.7, attackerSquash: 0.85, defenderAngleOffset: 0.3, defenderTilt: -0.35, defenderCollapse: 0.25, defenderOffset: { x: 0, y: 0 }, audioCue: 'grab' },
      { t: 0.55, attackerOffset: { x: -6, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 0.55, bladeLeftSwing: -0.8, bladeRightSwing: 0.8, attackerSquash: 1.14, defenderAngleOffset: Math.PI * 0.7, defenderTilt: -0.7, defenderCollapse: 0.6, defenderOffset: { x: -34, y: 6 }, audioCue: 'throw_whoosh' },
      { t: 0.84, attackerOffset: { x: -20, y: 4 }, attackerAngleOffset: Math.PI, attackerLunge: 1.38, bladeLeftSwing: 1.4, bladeRightSwing: -1.4, attackerSquash: 1.12, defenderAngleOffset: Math.PI * 0.9, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: -42, y: 8 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -12, y: -4 }, attackerAngleOffset: Math.PI, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: Math.PI, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: -46, y: 8 } },
    ],
  },
  {
    id: 'knee_buckle_visor_strike',
    name: 'Knee-Buckle Visor Thrust',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.0,
    minigameBeatWindow: [0.34, 0.74],
    stages: 1,
    camera: { zoomTarget: 1.28, focusBiasTarget: 0.58, lateralOffset: -12, hitShake: 0.24 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -36, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.25, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 0.92, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.24, attackerOffset: { x: -18, y: -4 }, attackerAngleOffset: 0.15, attackerLunge: 1.0, bladeLeftSwing: 0.85, bladeRightSwing: -0.4, attackerSquash: 0.86, defenderAngleOffset: 0.2, defenderTilt: -0.5, defenderCollapse: 0.55, defenderOffset: { x: 4, y: 0 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 0.54, attackerOffset: { x: 10, y: -16 }, attackerAngleOffset: 1.8, attackerLunge: 0.6, bladeLeftSwing: -1.1, bladeRightSwing: 1.1, attackerSquash: 1.04, defenderAngleOffset: 0.25, defenderTilt: -0.4, defenderCollapse: 0.75, defenderOffset: { x: 4, y: 0 }, audioCue: 'grab' },
      { t: 0.84, attackerOffset: { x: 24, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 1.4, bladeLeftSwing: 1.3, bladeRightSwing: 0.2, attackerSquash: 1.14, defenderAngleOffset: 0.3, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: 0, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: 36, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.35, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: -2, y: 0 } },
    ],
  },
  {
    id: 'hydraulic_crush_embrace',
    name: 'Mantis Pincer Compression',
    category: 'heavy',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.25,
    minigameBeatWindow: [0.3, 0.75],
    stages: 2,
    camera: { zoomTarget: 1.25, focusBiasTarget: 0.58, lateralOffset: 8, hitShake: 0.29 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -34, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.25, bladeLeftSwing: -1.2, bladeRightSwing: 1.2, attackerSquash: 0.96, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.28, attackerOffset: { x: -14, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.95, bladeLeftSwing: 0.95, bladeRightSwing: -0.95, attackerSquash: 1.08, defenderAngleOffset: 0, defenderTilt: 0.15, defenderCollapse: 0.3, defenderOffset: { x: 2, y: 0 }, audioCue: 'grab', sparkBurst: true },
      { t: 0.62, attackerOffset: { x: -13, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.05, bladeLeftSwing: 1.15, bladeRightSwing: -1.15, attackerSquash: 0.88, defenderAngleOffset: -0.1, defenderTilt: -0.25, defenderCollapse: 0.68, defenderOffset: { x: 2, y: 0 }, audioCue: 'joint_snap', sparkBurst: true },
      { t: 0.86, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.3, bladeLeftSwing: -1.3, bladeRightSwing: 1.3, attackerSquash: 1.14, defenderAngleOffset: 0.2, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: 10, y: 0 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -34, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0.25, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 12, y: 0 } },
    ],
  },
  {
    id: 'phantom_afterimage_cross',
    name: 'Shadow-Clone Scissor Cross',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: true, boss: false },
    duration: 2.0,
    minigameBeatWindow: [0.32, 0.7],
    stages: 1,
    camera: { zoomTarget: 1.2, focusBiasTarget: 0.52, lateralOffset: -14, hitShake: 0.25 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -36, y: -14 }, attackerAngleOffset: 0.35, attackerLunge: 0.35, bladeLeftSwing: -1.0, bladeRightSwing: 0.9, attackerSquash: 0.92, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.25, attackerOffset: { x: -18, y: -18 }, attackerAngleOffset: 0.6, attackerLunge: 1.1, bladeLeftSwing: 1.2, bladeRightSwing: -0.8, attackerSquash: 1.08, defenderAngleOffset: -0.45, defenderTilt: 0.2, defenderCollapse: 0.25, defenderOffset: { x: 2, y: 4 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.56, attackerOffset: { x: -18, y: 18 }, attackerAngleOffset: -0.6, attackerLunge: 1.1, bladeLeftSwing: -0.8, bladeRightSwing: 1.2, attackerSquash: 1.08, defenderAngleOffset: 0.5, defenderTilt: -0.3, defenderCollapse: 0.6, defenderOffset: { x: 2, y: -4 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.84, attackerOffset: { x: -16, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.4, bladeLeftSwing: 1.4, bladeRightSwing: -1.4, attackerSquash: 1.15, defenderAngleOffset: 0, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: 14, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -36, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: 16, y: 0 } },
    ],
  },
  {
    id: 'flank_spiral_takedown',
    name: 'Corkscrew Flank Spiral',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: true, boss: false },
    duration: 2.15,
    minigameBeatWindow: [0.33, 0.73],
    stages: 1,
    camera: { zoomTarget: 1.2, focusBiasTarget: 0.55, lateralOffset: 16, hitShake: 0.24 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -36, y: 12 }, attackerAngleOffset: -0.35, attackerLunge: 0.3, bladeLeftSwing: -0.7, bladeRightSwing: 0.7, attackerSquash: 0.92, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.26, attackerOffset: { x: 0, y: 24 }, attackerAngleOffset: -1.55, attackerLunge: 1.05, bladeLeftSwing: 1.25, bladeRightSwing: -0.6, attackerSquash: 1.06, defenderAngleOffset: 0.5, defenderTilt: 0.35, defenderCollapse: 0.3, defenderOffset: { x: -3, y: -4 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.56, attackerOffset: { x: 24, y: 0 }, attackerAngleOffset: -Math.PI, attackerLunge: 1.1, bladeLeftSwing: -1.1, bladeRightSwing: 1.25, attackerSquash: 1.06, defenderAngleOffset: 1.1, defenderTilt: -0.4, defenderCollapse: 0.65, defenderOffset: { x: -8, y: 0 }, audioCue: 'joint_snap', sparkBurst: true },
      { t: 0.84, attackerOffset: { x: 0, y: -22 }, attackerAngleOffset: 1.55, attackerLunge: 1.35, bladeLeftSwing: 1.4, bladeRightSwing: -1.4, attackerSquash: 1.12, defenderAngleOffset: 1.8, defenderTilt: 0.8, defenderCollapse: 1.0, defenderOffset: { x: -4, y: 8 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -28, y: -14 }, attackerAngleOffset: 0.4, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 1.9, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: -4, y: 10 } },
    ],
  },
  {
    id: 'low_sweep_rebound_slash',
    name: 'Low Slide & Rising Twin-Cut',
    category: 'standard',
    compatible: { ground: true, heavy: true, aerial: false, boss: false },
    duration: 2.05,
    minigameBeatWindow: [0.34, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.24, focusBiasTarget: 0.56, lateralOffset: -10, hitShake: 0.24 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -42, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.4, bladeLeftSwing: -0.6, bladeRightSwing: 0.6, attackerSquash: 0.78, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.25, attackerOffset: { x: 18, y: 8 }, attackerAngleOffset: 0.25, attackerLunge: 1.2, bladeLeftSwing: 1.3, bladeRightSwing: -1.2, attackerSquash: 0.74, defenderAngleOffset: -0.35, defenderTilt: -0.55, defenderCollapse: 0.55, defenderOffset: { x: -4, y: -3 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.58, attackerOffset: { x: 26, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 0.6, bladeLeftSwing: -1.1, bladeRightSwing: 1.1, attackerSquash: 1.08, defenderAngleOffset: -0.5, defenderTilt: -0.7, defenderCollapse: 0.8, defenderOffset: { x: -6, y: -4 }, audioCue: 'grab' },
      { t: 0.84, attackerOffset: { x: 14, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 1.4, bladeLeftSwing: 1.45, bladeRightSwing: -1.45, attackerSquash: 1.16, defenderAngleOffset: -0.7, defenderTilt: 0.75, defenderCollapse: 1.0, defenderOffset: { x: -16, y: -4 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: 32, y: 0 }, attackerAngleOffset: Math.PI, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: -0.75, defenderTilt: 0.85, defenderCollapse: 1.0, defenderOffset: { x: -18, y: -4 } },
    ],
  },
  {
    id: 'skyfall_interceptor_snatch',
    name: 'Skyfall Thruster Snatch',
    category: 'aerial',
    compatible: { ground: false, heavy: false, aerial: true, boss: false },
    duration: 2.15,
    minigameBeatWindow: [0.32, 0.72],
    stages: 1,
    camera: { zoomTarget: 1.15, focusBiasTarget: 0.55, lateralOffset: 14, hitShake: 0.3 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -34, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.3, bladeLeftSwing: -0.9, bladeRightSwing: 0.9, attackerSquash: 1.18, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.25, attackerOffset: { x: -12, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.1, bladeLeftSwing: 1.15, bladeRightSwing: -1.15, attackerSquash: 1.24, defenderAngleOffset: 0.35, defenderTilt: -0.4, defenderCollapse: 0.3, defenderOffset: { x: 4, y: 0 }, audioCue: 'grab', sparkBurst: true },
      { t: 0.58, attackerOffset: { x: -8, y: 4 }, attackerAngleOffset: 0.3, attackerLunge: 0.85, bladeLeftSwing: -1.2, bladeRightSwing: 1.2, attackerSquash: 0.95, defenderAngleOffset: 0.85, defenderTilt: 0.6, defenderCollapse: 0.7, defenderOffset: { x: 8, y: 6 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.85, attackerOffset: { x: -18, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.38, bladeLeftSwing: 1.4, bladeRightSwing: -1.4, attackerSquash: 0.82, defenderAngleOffset: 1.1, defenderTilt: 0.95, defenderCollapse: 1.0, defenderOffset: { x: 18, y: 8 }, audioCue: 'heavy_impact', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -34, y: -8 }, attackerAngleOffset: -0.15, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 1.15, defenderTilt: 1.0, defenderCollapse: 1.0, defenderOffset: { x: 20, y: 8 } },
    ],
  },
  {
    id: 'colossal_weakpoint_ambush',
    name: 'Colossal Core Weak-Point Strike',
    category: 'boss_ambush',
    compatible: { ground: false, heavy: false, aerial: false, boss: true },
    duration: 2.45,
    minigameBeatWindow: [0.28, 0.78],
    stages: 2,
    camera: { zoomTarget: 1.06, focusBiasTarget: 0.45, lateralOffset: 18, hitShake: 0.35 },
    keyframes: [
      { t: 0.0, attackerOffset: { x: -46, y: 0 }, attackerAngleOffset: 0, attackerLunge: 0.3, bladeLeftSwing: -0.8, bladeRightSwing: 0.8, attackerSquash: 0.92, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
      { t: 0.24, attackerOffset: { x: -24, y: -6 }, attackerAngleOffset: 0.12, attackerLunge: 1.15, bladeLeftSwing: 1.2, bladeRightSwing: -0.6, attackerSquash: 1.08, defenderAngleOffset: 0, defenderTilt: 0.08, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 }, audioCue: 'blade_slash', sparkBurst: true },
      { t: 0.56, attackerOffset: { x: -22, y: 6 }, attackerAngleOffset: -0.12, attackerLunge: 1.22, bladeLeftSwing: -0.8, bladeRightSwing: 1.25, attackerSquash: 1.08, defenderAngleOffset: 0, defenderTilt: -0.1, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 }, audioCue: 'emp_arc', sparkBurst: true },
      { t: 0.84, attackerOffset: { x: -20, y: 0 }, attackerAngleOffset: 0, attackerLunge: 1.45, bladeLeftSwing: 1.45, bladeRightSwing: -1.45, attackerSquash: 1.16, defenderAngleOffset: 0, defenderTilt: 0.14, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 }, audioCue: 'core_pierce', sparkBurst: true },
      { t: 1.0, attackerOffset: { x: -58, y: -10 }, attackerAngleOffset: -0.25, attackerLunge: 0.1, bladeLeftSwing: -0.4, bladeRightSwing: 0.4, attackerSquash: 1.0, defenderAngleOffset: 0, defenderTilt: 0, defenderCollapse: 0, defenderOffset: { x: 0, y: 0 } },
    ],
  },
];

export function selectCompatibleTakedown(params: {
  isBoss: boolean;
  isAerial: boolean;
  isHeavy: boolean;
  seedIndex?: number;
  lastUsedId?: string | null;
}): TakedownVariationSpec {
  const pool = TAKEDOWN_VARIATIONS.filter((v) => {
    if (params.isBoss) return v.compatible.boss;
    if (params.isAerial) return v.compatible.aerial;
    if (params.isHeavy) return v.compatible.heavy;
    return v.compatible.ground;
  });

  const candidates = pool.length > 0 ? pool : TAKEDOWN_VARIATIONS;
  const filtered =
    candidates.length > 1 && params.lastUsedId
      ? candidates.filter((v) => v.id !== params.lastUsedId)
      : candidates;

  const idx =
    params.seedIndex !== undefined
      ? Math.abs(params.seedIndex) % filtered.length
      : Math.floor(Math.random() * filtered.length);
  return filtered[idx];
}
