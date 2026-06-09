// Procedural side-view terrain as a height profile sampled at fixed spacing.
import { makeRng, lerp, clamp } from "./physics.js";

const STEP = 24; // px between height samples

export class Terrain {
  constructor(track, level, seed) {
    this.track = track;
    this.colors = track.colors;
    this.step = STEP;
    // Total world length a bit beyond the finish so the player can overshoot.
    this.length = level.distance + 600;
    this.finishX = level.distance;
    this.heights = this._generate(track, seed);
    this.baseY = 0; // set by world relative to canvas height
  }

  _generate(track, seed) {
    const rng = makeRng(seed);
    const count = Math.ceil(this.length / this.step) + 2;
    const heights = new Array(count);

    // A few sine octaves with random phase, scaled by track amplitude/roughness.
    const octaves = [
      { wl: 900, amp: track.amplitude * 1.0, ph: rng() * Math.PI * 2 },
      { wl: 360, amp: track.amplitude * 0.55 * track.roughness, ph: rng() * Math.PI * 2 },
      { wl: 150, amp: track.amplitude * 0.28 * track.roughness, ph: rng() * Math.PI * 2 },
      { wl: 70,  amp: track.amplitude * 0.12 * track.roughness, ph: rng() * Math.PI * 2 },
    ];

    for (let i = 0; i < count; i++) {
      const x = i * this.step;
      let h = 0;
      for (const o of octaves) {
        h += Math.sin((x / o.wl) * Math.PI * 2 + o.ph) * o.amp;
      }
      // Add a little jitter for texture.
      h += (rng() - 0.5) * track.amplitude * 0.1;
      heights[i] = h;
    }

    // Flatten the launch zone so the car starts on stable ground.
    const flatSamples = Math.ceil(260 / this.step);
    const target = heights[flatSamples];
    for (let i = 0; i < flatSamples; i++) {
      heights[i] = target; // dead flat start
    }
    // Smooth the transition out of the flat zone.
    for (let i = flatSamples; i < flatSamples + 4 && i < count; i++) {
      const t = (i - flatSamples) / 4;
      heights[i] = lerp(target, heights[i], t);
    }

    // Gentle ramp down near the finish so it ends on a plateau.
    const finishIdx = Math.floor(this.finishX / this.step);
    const plateau = heights[clamp(finishIdx, 0, count - 1)];
    for (let i = finishIdx; i < count; i++) {
      const t = clamp((i - finishIdx) / 6, 0, 1);
      heights[i] = lerp(heights[i], plateau, t);
    }

    return heights;
  }

  // Ground Y (world) at world x.
  groundY(x) {
    const fx = clamp(x / this.step, 0, this.heights.length - 1.001);
    const i = Math.floor(fx);
    const t = fx - i;
    const h = lerp(this.heights[i], this.heights[i + 1], t);
    return this.baseY - h;
  }

  // Upward unit normal at world x (points away from the ground).
  normal(x) {
    const dx = this.step;
    const y1 = this.groundY(x - dx);
    const y2 = this.groundY(x + dx);
    // Tangent = (2dx, y2 - y1). Normal = perpendicular, made to point up (-y).
    let nx = -(y2 - y1);
    let ny = -(2 * dx);
    const m = Math.hypot(nx, ny) || 1;
    return { x: nx / m, y: ny / m };
  }
}
