import { TerrainType } from './types';
import { AudioAssetId } from './audioAssets';

export interface SpatialParams {
  pan: number; // -1 left .. +1 right
  distanceScale: number; // 0 .. 1
  occluded: boolean;
  delaySeconds: number; // speed-of-sound propagation delay for distant booms
}

/**
 * Computes stereo pan (-0.9..0.9), distance attenuation, and speed-of-sound
 * propagation delay from world delta relative to camera/player.
 */
export function computeSpatialAudioParams(
  dx: number,
  dy: number,
  maxHearDistance = 1350,
  occluded = false,
  enableTravelDelay = false
): SpatialParams {
  const dist = Math.hypot(dx, dy);
  const distanceScale = Math.max(0, Math.min(1, 1 - dist / maxHearDistance));
  const pan = Math.max(-0.88, Math.min(0.88, dx / 620));
  // Scaled speed-of-sound delay (~18ms per 100 units beyond 220 units, max 0.24s)
  const delaySeconds =
    enableTravelDelay && dist > 220 ? Math.min(0.24, (dist - 220) / 3800) : 0;

  return {
    pan,
    distanceScale,
    occluded,
    delaySeconds,
  };
}

/**
 * Selects real-world material-specific footstep asset ID for the current terrain.
 */
export function selectTerrainFootstepAsset(
  terrain: TerrainType,
  weight: number
): AudioAssetId {
  switch (terrain) {
    case 'mud':
      return 'footstep_mud';
    case 'water':
      return 'footstep_water';
    case 'sand':
      return 'footstep_dirt';
    case 'rocky':
      return weight >= 0.85 ? 'footstep_heavy_mech' : 'footstep_concrete';
    case 'slope_n':
    case 'slope_s':
    case 'slope_e':
    case 'slope_w':
      return weight >= 0.8 ? 'footstep_heavy_mech' : 'footstep_dirt';
    case 'concrete':
    default:
      return weight >= 0.85 ? 'footstep_heavy_mech' : 'footstep_concrete';
  }
}

export class VoiceLimiter {
  private lastPlayedAt = new Map<string, number>();
  private activePerChannel = new Map<string, number>();

  public canPlay(key: string, minIntervalMs: number, channel: string, maxPolyphony: number, nowMs: number): boolean {
    const prev = this.lastPlayedAt.get(key) ?? -999999;
    if (nowMs - prev < minIntervalMs) return false;
    const count = this.activePerChannel.get(channel) ?? 0;
    if (count >= maxPolyphony) return false;
    this.lastPlayedAt.set(key, nowMs);
    this.activePerChannel.set(channel, count + 1);
    return true;
  }

  public release(channel: string): void {
    const count = this.activePerChannel.get(channel) ?? 0;
    this.activePerChannel.set(channel, Math.max(0, count - 1));
  }

  public reset(): void {
    this.lastPlayedAt.clear();
    this.activePerChannel.clear();
  }
}
