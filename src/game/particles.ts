import { BossWarheadType } from './bossTypes';
import { TerrainType } from './types';

export type ParticleKind =
  | 'spark'
  | 'smoke'
  | 'fire'
  | 'muzzle'
  | 'debris'
  | 'shockwave'
  | 'mud'
  | 'water'
  | 'casing'
  | 'rail_trail'
  | 'repair';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  endSize: number;
  life: number;
  maxLife: number;
  color: string;
  alpha: number;
  rotation: number;
  rotSpeed: number;
}

export interface GroundDecal {
  active: boolean;
  kind: 'crater' | 'footprint' | 'scorch' | 'rubble';
  x: number;
  y: number;
  radius: number;
  angle: number;
  alpha: number;
  color: string;
}

export interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface LightFlash {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

const MAX_PARTICLES = 1600;
const MAX_DECALS = 360;
const MAX_TEXTS = 48;
const MAX_FLASHES = 28;

export class ParticleSystem {
  public particles: Particle[] = [];
  public decals: GroundDecal[] = [];
  public texts: FloatingText[] = [];
  public flashes: LightFlash[] = [];
  private pCursor = 0;
  private dCursor = 0;
  private tCursor = 0;
  private fCursor = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        kind: 'spark',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 3,
        endSize: 1,
        life: 0,
        maxLife: 0.5,
        color: '#f59e0b',
        alpha: 1,
        rotation: 0,
        rotSpeed: 0,
      });
    }
    for (let i = 0; i < MAX_DECALS; i++) {
      this.decals.push({
        active: false,
        kind: 'footprint',
        x: 0,
        y: 0,
        radius: 6,
        angle: 0,
        alpha: 0.35,
        color: '#111',
      });
    }
    for (let i = 0; i < MAX_TEXTS; i++) {
      this.texts.push({
        active: false,
        x: 0,
        y: 0,
        vy: -24,
        text: '',
        color: '#fff',
        life: 0,
        maxLife: 0.8,
      });
    }
    for (let i = 0; i < MAX_FLASHES; i++) {
      this.flashes.push({
        active: false,
        x: 0,
        y: 0,
        radius: 100,
        color: '#fb923c',
        alpha: 0.4,
        life: 0,
        maxLife: 0.16,
      });
    }
  }

  public clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles[i].active = false;
    for (let i = 0; i < MAX_DECALS; i++) this.decals[i].active = false;
    for (let i = 0; i < MAX_TEXTS; i++) this.texts[i].active = false;
    for (let i = 0; i < MAX_FLASHES; i++) this.flashes[i].active = false;
  }

  public emit(
    kind: ParticleKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    endSize: number,
    maxLife: number,
    color: string,
    alpha = 1,
    z = 2,
    vz = 0
  ): void {
    const p = this.particles[this.pCursor];
    this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size = size;
    p.endSize = endSize;
    p.life = 0;
    p.maxLife = maxLife;
    p.color = color;
    p.alpha = alpha;
    p.rotation = Math.random() * Math.PI * 2;
    p.rotSpeed = (Math.random() - 0.5) * 9;
  }

  public addDecal(
    kind: GroundDecal['kind'],
    x: number,
    y: number,
    radius: number,
    angle: number,
    color: string,
    alpha = 0.45
  ): void {
    const d = this.decals[this.dCursor];
    this.dCursor = (this.dCursor + 1) % MAX_DECALS;
    d.active = true;
    d.kind = kind;
    d.x = x;
    d.y = y;
    d.radius = radius;
    d.angle = angle;
    d.color = color;
    d.alpha = alpha;
  }

  public addText(x: number, y: number, text: string, color: string): void {
    const t = this.texts[this.tCursor];
    this.tCursor = (this.tCursor + 1) % MAX_TEXTS;
    t.active = true;
    t.x = x;
    t.y = y;
    t.vy = -34;
    t.text = text;
    t.color = color;
    t.life = 0;
    t.maxLife = 0.75;
  }

  public addLightFlash(x: number, y: number, radius: number, color: string, alpha = 0.35, maxLife = 0.16): void {
    const f = this.flashes[this.fCursor];
    this.fCursor = (this.fCursor + 1) % MAX_FLASHES;
    f.active = true;
    f.x = x;
    f.y = y;
    f.radius = radius;
    f.color = color;
    f.alpha = alpha;
    f.life = 0;
    f.maxLife = maxLife;
  }

  public spawnFootDust(x: number, y: number, weight: number, terrain: TerrainType): void {
    if (terrain === 'mud') {
      this.addDecal('footprint', x, y, 4.5 + weight * 2, Math.random() * Math.PI, '#1d1610', 0.52);
      const cnt = Math.round(2 + weight * 3);
      for (let i = 0; i < cnt; i++) {
        this.emit('mud', x, y, (Math.random() - 0.5) * 52, (Math.random() - 0.5) * 52, 3.2, 1.2, 0.32, '#4a3b2c', 0.85);
      }
    } else if (terrain === 'water') {
      const cnt = Math.round(3 + weight * 4);
      for (let i = 0; i < cnt; i++) {
        this.emit('water', x, y, (Math.random() - 0.5) * 65, (Math.random() - 0.5) * 65, 4.2, 9, 0.34, '#7dd3fc', 0.65);
      }
    } else if (terrain === 'sand') {
      this.addDecal('footprint', x, y, 4.5 + weight * 1.8, Math.random() * Math.PI, '#463a28', 0.38);
      if (weight > 0.5) {
        this.emit('smoke', x, y, (Math.random() - 0.5) * 26, -8, 6 + weight * 4, 15, 0.45, '#9c8663', 0.36, 2);
      }
    } else if (weight > 0.65) {
      // Heavy mech footsteps puff ground dust & micro debris on concrete/rock
      const cnt = weight > 0.85 ? 2 : 1;
      for (let i = 0; i < cnt; i++) {
        this.emit('smoke', x, y, (Math.random() - 0.5) * 32, -10, 5 + weight * 4, 16, 0.42, '#525a66', 0.3, 2);
      }
    }
  }

  public spawnMuzzleFlash(x: number, y: number, angle: number, caliber: number, isRailgun = false): void {
    const scale = Math.max(0.7, caliber / 4.5);
    const flashCol = isRailgun ? '#67e8f9' : '#fde68a';
    this.emit(
      'muzzle',
      x,
      y,
      Math.cos(angle) * 40,
      Math.sin(angle) * 40,
      8 + caliber * 2.4,
      3,
      0.11 + scale * 0.03,
      flashCol,
      0.96,
      8
    );

    // Temporary environmental muzzle illumination
    this.addLightFlash(
      x + Math.cos(angle) * 18,
      y + Math.sin(angle) * 18,
      65 + caliber * 16,
      isRailgun ? '#22d3ee' : '#fbbf24',
      Math.min(0.45, 0.16 + caliber * 0.028),
      0.14
    );

    const sparkCount = Math.min(10, Math.round(4 + caliber * 0.7));
    for (let i = 0; i < sparkCount; i++) {
      const a = angle + (Math.random() - 0.5) * 0.75;
      const spd = (95 + Math.random() * 170) * scale;
      this.emit('spark', x, y, Math.cos(a) * spd, Math.sin(a) * spd, 2.4, 0.4, 0.18 + scale * 0.05, flashCol, 0.92, 8);
    }

    // Lingering barrel gunsmoke plume for heavy cannons
    if (caliber >= 4.2) {
      const smokeCount = Math.min(8, Math.round(caliber * 0.75));
      for (let i = 0; i < smokeCount; i++) {
        const a = angle + (Math.random() - 0.5) * 0.55;
        const spd = (25 + Math.random() * 55) * scale;
        this.emit(
          'smoke',
          x,
          y,
          Math.cos(a) * spd,
          Math.sin(a) * spd - 6,
          6 + caliber * 0.8,
          18 + caliber * 2.4,
          0.65 + Math.random() * 0.5,
          isRailgun ? '#94a3b8' : '#3a404a',
          0.52,
          9,
          10
        );
      }
    }

    if (!isRailgun) {
      // Heavy shell casing eject right
      const ejAngle = angle + Math.PI * 0.55 + (Math.random() - 0.5) * 0.3;
      const ejSpd = 45 + Math.random() * 45;
      this.emit(
        'casing',
        x,
        y,
        Math.cos(ejAngle) * ejSpd,
        Math.sin(ejAngle) * ejSpd,
        2.4 + caliber * 0.16,
        2.4 + caliber * 0.16,
        0.55,
        '#d97706',
        0.92,
        10,
        55
      );
    }
  }

  public spawnExplosion(x: number, y: number, radius: number): void {
    const scale = Math.max(0.45, radius / 65);
    const isMassive = radius >= 110;

    // Bright initial illumination flash
    this.addLightFlash(x, y, radius * (isMassive ? 2.4 : 1.7), isMassive ? '#fed7aa' : '#fb923c', isMassive ? 0.55 : 0.34, isMassive ? 0.24 : 0.15);

    // Expanding shockwave ring(s)
    this.emit('shockwave', x, y, 0, 0, 8 * scale, radius * 1.25, isMassive ? 0.48 : 0.34, '#fb923c', 0.9, 1);
    if (isMassive) {
      this.emit('shockwave', x, y, 0, 0, 14, radius * 1.55, 0.58, '#fde68a', 0.62, 1);
    }

    // Core white-hot flash
    this.emit('muzzle', x, y, 0, 0, radius * 0.42, radius * 0.12, 0.12, '#fef08a', 0.95, 6);

    const fireCount = Math.min(28, Math.round(9 * scale));
    for (let i = 0; i < fireCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (35 + Math.random() * 145) * scale;
      this.emit(
        'fire',
        x + (Math.random() - 0.5) * 14 * scale,
        y + (Math.random() - 0.5) * 14 * scale,
        Math.cos(a) * spd,
        Math.sin(a) * spd,
        10 * scale,
        26 * scale,
        0.3 + Math.random() * 0.28,
        i % 2 === 0 ? '#f97316' : '#fef08a',
        0.92,
        6
      );
    }

    // Lingering dense smoke cloud
    const smokeCount = Math.min(26, Math.round(9 * scale));
    for (let i = 0; i < smokeCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (12 + Math.random() * 58) * scale;
      this.emit(
        'smoke',
        x + (Math.random() - 0.5) * 20 * scale,
        y + (Math.random() - 0.5) * 20 * scale,
        Math.cos(a) * spd,
        Math.sin(a) * spd,
        14 * scale,
        42 * scale,
        (isMassive ? 1.25 : 0.75) + Math.random() * 0.8,
        '#252a32',
        0.72,
        10,
        22
      );
    }

    // Flying hot sparks & solid debris chunks
    const sparkCount = Math.min(22, Math.round(10 * scale));
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (110 + Math.random() * 240) * scale;
      this.emit('spark', x, y, Math.cos(a) * spd, Math.sin(a) * spd, 2.6, 0.5, 0.35 + Math.random() * 0.25, '#fde047', 1, 6, 48);
    }

    const debrisCount = Math.min(14, Math.round(5 * scale));
    for (let i = 0; i < debrisCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (65 + Math.random() * 165) * scale;
      this.emit('debris', x, y, Math.cos(a) * spd, Math.sin(a) * spd, 3.2 * Math.min(1.5, scale), 2.5, 0.65 + Math.random() * 0.35, '#475569', 0.95, 8, 95);
    }

    // Scorch & ground crater decal (noticeably larger for heavy artillery!)
    if (radius >= 24) {
      this.addDecal('crater', x, y, Math.min(76, radius * 0.48), Math.random() * Math.PI * 2, '#111419', isMassive ? 0.72 : 0.52);
    }
  }

  /** Colossal nuclear & strategic mortar detonation with mushroom smoke column and warhead-specific blast rings. */
  public spawnNuclearExplosion(x: number, y: number, radius: number, warhead: BossWarheadType): void {
    this.spawnExplosion(x, y, Math.min(180, radius));

    const isEmp = warhead === 'emp';
    const isThermo = warhead === 'thermoblast';
    const isBunker = warhead === 'bunker_buster';

    const flashColor = isEmp ? '#67e8f9' : isBunker ? '#c084fc' : isThermo ? '#ef4444' : '#fff7ed';
    const ringColor = isEmp ? '#22d3ee' : isBunker ? '#a855f7' : isThermo ? '#f97316' : '#fef08a';

    // Intense expanding illumination & multi-ring shockwaves
    this.addLightFlash(x, y, radius * 3.1, flashColor, 0.78, 0.42);
    this.emit('shockwave', x, y, 0, 0, 22, radius * 1.45, 0.7, ringColor, 0.96, 2);
    this.emit('shockwave', x, y, 0, 0, 12, radius * 1.95, 0.92, isEmp ? '#a855f7' : '#fb923c', 0.72, 2);

    // Towering rising mushroom cloud stem + expanding cap
    if (!isEmp) {
      for (let i = 0; i < 14; i++) {
        const stemZ = 10 + i * 7;
        this.emit(
          'smoke',
          x + (Math.random() - 0.5) * 26,
          y + (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 18,
          18,
          36,
          1.9 + Math.random() * 0.8,
          i % 3 === 0 ? '#475569' : '#262b34',
          0.78,
          stemZ,
          44 + i * 2.5
        );
      }
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        const spd = 48 + Math.random() * 62;
        this.emit(
          'smoke',
          x + Math.cos(ang) * 22,
          y + Math.sin(ang) * 16,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd * 0.65,
          26,
          64,
          2.3 + Math.random() * 0.9,
          i % 4 === 0 ? '#f97316' : '#334155',
          0.74,
          96 + Math.random() * 24,
          22
        );
      }
    } else {
      // EMP electrical arc sparks radiating outward
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        const spd = 160 + Math.random() * 260;
        this.emit('spark', x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, 4.2, 0.8, 0.45 + Math.random() * 0.25, '#67e8f9', 1, 12, 18);
      }
    }

    // Massive blast crater
    if (!isEmp) {
      this.addDecal('crater', x, y, Math.min(125, radius * 0.56), Math.random() * Math.PI * 2, '#0c0f14', 0.84);
    }
  }

  public update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'casing' || p.kind === 'debris') {
        p.vz -= 180 * dt;
        p.z = Math.max(0, p.z + p.vz * dt);
        p.vx *= Math.exp(-3.2 * dt);
        p.vy *= Math.exp(-3.2 * dt);
      } else {
        p.vx *= Math.exp(-2.6 * dt);
        p.vy *= Math.exp(-2.6 * dt);
        p.z += p.vz * dt;
      }
      p.rotation += p.rotSpeed * dt;
    }

    for (let i = 0; i < MAX_FLASHES; i++) {
      const f = this.flashes[i];
      if (!f.active) continue;
      f.life += dt;
      if (f.life >= f.maxLife) f.active = false;
    }

    for (let i = 0; i < MAX_TEXTS; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      t.life += dt;
      if (t.life >= t.maxLife) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2 * dt);
    }
  }
}
