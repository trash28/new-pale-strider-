import { MortarAmmoSpec, MortarAmmoType, Vec2 } from './types';

export const MORTAR_MIN_RANGE = 220;
export const MORTAR_MAX_RANGE = 1750;

export const MORTAR_AMMO_ORDER: MortarAmmoType[] = ['he', 'ap', 'cluster', 'smoke', 'emp'];

export const MORTAR_AMMO_SPECS: Record<MortarAmmoType, MortarAmmoSpec> = {
  he: {
    id: 'he',
    code: 'HE',
    name: '240mm High Explosive',
    shortDesc: 'Wide blast wave & heavy concussion against infantry and armor.',
    damageMult: 1.0,
    splashRadius: 175,
    reloadMult: 1.0,
    flightSpeed: 540,
    piercing: false,
    bossArmorMult: 1.05,
    color: '#fb923c',
  },
  ap: {
    id: 'ap',
    code: 'AP',
    name: '240mm Armor Penetrator',
    shortDesc: 'Tight precision impact that pierces heavy glacis & Thunderhead sub-components.',
    damageMult: 1.48,
    splashRadius: 74,
    reloadMult: 1.12,
    flightSpeed: 660,
    piercing: true,
    bossArmorMult: 1.65,
    color: '#38bdf8',
  },
  cluster: {
    id: 'cluster',
    code: 'CLST',
    name: '240mm Airburst Cluster',
    shortDesc: 'Splits mid-descent into 6 sub-munitions saturating wide enemy formations.',
    damageMult: 0.72,
    splashRadius: 120,
    reloadMult: 1.18,
    flightSpeed: 510,
    piercing: false,
    bossArmorMult: 0.92,
    color: '#fbbf24',
  },
  smoke: {
    id: 'smoke',
    code: 'SMK',
    name: '240mm Tactical Smoke',
    shortDesc: 'Deploys a 13s dense thermal smoke screen blocking LOS & disrupting boss lock.',
    damageMult: 0.14,
    splashRadius: 235,
    reloadMult: 0.84,
    flightSpeed: 600,
    piercing: false,
    bossArmorMult: 0.3,
    color: '#cbd5e1',
  },
  emp: {
    id: 'emp',
    code: 'EMP',
    name: '240mm EMP Disruptor',
    shortDesc: 'Detonates an electromagnetic field jamming walkers & scrambling boss fire control.',
    damageMult: 0.48,
    splashRadius: 245,
    reloadMult: 1.08,
    flightSpeed: 585,
    piercing: false,
    bossArmorMult: 1.35,
    color: '#67e8f9',
  },
};

export interface SmokeCloud {
  id: string;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

export interface MortarTargetingSolution {
  targetX: number;
  targetY: number;
  rawDist: number;
  clampedDist: number;
  minRange: number;
  maxRange: number;
  inRange: boolean;
  scatterRadius: number;
  travelTime: number;
  ammoSpec: MortarAmmoSpec;
}

export class MortarAmmoManager {
  public activeAmmo: MortarAmmoType = 'he';

  public setAmmo(ammo: MortarAmmoType): void {
    this.activeAmmo = ammo;
  }

  public cycleAmmo(): MortarAmmoType {
    const idx = MORTAR_AMMO_ORDER.indexOf(this.activeAmmo);
    this.activeAmmo = MORTAR_AMMO_ORDER[(idx + 1) % MORTAR_AMMO_ORDER.length];
    return this.activeAmmo;
  }

  public getSpec(): MortarAmmoSpec {
    return MORTAR_AMMO_SPECS[this.activeAmmo];
  }
}

export class MortarTargetingSystem {
  public readonly minRange = MORTAR_MIN_RANGE;
  public readonly maxRange = MORTAR_MAX_RANGE;

  public computeSolution(
    origin: Vec2,
    cursorWorld: Vec2,
    ammoType: MortarAmmoType,
    opts?: {
      speedRatio?: number;
      stability?: number;
      braced?: boolean;
      mapWidth?: number;
      mapHeight?: number;
    }
  ): MortarTargetingSolution {
    const ammoSpec = MORTAR_AMMO_SPECS[ammoType];
    const dx = cursorWorld.x - origin.x;
    const dy = cursorWorld.y - origin.y;
    const rawDist = Math.hypot(dx, dy);
    const angle = rawDist > 0.001 ? Math.atan2(dy, dx) : 0;

    const inRange = rawDist >= this.minRange && rawDist <= this.maxRange;
    const clampedDist = Math.max(this.minRange, Math.min(this.maxRange, rawDist));

    let targetX = origin.x + Math.cos(angle) * clampedDist;
    let targetY = origin.y + Math.sin(angle) * clampedDist;

    if (opts?.mapWidth && opts?.mapHeight) {
      targetX = Math.max(48, Math.min(opts.mapWidth - 48, targetX));
      targetY = Math.max(48, Math.min(opts.mapHeight - 48, targetY));
    }

    const speedRatio = opts?.speedRatio ?? 0;
    const stability = opts?.stability ?? 1;
    const bracedFactor = opts?.braced ? 0.62 : 1.0;
    const baseScatter = ammoType === 'ap' ? 28 : ammoType === 'smoke' || ammoType === 'emp' ? 42 : 48;
    const scatterRadius = Math.round(
      (baseScatter + (clampedDist / this.maxRange) * 34 + speedRatio * 46 + (1 - stability) * 40) * bracedFactor
    );

    const travelTime = Math.max(0.65, Math.min(3.15, clampedDist / Math.max(160, ammoSpec.flightSpeed)));

    return {
      targetX,
      targetY,
      rawDist,
      clampedDist,
      minRange: this.minRange,
      maxRange: this.maxRange,
      inRange,
      scatterRadius,
      travelTime,
      ammoSpec,
    };
  }
}

export class OverwatchBarrageController {
  public active = false;
  public centerX = 0;
  public centerY = 0;
  public ammoType: MortarAmmoType = 'he';
  public shellsRemaining = 0;
  public totalShells = 5;
  private shotCooldown = 0;
  public gantryPhase = 0;

  public trigger(targetX: number, targetY: number, ammoType: MortarAmmoType): void {
    this.active = true;
    this.centerX = targetX;
    this.centerY = targetY;
    this.ammoType = ammoType === 'smoke' ? 'he' : ammoType;
    this.shellsRemaining = this.totalShells;
    this.shotCooldown = 0.22; // Initial hydraulic brace lock
    this.gantryPhase = 0;
  }

  public update(dt: number): { fireTarget: Vec2; ammoType: MortarAmmoType } | null {
    if (!this.active) return null;
    this.gantryPhase = (this.gantryPhase + dt * 3.8) % 1;
    this.shotCooldown -= dt;
    if (this.shotCooldown <= 0 && this.shellsRemaining > 0) {
      const idx = this.totalShells - this.shellsRemaining;
      this.shellsRemaining--;
      this.shotCooldown = 0.26;
      if (this.shellsRemaining <= 0) {
        this.active = false;
      }
      // Precision pentagram grid spread over target zone
      const ang = idx === 0 ? 0 : ((idx - 1) / Math.max(1, this.totalShells - 1)) * Math.PI * 2 + 0.35;
      const rad = idx === 0 ? 18 : 110 + (idx % 2) * 35;
      return {
        fireTarget: {
          x: this.centerX + Math.cos(ang) * rad,
          y: this.centerY + Math.sin(ang) * rad,
        },
        ammoType: this.ammoType,
      };
    }
    return null;
  }

  public reset(): void {
    this.active = false;
    this.shellsRemaining = 0;
    this.shotCooldown = 0;
    this.gantryPhase = 0;
  }
}

export function isPointInSmoke(x: number, y: number, clouds: SmokeCloud[]): boolean {
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    if (c.life <= 0) continue;
    if (Math.hypot(x - c.x, y - c.y) <= c.radius) return true;
  }
  return false;
}

export function doesSegmentCrossSmoke(x1: number, y1: number, x2: number, y2: number, clouds: SmokeCloud[]): boolean {
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    if (c.life <= 0) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      if (Math.hypot(c.x - x1, c.y - y1) <= c.radius) return true;
      continue;
    }
    const t = Math.max(0, Math.min(1, ((c.x - x1) * dx + (c.y - y1) * dy) / lenSq));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    if (Math.hypot(c.x - px, c.y - py) <= c.radius * 0.9) return true;
  }
  return false;
}
