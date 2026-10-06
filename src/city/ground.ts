// On the ground: the pilot on foot, and on a motorbike. Same keys as flight, different physics.
// The world is the flight colliders: a box you are above is a floor (so roofs can be stood on),
// a box beside you is a wall. Water stops you at the shore.
import * as THREE from 'three';
import { held } from './flight';
import { landSdf, type Collider, type ColliderIndex } from './layout';
import { type Obstacle } from './street';

const GRAVITY = 24;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (rate: number, dt: number) => 1 - Math.exp(-dt * rate);

export type GroundMode = 'walk' | 'ride';

const BODY = {
  walk: { radius: 0.45, height: 1.9, step: 0.6 },
  ride: { radius: 0.8, height: 1.5, step: 0.35 },
};
/** Metres per second. */
const PACE = { jog: 4.6, sprint: 9.5, back: 0.6, ride: 30, rideBoost: 46, reverse: 4 };

export class Ground {
  /** Feet, or where the wheels touch. */
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  mode: GroundMode = 'walk';
  /** Where the body or the bike points; forward is (sin yaw, 0, -cos yaw). */
  yaw = 0;
  /** Where the camera looks. */
  aimYaw = 0;
  aimPitch = -0.12;
  /** Metres per second: signed along the bike, a magnitude on foot. */
  speed = 0;
  vy = 0;
  airborne = false;
  /** Coming down from flight under power: a controlled descent, not a fall. */
  descending = false;
  /** Bike: roll into the turn (positive right), bar angle, wheel rotation. */
  lean = 0;
  steer = 0;
  spin = 0;
  /** On foot: walk-cycle phase and how hard the legs are working (0..1). */
  stride = 0;
  effort = 0;
  boost = 0;
  /** Seconds (scene clock) of the last horn, for the headlight flash. */
  honkAt = -10;
  /** Bike: how far the rider has turned the view away from straight ahead. */
  private glance = 0;
  /** Bike: seconds since it last ran into something, counting down. */
  private pinned = 0;
  private nearby: Collider[] = [];
  /** Vehicles close by (the city refreshes this list every frame): they cannot be walked or ridden through. */
  obstacles: Obstacle[] = [];
  /** The vehicle being stood on, if any: it carries whoever is on its roof. */
  private carrier: Obstacle | null = null;

  constructor(
    private colliders: ColliderIndex,
    readonly keys: Set<string>,
    private centre: THREE.Vector2,
    private radius: number,
  ) {}

  get heading() {
    return ((this.aimYaw * 180) / Math.PI % 360 + 360) % 360;
  }

  look(dx: number, dy: number) {
    if (this.mode === 'ride') this.glance = clamp(this.glance + dx * 0.0022, -2.6, 2.6);
    else this.aimYaw += dx * 0.0022;
    this.aimPitch = clamp(this.aimPitch - dy * 0.0022, -0.95, 0.55);
  }

  /** Put the pilot here, coming down from flight. */
  arrive(pos: THREE.Vector3, yaw: number) {
    this.mode = 'walk';
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = this.aimYaw = yaw;
    this.aimPitch = -0.2;
    this.speed = 0;
    this.vy = 0;
    this.airborne = this.descending = true;
  }

  mount(x: number, z: number, yaw: number) {
    this.mode = 'ride';
    this.pos.set(x, this.floor(x, z, this.pos.y + 1, BODY.ride.step), z);
    this.vel.set(0, 0, 0);
    this.yaw = this.aimYaw = yaw;
    this.glance = 0;
    this.speed = this.lean = this.steer = this.pinned = 0;
  }

  /** Step off to the left of the bike. Returns where the bike stays. */
  dismount() {
    const left = { x: -Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    const bike = { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
    this.mode = 'walk';
    this.pos.x += left.x * 1.1;
    this.pos.z += left.z * 1.1;
    this.aimYaw = this.yaw;
    this.speed = this.lean = 0;
    this.vel.set(0, 0, 0);
    return bike;
  }

  /** Highest surface under (x, z) that can be reached from height y: the street, or a roof at most a step up. */
  private floor(x: number, z: number, y: number, step: number) {
    let f = 0;
    for (const c of this.colliders.near(x, z, this.nearby)) {
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (c.y1 <= y + step && c.y1 > f) f = c.y1;
    }
    // a vehicle's roof is a floor too, for anyone who lands on it
    this.carrier = null;
    for (const o of this.obstacles) {
      const dx = x - o.x, dz = z - o.z;
      if (Math.abs(dx * o.fx + dz * o.fz) > o.hl || Math.abs(dx * o.fz - dz * o.fx) > o.hw) continue;
      if (o.top <= y + step && o.top > f) {
        f = o.top;
        this.carrier = o;
      }
    }
    return f;
  }

  /** Push out of anything standing beside the body. Returns true when something was hit. */
  private walls(r: number, height: number, step: number) {
    const p = this.pos;
    let hit = false;
    for (const c of this.colliders.near(p.x, p.z, this.nearby)) {
      if (c.y1 <= p.y + step || p.y + height < c.y0) continue; // a floor, or overhead
      if (p.x < c.minX - r || p.x > c.maxX + r || p.z < c.minZ - r || p.z > c.maxZ + r) continue;
      const out = [p.x - (c.minX - r), c.maxX + r - p.x, p.z - (c.minZ - r), c.maxZ + r - p.z];
      let side = 0;
      for (let i = 1; i < 4; i++) if (out[i] < out[side]) side = i;
      if (side === 0) p.x = c.minX - r;
      else if (side === 1) p.x = c.maxX + r;
      else if (side === 2) p.z = c.minZ - r;
      else p.z = c.maxZ + r;
      hit = true;
    }
    // vehicles: boxes turned the way they face. Pushed out through the nearer side, so a moving one shoves.
    for (const o of this.obstacles) {
      if (o.top <= p.y + step) continue;
      const dx = p.x - o.x, dz = p.z - o.z;
      const along = dx * o.fx + dz * o.fz, side = dx * o.fz - dz * o.fx;
      const pa = o.hl + r - Math.abs(along), ps = o.hw + r - Math.abs(side);
      if (pa <= 0 || ps <= 0) continue;
      if (ps < pa) {
        const k = ps * Math.sign(side || 1);
        p.x += o.fz * k;
        p.z -= o.fx * k;
      } else {
        const k = pa * Math.sign(along || 1);
        p.x += o.fx * k;
        p.z += o.fz * k;
      }
      hit = true;
    }
    return hit;
  }

  /** Move across the ground, stopping at walls and at the water's edge. Returns true when blocked. */
  private travel(dx: number, dz: number) {
    const p = this.pos;
    const body = BODY[this.mode];
    const x0 = p.x, z0 = p.z;
    p.x += dx;
    p.z += dz;
    let blocked = this.walls(body.radius, body.height, body.step);
    // the shore: no stepping off the land (unless already over the water, on a ship or in the air)
    if (p.y < 3) {
      const before = landSdf(x0, z0), after = landSdf(p.x, p.z);
      if (after < 1 && after < before) {
        if (landSdf(p.x, z0) >= Math.min(1, before)) p.z = z0;
        else if (landSdf(x0, p.z) >= Math.min(1, before)) p.x = x0;
        else {
          p.x = x0;
          p.z = z0;
        }
        blocked = true;
      }
    }
    // the edge of the map
    const ox = p.x - this.centre.x, oz = p.z - this.centre.y;
    const far = Math.hypot(ox, oz);
    if (far > this.radius) {
      p.x -= (ox * (far - this.radius)) / far;
      p.z -= (oz * (far - this.radius)) / far;
    }
    return blocked;
  }

  update(dt: number, controls: boolean) {
    const k = this.keys;
    const fwd = controls ? held(k, 'forward') - held(k, 'back') : 0;
    const side = controls ? held(k, 'right') - held(k, 'left') : 0;
    const jump = controls && held(k, 'up') === 1;
    const fast = controls && held(k, 'boost') === 1;
    const body = BODY[this.mode];

    if (this.mode === 'walk') {
      // the body faces where the camera looks; W A S D move relative to that
      this.yaw += Math.atan2(Math.sin(this.aimYaw - this.yaw), Math.cos(this.aimYaw - this.yaw)) * ease(14, dt);
      const top = fast && fwd > 0 ? PACE.sprint : PACE.jog;
      let wx = Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * side;
      let wz = -Math.cos(this.yaw) * fwd + Math.sin(this.yaw) * side;
      const len = Math.hypot(wx, wz);
      const pace = len > 0 ? top * (fwd < 0 ? PACE.back : 1) : 0;
      if (len > 0) {
        wx = (wx / len) * pace;
        wz = (wz / len) * pace;
      }
      const grip = this.airborne ? 2 : 11;
      this.vel.x += (wx - this.vel.x) * ease(grip, dt);
      this.vel.z += (wz - this.vel.z) * ease(grip, dt);
      this.travel(this.vel.x * dt, this.vel.z * dt);
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      this.effort += (clamp(this.speed / PACE.sprint, 0, 1) - this.effort) * ease(8, dt);
      this.stride += this.speed * dt * 2.1 * (fwd < 0 ? -1 : 1);
      this.boost += ((fast && fwd > 0 ? 0.4 : 0) - this.boost) * ease(4, dt);
      if (jump && !this.airborne) {
        this.vy = 8.2;
        this.airborne = true;
      }
    } else {
      // throttle, brake, then reverse; drag when coasting
      const boosting = fast && fwd > 0;
      const top = boosting ? PACE.rideBoost : PACE.ride;
      if (!this.airborne) {
        if (fwd > 0) this.speed = Math.min(top, this.speed + (boosting ? 15 : 10) * dt * (this.speed < 0 ? 2.5 : 1));
        else if (fwd < 0) this.speed = this.speed > 0.4 ? Math.max(0, this.speed - 26 * dt) : Math.max(-PACE.reverse, this.speed - 5 * dt);
        else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.2 * dt);
        if (this.speed > top) this.speed = Math.max(top, this.speed - 12 * dt);
      }
      this.boost += ((boosting ? 1 : 0) - this.boost) * ease(4, dt);
      // steering: quick at walking pace, wide and stable at speed
      this.steer += (side - this.steer) * ease(this.airborne ? 2 : 7, dt);
      const v = Math.abs(this.speed);
      // a bike only turns while it rolls; nose against a wall it may still be walked round, or nobody gets out again
      this.pinned = Math.max(0, this.pinned - dt);
      const walked = this.pinned > 0 && fwd !== 0 ? 0.45 : 0;
      const turn = this.steer * Math.max(clamp(v / 2.5, 0, 1), walked) * (1.9 / (1 + v / 22)) * Math.sign(v > 0.3 ? this.speed : fwd || 1);
      if (!this.airborne) this.yaw += turn * dt;
      this.lean += (clamp(Math.atan((v * turn) / 9.8) * 0.9, -0.78, 0.78) - this.lean) * ease(6, dt);
      this.spin += (this.speed * dt) / 0.32;
      const x0 = this.pos.x, z0 = this.pos.z;
      const blocked = this.travel(Math.sin(this.yaw) * this.speed * dt, -Math.cos(this.yaw) * this.speed * dt);
      if (blocked && dt > 0) {
        // what is left of the motion along the bike: a wall met at a slant is slid along, a square hit is a knock back
        const made = ((this.pos.x - x0) * Math.sin(this.yaw) - (this.pos.z - z0) * Math.cos(this.yaw)) / dt;
        this.speed = v > 8 && Math.abs(made) < v * 0.35 ? -this.speed * 0.18 : made;
        this.pinned = 0.5;
      }
      this.vel.set(Math.sin(this.yaw) * this.speed, 0, -Math.cos(this.yaw) * this.speed);
      if (jump && !this.airborne) {
        this.vy = 6.2 + v * 0.07;
        this.airborne = true;
      }
      // the view swings back to straight ahead once the bike is moving
      this.glance *= Math.exp(-dt * 1.6 * clamp(v / 6, 0, 1));
      this.aimYaw = this.yaw + this.glance;
    }

    // up and down
    const floor = this.floor(this.pos.x, this.pos.z, this.pos.y, body.step);
    if (this.carrier && !this.airborne) {
      this.pos.x += this.carrier.vx * dt;
      this.pos.z += this.carrier.vz * dt;
    }
    if (this.descending) this.vy = -clamp((this.pos.y - floor) * 2.2, 5, 36);
    else if (this.airborne) this.vy = Math.max(-45, this.vy - GRAVITY * dt);
    this.pos.y += this.vy * dt;
    if (this.pos.y <= floor) {
      this.pos.y = floor;
      this.vy = 0;
      this.airborne = this.descending = false;
    } else {
      this.airborne = true;
    }
  }
}
