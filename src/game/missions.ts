import { BossVariantId } from './bossTypes';
import { EnemyArchetype, MapId, MechClassId } from './types';

export interface RadioLine {
  speaker: string;
  role: string;
  text: string;
}

export interface CampaignMission {
  id: number;
  code: string;
  title: string;
  mapId: MapId;
  briefing: string;
  objectivesSummary: string;
  dialogue: RadioLine[];
  allies: { callsign: string; classId: MechClassId }[];
  enemyWaves: { archetype: EnemyArchetype; count: number }[];
  rewardCredits: number;
  unlockUnit?: MechClassId;
  difficultyMult: number;
  bossVariant?: BossVariantId;
  defendObjectiveLabel?: string;
}

export const CAMPAIGN_MISSIONS: CampaignMission[] = [
  {
    id: 1,
    code: 'OP-01',
    title: 'Ashfall Reconnaissance',
    mapId: 'urban',
    briefing:
      'Forward relay beacons in Old Veridia went dark six hours ago. Autonomous Legion scouts have occupied the arterial roads. Push through the ruins, secure the relay sector, and eliminate the vanguard.',
    objectivesSummary: 'Secure Forward Relay Sector and destroy 7 autonomous vanguard units.',
    dialogue: [
      {
        speaker: 'Handler Aria',
        role: 'Tactical Control',
        text: 'Wardog Flight, sensor ghosts confirmed across District 04. Keep your legs out of the rubble craters and watch your flanks.',
      },
      {
        speaker: 'Kaelen (Wardog-2)',
        role: 'Wingman',
        text: 'Actuators green. If those autonomous scouts try to encircle us, issue a Spread order and we will cross-fire.',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'standard' },
      { callsign: 'Wardog-3', classId: 'recon' },
    ],
    enemyWaves: [
      { archetype: 'scout', count: 3 },
      { archetype: 'swarm', count: 2 },
      { archetype: 'assault', count: 2 },
    ],
    rewardCredits: 220,
    difficultyMult: 0.85,
  },
  {
    id: 2,
    code: 'OP-02',
    title: 'Mud & Iron',
    mapId: 'grassland',
    briefing:
      'Storm rains have turned the Pale Steppe into a quagmire. Enemy assault walkers and rail snipers are holding the central ridge. Watch your traction in mud basins and flush out their overwatch.',
    objectivesSummary: 'Eliminate all 9 hostile units including long-range rail snipers.',
    dialogue: [
      {
        speaker: 'Sera (Wardog-4)',
        role: 'Fire Support',
        text: 'Mud is thick enough to bog down a heavy chassis. Stay on the firm road until we spot their sniper sightlines.',
      },
      {
        speaker: 'Handler Aria',
        role: 'Tactical Control',
        text: 'Strix rail units detected on the eastern rise. Watch for red targeting lasers before they discharge.',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'standard' },
      { callsign: 'Wardog-4', classId: 'sniper' },
    ],
    enemyWaves: [
      { archetype: 'assault', count: 3 },
      { archetype: 'scout', count: 2 },
      { archetype: 'sniper', count: 2 },
      { archetype: 'swarm', count: 2 },
    ],
    rewardCredits: 320,
    unlockUnit: 'heavy',
    difficultyMult: 0.95,
  },
  {
    id: 3,
    code: 'OP-03',
    title: 'Foundry Burn',
    mapId: 'industrial',
    briefing:
      'Foundry Nine is swarming with Skorpion packs and a Dinosauria heavy breakthrough unit. Volatile fuel silos litter the floor—detonate them when enemy packs cluster nearby.',
    objectivesSummary: 'Clear Foundry Nine of hostile machines including Grappler pack and Heavy Juggernaut.',
    dialogue: [
      {
        speaker: 'Toma (Wardog-5)',
        role: 'Field Engineer',
        text: 'I have the arc-repair rig online. Stay within 300 meters if your leg actuators take a bad hit.',
      },
      {
        speaker: 'Kaelen (Wardog-2)',
        role: 'Wingman',
        text: 'Heavy signature ahead! Watch the rafters too—Raptis grapplers love swinging out of blind spots!',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'standard' },
      { callsign: 'Wardog-5', classId: 'engineer' },
      { callsign: 'Wardog-3', classId: 'recon' },
    ],
    enemyWaves: [
      { archetype: 'swarm', count: 4 },
      { archetype: 'assault', count: 3 },
      { archetype: 'hunter', count: 2 },
      { archetype: 'grappler', count: 5 },
      { archetype: 'heavy', count: 1 },
    ],
    rewardCredits: 420,
    unlockUnit: 'artillery',
    difficultyMult: 1.05,
  },
  {
    id: 4,
    code: 'OP-04',
    title: 'River of Shadows',
    mapId: 'forest',
    briefing:
      'Phantom Hunter units are stalking our supply column across the Blackwood river ford. Shallow water slows chassis response—use electronic warfare or tight squad focus fire to survive the ambush.',
    objectivesSummary: 'Cross the Blackwood ford and eliminate 12 Hunter & Sniper units.',
    dialogue: [
      {
        speaker: 'Handler Aria',
        role: 'Tactical Control',
        text: 'Warning: Phantom-class hunters track damaged limbs and lead your velocity vector. Keep moving laterally.',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'heavy' },
      { callsign: 'Wardog-4', classId: 'ewar' },
      { callsign: 'Wardog-5', classId: 'engineer' },
    ],
    enemyWaves: [
      { archetype: 'hunter', count: 2 },
      { archetype: 'assassin', count: 1 },
      { archetype: 'sniper', count: 2 },
      { archetype: 'interceptor', count: 2 },
      { archetype: 'assault', count: 3 },
      { archetype: 'scout', count: 2 },
    ],
    rewardCredits: 520,
    unlockUnit: 'ewar',
    difficultyMult: 1.15,
  },
  {
    id: 5,
    code: 'OP-05',
    title: 'White Horizon',
    mapId: 'snow',
    briefing:
      'Final push on White Outpost. The autonomous command node is defended by dual Dinosauria juggernauts, sniper overwatch, and relentless hunter packs. Bring everyone home.',
    objectivesSummary: 'Destroy the Outpost Command Defense Force (14 hostile units).',
    dialogue: [
      {
        speaker: 'Kaelen (Wardog-2)',
        role: 'Wingman',
        text: 'Last ridge between us and the relay. Whatever happens out there—no one gets left behind in the snow.',
      },
      {
        speaker: 'Handler Aria',
        role: 'Tactical Control',
        text: 'All Wardog callsigns cleared hot. Godspeed, Pale Striders.',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'heavy' },
      { callsign: 'Wardog-4', classId: 'sniper' },
      { callsign: 'Wardog-5', classId: 'engineer' },
    ],
    enemyWaves: [
      { archetype: 'heavy', count: 2 },
      { archetype: 'hunter', count: 2 },
      { archetype: 'assassin', count: 1 },
      { archetype: 'grappler', count: 5 },
      { archetype: 'rocket_hunter', count: 2 },
      { archetype: 'interceptor', count: 2 },
      { archetype: 'sniper', count: 2 },
      { archetype: 'assault', count: 3 },
    ],
    rewardCredits: 750,
    unlockUnit: 'engineer',
    difficultyMult: 1.25,
  },
  {
    id: 6,
    code: 'OP-06',
    title: 'Counter-Battery Hunt',
    mapId: 'desert',
    bossVariant: 'siege',
    briefing:
      'Long-range seismic arrays have pinpointed a Thunderhead-01 Siege platform shelling allied corridors across Red Alkali. Advance through its escort patrol, evade strategic nuclear mortar strikes, and shatter its dorsal mortar turret or ammo compartments.',
    objectivesSummary: 'Destroy Thunderhead-01 Siege and its escort screen.',
    dialogue: [
      {
        speaker: 'Handler Aria',
        role: 'Tactical Control',
        text: 'Colossal seismic signature confirmed! That is a Thunderhead-01 Strategic Artillery Dreadnought. Watch for red ground impact warnings!',
      },
      {
        speaker: 'Kaelen (Wardog-2)',
        role: 'Wingman',
        text: 'Target its lateral ammo vaults or dorsal mortar cannon—crippling those systems will break its bombardment cadence.',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'heavy' },
      { callsign: 'Wardog-4', classId: 'recon' },
      { callsign: 'Wardog-5', classId: 'engineer' },
    ],
    enemyWaves: [
      { archetype: 'scout', count: 2 },
      { archetype: 'assault', count: 1 },
    ],
    rewardCredits: 1100,
    difficultyMult: 1.0,
  },
  {
    id: 7,
    code: 'OP-07',
    title: 'Bastion Defense',
    mapId: 'mountain',
    bossVariant: 'fortress',
    defendObjectiveLabel: 'Aegis Relay Citadel',
    briefing:
      'A hexagonal Thunderhead-04 Fortress is marching on Aegis Relay Citadel, deploying autonomous gun turrets and bunker-buster shells. Its frontal glacis shrugs off direct hits—flank behind it to strike its exposed rear power core before the Relay falls.',
    objectivesSummary: 'Protect Aegis Relay Citadel and destroy Thunderhead-04 Fortress.',
    dialogue: [
      {
        speaker: 'Toma (Wardog-5)',
        role: 'Field Engineer',
        text: 'Its front armor plating is absurdly thick! Split up and shoot the glowing power core on its rear deck.',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'standard' },
      { callsign: 'Wardog-4', classId: 'artillery' },
      { callsign: 'Wardog-5', classId: 'engineer' },
    ],
    enemyWaves: [
      { archetype: 'assault', count: 2 },
      { archetype: 'interceptor', count: 2 },
    ],
    rewardCredits: 1350,
    difficultyMult: 1.05,
  },
  {
    id: 8,
    code: 'OP-08',
    title: 'Operation Blackout',
    mapId: 'urban',
    bossVariant: 'blackout',
    briefing:
      'Thunderhead-05 Blackout has darkened Sector 04 with experimental EMP nuclear warheads and false radar decoys. Destroy its sensor array and capacitors before our targeting systems go blind.',
    objectivesSummary: 'Neutralize Thunderhead-05 Blackout despite EMP radar interference.',
    dialogue: [
      {
        speaker: 'Handler Aria',
        role: 'Tactical Control',
        text: 'Caution: Blackout fires EMP warheads that scramble radar and HUD telemetry. Keep eyes on the physical silhouette!',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'ewar' },
      { callsign: 'Wardog-3', classId: 'sniper' },
      { callsign: 'Wardog-5', classId: 'engineer' },
    ],
    enemyWaves: [
      { archetype: 'hunter', count: 2 },
      { archetype: 'assassin', count: 2 },
      { archetype: 'grappler', count: 5 },
      { archetype: 'rocket_hunter', count: 2 },
    ],
    rewardCredits: 1600,
    difficultyMult: 1.1,
  },
  {
    id: 9,
    code: 'OP-09',
    title: 'Final Offensive: Cataclysm',
    mapId: 'industrial',
    bossVariant: 'cataclysm',
    briefing:
      'The Autonomous Legion flagship has deployed: Thunderhead-02 Cataclysm. Sixteen legs, twin artillery pylons, and multi-shell nuclear barrages. Bring every weapon you have and finish the war.',
    objectivesSummary: 'Destroy Final Campaign Boss Thunderhead-02 Cataclysm.',
    dialogue: [
      {
        speaker: 'Handler Aria',
        role: 'Tactical Control',
        text: 'All Wardog units, this is the final battle. Cataclysm is prepping dual-salvo strategic warheads—stay mobile and tear its components apart!',
      },
    ],
    allies: [
      { callsign: 'Wardog-2', classId: 'heavy' },
      { callsign: 'Wardog-4', classId: 'artillery' },
      { callsign: 'Wardog-5', classId: 'engineer' },
    ],
    enemyWaves: [
      { archetype: 'heavy', count: 1 },
      { archetype: 'assault', count: 2 },
      { archetype: 'sky_breaker', count: 1 },
      { archetype: 'interceptor', count: 2 },
    ],
    rewardCredits: 2500,
    difficultyMult: 1.15,
  },
];

export interface SkirmishConfig {
  mapId: MapId;
  playerUnit: MechClassId;
  allyUnits: MechClassId[];
  difficulty: 'recruit' | 'veteran' | 'ace';
  enemyCount: number;
  bossConfig?: import('./bossDirector').BossEncounterConfig;
}

export const MAP_OPTIONS: { id: MapId; name: string; region: string }[] = [
  { id: 'urban', name: 'Abandoned Urban District', region: 'Sector 04' },
  { id: 'grassland', name: 'Open Grassland', region: 'Sector 07' },
  { id: 'mountain', name: 'Rocky Mountain Pass', region: 'Sector 11' },
  { id: 'desert', name: 'Desert Combat Zone', region: 'Sector 14' },
  { id: 'industrial', name: 'Destroyed Industrial Complex', region: 'Sector 02' },
  { id: 'forest', name: 'Forest Battlefield', region: 'Sector 08' },
  { id: 'snow', name: 'Snow Military Installation', region: 'Sector 19' },
];

export function buildSurvivalWave(waveNumber: number): { archetype: EnemyArchetype; count: number }[] {
  const budget = 3 + waveNumber * 2;
  const list: { archetype: EnemyArchetype; count: number }[] = [];
  const scouts = Math.max(1, Math.floor(budget * 0.22));
  const assaults = Math.floor(budget * 0.28);
  const swarm = waveNumber >= 2 ? Math.floor(budget * 0.22) : 0;
  const snipers = waveNumber >= 2 ? Math.min(3, Math.floor(waveNumber * 0.55)) : 0;
  const interceptors = waveNumber >= 2 ? Math.min(3, Math.floor(waveNumber * 0.55)) : 0;
  const hunters = waveNumber >= 3 ? Math.min(3, Math.floor((waveNumber - 1) * 0.5)) : 0;
  const assassins = waveNumber >= 3 ? Math.min(2, Math.floor((waveNumber - 2) * 0.5)) : 0;
  const grapplers = waveNumber >= 2 ? 5 : 0;
  const rocketHunters = waveNumber >= 3 ? Math.min(2, Math.floor((waveNumber - 2) * 0.55)) : 0;
  const heavies = waveNumber >= 3 ? Math.min(2, Math.floor((waveNumber - 2) * 0.5)) : 0;
  const skyBreakers = waveNumber >= 4 ? Math.min(2, Math.floor((waveNumber - 3) * 0.45)) : 0;

  if (scouts > 0) list.push({ archetype: 'scout', count: scouts });
  if (assaults > 0) list.push({ archetype: 'assault', count: assaults });
  if (swarm > 0) list.push({ archetype: 'swarm', count: swarm });
  if (snipers > 0) list.push({ archetype: 'sniper', count: snipers });
  if (interceptors > 0) list.push({ archetype: 'interceptor', count: interceptors });
  if (hunters > 0) list.push({ archetype: 'hunter', count: hunters });
  if (assassins > 0) list.push({ archetype: 'assassin', count: assassins });
  if (grapplers > 0) list.push({ archetype: 'grappler', count: grapplers });
  if (rocketHunters > 0) list.push({ archetype: 'rocket_hunter', count: rocketHunters });
  if (heavies > 0) list.push({ archetype: 'heavy', count: heavies });
  if (skyBreakers > 0) list.push({ archetype: 'sky_breaker', count: skyBreakers });
  return list;
}
