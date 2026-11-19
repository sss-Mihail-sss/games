import type { Clock, FixedLoop, FixedLoopOptions } from "./type.ts";

const browserClock: Clock = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

export function createFixedLoop({
  tickRate,
  update,
  render,
  maxStepsPerFrame = 5,
  clock = browserClock,
}: FixedLoopOptions): FixedLoop {
  const dt = 1 / tickRate;

  let tick = 0;
  let running = false;
  let frameId = 0;
  let origin = 0;
  let tickOffset = 0;

  function frame(time: number) {
    let elapsedTicks = ((time - origin) * tickRate) / 1000 + tickOffset;
    let steps = Math.floor(elapsedTicks) - tick;

    // Спираль смерти: после долгой паузы не догоняем, а отбрасываем лишнее время.
    // Допустимо только в одиночной игре. В мультиплеере (M2) клиент не может
    // «забыть» время — сервер продолжает тикать, клиент должен догнать серверный тик.
    if (steps > maxStepsPerFrame) {
      const dropped = steps - maxStepsPerFrame;
      tickOffset -= dropped;
      elapsedTicks -= dropped;
      steps = maxStepsPerFrame;
    }

    for (let i = 0; i < steps; i++) {
      if (!running) {
        return;
      }

      update(tick, dt);
      tick += 1;
    }

    if (!running) {
      return;
    }

    render(elapsedTicks - tick);
    frameId = clock.requestFrame(frame);
  }

  return {
    start() {
      if (running) {
        return;
      }

      running = true;
      origin = clock.now();
      tickOffset = tick;
      frameId = clock.requestFrame(frame);
    },
    stop() {
      if (!running) {
        return;
      }

      running = false;
      clock.cancelFrame(frameId);
    },
    get tick() {
      return tick;
    },
    get running() {
      return running;
    },
  };
}
