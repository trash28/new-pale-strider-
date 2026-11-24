import { BossVariantId } from './bossTypes';
import { Vec2 } from './types';

export type CinematicMode = 'full' | 'short' | 'off';

export interface CameraCinematicOverride {
  active: boolean;
  focusPos: Vec2 | null;
  targetZoom: number | null;
  bannerText: string | null;
}

export class BossCinematicController {
  private mode: CinematicMode = 'full';
  private active = false;
  private elapsed = 0;
  private totalDuration = 0;
  private bannerTimer = 0;
  private bannerText: string | null = null;
  private startFocus: Vec2 = { x: 0, y: 0 };
  private midFocus: Vec2 = { x: 0, y: 0 };
  private endFocus: Vec2 = { x: 0, y: 0 };
  private zoomLevel = 0.88;
  private kind: 'boss_ultimate' | 'overwatch' = 'boss_ultimate';

  public setMode(mode: CinematicMode): void {
    this.mode = mode;
    if (mode === 'off') {
      this.active = false;
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  public startUltimateCinematic(
    _variantId: BossVariantId,
    ultimateName: string,
    bossCode: string,
    bossPos: Vec2,
    targetPos: Vec2,
    modeOverride?: CinematicMode
  ): void {
    const mode = modeOverride ?? this.mode;
    this.bannerText = `${bossCode} // ULTIMATE PROTOCOL: ${ultimateName.toUpperCase()}`;
    this.bannerTimer = mode === 'off' ? 2.4 : mode === 'short' ? 2.6 : 3.4;
    this.kind = 'boss_ultimate';

    if (mode === 'off') {
      this.active = false;
      return;
    }

    this.active = true;
    this.elapsed = 0;
    this.totalDuration = mode === 'short' ? 1.1 : 2.15;
    this.startFocus = { x: bossPos.x, y: bossPos.y };
    this.midFocus = {
      x: (bossPos.x + targetPos.x) * 0.5,
      y: (bossPos.y + targetPos.y) * 0.5,
    };
    this.endFocus = { x: targetPos.x, y: targetPos.y };
    this.zoomLevel = mode === 'short' ? 0.9 : 0.84;
  }

  public startOverwatchCinematic(
    origin: Vec2,
    targetPos: Vec2,
    modeOverride?: CinematicMode
  ): void {
    const mode = modeOverride ?? this.mode;
    this.bannerText = 'M-09 COLOSSUS // OVERWATCH BARRAGE SALVO';
    this.bannerTimer = 2.1;
    this.kind = 'overwatch';

    if (mode === 'off') {
      this.active = false;
      return;
    }

    this.active = true;
    this.elapsed = 0;
    this.totalDuration = mode === 'short' ? 0.75 : 1.35;
    this.startFocus = { x: origin.x, y: origin.y };
    this.midFocus = {
      x: origin.x * 0.55 + targetPos.x * 0.45,
      y: origin.y * 0.55 + targetPos.y * 0.45,
    };
    this.endFocus = { x: targetPos.x, y: targetPos.y };
    this.zoomLevel = 0.82;
  }

  public trackProjectile(pos: Vec2): void {
    if (!this.active) return;
    this.midFocus = { x: pos.x, y: pos.y };
  }

  public triggerImpactFocus(pos: Vec2): void {
    if (!this.active) return;
    this.endFocus = { x: pos.x, y: pos.y };
  }

  public update(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer <= 0) {
        this.bannerText = null;
      }
    }
    if (!this.active) return;
    this.elapsed += dt;
    if (this.elapsed >= this.totalDuration) {
      this.active = false;
      this.elapsed = 0;
    }
  }

  public getCameraOverride(playerPos: Vec2): CameraCinematicOverride {
    if (!this.active || this.totalDuration <= 0) {
      return {
        active: false,
        focusPos: null,
        targetZoom: null,
        bannerText: this.bannerText,
      };
    }

    const t = Math.max(0, Math.min(1, this.elapsed / this.totalDuration));
    let focusPos: Vec2;
    let targetZoom: number;

    if (this.kind === 'overwatch') {
      // Brief wide tactical view toward barrage corridor, smoothly handing back to player
      if (t < 0.45) {
        const k = t / 0.45;
        focusPos = {
          x: playerPos.x + (this.midFocus.x - playerPos.x) * k * 0.65,
          y: playerPos.y + (this.midFocus.y - playerPos.y) * k * 0.65,
        };
      } else {
        const k = (t - 0.45) / 0.55;
        const holdX = playerPos.x + (this.midFocus.x - playerPos.x) * 0.65;
        const holdY = playerPos.y + (this.midFocus.y - playerPos.y) * 0.65;
        focusPos = {
          x: holdX + (playerPos.x - holdX) * k,
          y: holdY + (playerPos.y - holdY) * k,
        };
      }
      targetZoom = this.zoomLevel + (1 - this.zoomLevel) * Math.pow(t, 2);
    } else {
      // Non-blocking Thunderhead Ultimate dramatic focus:
      // 0..0.38: pan toward boss hatch activation (blended 65% boss / 35% player so player never loses orientation)
      // 0.38..0.72: sweep across firing corridor toward endFocus
      // 0.72..1.0: smoothly glide back onto player
      const bX = playerPos.x * 0.35 + this.startFocus.x * 0.65;
      const bY = playerPos.y * 0.35 + this.startFocus.y * 0.65;
      const mX = playerPos.x * 0.4 + this.midFocus.x * 0.6;
      const mY = playerPos.y * 0.4 + this.midFocus.y * 0.6;

      if (t < 0.38) {
        const k = t / 0.38;
        focusPos = {
          x: playerPos.x + (bX - playerPos.x) * k,
          y: playerPos.y + (bY - playerPos.y) * k,
        };
        targetZoom = 1 - (1 - this.zoomLevel) * k;
      } else if (t < 0.72) {
        const k = (t - 0.38) / 0.34;
        focusPos = {
          x: bX + (mX - bX) * k,
          y: bY + (mY - bY) * k,
        };
        targetZoom = this.zoomLevel;
      } else {
        const k = (t - 0.72) / 0.28;
        focusPos = {
          x: mX + (playerPos.x - mX) * k,
          y: mY + (playerPos.y - mY) * k,
        };
        targetZoom = this.zoomLevel + (1 - this.zoomLevel) * k;
      }
    }

    return {
      active: true,
      focusPos,
      targetZoom,
      bannerText: this.bannerText,
    };
  }

  public reset(): void {
    this.active = false;
    this.elapsed = 0;
    this.totalDuration = 0;
    this.bannerTimer = 0;
    this.bannerText = null;
  }
}
