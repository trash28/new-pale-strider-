import { MechActor } from './mech';
import { ProceduralLeg } from './proceduralLegs';
import { clamp01, lerpHexColor, TransformRigPose } from './transformSystem';
import { MechClassSpec } from './types';

function drawSpurGear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  teeth: number,
  angle: number,
  fill: string,
  stroke: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  const inner = radius * 0.72;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const rad = i % 2 === 0 ? radius : inner;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHydraulicPiston(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  glowAccent: string
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const midX = x1 + dx * 0.56;
  const midY = y1 + dy * 0.56;

  // Outer sleeve cylinder anchored to inner chassis
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(midX, midY);
  ctx.stroke();

  // Inner gleaming chrome piston rod anchored tightly into sliding plate
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(x1 + dx * 0.25, y1 + dy * 0.25);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Hydraulic fluid collar ring
  ctx.fillStyle = glowAccent;
  ctx.beginPath();
  ctx.arc(midX, midY, 1.9, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Renders TX-10 Proteus's distinctive base modular transformer silhouette:
 * overlapping armored cowls, exposed rotating core gears, shoulder drums,
 * telescoping pistons, folding stabilizers, and modular locking seams.
 */
export function drawProteusBaseChassis(
  ctx: CanvasRenderingContext2D,
  r: number,
  primaryCol: string,
  secCol: string,
  accentCol: string,
  time: number,
  isDash: boolean
): void {
  const microPulse = Math.sin(time * 3.4) * 0.5 + 0.5;

  // 1. Rear folding stabilizer fins
  ctx.fillStyle = secCol;
  ctx.strokeStyle = '#0b0f14';
  ctx.lineWidth = 1.6;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, sgn * r * 0.56);
    ctx.lineTo(-r * 1.24, sgn * r * 0.88);
    ctx.lineTo(-r * 1.32, sgn * r * 0.52);
    ctx.lineTo(-r * 0.96, sgn * r * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 2. Central reinforced octagonal substructure & visible gimbal gear bay
  ctx.fillStyle = '#161c24';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Counter-rotating internal gears visible between segmented armor plates
  drawSpurGear(ctx, -r * 0.14, 0, r * 0.32, 8, time * 1.1, '#334155', '#64748b');
  drawSpurGear(ctx, r * 0.18, 0, r * 0.22, 6, -time * 1.6 + 0.4, '#475569', '#94a3b8');

  // 3. Exposed shoulder actuator drums + hydraulic linkage rods
  for (const sgn of [-1, 1]) {
    drawHydraulicPiston(ctx, 0, sgn * r * 0.28, r * 0.08, sgn * r * 0.96, accentCol);

    ctx.save();
    ctx.translate(r * 0.12, sgn * r * 0.86);
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#090d12';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-r * 0.48, -r * 0.22, r * 0.96, r * 0.44, 3);
    ctx.fill();
    ctx.stroke();

    // Bearing ring lock on shoulder drum
    ctx.fillStyle = secCol;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accentCol;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  // 4. Split overlapping forward prow armor plates (communicating transformation seam)
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = primaryCol;
    ctx.strokeStyle = '#0b0f14';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(r * 1.24, sgn * 2.2);
    ctx.lineTo(r * 0.56, sgn * r * 0.72);
    ctx.lineTo(-r * 0.62, sgn * r * 0.82);
    ctx.lineTo(-r * 0.96, sgn * r * 0.44);
    ctx.lineTo(-r * 0.72, sgn * 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Telescoping armor step trim & transform hinge indicator
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 0.42, sgn * r * 0.46 - (sgn > 0 ? 4 : 0), r * 0.76, 4);

    // Transformation conduit glow seam
    ctx.strokeStyle = isDash ? '#7dd3fc' : accentCol;
    ctx.globalAlpha *= 0.65 + microPulse * 0.35;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(r * 0.98, sgn * 3.0);
    ctx.lineTo(r * 0.1, sgn * r * 0.42);
    ctx.lineTo(-r * 0.66, sgn * r * 0.48);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 5. Central spinal latch clasp
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = accentCol;
  ctx.lineWidth = 1.3;
  ctx.fillRect(-r * 0.48, -4.5, r * 1.04, 9);
  ctx.strokeRect(-r * 0.48, -4.5, r * 1.04, 9);
}

/**
 * Draws the progressive silhouette base shape for a target spec during structural_reform
 * so chassis wings, outriggers, cowls, and hull proportions emerge organically rather than popping.
 */
function drawSilhouettePanelShape(
  ctx: CanvasRenderingContext2D,
  sil: MechClassSpec['silhouette'],
  r: number,
  primaryCol: string,
  secCol: string,
  accentCol: string,
  wingDeploy: number,
  morphBlend: number
): void {
  ctx.fillStyle = primaryCol;
  ctx.strokeStyle = '#0c0f14';
  ctx.lineWidth = 1.8;

  if (sil === 'valkyrie') {
    const span = r * (0.65 + wingDeploy * 0.75);
    ctx.fillStyle = secCol;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.3, sgn * r * 0.38);
      ctx.lineTo(-r * 0.4, sgn * span);
      ctx.lineTo(-r * 0.98, sgn * (span * 0.8));
      ctx.lineTo(-r * 0.72, sgn * r * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = primaryCol;
    ctx.beginPath();
    ctx.moveTo(r * 1.38, 0);
    ctx.lineTo(r * 0.46, -r * 0.58);
    ctx.lineTo(-r * 1.05, -r * 0.42);
    ctx.lineTo(-r * 1.05, r * 0.42);
    ctx.lineTo(r * 0.46, r * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (sil === 'colossus' || sil === 'artillery') {
    const ext = r * 0.34 * clamp01(morphBlend);
    ctx.fillStyle = '#1f242c';
    for (const sgn of [-1, 1]) {
      ctx.fillRect(-r * 0.98, sgn * (r * 0.78) - (sgn < 0 ? ext : 0), r * 0.52, ext + 5);
      ctx.strokeRect(-r * 0.98, sgn * (r * 0.78) - (sgn < 0 ? ext : 0), r * 0.52, ext + 5);
    }
    ctx.fillStyle = primaryCol;
    ctx.beginPath();
    ctx.roundRect(-r * 1.12, -r * 0.86, r * 2.26, r * 1.72, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = secCol;
    ctx.fillRect(-r * 0.82, -r * 0.88, r * 1.45, 5);
    ctx.fillRect(-r * 0.82, r * 0.88 - 5, r * 1.45, 5);
  } else if (sil === 'juggernaut') {
    ctx.beginPath();
    ctx.moveTo(r * 1.02, -r * 0.55);
    ctx.lineTo(r * 1.02, r * 0.55);
    ctx.lineTo(r * 0.45, r * 0.94);
    ctx.lineTo(-r * 0.95, r * 0.94);
    ctx.lineTo(-r * 1.12, r * 0.44);
    ctx.lineTo(-r * 1.12, -r * 0.44);
    ctx.lineTo(-r * 0.95, -r * 0.94);
    ctx.lineTo(r * 0.45, -r * 0.94);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (sil === 'wedge' || sil === 'assassin' || sil === 'phantom') {
    ctx.beginPath();
    ctx.moveTo(r * 1.32, 0);
    ctx.lineTo(r * 0.35, -r * 0.74);
    ctx.lineTo(-r * 0.95, -r * 0.76);
    ctx.lineTo(-r * 1.06, 0);
    ctx.lineTo(-r * 0.95, r * 0.76);
    ctx.lineTo(r * 0.35, r * 0.74);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (sil === 'assassin') {
      const bl = r * (0.4 + morphBlend * 0.7);
      ctx.fillStyle = accentCol;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(r * 0.32, sgn * r * 0.72);
        ctx.lineTo(r * 0.32 + bl, sgn * r * 0.58);
        ctx.lineTo(r * 0.32, sgn * r * 0.58);
        ctx.closePath();
        ctx.fill();
      }
    }
  } else if (sil === 'sniper') {
    ctx.beginPath();
    ctx.moveTo(r * 1.24, -r * 0.34);
    ctx.lineTo(r * 1.24, r * 0.34);
    ctx.lineTo(-r * 1.16, r * 0.68);
    ctx.lineTo(-r * 1.3, 0);
    ctx.lineTo(-r * 1.16, -r * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(r * 1.12, -r * 0.42);
    ctx.lineTo(r * 1.12, r * 0.42);
    ctx.lineTo(r * 0.22, r * 0.84);
    ctx.lineTo(-r * 0.98, r * 0.72);
    ctx.lineTo(-r * 1.1, 0);
    ctx.lineTo(-r * 0.98, -r * 0.72);
    ctx.lineTo(r * 0.22, -r * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (sil === 'ewar') {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(-r * 0.28, 0, r * 0.42 * morphBlend, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accentCol;
      ctx.stroke();
    } else if (sil === 'engineer') {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.55);
      ctx.lineTo(r * 0.28, -r * 0.82);
      ctx.stroke();
    }
  }
}

/**
 * Complete multi-stage mechanical transformation renderer.
 * Physically slides armor blocks along hydraulic pistons, rotates internal gears & core ring,
 * retracts/deploys weaponry, slams locking clamps sequentially, and renders live progress HUD ring.
 */
export function drawTransformingMech(
  ctx: CanvasRenderingContext2D,
  mech: MechActor,
  pose: TransformRigPose,
  time: number,
  isPreview: boolean,
  drawLegFn: (ctx: CanvasRenderingContext2D, leg: ProceduralLeg, mech: MechActor, altitude?: number) => void
): void {
  const tf = mech.transform!;
  const r = pose.interpolatedRadius;
  const spreadPx = pose.cowlSpread * tf.profile.maxCowlSlide;
  const bounceShake = pose.lockBounce * Math.sin(pose.u * 140) * 1.8;
  const altitude = mech.flight?.altitude ?? 0;
  const elev = altitude * 0.52;

  ctx.save();

  // 0. Shadow scales cleanly with interpolated radius & heave lift
  ctx.save();
  ctx.translate(mech.phys.pos.x + 6, mech.phys.pos.y + 10);
  ctx.rotate(mech.phys.bodyAngle);
  ctx.fillStyle = 'rgba(0,0,0,0.44)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.2 + spreadPx * 0.35, r * 0.92 + spreadPx * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 1. Back procedural legs (already continuously interpolated in pose + LegAnimator!)
  const backLegs: ProceduralLeg[] = [];
  const frontLegs: ProceduralLeg[] = [];
  for (let i = 0; i < mech.legs.legs.length; i++) {
    const leg = mech.legs.legs[i];
    if (leg.hipPos.y < mech.phys.pos.y - 1) backLegs.push(leg);
    else frontLegs.push(leg);
  }
  for (let i = 0; i < backLegs.length; i++) {
    drawLegFn(ctx, backLegs[i], mech, altitude);
  }

  const bodyX = mech.phys.pos.x + bounceShake;
  const bodyY = mech.phys.pos.y - mech.phys.bounceZ - elev - pose.chassisLiftPx;

  // 2. Ground energy conduit circle & mechanical locking guide ring
  ctx.save();
  ctx.translate(mech.phys.pos.x, mech.phys.pos.y);
  ctx.strokeStyle = `rgba(56, 189, 248, ${0.22 + pose.seamGlow * 0.45})`;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, r + spreadPx + 8, pose.u * 4, pose.u * 4 + Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 3. Exposed Mechanical Core + Telescoping Struts + Sliding Armor Plates
  ctx.save();
  ctx.translate(bodyX, bodyY);
  ctx.rotate(mech.phys.bodyAngle);

  // 3A. Internal rotating gimbal spine (rotates smoothly during Stage 2 core_rotation!)
  ctx.save();
  ctx.rotate(pose.coreRotationRad);

  // Substructure chassis ring
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Exposed counter-rotating gear train inside core housing
  drawSpurGear(ctx, -r * 0.2, 0, r * 0.34, 9, pose.gearAngleRad, '#334155', '#94a3b8');
  drawSpurGear(ctx, r * 0.22, -r * 0.14, r * 0.24, 7, -pose.gearAngleRad * 1.25, '#475569', '#cbd5e1');
  drawSpurGear(ctx, r * 0.2, r * 0.2, r * 0.2, 6, pose.gearAngleRad * 1.4, '#1e293b', pose.colorAccent);

  // Core plasma conduit glow
  ctx.fillStyle = pose.colorAccent;
  ctx.globalAlpha = 0.35 + pose.seamGlow * 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // 3B. Telescoping hydraulic pistons tightly bridging inner hub -> each expanding armor block
  const sideOffset = r * 0.45 + spreadPx;
  const frontOffset = r * 0.5 + spreadPx * 0.65;
  const rearOffset = -r * 0.55 - spreadPx * 0.6;

  drawHydraulicPiston(ctx, 0, -r * 0.22, 0, -sideOffset, pose.colorAccent);
  drawHydraulicPiston(ctx, 0, r * 0.22, 0, sideOffset, pose.colorAccent);
  drawHydraulicPiston(ctx, r * 0.2, 0, frontOffset, 0, '#fbbf24');
  drawHydraulicPiston(ctx, -r * 0.2, 0, rearOffset, 0, '#94a3b8');

  // 3C. Target structural frame progressively materializing beneath outer cowls (0.34 -> 0.82)
  if (pose.morphBlend > 0.04) {
    ctx.save();
    const scaleTarget = 0.62 + pose.morphBlend * 0.38;
    ctx.scale(scaleTarget, scaleTarget);
    ctx.rotate(pose.coreRotationRad * 0.35 * (1 - pose.morphBlend));
    drawSilhouettePanelShape(
      ctx,
      tf.targetSpec.silhouette,
      r,
      pose.colorPrimary,
      pose.colorSecondary,
      pose.colorAccent,
      pose.wingDeploy,
      pose.morphBlend
    );
    ctx.restore();
  }

  // 3D. Port & Starboard Sliding Heavy Armor Cowls + Sequential Clamp Locks
  const plateMixCol = lerpHexColor(tf.sourcePaint.primary, tf.targetPaint.primary, pose.morphBlend);
  const trimMixCol = lerpHexColor(tf.sourcePaint.secondary, tf.targetPaint.secondary, pose.morphBlend);

  for (const sgn of [-1, 1]) {
    const clampVal = sgn < 0 ? pose.clampLeftLock : pose.clampRightLock;
    const panelY = sgn * (r * 0.52 + spreadPx * (1 - clampVal * 0.85));
    const foldTilt = sgn * pose.cowlSpread * 0.16 * (1 - pose.morphBlend);

    ctx.save();
    ctx.translate(0, panelY);
    ctx.rotate(foldTilt);
    ctx.fillStyle = plateMixCol;
    ctx.strokeStyle = '#090d12';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(r * 0.92, -sgn * 2);
    ctx.lineTo(r * 0.35, sgn * r * 0.42);
    ctx.lineTo(-r * 0.82, sgn * r * 0.42);
    ctx.lineTo(-r * 0.98, -sgn * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Trim latch & clamp lock flash
    ctx.fillStyle = clampVal > 0.82 && pose.u > 0.88 ? '#fbbf24' : trimMixCol;
    ctx.fillRect(-r * 0.52, sgn * r * 0.18 - 2.5, r * 1.05, 5);
    ctx.restore();
  }

  // 3E. Forward Prow Sliding Shield & Rear Thruster Vent Deck
  const prowX = r * 0.66 + spreadPx * 0.65 * (1 - pose.dorsalLock);
  ctx.save();
  ctx.translate(prowX, 0);
  ctx.fillStyle = plateMixCol;
  ctx.strokeStyle = '#090d12';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(r * 0.56, 0);
  ctx.lineTo(-r * 0.12, -r * 0.42);
  ctx.lineTo(-r * 0.24, 0);
  ctx.lineTo(-r * 0.12, r * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const rearX = -r * 0.72 - spreadPx * 0.52 * (1 - pose.dorsalLock);
  ctx.save();
  ctx.translate(rearX, 0);
  ctx.fillStyle = trimMixCol;
  ctx.strokeStyle = '#090d12';
  ctx.lineWidth = 1.6;
  ctx.fillRect(-r * 0.28, -r * 0.48, r * 0.42, r * 0.96);
  ctx.strokeRect(-r * 0.28, -r * 0.48, r * 0.42, r * 0.96);
  ctx.restore();

  ctx.restore(); // end hull frame

  // 4. Front procedural legs cleanly socketed over lower hull flanks
  for (let i = 0; i < frontLegs.length; i++) {
    drawLegFn(ctx, frontLegs[i], mech, altitude);
  }

  // 5. Rotating Turret Ring + Retracting Old Weapon -> Unfolding Target Ordnance
  ctx.save();
  ctx.translate(bodyX, bodyY - 3);
  ctx.rotate(mech.phys.aimAngle + pose.coreRotationRad * 0.6);

  // Old barrel retracting inside weapon bay
  if (pose.oldWeaponRetract < 0.98) {
    const ext = Math.max(0.05, 1 - pose.oldWeaponRetract);
    const oldLen = tf.sourceSpec.primaryWeapon.barrelLength * ext;
    const oldCal = tf.sourceSpec.primaryWeapon.caliber;
    ctx.fillStyle = '#1c222b';
    ctx.strokeStyle = '#090c10';
    ctx.lineWidth = 1.5;
    ctx.fillRect(3, -oldCal * 0.65, oldLen, oldCal * 1.3);
    ctx.strokeRect(3, -oldCal * 0.65, oldLen, oldCal * 1.3);
  }

  // New barrel unfolding & telescoping outward
  if (pose.newWeaponDeploy > 0.02) {
    const ext = clamp01(pose.newWeaponDeploy);
    const newLen = tf.targetSpec.primaryWeapon.barrelLength * ext;
    const newCal = tf.targetSpec.primaryWeapon.caliber;
    ctx.fillStyle = '#181e26';
    ctx.strokeStyle = '#07090d';
    ctx.lineWidth = 1.6;
    ctx.fillRect(4, -newCal * 0.7, newLen, newCal * 1.4);
    ctx.strokeRect(4, -newCal * 0.7, newLen, newCal * 1.4);

    if (tf.targetSpec.primaryWeapon.kind === 'railgun') {
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(8, -1.2, Math.max(2, newLen - 6), 2.4);
    } else if (tf.targetSpec.silhouette === 'colossus') {
      ctx.fillStyle = trimMixCol;
      ctx.fillRect(Math.max(4, newLen - 10), -newCal * 0.88, 9, newCal * 1.76);
    }
  }

  // Rotating turret cap + dorsal clamp ring
  ctx.fillStyle = trimMixCol;
  ctx.strokeStyle = '#0b0f14';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Visor optical core ignition at end of lock
  ctx.fillStyle = pose.colorAccent;
  ctx.globalAlpha = 0.25 + pose.visorIgnition * 0.75;
  ctx.fillRect(r * 0.2, -3.2, 5.5, 6.4);
  ctx.globalAlpha = 1;

  ctx.restore();

  // 6. Compact World-Space Stage Telemetry Ring above Transforming Mech
  if (!isPreview) {
    ctx.save();
    ctx.translate(bodyX, bodyY - r - 24);
    const barW = 54;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1.1;
    ctx.fillRect(-barW * 0.5, -5, barW, 5);
    ctx.strokeRect(-barW * 0.5, -5, barW, 5);

    ctx.fillStyle = pose.u > 0.9 ? '#fbbf24' : '#38bdf8';
    ctx.fillRect(-barW * 0.5 + 1, -4, (barW - 2) * pose.u, 3);

    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText(`MORPH ${Math.round(pose.u * 100)}% -> ${tf.targetSpec.code}`, 0, -9);
    ctx.restore();
  }

  ctx.restore();
}
