// Arcade flight: the mouse aims, the flyer turns to follow at its own turn rate, keys add thrust.
import * as THREE from 'three';
import type { Avatar } from '../data/avatars';
import { START, type Collider, type ColliderIndex } from './layout';

const BOOST = 2.2;
const MIN_ALT = 8;
const MAX_ALT = 1800;
const RADIUS = 3.5; // flyer's collision radius, metres
const CLEARANCE = 10; // real tiles: how far the flyer keeps above whatever is below it, metres
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Key codes per action. Descend is C, not Ctrl: Ctrl+W would close the browser tab mid-flight. */
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['Space'],
  down: ['KeyC'],
  boost: ['ShiftLeft', 'ShiftRight'],
} as const;
export const FLIGHT_KEYS = new Set<string>(Object.values(KEYS).flat());

export class Flight {
  readonly pos = new THREE.Vector3(...START.pos);
  readonly vel = new THREE.Vector3();
  /** Where the body points. */
  yaw = START.yaw;
  pitch = 0;
  /** Where the pilot is looking; the camera follows this at once. */
  aimYaw = START.yaw;
  aimPitch = -0.06;
  /** Roll, positive when banking right. */
  bank = 0;
  /** 0..1, eased. Drives camera pull-back and field of view. */
  boost = 0;
  speed = 0;
  readonly keys = new Set<string>();
  /** Soft edge of the map: beyond `radius` metres from the centre the flyer is steered back in. */
  readonly centre = new THREE.Vector2(1500, -400);
  radius = 6500;
  /** Real tiles: height of the surface under a point (null while tiles load). Replaces the box colliders. */
  terrain: ((x: number, y: number, z: number) => number | null) | null = null;
  private floor = 0;
  private tick = 0;

  private maxSpeed: number;
  private climb: number;
  private turn: number;
  private nearby: Collider[] = [];
  private desired = new THREE.Vector3();

  constructor(avatar: Avatar, private colliders: ColliderIndex) {
    this.maxSpeed = avatar.flight.topSpeed / 3.6;
    this.climb = avatar.flight.climb;
    this.turn = (avatar.flight.turnRate * Math.PI) / 180;
  }

  /** Throttle 0..1.6 for exhaust effects. */
  get throttle() {
    return clamp(this.speed / this.maxSpeed, 0, 1.6);
  }

  /** Compass heading in degrees: 0 north, 90 east. */
  get heading() {
    return ((this.aimYaw * 180) / Math.PI % 360 + 360) % 360;
  }

  look(dx: number, dy: number) {
    this.aimYaw += dx * 0.0022;
    this.aimPitch = clamp(this.aimPitch - dy * 0.0022, -1.15, 1.15);
  }

  private held(action: keyof typeof KEYS) {
    return KEYS[action].some((k) => this.keys.has(k)) ? 1 : 0;
  }

  static forward(yaw: number, pitch: number, out: THREE.Vector3) {
    return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  update(dt: number, controls: boolean) {
    const fwd = controls ? this.held('forward') - this.held('back') : 0;
    const strafe = controls ? this.held('right') - this.held('left') : 0;
    const vert = controls ? this.held('up') - this.held('down') : 0;
    const boosting = controls && this.held('boost') === 1 && fwd > 0;
    this.boost += ((boosting ? 1 : 0) - this.boost) * (1 - Math.exp(-dt * 4));

    // body turns toward the aim, no faster than this flyer can turn
    const step = this.turn * dt;
    const dYaw = clamp(angleDelta(this.yaw, this.aimYaw), -step, step);
    this.yaw += dYaw;
    this.pitch += clamp(this.aimPitch - this.pitch, -step, step);
    const yawRate = dt > 0 ? dYaw / dt : 0;

    const top = this.maxSpeed * (1 + (BOOST - 1) * this.boost);
    const d = Flight.forward(this.yaw, this.pitch, this.desired).multiplyScalar(fwd > 0 ? top : fwd < 0 ? -0.3 * this.maxSpeed : 0);
    d.x += Math.cos(this.yaw) * strafe * this.maxSpeed * 0.45;
    d.z += Math.sin(this.yaw) * strafe * this.maxSpeed * 0.45;
    d.y += vert * this.climb * (1 + this.boost);
    const busy = fwd !== 0 || strafe !== 0 || vert !== 0;
    this.vel.lerp(d, 1 - Math.exp(-dt * (busy ? 1.9 : 1.3)));
    this.pos.addScaledVector(this.vel, dt);

    this.collide();
    if (this.terrain) {
      // one ray every other frame is enough at flying speed; rise smoothly over whatever is below
      if (this.tick++ % 2 === 0) this.floor = this.terrain(this.pos.x, this.pos.y, this.pos.z) ?? this.floor;
      const min = this.floor + CLEARANCE;
      if (this.pos.y < min) {
        this.pos.y += (min - this.pos.y) * (1 - Math.exp(-dt * 8));
        this.vel.y = Math.max(0, this.vel.y);
      }
    }
    if (this.pos.y < MIN_ALT) {
      this.pos.y = MIN_ALT;
      this.vel.y = Math.max(0, this.vel.y);
    }
    if (this.pos.y > MAX_ALT) {
      this.pos.y = MAX_ALT;
      this.vel.y = Math.min(0, this.vel.y);
    }
    // soft edge of the map: steer the flyer back in rather than hitting a wall
    const ox = this.pos.x - this.centre.x, oz = this.pos.z - this.centre.y;
    const r = Math.hypot(ox, oz);
    if (r > this.radius) {
      const k = (r - this.radius) / r;
      this.pos.x -= ox * k;
      this.pos.z -= oz * k;
    }

    this.speed = this.vel.length();
    const bankTarget = clamp(strafe * 0.4 + yawRate * 0.45, -0.95, 0.95);
    this.bank += (bankTarget - this.bank) * (1 - Math.exp(-dt * 5));
  }

  /** Push the flyer out of any building it has entered, along the shortest way out. */
  private collide() {
    const p = this.pos;
    for (const c of this.colliders.near(p.x, p.z, this.nearby)) {
      if (p.y > c.y1 + RADIUS || p.y < c.y0 - RADIUS) continue;
      if (p.x < c.minX - RADIUS || p.x > c.maxX + RADIUS || p.z < c.minZ - RADIUS || p.z > c.maxZ + RADIUS) continue;
      const out = [p.x - (c.minX - RADIUS), c.maxX + RADIUS - p.x, p.z - (c.minZ - RADIUS), c.maxZ + RADIUS - p.z, c.y1 + RADIUS - p.y];
      if (c.y0 > 0) out.push(p.y - (c.y0 - RADIUS)); // raised decks can also be left downward
      let side = 0;
      for (let i = 1; i < out.length; i++) if (out[i] < out[side]) side = i;
      if (side === 0) { p.x = c.minX - RADIUS; this.vel.x = Math.min(0, this.vel.x); }
      else if (side === 1) { p.x = c.maxX + RADIUS; this.vel.x = Math.max(0, this.vel.x); }
      else if (side === 2) { p.z = c.minZ - RADIUS; this.vel.z = Math.min(0, this.vel.z); }
      else if (side === 3) { p.z = c.maxZ + RADIUS; this.vel.z = Math.max(0, this.vel.z); }
      else if (side === 4) { p.y = c.y1 + RADIUS; this.vel.y = Math.max(0, this.vel.y); }
      else { p.y = c.y0 - RADIUS; this.vel.y = Math.min(0, this.vel.y); }
    }
  }
}
