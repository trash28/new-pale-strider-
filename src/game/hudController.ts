import type { MechActor } from './mech';
import type { ThunderheadBoss } from './thunderheadBoss';
import { HudSnapshot, Vec2 } from './types';

export interface ContextualHudState {
  showDash: boolean;
  showGrapple: boolean;
  showFlightFull: boolean;
  showFlightStandby: boolean;
  showMortar: boolean;
  showBoss: boolean;
  showSquadCompact: boolean;
  showRadioBrief: boolean;
}

export interface DamageResponsiveHudState {
  hullRatio: number;
  armorRatio: number;
  sensorRatio: number;
  sensorsDamaged: boolean;
  empActive: boolean;
  radarDegraded: boolean;
  rangefinderLost: boolean;
  lowHullCritical: boolean;
  heatWarning: boolean;
  hudFlickerOpacity: number;
  disabledSubsystems: ('L-LEG' | 'R-LEG' | 'ENG' | 'SNS' | 'WPN')[];
}

export interface OffscreenThreatIndicator {
  id: string;
  screenX: number;
  screenY: number;
  angle: number;
  distMeters: number;
  kind: 'enemy' | 'airborne' | 'boss' | 'grappler';
  count?: number;
  urgent?: boolean;
}

export interface CircularRadarBlip {
  nx: number; // -1 .. 1 relative to player
  ny: number; // -1 .. 1 relative to player
  team: 'ally' | 'enemy' | 'boss' | 'objective' | 'decoy' | 'revenant';
  clampedEdge: boolean;
}

export function computeContextualHudState(hud: HudSnapshot): ContextualHudState {
  const dash = hud.dashHud;
  const grapple = hud.grappleHud;
  const flight = hud.flightHud;

  const showDash = Boolean(
    dash?.supported && (dash.active || !dash.ready || dash.cooldownRemaining > 0.05)
  );

  const showGrapple = Boolean(
    grapple?.supported &&
      (grapple.state !== 'idle' || grapple.hasValidTarget || grapple.cooldownRemaining > 0.05)
  );

  const showFlightFull = Boolean(
    flight?.isFlyingMech &&
      (flight.airborne || flight.boosting || flight.overheated || flight.heat > 0.04)
  );

  const showFlightStandby = Boolean(flight?.isFlyingMech && !showFlightFull);

  const showMortar = Boolean(hud.mortarHud);
  const showBoss = Boolean(hud.boss && (hud.boss.alive || hud.boss.destroying));
  const showSquadCompact = hud.squadMembers.length > 0;
  const showRadioBrief = hud.radioFeed.length > 0;

  return {
    showDash,
    showGrapple,
    showFlightFull,
    showFlightStandby,
    showMortar,
    showBoss,
    showSquadCompact,
    showRadioBrief,
  };
}

export function computeDamageResponsiveState(
  hud: HudSnapshot,
  simTime: number
): DamageResponsiveHudState {
  const c = hud.components;
  const hullRatio = Math.max(0, Math.min(1, hud.hp / Math.max(1, hud.maxHp)));
  const armorRatio = Math.max(0, Math.min(1, hud.armor / Math.max(1, hud.maxArmor)));
  const sensorRatio = Math.max(0, Math.min(1, c.sensors / Math.max(1, c.maxSensors)));
  const empActive = hud.empDisruptTimer > 0;
  const sensorsDamaged = sensorRatio < 0.45;
  const radarDegraded = sensorsDamaged || empActive;
  const rangefinderLost = sensorRatio < 0.25 || empActive;
  const lowHullCritical = hullRatio < 0.3;
  const heatWarning = Boolean(
    hud.flightHud?.overheated || (hud.flightHud && hud.flightHud.heat > 0.78)
  );

  let hudFlickerOpacity = 1.0;
  if (empActive) {
    const wave = Math.sin(simTime * 37) * Math.cos(simTime * 19);
    hudFlickerOpacity = wave > 0.35 ? 0.58 : 0.92;
  } else if (sensorRatio < 0.35 || lowHullCritical) {
    const pulse = Math.sin(simTime * 17) * Math.sin(simTime * 7.3);
    hudFlickerOpacity = pulse > 0.52 ? 0.68 : 0.96;
  }

  const disabledSubsystems: DamageResponsiveHudState['disabledSubsystems'] = [];
  if (c.leftLegs / Math.max(1, c.maxLeftLegs) <= 0.12) disabledSubsystems.push('L-LEG');
  if (c.rightLegs / Math.max(1, c.maxRightLegs) <= 0.12) disabledSubsystems.push('R-LEG');
  if (c.engine / Math.max(1, c.maxEngine) <= 0.12) disabledSubsystems.push('ENG');
  if (sensorRatio <= 0.12) disabledSubsystems.push('SNS');
  if (c.weapons / Math.max(1, c.maxWeapons) <= 0.12) disabledSubsystems.push('WPN');

  return {
    hullRatio,
    armorRatio,
    sensorRatio,
    sensorsDamaged,
    empActive,
    radarDegraded,
    rangefinderLost,
    lowHullCritical,
    heatWarning,
    hudFlickerOpacity,
    disabledSubsystems,
  };
}

export function computeRadarBlips(
  hud: HudSnapshot,
  radarWorldRange = 1400
): CircularRadarBlip[] {
  const blips: CircularRadarBlip[] = [];
  for (let i = 0; i < hud.minimapEntities.length; i++) {
    const ent = hud.minimapEntities[i];
    if (ent.team === 'player') continue;
    if ((ent.team === 'enemy' || ent.team === 'boss') && !ent.detected) continue;

    const dx = (ent.x - hud.playerX) / radarWorldRange;
    const dy = (ent.y - hud.playerY) / radarWorldRange;
    const dist = Math.hypot(dx, dy);
    const clampedEdge = dist > 0.92;
    const scale = clampedEdge ? 0.92 / dist : 1;

    blips.push({
      nx: dx * scale,
      ny: dy * scale,
      team: ent.team,
      clampedEdge,
    });
  }
  return blips;
}

export function computeOffscreenThreats(
  camX: number,
  camY: number,
  zoom: number,
  viewW: number,
  viewH: number,
  playerPos: Vec2,
  enemies: MechActor[],
  boss: ThunderheadBoss | null,
  empActive: boolean
): OffscreenThreatIndicator[] {
  if (empActive || viewW <= 0 || viewH <= 0) return [];
  const halfW = (viewW * 0.5) / Math.max(0.25, zoom);
  const halfH = (viewH * 0.5) / Math.max(0.25, zoom);
  const padX = Math.max(22, Math.min(44, viewW * 0.032));
  const padY = Math.max(22, Math.min(44, viewH * 0.042));
  const grapplerCandidates: OffscreenThreatIndicator[] = [];
  const standardCandidates: OffscreenThreatIndicator[] = [];

  const projectTarget = (
    id: string,
    wx: number,
    wy: number,
    kind: OffscreenThreatIndicator['kind'],
    urgent = false
  ): OffscreenThreatIndicator | null => {
    const dxCam = wx - camX;
    const dyCam = wy - camY;
    if (Math.abs(dxCam) <= halfW * 0.96 && Math.abs(dyCam) <= halfH * 0.96) return null;

    const sxCenter = viewW * 0.5;
    const syCenter = viewH * 0.5;
    const rawSx = sxCenter + dxCam * zoom;
    const rawSy = syCenter + dyCam * zoom;
    const vx = rawSx - sxCenter;
    const vy = rawSy - syCenter;
    const maxRx = Math.max(20, sxCenter - padX);
    const maxRy = Math.max(20, syCenter - padY);
    const tx = Math.abs(vx) > 0.001 ? maxRx / Math.abs(vx) : 9999;
    const ty = Math.abs(vy) > 0.001 ? maxRy / Math.abs(vy) : 9999;
    const scale = Math.min(1, tx, ty);

    return {
      id,
      screenX: Math.max(padX, Math.min(viewW - padX, sxCenter + vx * scale)),
      screenY: Math.max(padY, Math.min(viewH - padY, syCenter + vy * scale)),
      angle: Math.atan2(vy, vx),
      distMeters: Math.round(Math.hypot(wx - playerPos.x, wy - playerPos.y) * 0.1),
      kind,
      urgent,
    };
  };

  if (boss && (boss.alive || boss.destroying)) {
    const bInd = projectTarget('boss', boss.phys.pos.x, boss.phys.pos.y, 'boss', true);
    if (bInd) standardCandidates.push(bInd);
  }

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    if (e.enemyArchetype === 'grappler') {
      const urgent =
        e.grapplerState?.huntPhase === 'dive' ||
        e.grapplerState?.mode === 'swinging' ||
        e.grapplerState?.mode === 'air_launch';
      const gInd = projectTarget(e.id, e.phys.pos.x, e.phys.pos.y, 'grappler', Boolean(urgent));
      if (gInd) grapplerCandidates.push(gInd);
      continue;
    }
    if (!e.detected) continue;
    const isAir = (e.flight?.altitude ?? 0) > 12;
    const sInd = projectTarget(e.id, e.phys.pos.x, e.phys.pos.y, isAir ? 'airborne' : 'enemy');
    if (sInd) standardCandidates.push(sInd);
  }

  // Cluster tightly overlapping Grappler edge bearings (< 0.14 rad) into clean count badges to prevent clutter
  grapplerCandidates.sort((a, b) => a.distMeters - b.distMeters);
  const clusteredGrapplers: OffscreenThreatIndicator[] = [];
  for (let i = 0; i < grapplerCandidates.length; i++) {
    const g = grapplerCandidates[i];
    let merged = false;
    for (let j = 0; j < clusteredGrapplers.length; j++) {
      const existing = clusteredGrapplers[j];
      let dAng = Math.abs(g.angle - existing.angle);
      if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
      if (dAng < 0.14) {
        existing.count = (existing.count ?? 1) + 1;
        existing.urgent = Boolean(existing.urgent || g.urgent);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusteredGrapplers.push({ ...g, count: 1 });
    }
  }

  standardCandidates.sort((a, b) => {
    if (a.kind === 'boss' && b.kind !== 'boss') return -1;
    if (b.kind === 'boss' && a.kind !== 'boss') return 1;
    return a.distMeters - b.distMeters;
  });

  // Always show incoming Grappler vectors + Boss + nearest standard threats
  const maxStandard = Math.max(2, 7 - Math.min(3, clusteredGrapplers.length));
  return [...clusteredGrapplers, ...standardCandidates.slice(0, maxStandard)];
}
