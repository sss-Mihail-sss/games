import { describe, expect, mock, test } from "bun:test";

import type { GameContext, GameModule, Unmount } from "@repo/game-core";

import { mountGame } from "./mount-game.ts";
import type { MountGameOptions } from "./type.ts";

type Mount = GameModule["mount"];

const element = {} as HTMLElement;
const context = () => ({}) as Omit<GameContext, "signal">;

/** A promise the test resolves or rejects by hand, to control timing. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets the promise chain inside mountGame run to its next await. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** mountGame never reads the manifest, so a stub is enough. */
const game = (mount: Mount): GameModule => ({
  manifest: {} as GameModule["manifest"],
  mount,
});

/** `load` that resolves immediately with a game using `mount`. */
const loads = (mount: Mount) => () => Promise.resolve(game(mount));

/** `mount` that resolves immediately with `unmount`. */
const mounts =
  (unmount: Unmount = () => {}): Mount =>
  () =>
    Promise.resolve(unmount);

function start(
  options: Partial<MountGameOptions> & Pick<MountGameOptions, "load">,
) {
  const onError = mock((_error: unknown) => {});
  const stop = mountGame({ element, context, onError, ...options });
  return { stop, onError };
}

describe("mountGame", () => {
  test("mounts the game into the element with the context and a live signal", async () => {
    const mount = mock<Mount>(mounts());
    const ownContext = { log: console } as unknown as Omit<
      GameContext,
      "signal"
    >;

    mountGame({
      element,
      context: () => ownContext,
      onError: mock(),
      load: loads(mount),
    });
    await flush();

    expect(mount).toHaveBeenCalledTimes(1);
    const [el, ctx] = mount.mock.calls[0]!;
    expect(el).toBe(element);
    expect(ctx.log).toBe(console);
    expect(ctx.signal.aborted).toBe(false);
  });

  test("builds the context from the loaded module", async () => {
    const loaded = game(mounts());
    const contextFor = mock(context);

    mountGame({
      element,
      context: contextFor,
      onError: mock(),
      load: () => Promise.resolve(loaded),
    });
    await flush();

    expect(contextFor).toHaveBeenCalledWith(loaded);
  });

  test("onReady fires once, after mount", async () => {
    const pending = deferred<Unmount>();
    const onReady = mock(() => {});
    start({ load: loads(() => pending.promise), onReady });
    await flush();
    expect(onReady).not.toHaveBeenCalled(); // still mounting

    pending.resolve(() => {});
    await flush();

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test("no onReady when the page was left during mount, nor when mount failed", async () => {
    const pending = deferred<Unmount>();
    const onReady = mock(() => {});
    const { stop } = start({ load: loads(() => pending.promise), onReady });
    await flush();
    stop();
    pending.resolve(() => {});
    await flush();

    start({
      load: loads(() => Promise.reject(new Error("webgl unavailable"))),
      onReady,
    });
    await flush();

    expect(onReady).not.toHaveBeenCalled();
  });

  test("cleanup after mount unmounts the game once", async () => {
    const cleanup = mock(() => {});
    const { stop } = start({ load: loads(mounts(cleanup)) });
    await flush();

    stop();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test("cleanup aborts the signal the game received", async () => {
    let signal: AbortSignal | undefined;
    const { stop } = start({
      load: loads((_el, ctx) => {
        signal = ctx.signal;
        return Promise.resolve(() => {});
      }),
    });
    await flush();

    stop();

    expect(signal?.aborted).toBe(true);
  });

  test("cleanup before the module loads: the game is never mounted", async () => {
    const pending = deferred<GameModule>();
    const mount = mock<Mount>(mounts());
    const { stop } = start({ load: () => pending.promise });

    stop();
    pending.resolve(game(mount));
    await flush();

    expect(mount).not.toHaveBeenCalled();
  });

  test("cleanup during mount: the game sees an aborted signal and is unmounted right after", async () => {
    const pending = deferred<Unmount>();
    const cleanup = mock(() => {});
    let signal: AbortSignal | undefined;
    const { stop } = start({
      load: loads((_el, ctx) => {
        signal = ctx.signal;
        return pending.promise;
      }),
    });
    await flush(); // load finished, mount started

    stop(); // leave the page in the middle of mount
    expect(signal?.aborted).toBe(true);
    expect(cleanup).not.toHaveBeenCalled();

    pending.resolve(cleanup); // mount finishes anyway
    await flush();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test("calling cleanup twice unmounts once, even for a game not built with defineGame", async () => {
    const cleanup = mock(() => {});
    const { stop } = start({ load: loads(mounts(cleanup)) });
    await flush();

    stop();
    stop();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  describe("errors", () => {
    test("a failed load is reported", async () => {
      const error = new Error("chunk failed");
      const { onError } = start({ load: () => Promise.reject(error) });
      await flush();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
    });

    test("a failed mount is reported", async () => {
      const error = new Error("webgl unavailable");
      const { onError } = start({ load: loads(() => Promise.reject(error)) });
      await flush();

      expect(onError).toHaveBeenCalledWith(error);
    });

    test("a load that fails after cleanup is not reported", async () => {
      const pending = deferred<GameModule>();
      const { stop, onError } = start({ load: () => pending.promise });

      stop();
      pending.reject(new Error("too late"));
      await flush();

      expect(onError).not.toHaveBeenCalled();
    });

    test("a mount that fails after cleanup is not reported", async () => {
      const pending = deferred<Unmount>();
      const { stop, onError } = start({ load: loads(() => pending.promise) });
      await flush();

      stop();
      pending.reject(new Error("too late"));
      await flush();

      expect(onError).not.toHaveBeenCalled();
    });
  });

  test("React StrictMode (mount → cleanup → mount) leaves exactly one live game", async () => {
    const live = new Set<number>();
    let nextId = 0;
    const load = loads(() => {
      const id = nextId++;
      live.add(id);
      return Promise.resolve(() => {
        live.delete(id);
      });
    });

    const first = start({ load });
    first.stop(); // StrictMode runs the effect cleanup immediately
    const second = start({ load });
    await flush();

    expect(live.size).toBe(1);

    second.stop();
    expect(live.size).toBe(0);
  });
});
