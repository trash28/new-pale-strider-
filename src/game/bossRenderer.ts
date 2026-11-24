import { BossLeg } from './bossLegs';
import {
  BossDeployable,
  DefendStructureState,
  HazardZone,
  IncomingArtilleryWarning,
  WARHEAD_COLORS,
} from './bossTypes';
import { ThunderheadBoss } from './thunderheadBoss';

function drawBossLeg(ctx: CanvasRenderingContext2D, leg: BossLeg, boss: ThunderheadBoss): void {
  const hip = leg.hipPos;
  const knee = leg.kneePos;
  const foot = leg.footPos;
  const visualFootX = foot.x;
  const visualFootY = foot.y - leg.liftZ;

  ctx.save();
  // Ground shadow under massive hydraulic leg
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.44)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(hip.x + 8, hip.y + 12);
  ctx.lineTo(knee.x + 10, knee.y + 18 + leg.liftZ * 0.5);
  ctx.lineTo(foot.x + 6, foot.y + 7);
  ctx.stroke();

  // Upper armored femur
  ctx.lineWidth = 12.5;
  ctx.strokeStyle = '#0c0f14';
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();

  ctx.lineWidth = 9.5;
  ctx.strokeStyle = leg.destroyed ? '#3a2222' : boss.spec.secondaryColor;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();

  // Hydraulic actuator cylinder
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = leg.destroyed ? '#ef4444' : leg.damageRatio < 0.5 ? '#f97316' : '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(hip.x * 0.78 + knee.x * 0.22, hip.y * 0.78 + knee.y * 0.22);
  ctx.lineTo(hip.x * 0.25 + knee.x * 0.75, hip.y * 0.25 + knee.y * 0.75);
  ctx.stroke();

  // Lower heavy tibia strut
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#090b0f';
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(visualFootX, visualFootY);
  ctx.stroke();

  ctx.lineWidth = 7;
  ctx.strokeStyle = leg.destroyed ? '#2c1d1d' : boss.spec.primaryColor;
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(visualFootX, visualFootY);
  ctx.stroke();

  // Knee armor housing
  ctx.fillStyle = '#141820';
  ctx.strokeStyle = leg.destroyed ? '#ef4444' : boss.spec.accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wide heavy stabilizer foot pad
  ctx.fillStyle = leg.isSwinging ? '#94a3b8' : '#1b2029';
  ctx.strokeStyle = leg.isSwinging ? boss.spec.accentColor : '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(visualFootX, visualFootY, 7.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawThunderheadBoss(ctx: CanvasRenderingContext2D, boss: ThunderheadBoss, time: number): void {
  if (!boss.alive && !boss.destroying) return;

  const alpha = boss.destroying ? Math.max(0.25, 1 - (boss.destroyTimer / boss.destroyDuration) * 0.55) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Spatial Teleportation Pre-Warp Distortion Telegraph Rings
  if (boss.teleportPhase === 'telegraphing' && !boss.destroying) {
    const prog = 1 - Math.max(0, boss.teleportTelegraphTimer) / Math.max(0.1, boss.teleportTelegraphTotal);
    const warpCol = boss.spec.teleport.warpColor;
    ctx.save();
    ctx.translate(boss.phys.pos.x, boss.phys.pos.y);
    ctx.strokeStyle = warpCol;
    ctx.lineWidth = 2.5 + prog * 2;
    ctx.globalAlpha = 0.45 + prog * 0.5;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, boss.spec.radius * (1.35 - prog * 0.45), time * 6, time * 6 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.3 + prog * 0.45;
    ctx.beginPath();
    ctx.arc(0, 0, boss.spec.radius * (0.6 + prog * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const backLegs: BossLeg[] = [];
  const frontLegs: BossLeg[] = [];
  for (let i = 0; i < boss.legs.legs.length; i++) {
    const leg = boss.legs.legs[i];
    if (leg.hipPos.y < boss.phys.pos.y - 2) backLegs.push(leg);
    else frontLegs.push(leg);
  }

  for (let i = 0; i < backLegs.length; i++) {
    drawBossLeg(ctx, backLegs[i], boss);
  }

  const sink = boss.legs.bodyBounce;
  const bx = boss.phys.pos.x + (boss.legs.bodyTiltY + boss.phys.tiltY) * 10;
  const by = boss.phys.pos.y - boss.phys.bounceZ + sink - (boss.legs.bodyTiltX + boss.phys.tiltX) * 10;
  const r = boss.spec.radius;

  // Massive ground shadow beneath chassis
  ctx.save();
  ctx.translate(boss.phys.pos.x + 14, boss.phys.pos.y + 18);
  ctx.rotate(boss.phys.bodyAngle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.24, r * 0.94, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Main Colossal Armored Hull (Variant-specific silhouette!)
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(boss.phys.bodyAngle);

  const primaryCol = boss.hitFlashTimer > 0 ? '#f8fafc' : boss.spec.primaryColor;
  const secCol = boss.hitFlashTimer > 0 ? '#cbd5e1' : boss.spec.secondaryColor;
  const sil = boss.spec.silhouette;

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#090b10';
  ctx.fillStyle = primaryCol;

  if (sil === 'fortress') {
    // Wide Hexagonal Siege Bunker Chassis with sloped frontal glacis
    ctx.beginPath();
    ctx.moveTo(r * 1.05, -r * 0.58);
    ctx.lineTo(r * 1.18, 0);
    ctx.lineTo(r * 1.05, r * 0.58);
    ctx.lineTo(-r * 0.4, r * 1.02);
    ctx.lineTo(-r * 1.05, r * 0.72);
    ctx.lineTo(-r * 1.05, -r * 0.72);
    ctx.lineTo(-r * 0.4, -r * 1.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Heavy Frontal Directional Armor Shield Plates (extend outward during bracing / Iron Judgment!)
    const shutterExt = boss.hatchOpenAmount * 14 + (boss.posture === 'artillery_deploy' ? 6 : 0);
    ctx.fillStyle = '#525849';
    ctx.fillRect(r * 0.58 + shutterExt * 0.45, -r * 0.66 - shutterExt * 0.4, r * 0.45, r * 0.62);
    ctx.strokeRect(r * 0.58 + shutterExt * 0.45, -r * 0.66 - shutterExt * 0.4, r * 0.45, r * 0.62);
    ctx.fillRect(r * 0.58 + shutterExt * 0.45, r * 0.04 + shutterExt * 0.4, r * 0.45, r * 0.62);
    ctx.strokeRect(r * 0.58 + shutterExt * 0.45, r * 0.04 + shutterExt * 0.4, r * 0.45, r * 0.62);
  } else if (sil === 'cataclysm') {
    // Gargantuan Twin-Pylon Dreadnought Hull
    ctx.beginPath();
    ctx.roundRect(-r * 1.16, -r * 0.88, r * 2.28, r * 1.76, 12);
    ctx.fill();
    ctx.stroke();

    // Twin Flanking Artillery Support Pylons
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 0.75, -r * 1.04, r * 1.48, r * 0.28);
    ctx.strokeRect(-r * 0.75, -r * 1.04, r * 1.48, r * 0.28);
    ctx.fillRect(-r * 0.75, r * 0.76, r * 1.48, r * 0.28);
    ctx.strokeRect(-r * 0.75, r * 0.76, r * 1.48, r * 0.28);
  } else if (sil === 'stormbringer') {
    // Trimmer Tapered Assault Artillery Platform
    ctx.beginPath();
    ctx.moveTo(r * 1.18, -r * 0.42);
    ctx.lineTo(r * 1.18, r * 0.42);
    ctx.lineTo(r * 0.25, r * 0.84);
    ctx.lineTo(-r * 1.08, r * 0.72);
    ctx.lineTo(-r * 1.16, 0);
    ctx.lineTo(-r * 1.08, -r * 0.72);
    ctx.lineTo(r * 0.25, -r * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (sil === 'blackout') {
    // Stealth-Faceted Obsidian Hull with Glowing Capacitor Pylons
    ctx.beginPath();
    ctx.moveTo(r * 1.22, 0);
    ctx.lineTo(r * 0.4, -r * 0.85);
    ctx.lineTo(-r * 0.85, -r * 0.85);
    ctx.lineTo(-r * 1.15, -r * 0.42);
    ctx.lineTo(-r * 1.15, r * 0.42);
    ctx.lineTo(-r * 0.85, r * 0.85);
    ctx.lineTo(r * 0.4, r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing EWAR Capacitor Pylons (cyan/violet)
    const pulse = 0.55 + 0.45 * Math.sin(time * 6);
    ctx.fillStyle = boss.components.powerCore.destroyed ? '#334155' : `rgba(103, 232, 249, ${pulse})`;
    ctx.fillRect(-r * 0.58, -r * 0.74, r * 0.72, 8);
    ctx.fillRect(-r * 0.58, r * 0.74 - 8, r * 0.72, 8);
  } else {
    // Siege Dreadnought Armored Slab
    ctx.beginPath();
    ctx.roundRect(-r * 1.1, -r * 0.82, r * 2.18, r * 1.64, 10);
    ctx.fill();
    ctx.stroke();
  }

  // High-Speed Turbine / Hydraulic Exhaust Plumes during rapid move / full pursuit / turn
  if (
    boss.posture === 'rapid_move' ||
    boss.posture === 'full_pursuit' ||
    boss.posture === 'high_speed_turn'
  ) {
    const jetLen = boss.posture === 'full_pursuit' ? 28 + Math.sin(time * 28) * 7 : 16 + Math.sin(time * 22) * 4;
    ctx.fillStyle = boss.spec.accentColor;
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, -r * 0.42);
    ctx.lineTo(-r * 1.05 - jetLen, -r * 0.34);
    ctx.lineTo(-r * 1.05, -r * 0.24);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, r * 0.24);
    ctx.lineTo(-r * 1.05 - jetLen, r * 0.34);
    ctx.lineTo(-r * 1.05, r * 0.42);
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  // Industrial Armored Panel Seams & Scratches
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-r * 0.92, -r * 0.64, r * 1.78, r * 1.28);

  // Hazard Warning Stripes on Side Sponsons
  ctx.fillStyle = 'rgba(245, 158, 11, 0.72)';
  for (let s = -2; s <= 2; s++) {
    ctx.fillRect(s * 18 - 4, -r * 0.81, 8, 6);
    ctx.fillRect(s * 18 - 4, r * 0.81 - 6, 8, 6);
  }

  // Lateral Ammunition Compartments (Port & Starboard) + Sliding Ultimate Ordnance Hatches!
  const ammoCol = boss.components.ammoBays.destroyed ? '#1a1111' : secCol;
  const hatchSlide = boss.hatchOpenAmount * 11;
  const ammoExposed =
    !boss.components.ammoBays.destroyed &&
    (boss.aiState === 'loading' || boss.aiState === 'warning' || boss.hatchOpenAmount > 0.16);
  if (boss.hatchOpenAmount > 0.05 || ammoExposed) {
    const bayGlow = WARHEAD_COLORS[boss.activeWarhead];
    ctx.fillStyle = bayGlow;
    ctx.globalAlpha = alpha * (0.45 + boss.hatchOpenAmount * 0.5);
    ctx.fillRect(-r * 0.34, -r * 0.74, r * 0.68, r * 0.24);
    ctx.fillRect(-r * 0.34, r * 0.50, r * 0.68, r * 0.24);
    ctx.globalAlpha = alpha;
  }
  ctx.fillStyle = ammoCol;
  ctx.strokeStyle = boss.components.ammoBays.destroyed ? '#ef4444' : ammoExposed ? '#fde047' : '#0b0e14';
  ctx.lineWidth = ammoExposed ? 2.6 : 2;
  ctx.fillRect(-r * 0.36, -r * 0.76 - hatchSlide, r * 0.72, r * 0.28);
  ctx.strokeRect(-r * 0.36, -r * 0.76 - hatchSlide, r * 0.72, r * 0.28);
  ctx.fillRect(-r * 0.36, r * 0.48 + hatchSlide, r * 0.72, r * 0.28);
  ctx.strokeRect(-r * 0.36, r * 0.48 + hatchSlide, r * 0.72, r * 0.28);

  // Rear Power & Control Core (Vulnerable Exposed Weak Point, extra glowing louvers when venting!)
  const coreBroken = boss.components.powerCore.destroyed;
  const coreExposed = boss.aiState === 'firing' || boss.aiState === 'reloading' || boss.ultimateActive;
  ctx.fillStyle = coreBroken ? '#1f1616' : '#111827';
  ctx.strokeStyle = coreBroken ? '#ef4444' : coreExposed ? '#fde047' : boss.spec.accentColor;
  ctx.lineWidth = coreExposed ? 2.8 : 2.2;
  ctx.fillRect(-r * 1.02, -r * 0.36, r * 0.34, r * 0.72);
  ctx.strokeRect(-r * 1.02, -r * 0.36, r * 0.34, r * 0.72);
  if (!coreBroken) {
    const coreGlow = 0.55 + 0.45 * Math.sin(time * (boss.phase >= 3 || coreExposed ? 12 : 5));
    ctx.fillStyle = sil === 'blackout' ? `rgba(168, 85, 247, ${coreGlow})` : `rgba(249, 115, 22, ${coreGlow})`;
    ctx.beginPath();
    ctx.arc(-r * 0.85, 0, r * (coreExposed ? 0.18 : 0.14), 0, Math.PI * 2);
    ctx.fill();
  }

  // Auxiliary Close-Defense Turrets / Missile Pods
  const auxDead = boss.components.auxWeapons.destroyed;
  ctx.fillStyle = auxDead ? '#291c1c' : secCol;
  ctx.strokeStyle = auxDead ? '#ef4444' : '#0b0e14';
  ctx.fillRect(r * 0.36, -r * 0.62, 20, 14);
  ctx.strokeRect(r * 0.36, -r * 0.62, 20, 14);
  ctx.fillRect(r * 0.36, r * 0.62 - 14, 20, 14);
  ctx.strokeRect(r * 0.36, r * 0.62 - 14, 20, 14);

  // Rotating Dorsal Radar / Sensor Dish
  ctx.save();
  ctx.translate(-r * 0.38, 0);
  ctx.rotate(boss.radarAngle);
  ctx.fillStyle = boss.components.sensors.destroyed ? '#2c1e1e' : '#1e293b';
  ctx.strokeStyle = boss.components.sensors.destroyed ? '#ef4444' : boss.spec.accentColor;
  ctx.lineWidth = 2;
  const radarRad = sil === 'blackout' ? r * 0.32 : r * 0.22;
  ctx.beginPath();
  ctx.arc(0, 0, radarRad, -Math.PI * 0.65, Math.PI * 0.65);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Industrial Flashing Warning Lights (brighter in Phase 3/4 or during firing warning/ultimate!)
  const blink =
    boss.aiState === 'warning' || boss.ultimateActive || boss.phase >= 3 || boss.destroying
      ? Math.sin(time * 14) > 0
      : Math.sin(time * 4) > 0.3;
  if (blink) {
    ctx.fillStyle =
      boss.aiState === 'warning' || boss.ultimateActive || boss.destroying
        ? '#ef4444'
        : boss.spec.warningColor;
    ctx.beginPath();
    ctx.arc(r * 0.72, -r * 0.56, 4.5, 0, Math.PI * 2);
    ctx.arc(r * 0.72, r * 0.56, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Front legs socketed onto lower flank
  for (let i = 0; i < frontLegs.length; i++) {
    drawBossLeg(ctx, frontLegs[i], boss);
  }

  // Colossal Rotating Mortar Turret + Elevating Artillery Barrel + Shell Loading Gantry
  ctx.save();
  ctx.translate(bx, by - 8);
  ctx.rotate(boss.turretAngle);

  const mortarDead = boss.components.mortar.destroyed;
  const recoil = boss.phys.recoilOffset;
  const pitchFactor = 1 - boss.barrelPitch * 0.38; // barrel visually foreshortens as it elevates high!
  const barrelLen = r * 1.15 * pitchFactor;
  const barrelWidth = boss.spec.id === 'cataclysm' ? 28 : 22;

  // Ultimate Charge Aura Ring around dorsal turret
  if (boss.chargeGlow > 0.08) {
    ctx.strokeStyle = WARHEAD_COLORS[boss.activeWarhead];
    ctx.lineWidth = 3;
    ctx.globalAlpha = alpha * boss.chargeGlow * (0.55 + 0.45 * Math.sin(time * 18));
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52 + boss.chargeGlow * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  // Turret Ring Base
  ctx.fillStyle = secCol;
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Visible Shell Loading Crane Gantry (swings shell into breech during 'loading'!)
  if (boss.aiState === 'loading' || boss.loaderProgress > 0.05) {
    const swingY = -r * 0.48 * (1 - boss.loaderProgress);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, -r * 0.48);
    ctx.lineTo(-10, swingY);
    ctx.stroke();
    // Massive glowing nuclear mortar shell being loaded
    ctx.fillStyle = WARHEAD_COLORS[boss.activeWarhead];
    ctx.fillRect(-16, swingY - 5, 18, 10);
  }

  // Colossal Elevating Nuclear Mortar Barrel
  ctx.fillStyle = mortarDead ? '#2d2020' : '#181d25';
  ctx.strokeStyle = mortarDead ? '#ef4444' : '#090b10';
  ctx.lineWidth = 2.5;
  ctx.fillRect(6 - recoil, -barrelWidth * 0.5, barrelLen, barrelWidth);
  ctx.strokeRect(6 - recoil, -barrelWidth * 0.5, barrelLen, barrelWidth);

  // Heavy muzzle brake collar & glowing breech warning vents during warning/firing/ultimate
  ctx.fillStyle = secCol;
  ctx.fillRect(barrelLen - 10 - recoil, -barrelWidth * 0.62, 16, barrelWidth * 1.24);
  ctx.strokeRect(barrelLen - 10 - recoil, -barrelWidth * 0.62, 16, barrelWidth * 1.24);

  if (!mortarDead && (boss.aiState === 'warning' || boss.aiState === 'loading' || boss.chargeGlow > 0.1)) {
    ctx.fillStyle = WARHEAD_COLORS[boss.activeWarhead];
    ctx.globalAlpha = alpha * Math.max(boss.chargeGlow, 0.55 + 0.45 * Math.sin(time * 16));
    ctx.fillRect(10 - recoil, -4, barrelLen * 0.55, 8);
    ctx.globalAlpha = alpha;
  }

  // Turret armored cap
  ctx.fillStyle = primaryCol;
  ctx.beginPath();
  ctx.arc(-4, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Sensor optic slit
  ctx.fillStyle = mortarDead ? '#475569' : boss.spec.warningColor;
  ctx.fillRect(r * 0.14, -6, 9, 12);

  ctx.restore();

  // Dorsal Point-Defense CIWS Turret (rotates independently against incoming player/ally missiles)
  if (boss.antiAir && boss.alive && !boss.destroying) {
    const aa = boss.antiAir;
    const aaRecoil = aa.recoil * 4.5;
    const subRatio = boss.getAntiAirSubsystemHealth();
    ctx.save();
    ctx.translate(bx, by - 14);
    ctx.rotate(aa.turretAngle);

    if (aa.trackingCount > 0 && !aa.overheated) {
      ctx.fillStyle = 'rgba(251, 113, 133, 0.16)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 1.15, -0.24, 0.24);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = aa.overheated ? '#7f1d1d' : subRatio < 0.45 ? '#332224' : '#181d25';
    ctx.strokeStyle = aa.overheated ? '#ef4444' : '#090b10';
    ctx.lineWidth = 1.6;
    // Twin CIWS barrels
    ctx.fillRect(4 - aaRecoil, -5.5, 18, 3.2);
    ctx.fillRect(4 - aaRecoil, 2.3, 18, 3.2);
    // Turret cupola & radar dish
    ctx.fillStyle = secCol;
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (aa.overheated || aa.getHeatRatio() > 0.6) {
      ctx.fillStyle = aa.overheated ? '#ef4444' : '#fb923c';
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (aa.muzzleFlashTimer > 0) {
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(23 - aaRecoil, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

export function drawHazardZones(ctx: CanvasRenderingContext2D, hazards: HazardZone[], time: number): void {
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    const fade = Math.min(1, h.life / 2.2);
    const pulse = 0.85 + 0.15 * Math.sin(time * (h.kind === 'fire' ? 11 : 4) + i);

    ctx.save();
    const grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.radius);
    if (h.kind === 'radiation') {
      grad.addColorStop(0, `rgba(132, 204, 22, ${0.28 * fade * pulse})`);
      grad.addColorStop(0.65, `rgba(74, 222, 128, ${0.14 * fade})`);
      grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
    } else {
      grad.addColorStop(0, `rgba(249, 115, 22, ${0.38 * fade * pulse})`);
      grad.addColorStop(0.65, `rgba(220, 38, 38, ${0.2 * fade})`);
      grad.addColorStop(1, 'rgba(185, 28, 28, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle =
      h.kind === 'radiation'
        ? `rgba(163, 230, 53, ${0.52 * fade})`
        : `rgba(251, 146, 60, ${0.6 * fade})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawIncomingArtilleryWarnings(
  ctx: CanvasRenderingContext2D,
  warnings: IncomingArtilleryWarning[],
  time: number
): void {
  for (let i = 0; i < warnings.length; i++) {
    const w = warnings[i];
    const progress = 1 - Math.max(0, w.remaining) / Math.max(0.1, w.total);
    const col = WARHEAD_COLORS[w.warheadType];
    const flash = 0.55 + 0.45 * Math.sin(time * 16);

    ctx.save();
    // Danger radius fill
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.08 + progress * 0.14;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
    ctx.fill();

    // Outer dashed boundary
    ctx.globalAlpha = 0.85 * flash;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Contracting countdown ring
    ctx.setLineDash([]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(w.x, w.y, Math.max(10, w.radius * (1 - progress)), 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair & countdown text
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`INCOMING ${w.warheadType.replace('_', ' ').toUpperCase()} · ${w.remaining.toFixed(1)}s`, w.x, w.y - 6);
    ctx.restore();
  }
}

export function drawBossDeployables(ctx: CanvasRenderingContext2D, deployables: BossDeployable[], time: number): void {
  for (let i = 0; i < deployables.length; i++) {
    const d = deployables[i];
    ctx.save();
    ctx.translate(d.x, d.y);

    if (d.kind === 'turret') {
      // Autonomous Armored Gun Turret
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(4, 6, d.radius + 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = d.hitFlashTimer > 0 ? '#ffffff' : '#334155';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(d.aimAngle);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, -4, d.radius + 14, 8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(4, -2, 5, 4);
    } else {
      // Electronic Radar Decoy Beacon
      const pulse = 0.5 + 0.5 * Math.sin(time * 9 + i);
      ctx.strokeStyle = `rgba(103, 232, 249, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, d.radius + pulse * 14, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = d.hitFlashTimer > 0 ? '#ffffff' : '#1e1b4b';
      ctx.beginPath();
      ctx.arc(0, 0, d.radius * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawDefendStructure(ctx: CanvasRenderingContext2D, def: DefendStructureState): void {
  ctx.save();
  ctx.translate(def.x, def.y);

  // Defense Bastion Perimeter Ring
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.fillStyle = 'rgba(14, 165, 233, 0.08)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([12, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, def.radius + 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // Heavy Concrete Command Relay Citadel
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, def.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-26, -26, 52, 52);
  ctx.strokeStyle = '#0ea5e9';
  ctx.strokeRect(-26, -26, 52, 52);

  // World HP bar above relay
  const ratio = Math.max(0, def.hp / Math.max(1, def.maxHp));
  ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
  ctx.fillRect(-46, -def.radius - 20, 92, 8);
  ctx.fillStyle = ratio < 0.35 ? '#ef4444' : '#38bdf8';
  ctx.fillRect(-45, -def.radius - 19, 90 * ratio, 6);
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#bae6fd';
  ctx.fillText(def.label, 0, -def.radius - 26);

  ctx.restore();
}
