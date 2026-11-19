import { createFixedLoop, createInput, defineGame } from "@repo/game-core";
import type { Bindings } from "@repo/game-core";
import { quantizeYaw } from "@repo/game-protocol";

import { manifest } from "../manifest.ts";
import { actions, createInitialState, step, TICK_RATE } from "../sim/index.ts";
import type { SimState } from "../sim/index.ts";
import { createFollowCamera } from "./camera.ts";
import { lerp, lerpAngle } from "./interpolate.ts";
import { createView } from "./renderer.ts";
import { createWorld } from "./scene.ts";

const DEFAULT_BINDINGS: Bindings<typeof actions.list> = {
  forward: ["Key:KeyW", "Key:ArrowUp"],
  back: ["Key:KeyS", "Key:ArrowDown"],
  left: ["Key:KeyA", "Key:ArrowLeft"],
  right: ["Key:KeyD", "Key:ArrowRight"],
};

export default defineGame({
  manifest,
  mount: (element, { signal, settings, log }) => {
    // Two sim states: render() blends between them by the loop's alpha, so
    // movement is smooth at any refresh rate although the sim ticks at 30 Hz.
    let previous: SimState = createInitialState();
    let current = previous;

    const world = createWorld();
    // The camera starts behind the avatar, so W walks towards the gap.
    const view = createFollowCamera(current.avatar.facing);
    const screen = createView(element, view.camera, settings);
    view.listen(screen.canvas);
    const input = createInput({ actions, bindings: DEFAULT_BINDINGS });

    const loop = createFixedLoop({
      tickRate: TICK_RATE,
      update: (tick, dt) => {
        previous = current;
        current = step(current, input.sample(tick, quantizeYaw(view.yaw)), dt);
      },
      render: (alpha) => {
        const from = previous.avatar;
        const to = current.avatar;
        const x = lerp(from.x, to.x, alpha);
        const z = lerp(from.z, to.z, alpha);

        world.avatar.position.set(x, 0, z);
        world.avatar.rotation.y = lerpAngle(from.facing, to.facing, alpha);
        view.follow(x, z);
        screen.renderer.render(world.scene, view.camera);
      },
    });
    loop.start();

    // Reverse order of creation. defineGame makes this idempotent.
    const unmount = () => {
      loop.stop();
      input.dispose();
      view.dispose();
      // Dev check: every geometry the scene uploaded must be gone before the renderer goes.
      const memory = screen.renderer.info.memory;
      const before = { ...memory };
      world.dispose();
      if (process.env.NODE_ENV !== "production") {
        // Textures are only reported: Three keeps its own (the 16×16 DFG_LUT of PBR
        // materials) until renderer.dispose(), so 1 → 1 here is not a leak.
        const message = `GPU after scene dispose: geometries ${before.geometries} → ${memory.geometries}, textures ${before.textures} → ${memory.textures}`;
        if (memory.geometries === 0) {
          log.info(message);
        } else {
          log.warn(message);
        }
      }
      screen.dispose(); // ResizeObserver, settings, renderer, context, canvas
    };

    // The shell may have left the page while we were setting up.
    if (signal.aborted) {
      unmount();
    }

    return Promise.resolve(unmount);
  },
});
