// M1-01: one deterministic world, run the same way in Bun, the browser and CI.
// Kept after the spike as a regression test of cross-platform determinism.
// No DOM, no three: it lives in sim and must run on the server too.
import { hashNumbers } from "../hash.ts";
import { buildLevel } from "../level.ts";
import type { Rapier, World } from "../physics.ts";

export const PLANKS = 50;
export const JOINTS = 100;
const PLANK = { halfLength: 1.5, halfThickness: 0.025, halfWidth: 0.15 };

export interface ScenarioWorld {
  world: World;
  /** Plank body handles in creation order: the hash reads bodies in this order. */
  planks: number[];
}

/**
 * Banks from LEVEL, 50 planks (20 stacked on the left bank, 30 dropped into the
 * gap at varied heights and angles) and 100 fixed / revolute joints between them.
 * Everything comes from formulas on the index: no randomness.
 */
export function buildWorld(R: Rapier, dt: number): ScenarioWorld {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = dt;

  buildLevel(world, R);

  const planks: number[] = [];
  for (let i = 0; i < PLANKS; i++) {
    const stacked = i < 20;
    const angle = stacked ? (i % 2) * (Math.PI / 2) : i * 0.37;
    const axis = stacked
      ? { x: 0, y: 1, z: 0 }
      : normalize({ x: Math.sin(i), y: 1, z: Math.cos(i * 1.7) });
    const half = angle / 2;
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(
          stacked ? -14 : -4 + ((i - 20) % 10) * 0.9,
          stacked
            ? PLANK.halfThickness + i * 2.2 * PLANK.halfThickness
            : 2 + Math.floor((i - 20) / 10) * 1.5,
          stacked ? 0 : (((i * 7) % 5) - 2) * 0.8,
        )
        .setRotation({
          x: axis.x * Math.sin(half),
          y: axis.y * Math.sin(half),
          z: axis.z * Math.sin(half),
          w: Math.cos(half),
        }),
    );
    world.createCollider(
      R.ColliderDesc.cuboid(
        PLANK.halfLength,
        PLANK.halfThickness,
        PLANK.halfWidth,
      ).setDensity(500), // pine-ish, kg/m³
      body,
    );
    planks.push(body.handle);
  }

  // 100 joints: neighbours (i, i+1), then (i, i+2), then (i, i+3).
  let made = 0;
  for (const gap of [1, 2, 3]) {
    for (let i = 0; i + gap < PLANKS && made < JOINTS; i++, made++) {
      const a = world.getRigidBody(planks[i]!);
      const b = world.getRigidBody(planks[i + gap]!);
      const end = { x: PLANK.halfLength, y: 0, z: 0 };
      const start = { x: -PLANK.halfLength, y: 0, z: 0 };
      const data =
        made % 2 === 0
          ? R.JointData.fixed(end, IDENTITY, start, IDENTITY)
          : R.JointData.revolute(end, start, { x: 0, y: 0, z: 1 });
      world.createImpulseJoint(data, a, b, true);
    }
  }

  return { world, planks };
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

function normalize(v: { x: number; y: number; z: number }) {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Fingerprint of what the game cares about: every plank's position and rotation,
 * as float64 bytes, in creation order. FNV-1a, so Bun and the browser hash the
 * exact same way. (Not a hash of takeSnapshot(): it may carry bookkeeping that
 * differs while the physics is the same.)
 */
export function worldHash({ world, planks }: ScenarioWorld): string {
  const values = new Float64Array(planks.length * 7);
  planks.forEach((handle, i) => {
    const body = world.getRigidBody(handle);
    const t = body.translation();
    const r = body.rotation();
    values.set([t.x, t.y, t.z, r.x, r.y, r.z, r.w], i * 7);
  });
  return hashNumbers(values);
}

export interface ScenarioResult {
  hash: string;
  /** Hash every `traceEvery` steps, to find where two runs start to differ. */
  trace: string[];
  stepMs: { mean: number; p95: number; max: number };
  snapshotBytes: number;
}

export function runScenario(
  R: Rapier,
  {
    steps,
    dt,
    traceEvery = 0,
  }: { steps: number; dt: number; traceEvery?: number },
): ScenarioResult {
  const scenario = buildWorld(R, dt);
  const times: number[] = [];
  const trace: string[] = [];
  try {
    for (let i = 1; i <= steps; i++) {
      const start = performance.now();
      scenario.world.step();
      times.push(performance.now() - start);
      if (traceEvery > 0 && i % traceEvery === 0) {
        trace.push(worldHash(scenario));
      }
    }
    return {
      hash: worldHash(scenario),
      trace,
      stepMs: summarize(times),
      snapshotBytes: scenario.world.takeSnapshot().length,
    };
  } finally {
    scenario.world.free(); // WASM memory is not garbage-collected
  }
}

function summarize(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { mean, p95: at(0.95), max: at(1) };
}
