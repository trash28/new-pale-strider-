import { MapDefinition, MapId, Obstacle, ObstacleKind, TerrainType, TerrainZone } from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeObstacle(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: ObstacleKind
): Obstacle {
  const destructible = kind === 'fuel_tank' || kind === 'crate';
  const explosive = kind === 'fuel_tank';
  const hpMap: Record<ObstacleKind, number> = {
    building: 9999,
    bunker: 9999,
    rock: 9999,
    watchtower: 9999,
    crane: 9999,
    bridge_pylon: 9999,
    radar_dish: 9999,
    silo: 9999,
    monolith: 9999,
    tank_wreck: 9999,
    ruin: 9999,
    tree: 9999,
    fuel_tank: 85,
    crate: 70,
  };
  const heightMap: Record<ObstacleKind, number> = {
    watchtower: 46,
    crane: 44,
    silo: 42,
    monolith: 40,
    bridge_pylon: 38,
    building: 36,
    radar_dish: 32,
    tree: 28,
    rock: 26,
    bunker: 24,
    ruin: 20,
    fuel_tank: 18,
    tank_wreck: 12,
    crate: 10,
  };
  return {
    id,
    x,
    y,
    w,
    h,
    kind,
    destructible,
    explosive,
    hp: hpMap[kind],
    maxHp: hpMap[kind],
    destroyed: false,
    height: heightMap[kind],
    blocksLos: kind !== 'crate' && kind !== 'tank_wreck',
  };
}

function sizeForKind(kind: ObstacleKind, rand: () => number): { w: number; h: number } {
  switch (kind) {
    case 'building':
      return { w: 100 + rand() * 90, h: 100 + rand() * 90 };
    case 'bunker':
      return { w: 86 + rand() * 52, h: 76 + rand() * 46 };
    case 'watchtower': {
      const s = 54 + rand() * 18;
      return { w: s, h: s };
    }
    case 'crane':
      return rand() < 0.5
        ? { w: 74 + rand() * 24, h: 52 + rand() * 16 }
        : { w: 52 + rand() * 16, h: 74 + rand() * 24 };
    case 'bridge_pylon': {
      const s = 56 + rand() * 22;
      return { w: s, h: s };
    }
    case 'radar_dish': {
      const s = 58 + rand() * 18;
      return { w: s, h: s };
    }
    case 'silo': {
      const s = 64 + rand() * 24;
      return { w: s, h: s };
    }
    case 'monolith':
      return { w: 58 + rand() * 34, h: 58 + rand() * 34 };
    case 'rock':
      return { w: 62 + rand() * 64, h: 56 + rand() * 54 };
    case 'ruin':
      return { w: 72 + rand() * 60, h: 62 + rand() * 54 };
    case 'tree': {
      const s = 42 + rand() * 22;
      return { w: s, h: s };
    }
    case 'fuel_tank':
      return { w: 46, h: 46 };
    case 'tank_wreck':
      return { w: 60, h: 36 };
    case 'crate':
    default:
      return { w: 38, h: 38 };
  }
}

function isPlacementFree(
  x: number,
  y: number,
  w: number,
  h: number,
  existing: Obstacle[],
  clearZones: { x: number; y: number; r: number }[],
  minGap = 40
): boolean {
  for (let i = 0; i < clearZones.length; i++) {
    const cz = clearZones[i];
    if (Math.hypot(x - cz.x, y - cz.y) < cz.r + Math.max(w, h) * 0.55) {
      return false;
    }
  }
  for (let i = 0; i < existing.length; i++) {
    const other = existing[i];
    if (
      Math.abs(x - other.x) < (w + other.w) * 0.5 + minGap &&
      Math.abs(y - other.y) < (h + other.h) * 0.5 + minGap
    ) {
      return false;
    }
  }
  return true;
}

function scatterObstacles(
  seed: number,
  width: number,
  height: number,
  targetCount: number,
  kinds: ObstacleKind[],
  clearZones: { x: number; y: number; r: number }[],
  initialObstacles: Obstacle[] = []
): Obstacle[] {
  const rand = mulberry32(seed);
  const obs: Obstacle[] = [...initialObstacles];
  const maxAttempts = targetCount * 3;
  let placed = 0;

  for (let i = 0; i < maxAttempts && placed < targetCount; i++) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const { w, h } = sizeForKind(kind, rand);
    const x = 190 + rand() * (width - 380);
    const y = 190 + rand() * (height - 380);

    if (isPlacementFree(x, y, w, h, obs, clearZones, 42)) {
      obs.push(makeObstacle(`obs_${seed}_${i}`, x, y, w, h, kind));
      placed++;
    }
  }
  return obs;
}

function addAnchorIfFree(
  obs: Obstacle[],
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: ObstacleKind,
  clearZones: { x: number; y: number; r: number }[]
): void {
  if (isPlacementFree(x, y, w, h, obs, clearZones, 34)) {
    obs.push(makeObstacle(id, x, y, w, h, kind));
  }
}

export function buildMap(id: MapId): MapDefinition {
  if (id === 'training') {
    const width = 4400;
    const height = 3200;
    const playerSpawn = { x: 420, y: 1600 };
    const enemySpawns = [
      { x: 1850, y: 1120 },
      { x: 2050, y: 1600 },
      { x: 1850, y: 2080 },
      { x: 2650, y: 1150 },
      { x: 2950, y: 1980 },
      { x: 3550, y: 1580 },
    ];
    const terrainZones: TerrainZone[] = [
      // Dedicated labeled terrain proving strips along western proving range
      { x: 760, y: 520, w: 380, h: 280, shape: 'rect', type: 'mud' },
      { x: 760, y: 940, w: 380, h: 280, shape: 'rect', type: 'sand' },
      { x: 760, y: 1360, w: 380, h: 280, shape: 'rect', type: 'rocky' },
      { x: 760, y: 1860, w: 380, h: 280, shape: 'rect', type: 'water' },
      { x: 760, y: 2300, w: 380, h: 280, shape: 'rect', type: 'slope_e' },
      { x: 1240, y: 2300, w: 380, h: 280, shape: 'rect', type: 'slope_n' },
      // Eastern proving basin features
      { x: 2780, y: 900, w: 620, h: 380, shape: 'ellipse', type: 'sand' },
      { x: 3120, y: 2280, w: 580, h: 360, shape: 'ellipse', type: 'mud' },
    ];

    const clearZones = [
      { x: playerSpawn.x, y: playerSpawn.y, r: 280 },
      { x: 760, y: 520, r: 170 },
      { x: 760, y: 940, r: 170 },
      { x: 760, y: 1360, r: 170 },
      { x: 760, y: 1860, r: 170 },
      { x: 760, y: 2300, r: 170 },
      ...enemySpawns.map((s) => ({ x: s.x, y: s.y, r: 175 })),
    ];

    const curated: Obstacle[] = [
      // Close-range mixed calibration & cover line
      makeObstacle('tr_bunker_1', 1240, 1260, 96, 120, 'bunker'),
      makeObstacle('tr_ruin_1', 1240, 1920, 90, 110, 'ruin'),
      makeObstacle('tr_tank_1', 1480, 1460, 62, 38, 'tank_wreck'),
      makeObstacle('tr_fuel_1', 1580, 1220, 46, 46, 'fuel_tank'),
      makeObstacle('tr_fuel_2', 1580, 1980, 46, 46, 'fuel_tank'),
      makeObstacle('tr_crate_1', 1320, 1740, 42, 42, 'crate'),

      // Dedicated Grapple Slingshot Avenue (all high-elevation structural varieties!)
      makeObstacle('tr_tower_w1', 1120, 960, 62, 62, 'watchtower'),
      makeObstacle('tr_pylon_w1', 1540, 880, 64, 64, 'bridge_pylon'),
      makeObstacle('tr_crane_w1', 1980, 820, 84, 58, 'crane'),
      makeObstacle('tr_silo_w1', 2440, 920, 74, 74, 'silo'),
      makeObstacle('tr_radar_w1', 2920, 820, 66, 66, 'radar_dish'),
      makeObstacle('tr_monolith_w1', 3380, 920, 72, 72, 'monolith'),

      makeObstacle('tr_tower_s1', 1120, 2240, 62, 62, 'watchtower'),
      makeObstacle('tr_pylon_s1', 1580, 2340, 64, 64, 'bridge_pylon'),
      makeObstacle('tr_crane_s1', 2060, 2400, 84, 58, 'crane'),
      makeObstacle('tr_silo_s1', 2520, 2320, 74, 74, 'silo'),
      makeObstacle('tr_radar_s1', 3000, 2420, 66, 66, 'radar_dish'),
      makeObstacle('tr_monolith_s1', 3480, 2280, 72, 72, 'monolith'),
    ];

    const obstacles = scatterObstacles(
      909,
      width,
      height,
      78,
      [
        'watchtower',
        'crane',
        'bridge_pylon',
        'radar_dish',
        'silo',
        'monolith',
        'building',
        'bunker',
        'ruin',
        'rock',
        'tree',
        'fuel_tank',
        'tank_wreck',
        'crate',
      ],
      clearZones,
      curated
    );

    return {
      id: 'training',
      name: 'Proving Grounds',
      region: 'Sector 00 · Expanded Calibration Complex',
      description:
        'Expansive proving grounds with terrain test strips, high-speed grapple slingshot towers, cranes, silos, and live target drones.',
      width,
      height,
      groundColor: '#1f242b',
      groundDetailColor: '#29303a',
      ambientTint: 'rgba(18, 24, 32, 0.08)',
      playerSpawn,
      enemySpawns,
      terrainZones,
      roads: [
        { x1: 140, y1: 1600, x2: 4240, y2: 1600, width: 140 },
        { x1: 2200, y1: 220, x2: 2200, y2: 2980, width: 120 },
      ],
      obstacles,
      objectives: [
        {
          id: 'obj_range',
          x: 2200,
          y: 1600,
          radius: 170,
          label: 'Live Fire Target Zone',
          completed: false,
          progress: 0,
          kind: 'destroy',
        },
      ],
    };
  }

  const width = 5600;
  const height = 4000;
  const playerSpawn = { x: 520, y: 2000 };
  const enemySpawns = [
    // Forward vanguard & mid-sector approaches
    { x: 2350, y: 1180 },
    { x: 2550, y: 2020 },
    { x: 2320, y: 2840 },
    // Flank corridors
    { x: 3480, y: 780 },
    { x: 3520, y: 3220 },
    // Deep sector strongholds
    { x: 4680, y: 1220 },
    { x: 4860, y: 2040 },
    { x: 4620, y: 2880 },
  ];

  const clearZones = [
    { x: playerSpawn.x, y: playerSpawn.y, r: 300 },
    ...enemySpawns.map((s) => ({ x: s.x, y: s.y, r: 190 })),
    { x: 2750, y: 2000, r: 170 },
    { x: 4650, y: 2000, r: 170 },
  ];

  const presets: Record<
    Exclude<MapId, 'training'>,
    {
      seed: number;
      name: string;
      region: string;
      description: string;
      ground: string;
      detail: string;
      tint: string;
      kinds: ObstacleKind[];
      scatterCount: number;
      anchorKinds: [ObstacleKind, ObstacleKind, ObstacleKind];
      zones: TerrainZone[];
      roads: { x1: number; y1: number; x2: number; y2: number; width: number }[];
    }
  > = {
    urban: {
      seed: 101,
      name: 'Abandoned Urban District',
      region: 'Sector 04 · Old Veridia',
      description:
        'Sprawling metropolis of high-rise towers, overpass bridge pylons, dockyard cranes, and ruined concrete plazas.',
      ground: '#1d2024',
      detail: '#282c32',
      tint: 'rgba(15, 18, 24, 0.14)',
      kinds: ['building', 'watchtower', 'bridge_pylon', 'crane', 'ruin', 'tank_wreck', 'crate'],
      scatterCount: 165,
      anchorKinds: ['bridge_pylon', 'watchtower', 'crane'],
      zones: [
        { x: 1550, y: 1250, w: 680, h: 420, shape: 'ellipse', type: 'rocky' },
        { x: 3250, y: 2450, w: 720, h: 460, shape: 'ellipse', type: 'mud' },
        { x: 4150, y: 1120, w: 580, h: 380, shape: 'ellipse', type: 'rocky' },
        { x: 1950, y: 3150, w: 640, h: 380, shape: 'ellipse', type: 'mud' },
      ],
      roads: [
        { x1: 160, y1: 2000, x2: 5440, y2: 2000, width: 170 },
        { x1: 2800, y1: 160, x2: 2800, y2: 3840, width: 160 },
        { x1: 1450, y1: 300, x2: 1450, y2: 3700, width: 120 },
        { x1: 4200, y1: 300, x2: 4200, y2: 3700, width: 120 },
      ],
    },
    grassland: {
      seed: 202,
      name: 'Open Grassland',
      region: 'Sector 07 · Pale Steppe',
      description:
        'Vast steppe theater punctuated by granite monolith spires, forward watchtowers, radar domes, mud trenches, and timber groves.',
      ground: '#222a21',
      detail: '#2c362a',
      tint: 'rgba(20, 26, 18, 0.1)',
      kinds: ['monolith', 'watchtower', 'radar_dish', 'tree', 'rock', 'bunker', 'tank_wreck'],
      scatterCount: 155,
      anchorKinds: ['monolith', 'watchtower', 'radar_dish'],
      zones: [
        { x: 1650, y: 1380, w: 840, h: 520, shape: 'ellipse', type: 'mud' },
        { x: 3100, y: 2420, w: 820, h: 480, shape: 'ellipse', type: 'slope_n' },
        { x: 3850, y: 1120, w: 740, h: 480, shape: 'ellipse', type: 'mud' },
        { x: 2150, y: 3150, w: 720, h: 420, shape: 'ellipse', type: 'slope_e' },
      ],
      roads: [
        { x1: 160, y1: 2050, x2: 5440, y2: 1720, width: 110 },
        { x1: 2400, y1: 220, x2: 3150, y2: 3780, width: 95 },
      ],
    },
    mountain: {
      seed: 303,
      name: 'Rocky Mountain Pass',
      region: 'Sector 11 · Ridge Spire',
      description:
        'Massive alpine corridor lined with towering basalt monoliths, chasm bridge pylons, ridge watchtowers, and fortified bunkers.',
      ground: '#252422',
      detail: '#32302d',
      tint: 'rgba(22, 20, 18, 0.12)',
      kinds: ['monolith', 'rock', 'bridge_pylon', 'watchtower', 'radar_dish', 'bunker', 'ruin'],
      scatterCount: 165,
      anchorKinds: ['monolith', 'bridge_pylon', 'watchtower'],
      zones: [
        { x: 1850, y: 1880, w: 960, h: 640, shape: 'ellipse', type: 'rocky' },
        { x: 3450, y: 1240, w: 780, h: 520, shape: 'ellipse', type: 'slope_w' },
        { x: 1450, y: 2980, w: 720, h: 460, shape: 'ellipse', type: 'rocky' },
        { x: 4250, y: 2840, w: 820, h: 520, shape: 'ellipse', type: 'slope_s' },
      ],
      roads: [
        { x1: 160, y1: 2420, x2: 5440, y2: 1440, width: 115 },
        { x1: 1200, y1: 420, x2: 4300, y2: 3580, width: 95 },
      ],
    },
    desert: {
      seed: 404,
      name: 'Desert Combat Zone',
      region: 'Sector 14 · Red Alkali',
      description:
        'Expansive alkali dune basins crossed by sandstone monolith buttes, buried radar arrays, supply silos, and fuel depots.',
      ground: '#362e23',
      detail: '#453b2d',
      tint: 'rgba(42, 30, 16, 0.12)',
      kinds: ['monolith', 'radar_dish', 'silo', 'watchtower', 'rock', 'bunker', 'fuel_tank', 'tank_wreck'],
      scatterCount: 155,
      anchorKinds: ['monolith', 'radar_dish', 'silo'],
      zones: [
        { x: 1650, y: 1320, w: 1160, h: 720, shape: 'ellipse', type: 'sand' },
        { x: 3550, y: 2560, w: 1240, h: 760, shape: 'ellipse', type: 'sand' },
        { x: 3050, y: 1140, w: 760, h: 480, shape: 'ellipse', type: 'rocky' },
        { x: 1550, y: 3120, w: 860, h: 520, shape: 'ellipse', type: 'sand' },
      ],
      roads: [
        { x1: 180, y1: 2040, x2: 5420, y2: 2040, width: 120 },
        { x1: 2800, y1: 240, x2: 2800, y2: 3760, width: 105 },
      ],
    },
    industrial: {
      seed: 505,
      name: 'Destroyed Industrial Complex',
      region: 'Sector 02 · Foundry Nine',
      description:
        'Colossal foundry sector packed with overhead cranes, towering ordnance silos, pipeway bridge pylons, and volatile fuel tanks.',
      ground: '#1d2126',
      detail: '#282e36',
      tint: 'rgba(14, 18, 22, 0.14)',
      kinds: ['crane', 'silo', 'bridge_pylon', 'building', 'fuel_tank', 'ruin', 'crate'],
      scatterCount: 175,
      anchorKinds: ['crane', 'silo', 'bridge_pylon'],
      zones: [
        { x: 2150, y: 1620, w: 820, h: 520, shape: 'rect', type: 'mud' },
        { x: 3820, y: 2640, w: 720, h: 480, shape: 'rect', type: 'rocky' },
        { x: 1350, y: 3020, w: 680, h: 420, shape: 'rect', type: 'mud' },
      ],
      roads: [
        { x1: 160, y1: 1320, x2: 5440, y2: 1320, width: 145 },
        { x1: 160, y1: 2680, x2: 5440, y2: 2680, width: 145 },
        { x1: 2800, y1: 200, x2: 2800, y2: 3800, width: 135 },
      ],
    },
    forest: {
      seed: 606,
      name: 'Forest Battlefield',
      region: 'Sector 08 · Blackwood',
      description:
        'Deep woodland expanse bisected by the Blackwood River, spanned by towering bridge pylons, ranger watchtowers, and mossy crags.',
      ground: '#1c241c',
      detail: '#253125',
      tint: 'rgba(12, 20, 14, 0.14)',
      kinds: ['tree', 'monolith', 'watchtower', 'bridge_pylon', 'rock', 'ruin', 'tank_wreck'],
      scatterCount: 185,
      anchorKinds: ['watchtower', 'bridge_pylon', 'monolith'],
      zones: [
        { x: 2760, y: 2000, w: 380, h: 3920, shape: 'rect', type: 'water' },
        { x: 2440, y: 2000, w: 260, h: 3920, shape: 'rect', type: 'mud' },
        { x: 3080, y: 2000, w: 260, h: 3920, shape: 'rect', type: 'mud' },
        { x: 1300, y: 1100, w: 620, h: 420, shape: 'ellipse', type: 'mud' },
        { x: 4200, y: 2920, w: 680, h: 460, shape: 'ellipse', type: 'rocky' },
      ],
      roads: [
        { x1: 160, y1: 1960, x2: 5440, y2: 1960, width: 125 },
        { x1: 160, y1: 980, x2: 5440, y2: 3020, width: 95 },
      ],
    },
    snow: {
      seed: 707,
      name: 'Snow Military Installation',
      region: 'Sector 19 · White Outpost',
      description:
        'Sprawling arctic fortress complex featuring radar domes, perimeter watchtowers, cryo silos, gantry cranes, and reinforced bunkers.',
      ground: '#2b323b',
      detail: '#38424e',
      tint: 'rgba(200, 220, 240, 0.05)',
      kinds: ['radar_dish', 'watchtower', 'silo', 'crane', 'bunker', 'building', 'fuel_tank', 'crate'],
      scatterCount: 165,
      anchorKinds: ['radar_dish', 'watchtower', 'silo'],
      zones: [
        { x: 1650, y: 1120, w: 920, h: 620, shape: 'ellipse', type: 'mud' },
        { x: 3650, y: 2740, w: 940, h: 620, shape: 'ellipse', type: 'sand' },
        { x: 2250, y: 2980, w: 720, h: 460, shape: 'ellipse', type: 'rocky' },
      ],
      roads: [
        { x1: 160, y1: 2000, x2: 5440, y2: 2000, width: 155 },
        { x1: 3800, y1: 220, x2: 3800, y2: 3780, width: 135 },
        { x1: 1700, y1: 260, x2: 1700, y2: 3740, width: 120 },
      ],
    },
  };

  const p = presets[id];
  const curatedAnchors: Obstacle[] = [];

  // Place grappleable pylon/tower/landmark avenues along main approach & flank corridors
  // so players & AoT Grapplers always have continuous multi-swing aerial highways across the huge map.
  const laneXs = [1080, 1620, 2180, 2760, 3340, 3920, 4480, 5020];
  for (let i = 0; i < laneXs.length; i++) {
    const lx = laneXs[i];
    const upperY = 1480 + (i % 2 === 0 ? -190 : 120);
    const lowerY = 2520 + (i % 2 === 0 ? 180 : -120);
    const outerNorthY = 740 + (i % 2) * 180;
    const outerSouthY = 3260 - (i % 2) * 180;

    const kA = p.anchorKinds[i % p.anchorKinds.length];
    const kB = p.anchorKinds[(i + 1) % p.anchorKinds.length];
    const kC = p.anchorKinds[(i + 2) % p.anchorKinds.length];

    addAnchorIfFree(curatedAnchors, `lane_u_${p.seed}_${i}`, lx, upperY, 64, 64, kA, clearZones);
    addAnchorIfFree(curatedAnchors, `lane_l_${p.seed}_${i}`, lx + 90, lowerY, 64, 64, kB, clearZones);
    if (i % 2 === 0) {
      addAnchorIfFree(curatedAnchors, `lane_on_${p.seed}_${i}`, lx + 50, outerNorthY, 68, 68, kC, clearZones);
      addAnchorIfFree(curatedAnchors, `lane_os_${p.seed}_${i}`, lx - 40, outerSouthY, 68, 68, kA, clearZones);
    }
  }

  const obstacles = scatterObstacles(
    p.seed,
    width,
    height,
    p.scatterCount,
    p.kinds,
    clearZones,
    curatedAnchors
  );

  return {
    id,
    name: p.name,
    region: p.region,
    description: p.description,
    width,
    height,
    groundColor: p.ground,
    groundDetailColor: p.detail,
    ambientTint: p.tint,
    playerSpawn,
    enemySpawns,
    terrainZones: p.zones,
    roads: p.roads,
    obstacles,
    objectives: [
      {
        id: 'obj_alpha',
        x: 2750,
        y: 2000,
        radius: 170,
        label: 'Forward Relay Sector',
        completed: false,
        progress: 0,
        kind: 'capture',
      },
      {
        id: 'obj_bravo',
        x: 4650,
        y: 2000,
        radius: 185,
        label: 'Hostile Command Node',
        completed: false,
        progress: 0,
        kind: 'destroy',
      },
    ],
  };
}

export function getTerrainAt(map: MapDefinition, x: number, y: number): TerrainType {
  // Roads always count as firm concrete
  for (let i = 0; i < map.roads.length; i++) {
    const r = map.roads[i];
    const dx = r.x2 - r.x1;
    const dy = r.y2 - r.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 0) {
      const t = Math.max(0, Math.min(1, ((x - r.x1) * dx + (y - r.y1) * dy) / lenSq));
      const px = r.x1 + t * dx;
      const py = r.y1 + t * dy;
      if (Math.hypot(x - px, y - py) <= r.width * 0.5) {
        return 'concrete';
      }
    }
  }

  for (let i = 0; i < map.terrainZones.length; i++) {
    const z = map.terrainZones[i];
    if (z.shape === 'rect') {
      if (Math.abs(x - z.x) <= z.w * 0.5 && Math.abs(y - z.y) <= z.h * 0.5) {
        return z.type;
      }
    } else {
      const rx = z.w * 0.5;
      const ry = z.h * 0.5;
      const nx = (x - z.x) / rx;
      const ny = (y - z.y) / ry;
      if (nx * nx + ny * ny <= 1) {
        return z.type;
      }
    }
  }
  return 'concrete';
}
