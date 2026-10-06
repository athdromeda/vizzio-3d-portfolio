// The contract between the landmark console (React, DOM) and the 3D scene (frame loop).
// The console writes plain objects into refs; the scene reads them every frame.
import type { V3 } from '../data/ops';

/** Where the inspect camera should be: circling `target`, or parked at `angle` when one is given. */
export interface InspectCam {
  target: V3;
  radius: number;
  height: number;
  /** Fixed bearing around the target, radians. Omit to keep circling. */
  angle?: number;
  /** Circling speed, radians per second. */
  spin?: number;
  /**
   * Shot number. When it changes the camera jumps to the new shot instead of gliding there
   * (the city tour cuts between places kilometres apart). With a cut, `angle` is only where the shot
   * starts; it then drifts at `spin`.
   */
  cut?: number;
  /** How quickly the camera settles on a new pose, per second. Higher follows a drag more closely. Default 2.2. */
  ease?: number;
  /**
   * A camera that turns on the spot instead of circling (CCTV): where it stands, then which way it looks.
   * `yaw` is the compass direction in the ground plane (0 = east, growing clockwise seen from above),
   * `pitch` is up from the horizon, both in radians. When `eye` is set the orbit fields above are ignored.
   */
  eye?: V3;
  yaw?: number;
  pitch?: number;
  /** Field of view in degrees while this pose is held. Default is the flight camera's. */
  fov?: number;
}

/** A pose for a camera standing at `eye` and looking along `yaw` and `pitch`. */
export function lookFrom(eye: V3, yaw: number, pitch: number, fov?: number, cut?: number): InspectCam {
  return { target: eye, radius: 0, height: eye[1], eye, yaw, pitch, fov, cut, ease: 9 };
}

/** The yaw and pitch that look from one point at another. */
export function aimAt(from: V3, to: V3) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(dz, dx), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** A fixed camera position looking at a point, as an inspect-camera pose. */
export function poseFrom(pos: V3, look: V3): InspectCam {
  return { target: look, radius: Math.hypot(pos[0] - look[0], pos[2] - look[2]), height: pos[1], angle: Math.atan2(pos[2] - look[2], pos[0] - look[0]) };
}

/** A DOM element pinned to a point in the city. The scene moves it; the console owns its content. */
export interface Anchor {
  el: HTMLElement;
  pos: V3;
  /** Set by the scene: measured size, and how far the tag is raised to clear its neighbours. */
  w?: number;
  h?: number;
  lift?: number;
  shown?: number;
}

/** A still rendered from the 3D scene: camera-wall tiles, replay stills, the equipment shot. */
export interface SnapJob {
  pos: V3;
  look: V3;
  fov?: number;
  /** Render the equipment model instead of the city, on a transparent ground. */
  asset?: boolean;
  /** Console drawings to include in the still, such as the alert fence. None by default. */
  overlay?: SceneOverlay;
  done: (url: string) => void;
}

export interface SceneOverlay {
  routes: boolean;
  /** Route id to show alone; null shows all routes. */
  route: string | null;
  fence: boolean;
  line: boolean;
  /** City map: which menu's lines and volumes to draw, and which of its layers are switched on. */
  map: string | null;
  layers: readonly string[];
}

export const NO_OVERLAY: SceneOverlay = { routes: false, route: null, fence: false, line: false, map: null, layers: [] };
