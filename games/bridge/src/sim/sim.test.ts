import { beforeAll, describe, expect, test } from "bun:test";

import { quantizeYaw } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import { actions } from "./actions.ts";
import type { Action } from "./actions.ts";
import { hashNumbers } from "./hash.ts";
import { LEVEL } from "./level.ts";
import { loadPhysics, physicsMemoryBytes } from "./physics.ts";
import type { Rapier } from "./physics.ts";
import { createSim, SPAWN, TICK_RATE, WALK_SPEED } from "./sim.ts";
import type { Sim, SimState } from "./type.ts";

let R: Rapier;

beforeAll(async () => {
  R = await loadPhysics();
});

/** A frame with these actions held and the camera turned by `yawRadians`. */
const frame = (held: Action[] = [], yawRadians = 0): InputFrame => ({
  tick: 0,
  held: held.reduce((mask, action) => (mask | actions.bit(action)) >>> 0, 0),
  pressed: 0,
  released: 0,
  yaw: quantizeYaw(yawRadians),
});

const run = (sim: Sim, input: InputFrame, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    sim.step(input);
  }
  return sim.state();
};

/** A sim that has settled on the ground; disposed after the test body. */
function withSim(body: (sim: Sim) => void) {
  const sim = createSim(R);
  try {
    run(sim, frame(), 0.5);
    body(sim);
  } finally {
    sim.dispose();
  }
}

const moved = (from: SimState, to: SimState) => ({
  x: to.avatar.x - from.avatar.x,
  z: to.avatar.z - from.avatar.z,
  distance: Math.hypot(
    to.avatar.x - from.avatar.x,
    to.avatar.z - from.avatar.z,
  ),
});

/** The camera yaw that looks along +X, across the gap. */
const TOWARDS_GAP = -Math.PI / 2;

describe("standing", () => {
  test("starts on the left bank and stays on the ground", () => {
    withSim((sim) => {
      const state = run(sim, frame(), 5);

      expect(state.avatar.grounded).toBe(true);
      expect(state.avatar.y).toBeGreaterThanOrEqual(0);
      expect(state.avatar.y).toBeLessThan(0.02); // the controller's offset
      // Rapier works in float32: positions are exact to ~10 µm, not to 1e-6.
      expect(Math.abs(state.avatar.x - SPAWN.x)).toBeLessThan(1e-4);
      expect(Math.abs(state.avatar.z - SPAWN.z)).toBeLessThan(1e-4);
      expect(state.respawns).toBe(0);
    });
  });

  test("no input moves nothing and keeps the facing", () => {
    withSim((sim) => {
      const before = sim.state();
      const after = run(sim, frame(), 1);

      expect(moved(before, after).distance).toBeLessThan(1e-4);
      expect(after.avatar.facing).toBe(before.avatar.facing);
    });
  });
});

describe("walking", () => {
  // Along the bank (−Z / +Z / ±X near the spawn), so nobody falls off mid-test.
  test("forward at yaw 0 walks along −Z at WALK_SPEED", () => {
    withSim((sim) => {
      const before = sim.state();
      const after = run(sim, frame(["forward"]), 1);
      const step = moved(before, after);

      expect(Math.abs(step.x)).toBeLessThan(1e-3);
      expect(step.z).toBeLessThan(0);
      expect(Math.abs(step.distance - WALK_SPEED)).toBeLessThan(1e-3);
    });
  });

  test("a diagonal is not faster than a straight line", () => {
    let straight = 0;
    let diagonal = 0;
    withSim((sim) => {
      const before = sim.state();
      straight = moved(before, run(sim, frame(["forward"]), 1)).distance;
    });
    withSim((sim) => {
      const before = sim.state();
      diagonal = moved(
        before,
        run(sim, frame(["forward", "right"]), 1),
      ).distance;
    });

    expect(Math.abs(diagonal - straight)).toBeLessThan(1e-3);
  });

  test("opposite keys cancel out", () => {
    withSim((sim) => {
      const before = sim.state();
      const after = run(sim, frame(["forward", "back", "left", "right"]), 1);

      expect(moved(before, after).distance).toBeLessThan(1e-4);
    });
  });

  test("forward follows the camera: at yaw π/2 it walks along −X", () => {
    withSim((sim) => {
      const before = sim.state();
      const step = moved(before, run(sim, frame(["forward"], Math.PI / 2), 1));

      expect(Math.abs(step.x + WALK_SPEED)).toBeLessThan(1e-3);
      expect(Math.abs(step.z)).toBeLessThan(1e-3);
    });
  });

  test("the avatar turns to face where it walks", () => {
    withSim((sim) => {
      expect(run(sim, frame(["forward"]), 0.1).avatar.facing).toBeCloseTo(0, 3);
      // Walking towards +X (right at yaw 0) means looking at −π/2.
      expect(run(sim, frame(["right"]), 0.1).avatar.facing).toBeCloseTo(
        -Math.PI / 2,
        3,
      );
    });
  });
});

describe("falling", () => {
  test("walking into the gap falls and respawns at the spawn", () => {
    withSim((sim) => {
      let state = sim.state();
      // 4 m to the edge at ~4 m/s, then ~1 s of falling to RESPAWN_Y.
      for (let i = 0; i < 5 * TICK_RATE && state.respawns === 0; i++) {
        sim.step(frame(["forward"], TOWARDS_GAP));
        state = sim.state();
        if (state.avatar.x > -LEVEL.gap / 2 + 1) {
          expect(state.avatar.grounded).toBe(false); // over the gap
        }
      }

      expect(state.respawns).toBe(1);
      expect(Math.abs(state.avatar.x - SPAWN.x)).toBeLessThan(1e-4);
      expect(Math.abs(state.avatar.y - SPAWN.y)).toBeLessThan(1e-4);
      expect(state.avatar.facing).toBeCloseTo(SPAWN.facing, 6);
      // Standing again afterwards, not still falling.
      expect(run(sim, frame(), 1).avatar.grounded).toBe(true);
    });
  });

  test("walking off the outer edge falls and respawns too", () => {
    withSim((sim) => {
      // Away from the gap (−X): the left bank ends 9 m behind the spawn.
      const state = run(sim, frame(["forward"], -TOWARDS_GAP), 5);

      expect(state.respawns).toBe(1);
    });
  });
});

/**
 * A scripted session: walk to the gap, fall, respawn, walk sideways, turn the
 * camera. Its hash must not change unless the game's physics deliberately does.
 */
function scriptedSession(sim: Sim): string {
  const states: number[] = [];
  const record = (state: SimState) =>
    states.push(
      state.tick,
      state.respawns,
      state.avatar.x,
      state.avatar.y,
      state.avatar.z,
      state.avatar.facing,
      Number(state.avatar.grounded),
    );
  const script: [Action[], number, number][] = [
    [[], 0, 0.5],
    [["forward"], TOWARDS_GAP, 4],
    [["right"], TOWARDS_GAP, 3],
    [["forward", "left"], 0.3, 2],
  ];
  for (const [held, yaw, seconds] of script) {
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      sim.step(frame(held, yaw));
      record(sim.state());
    }
  }
  return hashNumbers(states);
}

describe("determinism", () => {
  /** Recorded on macOS arm64; CI checks it on Linux x64 (see M1-01). */
  const GOLDEN = "f81faa93";

  test("a scripted session matches the golden hash", () => {
    const sim = createSim(R);
    try {
      expect(scriptedSession(sim)).toBe(GOLDEN);
    } finally {
      sim.dispose();
    }
  });

  test.each([
    ["while walking", 2],
    // 9 m to the edge at 4 m/s (2.25 s), then ~1.1 s of falling.
    ["while falling", 2.8],
  ])("restoring a snapshot taken %s replays identically", (_, seconds) => {
    const sim = createSim(R);
    try {
      const walk = frame(["forward"], TOWARDS_GAP);
      run(sim, walk, seconds);
      const snapshot = sim.snapshot();
      if (seconds === 2.8) {
        expect(snapshot.vy).toBeLessThan(0); // really mid-fall
      }

      const a = run(sim, walk, 3);
      sim.restore(snapshot);
      const b = run(sim, walk, 3);

      expect(b).toEqual(a);
    } finally {
      sim.dispose();
    }
  });
});

describe("WASM memory", () => {
  test("20 create/step/dispose cycles don't grow it", () => {
    const cycle = () => {
      const sim = createSim(R);
      run(sim, frame(["forward"]), 2);
      sim.dispose();
    };
    cycle(); // warm-up: the first world grows the heap once
    const before = physicsMemoryBytes();
    expect(before).toBeGreaterThan(0);
    for (let n = 0; n < 20; n++) {
      cycle();
    }
    expect(physicsMemoryBytes()).toBe(before);
  });
});
