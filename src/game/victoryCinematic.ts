import { MechClassId, Vec2 } from './types';

export type SquadRoleTag = 'commander' | 'assault' | 'support' | 'recon';

export interface UnitMatchStats {
  unitId: string;
  callsign: string;
  unitName: string;
  classId: MechClassId;
  role: SquadRoleTag;
  isPlayer: boolean;
  alive: boolean;
  eliminations: number;
  assists: number;
  damageDealt: number;
  damageReceived: number;
  bossDamage: number;
  repairDone: number;
  threatSaves: number;
  objectivesCompleted: number;
  survivalTime: number;
  shotsFired: number;
  shotsHit: number;
}

export type AwardId =
  | 'mvp'
  | 'best_teammate'
  | 'top_eliminator'
  | 'most_damage'
  | 'top_support'
  | 'squad_savior'
  | 'boss_hunter'
  | 'last_one_standing';

export interface MatchAward {
  id: AwardId;
  title: string;
  subtitle: string;
  unitId: string;
  callsign: string;
  unitName: string;
  isPlayer: boolean;
  metricLabel: string;
}

export interface VictoryCinematicSnapshot {
  active: boolean;
  phase: 'settle' | 'showcase' | 'awards';
  elapsed: number;
  duration: number;
  cameraLabel: string;
  headline: string;
  subline: string;
  flawless: boolean;
  bossDefeated: boolean;
  heavyLosses: boolean;
  squadStats: UnitMatchStats[];
  awards: MatchAward[];
  mvp: MatchAward | null;
  bestTeammate: MatchAward | null;
  creditsEarned: number;
  missionTitle: string;
  elapsedMatchSeconds: number;
}

/**
 * Tracks real per-unit combat performance for the player and all 3 AI squadmates
 * throughout a match to calculate authentic, non-fabricated end-of-round awards.
 */
export class MatchPerformanceTracker {
  private stats = new Map<string, UnitMatchStats>();
  private recentDamagers = new Map<string, Map<string, number>>(); // enemyId -> (attackerId -> timestamp)

  public reset(): void {
    this.stats.clear();
    this.recentDamagers.clear();
  }

  public registerUnit(params: {
    unitId: string;
    callsign: string;
    unitName: string;
    classId: MechClassId;
    role: SquadRoleTag;
    isPlayer: boolean;
  }): void {
    this.stats.set(params.unitId, {
      ...params,
      alive: true,
      eliminations: 0,
      assists: 0,
      damageDealt: 0,
      damageReceived: 0,
      bossDamage: 0,
      repairDone: 0,
      threatSaves: 0,
      objectivesCompleted: 0,
      survivalTime: 0,
      shotsFired: 0,
      shotsHit: 0,
    });
  }

  public tickSurvival(dt: number, aliveUnitIds: Set<string>): void {
    for (const [id, st] of this.stats.entries()) {
      const isAlive = aliveUnitIds.has(id);
      st.alive = isAlive;
      if (isAlive) {
        st.survivalTime += dt;
      }
    }
  }

  public recordShot(unitId: string): void {
    const st = this.stats.get(unitId);
    if (st) st.shotsFired++;
  }

  public recordDamageDealt(
    attackerId: string,
    targetId: string,
    amount: number,
    isBoss: boolean,
    simTime: number
  ): void {
    const st = this.stats.get(attackerId);
    if (!st || amount <= 0) return;
    st.damageDealt += amount;
    st.shotsHit++;
    if (isBoss) st.bossDamage += amount;

    let dmgMap = this.recentDamagers.get(targetId);
    if (!dmgMap) {
      dmgMap = new Map();
      this.recentDamagers.set(targetId, dmgMap);
    }
    dmgMap.set(attackerId, simTime);
  }

  public recordDamageReceived(unitId: string, amount: number): void {
    const st = this.stats.get(unitId);
    if (st && amount > 0) st.damageReceived += amount;
  }

  public recordElimination(
    killerId: string,
    targetId: string,
    simTime: number,
    wasThreateningAlly: boolean
  ): void {
    const killer = this.stats.get(killerId);
    if (killer) {
      killer.eliminations++;
      if (wasThreateningAlly) killer.threatSaves++;
    }
    const dmgMap = this.recentDamagers.get(targetId);
    if (dmgMap) {
      for (const [attId, ts] of dmgMap.entries()) {
        if (attId !== killerId && simTime - ts <= 8.0) {
          const assister = this.stats.get(attId);
          if (assister) assister.assists++;
        }
      }
      this.recentDamagers.delete(targetId);
    }
  }

  public recordRepair(healerId: string, amount: number): void {
    const st = this.stats.get(healerId);
    if (st && amount > 0) st.repairDone += amount;
  }

  public recordObjective(unitId: string): void {
    const st = this.stats.get(unitId);
    if (st) st.objectivesCompleted++;
  }

  public getAllStats(): UnitMatchStats[] {
    return Array.from(this.stats.values()).map((s) => ({ ...s }));
  }

  public computeAwards(): { awards: MatchAward[]; mvp: MatchAward | null; bestTeammate: MatchAward | null } {
    const list = this.getAllStats();
    if (list.length === 0) return { awards: [], mvp: null, bestTeammate: null };

    const awards: MatchAward[] = [];

    // 1. MVP — composite combat & teamwork contribution (AI squadmates are fully eligible!)
    const scoreMvp = (u: UnitMatchStats) =>
      u.eliminations * 115 +
      u.assists * 45 +
      u.damageDealt * 0.22 +
      u.bossDamage * 0.25 +
      u.repairDone * 1.15 +
      u.threatSaves * 90 +
      u.objectivesCompleted * 160 +
      (u.alive ? 60 : 0);

    const mvpUnit = [...list].sort((a, b) => scoreMvp(b) - scoreMvp(a))[0];
    const mvp: MatchAward | null =
      mvpUnit && scoreMvp(mvpUnit) > 0
        ? {
            id: 'mvp',
            title: 'MVP',
            subtitle: 'Highest Overall Combat Impact',
            unitId: mvpUnit.unitId,
            callsign: mvpUnit.callsign,
            unitName: mvpUnit.unitName,
            isPlayer: mvpUnit.isPlayer,
            metricLabel: `${mvpUnit.eliminations} KILLS · ${Math.round(mvpUnit.damageDealt)} DMG`,
          }
        : null;
    if (mvp) awards.push(mvp);

    // 2. BEST TEAMMATE — teamwork, repairs, saves, assists, survival support
    const scoreTeam = (u: UnitMatchStats) =>
      u.repairDone * 2.4 +
      u.threatSaves * 135 +
      u.assists * 70 +
      u.objectivesCompleted * 100 +
      (u.alive ? u.survivalTime * 0.6 : 0);

    const teamCandidates = [...list].sort((a, b) => scoreTeam(b) - scoreTeam(a));
    const teamUnit = teamCandidates[0];
    const bestTeammate: MatchAward | null =
      teamUnit && scoreTeam(teamUnit) > 15
        ? {
            id: 'best_teammate',
            title: 'BEST TEAMMATE',
            subtitle: 'Outstanding Squad Protection & Support',
            unitId: teamUnit.unitId,
            callsign: teamUnit.callsign,
            unitName: teamUnit.unitName,
            isPlayer: teamUnit.isPlayer,
            metricLabel:
              teamUnit.repairDone >= 25
                ? `${Math.round(teamUnit.repairDone)} REPAIRED · ${teamUnit.assists} AST`
                : `${teamUnit.threatSaves} SAVES · ${teamUnit.assists} AST`,
          }
        : null;
    if (bestTeammate) awards.push(bestTeammate);

    // 3. TOP ELIMINATOR
    const topElim = [...list].sort((a, b) => b.eliminations - a.eliminations)[0];
    if (topElim && topElim.eliminations > 0) {
      awards.push({
        id: 'top_eliminator',
        title: 'TOP ELIMINATOR',
        subtitle: 'Most Hostile Mechs Destroyed',
        unitId: topElim.unitId,
        callsign: topElim.callsign,
        unitName: topElim.unitName,
        isPlayer: topElim.isPlayer,
        metricLabel: `${topElim.eliminations} ELIMINATIONS`,
      });
    }

    // 4. MOST DAMAGE
    const topDmg = [...list].sort((a, b) => b.damageDealt - a.damageDealt)[0];
    if (topDmg && topDmg.damageDealt >= 50) {
      awards.push({
        id: 'most_damage',
        title: 'MOST DAMAGE',
        subtitle: 'Highest Total Ordnance Output',
        unitId: topDmg.unitId,
        callsign: topDmg.callsign,
        unitName: topDmg.unitName,
        isPlayer: topDmg.isPlayer,
        metricLabel: `${Math.round(topDmg.damageDealt).toLocaleString()} DMG`,
      });
    }

    // 5. TOP SUPPORT (only if meaningful repair/support occurred)
    const topSup = [...list].sort((a, b) => b.repairDone - a.repairDone)[0];
    if (topSup && topSup.repairDone >= 30) {
      awards.push({
        id: 'top_support',
        title: 'TOP SUPPORT',
        subtitle: 'Field Repairs & Chassis Maintenance',
        unitId: topSup.unitId,
        callsign: topSup.callsign,
        unitName: topSup.unitName,
        isPlayer: topSup.isPlayer,
        metricLabel: `${Math.round(topSup.repairDone)} HP RESTORED`,
      });
    }

    // 6. SQUAD SAVIOR (only if threat saves occurred)
    const topSav = [...list].sort((a, b) => b.threatSaves - a.threatSaves)[0];
    if (topSav && topSav.threatSaves >= 1) {
      awards.push({
        id: 'squad_savior',
        title: 'SQUAD SAVIOR',
        subtitle: 'Neutralized Threats Targeting Allies',
        unitId: topSav.unitId,
        callsign: topSav.callsign,
        unitName: topSav.unitName,
        isPlayer: topSav.isPlayer,
        metricLabel: `${topSav.threatSaves} SAVES`,
      });
    }

    // 7. BOSS HUNTER (only if boss damage occurred)
    const topBoss = [...list].sort((a, b) => b.bossDamage - a.bossDamage)[0];
    if (topBoss && topBoss.bossDamage >= 150) {
      awards.push({
        id: 'boss_hunter',
        title: 'BOSS HUNTER',
        subtitle: 'Highest Damage Against Super-Heavy Boss',
        unitId: topBoss.unitId,
        callsign: topBoss.callsign,
        unitName: topBoss.unitName,
        isPlayer: topBoss.isPlayer,
        metricLabel: `${Math.round(topBoss.bossDamage).toLocaleString()} BOSS DMG`,
      });
    }

    // 8. LAST ONE STANDING (if heavy squad losses occurred and a unit survived)
    const survivors = list.filter((u) => u.alive);
    const casualties = list.filter((u) => !u.alive);
    if (casualties.length >= 2 && survivors.length >= 1) {
      const longest = [...survivors].sort((a, b) => b.survivalTime - a.survivalTime)[0];
      awards.push({
        id: 'last_one_standing',
        title: 'LAST ONE STANDING',
        subtitle: 'Held the Line Under Heavy Casualties',
        unitId: longest.unitId,
        callsign: longest.callsign,
        unitName: longest.unitName,
        isPlayer: longest.isPlayer,
        metricLabel: `${Math.round(longest.survivalTime)}s SURVIVED`,
      });
    }

    return { awards, mvp, bestTeammate };
  }
}

export interface VictoryCameraTarget {
  x: number;
  y: number;
  zoom: number;
  timeScale: number;
}

/**
 * Orchestrates the post-victory military cutscene camera and transitions
 * into the Warzone-inspired After-Action Awards screen.
 * Guarantees single-trigger per completed round and instant skip support.
 */
export class VictoryCinematicManager {
  public active = false;
  public triggeredForRound = false;
  public phase: 'settle' | 'showcase' | 'awards' = 'settle';
  public elapsed = 0;
  public readonly showcaseDuration = 5.4;

  private squadCenter: Vec2 = { x: 0, y: 0 };
  private bossWreckPos: Vec2 | null = null;
  private snapshotBase: Omit<VictoryCinematicSnapshot, 'active' | 'phase' | 'elapsed' | 'cameraLabel'> | null = null;

  public reset(): void {
    this.active = false;
    this.triggeredForRound = false;
    this.phase = 'settle';
    this.elapsed = 0;
    this.bossWreckPos = null;
    this.snapshotBase = null;
  }

  public trigger(params: {
    squadCenter: Vec2;
    bossWreckPos: Vec2 | null;
    tracker: MatchPerformanceTracker;
    creditsEarned: number;
    missionTitle: string;
    elapsedMatchSeconds: number;
  }): boolean {
    if (this.triggeredForRound) return false;
    this.triggeredForRound = true;
    this.active = true;
    this.phase = 'settle';
    this.elapsed = 0;
    this.squadCenter = { ...params.squadCenter };
    this.bossWreckPos = params.bossWreckPos ? { ...params.bossWreckPos } : null;

    const squadStats = params.tracker.getAllStats();
    const { awards, mvp, bestTeammate } = params.tracker.computeAwards();
    const aliveCount = squadStats.filter((u) => u.alive).length;
    const totalCount = Math.max(1, squadStats.length);
    const flawless = aliveCount === totalCount && totalCount >= 2;
    const heavyLosses = totalCount - aliveCount >= 2;
    const bossDefeated = Boolean(params.bossWreckPos);

    let headline = 'SECTOR SECURED';
    let subline = 'ALL HOSTILE FORCES NEUTRALIZED';
    if (bossDefeated) {
      headline = 'COLOSSUS ELIMINATED';
      subline = 'SUPER-HEAVY THREAT NEUTRALIZED · SQUAD VICTORIOUS';
    } else if (flawless) {
      headline = 'FLAWLESS OPERATION';
      subline = 'ZERO SQUAD CASUALTIES · TOTAL TACTICAL SUPERIORITY';
    } else if (heavyLosses) {
      headline = 'PYRRHIC VICTORY';
      subline = 'OBJECTIVE SECURED AGAINST OVERWHELMING ODDS';
    }

    this.snapshotBase = {
      duration: this.showcaseDuration,
      headline,
      subline,
      flawless,
      bossDefeated,
      heavyLosses,
      squadStats,
      awards,
      mvp,
      bestTeammate,
      creditsEarned: params.creditsEarned,
      missionTitle: params.missionTitle,
      elapsedMatchSeconds: params.elapsedMatchSeconds,
    };
    return true;
  }

  public skipToAwards(): void {
    if (!this.active) return;
    this.elapsed = this.showcaseDuration;
    this.phase = 'awards';
  }

  public update(dt: number): VictoryCameraTarget | null {
    if (!this.active) return null;
    this.elapsed += dt;

    if (this.elapsed < 1.35) {
      this.phase = 'settle';
    } else if (this.elapsed < this.showcaseDuration) {
      this.phase = 'showcase';
    } else {
      this.phase = 'awards';
    }

    const t = Math.min(1, this.elapsed / this.showcaseDuration);
    const orbitAngle = t * Math.PI * 0.72;
    let camX = this.squadCenter.x + Math.cos(orbitAngle) * (1 - t) * 75;
    let camY = this.squadCenter.y + Math.sin(orbitAngle) * (1 - t) * 55;
    let zoom = 1.24 - t * 0.24;

    if (this.bossWreckPos && t > 0.25 && t < 0.65) {
      const bBlend = Math.sin(((t - 0.25) / 0.4) * Math.PI) * 0.42;
      camX = camX * (1 - bBlend) + this.bossWreckPos.x * bBlend;
      camY = camY * (1 - bBlend) + this.bossWreckPos.y * bBlend;
      zoom = 0.96;
    }

    return {
      x: camX,
      y: camY,
      zoom,
      timeScale: this.phase === 'settle' ? 0.32 : this.phase === 'showcase' ? 0.55 : 0.15,
    };
  }

  public getSnapshot(): VictoryCinematicSnapshot | null {
    if (!this.active || !this.snapshotBase) return null;
    const cameraLabel =
      this.phase === 'settle'
        ? 'FINAL ELIMINATION · SLOW-MO'
        : this.elapsed < 3.4
        ? this.snapshotBase.bossDefeated
          ? 'TACTICAL CAM · DESTROYED BOSS WRECKAGE'
          : 'TACTICAL CAM · SQUAD CLOSE-UP'
        : 'TACTICAL CAM · SURVIVING FORMATION';

    return {
      ...this.snapshotBase,
      active: true,
      phase: this.phase,
      elapsed: this.elapsed,
      cameraLabel,
    };
  }
}
