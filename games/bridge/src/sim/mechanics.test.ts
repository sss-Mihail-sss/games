import { beforeAll, describe, expect, test } from "bun:test";

import { quantizePitch, quantizeYaw } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import { actions } from "./actions.ts";
import type { Action } from "./actions.ts";
import { buildLevel, LEVEL } from "./level.ts";
import { ALL_ABILITIES, MOVEMENT } from "./movement.ts";
import type { Abilities, MovementStats } from "./movement.ts";
import { loadPhysics } from "./physics.ts";
import type { Rapier, World } from "./physics.ts";
import { createSim, SPAWN, TICK_RATE } from "./sim.ts";
import type { SimOptions } from "./sim.ts";
import type { Sim, SimState } from "./type.ts";

let R: Rapier;

beforeAll(async () => {
  R = await loadPhysics();
});

/** The camera yaw that looks along +X, across the gap. */
const TOWARDS_GAP = -Math.PI / 2;

const mask = (list: Action[]) =>
  list.reduce((bits, action) => (bits | actions.bit(action)) >>> 0, 0);

/** Held actions, a one-tick press (jump) and the camera yaw. */
const frame = (
  held: Action[] = [],
  { pressed = [] as Action[], yaw = 0 } = {},
): InputFrame => ({
  tick: 0,
  held: mask(held),
  pressed: mask(pressed),
  released: 0,
  yaw: quantizeYaw(yaw),
  pitch: quantizePitch(0),
});

const JUMP = frame([], { pressed: ["jump"] });

function run(sim: Sim, input: InputFrame, ticks: number): SimState {
  for (let i = 0; i < ticks; i++) {
    sim.step(input);
  }
  return sim.state();
}

/** A sim settled on the ground; disposed after the body. */
function withSim(body: (sim: Sim) => void, options: SimOptions = {}) {
  const sim = createSim(R, options);
  try {
    run(sim, frame(), TICK_RATE / 2);
    body(sim);
  } finally {
    sim.dispose();
  }
}

/** Distance covered in one second along −Z with these keys held. */
function speedOf(held: Action[], options: SimOptions = {}) {
  let distance = 0;
  withSim((sim) => {
    const before = sim.state().avatar;
    const after = run(sim, frame(["forward", ...held]), TICK_RATE).avatar;
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    distance = Math.sqrt(dx * dx + dz * dz);
  }, options);
  return distance;
}

/** Highest point of a standing jump above the start. */
function jumpPeak(sim: Sim) {
  const start = sim.state().avatar.y;
  let peak = start;
  sim.step(JUMP);
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    peak = Math.max(peak, sim.state().avatar.y);
    sim.step(frame());
  }
  return peak - start;
}

describe("modes", () => {
  test.each([
    ["walk", [], MOVEMENT.walkSpeed],
    ["sprint", ["sprint"], MOVEMENT.sprintSpeed],
    ["crouch", ["crouch"], MOVEMENT.crouchSpeed],
    ["sneak", ["sneak"], MOVEMENT.sneakSpeed],
  ] as const)("%s moves at its speed", (_, held, expected) => {
    expect(speedOf([...held])).toBeCloseTo(expected, 2);
  });

  test("the mode and speed are reported for animations", () => {
    withSim((sim) => {
      const { avatar } = run(sim, frame(["forward", "sprint"]), 5);

      expect(avatar.mode).toBe("sprint");
      expect(avatar.speed).toBeCloseTo(MOVEMENT.sprintSpeed, 3);
    });
  });

  test("crouch wins over sprint and sneak", () => {
    withSim((sim) => {
      const state = run(
        sim,
        frame(["forward", "crouch", "sprint", "sneak"]),
        5,
      );

      expect(state.avatar.mode).toBe("crouch");
      expect(state.avatar.crouched).toBe(true);
    });
  });

  test("stats multiply the speed", () => {
    const stats: MovementStats = { speed: 1.5, sprint: 1, jump: 1 };

    expect(speedOf([], { stats })).toBeCloseTo(MOVEMENT.walkSpeed * 1.5, 2);
  });
});

describe("jump", () => {
  test("reaches jumpHeight", () => {
    withSim((sim) => {
      expect(jumpPeak(sim)).toBeCloseTo(MOVEMENT.jumpHeight, 1);
      expect(Math.abs(jumpPeak(sim) - MOVEMENT.jumpHeight)).toBeLessThan(0.02);
    });
  });

  test("stats.jump scales the height", () => {
    withSim(
      (sim) => {
        expect(
          Math.abs(jumpPeak(sim) - MOVEMENT.jumpHeight * 1.44),
        ).toBeLessThan(0.02);
      },
      { stats: { speed: 1, sprint: 1, jump: 1.44 } },
    );
  });

  test("no second jump in the air", () => {
    withSim((sim) => {
      sim.step(JUMP);
      run(sim, frame(), 5);
      const rising = sim.state().avatar.y;
      sim.step(JUMP); // mid-air
      const peak = jumpPeakAfter(sim);

      // Without a second jump the peak is the first jump's.
      expect(peak).toBeLessThan(rising + MOVEMENT.jumpHeight * 0.5);
    });
  });

  /** Walks off the gap's edge and returns once the avatar first leaves the ground. */
  function walkOffEdge(sim: Sim) {
    const walk = frame(["forward"], { yaw: TOWARDS_GAP });
    for (let i = 0; i < 5 * TICK_RATE; i++) {
      sim.step(walk);
      if (!sim.state().avatar.grounded) {
        return walk;
      }
    }
    throw new Error("never left the ground");
  }

  test.each([
    [1, true],
    [4, false],
  ])(
    "coyote time: jump %i ticks after leaving the edge → %p",
    (late, jumps) => {
      withSim((sim) => {
        const walk = walkOffEdge(sim);
        run(sim, walk, late);
        const before = sim.state().avatar.y;
        sim.step(frame(["forward"], { pressed: ["jump"], yaw: TOWARDS_GAP }));
        const after = run(sim, walk, 2).avatar.y;

        expect(after > before).toBe(jumps);
      });
    },
  );

  /** Ticks from a standing jump until it lands again. */
  function landingTick(): number {
    let ticks = 0;
    withSim((sim) => {
      sim.step(JUMP);
      ticks = 1;
      while (!sim.state().avatar.grounded) {
        sim.step(frame());
        ticks += 1;
      }
    });
    return ticks;
  }

  test.each([
    [1, true],
    [5, false],
  ])(
    "jump buffer: pressed %i ticks before landing → jumps on landing: %p",
    (early, jumps) => {
      const land = landingTick();
      withSim((sim) => {
        sim.step(JUMP);
        for (let t = 1; t < land; t++) {
          sim.step(t === land - early ? JUMP : frame());
        }
        // Landed this tick; the next tick decides.
        const before = sim.state().avatar.y;
        const after = run(sim, frame(), 3).avatar.y;

        expect(after > before + 0.05).toBe(jumps);
      });
    },
  );

  function jumpPeakAfter(sim: Sim) {
    let peak = sim.state().avatar.y;
    for (let i = 0; i < 2 * TICK_RATE; i++) {
      sim.step(frame());
      peak = Math.max(peak, sim.state().avatar.y);
    }
    return peak;
  }
});

/** The level plus a beam 1.4 m above the bank, 2 m in front of the spawn. */
const BEAM_X = SPAWN.x + 2;
function levelWithBeam(world: World, Rap: Rapier) {
  buildLevel(world, Rap);
  const beam = world.createRigidBody(
    Rap.RigidBodyDesc.fixed().setTranslation(BEAM_X, 1.5, 0),
  );
  world.createCollider(Rap.ColliderDesc.cuboid(0.3, 0.1, 5), beam);
}

describe("crouch", () => {
  const towardsBeam = (held: Action[]) =>
    frame(["forward", ...held], { yaw: TOWARDS_GAP });

  test("a standing avatar can't pass under a low beam, a crouching one can", () => {
    withSim(
      (sim) => {
        const standing = run(sim, towardsBeam([]), 2 * TICK_RATE);
        expect(standing.avatar.x).toBeLessThan(BEAM_X);
      },
      { level: levelWithBeam },
    );
    withSim(
      (sim) => {
        const crouching = run(sim, towardsBeam(["crouch"]), 3 * TICK_RATE);
        expect(crouching.avatar.x).toBeGreaterThan(BEAM_X + 1);
      },
      { level: levelWithBeam },
    );
  });

  test("can't stand up under the beam, stands once out", () => {
    withSim(
      (sim) => {
        // Crouch-walk under the beam and stop there.
        for (let i = 0; i < 3 * TICK_RATE; i++) {
          sim.step(towardsBeam(["crouch"]));
          if (Math.abs(sim.state().avatar.x - BEAM_X) < 0.05) {
            break;
          }
        }
        expect(run(sim, frame(), 5).avatar.crouched).toBe(true);

        // Out from under it, the released key lets it stand.
        const out = run(sim, towardsBeam([]), TICK_RATE);
        expect(out.avatar.x).toBeGreaterThan(BEAM_X + 0.5);
        expect(out.avatar.crouched).toBe(false);
      },
      { level: levelWithBeam },
    );
  });

  test("the aim pivot goes down with the crouch", () => {
    withSim((sim) => {
      const standing = run(sim, frame(), 1).aim.origin.y;
      const crouching = run(sim, frame(["crouch"]), 1).aim.origin.y;

      expect(crouching).toBeLessThan(standing - 0.4);
    });
  });
});

describe("sneak", () => {
  const sneakTowardsGap = frame(["forward", "sneak"], { yaw: TOWARDS_GAP });

  test("stops at the edge of the gap instead of falling", () => {
    withSim((sim) => {
      const state = run(sim, sneakTowardsGap, 8 * TICK_RATE);

      expect(state.respawns).toBe(0);
      expect(state.avatar.grounded).toBe(true);
      expect(state.avatar.x).toBeLessThanOrEqual(-LEVEL.gap / 2 + 0.05);
      expect(state.avatar.x).toBeGreaterThan(-LEVEL.gap / 2 - 0.2);
    });
  });

  test("can still walk along the edge", () => {
    withSim((sim) => {
      const atEdge = run(sim, sneakTowardsGap, 8 * TICK_RATE);
      // Into the gap and to the right (+Z) at once: only the safe part remains.
      const along = run(
        sim,
        frame(["forward", "right", "sneak"], { yaw: TOWARDS_GAP }),
        TICK_RATE,
      );

      expect(along.respawns).toBe(0);
      expect(along.avatar.z - atEdge.avatar.z).toBeGreaterThan(0.5);
    });
  });

  test("walking to the same edge falls", () => {
    withSim((sim) => {
      const state = run(
        sim,
        frame(["forward"], { yaw: TOWARDS_GAP }),
        8 * TICK_RATE,
      );

      expect(state.respawns).toBeGreaterThanOrEqual(1); // falls (and keeps falling)
    });
  });
});

describe("abilities", () => {
  const without = (name: keyof Abilities): Abilities => ({
    ...ALL_ABILITIES,
    [name]: false,
  });

  test("a disabled jump does nothing", () => {
    withSim(
      (sim) => {
        expect(jumpPeak(sim)).toBeLessThan(0.01);
      },
      { abilities: without("jump") },
    );
  });

  test("a disabled sprint walks", () => {
    expect(speedOf(["sprint"], { abilities: without("sprint") })).toBeCloseTo(
      MOVEMENT.walkSpeed,
      2,
    );
  });

  test("a disabled crouch stays standing", () => {
    withSim(
      (sim) => {
        expect(run(sim, frame(["crouch"]), 5).avatar.crouched).toBe(false);
      },
      { abilities: without("crouch") },
    );
  });

  test("a disabled sneak walks off the edge", () => {
    withSim(
      (sim) => {
        const state = run(
          sim,
          frame(["forward", "sneak"], { yaw: TOWARDS_GAP }),
          8 * TICK_RATE,
        );
        expect(state.respawns).toBeGreaterThanOrEqual(1); // falls (and keeps falling)
      },
      { abilities: without("sneak") },
    );
  });

  test("setAbilities takes effect from the next tick and is reported", () => {
    withSim(
      (sim) => {
        expect(run(sim, frame(["forward", "sprint"]), 3).avatar.mode).toBe(
          "walk",
        );
        sim.setAbilities(ALL_ABILITIES);
        const state = run(sim, frame(["forward", "sprint"]), 1);

        expect(state.avatar.mode).toBe("sprint");
        expect(state.abilities.sprint).toBe(true);
      },
      { abilities: without("sprint") },
    );
  });
});

describe("snapshots", () => {
  test("restoring mid-jump replays identically", () => {
    withSim((sim) => {
      sim.step(frame(["forward"], { pressed: ["jump"] }));
      run(sim, frame(["forward"]), 5);
      const snapshot = sim.snapshot();
      expect(snapshot.vy).toBeGreaterThan(0);

      const a = run(sim, frame(["forward"]), 30);
      sim.restore(snapshot);
      const b = run(sim, frame(["forward"]), 30);

      expect(b).toEqual(a);
    });
  });

  test("restoring a crouch under the beam keeps the crouched capsule", () => {
    withSim(
      (sim) => {
        const towards = frame(["forward", "crouch"], { yaw: TOWARDS_GAP });
        for (let i = 0; i < 3 * TICK_RATE; i++) {
          sim.step(towards);
          if (Math.abs(sim.state().avatar.x - BEAM_X) < 0.05) {
            break;
          }
        }
        const snapshot = sim.snapshot();
        const stay = frame([], { yaw: TOWARDS_GAP });

        const a = run(sim, stay, 10);
        sim.restore(snapshot);
        const b = run(sim, stay, 10);

        expect(b).toEqual(a);
        expect(b.avatar.crouched).toBe(true); // still can't stand under the beam
      },
      { level: levelWithBeam },
    );
  });
});
