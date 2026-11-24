import { MapDefinition, Obstacle, Vec2 } from './types';

export class NavGrid {
  public readonly cellSize = 64;
  public readonly cols: number;
  public readonly rows: number;
  private blocked: Uint8Array;

  constructor(map: MapDefinition) {
    this.cols = Math.ceil(map.width / this.cellSize);
    this.rows = Math.ceil(map.height / this.cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.rebuild(map.obstacles);
  }

  public rebuild(obstacles: Obstacle[]): void {
    this.blocked.fill(0);
    const pad = 22;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.destroyed) continue;
      const minC = Math.max(0, Math.floor((obs.x - obs.w * 0.5 - pad) / this.cellSize));
      const maxC = Math.min(this.cols - 1, Math.floor((obs.x + obs.w * 0.5 + pad) / this.cellSize));
      const minR = Math.max(0, Math.floor((obs.y - obs.h * 0.5 - pad) / this.cellSize));
      const maxR = Math.min(this.rows - 1, Math.floor((obs.y + obs.h * 0.5 + pad) / this.cellSize));
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }
  }

  public isCellBlocked(c: number, r: number): boolean {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  public findPath(start: Vec2, goal: Vec2, maxIterations = 760): Vec2[] {
    const sc = Math.max(0, Math.min(this.cols - 1, Math.floor(start.x / this.cellSize)));
    const sr = Math.max(0, Math.min(this.rows - 1, Math.floor(start.y / this.cellSize)));
    let gc = Math.max(0, Math.min(this.cols - 1, Math.floor(goal.x / this.cellSize)));
    let gr = Math.max(0, Math.min(this.rows - 1, Math.floor(goal.y / this.cellSize)));

    // If goal cell is blocked, pick nearest open neighbor
    if (this.isCellBlocked(gc, gr)) {
      let found = false;
      for (let rad = 1; rad <= 3 && !found; rad++) {
        for (let dr = -rad; dr <= rad && !found; dr++) {
          for (let dc = -rad; dc <= rad && !found; dc++) {
            if (!this.isCellBlocked(gc + dc, gr + dr)) {
              gc += dc;
              gr += dr;
              found = true;
            }
          }
        }
      }
      if (!found) return [{ ...goal }];
    }

    if (sc === gc && sr === gr) return [{ ...goal }];

    const total = this.cols * this.rows;
    const gScore = new Float32Array(total).fill(1e9);
    const fScore = new Float32Array(total).fill(1e9);
    const parent = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const inOpen = new Uint8Array(total);
    const open: number[] = [];

    const startIdx = sr * this.cols + sc;
    const goalIdx = gr * this.cols + gc;
    gScore[startIdx] = 0;
    fScore[startIdx] = Math.hypot(gc - sc, gr - sr);
    open.push(startIdx);
    inOpen[startIdx] = 1;

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [-1, 1, 1.414],
      [1, -1, 1.414],
      [-1, -1, 1.414],
    ];

    let iters = 0;
    let bestClosest = startIdx;
    let bestH = fScore[startIdx];

    while (open.length > 0 && iters < maxIterations) {
      iters++;
      // Pop lowest fScore
      let bestPos = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestPos]]) bestPos = i;
      }
      const current = open[bestPos];
      open[bestPos] = open[open.length - 1];
      open.pop();
      inOpen[current] = 0;

      if (current === goalIdx) {
        return this.reconstruct(parent, current, goal);
      }

      closed[current] = 1;
      const cr = Math.floor(current / this.cols);
      const cc = current % this.cols;
      const curH = Math.hypot(gc - cc, gr - cr);
      if (curH < bestH) {
        bestH = curH;
        bestClosest = current;
      }

      for (let d = 0; d < dirs.length; d++) {
        const nc = cc + dirs[d][0];
        const nr = cr + dirs[d][1];
        if (this.isCellBlocked(nc, nr)) continue;
        // Prevent diagonal corner cutting
        if (dirs[d][0] !== 0 && dirs[d][1] !== 0) {
          if (this.isCellBlocked(cc + dirs[d][0], cr) || this.isCellBlocked(cc, cr + dirs[d][1])) {
            continue;
          }
        }
        const nIdx = nr * this.cols + nc;
        if (closed[nIdx]) continue;
        const tentativeG = gScore[current] + dirs[d][2];
        if (tentativeG < gScore[nIdx]) {
          parent[nIdx] = current;
          gScore[nIdx] = tentativeG;
          fScore[nIdx] = tentativeG + Math.hypot(gc - nc, gr - nr);
          if (!inOpen[nIdx]) {
            open.push(nIdx);
            inOpen[nIdx] = 1;
          }
        }
      }
    }

    if (bestClosest !== startIdx) {
      return this.reconstruct(parent, bestClosest, {
        x: (bestClosest % this.cols + 0.5) * this.cellSize,
        y: (Math.floor(bestClosest / this.cols) + 0.5) * this.cellSize,
      });
    }
    return [{ ...goal }];
  }

  private reconstruct(parent: Int32Array, endIdx: number, exactGoal: Vec2): Vec2[] {
    const pts: Vec2[] = [];
    let cur = endIdx;
    while (cur !== -1) {
      const r = Math.floor(cur / this.cols);
      const c = cur % this.cols;
      pts.push({
        x: (c + 0.5) * this.cellSize,
        y: (r + 0.5) * this.cellSize,
      });
      cur = parent[cur];
    }
    pts.reverse();
    if (pts.length > 0) {
      pts[pts.length - 1] = { ...exactGoal };
    }
    // Remove start cell so unit immediately steers to next waypoint
    if (pts.length > 1) pts.shift();
    return pts;
  }
}

export function hasLineOfSight(
  a: Vec2,
  b: Vec2,
  obstacles: Obstacle[],
  ignoreDestroyed = true
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (ignoreDestroyed && obs.destroyed) continue;
    if (!obs.blocksLos) continue;
    if (segmentIntersectsAABB(a.x, a.y, b.x, b.y, obs.x, obs.y, obs.w, obs.h)) {
      return false;
    }
  }
  return true;
}

export function segmentIntersectsAABB(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  w: number,
  h: number
): boolean {
  const minX = cx - w * 0.5;
  const maxX = cx + w * 0.5;
  const minY = cy - h * 0.5;
  const maxY = cy + h * 0.5;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) < 1e-6) {
    if (x1 < minX || x1 > maxX) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - x1) * inv;
    let t2 = (maxX - x1) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  if (Math.abs(dy) < 1e-6) {
    if (y1 < minY || y1 > maxY) return false;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - y1) * inv;
    let t2 = (maxY - y1) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  return true;
}

export function findNearbyCover(
  unitPos: Vec2,
  threatPos: Vec2,
  obstacles: Obstacle[],
  maxSearchRadius = 420
): Vec2 | null {
  let bestSpot: Vec2 | null = null;
  let bestScore = -1e9;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (obs.destroyed || !obs.blocksLos) continue;
    const distObs = Math.hypot(obs.x - unitPos.x, obs.y - unitPos.y);
    if (distObs > maxSearchRadius || distObs < 35) continue;

    // Candidate spot is on the opposite side of obstacle from threat
    const tx = obs.x - threatPos.x;
    const ty = obs.y - threatPos.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const offset = Math.max(obs.w, obs.h) * 0.5 + 38;
    const spot: Vec2 = {
      x: obs.x + (tx / tLen) * offset,
      y: obs.y + (ty / tLen) * offset,
    };

    const distToSpot = Math.hypot(spot.x - unitPos.x, spot.y - unitPos.y);
    const score = 300 - distToSpot;
    if (score > bestScore) {
      bestScore = score;
      bestSpot = spot;
    }
  }
  return bestSpot;
}
