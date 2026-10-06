// The numbers the streets run on, shared by the traffic model (traffic.ts) and the ground shader, which
// paints the distant traffic from the same rules. Kept apart so the shader file need not import the model.
import { BLOCK, ROAD } from './layout';

/** A block is four car slots long. */
export const SLOT = BLOCK / 4;
/** Seconds for both directions to have had their green. */
export const CYCLE = 30;
export const GREEN = 11;
export const AMBER = 2;
/** Painted stop line, and the zebra crossing beyond it: metres from the crossing road's centre line. */
export const STOP_LINE = ROAD / 2 + 5.9;
export const ZEBRA: [number, number] = [ROAD / 2 + 1.4, ROAD / 2 + 5.0];
/** Where a stopped car's front bumper is, measured the same way. */
export const STOP_FRONT = STOP_LINE + 0.5;
/** Front bumper of car n at rest: SLOT * n + FRONT0, in metres along its direction of travel. */
export const FRONT0 = BLOCK / 2 - STOP_FRONT - SLOT;
/** Lane centres, metres from the road's centre line: the inner lane and the kerb lane. */
export const LANES = [2.2, 6.5];
/** Share of the usable slots that hold a vehicle. */
export const BUSY = 0.6;
