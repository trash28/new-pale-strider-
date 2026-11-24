import {
  getVoiceLineById,
  getVoiceLinesByCategory,
  RadioEventCategory,
  RadioPriority,
  RadioSignalProfile,
  RadioSpeakerRole,
  VoiceLineEntry,
} from './dialogueDatabase';

export interface ActiveRadioTransmission {
  id: number;
  lineId: string;
  speaker: string;
  speakerRole: RadioSpeakerRole;
  text: string;
  priority: RadioPriority;
  signalProfile: RadioSignalProfile;
  durationSec: number;
  elapsedSec: number;
}

export interface RadioTriggerOptions {
  speakerOverride?: string;
  preferredRole?: RadioSpeakerRole;
  lineIdOverride?: string;
  force?: boolean;
}

export interface RadioPlaybackAdapter {
  playVoiceLine(line: VoiceLineEntry, onEnded: () => void): void;
  stopVoiceLine(): void;
}

const CATEGORY_COOLDOWNS: Record<RadioEventCategory, number> = {
  deploy: 12,
  order_combat: 10,
  order_squad_follow: 4.5,
  order_squad_hold: 4.5,
  order_squad_attack: 4.5,
  order_squad_regroup: 4.5,
  order_squad_spread: 4.5,
  order_squad_retreat: 4.5,
  objective_change: 8,
  reinforcements: 12,
  combat_contact: 14,
  combat_kill: 11,
  combat_flank: 16,
  combat_suppression: 15,
  player_surrounded: 13,
  player_assisted: 12,
  player_threat_alert: 12,
  squad_assault_report: 15,
  squad_support_report: 14,
  squad_recon_report: 14,
  missile_warning: 8.5,
  armor_critical: 16,
  artillery_warning: 9,
  contacts_multiple: 16,
  mayday: 14,
  boss_detected: 18,
  boss_aggressive: 14,
  boss_special: 10,
  boss_damaged: 16,
  boss_destroyed: 12,
  ally_critical: 10,
  ally_near_death: 9,
  ally_final: 6,
  ally_destroyed: 5,
  squad_reaction: 13,
  victory: 10,
  defeat: 10,
  boot_online: 5,
  revenant_intro: 10,
  revenant_taunt: 15,
  revenant_damaged: 12,
  revenant_defeated: 8,
};

interface AllyRadioStatus {
  criticalSent: boolean;
  nearDeathSent: boolean;
  finalSent: boolean;
  destroyedSent: boolean;
}

interface QueuedTransmission {
  line: VoiceLineEntry;
  speaker: string;
  queuedAt: number;
}

/**
 * Event-driven military radio communication manager.
 * Handles 5-tier priority preemption, per-event & per-speaker cooldowns,
 * anti-repeat variation selection, ally health milestone tracking, and subtitle sync.
 */
export class RadioCommunicationManager {
  public active: ActiveRadioTransmission | null = null;
  public recentFeed: { speaker: string; text: string; id: number; priority: RadioPriority; signalProfile: RadioSignalProfile }[] = [];

  private simTime = 0;
  private txCounter = 1;
  private categoryLastPlayed = new Map<RadioEventCategory, number>();
  private speakerLastPlayed = new Map<RadioSpeakerRole, number>();
  private lastLineByCategory = new Map<RadioEventCategory, string>();
  private allyStatus = new Map<string, AllyRadioStatus>();
  private pendingQueue: QueuedTransmission[] = [];
  private silenceTimer = 0;
  private pendingAllyLostTimers: number[] = [];
  private adapter: RadioPlaybackAdapter | null = null;
  private rng: () => number;

  constructor(adapter?: RadioPlaybackAdapter | null, rng: () => number = Math.random) {
    this.adapter = adapter ?? null;
    this.rng = rng;
  }

  public setAdapter(adapter: RadioPlaybackAdapter | null): void {
    this.adapter = adapter;
  }

  public reset(): void {
    this.adapter?.stopVoiceLine();
    this.active = null;
    this.recentFeed = [];
    this.simTime = 0;
    this.categoryLastPlayed.clear();
    this.speakerLastPlayed.clear();
    this.lastLineByCategory.clear();
    this.allyStatus.clear();
    this.pendingQueue = [];
    this.silenceTimer = 0;
    this.pendingAllyLostTimers = [];
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.silenceTimer > 0) {
      this.silenceTimer = Math.max(0, this.silenceTimer - dt);
    }

    // Delayed ally-lost confirmation after brief respectful radio silence
    for (let i = this.pendingAllyLostTimers.length - 1; i >= 0; i--) {
      this.pendingAllyLostTimers[i] -= dt;
      if (this.pendingAllyLostTimers[i] <= 0) {
        this.pendingAllyLostTimers.splice(i, 1);
        this.trigger('ally_destroyed');
      }
    }

    if (this.active) {
      this.active.elapsedSec += dt;
      if (this.active.elapsedSec >= this.active.durationSec + 0.45) {
        this.active = null;
      }
    }

    // Expire stale queued transmissions (> 6s old)
    for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
      if (this.simTime - this.pendingQueue[i].queuedAt > 6) {
        this.pendingQueue.splice(i, 1);
      }
    }

    if (!this.active && this.silenceTimer <= 0 && this.pendingQueue.length > 0) {
      this.pendingQueue.sort((a, b) => b.line.priority - a.line.priority || a.queuedAt - b.queuedAt);
      const next = this.pendingQueue.shift()!;
      this.startTransmission(next.line, next.speaker);
    }
  }

  public trigger(category: RadioEventCategory, opts?: RadioTriggerOptions): ActiveRadioTransmission | null {
    const force = Boolean(opts?.force);

    // Per-event cooldown check (duplicate event prevention)
    const catCd = CATEGORY_COOLDOWNS[category] ?? 8;
    const lastCat = this.categoryLastPlayed.get(category);
    if (!force && lastCat !== undefined && this.simTime - lastCat < catCd) {
      return null;
    }

    let line: VoiceLineEntry | undefined;
    if (opts?.lineIdOverride) {
      line = getVoiceLineById(opts.lineIdOverride);
    } else {
      let candidates = getVoiceLinesByCategory(category);
      if (candidates.length === 0) return null;

      if (opts?.preferredRole) {
        const roleFiltered = candidates.filter((c) => c.speakerRole === opts.preferredRole);
        if (roleFiltered.length > 0) candidates = roleFiltered;
      }

      // Per-speaker cooldown filter for lower-priority chatter
      if (!force && candidates[0].priority <= 2) {
        const cooled = candidates.filter((c) => {
          const lastSp = this.speakerLastPlayed.get(c.speakerRole);
          return lastSp === undefined || this.simTime - lastSp >= 5.5;
        });
        if (cooled.length > 0) candidates = cooled;
      }

      // Anti-repeat filter so consecutive lines never repeat when alternatives exist
      const prevId = this.lastLineByCategory.get(category);
      if (candidates.length > 1 && prevId) {
        candidates = candidates.filter((c) => c.id !== prevId);
      }

      const idx = Math.floor(this.rng() * candidates.length) % candidates.length;
      line = candidates[idx];
    }

    if (!line) return null;

    const speaker = opts?.speakerOverride ?? line.defaultCallsign;

    // Priority arbitration against currently active transmission
    if (this.active) {
      if (line.priority > this.active.priority || (force && line.priority >= this.active.priority)) {
        // High-priority emergency/imminent-death interrupts lower-priority chatter cleanly
        this.adapter?.stopVoiceLine();
        this.active = null;
      } else if (line.priority >= 3 && this.pendingQueue.length < 2) {
        // Queue important orders/alerts briefly instead of dropping or overlapping voices
        this.categoryLastPlayed.set(category, this.simTime);
        this.pendingQueue.push({ line, speaker, queuedAt: this.simTime });
        return null;
      } else {
        // Drop lower-priority chatter while a higher/equal priority message is transmitting
        return null;
      }
    }

    if (this.silenceTimer > 0 && line.priority < 5 && !force) {
      this.categoryLastPlayed.set(category, this.simTime);
      this.pendingQueue.push({ line, speaker, queuedAt: this.simTime });
      return null;
    }

    this.categoryLastPlayed.set(category, this.simTime);
    this.speakerLastPlayed.set(line.speakerRole, this.simTime);
    this.lastLineByCategory.set(category, line.id);

    return this.startTransmission(line, speaker);
  }

  /**
   * Monitors allied units and triggers distinct critical damage, near-destruction,
   * final distress, and confirmed loss transmissions without ever misclassifying damage as death.
   */
  public evaluateAllyUnitHealth(
    allyId: string,
    callsign: string,
    hpRatio: number,
    alive: boolean,
    preferredRole: RadioSpeakerRole = 'pilot_bravo'
  ): void {
    let status = this.allyStatus.get(allyId);
    if (!status) {
      status = { criticalSent: false, nearDeathSent: false, finalSent: false, destroyedSent: false };
      this.allyStatus.set(allyId, status);
    }

    if (!alive) {
      if (!status.destroyedSent) {
        status.destroyedSent = true;
        // If unit died abruptly without a final transmission, send final distress first, then brief silence -> confirmed loss
        if (!status.finalSent) {
          status.finalSent = true;
          this.trigger('ally_final', { speakerOverride: callsign, preferredRole, force: true });
          this.silenceTimer = 0.8;
          this.pendingAllyLostTimers.push(4.9);
        } else {
          this.silenceTimer = 1.0;
          this.pendingAllyLostTimers.push(1.2);
        }
      }
      return;
    }

    // Alive: clearly separate critical damage (<= 42%) vs near destruction (<= 18%)
    if (hpRatio <= 0.18 && !status.nearDeathSent) {
      status.nearDeathSent = true;
      status.criticalSent = true;
      this.trigger('ally_near_death', { speakerOverride: callsign, preferredRole });
    } else if (hpRatio <= 0.42 && !status.criticalSent) {
      status.criticalSent = true;
      this.trigger('ally_critical', { speakerOverride: callsign, preferredRole });
    }
  }

  private startTransmission(line: VoiceLineEntry, speaker: string): ActiveRadioTransmission {
    const tx: ActiveRadioTransmission = {
      id: this.txCounter++,
      lineId: line.id,
      speaker,
      speakerRole: line.speakerRole,
      text: line.text,
      priority: line.priority,
      signalProfile: line.signalProfile,
      durationSec: line.durationSec,
      elapsedSec: 0,
    };

    this.active = tx;
    this.recentFeed = [
      {
        speaker: tx.speaker,
        text: tx.text,
        id: tx.id,
        priority: tx.priority,
        signalProfile: tx.signalProfile,
      },
      ...this.recentFeed,
    ].slice(0, 4);

    const txId = tx.id;
    this.adapter?.playVoiceLine(line, () => {
      if (this.active && this.active.id === txId) {
        this.active = null;
      }
    });

    return tx;
  }
}
