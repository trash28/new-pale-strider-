import { BossTuningOverrides, BossVariantId } from './bossTypes';
import { BOSS_VARIANT_LIST } from './bossVariants';
import { MapDefinition, Obstacle, Vec2 } from './types';

export type BossSpawnDistance = 'near' | 'medium' | 'far';

export interface BossEncounterConfig {
  variant: 'none' | 'random' | BossVariantId;
  healthMult: number;
  damageMult: number;
  speedMult: number;
  aggression: number;
  attackFreq: number;
  spawnDistance: BossSpawnDistance;
}

export const DEFAULT_SKIRMISH_BOSS_CONFIG: BossEncounterConfig = {
  variant: 'none',
  healthMult: 1.0,
  damageMult: 1.0,
  speedMult: 1.0,
  aggression: 1.0,
  attackFreq: 1.0,
  spawnDistance: 'medium',
};

const DISTANCE_BANDS: Record<BossSpawnDistance, { min: number; max: number }> = {
  near: { min: 650, max: 920 },
  medium: { min: 980, max: 1380 },
  far: { min: 1380, max: 1850 },
};

export function pickVariantFromPool(
  choice: 'random' | BossVariantId,
  used?: Set<BossVariantId>
): BossVariantId {
  if (choice !== 'random') return choice;
  const all = BOSS_VARIANT_LIST.map((v) => v.id);
  const unused = used ? all.filter((id) => !used.has(id)) : all;
  const pool = unused.length > 0 ? unused : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickSurvivalBossForWave(wave: number): {
  variantId: BossVariantId;
  tuning: BossTuningOverrides;
} | null {
  if (wave <= 0 || wave % 5 !== 0) return null;

  let variantId: BossVariantId = 'siege';
  if (wave === 5) {
    variantId = Math.random() < 0.5 ? 'siege' : 'stormbringer';
  } else if (wave === 10) {
    variantId = Math.random() < 0.5 ? 'fortress' : 'blackout';
  } else if (wave === 15) {
    variantId = 'cataclysm';
  } else {
    const cycle: BossVariantId[] = ['stormbringer', 'blackout', 'fortress', 'siege', 'cataclysm'];
    variantId = cycle[(Math.floor(wave / 5) + 1) % cycle.length];
  }

  const tier = Math.max(0, Math.floor(wave / 5) - 1);
  return {
    variantId,
    tuning: {
      healthMult: 0.9 + tier * 0.22,
      damageMult: 0.9 + tier * 0.14,
      speedMult: Math.min(1.35, 1.0 + tier * 0.06),
      aggressionMult: Math.min(1.4, 1.0 + tier * 0.08),
      attackFreqMult: Math.min(1.4, 1.0 + tier * 0.08),
    },
  };
}

function overlapsSolidObstacle(
  x: number,
  y: number,
  radius: number,
  obstacles: Obstacle[],
  ignoreDestructibles: boolean
): boolean {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.destroyed) continue;
    if (ignoreDestructibles && o.destructible && Math.max(o.w, o.h) <= 72) continue;
    const cx = Math.max(o.x, Math.min(x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(y, o.y + o.h));
    if (Math.hypot(x - cx, y - cy) < radius + 16) {
      return true;
    }
  }
  return false;
}

export class BossSpawnManager {
  public static findValidSpawnPoint(
    map: MapDefinition,
    playerPos: Vec2,
    bossRadius: number,
    spawnDistance: BossSpawnDistance = 'medium'
  ): Vec2 {
    const margin = Math.max(150, bossRadius + 55);
    const band = DISTANCE_BANDS[spawnDistance];

    const candidates: Vec2[] = [];
    // Sample polar rings in preferred distance band
    for (let ring = 0; ring < 3; ring++) {
      const dist = band.min + ((band.max - band.min) * ring) / 2;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + ring * 0.2;
        const x = Math.max(margin, Math.min(map.width - margin, playerPos.x + Math.cos(ang) * dist));
        const y = Math.max(margin, Math.min(map.height - margin, playerPos.y + Math.sin(ang) * dist));
        candidates.push({ x, y });
      }
    }
    // Include map enemy spawns as secondary anchors
    for (const sp of map.enemySpawns) {
      candidates.push({
        x: Math.max(margin, Math.min(map.width - margin, sp.x)),
        y: Math.max(margin, Math.min(map.height - margin, sp.y)),
      });
    }

    // Pass 1: clean open space without touching any obstacle and respecting min safe distance
    const minSafe = Math.min(band.min * 0.85, 580);
    for (const c of candidates) {
      const d = Math.hypot(c.x - playerPos.x, c.y - playerPos.y);
      if (d < minSafe) continue;
      if (!overlapsSolidObstacle(c.x, c.y, bossRadius, map.obstacles, false)) {
        return c;
      }
    }

    // Pass 2: allow small destructible props (trees/crates) near spawn, clearing them after placement
    for (const c of candidates) {
      const d = Math.hypot(c.x - playerPos.x, c.y - playerPos.y);
      if (d < 520) continue;
      if (!overlapsSolidObstacle(c.x, c.y, bossRadius, map.obstacles, true)) {
        for (const o of map.obstacles) {
          if (o.destroyed || !o.destructible || Math.max(o.w, o.h) > 72) continue;
          const cx = Math.max(o.x, Math.min(c.x, o.x + o.w));
          const cy = Math.max(o.y, Math.min(c.y, o.y + o.h));
          if (Math.hypot(c.x - cx, c.y - cy) < bossRadius + 24) {
            o.destroyed = true;
            o.hp = 0;
          }
        }
        return c;
      }
    }

    // Fallback: farthest corner opposite player
    const fallbackX = playerPos.x < map.width * 0.5 ? map.width - margin - 60 : margin + 60;
    const fallbackY = playerPos.y < map.height * 0.5 ? map.height - margin - 60 : margin + 60;
    return { x: fallbackX, y: fallbackY };
  }
}

export interface BossDirectorRequest {
  variantId: BossVariantId;
  spawnPos: Vec2;
  tuning: BossTuningOverrides;
  alertText: string;
}

export class BossEncounterDirector {
  private freeRoamTimer = 26;
  private freeRoamAlertFired = false;
  private usedFreeRoamVariants = new Set<BossVariantId>();
  private survivalTriggeredWaves = new Set<number>();
  private skirmishSpawned = false;

  public reset(): void {
    this.freeRoamTimer = 24;
    this.freeRoamAlertFired = false;
    this.usedFreeRoamVariants.clear();
    this.survivalTriggeredWaves.clear();
    this.skirmishSpawned = false;
  }

  public notifyBossDefeated(): void {
    // Cooldown before next wandering Thunderhead patrol arrives in Free Roam
    this.freeRoamTimer = 46 + Math.random() * 14;
    this.freeRoamAlertFired = false;
  }

  public checkSkirmishSpawn(
    hasActiveBoss: boolean,
    cfg: BossEncounterConfig | undefined,
    map: MapDefinition,
    playerPos: Vec2
  ): BossDirectorRequest | null {
    if (hasActiveBoss || this.skirmishSpawned || !cfg || cfg.variant === 'none') {
      return null;
    }
    this.skirmishSpawned = true;
    const variantId = pickVariantFromPool(cfg.variant);
    const spawnPos = BossSpawnManager.findValidSpawnPoint(map, playerPos, 74, cfg.spawnDistance);
    return {
      variantId,
      spawnPos,
      tuning: {
        healthMult: cfg.healthMult,
        damageMult: cfg.damageMult,
        speedMult: cfg.speedMult,
        aggressionMult: cfg.aggression,
        attackFreqMult: cfg.attackFreq,
      },
      alertText: `SEISMIC ALERT: ${variantId.toUpperCase()} THUNDERHEAD DETECTED ON BATTLEFIELD.`,
    };
  }

  public checkSurvivalWave(
    wave: number,
    hasActiveBoss: boolean,
    map: MapDefinition,
    playerPos: Vec2
  ): BossDirectorRequest | null {
    if (hasActiveBoss || this.survivalTriggeredWaves.has(wave)) return null;
    const pick = pickSurvivalBossForWave(wave);
    if (!pick) return null;
    this.survivalTriggeredWaves.add(wave);
    const spawnPos = BossSpawnManager.findValidSpawnPoint(map, playerPos, 74, 'far');
    return {
      variantId: pick.variantId,
      spawnPos,
      tuning: pick.tuning,
      alertText: `WAVE ${wave} BOSS DEPLOYMENT: THUNDERHEAD-${pick.variantId.toUpperCase()} INBOUND!`,
    };
  }

  public updateFreeRoam(
    dt: number,
    hasActiveBoss: boolean,
    map: MapDefinition,
    playerPos: Vec2
  ): { preAlert: string | null; spawn: BossDirectorRequest | null } {
    if (hasActiveBoss) {
      return { preAlert: null, spawn: null };
    }
    this.freeRoamTimer -= dt;
    let preAlert: string | null = null;
    if (!this.freeRoamAlertFired && this.freeRoamTimer <= 8.0 && this.freeRoamTimer > 0) {
      this.freeRoamAlertFired = true;
      preAlert = 'SEISMIC SENSORS: Heavy multi-legged artillery signature approaching sector...';
    }
    if (this.freeRoamTimer <= 0) {
      const variantId = pickVariantFromPool('random', this.usedFreeRoamVariants);
      this.usedFreeRoamVariants.add(variantId);
      if (this.usedFreeRoamVariants.size >= BOSS_VARIANT_LIST.length) {
        this.usedFreeRoamVariants.clear();
      }
      const spawnPos = BossSpawnManager.findValidSpawnPoint(map, playerPos, 74, 'far');
      return {
        preAlert,
        spawn: {
          variantId,
          spawnPos,
          tuning: {
            healthMult: 0.92,
            damageMult: 0.92,
            speedMult: 1.05,
            aggressionMult: 1.05,
            attackFreqMult: 1.0,
          },
          alertText: `ROAMING BOSS CONTACT: THUNDERHEAD-${variantId.toUpperCase()} ENTERED SECTOR!`,
        },
      };
    }
    return { preAlert, spawn: null };
  }
}
