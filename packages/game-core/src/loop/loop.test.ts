import { describe, expect, mock, test } from "bun:test";

import { createFixedLoop } from "./loop.ts";
import type { Clock } from "./type.ts";

const TICK_RATE = 30;
const STEP_MS = 1000 / TICK_RATE;

/**
 * Deterministic clock: time only moves when the test calls `frame(ms)`,
 * which also runs the pending frame callback, like a real rAF tick.
 */
function createFakeClock() {
  let time = 0;
  let pending: ((time: number) => void) | undefined;

  const clock = {
    now: () => time,
    requestFrame: mock((cb: (time: number) => void) => {
      pending = cb;
      return 1;
    }),
    cancelFrame: mock((_id: number) => {
      pending = undefined;
    }),
  } satisfies Clock;

  function frame(ms: number) {
    time += ms;
    const cb = pending;
    pending = undefined;
    cb?.(time);
  }

  function frames(durations: number[]) {
    for (const ms of durations) frame(ms);
  }

  return { clock, frame, frames };
}

/** Builds frame durations that add up to exactly `totalMs`. */
function slices(frameMs: number, totalMs = 1000): number[] {
  const result = Array<number>(Math.floor(totalMs / frameMs)).fill(frameMs);
  const rest = totalMs - result.length * frameMs;
  if (rest > 0) result.push(rest);
  return result;
}

function setup(options: { maxStepsPerFrame?: number } = {}) {
  const fake = createFakeClock();
  const update = mock((_tick: number, _dt: number) => {});
  const render = mock((_alpha: number) => {});
  const loop = createFixedLoop({
    tickRate: TICK_RATE,
    update,
    render,
    clock: fake.clock,
    ...options,
  });

  const ticks = () => update.mock.calls.map(([tick]) => tick);
  const alphas = () => render.mock.calls.map(([alpha]) => alpha);

  return { ...fake, loop, update, render, ticks, alphas };
}

describe("createFixedLoop", () => {
  describe("runs exactly tickRate updates per second regardless of frame slicing", () => {
    const cases: [name: string, frames: number[]][] = [
      ["8 ms frames (120 Hz)", slices(8)],
      ["16 ms frames (60 Hz)", slices(16)],
      ["33 ms frames (30 Hz)", slices(33)],
      ["7 ms frames (144 Hz)", slices(7)],
      // Every frame stays below maxStepsPerFrame × STEP_MS (≈166 ms),
      // otherwise the loop legitimately drops time.
      [
        "ragged frames",
        [5, 40, 12, 33, 7, 100, 3, 150, 160, 90, 120, 80, 50, 70, 80],
      ],
    ];

    test.each(cases)("%s", (_name, frames) => {
      expect(frames.reduce((sum, ms) => sum + ms, 0)).toBe(1000);

      const { loop, update, frames: run } = setup();
      loop.start();
      run(frames);

      expect(update).toHaveBeenCalledTimes(TICK_RATE);
      expect(loop.tick).toBe(TICK_RATE);
    });
  });

  test("passes consecutive tick numbers starting from 0", () => {
    const { loop, frames, ticks } = setup();
    loop.start();
    frames(slices(16));

    expect(ticks()).toEqual([...Array(TICK_RATE).keys()]);
  });

  test("always passes the same dt in seconds", () => {
    const { loop, frames, update } = setup();
    loop.start();
    frames([5, 40, 12, 33, 7, 100]);

    for (const [, dt] of update.mock.calls) {
      expect(dt).toBe(1 / TICK_RATE);
    }
  });

  test("keeps alpha within [0, 1)", () => {
    const { loop, frames, alphas } = setup();
    loop.start();
    frames([1, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 33, 34, 50, 100]);

    expect(alphas().length).toBeGreaterThan(0);
    for (const alpha of alphas()) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  test("alpha reflects progress towards the next tick", () => {
    const { loop, frame, alphas } = setup();
    loop.start();
    frame(STEP_MS / 2);

    expect(alphas()[0]).toBeCloseTo(0.5);
  });

  test("renders on frames with zero simulation steps", () => {
    const { loop, frame, update, render } = setup();
    loop.start();
    frame(7);
    frame(7);

    expect(update).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(2);
  });

  describe("spiral of death protection", () => {
    test("runs at most maxStepsPerFrame updates after a long pause", () => {
      const { loop, frame, update } = setup({ maxStepsPerFrame: 5 });
      loop.start();
      frame(10_000);

      expect(update).toHaveBeenCalledTimes(5);
    });

    test("recovers to exactly tickRate updates per second after the pause", () => {
      const { loop, frame, frames, update } = setup({ maxStepsPerFrame: 5 });
      loop.start();
      frame(10_000);
      update.mockClear();

      frames(slices(10));

      expect(update).toHaveBeenCalledTimes(TICK_RATE);
    });
  });

  describe("stop", () => {
    test("no updates or renders after stop()", () => {
      const { loop, frames, update, render } = setup();
      loop.start();
      frames(slices(16, 500));
      loop.stop();
      update.mockClear();
      render.mockClear();

      frames(slices(16));

      expect(loop.running).toBe(false);
      expect(update).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
    });

    test("stop() inside update skips the remaining steps and the render", () => {
      const fake = createFakeClock();
      const render = mock((_alpha: number) => {});
      const loop = createFixedLoop({
        tickRate: TICK_RATE,
        update: (tick) => {
          if (tick === 1) loop.stop();
        },
        render,
        clock: fake.clock,
      });

      loop.start();
      fake.frame(STEP_MS * 5 + 1); // enough time for 5 steps

      expect(loop.tick).toBe(2);
      expect(loop.running).toBe(false);
      expect(render).not.toHaveBeenCalled();
    });

    test("stop() cancels the pending frame", () => {
      const { loop, clock } = setup();
      loop.start();
      loop.stop();

      expect(clock.cancelFrame).toHaveBeenCalledTimes(1);
    });
  });

  describe("start", () => {
    test("double start() does not create a second frame chain", () => {
      const { loop, clock } = setup();
      loop.start();
      loop.start();

      expect(clock.requestFrame).toHaveBeenCalledTimes(1);
      expect(loop.running).toBe(true);
    });

    test("restart continues tick numbering without catching up on the paused time", () => {
      const { loop, frame, frames, update, ticks } = setup();
      loop.start();
      frames(slices(10));
      loop.stop();

      frame(5_000); // time passes while stopped: no pending frame runs
      update.mockClear();

      loop.start();
      frames(slices(10));

      expect(update).toHaveBeenCalledTimes(TICK_RATE);
      expect(ticks()[0]).toBe(TICK_RATE);
      expect(loop.tick).toBe(TICK_RATE * 2);
    });
  });

  test("does not drift over an hour of irregular frames", () => {
    let seed = 42;
    const random = () =>
      (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;

    const { loop, frame, update } = setup();
    loop.start();

    let elapsed = 0;
    while (elapsed < 3_600_000) {
      const ms = 1 + random() * 30;
      elapsed += ms;
      frame(ms);
    }

    expect(update).toHaveBeenCalledTimes(
      Math.floor((elapsed * TICK_RATE) / 1000),
    );
  });
});
