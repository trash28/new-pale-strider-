import { BossWarheadType } from './bossTypes';
import { getMissileProfile, MissileType } from './missileTypes';
import { WeaponKind, WeaponSpec } from './types';

export interface WeaponRuntime {
  spec: WeaponSpec;
  ammo: number;
  cooldown: number;
  reloading: boolean;
  reloadTimer: number;
  chargeTimer: number;
  isCharging: boolean;
  prepTimer: number;
  isPreparing: boolean;
  spreadBloom: number;
}

export function createWeaponRuntime(spec: WeaponSpec): WeaponRuntime {
  return {
    spec,
    ammo: spec.magazineSize,
    cooldown: 0,
    reloading: false,
    reloadTimer: 0,
    chargeTimer: 0,
    isCharging: false,
    prepTimer: 0,
    isPreparing: false,
    spreadBloom: 0,
  };
}

export interface Projectile {
  active: boolean;
  team: 'player' | 'enemy';
  ownerId: string;
  kind: WeaponKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  splashRadius: number;
  piercing: boolean;
  caliber: number;
  life: number;
  maxLife: number;
  // Artillery ballistic arc
  isBallistic: boolean;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  flightTime: number;
  flightDuration: number;
  arcHeight: number;
  // Homing missile physics & AA interception state
  homingTurnRate: number;
  targetId: string | null;
  hitIds: Set<string>;
  missileType?: MissileType;
  missileSpeed?: number;
  maxMissileSpeed?: number;
  missileAccel?: number;
  missileHp?: number;
  maxMissileHp?: number;
  trackingLost?: boolean;
  lastKnownX?: number;
  lastKnownY?: number;
  swarmSeed?: number;
  dopplerTriggered?: boolean;
  launchAltitude?: number;
  missileAlt?: number;
  // Defensive counter-interceptor missile state
  isCounterInterceptor?: boolean;
  interceptTarget?: Projectile | null;
  interceptReliability?: number;
  // Thunderhead Boss & M-09 Colossus mortar warheads
  warheadType?: BossWarheadType;
  isBossMortar?: boolean;
  mortarAmmo?: import('./types').MortarAmmoType;
  isPlayerMortar?: boolean;
  clusterSplitDone?: boolean;
  delayedSecondary?: boolean;
  spawnIncendiaryZone?: boolean;
}

export const MAX_PROJECTILES = 360;

export class ProjectilePool {
  public items: Projectile[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      this.items.push({
        active: false,
        team: 'player',
        ownerId: '',
        kind: 'autocannon',
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        damage: 0,
        splashRadius: 0,
        piercing: false,
        caliber: 3,
        life: 0,
        maxLife: 1,
        isBallistic: false,
        startX: 0,
        startY: 0,
        targetX: 0,
        targetY: 0,
        flightTime: 0,
        flightDuration: 1,
        arcHeight: 0,
        homingTurnRate: 0,
        targetId: null,
        hitIds: new Set<string>(),
      });
    }
  }

  public clear(): void {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].active = false;
    }
  }

  public spawn(params: {
    team: 'player' | 'enemy';
    ownerId: string;
    kind: WeaponKind;
    x: number;
    y: number;
    angle: number;
    speed: number;
    damage: number;
    splashRadius: number;
    range: number;
    piercing: boolean;
    caliber: number;
    homingTurnRate?: number;
    targetId?: string | null;
    targetX?: number;
    targetY?: number;
    warheadType?: BossWarheadType;
    isBossMortar?: boolean;
    mortarAmmo?: import('./types').MortarAmmoType;
    isPlayerMortar?: boolean;
    delayedSecondary?: boolean;
    missileType?: MissileType;
    launchAltitude?: number;
    swarmSeed?: number;
    lastKnownX?: number;
    lastKnownY?: number;
    isCounterInterceptor?: boolean;
    interceptTarget?: Projectile | null;
    interceptReliability?: number;
    spawnIncendiaryZone?: boolean;
  }): Projectile {
    // Ring buffer scan for free slot
    let slot = this.items[this.cursor];
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const idx = (this.cursor + i) % MAX_PROJECTILES;
      if (!this.items[idx].active) {
        slot = this.items[idx];
        this.cursor = (idx + 1) % MAX_PROJECTILES;
        break;
      }
    }
    slot.active = true;
    slot.team = params.team;
    slot.ownerId = params.ownerId;
    slot.kind = params.kind;
    slot.x = params.x;
    slot.y = params.y;
    slot.prevX = params.x;
    slot.prevY = params.y;
    slot.vx = Math.cos(params.angle) * params.speed;
    slot.vy = Math.sin(params.angle) * params.speed;
    slot.damage = params.damage;
    slot.splashRadius = params.splashRadius;
    slot.piercing = params.piercing;
    slot.caliber = params.caliber;
    slot.life = 0;
    slot.maxLife = params.range / Math.max(60, params.speed);
    slot.homingTurnRate = params.homingTurnRate ?? 0;
    slot.targetId = params.targetId ?? null;
    slot.hitIds.clear();
    slot.warheadType = params.warheadType;
    slot.isBossMortar = params.isBossMortar ?? false;
    slot.mortarAmmo = params.mortarAmmo;
    slot.isPlayerMortar = params.isPlayerMortar ?? false;
    slot.clusterSplitDone = false;
    slot.delayedSecondary = params.delayedSecondary ?? false;
    slot.spawnIncendiaryZone = params.spawnIncendiaryZone ?? false;

    if (params.kind === 'missile') {
      const profile = getMissileProfile(params.missileType);
      const isCounter = Boolean(params.isCounterInterceptor);
      const launchSpeed = isCounter ? Math.max(420, params.speed) : Math.min(params.speed, profile.launchSpeed);
      slot.vx = Math.cos(params.angle) * launchSpeed;
      slot.vy = Math.sin(params.angle) * launchSpeed;
      slot.missileType = profile.id;
      slot.missileSpeed = launchSpeed;
      slot.maxMissileSpeed = isCounter ? 1420 : Math.max(params.speed, profile.maxSpeed);
      slot.missileAccel = isCounter ? 2750 : profile.acceleration;
      slot.missileHp = isCounter ? 10 : profile.missileHp;
      slot.maxMissileHp = isCounter ? 10 : profile.missileHp;
      slot.trackingLost = false;
      slot.lastKnownX = params.lastKnownX ?? params.targetX ?? params.x + Math.cos(params.angle) * 420;
      slot.lastKnownY = params.lastKnownY ?? params.targetY ?? params.y + Math.sin(params.angle) * 420;
      slot.swarmSeed = params.swarmSeed ?? 0;
      slot.dopplerTriggered = false;
      slot.launchAltitude = params.launchAltitude ?? 0;
      slot.missileAlt = params.launchAltitude ?? 0;
      slot.isCounterInterceptor = isCounter;
      slot.interceptTarget = params.interceptTarget ?? null;
      slot.interceptReliability = params.interceptReliability ?? 0.8;
      slot.maxLife = isCounter
        ? 2.2
        : Math.max(profile.maxLifetime, params.range / Math.max(120, profile.maxSpeed * 0.72));
    } else {
      slot.missileType = undefined;
      slot.missileSpeed = undefined;
      slot.maxMissileSpeed = undefined;
      slot.missileAccel = undefined;
      slot.missileHp = undefined;
      slot.maxMissileHp = undefined;
      slot.trackingLost = false;
      slot.dopplerTriggered = false;
      slot.launchAltitude = 0;
      slot.missileAlt = 0;
      slot.isCounterInterceptor = false;
      slot.interceptTarget = null;
      slot.interceptReliability = undefined;
    }

    if (params.kind === 'artillery' && params.targetX !== undefined && params.targetY !== undefined) {
      slot.isBallistic = true;
      slot.startX = params.x;
      slot.startY = params.y;
      slot.targetX = params.targetX;
      slot.targetY = params.targetY;
      const dist = Math.hypot(params.targetX - params.x, params.targetY - params.y);
      slot.flightTime = 0;
      if (params.isBossMortar) {
        slot.flightDuration = Math.max(1.45, Math.min(2.85, dist / Math.max(260, params.speed)));
        slot.arcHeight = Math.min(340, 150 + dist * 0.22);
      } else {
        slot.flightDuration = Math.max(0.55, Math.min(2.6, dist / Math.max(120, params.speed)));
        slot.arcHeight = Math.min(220, 60 + dist * 0.17);
      }
      slot.maxLife = slot.flightDuration + 0.05;
    } else {
      slot.isBallistic = false;
      slot.flightTime = 0;
      slot.flightDuration = 1;
      slot.arcHeight = 0;
    }

    return slot;
  }
}
