import type { MechActor } from './mech';
import type { TakedownSession } from './takedownSystem';

/**
 * Dedicated First-Person POV Tactical Cockpit Ambush Renderer.
 * Enforces strict 1st-person perspective whenever an enemy stealth assassin
 * initiates a takedown against the player mech — NEVER pulling out to 3rd person.
 */
export function renderFirstPersonTakedown(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  session: TakedownSession,
  enemyActor: MechActor | undefined,
  playerActor: MechActor,
  time: number
): void {
  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const p = session.progress;
  const mg = session.minigame;
  const sl = mg.slash;

  const phaseProg = sl
    ? Math.max(0, Math.min(1, 1 - sl.phaseTimer / Math.max(0.05, sl.phaseDuration)))
    : 0;

  // Player cockpit laterally banks & rolls directly with the dodge cursor bar!
  const dodgeOffset = (mg.cursor - 0.5) * -viewW * 0.14;
  const dodgeRoll = (mg.cursor - 0.5) * -0.075;
  const strikeImpactJolt =
    sl && sl.phase === 'strike'
      ? Math.sin(phaseProg * Math.PI) * (sl.wasHit ? 22 : 9)
      : 0;
  const struggleWave = Math.sin(time * 16) * (sl?.phase === 'telegraph' ? 5.5 : 2.5);
  const missShake =
    mg.lastJudgment === 'MISS' && mg.judgmentTimer > 0
      ? Math.sin(time * 58) * 14 * (mg.judgmentTimer / 0.62)
      : 0;
  const tiltRad =
    dodgeRoll +
    Math.sin(p * Math.PI * 2.5) * 0.025 +
    (sl?.phase === 'strike' ? Math.cos(sl.angleRad) * 0.055 * Math.sin(phaseProg * Math.PI) : 0);
  const shoveBackScale = session.state === 'escaped' ? 0.58 : 1.0;

  ctx.save();

  // 1. Dark atmospheric optical pressure vignette
  const vig = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(viewW, viewH) * 0.2,
    cx,
    cy,
    Math.max(viewW, viewH) * 0.78
  );
  vig.addColorStop(0, 'rgba(9, 13, 21, 0.24)');
  vig.addColorStop(0.62, 'rgba(13, 10, 18, 0.62)');
  const vigAlert = sl?.phase === 'strike' ? 0.68 : sl?.phase === 'telegraph' ? 0.52 : 0.36;
  vig.addColorStop(1, `rgba(127, 29, 29, ${Math.min(0.88, vigAlert + mg.instability * 0.32)})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, viewW, viewH);

  // Subtle cyan/indigo outer visor time-dilation edge streaks
  ctx.save();
  for (let sIdx = 0; sIdx < 16; sIdx++) {
    const a = (sIdx / 16) * Math.PI * 2 + Math.sin(time * 1.4 + sIdx) * 0.04;
    const r0 = Math.min(viewW, viewH) * 0.44;
    const r1 = r0 + 28 + (sIdx % 3) * 14;
    ctx.strokeStyle = sIdx % 2 === 0 ? 'rgba(56, 189, 248, 0.22)' : 'rgba(129, 140, 248, 0.18)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();

  // Transform cockpit camera POV cleanly (banking with dodge bar!)
  ctx.save();
  ctx.translate(
    cx + dodgeOffset + struggleWave * 0.5 + missShake + strikeImpactJolt * 0.4,
    cy + Math.abs(struggleWave) * 0.3 + strikeImpactJolt * 0.3
  );
  ctx.rotate(tiltRad);

  // 2. Close-up Kurokage Stalker synced to current slash phase
  const lungeScale =
    (0.82 +
      (sl?.phase === 'strike'
        ? 0.44 * Math.sin(phaseProg * Math.PI * 0.85)
        : sl?.phase === 'telegraph'
        ? -0.06 * phaseProg
        : 0.14 * Math.sin(time * 3.5))) *
    shoveBackScale;
  const enemyX = sl ? (sl.zoneCenter - 0.5) * 95 + (sl.phase === 'telegraph' ? -sl.side * 38 * phaseProg : 0) : 0;
  const enemyY =
    (sl?.phase === 'strike' ? -28 * Math.sin(phaseProg * Math.PI) : 8 + Math.sin(time * 6) * 5) -
    10;
  const bodyPrimary = enemyActor?.paint.primary ?? '#1b2029';
  const accent = enemyActor?.paint.accent ?? '#f43f5e';

  ctx.save();
  ctx.translate(enemyX, enemyY);
  ctx.scale(lungeScale, lungeScale);

  // Shoulders & Armored Stealth Torso silhouette
  ctx.fillStyle = '#0f131b';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-210, 190);
  ctx.lineTo(-145, -35);
  ctx.lineTo(-55, -88);
  ctx.lineTo(55, -88);
  ctx.lineTo(145, -35);
  ctx.lineTo(210, 190);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Layered chest & head carapace plates
  ctx.fillStyle = bodyPrimary;
  ctx.beginPath();
  ctx.moveTo(-110, 150);
  ctx.lineTo(-82, -52);
  ctx.lineTo(0, -118);
  ctx.lineTo(82, -52);
  ctx.lineTo(110, 150);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Jagged stealth cowl + glowing crimson/rose mono-eye visor slit
  ctx.fillStyle = '#090b10';
  ctx.beginPath();
  ctx.moveTo(0, -130);
  ctx.lineTo(54, -76);
  ctx.lineTo(34, -22);
  ctx.lineTo(0, -8);
  ctx.lineTo(-34, -22);
  ctx.lineTo(-54, -76);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Glowing menacing optical visor tracking dodge direction
  const scanX = (mg.cursor - 0.5) * 34;
  ctx.shadowColor = accent;
  ctx.shadowBlur = sl?.phase === 'telegraph' ? 24 : 16;
  ctx.fillStyle = sl?.phase === 'telegraph' ? '#fda4af' : '#fb7185';
  ctx.fillRect(-34, -66, 68, 8);
  ctx.fillStyle = '#fff1f2';
  ctx.beginPath();
  ctx.arc(scanX, -62, sl?.phase === 'telegraph' ? 7 : 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Articulated Twin High-Frequency Thermal Blades synced to slash phase!
  for (const armSide of [-1, 1] as const) {
    const isActiveArm = sl ? (sl.side === 0 ? true : sl.side === armSide) : false;
    let armRot = armSide * -0.45 + Math.sin(time * 5 + armSide) * 0.08;
    let armReach = 0;

    if (sl && isActiveArm) {
      if (sl.phase === 'telegraph') {
        // Coil & raise blade sharply outward in wind-up
        armRot = armSide * (-0.95 - phaseProg * 0.65);
        armReach = -18 * phaseProg;
      } else if (sl.phase === 'strike') {
        // Violent downward/inward piercing cleave
        const cleave = Math.sin(Math.min(1, phaseProg * 1.15) * Math.PI * 0.5);
        armRot = armSide * (-1.55 + cleave * 2.15);
        armReach = 68 * cleave;
      } else if (sl.phase === 'recover') {
        armRot = armSide * (0.45 - phaseProg * 0.9);
        armReach = 24 * (1 - phaseProg);
      }
    }

    ctx.save();
    ctx.translate(armSide * 126, -18 + armReach * 0.35);
    ctx.rotate(armRot);

    // Mechanical forearm actuator
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.fillRect(-14, -14, 28, 118);
    ctx.strokeRect(-14, -14, 28, 118);

    // Superheated thermal blade
    const flare = isActiveArm && sl && (sl.phase === 'telegraph' || sl.phase === 'strike');
    ctx.shadowColor = accent;
    ctx.shadowBlur = flare ? 24 : 12;
    ctx.fillStyle = flare ? '#fb7185' : accent;
    ctx.beginPath();
    ctx.moveTo(-7, 92);
    ctx.lineTo(0, 265 + armReach);
    ctx.lineTo(8, 92);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff1f2';
    ctx.fillRect(-2.5, 96, 5, 148 + armReach * 0.7);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  ctx.restore();

  // 3. Synchronized Canopy Slash Telegraph Wire & Cleave Plasma Arc!
  if (sl) {
    const hazardScreenX = (sl.zoneCenter - 0.5) * viewW * 0.55;
    const len = Math.max(viewW, viewH) * 0.75;
    const cosA = Math.cos(sl.angleRad);
    const sinA = Math.sin(sl.angleRad);

    if (sl.phase === 'telegraph') {
      // Converging dual crimson laser telegraph lines narrowing to cut line
      const spread = (1 - phaseProg) * 48;
      const nx = -sinA;
      const ny = cosA;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const offsetDir of [-1, 1]) {
        ctx.strokeStyle = `rgba(251, 113, 133, ${0.28 + phaseProg * 0.55})`;
        ctx.lineWidth = 1.4 + phaseProg * 1.6;
        ctx.beginPath();
        ctx.moveTo(hazardScreenX - cosA * len + nx * spread * offsetDir, -sinA * len + ny * spread * offsetDir);
        ctx.lineTo(hazardScreenX + cosA * len + nx * spread * offsetDir, sinA * len + ny * spread * offsetDir);
        ctx.stroke();
      }
      // Center piercing flash dot at peak convergence
      if (phaseProg > 0.65) {
        const gAlpha = (phaseProg - 0.65) / 0.35;
        ctx.fillStyle = `rgba(255, 228, 230, ${gAlpha * 0.85})`;
        ctx.beginPath();
        ctx.arc(hazardScreenX, 0, 5 + gAlpha * 14, 0, Math.PI * 2);
        ctx.fill();
      }
      if (sl.secondaryZoneCenter !== null) {
        const secX = (sl.secondaryZoneCenter - 0.5) * viewW * 0.55;
        const secCos = Math.cos(sl.angleRad + 0.72);
        const secSin = Math.sin(sl.angleRad + 0.72);
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.3 + phaseProg * 0.55})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(secX - secCos * len * 0.7, -secSin * len * 0.7);
        ctx.lineTo(secX + secCos * len * 0.7, secSin * len * 0.7);
        ctx.stroke();
      }
      ctx.restore();
    } else if (sl.phase === 'strike') {
      // Full-canopy high-energy plasma blade slash ribbon!
      const alpha = 1 - Math.pow(phaseProg, 1.8);
      const cutReach = Math.min(1, phaseProg * 2.4);
      const x0 = hazardScreenX - cosA * len * 0.9;
      const y0 = -sinA * len * 0.9;
      const x1 = hazardScreenX + cosA * len * (-0.9 + cutReach * 1.8);
      const y1 = sinA * len * (-0.9 + cutReach * 1.8);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 28;
      ctx.strokeStyle = `rgba(244, 63, 94, ${alpha * 0.95})`;
      ctx.lineWidth = 22 * (1 - phaseProg * 0.55);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 241, 242, ${alpha})`;
      ctx.lineWidth = 6 * (1 - phaseProg * 0.4);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (sl.secondaryZoneCenter !== null) {
        const secX = (sl.secondaryZoneCenter - 0.5) * viewW * 0.55;
        const secCos = Math.cos(sl.angleRad + 0.72);
        const secSin = Math.sin(sl.angleRad + 0.72);
        ctx.strokeStyle = `rgba(251, 113, 133, ${alpha * 0.85})`;
        ctx.lineWidth = 12 * (1 - phaseProg * 0.5);
        ctx.beginPath();
        ctx.moveTo(secX - secCos * len * 0.75, -secSin * len * 0.75);
        ctx.lineTo(secX + secCos * len * (-0.75 + cutReach * 1.5), secSin * len * (-0.75 + cutReach * 1.5));
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Directional impact sparks flying perpendicular to slash angle
      for (let s = 0; s < 16; s++) {
        const t = (s / 15) * cutReach;
        const sx = x0 + (x1 - x0) * t;
        const sy = y0 + (y1 - y0) * t;
        const sprayAng = sl.angleRad + (s % 2 === 0 ? 1.15 : -1.15) + Math.sin(s * 7.3) * 0.35;
        const dist = (20 + (s % 5) * 18) * phaseProg;
        ctx.strokeStyle = s % 2 === 0 ? `rgba(254, 240, 138, ${alpha})` : `rgba(253, 164, 175, ${alpha})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(sprayAng) * dist, sy + Math.sin(sprayAng) * dist);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 3b. Variant-matched cockpit canopy holograms (zero text!)
  if (mg.active) {
    if (mg.variant === 'chrono_ring') {
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(viewW, viewH) * 0.36 * mg.ringTargetRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(viewW, viewH) * 0.36 * mg.ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (mg.variant === 'tri_vector') {
      ctx.save();
      for (let lane = 0; lane < 3; lane++) {
        const lx = (lane - 1) * viewW * 0.16;
        const danger = mg.dangerLanes[lane];
        const sel = mg.activeLane === lane;
        if (danger) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.16)';
          ctx.fillRect(lx - 34, -viewH * 0.42, 68, viewH * 0.84);
        } else if (sel) {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
          ctx.lineWidth = 2;
          ctx.strokeRect(lx - 32, -viewH * 0.38, 64, viewH * 0.76);
        }
      }
      ctx.restore();
    } else if (mg.variant === 'dual_arc') {
      ctx.save();
      const leftX = (mg.needleA - 0.5) * viewW * 0.52;
      const rightX = (mg.needleB - 0.5) * viewW * 0.52;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(leftX, -viewH * 0.25);
      ctx.lineTo(leftX, viewH * 0.25);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.72)';
      ctx.beginPath();
      ctx.moveTo(rightX, -viewH * 0.25);
      ctx.lineTo(rightX, viewH * 0.25);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 4. Visor Fracture Cracks when instability rises
  if (mg.instability > 0.2 || playerActor.health.chassis < playerActor.health.maxChassis * 0.5) {
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.58)';
    ctx.lineWidth = 1.6;
    const fx = -viewW * 0.24;
    const fy = -viewH * 0.18;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 55, fy + 24);
    ctx.lineTo(fx + 95, fy + 68);
    ctx.moveTo(fx + 55, fy + 24);
    ctx.lineTo(fx + 74, fy - 18);
    ctx.moveTo(viewW * 0.26, viewH * 0.14);
    ctx.lineTo(viewW * 0.19, viewH * 0.08);
    ctx.lineTo(viewW * 0.14, viewH * 0.16);
    ctx.stroke();
  }

  // 5. Armored 86-Style Cockpit Canopy Frame Struts
  ctx.strokeStyle = '#090c12';
  ctx.lineWidth = Math.max(18, viewW * 0.022);
  ctx.beginPath();
  ctx.moveTo(-viewW * 0.56, -viewH * 0.52);
  ctx.lineTo(-viewW * 0.34, 0);
  ctx.lineTo(-viewW * 0.54, viewH * 0.52);
  ctx.moveTo(viewW * 0.56, -viewH * 0.52);
  ctx.lineTo(viewW * 0.34, 0);
  ctx.lineTo(viewW * 0.54, viewH * 0.52);
  ctx.stroke();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();

  // 6. Diegetic Crimson Sensor Frame Brackets (pure geometry, ZERO text!)
  ctx.strokeStyle = sl?.phase === 'strike' ? 'rgba(251, 113, 133, 0.92)' : 'rgba(244, 63, 94, 0.55)';
  ctx.lineWidth = 2;
  const bw = 180;
  const bh = 18;
  ctx.beginPath();
  ctx.moveTo(cx - bw, 28 + bh);
  ctx.lineTo(cx - bw, 28);
  ctx.lineTo(cx - bw + 26, 28);
  ctx.moveTo(cx + bw - 26, 28);
  ctx.lineTo(cx + bw, 28);
  ctx.lineTo(cx + bw, 28 + bh);
  ctx.stroke();

  ctx.restore();
}
