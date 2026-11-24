import { CameraShakeLevel, Vec2 } from './types';

export type CameraShakeCategory =
  | 'recoil'
  | 'explosion'
  | 'artillery'
  | 'ultimate'
  | 'boss'
  | 'impact'
  | 'footstep'
  | 'dash'
  | 'grapple'
  | 'flight';

export class Camera {
  public x = 0;
  public y = 0;
  public zoom = 1;
  public targetZoom = 1;
  public baseZoom = 1;
  public trauma = 0;
  public shakeX = 0;
  public shakeY = 0;
  public shakeLevel: CameraShakeLevel = 'medium';
  private lookAheadX = 0;
  private lookAheadY = 0;
  private shakeSeed = 0;
  private recentBlastAccum = 0;
  private recentCategoryCooldown: Partial<Record<CameraShakeCategory, number>> = {};

  public snapTo(x: number, y: number, zoom = 1): void {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    this.targetZoom = zoom;
    this.lookAheadX = 0;
    this.lookAheadY = 0;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.recentBlastAccum = 0;
    this.recentCategoryCooldown = {};
  }

  public setShakeLevel(level: CameraShakeLevel): void {
    this.shakeLevel = level;
    if (level === 'off') {
      this.trauma = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.recentBlastAccum = 0;
    }
  }

  /**
   * Centralized camera shake entry point.
   * Respects OFF/LOW/MEDIUM/HIGH settings and prevents runaway shake stacking when
   * multiple explosions or footsteps occur in the same frame window.
   */
  public addShake(amount: number, category: CameraShakeCategory = 'explosion'): void {
    if (this.shakeLevel === 'off' || amount <= 0) {
      return;
    }

    // Per-category anti-stacking window for rapid multi-shell hits
    const cd = this.recentCategoryCooldown[category] ?? 0;
    let scaled = amount;
    if (cd > 0 && (category === 'explosion' || category === 'footstep' || category === 'artillery')) {
      scaled *= 0.32;
    } else {
      this.recentCategoryCooldown[category] =
        category === 'explosion' ? 0.08 : category === 'footstep' ? 0.06 : 0.05;
    }

    // Soft saturation when multiple simultaneous events happen within 0.15s
    if (this.recentBlastAccum > 0.45) {
      scaled *= Math.max(0.2, 1 - (this.recentBlastAccum - 0.45) * 0.7);
    }
    this.recentBlastAccum = Math.min(1.35, this.recentBlastAccum + scaled);

    // Soft-knee trauma cap so high intensity stays punchy rather than unreadable
    const headroom = Math.max(0.15, 1 - this.trauma * 0.75);
    this.trauma = Math.min(1, this.trauma + scaled * headroom);
  }

  public update(
    dt: number,
    targetPos: Vec2,
    targetVel: Vec2,
    aimPosWorld: Vec2,
    shakeScale = 1,
    mapWidth = 2800,
    mapHeight = 2000,
    viewportW = 1440,
    viewportH = 900
  ): void {
    // Look-ahead in direction of motion + mouse aim
    const aimOffsetX = Math.max(-135, Math.min(135, (aimPosWorld.x - targetPos.x) * 0.14));
    const aimOffsetY = Math.max(-95, Math.min(95, (aimPosWorld.y - targetPos.y) * 0.14));
    const velOffsetX = Math.max(-120, Math.min(120, targetVel.x * 0.2));
    const velOffsetY = Math.max(-120, Math.min(120, targetVel.y * 0.2));

    const laAlpha = 1 - Math.exp(-5.8 * dt);
    this.lookAheadX += (aimOffsetX + velOffsetX - this.lookAheadX) * laAlpha;
    this.lookAheadY += (aimOffsetY + velOffsetY - this.lookAheadY) * laAlpha;

    const desiredX = targetPos.x + this.lookAheadX;
    const desiredY = targetPos.y + this.lookAheadY;

    const camAlpha = 1 - Math.exp(-9.0 * dt);
    this.x += (desiredX - this.x) * camAlpha;
    this.y += (desiredY - this.y) * camAlpha;

    // Smooth zoom (expanded minimum zoom-out to 0.34 for full 5-unit squad tactical oversight)
    const effectiveTargetZoom = Math.max(0.34, Math.min(1.5, this.targetZoom));
    this.zoom += (effectiveTargetZoom - this.zoom) * (1 - Math.exp(-6.5 * dt));

    // Clamp softly to map bounds (and center smoothly when viewport exceeds map dimensions)
    const halfViewW = (viewportW * 0.5) / this.zoom;
    const halfViewH = (viewportH * 0.5) / this.zoom;
    if (mapWidth > halfViewW * 2) {
      this.x = Math.max(halfViewW - 80, Math.min(mapWidth - halfViewW + 80, this.x));
    } else {
      const centerX = mapWidth * 0.5;
      this.x = Math.max(centerX - 180, Math.min(centerX + 180, this.x));
    }
    if (mapHeight > halfViewH * 2) {
      this.y = Math.max(halfViewH - 80, Math.min(mapHeight - halfViewH + 80, this.y));
    } else {
      const centerY = mapHeight * 0.5;
      this.y = Math.max(centerY - 140, Math.min(centerY + 140, this.y));
    }

    // Decay anti-stacking counters
    this.recentBlastAccum = Math.max(0, this.recentBlastAccum - dt * 2.8);
    for (const k of Object.keys(this.recentCategoryCooldown) as CameraShakeCategory[]) {
      const val = this.recentCategoryCooldown[k] ?? 0;
      if (val > 0) {
        this.recentCategoryCooldown[k] = Math.max(0, val - dt);
      }
    }

    const levelMult =
      this.shakeLevel === 'off'
        ? 0
        : this.shakeLevel === 'low'
        ? 0.35
        : this.shakeLevel === 'high'
        ? 1.45
        : 1.0;
    const finalScale = Math.max(0, shakeScale * levelMult);

    if (finalScale === 0) {
      this.trauma = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }

    // Decaying trauma * trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 2.1);
    this.shakeSeed += dt * 52;
    const shakeMag = this.trauma * this.trauma * 18 * finalScale;
    this.shakeX = Math.sin(this.shakeSeed * 1.7) * shakeMag;
    this.shakeY = Math.cos(this.shakeSeed * 2.3) * shakeMag;
  }

  public screenToWorld(screenX: number, screenY: number, viewW: number, viewH: number): Vec2 {
    return {
      x: (screenX - viewW * 0.5) / this.zoom + this.x,
      y: (screenY - viewH * 0.5) / this.zoom + this.y,
    };
  }
}
