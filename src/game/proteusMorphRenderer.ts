import { MechActor } from './mech';
import { getProteusMorphProfile, isProteusMorphTargetId, MorphRigState } from './proteusMorphs';
import { FriendlyDeployable } from './types';

function hasMorphRig(mech: MechActor): mech is MechActor & { morphRig: MorphRigState } {
  return Boolean(mech.isProteusOrigin && mech.morphRig && isProteusMorphTargetId(mech.classId));
}

/**
 * Draws Proteus TX-series enhanced chassis hardware (in body-rotated local space):
 * - Hydraulic swinging tower shields (Standard)
 * - Ground anchor outriggers (Sniper / Artillery / Colossus)
 * - Variable-geometry aero wings & Mach afterburners (Valkyrie)
 * - Twin telescoping siege-ram gauntlets & reactive shutters (Heavy)
 * - Radial phase-capacitor petals (Phantom)
 * - Dorsal 4-joint manipulator blade arms + oversized crimson HF thermal scythes (Assassin)
 * - Side sensor strakes, capacitor fins & fab frame cradles (Recon / EWAR / Engineer)
 */
export function drawProteusMorphChassisLayer(
  ctx: CanvasRenderingContext2D,
  mech: MechActor,
  time: number
): void {
  if (!hasMorphRig(mech)) return;
  const rig = mech.morphRig;
  const r = mech.spec.radius;
  const profile = getProteusMorphProfile(rig.targetId);
  if (!profile) return;
  const accent = profile.accentColor;
  const dep = rig.abilityDeploy;
  const breathe = Math.sin(rig.stridePhase) * 1.1;
  const leanShift = rig.speedLean * 2.2;
  const bankRoll = rig.turnBank * 2.8;

  ctx.save();
  ctx.translate(leanShift, bankRoll * 0.35);

  // Subtle TX-series mechanical trim halo on shoulder seams
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.lineWidth = 1.25;

  switch (rig.targetId) {
    case 'recon': {
      // Swept forward aero-strakes + lateral thruster vents that flare on sprint/scan
      for (const sgn of [-1, 1]) {
        const vent = rig.recoilVent * 2.2 + dep * 2.8;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(r * 0.45, sgn * (r * 0.72));
        ctx.lineTo(-r * 0.78, sgn * (r * 1.18 + vent));
        ctx.lineTo(-r * 1.05, sgn * (r * 0.84 + vent * 0.6));
        ctx.lineTo(-r * 0.25, sgn * (r * 0.56));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cyan vector thruster slit
        ctx.fillStyle = dep > 0.15 || mech.phys.sprinting ? '#38bdf8' : '#0284c7';
        ctx.fillRect(-r * 0.96, sgn * (r * 0.88 + vent * 0.5) - 1.5, 5 + dep * 5, 3);
      }
      break;
    }

    case 'standard': {
      // Twin Articulated Hydraulic Tower Shields flanking torso -> swing forward & lock during Bulwark Salvo!
      const swingAng = dep * 0.82; // 0 = angled side pauldrons, 1 = locked forward V-bulwark
      const shieldDist = r * 0.92 + dep * 4;
      for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.translate(r * 0.18 + dep * 4, sgn * shieldDist);
        ctx.rotate(-sgn * (0.35 + swingAng * 0.75));
        // Hydraulic linkage arm
        ctx.fillStyle = '#334155';
        ctx.fillRect(-6, -sgn * 5, 8, 5);
        // Heavy composite shield slab
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-9, -4.5, 22, 9);
        ctx.strokeRect(-9, -4.5, 22, 9);
        ctx.fillStyle = accent;
        ctx.fillRect(-5, -2.5, 14, 3);
        ctx.restore();
      }
      if (dep > 0.25) {
        // Interlocking energy bulwark arc in front
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.42 * dep})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(r * 0.35, 0, r * 1.38, -0.78, 0.78);
        ctx.stroke();
      }
      break;
    }

    case 'sniper': {
      // 4 Hydraulic Ground Anchor Spades fold down from chassis corners during Hyper Lockdown or charge
      const spadeOut = Math.max(rig.anchorSpades, dep);
      if (spadeOut > 0.04) {
        const angles = [-0.65, 0.65, -2.42, 2.42];
        for (let i = 0; i < angles.length; i++) {
          const a = angles[i];
          const px = Math.cos(a) * (r * 0.88 + spadeOut * 14);
          const py = Math.sin(a) * (r * 0.88 + spadeOut * 14);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65);
          ctx.lineTo(px, py);
          ctx.stroke();
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(px, py, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }

    case 'heavy': {
      // Twin Telescoping Siege-Ram Hydraulic Piston Gauntlets + Reactive Side Louver Shutters!
      const ramExt = rig.ramStroke * 22 + dep * 7 + breathe * 0.4;
      for (const sgn of [-1, 1]) {
        // Reactive louver plates along flanks
        const louverOpen = rig.recoilVent * 4.5 + dep * 4;
        ctx.fillStyle = '#334155';
        ctx.fillRect(-r * 0.75, sgn * (r * 0.92 + louverOpen) - 2.5, r * 0.85, 5);
        ctx.strokeRect(-r * 0.75, sgn * (r * 0.92 + louverOpen) - 2.5, r * 0.85, 5);

        // Hydraulic ram sleeve & chrome piston rod
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(r * 0.15, sgn * r * 0.74 - 2.5, 10 + ramExt * 0.85, 5);
        // Heavy pile-bunker battering block head
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(r * 0.42 + ramExt, sgn * r * 0.74 - 5.5, 11, 11);
        ctx.strokeRect(r * 0.42 + ramExt, sgn * r * 0.74 - 5.5, 11, 11);
        ctx.fillStyle = accent;
        ctx.fillRect(r * 0.62 + ramExt, sgn * r * 0.74 - 3.5, 4, 7);
      }
      break;
    }

    case 'artillery':
    case 'colossus': {
      // 3-Point / 4-Point Hydraulic Recoil Outrigger Stabilizer Beams
      const sp = Math.max(rig.anchorSpades, dep);
      const pts =
        rig.targetId === 'colossus'
          ? [-0.55, 0.55, -2.3, 2.3]
          : [-2.15, 2.15, Math.PI];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const ext = 6 + sp * 16;
        const bx = Math.cos(a) * (r * 0.82);
        const by = Math.sin(a) * (r * 0.82);
        const tx = Math.cos(a) * (r * 0.82 + ext);
        const ty = Math.sin(a) * (r * 0.82 + ext);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.fillStyle = sp > 0.35 ? accent : '#334155';
        ctx.beginPath();
        ctx.arc(tx, ty, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#090c10';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      break;
    }

    case 'ewar': {
      // Unfolding Dorsal Capacitor Radiator Fins radiating EMP field
      const finSpread = 0.28 + dep * 0.65;
      for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.translate(-r * 0.25, sgn * r * 0.68);
        ctx.rotate(sgn * finSpread);
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(-8, -3, 20, 6);
        ctx.strokeRect(-8, -3, 20, 6);
        ctx.fillStyle = dep > 0.2 ? '#c084fc' : accent;
        ctx.fillRect(-4, -1.5, 12, 3);
        ctx.restore();
      }
      break;
    }

    case 'engineer': {
      // Side Fabricator Nanite Vault Pods + Cooling Vent Fins
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = '#064e3b';
        ctx.fillRect(-r * 0.55, sgn * r * 0.92 - 4, r * 1.1, 8);
        ctx.strokeRect(-r * 0.55, sgn * r * 0.92 - 4, r * 1.1, 8);
        ctx.fillStyle = dep > 0.2 ? '#6ee7b7' : '#34d399';
        ctx.fillRect(-r * 0.35, sgn * r * 0.92 - 2, r * 0.7, 4);
      }
      break;
    }

    case 'valkyrie': {
      // Variable-Geometry Swept Seraphim Aero Wings + Wingtip Missile Pods + Twin Plasma Afterburners!
      const sweep = rig.wingSweep; // 0 = forward spread, 1 = supersonic delta sweep
      const span = r * (2.25 - sweep * 0.42) + dep * 6;
      const rearSweep = r * (0.72 + sweep * 0.78);
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(r * 0.36, sgn * r * 0.48);
        ctx.lineTo(-rearSweep, sgn * span);
        ctx.lineTo(-rearSweep - r * 0.45, sgn * (span * 0.86));
        ctx.lineTo(-r * 0.55, sgn * r * 0.44);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Wingtip 4-cell micro-pod + leading-edge glow
        ctx.fillStyle = accent;
        ctx.fillRect(-rearSweep - 4, sgn * span - 3, 12, 6);

        // Twin plasma mach cone flames when boosting or firing Seraphim Strike
        if (mech.flight?.boosting || dep > 0.2 || mech.phys.sprinting) {
          const flen = 14 + Math.sin(time * 32 + sgn) * 4 + dep * 14;
          ctx.fillStyle = dep > 0.2 ? 'rgba(56, 189, 248, 0.85)' : 'rgba(251, 146, 60, 0.75)';
          ctx.beginPath();
          ctx.moveTo(-r * 0.95, sgn * r * 0.36 - 3);
          ctx.lineTo(-r * 0.95 - flen, sgn * r * 0.36);
          ctx.lineTo(-r * 0.95, sgn * r * 0.36 + 3);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }

    case 'phantom': {
      // 4 Radial Phase-Capacitor Petals fanning outward during teleport / Overclock Aegis
      const fan = 0.25 + dep * 0.65 + (mech.dash?.isDashing() ? 0.4 : 0);
      for (const sgn of [-1, 1]) {
        for (const front of [-1, 1]) {
          ctx.save();
          ctx.translate(front * r * 0.42, sgn * (r * 0.78 + fan * 6));
          ctx.rotate(front * sgn * fan);
          ctx.fillStyle = '#0e7490';
          ctx.fillRect(-7, -2.5, 14, 5);
          ctx.strokeRect(-7, -2.5, 14, 5);
          ctx.fillStyle = '#67e8f9';
          ctx.fillRect(-4, -1.2, 8, 2.4);
          ctx.restore();
        }
      }
      break;
    }

    case 'assassin': {
      // Articulated Dorsal Scythe Arms + Oversized Twin Crimson HF Thermal Scythes!
      const swing = dep * 0.95 + (mech.dash?.isDashing() ? 0.55 : 0);
      const bladeExtend = r * (1.58 + dep * 0.55);
      for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.translate(r * 0.12, sgn * (r * 0.72 + dep * 4));
        ctx.rotate(sgn * (-0.18 + swing * 0.42));
        // Articulated shoulder actuator block
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-7, -3.5, 13, 7);
        ctx.strokeRect(-7, -3.5, 13, 7);
        // Glowing Crimson HF Thermal Scythe edge
        ctx.fillStyle = dep > 0.15 ? '#fb7185' : '#e11d48';
        ctx.beginPath();
        ctx.moveTo(4, -sgn * 2.5);
        ctx.lineTo(bladeExtend, sgn * (4.5 + dep * 6));
        ctx.lineTo(bladeExtend * 0.78, sgn * (1.2 + dep * 3));
        ctx.lineTo(4, sgn * 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    }
  }

  ctx.restore();
}

/**
 * Draws Proteus TX-series enhanced turret/ordnance attachments (in aimAngle-rotated local space).
 */
export function drawProteusMorphTurretLayer(
  ctx: CanvasRenderingContext2D,
  mech: MechActor,
  time: number
): void {
  if (!hasMorphRig(mech)) return;
  const rig = mech.morphRig;
  const r = mech.spec.radius;
  const profile = getProteusMorphProfile(rig.targetId);
  if (!profile) return;
  const accent = profile.accentColor;
  const recoil = mech.phys.recoilOffset;
  const dep = rig.abilityDeploy;

  ctx.save();

  switch (rig.targetId) {
    case 'recon': {
      // Unfolding Dorsal Tri-Blade Radar Rotor spinning continuously
      const radarScale = 0.75 + dep * 0.55;
      ctx.save();
      ctx.translate(-r * 0.15, 0);
      ctx.rotate(rig.radarSpin);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      for (let b = 0; b < 3; b++) {
        const ang = (b * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * r * 0.72 * radarScale, Math.sin(ang) * r * 0.72 * radarScale);
        ctx.stroke();
      }
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'standard': {
      // Shoulder VLS 6-Cell Interceptor Rack (opens wide when Bulwark Salvo activates)
      const podLift = dep * 4;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#090c10';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-8, -r * 0.56 - podLift, 15, 9);
      ctx.strokeRect(-8, -r * 0.56 - podLift, 15, 9);
      ctx.fillStyle = accent;
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(-5 + c * 4, -r * 0.56 - podLift + 2, 2.4, 2.4);
        ctx.fillRect(-5 + c * 4, -r * 0.56 - podLift + 5.2, 2.4, 2.4);
      }
      break;
    }

    case 'sniper': {
      // Bifurcated Expanding Railgun Accelerator Jaws + Harmonic Focus Coils
      const barrelLen = mech.primary.spec.barrelLength;
      const chargeRatio = mech.primary.isCharging
        ? Math.min(1, mech.primary.chargeTimer / Math.max(0.05, mech.primary.spec.chargeTime))
        : 0;
      const jawSpread = 2.6 + chargeRatio * 3.8 + dep * 4.2;

      for (const sgn of [-1, 1]) {
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.1;
        ctx.fillRect(6 - recoil, sgn * jawSpread - 1.5, barrelLen + 6, 3);
        ctx.strokeRect(6 - recoil, sgn * jawSpread - 1.5, barrelLen + 6, 3);
      }

      // Faint cyan targeting laser sight line ahead of muzzle
      if (mech.alive) {
        ctx.strokeStyle =
          dep > 0.2 || chargeRatio > 0.1
            ? `rgba(34, 211, 238, ${0.42 + chargeRatio * 0.45})`
            : 'rgba(34, 211, 238, 0.2)';
        ctx.lineWidth = 1.1 + chargeRatio * 1.2;
        ctx.beginPath();
        ctx.moveTo(barrelLen + 10 - recoil, 0);
        ctx.lineTo(barrelLen + 135, 0);
        ctx.stroke();
      }
      break;
    }

    case 'heavy': {
      // Recoil Vent Exhaust Glow + Twin Barrel Stabilizer Shroud
      const vent = rig.recoilVent;
      if (vent > 0.08) {
        ctx.fillStyle = `rgba(249, 115, 22, ${0.35 + vent * 0.55})`;
        ctx.fillRect(-8, -r * 0.45, 7, 3.5);
        ctx.fillRect(-8, r * 0.45 - 3.5, 7, 3.5);
      }
      ctx.fillStyle = '#334155';
      ctx.fillRect(4 - recoil, -5.5, 16, 11);
      ctx.strokeRect(4 - recoil, -5.5, 16, 11);
      break;
    }

    case 'artillery': {
      // Hydropneumatic Breech Cradle + Recoil Recuperator Tubes
      ctx.fillStyle = '#475569';
      ctx.fillRect(-10 - recoil * 0.5, -6.5, 22, 3);
      ctx.fillRect(-10 - recoil * 0.5, 3.5, 22, 3);
      if (rig.reloadBreech > 0.05) {
        ctx.fillStyle = `rgba(251, 191, 36, ${rig.reloadBreech * 0.85})`;
        ctx.fillRect(-12, -4, 7, 8);
      }
      break;
    }

    case 'colossus': {
      // Sliding Dorsal Siege Ammo Vaults flanking mortar + Hyper-Barrels glow
      const vaultSlide = rig.reloadBreech * 5 + dep * 4;
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-14, sgn * (r * 0.54 + vaultSlide) - 4, 18, 8);
        ctx.strokeRect(-14, sgn * (r * 0.54 + vaultSlide) - 4, 18, 8);
        ctx.fillStyle = accent;
        ctx.fillRect(-10, sgn * (r * 0.54 + vaultSlide) - 1.5, 10, 3);
      }
      break;
    }

    case 'ewar': {
      // Spinning Quad-Dipole Jammer Array Mast
      ctx.save();
      ctx.translate(-3, 0);
      ctx.rotate(rig.radarSpin * 1.3);
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * (r * 0.58 + dep * 6), Math.sin(a) * (r * 0.58 + dep * 6));
        ctx.stroke();
      }
      ctx.fillStyle = dep > 0.2 ? '#e879f9' : '#a855f7';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5 + dep * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'engineer': {
      // Dual Articulated Servo Manipulator Welder Arms extending forward
      const armReach = r * 0.52 + dep * 12 + (rig.weaponExtend * 6);
      for (const sgn of [-1, 1]) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-2, sgn * r * 0.42);
        ctx.lineTo(armReach * 0.55, sgn * (r * 0.62 + dep * 4));
        ctx.lineTo(armReach, sgn * r * 0.28);
        ctx.stroke();

        ctx.fillStyle = dep > 0.2 ? '#a7f3d0' : '#10b981';
        ctx.beginPath();
        ctx.arc(armReach, sgn * r * 0.28, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (dep > 0.25) {
        // Nanite arc between manipulators
        ctx.strokeStyle = `rgba(110, 231, 183, ${0.55 + Math.sin(time * 24) * 0.3})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(armReach, -r * 0.28);
        ctx.lineTo(armReach + 4, 0);
        ctx.lineTo(armReach, r * 0.28);
        ctx.stroke();
      }
      break;
    }

    case 'valkyrie': {
      // Twin Dorsal Interceptor Pods
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-8, -r * 0.56, 13, 6);
      ctx.fillRect(-8, r * 0.56 - 6, 13, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(2, -r * 0.56 + 1.5, 3, 3);
      ctx.fillRect(2, r * 0.56 - 4.5, 3, 3);
      break;
    }

    case 'phantom': {
      // Phase Reactor Core Ring on Turret Crown
      ctx.strokeStyle = dep > 0.2 ? '#a5f3fc' : '#22d3ee';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.54 + dep * 3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'assassin': {
      // Crimson Optical Slit Boost & Shoulder Shroud
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(r * 0.2, -3.5, 6, 7);
      break;
    }
  }

  ctx.restore();
}

/**
 * Draws active Proteus TX-series special ability field rings/telegraphs in world space centered on mech.
 */
export function drawProteusMorphSpecialAura(
  ctx: CanvasRenderingContext2D,
  mech: MechActor,
  time: number
): void {
  if (!mech.alive || mech.specialActiveTimer <= 0) return;
  const kind = mech.spec.specialAbility.kind;
  const x = mech.phys.pos.x;
  const y = mech.phys.pos.y - (mech.flight?.altitude ?? 0) * 0.52;
  const r = mech.spec.radius;

  ctx.save();
  ctx.translate(x, y);

  if (kind === 'recon_apex_scan') {
    const sweepAng = (time * 3.8) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r + 65, sweepAng - 0.35, sweepAng + 0.35);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'standard_bulwark_salvo') {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, r + 16, mech.phys.bodyAngle - 1.15, mech.phys.bodyAngle + 1.15);
    ctx.stroke();
  } else if (kind === 'sniper_hyper_lockdown') {
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.68)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 20, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'heavy_siege_ram') {
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.78)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 18, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'artillery_earthshaker' || kind === 'colossus_apocalypse_salvo') {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, r + 22, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'ewar_tempest_storm') {
    const pulse = 0.5 + 0.5 * Math.sin(time * 12);
    ctx.strokeStyle = `rgba(192, 132, 252, ${0.42 + pulse * 0.38})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 28 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'engineer_fabricator_rig') {
    ctx.fillStyle = 'rgba(52, 211, 153, 0.075)';
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 360, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'valkyrie_seraphim_strike' || kind === 'phantom_overclock_aegis') {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 16, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'assassin_crimson_tempest') {
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 15, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws friendly deployed Tactical Beacons, EWAR Holo-Decoys, and Engineer Sentries.
 */
export function drawFriendlyDeployables(
  ctx: CanvasRenderingContext2D,
  deployables: readonly FriendlyDeployable[],
  time: number
): void {
  for (let i = 0; i < deployables.length; i++) {
    const dep = deployables[i];
    if (dep.hp <= 0 || dep.life <= 0) continue;

    ctx.save();
    ctx.translate(dep.x, dep.y);

    if (dep.kind === 'recon_beacon') {
      const pulse = (time * 1.4) % 1;
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.55 * (1 - pulse)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + pulse * 60, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(time * 4.5);
      ctx.strokeStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
    } else if (dep.kind === 'ewar_decoy') {
      const flicker = 0.45 + 0.35 * Math.sin(time * 18 + i);
      ctx.globalAlpha = flicker;
      ctx.fillStyle = 'rgba(167, 139, 250, 0.24)';
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, dep.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e879f9';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (dep.kind === 'engineer_sentry') {
      ctx.fillStyle = dep.hitFlashTimer > 0 ? '#ffffff' : '#1e293b';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, dep.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(dep.aimAngle);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(2, -3.5, 16, 2.8);
      ctx.fillRect(2, 0.7, 16, 2.8);
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
