import { getMissileProfile, MissileType } from './missileTypes';
import { Projectile } from './weapons';

export interface TrackedMissileThreat {
  projectile: Projectile;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  missileType: MissileType;
  threatWeight: number;
  altitude: number;
  targetId: string | null;
}

export class CombatThreatManager {
  public hostileToPlayer: TrackedMissileThreat[] = [];
  public hostileToEnemy: TrackedMissileThreat[] = [];
  public targetedByInterceptor: Set<Projectile> = new Set();

  public collect(projectiles: Projectile[]): void {
    this.hostileToPlayer.length = 0;
    this.hostileToEnemy.length = 0;
    this.targetedByInterceptor.clear();

    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p.active || p.kind !== 'missile') continue;
      if (p.isCounterInterceptor) {
        if (p.interceptTarget && p.interceptTarget.active) {
          this.targetedByInterceptor.add(p.interceptTarget);
        }
        continue;
      }
      if ((p.missileHp ?? 1) <= 0) continue;

      const profile = getMissileProfile(p.missileType);
      const speed = Math.hypot(p.vx, p.vy);
      const entry: TrackedMissileThreat = {
        projectile: p,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        speed,
        missileType: profile.id,
        threatWeight: profile.threatWeight,
        altitude: p.missileAlt ?? 0,
        targetId: p.targetId,
      };

      if (p.team === 'enemy') {
        this.hostileToPlayer.push(entry);
      } else {
        this.hostileToEnemy.push(entry);
      }
    }
  }

  public getThreatsForTeam(unitTeam: 'player' | 'enemy'): TrackedMissileThreat[] {
    return unitTeam === 'player' ? this.hostileToPlayer : this.hostileToEnemy;
  }
}

export function damageMissileProjectile(p: Projectile, damage: number): boolean {
  if (!p.active || p.kind !== 'missile') return false;
  const currentHp = p.missileHp ?? getMissileProfile(p.missileType).missileHp;
  const nextHp = currentHp - damage;
  p.missileHp = nextHp;
  if (nextHp <= 0) {
    p.active = false;
    return true;
  }
  return false;
}
