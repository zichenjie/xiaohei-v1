export const WALK_DURATION_MS = 2400;
export const WALK_STRIDE_UNITS = 0.026;
export const WALK_STEPS = 4;
export type WalkDirection = "left" | "right";

export interface WalkFrame {
  progress: number;
  distance: number;
  stride: number;
}

export function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function walkFacing(progress: number, stride: number): number {
  return Math.sign(stride) * smoothStep(progress / 0.12) * (1 - smoothStep((progress - 0.82) / 0.18));
}

// Four travelling steps followed by a closing step. Feet and window use this
// same phase; the last step brings the trailing foot home without sliding.
export function walkTravel(progress: number): number {
  const t = Math.max(0, Math.min(1, progress / 0.8));
  const ramp = 0.16;
  // Integrate a smooth velocity ramp at either end, with steady cadence in
  // between. A single ease across the whole walk rushes the middle steps.
  const rampIntegral = (u: number) => u ** 3 - u ** 4 / 2;
  const distance = t < ramp ? ramp * rampIntegral(t / ramp)
    : t > 1 - ramp ? 1 - ramp - ramp * rampIntegral((1 - t) / ramp)
    : t - ramp / 2;
  return WALK_STEPS * distance / (1 - ramp);
}

export function walkPhase(progress: number): number {
  return progress < 0.8 ? walkTravel(progress) : WALK_STEPS + Math.max(0, Math.min(1, (progress - 0.8) / 0.2));
}

export function footPlacement(progress: number, side: "right" | "left", travelled: number, stride: number) {
  const phase = walkPhase(progress);
  const step = Math.min(WALK_STEPS, Math.floor(phase));
  const t = Math.min(1, phase - step);
  const swings = (step % 2 === 0) === (side === "right");
  const previousPlant = Math.max(0, step - 1);
  const nextPlant = Math.min(WALK_STEPS, step + 1);
  const plant = swings ? previousPlant + (nextPlant - previousPlant) * smoothStep(t) : step;
  return {
    x: plant * stride - travelled,
    lift: swings ? Math.sin(Math.PI * t) ** 4 * Math.min(0.009, Math.abs(stride) * 0.35) : 0
  };
}
