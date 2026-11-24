import { MechPhysicsState, normalizeAngle, shortestAngleDiff } from './physics';
import { ComponentHealth, TerrainType, Vec2 } from './types';

export interface FlightConfig {
  maxAltitude: number;
  hoverAltitude: number;
  ascendAccel: number;
  descendAccel: number;
  gravity: number;
  maxFlightSpeed: number;
  boostSpeedMult: number;
  thrustAccel: number;
  turnRate: number;
  heatGainPerSec: number;
  boostHeatGainPerSec: number;
  coolRatePerSec: number;
  overheatThreshold: number;
  recoverThreshold: number;
}

export const VALKYRIE_FLIGHT_CONFIG: FlightConfig = {
  maxAltitude: 155,
  hoverAltitude: 78,
  ascendAccel: 390,
  descendAccel: 320,
  gravity: 210,
  maxFlightSpeed: 295,
  boostSpeedMult: 1.48,
  thrustAccel: 540,
  turnRate: 5.4,
  heatGainPerSec: 6.5,
  boostHeatGainPerSec: 22,
  coolRatePerSec: 17,
  overheatThreshold: 100,
  recoverThreshold: 45,
};

export interface FlightState {
  altitude: number; // 0 = grounded, >0 airborne
  verticalVel: number;
  heat: number; // 0..100
  overheated: boolean;
  isAirborne: boolean;
  boosting: boolean;
  landingImpactTimer: number;
  hoverPhase: number;
  afterburnerTimer: number;
  flightStability: number; // 0..1
  exhaustPower: number; // 0..1 visual thrust flame intensity
}

export function createFlightState(startAirborne = false, initialAlt = 0): FlightState {
  return {
    altitude: startAirborne ? Math.max(48, initialAlt) : 0,
    verticalVel: 0,
    heat: 0,
    overheated: false,
    isAirborne: startAirborne,
    boosting: false,
    landingImpactTimer: 0,
    hoverPhase: Math.random() * Math.PI * 2,
    afterburnerTimer: 0,
    flightStability: 1,
    exhaustPower: startAirborne ? 0.45 : 0,
  };
}

export interface FlightInput {
  wishX: number;
  wishY: number;
  ascend: boolean;
  descend: boolean;
  boost: boolean;
  sensitivity?: number;
}

export interface FlightStepEvents {
  justTookOff: boolean;
  justLanded: boolean;
  landingSpeed: number;
}

export function stepFlightPhysics(
  phys: MechPhysicsState,
  flight: FlightState,
  cfg: FlightConfig,
  input: FlightInput,
  components: ComponentHealth,
  _terrain: TerrainType,
  dt: number
): FlightStepEvents {
  const events: FlightStepEvents = {
    justTookOff: false,
    justLanded: false,
    landingSpeed: 0,
  };

  const wasAirborne = flight.isAirborne;
  flight.hoverPhase += dt * 4.2;
  if (flight.landingImpactTimer > 0) {
    flight.landingImpactTimer = Math.max(0, flight.landingImpactTimer - dt);
  }
  if (flight.afterburnerTimer > 0) {
    flight.afterburnerTimer = Math.max(0, flight.afterburnerTimer - dt);
  }

  const engineRatio = Math.max(0.3, components.engine / Math.max(1, components.maxEngine));
  const sens = input.sensitivity ?? 1.0;

  // Energy / Heat management
  const wantBoost = Boolean(input.boost && !flight.overheated && (Math.hypot(input.wishX, input.wishY) > 0.1 || input.ascend));
  flight.boosting = wantBoost || flight.afterburnerTimer > 0;

  if (flight.boosting && flight.afterburnerTimer <= 0) {
    flight.heat = Math.min(100, flight.heat + cfg.boostHeatGainPerSec * dt);
  } else if (flight.isAirborne) {
    const idleDrain = Math.hypot(input.wishX, input.wishY) > 0.1 || input.ascend ? cfg.heatGainPerSec : -cfg.coolRatePerSec * 0.45;
    flight.heat = Math.max(0, Math.min(100, flight.heat + idleDrain * dt));
  } else {
    flight.heat = Math.max(0, flight.heat - cfg.coolRatePerSec * 1.45 * dt);
  }

  if (flight.heat >= cfg.overheatThreshold) {
    flight.overheated = true;
    flight.boosting = false;
  } else if (flight.overheated && flight.heat <= cfg.recoverThreshold) {
    flight.overheated = false;
  }

  // Vertical thrust & hover stabilization
  const thrustPenalty = flight.overheated ? 0.58 : 1.0;
  if (input.ascend) {
    flight.verticalVel += cfg.ascendAccel * engineRatio * thrustPenalty * dt;
  } else if (input.descend) {
    flight.verticalVel -= cfg.descendAccel * dt;
    if (flight.altitude <= 4) {
      flight.verticalVel = Math.min(flight.verticalVel, -65);
    }
  } else if (flight.isAirborne) {
    // Gentle hover auto-stabilizer counters gravity when neither ascending nor descending
    const targetHover = flight.altitude > 20 ? flight.altitude : cfg.hoverAltitude * 0.55;
    const altErr = targetHover - flight.altitude;
    const hoverThrust = cfg.gravity + Math.max(-90, Math.min(110, altErr * 1.8));
    flight.verticalVel += (hoverThrust - cfg.gravity) * dt;
    flight.verticalVel *= Math.exp(-3.4 * dt);
  } else {
    flight.verticalVel = 0;
  }

  if (flight.isAirborne && !input.ascend && input.descend) {
    flight.verticalVel -= cfg.gravity * 0.45 * dt;
  }

  flight.verticalVel = Math.max(-240, Math.min(260, flight.verticalVel));
  flight.altitude += flight.verticalVel * dt;

  if (flight.altitude > 2 && !wasAirborne) {
    flight.isAirborne = true;
    events.justTookOff = true;
    phys.bounceVelZ += 26;
  }

  if (flight.altitude <= 0) {
    const impact = Math.abs(flight.verticalVel);
    flight.altitude = 0;
    flight.verticalVel = 0;
    if (wasAirborne) {
      flight.isAirborne = false;
      events.justLanded = true;
      events.landingSpeed = impact;
      flight.landingImpactTimer = 0.28;
      phys.bounceVelZ -= Math.min(60, 22 + impact * 0.18);
    }
  } else if (flight.altitude >= cfg.maxAltitude) {
    flight.altitude = cfg.maxAltitude;
    if (flight.verticalVel > 0) flight.verticalVel *= 0.2;
  }

  // Horizontal aerial flight physics (runs whenever airborne!)
  if (flight.isAirborne) {
    const wishMag = Math.hypot(input.wishX, input.wishY);
    const dirX = wishMag > 0.05 ? input.wishX / wishMag : 0;
    const dirY = wishMag > 0.05 ? input.wishY / wishMag : 0;

    const boostMult = flight.boosting ? cfg.boostSpeedMult : 1.0;
    const maxAirSpd = cfg.maxFlightSpeed * boostMult * engineRatio * thrustPenalty;
    const airAccel = cfg.thrustAccel * (flight.boosting ? 1.55 : 1.0) * engineRatio * thrustPenalty * sens;

    if (wishMag > 0.05) {
      phys.vel.x += dirX * airAccel * dt;
      phys.vel.y += dirY * airAccel * dt;

      // Smooth banking orientation toward velocity/wish
      const desiredAngle = Math.atan2(dirY, dirX);
      const diff = shortestAngleDiff(phys.bodyAngle, desiredAngle);
      const turn = Math.max(-cfg.turnRate * dt, Math.min(cfg.turnRate * dt, diff));
      phys.angularVel = turn / Math.max(0.004, dt);
      phys.bodyAngle = normalizeAngle(phys.bodyAngle + turn);
    } else {
      phys.angularVel *= Math.exp(-5 * dt);
      // Aerial momentum preservation (glides farther than ground friction)
      const airDrag = Math.exp(-1.15 * dt);
      phys.vel.x *= airDrag;
      phys.vel.y *= airDrag;
    }

    const curSpd = Math.hypot(phys.vel.x, phys.vel.y);
    if (curSpd > maxAirSpd) {
      const damped = maxAirSpd + (curSpd - maxAirSpd) * Math.exp(-4.5 * dt);
      phys.vel.x = (phys.vel.x / curSpd) * damped;
      phys.vel.y = (phys.vel.y / curSpd) * damped;
    }

    phys.pos.x += phys.vel.x * dt;
    phys.pos.y += phys.vel.y * dt;

    // Chassis flight banking tilt & hover micro-bob
    const fwdX = Math.cos(phys.bodyAngle);
    const fwdY = Math.sin(phys.bodyAngle);
    const rightX = -fwdY;
    const rightY = fwdX;
    const fwdSpd = phys.vel.x * fwdX + phys.vel.y * fwdY;
    const latSpd = phys.vel.x * rightX + phys.vel.y * rightY;

    const targetTiltX = Math.max(-0.28, Math.min(0.28, fwdSpd * 0.00075));
    const targetTiltY = Math.max(-0.32, Math.min(0.32, latSpd * 0.00085 + phys.angularVel * 0.06));
    const tAlpha = 1 - Math.exp(-8 * dt);
    phys.tiltX += (targetTiltX - phys.tiltX) * tAlpha;
    phys.tiltY += (targetTiltY - phys.tiltY) * tAlpha;
    phys.bounceZ = Math.sin(flight.hoverPhase) * 2.4;
    phys.sprinting = flight.boosting;
    phys.braking = false;
    phys.recoilOffset *= Math.exp(-10 * dt);
    phys.recoilRecoverTimer = Math.max(0, phys.recoilRecoverTimer - dt);

    const spdRatio = Math.min(1, curSpd / Math.max(1, cfg.maxFlightSpeed));
    flight.flightStability = Math.max(0.35, 1 - spdRatio * 0.25 - (flight.overheated ? 0.22 : 0));
    phys.stability = flight.flightStability;
    flight.exhaustPower = Math.min(
      1,
      0.32 + spdRatio * 0.42 + (flight.boosting ? 0.35 : 0) + (input.ascend ? 0.25 : 0)
    );
  } else {
    flight.exhaustPower = Math.max(0, flight.exhaustPower - dt * 4);
    flight.flightStability = 1;
  }

  return events;
}
