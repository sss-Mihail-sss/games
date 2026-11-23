import RAPIER from "@dimforge/rapier3d-deterministic-compat";

/** The module as `import RAPIER from …` gives it, after `loadPhysics()`. */
export type Rapier = typeof RAPIER;
export type World = InstanceType<Rapier["World"]>;

let ready: Promise<Rapier> | undefined;
let memory: WebAssembly.Memory | undefined;

/**
 * Initialises Rapier's WASM once per process or page: the client, tests and the
 * server (M2) all go through here. Concurrent and later calls share one promise;
 * a failed init is forgotten, so the next call retries.
 */
export function loadPhysics(): Promise<Rapier> {
  ready ??= init().then(
    () => RAPIER,
    (error: unknown) => {
      ready = undefined;
      throw error;
    },
  );
  return ready;
}

/**
 * Bytes of Rapier's WASM memory, or undefined before `loadPhysics()`. It never
 * shrinks; it grows when worlds aren't freed. Tests and the dev build use it to
 * catch a forgotten `dispose()`.
 */
export function physicsMemoryBytes(): number | undefined {
  return memory?.buffer.byteLength;
}

/**
 * The compat build doesn't expose its WASM memory, so we catch it while the
 * module is instantiated. The hook lives only for the duration of init().
 */
async function init() {
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = (async (
    ...args: Parameters<typeof instantiate>
  ) => {
    // From a Module it resolves to an Instance, from bytes to { module, instance }.
    const result = (await instantiate(...args)) as
      WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource;
    const instance =
      result instanceof WebAssembly.Instance ? result : result.instance;
    const exported = instance.exports["memory"];
    if (exported instanceof WebAssembly.Memory) {
      memory = exported;
    }
    return result;
  }) as typeof WebAssembly.instantiate;
  try {
    await RAPIER.init();
  } finally {
    WebAssembly.instantiate = instantiate;
  }
}
