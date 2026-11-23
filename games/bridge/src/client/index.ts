import { createFixedLoop, createInput, defineGame } from "@repo/game-core";
import type { Bindings } from "@repo/game-core";

import { manifest } from "../manifest.ts";
import {
  actions,
  createSim,
  loadPhysics,
  physicsMemoryBytes,
  PITCH_LIMITS,
  shoulderScale,
  SPAWN,
  TICK_RATE,
} from "../sim/index.ts";
import type { Abilities, SimState } from "../sim/index.ts";
import { createShoulderCamera } from "./camera.ts";
import { createHud } from "./hud.ts";
import { lerp, lerpAngle } from "./interpolate.ts";
import { createView } from "./renderer.ts";
import { createWorld } from "./scene.ts";

const DEFAULT_BINDINGS: Bindings<typeof actions.list> = {
  forward: ["Key:KeyW", "Key:ArrowUp"],
  back: ["Key:KeyS", "Key:ArrowDown"],
  left: ["Key:KeyA", "Key:ArrowLeft"],
  right: ["Key:KeyD", "Key:ArrowRight"],
  // No Ctrl or Alt: Ctrl+W closes the tab whatever we do, Alt opens the window menu.
  jump: ["Key:Space"],
  sprint: ["Key:ShiftLeft"],
  crouch: ["Key:KeyC"],
  sneak: ["Key:KeyZ"],
};

/** For "Недоступно: …" when the sim ignores a disabled ability. */
const ABILITY_LABELS = {
  jump: "прыжок",
  sprint: "бег",
  crouch: "присед",
  sneak: "ходьба крадучись",
} as const satisfies Record<keyof Abilities, string>;

/** How fast the crouch picture and camera follow the sim, per second. */
const CROUCH_EASE = 14;

const dev = process.env.NODE_ENV !== "production";

export default defineGame({
  manifest,
  mount: async (element, { signal, settings, log }) => {
    // Rapier's WASM, once per page; a second visit reuses it.
    const rapier = await loadPhysics();
    if (signal.aborted) {
      // Left while loading: nothing was created yet, so there is nothing to undo.
      return () => {};
    }

    const sim = createSim(rapier);
    // Two sim states: render() blends between them by the loop's alpha, so
    // movement is smooth at any refresh rate although the sim ticks at 30 Hz.
    let previous: SimState = sim.state();
    let current = previous;
    let tickMs = 0; // dev: total time spent in sim.step()
    let heightScale = 1;
    let lastFrame = performance.now();

    const world = createWorld();
    const view = createShoulderCamera();
    const screen = createView(element, view.camera, settings);
    const hud = createHud(element);
    // The mouse looks around once captured by a click on the canvas; the look
    // starts along the spawn facing, so W walks towards the gap.
    const input = createInput({
      actions,
      bindings: DEFAULT_BINDINGS,
      pointer: {
        element: screen.canvas,
        sensitivity: () => settings.current.mouse.sensitivity,
        invertY: () => settings.current.mouse.invertY,
        pitchLimits: PITCH_LIMITS,
        initialYaw: SPAWN.facing,
      },
    });

    const loop = createFixedLoop({
      tickRate: TICK_RATE,
      update: (tick) => {
        const start = dev ? performance.now() : 0;
        const frame = input.sample(tick);
        sim.step(frame);
        // The sim already ignored a disabled ability; just say why nothing happened.
        for (const ability of Object.keys(
          ABILITY_LABELS,
        ) as (keyof Abilities)[]) {
          if (
            actions.wasPressed(frame, ability) &&
            !current.abilities[ability]
          ) {
            hud.notice(`Недоступно: ${ABILITY_LABELS[ability]}`);
          }
        }
        if (dev) {
          tickMs += performance.now() - start;
        }
        previous = current;
        current = sim.state();
      },
      render: (alpha) => {
        // A respawn is a teleport: blending would fly the avatar across the map.
        const from =
          current.respawns === previous.respawns
            ? previous.avatar
            : current.avatar;
        const to = current.avatar;
        const x = lerp(from.x, to.x, alpha);
        const y = lerp(from.y, to.y, alpha);
        const z = lerp(from.z, to.z, alpha);

        // The crouch snaps in the sim; the picture and camera ease into it.
        const now = performance.now();
        const ease = Math.min(1, ((now - lastFrame) / 1000) * CROUCH_EASE);
        lastFrame = now;
        heightScale += (shoulderScale(to.crouched) - heightScale) * ease;

        world.avatar.position.set(x, y, z);
        world.avatar.rotation.y = lerpAngle(from.facing, to.facing, alpha);
        world.avatar.scale.y = heightScale; // placeholder until the model (M1-10)
        // The live look, not the tick's quantized one: turning stays smooth at
        // any refresh rate. The sim gets the same angles, quantized, every tick.
        const look = input.look();
        view.follow(
          { x, y, z },
          look.yaw,
          look.pitch,
          heightScale,
          sim.castRay,
        );

        const { hit } = current.aim;
        hud.update({ locked: input.locked, target: hit !== null });
        if (dev) {
          world.aimMarker.visible = hit !== null;
          if (hit) {
            world.aimMarker.position.set(hit.point.x, hit.point.y, hit.point.z);
          }
        }
        screen.renderer.render(world.scene, view.camera);
      },
    });
    loop.start();

    // Reverse order of creation. It guards itself: defineGame only wraps the
    // function we *return*, so the early call below would otherwise run twice
    // (here, then again from mountGame through the wrapper).
    let disposed = false;
    const unmount = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      loop.stop();
      input.dispose();
      if (dev && current.tick > 0) {
        // WASM memory never shrinks; if it grows from visit to visit, a world leaks.
        const mb = (physicsMemoryBytes() ?? 0) / 2 ** 20;
        log.info(
          `sim: ${(tickMs / current.tick).toFixed(3)} ms/tick over ${current.tick} ticks, physics memory ${mb.toFixed(1)} MB`,
        );
      }
      sim.dispose(); // frees the Rapier world
      hud.dispose();
      // Dev check: every geometry the scene uploaded must be gone before the renderer goes.
      const memory = screen.renderer.info.memory;
      const before = { ...memory };
      world.dispose();
      if (dev) {
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

    return unmount;
  },
});
