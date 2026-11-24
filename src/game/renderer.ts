import { getAegisVisualProfile, isAegisArmorActive } from './aegisArmor';
import { AntiAirTracer } from './antiAirWeapon';
import {
  drawBossDeployables,
  drawDefendStructure,
  drawHazardZones,
  drawIncomingArtilleryWarnings,
  drawThunderheadBoss,
} from './bossRenderer';
import {
  BossDeployable,
  DefendStructureState,
  HazardZone,
  IncomingArtilleryWarning,
  WARHEAD_COLORS,
} from './bossTypes';
import { Camera } from './camera';
import { DashAfterimage } from './dashSystem';
import { renderFirstPersonTakedown } from './firstPersonRenderer';
import { GrappleController } from './grappleSystem';
import { computeOffscreenThreats } from './hudController';
import { MechActor } from './mech';
import { getMissileProfile } from './missileTypes';
import { ParticleSystem } from './particles';
import { ProceduralLeg } from './proceduralLegs';
import { MORTAR_AMMO_SPECS, MortarTargetingSolution, SmokeCloud } from './mortarSystem';
import { TakedownSession } from './takedownSystem';
import { ThunderheadBoss } from './thunderheadBoss';
import {
  drawFriendlyDeployables,
  drawProteusMorphChassisLayer,
  drawProteusMorphSpecialAura,
  drawProteusMorphTurretLayer,
} from './proteusMorphRenderer';
import { drawProteusBaseChassis, drawTransformingMech } from './transformRenderer';
import { FriendlyDeployable, MapDefinition, Obstacle, TerrainType, Vec2 } from './types';
import { ProjectilePool } from './weapons';

const TERRAIN_COLORS: Record<TerrainType, string> = {
  concrete: '#282d34',
  mud: '#352b22',
  sand: '#62523a',
  rocky: '#3d3c3a',
  water: '#1e3547',
  slope_n: '#2d332d',
  slope_s: '#2d332d',
  slope_e: '#2d332d',
  slope_w: '#2d332d',
};

function drawLeg(ctx: CanvasRenderingContext2D, leg: ProceduralLeg, mech: MechActor, altitude = 0): void {
  const elev = altitude * 0.52;
  const hip = { x: leg.hipPos.x, y: leg.hipPos.y - elev };
  const knee = { x: leg.kneePos.x, y: leg.kneePos.y - elev };
  const foot = { x: leg.footPos.x, y: leg.footPos.y - elev };
  const isHeavy = mech.spec.footstepWeight > 0.75;
  const isGrappler = mech.enemyArchetype === 'grappler';
  const femurW = isHeavy ? 6.5 : isGrappler ? 2.5 : 4.2;
  const tibiaW = isHeavy ? 4.8 : isGrappler ? 1.9 : 3.0;
  const kneeR = isHeavy ? 4.8 : isGrappler ? 2.2 : 3.6;
  const footR = isHeavy ? 4.2 : isGrappler ? 1.8 : 3.0;

  // Ground shadow under leg (only drawn when near ground; airborne actors use projected hull shadow)
  ctx.save();
  if (altitude < 18) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.35 * (1 - altitude / 18)})`;
    ctx.lineCap = 'round';
    ctx.lineWidth = femurW + 2;
    ctx.beginPath();
    ctx.moveTo(hip.x + 4, hip.y + 8 + elev);
    ctx.lineTo(knee.x + 5, knee.y + 12 + leg.liftZ * 0.5 + elev);
    ctx.lineTo(foot.x + 3, foot.y + 4 + elev);
    ctx.stroke();
  }

  // Foot pad on ground (shifted slightly up visually when swinging!)
  const visualFootX = foot.x;
  const visualFootY = foot.y - leg.liftZ;

  // Femur (hip -> knee)
  ctx.lineWidth = femurW + (isGrappler ? 1.2 : 2);
  ctx.strokeStyle = '#11151b';
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();

  ctx.lineWidth = femurW;
  ctx.strokeStyle = leg.destroyed ? '#332626' : mech.paint.secondary;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();

  // Hydraulic piston highlight on femur
  ctx.lineWidth = isGrappler ? 0.9 : 1.4;
  ctx.strokeStyle = leg.damageRatio < 0.5 ? '#ef4444' : '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(hip.x * 0.8 + knee.x * 0.2, hip.y * 0.8 + knee.y * 0.2);
  ctx.lineTo(hip.x * 0.3 + knee.x * 0.7, hip.y * 0.3 + knee.y * 0.7);
  ctx.stroke();

  // Tibia (knee -> visualFoot)
  ctx.lineWidth = tibiaW + (isGrappler ? 1.1 : 2);
  ctx.strokeStyle = '#0d1015';
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(visualFootX, visualFootY);
  ctx.stroke();

  ctx.lineWidth = tibiaW;
  ctx.strokeStyle = leg.destroyed ? '#2d2222' : mech.paint.primary;
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(visualFootX, visualFootY);
  ctx.stroke();

  // Articulated knee joint housing
  ctx.fillStyle = '#181d25';
  ctx.strokeStyle = leg.damageRatio < 0.4 ? '#ef4444' : mech.paint.accent;
  ctx.lineWidth = isGrappler ? 1.0 : 1.4;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, kneeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Foot claw / pad
  ctx.fillStyle = leg.isSwinging ? '#cbd5e1' : '#1f2630';
  ctx.beginPath();
  ctx.arc(visualFootX, visualFootY, footR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = leg.isSwinging ? mech.paint.accent : '#475569';
  ctx.lineWidth = isGrappler ? 0.9 : 1.2;
  ctx.stroke();
  ctx.restore();
}

export function drawMechActor(
  ctx: CanvasRenderingContext2D,
  mech: MechActor,
  isPreview = false,
  vfx?: { rocketExhaustVfx?: boolean; flightVfx?: boolean; time?: number }
): void {
  const isDowned = !mech.alive && Boolean(mech.downed);
  if (!mech.alive && !isDowned && mech.koTimer <= 0) return;

  // Multi-stage mechanical transformation animation choreography (TX-10 Proteus)
  if (mech.alive && mech.transform?.active) {
    drawTransformingMech(ctx, mech, mech.transform.pose, vfx?.time ?? 0, isPreview, drawLeg);
    return;
  }

  // Spatial teleportation displacement rift (origin -> destination distortion ribbon)
  if (
    mech.alive &&
    mech.dash?.teleportVisualTimer &&
    mech.dash.teleportVisualTimer > 0 &&
    mech.dash.teleportOrigin &&
    mech.dash.teleportDest
  ) {
    const tRatio = Math.min(1, mech.dash.teleportVisualTimer / 0.36);
    ctx.save();
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.75 * tRatio})`;
    ctx.lineWidth = 4 * tRatio + 1;
    ctx.beginPath();
    ctx.moveTo(mech.dash.teleportOrigin.x, mech.dash.teleportOrigin.y);
    ctx.lineTo(mech.dash.teleportDest.x, mech.dash.teleportDest.y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(224, 242, 254, ${0.9 * tRatio})`;
    ctx.lineWidth = 1.6 * tRatio;
    ctx.beginPath();
    ctx.moveTo(mech.dash.teleportOrigin.x, mech.dash.teleportOrigin.y);
    ctx.lineTo(mech.dash.teleportDest.x, mech.dash.teleportDest.y);
    ctx.stroke();
    ctx.restore();
  }

  // Cloaked enemies become near-invisible unless detected/revealed; friendly cloaked units stay legible as translucent holograms
  const stealthAlpha = mech.stealth?.supported ? mech.stealth.cloakAlpha : 1.0;
  const hiddenEnemyCloaked =
    !isPreview &&
    mech.team === 'enemy' &&
    Boolean(mech.stealth?.active) &&
    !mech.detected &&
    (mech.stealth?.revealedTimer ?? 0) <= 0;

  // Brief phase-dissolve transparency right as teleport dash activates
  const teleportPhaseAlpha =
    mech.alive && mech.dash?.spec.teleportMode && mech.dash.activeTimer > mech.dash.spec.duration * 0.65
      ? 0.42
      : 1;
  const alpha = isDowned
    ? 0.58
    : mech.alive
    ? Math.min(teleportPhaseAlpha, stealthAlpha)
    : Math.max(0, mech.koTimer / 0.45);
  const koSink = isDowned ? 5 : mech.alive ? 0 : (1 - Math.max(0.1, alpha)) * 8;
  const altitude =
    mech.enemyArchetype === 'grappler'
      ? mech.grapplerState?.altitude ?? 0
      : mech.flight?.altitude ?? 0;
  const elev = altitude * 0.52;

  ctx.save();
  ctx.globalAlpha = hiddenEnemyCloaked ? Math.min(0.12, alpha) : alpha;

  // 0. Draw altitude-offset ground shadow & aerial projection reticle FIRST
  const shadowScale = Math.max(0.54, 1 - altitude / 280);
  const shadowAlpha = Math.max(0.18, 0.44 - altitude / 420);
  const sx = mech.phys.pos.x + 6 + altitude * 0.22;
  const sy = mech.phys.pos.y + 10 + altitude * 0.34;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(mech.phys.bodyAngle);
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, mech.spec.radius * 1.15 * shadowScale, mech.spec.radius * 0.88 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (altitude > 8 && mech.alive) {
    // Subtle tactical ground footprint marker & vertical elevation tether so airborne position is unmistakable
    ctx.save();
    ctx.strokeStyle = mech.team === 'player' ? 'rgba(56, 189, 248, 0.28)' : 'rgba(244, 63, 94, 0.32)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mech.phys.pos.x, mech.phys.pos.y);
    ctx.lineTo(mech.phys.pos.x, mech.phys.pos.y - elev);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(mech.phys.pos.x, mech.phys.pos.y, mech.spec.radius * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 0b. Active Raptis-05 Grappler ODM tether line, tension highlight & latched grappling claw
  if (
    mech.alive &&
    mech.enemyArchetype === 'grappler' &&
    mech.grapplerState &&
    (mech.grapplerState.mode === 'hook_deploy' ||
      mech.grapplerState.mode === 'swinging' ||
      mech.grapplerState.mode === 'clinging')
  ) {
    const gs = mech.grapplerState;
    const gx = mech.phys.pos.x;
    const gy = mech.phys.pos.y - elev;
    const tx = gs.hookTip.x;
    const ty = gs.hookTip.y - (gs.mode === 'clinging' ? elev * 0.65 : 18);
    ctx.save();
    ctx.strokeStyle = '#090d12';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = gs.mode === 'clinging' ? '#fb7185' : gs.tension > 0.68 ? '#fde047' : '#f43f5e';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = gs.mode === 'clinging' ? '#f43f5e' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(tx, ty, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Separate legs into back layer (above chassis center Y) and front layer (below chassis center Y)
  const backLegs: ProceduralLeg[] = [];
  const frontLegs: ProceduralLeg[] = [];
  for (let i = 0; i < mech.legs.legs.length; i++) {
    const leg = mech.legs.legs[i];
    if (leg.hipPos.y < mech.phys.pos.y - 1) {
      backLegs.push(leg);
    } else {
      frontLegs.push(leg);
    }
  }

  // 1. Draw back legs behind chassis
  for (let i = 0; i < backLegs.length; i++) {
    drawLeg(ctx, backLegs[i], mech, altitude);
  }

  const bodyX = mech.phys.pos.x;
  const bodyY = mech.phys.pos.y - mech.phys.bounceZ - elev + koSink;

  // 3. Draw main armored chassis hull (with suspension tilt squash/shift)
  ctx.save();
  ctx.translate(bodyX + mech.phys.tiltY * 8, bodyY - mech.phys.tiltX * 8);
  ctx.rotate(mech.phys.bodyAngle);

  const r = mech.spec.radius;
  const sil = mech.spec.silhouette;
  const isRev = Boolean(mech.isRevenant);
  const primaryCol = mech.hitFlashTimer > 0 ? '#ffffff' : isRev ? '#f4f6fb' : mech.paint.primary;
  const secCol = mech.hitFlashTimer > 0 ? '#e2e8f0' : isRev ? '#4c1d95' : mech.paint.secondary;

  if (isRev) {
    const pulse = 0.72 + Math.sin((vfx?.time ?? 0) * 7.5) * 0.28;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 14 + pulse * 10;
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = '#c084fc';
  } else {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0c0f14';
  }
  ctx.fillStyle = primaryCol;

  if (sil === 'wedge') {
    // Sleek scout wedge
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(-r * 0.6, -r * 0.85);
    ctx.lineTo(-r * 1.05, -r * 0.45);
    ctx.lineTo(-r * 1.05, r * 0.45);
    ctx.lineTo(-r * 0.6, r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (sil === 'juggernaut') {
    // Heavy octagonal armored block
    ctx.beginPath();
    ctx.moveTo(r * 1.05, -r * 0.55);
    ctx.lineTo(r * 1.05, r * 0.55);
    ctx.lineTo(r * 0.45, r * 0.95);
    ctx.lineTo(-r * 0.95, r * 0.95);
    ctx.lineTo(-r * 1.15, r * 0.45);
    ctx.lineTo(-r * 1.15, -r * 0.45);
    ctx.lineTo(-r * 0.95, -r * 0.95);
    ctx.lineTo(r * 0.45, -r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Side reactive armor skirts
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 0.7, -r * 1.04, r * 1.3, 5);
    ctx.fillRect(-r * 0.7, r * 1.04 - 5, r * 1.3, 5);
  } else if (sil === 'sniper') {
    // Narrow elongated hull with rear recoil spades
    ctx.beginPath();
    ctx.moveTo(r * 1.25, -r * 0.35);
    ctx.lineTo(r * 1.25, r * 0.35);
    ctx.lineTo(-r * 1.2, r * 0.7);
    ctx.lineTo(-r * 1.35, 0);
    ctx.lineTo(-r * 1.2, -r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (sil === 'artillery') {
    // Wide armored hull with rear recoil stabilizer deck
    ctx.beginPath();
    ctx.roundRect(-r * 1.15, -r * 0.85, r * 2.2, r * 1.7, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 1.2, -r * 0.65, r * 0.45, r * 1.3);
  } else if (sil === 'colossus') {
    // M-09 Colossus: Heavy mobile siege crawler with outrigger stabilizer spades & rear ammo vault
    const bracedDeploy =
      mech.phys.bracingFactor > 0.35 ||
      mech.primary.isPreparing ||
      (mech.specialActiveTimer > 0 && mech.spec.specialAbility.kind === 'overwatch_barrage');
    const outriggerExt = bracedDeploy ? r * 0.52 : r * 0.14;

    // Hydraulic Stabilizer Outriggers (extend outward when anchoring for heavy mortar fire!)
    ctx.fillStyle = '#1f242c';
    ctx.strokeStyle = '#090b0f';
    ctx.lineWidth = 2;
    ctx.fillRect(-r * 1.05, -r * 0.85 - outriggerExt, r * 0.55, outriggerExt + 6);
    ctx.strokeRect(-r * 1.05, -r * 0.85 - outriggerExt, r * 0.55, outriggerExt + 6);
    ctx.fillRect(-r * 1.05, r * 0.85 - 6, r * 0.55, outriggerExt + 6);
    ctx.strokeRect(-r * 1.05, r * 0.85 - 6, r * 0.55, outriggerExt + 6);

    // Main Wide Siege Hull
    ctx.fillStyle = primaryCol;
    ctx.beginPath();
    ctx.moveTo(r * 1.12, -r * 0.65);
    ctx.lineTo(r * 1.24, -r * 0.25);
    ctx.lineTo(r * 1.24, r * 0.25);
    ctx.lineTo(r * 1.12, r * 0.65);
    ctx.lineTo(r * 0.15, r * 0.94);
    ctx.lineTo(-r * 1.16, r * 0.86);
    ctx.lineTo(-r * 1.26, 0);
    ctx.lineTo(-r * 1.16, -r * 0.86);
    ctx.lineTo(r * 0.15, -r * 0.94);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Industrial Side Skirts & Hazard Stripes
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 0.88, -r * 0.92, r * 1.55, 6);
    ctx.fillRect(-r * 0.88, r * 0.92 - 6, r * 1.55, 6);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.72)';
    ctx.fillRect(r * 0.48, -r * 0.92, 10, 5);
    ctx.fillRect(r * 0.48, r * 0.92 - 5, 10, 5);

    // Rear Ammunition Storage Vault (doors open slightly during Overwatch Barrage!)
    const bayOpen = mech.specialActiveTimer > 0 && mech.spec.specialAbility.kind === 'overwatch_barrage' ? 5 : 0;
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 1.14, -r * 0.6 - bayOpen, r * 0.52, r * 0.56);
    ctx.strokeRect(-r * 1.14, -r * 0.6 - bayOpen, r * 0.52, r * 0.56);
    ctx.fillRect(-r * 1.14, r * 0.04 + bayOpen, r * 0.52, r * 0.56);
    ctx.strokeRect(-r * 1.14, r * 0.04 + bayOpen, r * 0.52, r * 0.56);
  } else if (sil === 'valkyrie') {
    // A-12 Valkyrie: Forward-swept aerial rocket assault walker with twin thruster nacelles
    const arch = mech.enemyArchetype;
    // Winglet fins (wider on Sky-Breaker, dart-like on Interceptor)
    const wingSpan = arch === 'sky_breaker' ? 1.45 : arch === 'rocket_hunter' ? 1.32 : 1.24;
    ctx.fillStyle = secCol;
    ctx.beginPath();
    ctx.moveTo(r * 0.35, -r * 0.45);
    ctx.lineTo(-r * 0.45, -r * wingSpan);
    ctx.lineTo(-r * 1.05, -r * (wingSpan * 0.82));
    ctx.lineTo(-r * 0.8, -r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(r * 0.35, r * 0.45);
    ctx.lineTo(-r * 0.45, r * wingSpan);
    ctx.lineTo(-r * 1.05, r * (wingSpan * 0.82));
    ctx.lineTo(-r * 0.8, r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Central aerodynamic airframe hull
    ctx.fillStyle = primaryCol;
    ctx.beginPath();
    ctx.moveTo(r * 1.42, 0);
    ctx.lineTo(r * 0.48, -r * 0.62);
    ctx.lineTo(-r * 0.92, -r * 0.52);
    ctx.lineTo(-r * 1.12, -r * 0.2);
    ctx.lineTo(-r * 1.12, r * 0.2);
    ctx.lineTo(-r * 0.92, r * 0.52);
    ctx.lineTo(r * 0.48, r * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Twin rear vectored thruster nozzles
    ctx.fillStyle = '#111827';
    ctx.fillRect(-r * 1.18, -r * 0.56, r * 0.34, r * 0.3);
    ctx.strokeRect(-r * 1.18, -r * 0.56, r * 0.34, r * 0.3);
    ctx.fillRect(-r * 1.18, r * 0.26, r * 0.34, r * 0.3);
    ctx.strokeRect(-r * 1.18, r * 0.26, r * 0.34, r * 0.3);

    // Rocket exhaust flames when airborne or dashing
    const exhaustPow = Math.max(
      mech.flight?.exhaustPower ?? 0,
      mech.dash?.isDashing() ? 0.95 : 0,
      mech.phys.sprinting ? 0.55 : 0
    );
    if (exhaustPow > 0.06 && vfx?.rocketExhaustVfx !== false) {
      const flicker = 0.85 + Math.sin((vfx?.time ?? 0) * 42 + bodyX) * 0.15;
      const flameLen = (12 + exhaustPow * 26) * flicker;
      const isBoost = Boolean(mech.flight?.boosting || mech.dash?.isDashing() || mech.specialActiveTimer > 0);
      const outerCol = mech.team === 'enemy' ? 'rgba(249, 115, 22, 0.85)' : isBoost ? 'rgba(56, 189, 248, 0.92)' : 'rgba(251, 146, 60, 0.88)';
      const innerCol = isBoost && mech.team === 'player' ? '#e0f2fe' : '#fef3c7';
      for (const ny of [-r * 0.41, r * 0.41]) {
        ctx.fillStyle = outerCol;
        ctx.beginPath();
        ctx.moveTo(-r * 1.18, ny - 4.2);
        ctx.lineTo(-r * 1.18 - flameLen, ny);
        ctx.lineTo(-r * 1.18, ny + 4.2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = innerCol;
        ctx.beginPath();
        ctx.moveTo(-r * 1.18, ny - 2.1);
        ctx.lineTo(-r * 1.18 - flameLen * 0.58, ny);
        ctx.lineTo(-r * 1.18, ny + 2.1);
        ctx.closePath();
        ctx.fill();
      }
    }
  } else if (sil === 'proteus') {
    drawProteusBaseChassis(
      ctx,
      r,
      primaryCol,
      secCol,
      mech.paint.accent,
      vfx?.time ?? 0,
      Boolean(mech.dash?.isDashing())
    );
  } else if (mech.enemyArchetype === 'grappler') {
    // Raptis-05 Grappler: compact, lethal radius=10 arachnid/mantis parasite with gleaming scythe pincers & ODM thruster pods
    const gs = mech.grapplerState;
    const clawSpread = 0.22 + (gs?.clawOpenAmount ?? 0.35) * 0.56;
    const isClinging = gs?.mode === 'clinging';
    const isDiving = gs?.huntPhase === 'dive';
    const spd = Math.hypot(mech.phys.vel.x, mech.phys.vel.y);

    // High-speed ODM swing motion streaks behind chassis
    if (spd > 420 && !isPreview) {
      const streakLen = Math.min(26, (spd - 360) * 0.055);
      ctx.strokeStyle = isDiving ? 'rgba(244, 63, 94, 0.55)' : 'rgba(251, 113, 133, 0.38)';
      ctx.lineWidth = 1.4;
      for (const sy of [-r * 0.65, r * 0.65]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, sy);
        ctx.lineTo(-r * 0.85 - streakLen, sy);
        ctx.stroke();
      }
    }

    // Compact segmented armored carapace
    ctx.fillStyle = mech.hitFlashTimer > 0 ? '#ffffff' : primaryCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 1.24, 0);
    ctx.lineTo(r * 0.44, -r * 0.72);
    ctx.lineTo(-r * 0.58, -r * 0.82);
    ctx.lineTo(-r * 1.12, -r * 0.36);
    ctx.lineTo(-r * 1.12, r * 0.36);
    ctx.lineTo(-r * 0.58, r * 0.82);
    ctx.lineTo(r * 0.44, r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dorsal ridge plates
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 0.65, -r * 0.3, r * 1.08, r * 0.6);

    // Front mantis gripping mandibles (flare wide on screaming dive, clamp shut on host)
    ctx.strokeStyle = isClinging || isDiving ? '#fb7185' : '#e2e8f0';
    ctx.lineWidth = 1.75;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.74, sgn * r * 0.24);
      ctx.lineTo(r * 1.28, sgn * r * (0.28 + clawSpread));
      ctx.lineTo(r * 1.58, sgn * r * (0.06 + clawSpread * 0.34));
      ctx.stroke();
    }

    // Glowing compound predator visor
    ctx.fillStyle = isDiving || isClinging ? '#fb7185' : '#f43f5e';
    ctx.beginPath();
    ctx.arc(r * 0.55, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Twin ODM vector thruster exhaust jets when swinging/launching
    if (gs && (gs.mode === 'swinging' || gs.mode === 'air_launch') && vfx?.rocketExhaustVfx !== false) {
      ctx.fillStyle = isDiving ? 'rgba(244, 63, 94, 0.95)' : 'rgba(251, 113, 133, 0.88)';
      for (const ny of [-r * 0.42, r * 0.42]) {
        ctx.beginPath();
        ctx.moveTo(-r * 1.05, ny - 1.9);
        ctx.lineTo(-r * 1.05 - 11, ny);
        ctx.lineTo(-r * 1.05, ny + 1.9);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Kinetic bullet deflection flash shield arc when unattached
    if (gs && gs.deflectFlashTimer > 0) {
      const dfAlpha = Math.min(1, gs.deflectFlashTimer / 0.16);
      ctx.strokeStyle = `rgba(226, 232, 240, ${dfAlpha * 0.92})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Standard / EWar / Engineer angular faceted chassis
    ctx.beginPath();
    ctx.moveTo(r * 1.15, -r * 0.42);
    ctx.lineTo(r * 1.15, r * 0.42);
    ctx.lineTo(r * 0.2, r * 0.85);
    ctx.lineTo(-r * 1.0, r * 0.72);
    ctx.lineTo(-r * 1.12, 0);
    ctx.lineTo(-r * 1.0, -r * 0.72);
    ctx.lineTo(r * 0.2, -r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Rear engine radiator vents (and dash booster burst for ground mechs!)
  ctx.fillStyle = '#14181f';
  ctx.fillRect(-r * 0.92, -r * 0.38, r * 0.32, r * 0.76);
  ctx.strokeStyle = mech.health.engine / mech.health.maxEngine < 0.4 ? '#ef4444' : '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(-r * 0.92, -r * 0.38, r * 0.32, r * 0.76);

  if (sil !== 'valkyrie' && mech.dash?.isDashing() && vfx?.rocketExhaustVfx !== false) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.beginPath();
    ctx.moveTo(-r * 1.02, -6);
    ctx.lineTo(-r * 1.02 - 22, 0);
    ctx.lineTo(-r * 1.02, 6);
    ctx.closePath();
    ctx.fill();
  }

  // Special class hull trim (EWAR radar dish, Engineer crane, Colossus optics, Valkyrie cockpit canopy)
  if (sil === 'ewar') {
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(-r * 0.3, 0, r * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = mech.paint.accent;
    ctx.stroke();
  } else if (sil === 'engineer') {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.6);
    ctx.lineTo(r * 0.3, -r * 0.85);
    ctx.stroke();
  } else if (sil === 'colossus') {
    // Multi-sensor forward optics bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(r * 0.85, -r * 0.34, 7, r * 0.68);
    ctx.fillStyle = mech.paint.accent;
    ctx.fillRect(r * 0.96, -r * 0.24, 3, 5);
    ctx.fillRect(r * 0.96, 0, 3, 5);
    ctx.fillRect(r * 0.96, r * 0.18, 3, 5);
  } else if (sil === 'valkyrie') {
    ctx.fillStyle = mech.team === 'player' ? '#0ea5e9' : '#f43f5e';
    ctx.beginPath();
    ctx.ellipse(r * 0.56, 0, r * 0.28, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (sil === 'phantom') {
    // PS-08 Phase Strider: sleek angular 86-inspired phase carapace with twin swept stabilizers
    ctx.fillStyle = primaryCol;
    ctx.beginPath();
    ctx.moveTo(r * 1.15, 0);
    ctx.lineTo(r * 0.32, -r * 0.82);
    ctx.lineTo(-r * 0.78, -r * 0.96);
    ctx.lineTo(-r * 1.02, -r * 0.34);
    ctx.lineTo(-r * 0.82, 0);
    ctx.lineTo(-r * 1.02, r * 0.34);
    ctx.lineTo(-r * 0.78, r * 0.96);
    ctx.lineTo(r * 0.32, r * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Cyan phase-conduit seams & angular visor
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r * 0.72, 0);
    ctx.lineTo(-r * 0.55, -r * 0.52);
    ctx.moveTo(r * 0.72, 0);
    ctx.lineTo(-r * 0.55, r * 0.52);
    ctx.stroke();
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(r * 0.44, -r * 0.18, r * 0.34, r * 0.36);
  } else if (sil === 'assassin') {
    // AS-09 Kurokage Stalker: Sleek angular split-fang stealth frame with glowing HF thermal blades
    ctx.fillStyle = primaryCol;
    ctx.beginPath();
    ctx.moveTo(r * 1.42, 0);
    ctx.lineTo(r * 0.55, -r * 0.62);
    ctx.lineTo(-r * 0.45, -r * 0.88);
    ctx.lineTo(-r * 1.12, -r * 0.42);
    ctx.lineTo(-r * 0.85, 0);
    ctx.lineTo(-r * 1.12, r * 0.42);
    ctx.lineTo(-r * 0.45, r * 0.88);
    ctx.lineTo(r * 0.55, r * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dorsal thermal blade sheaths & crimson/rose stealth seams
    ctx.strokeStyle = mech.paint.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r * 0.85, 0);
    ctx.lineTo(-r * 0.65, -r * 0.46);
    ctx.moveTo(r * 0.85, 0);
    ctx.lineTo(-r * 0.65, r * 0.46);
    ctx.stroke();

    // Narrow mantis optical visor slit
    ctx.fillStyle = mech.team === 'enemy' ? '#f43f5e' : mech.paint.accent;
    ctx.fillRect(r * 0.68, -r * 0.22, r * 0.26, r * 0.44);

    // Extending High-Frequency Wrist Thermal Blades (flare brightly when dashing or sprinting)
    const bladesExtended = Boolean(mech.dash?.isDashing() || mech.phys.sprinting || mech.stealth?.active);
    const bladeLen = bladesExtended ? r * 1.38 : r * 0.72;
    const bladeColor = mech.team === 'enemy' ? '#fb7185' : '#f43f5e';
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-r * 0.22, sgn * r * 0.72 - 2.5, r * 0.65, 5);
      ctx.fillStyle = bladeColor;
      ctx.beginPath();
      ctx.moveTo(r * 0.35, sgn * r * 0.76);
      ctx.lineTo(r * 0.35 + bladeLen, sgn * r * 0.62);
      ctx.lineTo(r * 0.35, sgn * r * 0.62);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Subtle optical refraction outline while stealthed (helpful silhouette cue on friendlies or point-blank enemies)
  if (mech.stealth?.active && mech.alive) {
    const cloakColor = mech.team === 'enemy' ? 'rgba(244, 63, 94, 0.55)' : 'rgba(56, 189, 248, 0.55)';
    ctx.strokeStyle = cloakColor;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // TX-series Proteus enhanced mechanical chassis plates, shields, anchors, scythes & aero wings
  drawProteusMorphChassisLayer(ctx, mech, vfx?.time ?? 0);

  ctx.restore();

  // 4. Draw front legs (so they cleanly socket onto lower side of chassis)
  for (let i = 0; i < frontLegs.length; i++) {
    drawLeg(ctx, frontLegs[i], mech, altitude);
  }

  // 5. Independent Turret & Recoiling Weapon Barrels
  ctx.save();
  ctx.translate(bodyX + mech.phys.tiltY * 8, bodyY - mech.phys.tiltX * 8 - 3);
  ctx.rotate(mech.phys.aimAngle);

  const recoil = mech.phys.recoilOffset;
  const barrelLen = mech.primary.spec.barrelLength;
  const caliber = mech.primary.spec.caliber;
  const prepRatio = mech.primary.isPreparing
    ? Math.min(1, mech.primary.prepTimer / Math.max(0.05, mech.primary.spec.prepTime))
    : 0;

  if (sil === 'colossus') {
    // M-09 Colossus Oversized Elevating 240mm Mortar Tube, Recoil Cylinders & Loading Gantry!
    const pitch = mech.mortarPitch ?? 0.45;
    const effLen = barrelLen * (1 - pitch * 0.34);
    const ammoCol = mech.activeMortarAmmo ? MORTAR_AMMO_SPECS[mech.activeMortarAmmo].color : '#fb923c';

    // Twin Hydraulic Recoil Cylinders flanking the mortar cradle
    ctx.fillStyle = '#475569';
    ctx.fillRect(-6 - recoil * 0.5, -caliber * 0.95, 22, 4);
    ctx.fillRect(-6 - recoil * 0.5, caliber * 0.95 - 4, 22, 4);

    // Loading Gantry Arm & Shell Cradle (animates during reload, prep, or Overwatch Barrage!)
    const gantryAmt =
      mech.gantryCycle && mech.gantryCycle > 0
        ? mech.gantryCycle
        : mech.primary.reloading
        ? Math.sin((1 - mech.primary.reloadTimer / mech.primary.spec.reloadTime) * Math.PI)
        : prepRatio;
    if (gantryAmt > 0.05) {
      const armY = -r * 0.72 * (1 - gantryAmt);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, -r * 0.72);
      ctx.lineTo(-8, armY);
      ctx.stroke();
      ctx.fillStyle = ammoCol;
      ctx.fillRect(-13, armY - 4, 14, 8);
    }

    // Main Colossal Mortar Tube
    ctx.fillStyle = '#181e26';
    ctx.strokeStyle = '#07090d';
    ctx.lineWidth = 2;
    ctx.fillRect(-4 - recoil, -caliber * 0.72, effLen, caliber * 1.44);
    ctx.strokeRect(-4 - recoil, -caliber * 0.72, effLen, caliber * 1.44);

    // Muzzle Reinforcement Ring & Active Munition Indicator Band
    ctx.fillStyle = secCol;
    ctx.fillRect(effLen - 14 - recoil, -caliber * 0.88, 12, caliber * 1.76);
    ctx.strokeRect(effLen - 14 - recoil, -caliber * 0.88, 12, caliber * 1.76);
    ctx.fillStyle = ammoCol;
    ctx.fillRect(8 - recoil, -2.5, effLen * 0.42, 5);
  } else {
    // Primary barrel with kickback recoil + firing vibration
    ctx.fillStyle = '#1c222b';
    ctx.strokeStyle = '#090c10';
    ctx.lineWidth = 1.5;
    ctx.fillRect(4 - recoil, -caliber * 0.68, barrelLen, caliber * 1.36);
    ctx.strokeRect(4 - recoil, -caliber * 0.68, barrelLen, caliber * 1.36);
  }

  // Heavy artillery breech lock / hydraulic brace prep glow
  if (prepRatio > 0) {
    ctx.fillStyle = `rgba(245, 158, 11, ${0.4 + prepRatio * 0.6})`;
    ctx.fillRect(2 - recoil, -caliber * 0.85, 9, caliber * 1.7);
  }

  // Railgun accelerator rails glow
  if (mech.primary.spec.kind === 'railgun') {
    const chargeRatio = mech.primary.isCharging
      ? Math.min(1, mech.primary.chargeTimer / Math.max(0.05, mech.primary.spec.chargeTime))
      : 0;
    ctx.fillStyle = chargeRatio > 0 ? '#22d3ee' : '#0ea5e9';
    ctx.fillRect(10 - recoil, -1.4, barrelLen - 8, 2.8);
    if (chargeRatio > 0) {
      ctx.fillStyle = `rgba(34, 211, 238, ${0.45 + chargeRatio * 0.55})`;
      ctx.beginPath();
      ctx.arc(barrelLen + 4 - recoil, 0, 3.5 + chargeRatio * 7.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Secondary weapon pod on turret shoulder
  ctx.fillStyle = secCol;
  ctx.fillRect(-5, r * 0.34, 14, 7);
  ctx.strokeRect(-5, r * 0.34, 14, 7);

  // Turret cap
  ctx.fillStyle = mech.hitFlashTimer > 0 ? '#ffffff' : secCol;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Optical sensor eye (faction colored — glowing violet for Revenant!)
  ctx.fillStyle = mech.isRevenant ? '#e879f9' : mech.team === 'player' ? mech.paint.accent : '#ef4444';
  ctx.fillRect(r * 0.22, -3.2, 5, 6.4);

  // REVENANT corrupted purple energy cracks, outer silhouette aura & intermittent violet arcs
  if (mech.isRevenant && mech.alive) {
    const t = vfx?.time ?? 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 9.0);
    ctx.save();
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = `rgba(192, 132, 252, ${0.72 + pulse * 0.28})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
    ctx.stroke();

    // Glowing purple corruption fissures across white armor
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.3);
    ctx.lineTo(-r * 0.15, -r * 0.05);
    ctx.lineTo(r * 0.35, -r * 0.42);
    ctx.moveTo(-r * 0.15, -r * 0.05);
    ctx.lineTo(r * 0.12, r * 0.44);
    ctx.stroke();

    // Intermittent violet electrical discharge arc
    if (Math.sin(t * 17.3) > 0.35) {
      const a0 = t * 4.2;
      ctx.strokeStyle = '#f0abfc';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r * 0.9, Math.sin(a0) * r * 0.9);
      ctx.lineTo(Math.cos(a0 + 0.35) * r * 1.38, Math.sin(a0 + 0.35) * r * 1.38);
      ctx.lineTo(Math.cos(a0 + 0.72) * r * 1.05, Math.sin(a0 + 0.72) * r * 1.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  // TX-series Proteus enhanced turret attachments, bifurcated rail jaws, radar rotors & servo cranes
  drawProteusMorphTurretLayer(ctx, mech, vfx?.time ?? 0);

  ctx.restore();

  // 5b. Independent Universal AI Anti-Air Point-Defense Turret (rotates, recoils & glows on overheat)
  if (mech.antiAir && mech.alive) {
    const aa = mech.antiAir;
    const aaRecoil = aa.recoil * 3.5;
    const style = aa.spec.mountStyle;
    const heatRatio = aa.getHeatRatio();
    const mountOffset =
      style === 'shoulder_ciws'
        ? { x: -Math.sin(mech.phys.aimAngle) * (r * 0.42), y: Math.cos(mech.phys.aimAngle) * (r * 0.42) - 4 }
        : { x: 0, y: -5 };

    ctx.save();
    ctx.translate(bodyX + mountOffset.x, bodyY + mountOffset.y);
    ctx.rotate(aa.turretAngle);

    // Subtle radar sweep wedge when actively tracking incoming missiles
    if (aa.trackingCount > 0 && !aa.overheated) {
      ctx.fillStyle = mech.team === 'player' ? 'rgba(251, 191, 36, 0.14)' : 'rgba(251, 113, 133, 0.14)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 1.45, -0.22, 0.22);
      ctx.closePath();
      ctx.fill();
    }

    // Distinct AA barrel silhouette per unit class mountStyle
    ctx.fillStyle = aa.overheated ? '#7f1d1d' : '#1e293b';
    ctx.strokeStyle = aa.overheated ? '#ef4444' : '#090c10';
    ctx.lineWidth = 1.1;

    if (style === 'twin_flak') {
      ctx.fillRect(2 - aaRecoil, -4.4, 12, 2.5);
      ctx.fillRect(2 - aaRecoil, 1.9, 12, 2.5);
      ctx.fillStyle = secCol;
      ctx.fillRect(-3.5, -5.2, 7, 10.4);
      ctx.strokeRect(-3.5, -5.2, 7, 10.4);
    } else if (style === 'dorsal_popup') {
      ctx.fillRect(2 - aaRecoil, -3.1, 10.5, 2.0);
      ctx.fillRect(2 - aaRecoil, 1.1, 10.5, 2.0);
      ctx.fillStyle = primaryCol;
      ctx.beginPath();
      ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (style === 'rotary_pod' || style === 'vector_360') {
      ctx.fillRect(2 - aaRecoil, -2.2, 10.5, 4.4);
      ctx.fillStyle = secCol;
      ctx.beginPath();
      ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (style === 'sensor_linked') {
      ctx.fillRect(2 - aaRecoil, -1.8, 11.5, 3.6);
      ctx.strokeStyle = mech.paint.accent;
      ctx.beginPath();
      ctx.arc(-2.5, 0, 4.2, -1.0, 1.0);
      ctx.stroke();
    } else {
      // shoulder_ciws
      ctx.fillRect(2 - aaRecoil, -2.0, 11, 4.0);
      ctx.fillStyle = secCol;
      ctx.beginPath();
      ctx.arc(0, 0, 4.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Overheat vent glow
    if (heatRatio > 0.6 || aa.overheated) {
      ctx.fillStyle = aa.overheated ? '#ef4444' : `rgba(251, 146, 60, ${heatRatio * 0.85})`;
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // AA muzzle flash burst
    if (aa.muzzleFlashTimer > 0) {
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(13 - aaRecoil, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // 6. Active special ability aura / shield rings
  if (mech.specialActiveTimer > 0) {
    ctx.save();
    ctx.translate(bodyX, bodyY);
    if (mech.spec.specialAbility.kind === 'fortress_armor' || mech.spec.specialAbility.kind === 'stabilizer') {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 15, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mech.spec.specialAbility.kind === 'repair_field') {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.42)';
      ctx.fillStyle = 'rgba(52, 211, 153, 0.06)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 240, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (mech.spec.specialAbility.kind === 'ecm_pulse') {
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 24, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mech.spec.specialAbility.kind === 'overdrive' || mech.spec.specialAbility.kind === 'flight_overdrive') {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6a. TX-series Proteus unique morph special field auras + Recon Apex Scan target mark
  drawProteusMorphSpecialAura(ctx, mech, vfx?.time ?? 0);
  if (mech.alive && mech.markedTimer && mech.markedTimer > 0) {
    const t = vfx?.time ?? 0;
    const pulse = 0.65 + 0.35 * Math.sin(t * 14);
    ctx.save();
    ctx.translate(bodyX, bodyY);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.72 * pulse})`;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 6b. AEGIS ADAPTIVE TEMPORARY PROTECTIVE ARMOR UPGRADE (Infinite HP, 30s, Silhouette-Matched)
  if (isAegisArmorActive(mech) && mech.aegisArmor) {
    const st = mech.aegisArmor;
    const prof = getAegisVisualProfile(sil);
    const assembleScale = Math.max(0.05, st.deployProgress * (1 - st.retractProgress));
    const flash = st.hitFlash;
    const pulse = 0.72 + Math.sin((vfx?.time ?? 0) * 6.5) * 0.28;

    // (a) Limb-matched armored leg greaves following each leg's procedural IK segments
    ctx.save();
    for (let i = 0; i < mech.legs.legs.length; i++) {
      const leg = mech.legs.legs[i];
      if (leg.destroyed) continue;
      const hx = leg.hipPos.x;
      const hy = leg.hipPos.y - elev;
      const kx = leg.kneePos.x;
      const ky = leg.kneePos.y - elev - leg.liftZ * 0.45;
      const fx = leg.footPos.x;
      const fy = leg.footPos.y - leg.liftZ;

      ctx.strokeStyle = flash > 0.2 ? '#ffffff' : prof.primaryPlateColor;
      ctx.lineWidth = (3.0 + prof.legArmorScale * 1.4) * assembleScale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx + (kx - hx) * 0.18, hy + (ky - hy) * 0.18);
      ctx.lineTo(kx, ky);
      ctx.lineTo(kx + (fx - kx) * 0.72, ky + (fy - ky) * 0.72);
      ctx.stroke();

      ctx.strokeStyle = prof.energyLineColor;
      ctx.lineWidth = 1.2 * assembleScale;
      ctx.beginPath();
      ctx.moveTo(hx + (kx - hx) * 0.25, hy + (ky - hy) * 0.25);
      ctx.lineTo(kx, ky);
      ctx.stroke();
    }
    ctx.restore();

    // (b) Silhouette-matched reinforced chassis plating, shoulder pauldrons & energy seams
    ctx.save();
    ctx.translate(bodyX + mech.phys.tiltY * 8, bodyY - mech.phys.tiltX * 8);
    ctx.rotate(mech.phys.bodyAngle);
    ctx.scale(assembleScale, assembleScale);

    ctx.fillStyle = flash > 0.25 ? '#e0f2fe' : prof.primaryPlateColor;
    ctx.strokeStyle = prof.secondaryTrimColor;
    ctx.lineWidth = prof.plateThickness * 0.65;

    if (prof.hasShoulderPauldrons) {
      const pw = r * (prof.style === 'juggernaut_bulkhead' || prof.style === 'siege_bastion' ? 0.95 : 0.72);
      const ph = r * (prof.style === 'juggernaut_bulkhead' ? 0.56 : 0.42);
      // Left & Right armored shoulder pauldrons
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(pw * 0.6, sgn * (r * 0.62));
        ctx.lineTo(pw * 0.2, sgn * (r * 1.18));
        ctx.lineTo(-pw * 0.78, sgn * (r * 1.08));
        ctx.lineTo(-pw * 0.55, sgn * (r * 0.58));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Glowing energy seam on each pauldron
        ctx.strokeStyle = prof.energyLineColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(pw * 0.35, sgn * (r * 0.88));
        ctx.lineTo(-pw * 0.58, sgn * (r * 0.86));
        ctx.stroke();
        ctx.strokeStyle = prof.secondaryTrimColor;
        ctx.lineWidth = prof.plateThickness * 0.65;
      }
      // Front reactive prow plate
      ctx.beginPath();
      ctx.moveTo(r * 1.24, 0);
      ctx.lineTo(r * 0.72, -ph);
      ctx.lineTo(r * 0.48, -ph * 0.7);
      ctx.lineTo(r * 0.88, 0);
      ctx.lineTo(r * 0.48, ph * 0.7);
      ctx.lineTo(r * 0.72, ph);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (prof.hasWingStrakes) {
      // Swept aerodynamic / stealth / phase-blade wing armor strakes
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(r * 0.92, sgn * r * 0.28);
        ctx.lineTo(-r * 0.35, sgn * r * 1.32);
        ctx.lineTo(-r * 1.05, sgn * r * 0.96);
        ctx.lineTo(-r * 0.52, sgn * r * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    if (prof.hasDorsalFin) {
      ctx.strokeStyle = prof.energyLineColor;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(r * 0.85, 0);
      ctx.lineTo(-r * 0.88, 0);
      ctx.stroke();
    }

    // Subtle hexagonal mechanical corner locks (never a generic circle bubble)
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 1.5;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 1.05, sgn * r * 0.48);
      ctx.lineTo(r * 1.28, sgn * r * 0.24);
      ctx.moveTo(-r * 0.95, sgn * r * 0.68);
      ctx.lineTo(-r * 1.15, sgn * r * 0.44);
      ctx.stroke();
    }

    ctx.restore();

    // Crisp remaining protection timer micro-tag above shielded unit
    if (!isPreview) {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#22d3ee';
      ctx.fillText(`AEGIS ${Math.ceil(st.remaining)}s`, bodyX, bodyY - r - 14);
      ctx.restore();
    }
  }

  // 6c. Downed Squadmate Revive Beacon & Channeling Progress Arc
  if (isDowned && !isPreview) {
    const pulse = 0.5 + 0.5 * Math.sin((vfx?.time ?? 0) * 6);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(bodyX, bodyY);
    ctx.strokeStyle = `rgba(52, 211, 153, ${0.45 + pulse * 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 14 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const prog = mech.reviveProgress ?? 0;
    if (prog > 0.01) {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, -Math.PI * 0.5, -Math.PI * 0.5 + prog * Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = prog > 0.01 ? '#34d399' : '#fbbf24';
    ctx.fillText(prog > 0.01 ? `REVIVING ${Math.round(prog * 100)}%` : 'DOWNED — REVIVE', 0, -r - 12);
    ctx.restore();
  }

  // 7. Sniper / Heavy windup telegraph laser!
  if (mech.windupTimer > 0 && mech.windupTargetPos) {
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(bodyX, bodyY - 4);
    ctx.lineTo(mech.windupTargetPos.x, mech.windupTargetPos.y);
    ctx.stroke();
    ctx.restore();
  }

  // 8. World-space compact nameplate & health bar (scaled cleanly for compact Grapplers + subtle tracking bracket)
  const hideCloakedBar = mech.team === 'enemy' && Boolean(mech.stealth?.active) && !mech.detected;
  if (!mech.isPlayer && !isPreview && mech.alive && !hideCloakedBar) {
    const isGrappler = mech.enemyArchetype === 'grappler';
    const barW = isGrappler ? 28 : 42;
    const barH = isGrappler ? 3 : 4;
    const bx = bodyX - barW * 0.5;
    const by = bodyY - r - (isGrappler ? 16 : 24);
    const hpR = Math.max(0, mech.health.chassis / mech.health.maxChassis);
    const armR = Math.max(0, mech.health.armor / Math.max(1, mech.health.maxArmor));

    if (isGrappler) {
      // Crisp micro predator tracking corners so tiny high-speed Grapplers stay visible onscreen
      const isDive = mech.grapplerState?.huntPhase === 'dive';
      const br = r + 5;
      ctx.strokeStyle = isDive ? 'rgba(244, 63, 94, 0.9)' : 'rgba(251, 113, 133, 0.55)';
      ctx.lineWidth = 1.1;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(bodyX + sx * br, bodyY + sy * (br - 3.5));
          ctx.lineTo(bodyX + sx * br, bodyY + sy * br);
          ctx.lineTo(bodyX + sx * (br - 3.5), bodyY + sy * br);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = 'rgba(10, 13, 18, 0.78)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + (mech.health.maxArmor > 0 ? 5 : 2));
    ctx.fillStyle = mech.team === 'player' ? '#38bdf8' : isGrappler ? '#fb7185' : '#ef4444';
    ctx.fillRect(bx, by, barW * hpR, barH);
    if (mech.health.maxArmor > 0) {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(bx, by + barH + 1, barW * armR, 2);
    }

    ctx.font = isGrappler ? '600 8px "JetBrains Mono", monospace' : '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = mech.team === 'player' ? '#bae6fd' : isGrappler ? '#fda4af' : '#fca5a5';
    const altTag = !isGrappler && altitude > 8 ? ` [AIR ${Math.round(altitude)}m]` : '';
    ctx.fillText(`${mech.callsign}${altTag}`, bodyX, by - 3);
  }

  ctx.restore();
}

function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle): void {
  const x = obs.x - obs.w * 0.5;
  const y = obs.y - obs.h * 0.5;

  if (obs.destroyed) {
    // Rubble / scorched footprint
    ctx.save();
    ctx.fillStyle = 'rgba(22, 24, 28, 0.75)';
    ctx.beginPath();
    ctx.ellipse(obs.x, obs.y, obs.w * 0.45, obs.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#363b42';
    ctx.fillRect(obs.x - 10, obs.y - 6, 8, 6);
    ctx.fillRect(obs.x + 4, obs.y + 3, 9, 5);
    ctx.restore();
    return;
  }

  ctx.save();
  // Cast shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(x + 8, y + 10, obs.w, obs.h);

  if (obs.kind === 'tree') {
    // Trunk shadow & multi-layered dark pine canopy
    ctx.fillStyle = '#1e2e20';
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - 6, obs.w * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#29402b';
    ctx.beginPath();
    ctx.arc(obs.x - 3, obs.y - 10, obs.w * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (obs.kind === 'fuel_tank') {
    ctx.fillStyle = '#682424';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - 6, obs.w * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - 6, obs.w * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (obs.kind === 'silo') {
    const h = obs.height;
    const rad = obs.w * 0.45;
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.fillRect(obs.x - rad, obs.y - h, rad * 2, h);
    ctx.strokeRect(obs.x - rad, obs.y - h, rad * 2, h);
    ctx.beginPath();
    ctx.arc(obs.x, obs.y, rad, 0, Math.PI, false);
    ctx.fill();
    ctx.stroke();

    // Silo top armored cap + yellow industrial warning ring
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - h, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - h, rad * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - h, rad * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (obs.kind === 'radar_dish') {
    const h = obs.height;
    ctx.fillStyle = '#2b333f';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.fillRect(x, y + obs.h - h, obs.w, h);
    ctx.strokeRect(x, y + obs.h - h, obs.w, h);
    ctx.fillStyle = '#3b4654';
    ctx.fillRect(x, y - h, obs.w, obs.h);
    ctx.strokeRect(x, y - h, obs.w, obs.h);

    // Metallic radar dish dome + rotating receiver horn
    const dishR = Math.min(obs.w, obs.h) * 0.36;
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - h, dishR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - h, dishR * 0.72, -0.8, 1.8);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(obs.x + dishR * 0.32, obs.y - h - dishR * 0.22, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (obs.kind === 'monolith') {
    const h = obs.height;
    ctx.fillStyle = '#363330';
    ctx.strokeStyle = '#141210';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + obs.w * 0.14, y + obs.h);
    ctx.lineTo(x + obs.w * 0.86, y + obs.h);
    ctx.lineTo(x + obs.w * 0.94, y + obs.h * 0.45 - h * 0.45);
    ctx.lineTo(x + obs.w * 0.72, y - h);
    ctx.lineTo(x + obs.w * 0.28, y - h);
    ctx.lineTo(x + obs.w * 0.06, y + obs.h * 0.45 - h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Faceted rock spire crown
    ctx.fillStyle = '#4c4741';
    ctx.beginPath();
    ctx.moveTo(x + obs.w * 0.24, y - h + obs.h * 0.12);
    ctx.lineTo(x + obs.w * 0.76, y - h + obs.h * 0.08);
    ctx.lineTo(x + obs.w * 0.88, y - h + obs.h * 0.66);
    ctx.lineTo(x + obs.w * 0.48, y - h + obs.h * 0.88);
    ctx.lineTo(x + obs.w * 0.12, y - h + obs.h * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    return;
  }

  const h = obs.height;
  // Front vertical extruded wall face (2.5D angled top-down!)
  const wallColor =
    obs.kind === 'building'
      ? '#2b313a'
      : obs.kind === 'watchtower'
      ? '#232a34'
      : obs.kind === 'crane'
      ? '#343b45'
      : obs.kind === 'bridge_pylon'
      ? '#444a52'
      : obs.kind === 'bunker'
      ? '#343b42'
      : obs.kind === 'rock'
      ? '#413e39'
      : obs.kind === 'tank_wreck'
      ? '#3a342e'
      : '#3b3733';

  const roofColor =
    obs.kind === 'building'
      ? '#3a424e'
      : obs.kind === 'watchtower'
      ? '#323c4a'
      : obs.kind === 'crane'
      ? '#47505c'
      : obs.kind === 'bridge_pylon'
      ? '#5b626b'
      : obs.kind === 'bunker'
      ? '#454e57'
      : obs.kind === 'rock'
      ? '#534f49'
      : obs.kind === 'tank_wreck'
      ? '#4d463e'
      : '#4b4742';

  ctx.fillStyle = wallColor;
  ctx.fillRect(x, y + obs.h - h, obs.w, h);
  ctx.strokeStyle = '#12151a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y + obs.h - h, obs.w, h);

  // Roof face shifted upward by h
  ctx.fillStyle = roofColor;
  ctx.fillRect(x, y - h, obs.w, obs.h);
  ctx.strokeRect(x, y - h, obs.w, obs.h);

  // Roof architectural details
  if (obs.kind === 'building' || obs.kind === 'bunker') {
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.strokeRect(x + 6, y - h + 6, obs.w - 12, obs.h - 12);
  } else if (obs.kind === 'watchtower') {
    // Steel X-truss deck & beacon indicator
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 5, y - h + 5, obs.w - 10, obs.h - 10);
    ctx.beginPath();
    ctx.moveTo(x + 6, y - h + 6);
    ctx.lineTo(x + obs.w - 6, y - h + obs.h - 6);
    ctx.moveTo(x + obs.w - 6, y - h + 6);
    ctx.lineTo(x + 6, y - h + obs.h - 6);
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(obs.x, y - h + obs.h * 0.5, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (obs.kind === 'crane') {
    // High-visibility amber girder boom across top
    const horizontal = obs.w >= obs.h;
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.4;
    if (horizontal) {
      ctx.fillRect(x - 14, y - h + obs.h * 0.34, obs.w + 28, obs.h * 0.32);
      ctx.strokeRect(x - 14, y - h + obs.h * 0.34, obs.w + 28, obs.h * 0.32);
    } else {
      ctx.fillRect(x + obs.w * 0.34, y - h - 14, obs.w * 0.32, obs.h + 28);
      ctx.strokeRect(x + obs.w * 0.34, y - h - 14, obs.w * 0.32, obs.h + 28);
    }
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(obs.x, y - h + obs.h * 0.5, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (obs.kind === 'bridge_pylon') {
    // Reinforced concrete chamfer cap & steel collar bolts
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 6, y - h + 6, obs.w - 12, obs.h - 12);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 4, y + obs.h - h * 0.55, obs.w - 8, 5);
  } else if (obs.kind === 'tank_wreck') {
    // Burned turret silhouette on tank wreck
    ctx.fillStyle = '#262320';
    ctx.beginPath();
    ctx.arc(obs.x, obs.y - h, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Damage cracks if destructible & hurt
  if (obs.destructible && obs.hp < obs.maxHp * 0.75) {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - h + 8);
    ctx.lineTo(obs.x, obs.y - h);
    ctx.lineTo(x + obs.w - 10, y - h + obs.h - 10);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDashAfterimages(
  ctx: CanvasRenderingContext2D,
  afterimages: DashAfterimage[],
  intensity: number
): void {
  if (intensity <= 0.02 || afterimages.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < afterimages.length; i++) {
    const g = afterimages[i];
    if (!g.active || g.life <= 0) continue;
    const t = Math.max(0, Math.min(1, g.life / Math.max(0.01, g.maxLife)));
    const elev = g.altitude * 0.52;
    ctx.globalAlpha = t * 0.48 * intensity;

    // Exact captured procedural leg pose
    ctx.strokeStyle = g.tintColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.2;
    for (let li = 0; li < g.legCount; li++) {
      const leg = g.legs[li];
      if (leg.destroyed) continue;
      ctx.beginPath();
      ctx.moveTo(leg.hipX, leg.hipY - elev);
      ctx.lineTo(leg.kneeX, leg.kneeY - elev);
      ctx.lineTo(leg.footX, leg.footY - elev);
      ctx.stroke();
    }

    // Exact captured hull + turret silhouette
    ctx.save();
    ctx.translate(g.x, g.y - elev);
    ctx.rotate(g.bodyAngle);
    ctx.fillStyle = g.tintColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, g.radius * 1.15, g.radius * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(g.x, g.y - elev - 2);
    ctx.rotate(g.aimAngle);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(2, -2, g.radius * 1.15, 4);
    ctx.restore();
  }
  ctx.restore();
}

function drawGrappleOverlay(
  ctx: CanvasRenderingContext2D,
  player: MechActor,
  grapple: GrappleController,
  time: number,
  grappleVfx: boolean
): void {
  const playerElev = (player.flight?.altitude ?? 0) * 0.52;
  const px = player.phys.pos.x;
  const py = player.phys.pos.y - playerElev;

  // Hover anchor target indicator
  if (grapple.state === 'idle' && grapple.hoveredCandidate && player.alive) {
    const c = grapple.hoveredCandidate;
    const col = c.valid ? '#34d399' : c.reason === 'out_of_range' ? '#f59e0b' : '#ef4444';
    ctx.save();
    ctx.translate(c.anchorX, c.anchorY);
    ctx.rotate(Math.PI * 0.25 + time * (c.valid ? 1.5 : 0));
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.restore();
  }

  // Active mechanical winch cable
  if (grapple.state === 'deploying' || grapple.state === 'attached' || grapple.state === 'retracting') {
    const tx = grapple.cableTip.x;
    const ty = grapple.cableTip.y;
    const cableAng = Math.atan2(ty - py, tx - px);
    ctx.save();
    ctx.strokeStyle = '#090d12';
    ctx.lineWidth = 5.4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    const tensionHot = grapple.tension > 0.72;
    ctx.strokeStyle = tensionHot ? '#fbbf24' : '#38bdf8';
    ctx.lineWidth = tensionHot ? 2.8 : 2.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    if (grapple.state === 'deploying' && grappleVfx) {
      const mx = (px + tx) * 0.5 + Math.sin(time * 48) * 6;
      const my = (py + ty) * 0.5 + Math.cos(time * 48) * 6;
      ctx.quadraticCurveTo(mx, my, tx, ty);
    } else {
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();

    // Segmented cable notches & tension shimmer
    if (grappleVfx) {
      ctx.strokeStyle = tensionHot ? '#fef3c7' : '#e2e8f0';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Impact clamp ring pulse on initial latch
    if (grapple.latchImpactFlash > 0 && grappleVfx) {
      const f = grapple.latchImpactFlash / 0.22;
      ctx.strokeStyle = `rgba(251, 191, 36, ${f * 0.9})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(tx, ty, 7 + (1 - f) * 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Articulated 3-prong mechanical grapple claw at tip
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(cableAng);
    ctx.strokeStyle = grapple.state === 'attached' ? '#fbbf24' : '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(6, -6);
    ctx.moveTo(-2, 0);
    ctx.lineTo(6, 6);
    ctx.stroke();
    ctx.fillStyle = grapple.state === 'attached' ? '#fbbf24' : '#e2e8f0';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
}

export function renderBattlefield(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  camera: Camera,
  map: MapDefinition,
  player: MechActor,
  allies: MechActor[],
  enemies: MechActor[],
  projectiles: ProjectilePool,
  particles: ParticleSystem,
  cursorWorld: Vec2,
  options: {
    showReticle: boolean;
    time: number;
    hideNameplates?: boolean;
    boss?: ThunderheadBoss | null;
    hazards?: HazardZone[];
    smokeClouds?: SmokeCloud[];
    mortarSolution?: MortarTargetingSolution | null;
    incomingWarnings?: IncomingArtilleryWarning[];
    deployables?: BossDeployable[];
    friendlyDeployables?: FriendlyDeployable[];
    defendStructure?: DefendStructureState | null;
    nuclearDimAlpha?: number;
    empDisruptTimer?: number;
    afterimages?: DashAfterimage[];
    afterimageIntensity?: number;
    grapple?: GrappleController | null;
    grappleVfx?: boolean;
    rocketExhaustVfx?: boolean;
    flightVfx?: boolean;
    missileLockWarning?: boolean;
    takedownSessions?: TakedownSession[];
    firstPersonTakedown?: TakedownSession | null;
    executionTargetPos?: Vec2 | null;
  }
): void {
  // Base background
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.save();
  ctx.translate(viewW * 0.5 + camera.shakeX, viewH * 0.5 + camera.shakeY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const halfViewW = (viewW * 0.5) / Math.max(0.25, camera.zoom);
  const halfViewH = (viewH * 0.5) / Math.max(0.25, camera.zoom);
  const cullPad = 240;
  const viewMinX = camera.x - halfViewW - cullPad;
  const viewMaxX = camera.x + halfViewW + cullPad;
  const viewMinY = camera.y - halfViewH - cullPad;
  const viewMaxY = camera.y + halfViewH + cullPad;

  // 1. Map Ground Floor
  ctx.fillStyle = map.groundColor;
  ctx.fillRect(0, 0, map.width, map.height);

  // Subtle tactical grid lines (clipped to camera viewport for smooth rendering on huge maps)
  ctx.strokeStyle = map.groundDetailColor;
  ctx.lineWidth = 1;
  const gridStep = 128;
  const startGx = Math.max(0, Math.floor(viewMinX / gridStep) * gridStep);
  const endGx = Math.min(map.width, Math.ceil(viewMaxX / gridStep) * gridStep);
  const startGy = Math.max(0, Math.floor(viewMinY / gridStep) * gridStep);
  const endGy = Math.min(map.height, Math.ceil(viewMaxY / gridStep) * gridStep);
  ctx.beginPath();
  for (let gx = startGx; gx <= endGx; gx += gridStep) {
    ctx.moveTo(gx, startGy);
    ctx.lineTo(gx, endGy);
  }
  for (let gy = startGy; gy <= endGy; gy += gridStep) {
    ctx.moveTo(startGx, gy);
    ctx.lineTo(endGx, gy);
  }
  ctx.stroke();

  // 2. Terrain Zones (Mud, Sand, Rocky, Water, Slopes)
  for (let i = 0; i < map.terrainZones.length; i++) {
    const z = map.terrainZones[i];
    if (
      z.x + z.w * 0.5 < viewMinX ||
      z.x - z.w * 0.5 > viewMaxX ||
      z.y + z.h * 0.5 < viewMinY ||
      z.y - z.h * 0.5 > viewMaxY
    ) {
      continue;
    }
    ctx.save();
    ctx.fillStyle = TERRAIN_COLORS[z.type];
    ctx.beginPath();
    if (z.shape === 'rect') {
      ctx.rect(z.x - z.w * 0.5, z.y - z.h * 0.5, z.w, z.h);
    } else {
      ctx.ellipse(z.x, z.y, z.w * 0.5, z.h * 0.5, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (map.id === 'training') {
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
      ctx.textAlign = 'center';
      ctx.fillText(z.type.toUpperCase().replace('_', ' '), z.x, z.y - z.h * 0.5 + 22);
    }
    ctx.restore();
  }

  // 3. Roads
  for (let i = 0; i < map.roads.length; i++) {
    const r = map.roads[i];
    ctx.save();
    ctx.strokeStyle = '#2f353d';
    ctx.lineWidth = r.width;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(r.x1, r.y1);
    ctx.lineTo(r.x2, r.y2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([22, 18]);
    ctx.beginPath();
    ctx.moveTo(r.x1, r.y1);
    ctx.lineTo(r.x2, r.y2);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Objective Zones on ground
  for (let i = 0; i < map.objectives.length; i++) {
    const obj = map.objectives[i];
    ctx.save();
    ctx.strokeStyle = obj.completed ? 'rgba(52, 211, 153, 0.6)' : 'rgba(245, 158, 11, 0.55)';
    ctx.fillStyle = obj.completed ? 'rgba(52, 211, 153, 0.06)' : 'rgba(245, 158, 11, 0.05)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 5. Ground Decals (Footprints, craters)
  for (let i = 0; i < particles.decals.length; i++) {
    const d = particles.decals[i];
    if (!d.active) continue;
    ctx.save();
    ctx.globalAlpha = d.alpha;
    ctx.fillStyle = d.color;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    if (d.kind === 'crater') {
      ctx.beginPath();
      ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.fillRect(-d.radius, -d.radius * 0.6, d.radius * 2, d.radius * 1.2);
    }
    ctx.restore();
  }

  // 5b. Defense Relay Citadel & Persistent Hazard Zones (Radiation / Thermoblast Fire)
  if (options.defendStructure) {
    drawDefendStructure(ctx, options.defendStructure);
  }
  if (options.hazards && options.hazards.length > 0) {
    drawHazardZones(ctx, options.hazards, options.time);
  }

  // 5c. Incoming Nuclear Artillery Target Warnings
  if (options.incomingWarnings && options.incomingWarnings.length > 0) {
    drawIncomingArtilleryWarnings(ctx, options.incomingWarnings, options.time);
  }

  // 6a. Pose-Accurate Dash Afterimages
  if (options.afterimages && (options.afterimageIntensity ?? 1) > 0.02) {
    drawDashAfterimages(ctx, options.afterimages, options.afterimageIntensity ?? 1);
  }

  // 6b. Depth-sorted Ground Actors + Obstacles + Boss + Deployables (sorted by ground Y for angled 2.5D overlap!)
  const renderables: { y: number; draw: () => void }[] = [];
  const airborneMechs: MechActor[] = [];
  const vfxOpts = {
    rocketExhaustVfx: options.rocketExhaustVfx !== false,
    flightVfx: options.flightVfx !== false,
    time: options.time,
  };

  for (let i = 0; i < map.obstacles.length; i++) {
    const obs = map.obstacles[i];
    if (
      obs.x + obs.w * 0.5 < viewMinX ||
      obs.x - obs.w * 0.5 > viewMaxX ||
      obs.y + obs.h * 0.5 < viewMinY ||
      obs.y - obs.h * 0.5 > viewMaxY
    ) {
      continue;
    }
    renderables.push({
      y: obs.destroyed ? -9999 : obs.y + obs.h * 0.5,
      draw: () => drawObstacle(ctx, obs),
    });
  }

  const allMechs = [player, ...allies, ...enemies];
  for (let i = 0; i < allMechs.length; i++) {
    const m = allMechs[i];
    if (!m.alive && m.koTimer <= 0) continue;
    const effAlt = m.enemyArchetype === 'grappler' ? (m.grapplerState?.altitude ?? 0) : (m.flight?.altitude ?? 0);
    if (effAlt > 36 || (m.enemyArchetype === 'grappler' && (effAlt > 14 || Boolean(m.grapplerState?.attachedTargetId)))) {
      airborneMechs.push(m);
    } else {
      renderables.push({
        y: m.phys.pos.y,
        draw: () => drawMechActor(ctx, m, Boolean(options.hideNameplates), vfxOpts),
      });
    }
  }

  if (options.boss && (options.boss.alive || options.boss.destroying)) {
    const bossRef = options.boss;
    renderables.push({
      y: bossRef.phys.pos.y,
      draw: () => drawThunderheadBoss(ctx, bossRef, options.time),
    });
  }

  if (options.deployables && options.deployables.length > 0) {
    const deps = options.deployables;
    renderables.push({
      y: 9998,
      draw: () => drawBossDeployables(ctx, deps, options.time),
    });
  }

  if (options.friendlyDeployables && options.friendlyDeployables.length > 0) {
    const fDeps = options.friendlyDeployables;
    renderables.push({
      y: 9997,
      draw: () => drawFriendlyDeployables(ctx, fDeps, options.time),
    });
  }

  renderables.sort((a, b) => a.y - b.y);
  for (let i = 0; i < renderables.length; i++) {
    renderables[i].draw();
  }

  // 6c. Airborne Mechs, Flying Enemies & Clinging/Swinging Grapplers rendered above low cover & hosts
  if (airborneMechs.length > 0) {
    airborneMechs.sort((a, b) => {
      const altA = a.enemyArchetype === 'grappler' ? (a.grapplerState?.altitude ?? 0) : (a.flight?.altitude ?? 0);
      const altB = b.enemyArchetype === 'grappler' ? (b.grapplerState?.altitude ?? 0) : (b.flight?.altitude ?? 0);
      return altA - altB || a.phys.pos.y - b.phys.pos.y;
    });
    for (let i = 0; i < airborneMechs.length; i++) {
      drawMechActor(ctx, airborneMechs[i], Boolean(options.hideNameplates), vfxOpts);
    }
  }

  // 6d. Mechanical Grappling Hook Cable & Target Indicator
  if (options.grapple) {
    drawGrappleOverlay(ctx, player, options.grapple, options.time, options.grappleVfx !== false);
  }

  // 6e. Enemy Missile Lock-On Warning Ring around Player
  if (options.missileLockWarning && player.alive && options.showReticle) {
    const pulse = 0.5 + 0.5 * Math.sin(options.time * 18);
    const py = player.phys.pos.y - (player.flight?.altitude ?? 0) * 0.52;
    ctx.save();
    ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + pulse * 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(player.phys.pos.x, py, player.spec.radius + 18 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 6f. Active Choreographed Takedown Slash Trails & AI World-Space Minigame Bar
  if (options.takedownSessions && options.takedownSessions.length > 0) {
    for (let ti = 0; ti < options.takedownSessions.length; ti++) {
      const td = options.takedownSessions[ti];
      const ax = td.anchorPos.x;
      const ay = td.anchorPos.y;
      const sl = td.minigame.slash;

      if (sl) {
        const sProg = Math.max(0, Math.min(1, 1 - sl.phaseTimer / Math.max(0.05, sl.phaseDuration)));
        const worldSlashAng = td.anchorTargetAngle + sl.angleRad;
        if (sl.phase === 'telegraph') {
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(worldSlashAng);
          const spread = (1 - sProg) * 18;
          ctx.strokeStyle = `rgba(251, 113, 133, ${0.35 + sProg * 0.55})`;
          ctx.lineWidth = 1.4 + sProg * 1.4;
          for (const d of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-48, d * spread);
            ctx.lineTo(48, d * spread);
            ctx.stroke();
          }
          ctx.restore();
        } else if (sl.phase === 'strike') {
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(worldSlashAng);
          const alpha = 1 - Math.pow(sProg, 1.6);
          ctx.strokeStyle = `rgba(244, 63, 94, ${alpha * 0.95})`;
          ctx.lineWidth = 8 * (1 - sProg * 0.4);
          ctx.beginPath();
          ctx.arc(0, 0, 44, -0.95, 1.05);
          ctx.stroke();
          ctx.strokeStyle = `rgba(255, 241, 242, ${alpha})`;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(-54, 0);
          ctx.lineTo(54 * Math.min(1, sProg * 2), 0);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        // Dynamic crescent HF-blade slash arcs around the clashing units
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(td.anchorTargetAngle + td.progress * Math.PI * 3.2);
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.78)';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(0, 0, 38, -0.75, 0.95);
        ctx.stroke();
        ctx.strokeStyle = '#ffe4e6';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, 0, 36, -0.5, 0.7);
        ctx.stroke();
        ctx.restore();
      }

      // Wordless world-space dodge bar above AI squadmate / AI-vs-AI takedowns (strict 50% rule)
      if (td.minigame.mode === 'ai_visual' && (td.minigame.active || td.minigame.judgmentTimer > 0)) {
        const mg = td.minigame;
        const barW = 40;
        const barH = 6;
        const barY = ay - 46;
        ctx.save();
        ctx.translate(ax, barY);
        ctx.fillStyle = 'rgba(7, 11, 18, 0.88)';
        ctx.fillRect(-barW * 0.5 - 2, -barH * 0.5 - 2, barW + 4, barH + 4);
        ctx.strokeStyle =
          mg.lastJudgment === 'PERFECT' || mg.lastJudgment === 'GOOD'
            ? '#34d399'
            : mg.lastJudgment === 'MISS'
            ? '#f43f5e'
            : 'rgba(148, 163, 184, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-barW * 0.5 - 2, -barH * 0.5 - 2, barW + 4, barH + 4);

        // Danger slash zone pulse in middle
        ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
        ctx.fillRect(-6, -barH * 0.5, 12, barH);

        // Moving small cursor pip
        if (mg.active) {
          const cxBar = (mg.cursor - 0.5) * (barW - 6);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(cxBar - 2.5, -barH * 0.5 - 1, 5, barH + 2);
        }
        ctx.restore();
      }
    }
  }

  // 6g. Phantom Execution Rear-Warp Lock Bracket for AS-09 Player
  if (options.executionTargetPos && player.alive && !options.firstPersonTakedown) {
    const tx = options.executionTargetPos.x;
    const ty = options.executionTargetPos.y;
    const pulse = 0.7 + 0.3 * Math.sin(options.time * 12);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(Math.PI * 0.25);
    ctx.strokeStyle = `rgba(244, 63, 94, ${0.7 + pulse * 0.25})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(-22, -22, 44, 44);
    ctx.restore();

    ctx.save();
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fda4af';
    ctx.fillText('[V] EXECUTE', tx, ty - 34);
    ctx.restore();
  }

  // 7. Active Projectiles & Ballistic Arcs
  for (let i = 0; i < projectiles.items.length; i++) {
    const p = projectiles.items[i];
    if (!p.active) continue;

    if (p.isBallistic) {
      const t = Math.min(1, p.flightTime / p.flightDuration);
      const gx = p.startX + (p.targetX - p.startX) * t;
      const gy = p.startY + (p.targetY - p.startY) * t;
      const arcZ = Math.sin(t * Math.PI) * p.arcHeight;
      const isBossShell = Boolean(p.isBossMortar);
      const isColossusShell = Boolean(p.isPlayerMortar && p.mortarAmmo);
      const shellCol =
        isBossShell && p.warheadType
          ? WARHEAD_COLORS[p.warheadType]
          : p.mortarAmmo
          ? MORTAR_AMMO_SPECS[p.mortarAmmo].color
          : '#fb923c';

      // Ground target impact warning ring
      ctx.save();
      ctx.strokeStyle = isBossShell || isColossusShell ? shellCol : `rgba(251, 146, 60, ${0.42 + 0.48 * t})`;
      ctx.lineWidth = isBossShell ? 3.2 : isColossusShell ? 2.4 : 2.2;
      ctx.setLineDash([isBossShell ? 12 : 7, 5]);
      ctx.beginPath();
      ctx.arc(p.targetX, p.targetY, p.splashRadius * (0.25 + 0.75 * t), 0, Math.PI * 2);
      ctx.stroke();

      // Ground shadow under flying artillery shell
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.beginPath();
      ctx.ellipse(gx, gy, isBossShell ? 15 : isColossusShell ? 10 : 7, isBossShell ? 10 : 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Heavy glowing artillery / nuclear mortar shell at elevated Z
      ctx.fillStyle = shellCol;
      ctx.beginPath();
      ctx.arc(gx, gy - arcZ, isBossShell ? 15 : isColossusShell ? 10.5 : 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(gx, gy - arcZ, isBossShell ? 7.5 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === 'railgun') {
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      ctx.lineWidth = 8.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.prevX - p.vx * 0.036, p.prevY - p.vy * 0.036);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 4.2;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.9;
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'missile' && p.isCounterInterceptor) {
      const ang = Math.atan2(p.vy, p.vx);
      const elevY = p.y - (p.missileAlt ?? 0) * 0.52;
      ctx.save();
      // Subtle cyan intercept-lock diamond around the incoming hostile missile being pursued
      if (p.interceptTarget && p.interceptTarget.active) {
        const tx = p.interceptTarget.x;
        const ty = p.interceptTarget.y - (p.interceptTarget.missileAlt ?? 0) * 0.52;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 10);
        ctx.lineTo(tx + 10, ty);
        ctx.lineTo(tx, ty + 10);
        ctx.lineTo(tx - 10, ty);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.translate(p.x, elevY);
      ctx.rotate(ang);
      // Sleek white-cyan counter-interceptor dart
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -2.2);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-6, 2.2);
      ctx.closePath();
      ctx.fill();
      // Bright electric-cyan rocket plume
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(-6.5, 0, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === 'missile') {
      const mp = getMissileProfile(p.missileType);
      const ang = Math.atan2(p.vy, p.vx);
      const elevY = p.y - (p.missileAlt ?? 0) * 0.52;
      const sc = mp.scale;
      ctx.save();
      ctx.translate(p.x, elevY);
      ctx.rotate(ang);
      if (p.trackingLost) {
        ctx.globalAlpha = 0.72;
      }

      // Stabilizer fins
      ctx.fillStyle = p.team === 'player' ? '#64748b' : '#475569';
      const finSpan = mp.id === 'heavy' ? 4.8 * sc : 3.2 * sc;
      ctx.fillRect(-7.5 * sc, -finSpan, 3.4 * sc, finSpan * 2);

      // Warhead fuselage
      ctx.fillStyle = mp.bodyColor;
      const bodyLen = mp.id === 'long_range' ? 14 : 11;
      const bodyHalfH = mp.id === 'heavy' ? 2.8 : 2.1;
      ctx.fillRect(-6.5 * sc, -bodyHalfH * sc, bodyLen * sc, bodyHalfH * 2 * sc);

      // Nose cone / seeker tip
      ctx.fillStyle = mp.id === 'advanced_tracking' ? '#a855f7' : p.team === 'player' ? '#f8fafc' : '#ef4444';
      ctx.beginPath();
      ctx.moveTo((bodyLen - 6.5) * sc, -bodyHalfH * sc);
      ctx.lineTo((bodyLen - 2.2) * sc, 0);
      ctx.lineTo((bodyLen - 6.5) * sc, bodyHalfH * sc);
      ctx.closePath();
      ctx.fill();

      // Thruster flame (flickers/dims when tracking is lost)
      if (!p.trackingLost || Math.sin(options.time * 40 + i) > 0) {
        ctx.fillStyle = mp.flameColor;
        ctx.beginPath();
        ctx.arc(-8 * sc, 0, (p.trackingLost ? 2.1 : 3.6) * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (p.kind === 'repair_beam') {
      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'ewar_pulse') {
      ctx.save();
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // Heavy autocannon / coax shell tracer scaled by caliber
      const thickness = Math.max(2.0, p.caliber * 0.72);
      const tailScale = p.caliber >= 5.5 ? 0.024 : 0.014;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = p.team === 'player' ? '#f59e0b' : '#f43f5e';
      ctx.lineWidth = thickness + 1.6;
      ctx.beginPath();
      ctx.moveTo(p.prevX - p.vx * tailScale, p.prevY - p.vy * tailScale);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = Math.max(1.2, thickness * 0.55);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 7b. Active Anti-Air Point-Defense Minigun Tracer Streams
  const drawTracers = (tracers: AntiAirTracer[]) => {
    for (let tIdx = 0; tIdx < tracers.length; tIdx++) {
      const tr = tracers[tIdx];
      const alpha = Math.max(0, Math.min(1, tr.life / Math.max(0.01, tr.maxLife)));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = Math.max(1.8, 2.5 * tr.caliberScale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = Math.max(0.9, 1.1 * tr.caliberScale);
      ctx.stroke();
      if (tr.hit) {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(tr.x2, tr.y2, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };
  for (let mIdx = 0; mIdx < allMechs.length; mIdx++) {
    const m = allMechs[mIdx];
    if (m.antiAir && m.antiAir.tracers.length > 0) {
      drawTracers(m.antiAir.tracers);
    }
  }
  if (options.boss?.antiAir && options.boss.antiAir.tracers.length > 0) {
    drawTracers(options.boss.antiAir.tracers);
  }

  // 8. Particles (debris, casings, smoke, shockwaves, sparks)
  for (let i = 0; i < particles.particles.length; i++) {
    const pt = particles.particles[i];
    if (!pt.active) continue;
    const t = pt.life / pt.maxLife;
    const sz = pt.size + (pt.endSize - pt.size) * t;
    const al = pt.alpha * (1 - t);
    ctx.save();
    ctx.globalAlpha = Math.max(0, al);
    if (pt.kind === 'shockwave') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = Math.max(1.2, 5.5 * (1 - t));
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, sz, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pt.kind === 'debris' || pt.kind === 'casing') {
      ctx.translate(pt.x, pt.y - pt.z);
      ctx.rotate(pt.rotation);
      ctx.fillStyle = pt.color;
      const w = pt.kind === 'casing' ? sz * 1.5 : sz * 1.3;
      const h = pt.kind === 'casing' ? sz * 0.7 : sz;
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    } else {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - pt.z, Math.max(0.5, sz), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 8b. Temporary Environmental Illumination Flashes (Muzzle & Artillery Blasts)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.flashes.length; i++) {
    const fl = particles.flashes[i];
    if (!fl.active) continue;
    const t = fl.life / fl.maxLife;
    const a = fl.alpha * (1 - t);
    const rad = fl.radius * (0.75 + 0.35 * t);
    const grad = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rad);
    grad.addColorStop(0, fl.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fl.x, fl.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 8c. Tactical Smoke Screen Clouds (M-09 Colossus Smoke Munitions)
  if (options.smokeClouds && options.smokeClouds.length > 0) {
    for (let i = 0; i < options.smokeClouds.length; i++) {
      const sc = options.smokeClouds[i];
      if (sc.life <= 0) continue;
      const fade = Math.min(1, sc.life / 2.0);
      ctx.save();
      const grad = ctx.createRadialGradient(sc.x, sc.y, 12, sc.x, sc.y, sc.radius);
      grad.addColorStop(0, `rgba(203, 213, 225, ${0.56 * fade})`);
      grad.addColorStop(0.55, `rgba(148, 163, 184, ${0.42 * fade})`);
      grad.addColorStop(1, 'rgba(100, 116, 139, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(226, 232, 240, ${0.32 * fade})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 9. Floating Damage / Repair Numbers
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < particles.texts.length; i++) {
    const ft = particles.texts[i];
    if (!ft.active) continue;
    const al = 1 - ft.life / ft.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, al);
    ctx.fillStyle = '#090b0f';
    ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  // 10. Map Perimeter Hazard Border
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, map.width - 16, map.height - 16);

  // 11. World-space Aim Sightline & Reticle (with Ballistic Mortar Overlay for M-09 Colossus!)
  if (options.showReticle && player.alive) {
    if (options.mortarSolution && player.activeSlot === 1) {
      const ms = options.mortarSolution;
      const col = ms.ammoSpec.color;
      ctx.save();

      // Min & Max Mortar Range boundary rings
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.24)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(player.phys.pos.x, player.phys.pos.y, ms.minRange, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(player.phys.pos.x, player.phys.pos.y, ms.maxRange, 0, Math.PI * 2);
      ctx.stroke();

      // Ballistic trajectory line to clamped impact zone
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(player.phys.pos.x, player.phys.pos.y);
      ctx.lineTo(ms.targetX, ms.targetY);
      ctx.stroke();

      // Outer predicted blast radius
      ctx.globalAlpha = 0.72;
      ctx.setLineDash([10, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ms.targetX, ms.targetY, ms.ammoSpec.splashRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner predicted impact scatter circle
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(ms.targetX, ms.targetY, ms.scatterRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.14;
      ctx.fill();

      // Crosshair & Monospace Ballistic Telemetry Label
      ctx.globalAlpha = 0.95;
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#090b0f';
      const label = `${ms.ammoSpec.code} · ${ms.travelTime.toFixed(1)}s · ${Math.round(ms.clampedDist)}m${ms.inRange ? '' : ' [CLAMPED]'}`;
      ctx.fillText(label, ms.targetX + 1, ms.targetY - ms.scatterRadius - 9);
      ctx.fillStyle = col;
      ctx.fillText(label, ms.targetX, ms.targetY - ms.scatterRadius - 10);
      ctx.restore();
    } else {
      const gunSpread =
        (player.activeSlot === 2 ? player.secondary.spec.spreadRad : player.primary.spec.spreadRad) +
        (player.activeSlot === 2 ? player.secondary.spreadBloom : player.primary.spreadBloom);
      const dist = Math.hypot(cursorWorld.x - player.phys.pos.x, cursorWorld.y - player.phys.pos.y);
      const bloomRadius = Math.max(10, Math.min(36, Math.tan(gunSpread) * Math.min(420, dist)));
      const activeWeapon = player.activeSlot === 2 ? player.secondary : player.primary;
      const sensorRatio = player.health.sensors / Math.max(1, player.health.maxSensors);
      const rangeDegraded = (options.empDisruptTimer ?? 0) > 0 || sensorRatio < 0.28;

      // 11a. Optical Target Acquisition Brackets on Hovered Hostile or Boss
      let lockedTarget: { x: number; y: number; r: number; hpRatio: number; isBoss: boolean } | null = null;
      let bestLockDist = 110;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive || !e.detected) continue;
        const ey = e.phys.pos.y - (e.flight?.altitude ?? 0) * 0.52;
        const dCursor = Math.hypot(e.phys.pos.x - cursorWorld.x, ey - cursorWorld.y);
        if (dCursor < bestLockDist) {
          bestLockDist = dCursor;
          lockedTarget = {
            x: e.phys.pos.x,
            y: ey,
            r: e.spec.radius + 10,
            hpRatio: e.health.chassis / Math.max(1, e.health.maxChassis),
            isBoss: false,
          };
        }
      }
      if (options.boss && options.boss.alive) {
        const dBoss = Math.hypot(options.boss.phys.pos.x - cursorWorld.x, options.boss.phys.pos.y - cursorWorld.y);
        if (dBoss < options.boss.spec.radius + 75) {
          lockedTarget = {
            x: options.boss.phys.pos.x,
            y: options.boss.phys.pos.y,
            r: options.boss.spec.radius + 14,
            hpRatio: options.boss.hull / Math.max(1, options.boss.maxHull),
            isBoss: true,
          };
        }
      }

      if (lockedTarget && !rangeDegraded) {
        const lr = lockedTarget.r;
        const bLen = 8;
        ctx.save();
        ctx.strokeStyle = lockedTarget.isBoss ? '#f97316' : '#ef4444';
        ctx.lineWidth = 1.6;
        // 4 Acquisition corner brackets around target
        ctx.beginPath();
        ctx.moveTo(lockedTarget.x - lr, lockedTarget.y - lr + bLen);
        ctx.lineTo(lockedTarget.x - lr, lockedTarget.y - lr);
        ctx.lineTo(lockedTarget.x - lr + bLen, lockedTarget.y - lr);
        ctx.moveTo(lockedTarget.x + lr - bLen, lockedTarget.y - lr);
        ctx.lineTo(lockedTarget.x + lr, lockedTarget.y - lr);
        ctx.lineTo(lockedTarget.x + lr, lockedTarget.y - lr + bLen);
        ctx.moveTo(lockedTarget.x - lr, lockedTarget.y + lr - bLen);
        ctx.lineTo(lockedTarget.x - lr, lockedTarget.y + lr);
        ctx.lineTo(lockedTarget.x - lr + bLen, lockedTarget.y + lr);
        ctx.moveTo(lockedTarget.x + lr - bLen, lockedTarget.y + lr);
        ctx.lineTo(lockedTarget.x + lr, lockedTarget.y + lr);
        ctx.lineTo(lockedTarget.x + lr, lockedTarget.y + lr - bLen);
        ctx.stroke();

        // Micro target range & HP hairline
        const tDistM = Math.round(Math.hypot(lockedTarget.x - player.phys.pos.x, lockedTarget.y - player.phys.pos.y) * 0.1);
        ctx.fillStyle = 'rgba(10, 14, 20, 0.8)';
        ctx.fillRect(lockedTarget.x - 16, lockedTarget.y - lr - 9, 32, 3);
        ctx.fillStyle = lockedTarget.isBoss ? '#f97316' : '#ef4444';
        ctx.fillRect(lockedTarget.x - 16, lockedTarget.y - lr - 9, 32 * Math.max(0, lockedTarget.hpRatio), 3);
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${tDistM}m`, lockedTarget.x, lockedTarget.y - lr - 13);
        ctx.restore();
      }

      // 11b. Minimalist Optical Aiming Reticle
      ctx.save();
      // Faint optical sightline
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.moveTo(player.phys.pos.x, player.phys.pos.y);
      ctx.lineTo(cursorWorld.x, cursorWorld.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const reticleCol = activeWeapon.reloading
        ? 'rgba(239, 68, 68, 0.9)'
        : lockedTarget
        ? 'rgba(245, 158, 11, 0.95)'
        : 'rgba(34, 197, 94, 0.88)';
      ctx.strokeStyle = reticleCol;
      ctx.lineWidth = 1.5;

      // Crisp 4-corner military optical brackets
      const br = bloomRadius;
      const cl = 5.5;
      ctx.beginPath();
      ctx.moveTo(cursorWorld.x - br, cursorWorld.y - br + cl);
      ctx.lineTo(cursorWorld.x - br, cursorWorld.y - br);
      ctx.lineTo(cursorWorld.x - br + cl, cursorWorld.y - br);

      ctx.moveTo(cursorWorld.x + br - cl, cursorWorld.y - br);
      ctx.lineTo(cursorWorld.x + br, cursorWorld.y - br);
      ctx.lineTo(cursorWorld.x + br, cursorWorld.y - br + cl);

      ctx.moveTo(cursorWorld.x - br, cursorWorld.y + br - cl);
      ctx.lineTo(cursorWorld.x - br, cursorWorld.y + br);
      ctx.lineTo(cursorWorld.x - br + cl, cursorWorld.y + br);

      ctx.moveTo(cursorWorld.x + br - cl, cursorWorld.y + br);
      ctx.lineTo(cursorWorld.x + br, cursorWorld.y + br);
      ctx.lineTo(cursorWorld.x + br, cursorWorld.y + br - cl);
      ctx.stroke();

      // Center precision pip
      ctx.fillStyle = reticleCol;
      ctx.beginPath();
      ctx.arc(cursorWorld.x, cursorWorld.y, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Circular reload / prep / charge progress arc right around reticle
      if (activeWeapon.reloading || activeWeapon.isCharging || activeWeapon.isPreparing) {
        const prog = activeWeapon.reloading
          ? 1 - activeWeapon.reloadTimer / Math.max(0.1, activeWeapon.spec.reloadTime)
          : activeWeapon.isPreparing
          ? activeWeapon.prepTimer / Math.max(0.05, activeWeapon.spec.prepTime)
          : activeWeapon.chargeTimer / Math.max(0.05, activeWeapon.spec.chargeTime);
        ctx.strokeStyle = activeWeapon.reloading ? '#ef4444' : activeWeapon.isPreparing ? '#f97316' : '#38bdf8';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(
          cursorWorld.x,
          cursorWorld.y,
          br + 5,
          -Math.PI / 2,
          -Math.PI / 2 + Math.max(0, Math.min(1, prog)) * Math.PI * 2
        );
        ctx.stroke();
      }

      // Micro optical range readout next to reticle
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = rangeDegraded ? 'rgba(239, 68, 68, 0.8)' : 'rgba(148, 163, 184, 0.82)';
      ctx.fillText(rangeDegraded ? '---m' : `${Math.round(dist * 0.1)}m`, cursorWorld.x + br + 6, cursorWorld.y + 3);
      ctx.restore();
    }
  }

  ctx.restore();

  // 11c. Screen-Space Offscreen Directional Threat Chevrons (Distinct Grappler Approach Chevrons + Boss/Enemy Markers)
  if (options.showReticle && player.alive) {
    const threats = computeOffscreenThreats(
      camera.x,
      camera.y,
      camera.zoom,
      viewW,
      viewH,
      player.phys.pos,
      enemies,
      options.boss ?? null,
      (options.empDisruptTimer ?? 0) > 0
    );
    if (threats.length > 0) {
      ctx.save();
      for (let i = 0; i < threats.length; i++) {
        const t = threats[i];
        const isGrap = t.kind === 'grappler';
        const col =
          t.kind === 'boss'
            ? '#f97316'
            : isGrap
            ? '#fb7185'
            : t.kind === 'airborne'
            ? '#38bdf8'
            : '#ef4444';
        ctx.save();
        ctx.translate(t.screenX, t.screenY);
        ctx.rotate(t.angle);
        ctx.fillStyle = col;
        ctx.globalAlpha = t.kind === 'boss' ? 0.94 : isGrap ? (t.urgent ? 0.95 : 0.84) : 0.76;
        ctx.beginPath();
        const sz = t.kind === 'boss' ? 8.5 : isGrap ? 7 : 6;
        ctx.moveTo(sz, 0);
        ctx.lineTo(-sz * 0.7, -sz * 0.68);
        ctx.lineTo(-sz * 0.35, 0);
        ctx.lineTo(-sz * 0.7, sz * 0.68);
        ctx.closePath();
        ctx.fill();
        if (isGrap) {
          ctx.strokeStyle = t.urgent ? '#fff1f2' : '#9f1239';
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
        ctx.restore();

        if (isGrap) {
          // Subtle inward distance + pack count label anchored cleanly inside the chevron
          const insetX = t.screenX - Math.cos(t.angle) * 16;
          const insetY = t.screenY - Math.sin(t.angle) * 16 + 3;
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(255, 228, 230, 0.9)';
          const badge = t.count && t.count > 1 ? `×${t.count} ` : '';
          ctx.fillText(`${badge}${t.distMeters}m`, insetX, insetY);
        }
      }
      ctx.restore();
    }
  }

  // 12. Subtle Atmospheric Vignette, Nuclear Sky Dim, EMP Interference & Critical Hull Pulse
  if ((options.nuclearDimAlpha ?? 0) > 0.01) {
    ctx.fillStyle = `rgba(12, 10, 8, ${Math.min(0.36, options.nuclearDimAlpha ?? 0)})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  if ((options.empDisruptTimer ?? 0) > 0 && options.showReticle) {
    const empAlpha = 0.08 + 0.06 * Math.sin(options.time * 28);
    ctx.fillStyle = `rgba(56, 189, 248, ${empAlpha})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
    for (let y = 0; y < viewH; y += 18) {
      if (Math.sin(options.time * 35 + y) > 0.65) {
        ctx.fillRect(0, y, viewW, 2);
      }
    }
  }

  const hpRatio = player.health.chassis / Math.max(1, player.health.maxChassis);
  if (hpRatio < 0.35 && options.showReticle) {
    const pulse = 0.25 + 0.15 * Math.sin(options.time * 7);
    const grad = ctx.createRadialGradient(viewW * 0.5, viewH * 0.5, viewH * 0.3, viewW * 0.5, viewH * 0.5, viewW * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(185, 28, 28, ${pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // 13. First-Person POV Ambush View when Enemy Assassin Strikes Player (NEVER 3rd-Person!)
  if (options.firstPersonTakedown && player.alive) {
    const enemyActor = enemies.find((e) => e.id === options.firstPersonTakedown!.attackerId);
    renderFirstPersonTakedown(ctx, viewW, viewH, options.firstPersonTakedown, enemyActor, player, options.time);
  }
}
