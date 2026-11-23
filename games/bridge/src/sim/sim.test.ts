import { beforeAll, describe, expect, test } from "bun:test";

import { quantizePitch, quantizeYaw } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import { actions } from "./actions.ts";
import { PITCH_LIMITS, REACH, SHOULDER } from "./aim.ts";
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

/** A frame with these actions held, the camera turned by `yawRadians` and tilted by `pitchRadians`. */
const frame = (
  held: Action[] = [],
  yawRadians = 0,
  pitchRadians = 0,
): InputFrame => ({
  tick: 0,
  held: held.reduce((mask, action) => (mask | actions.bit(action)) >>> 0, 0),
  pressed: 0,
  released: 0,
  yaw: quantizeYaw(yawRadians),
  pitch: quantizePitch(pitchRadians),
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

describe("aim", () => {
  const DEG = Math.PI / 180;

  test("starts at the shoulder and looks where the camera looks", () => {
    withSim((sim) => {
      sim.step(frame([], 0, 0));
      const { avatar, aim } = sim.state();

      expect(aim.origin.y).toBeCloseTo(avatar.y + SHOULDER.height, 6);
      // Yaw 0: forward is −Z, the shoulder is to the right (+X).
      expect(aim.origin.x).toBeCloseTo(avatar.x + SHOULDER.side, 6);
      expect(aim.direction.x).toBeCloseTo(0, 6);
      expect(aim.direction.y).toBeCloseTo(0, 6);
      expect(aim.direction.z).toBeCloseTo(-1, 6);
    });
  });

  test("looking down at the bank hits its top within reach", () => {
    withSim((sim) => {
      sim.step(frame([], 0, -50 * DEG));
      const { hit } = sim.state().aim;

      expect(hit).not.toBeNull();
      expect(hit!.point.y).toBeCloseTo(0, 3); // the bank's top surface
      expect(hit!.normal.y).toBeCloseTo(1, 3);
      expect(hit!.distance).toBeLessThanOrEqual(REACH);
    });
  });

  test("nothing within reach when looking level across the bank", () => {
    withSim((sim) => {
      sim.step(frame([], 0, 0));

      expect(sim.state().aim.hit).toBeNull();
    });
  });

  test("never hits the avatar's own capsule", () => {
    withSim((sim) => {
      sim.step(frame([], 0, PITCH_LIMITS[0])); // as far down as allowed
      const { hit } = sim.state().aim;

      // The first hit is the ground, not the capsule right below the shoulder.
      expect(hit!.point.y).toBeCloseTo(0, 3);
    });
  });

  test("pitch is clamped by the sim, whatever the client sends", () => {
    withSim((sim) => {
      sim.step(frame([], 0, 89 * DEG));
      const up = sim.state().aim.direction.y;
      sim.step(frame([], 0, -89 * DEG));
      const down = sim.state().aim.direction.y;

      expect(Math.asin(up)).toBeCloseTo(PITCH_LIMITS[1], 3);
      expect(Math.asin(down)).toBeCloseTo(PITCH_LIMITS[0], 3);
    });
  });

  test("castRay ignores the avatar and finds the ground", () => {
    withSim((sim) => {
      const { avatar } = sim.state();
      const fromAbove = { x: avatar.x, y: avatar.y + 5, z: avatar.z };

      const distance = sim.castRay(fromAbove, { x: 0, y: -1, z: 0 }, 10);
      expect(distance).toBeCloseTo(fromAbove.y, 3); // the ground is at y = 0
      expect(sim.castRay(fromAbove, { x: 0, y: 1, z: 0 }, 10)).toBeNull();
    });
  });
});

/**
 * A scripted session: walk to the gap, fall, respawn, walk sideways, turn the
 * camera. Its hash must not change unless the game's physics deliberately does.
 */
const MODES = ["walk", "sprint", "crouch", "sneak", "air"];

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
      state.aim.origin.x,
      state.aim.origin.y,
      state.aim.origin.z,
      state.aim.direction.x,
      state.aim.direction.y,
      state.aim.direction.z,
      state.aim.hit?.distance ?? -1,
      MODES.indexOf(state.avatar.mode),
      Number(state.avatar.crouched),
      state.avatar.speed,
    );
  // [held, yaw, pitch, seconds, jump on the first tick of the segment]
  const script: [Action[], number, number, number, boolean][] = [
    [[], 0, 0, 0.5, false],
    [["forward"], TOWARDS_GAP, -0.3, 4, false], // into the gap, respawn
    [["right"], TOWARDS_GAP, 0.4, 3, false],
    [["forward", "left"], 0.3, -0.9, 2, false],
    [["forward", "sprint"], 0, 0, 1, true], // sprint jump
    [["back", "crouch"], 0, 0.2, 1, false],
    [["forward", "sneak"], TOWARDS_GAP, 0, 6, false], // sneak to the edge
    [["right", "sneak"], TOWARDS_GAP, 0, 1, false], // along it
    [[], 0, 0, 1, true],
  ];
  for (const [held, yaw, pitch, seconds, jump] of script) {
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      const input = frame(held, yaw, pitch);
      sim.step(
        jump && i === 0 ? { ...input, pressed: actions.bit("jump") } : input,
      );
      record(sim.state());
    }
  }
  return hashNumbers(states);
}

describe("determinism", () => {
  /**
   * Recorded on macOS arm64; CI checks it on Linux x64 (see M1-01).
   * M1-03 (f81faa93 → 8012b949): the session gained pitch and the aim ray.
   * M1-09 (→ aa2c8c63): jumps, sprint, crouch and sneak in the script, mode,
   * crouch and speed in the record, and air momentum changed falling.
   */
  const GOLDEN = "aa2c8c63";

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
