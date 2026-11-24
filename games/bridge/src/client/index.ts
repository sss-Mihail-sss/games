import { createFixedLoop, createInput, defineGame } from "@repo/game-core";
import type { Controls, PlayState } from "@repo/game-core";

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
import type { Abilities, Rapier, SimState } from "../sim/index.ts";
import { acquireGltfLoader } from "./assets.ts";
import {
  createAvatar,
  DEFAULT_AVATAR_MODEL,
  fetchAvatarModel,
  parseAvatarModel,
} from "./avatar-model.ts";
import type { Avatar, AvatarModel } from "./avatar-model.ts";
import { createShoulderCamera } from "./camera.ts";
import { verticalFov } from "./fov.ts";
import { createHud } from "./hud.ts";
import { lerp, lerpAngle } from "./interpolate.ts";
import { createView } from "./renderer.ts";
import { createWorld } from "./scene.ts";

/**
 * For the platform's "Keys" screen: the player rebinds these, the platform
 * keeps and checks the result, and we read it from `ctx.controls`.
 */
const CONTROLS: Controls<(typeof actions.list)[number]> = {
  actions: actions.list,
  labels: {
    forward: "Вперёд",
    back: "Назад",
    left: "Влево",
    right: "Вправо",
    jump: "Прыжок",
    sprint: "Бег",
    crouch: "Присед",
    sneak: "Крадучись",
  },
  defaults: {
    forward: ["Key:KeyW", "Key:ArrowUp"],
    back: ["Key:KeyS", "Key:ArrowDown"],
    left: ["Key:KeyA", "Key:ArrowLeft"],
    right: ["Key:KeyD", "Key:ArrowRight"],
    // No Ctrl or Alt: Ctrl+W closes the tab whatever we do, Alt opens the
    // window menu. The platform doesn't let the player pick them either.
    jump: ["Key:Space"],
    sprint: ["Key:ShiftLeft"],
    crouch: ["Key:KeyC"],
    sneak: ["Key:KeyZ"],
  },
};

/** For "Недоступно: …" when the sim ignores a disabled ability. */
const ABILITY_LABELS = {
  jump: "прыжок",
  sprint: "бег",
  crouch: "присед",
  sneak: "ходьба крадучись",
} as const satisfies Record<keyof Abilities, string>;

/** How fast the camera follows a crouch in the sim, per second. */
const CROUCH_EASE = 14;

const dev = process.env.NODE_ENV !== "production";

export default defineGame({
  manifest,
  controls: CONTROLS,
  mount: async (element, { signal, settings, controls, play, log }) => {
    // All at once: Rapier's WASM (once per page), the avatar model's bytes and
    // the Basis transcoder for its textures (acquireGltfLoader starts that one).
    const assets = acquireGltfLoader();
    let loaded: [Rapier, ArrayBuffer];
    try {
      loaded = await Promise.all([
        loadPhysics(),
        fetchAvatarModel(DEFAULT_AVATAR_MODEL, signal),
      ]);
    } catch (error) {
      assets.release();
      throw error;
    }
    if (signal.aborted) {
      // Left while loading: only the loader was taken, so only it goes back.
      assets.release();
      return () => {};
    }
    const [rapier, modelBytes] = loaded;

    const sim = createSim(rapier);
    // "To the main menu", then "Play": the same world from the start, without
    // building a new Rapier world.
    const initial = sim.snapshot();
    let played = false;
    // Two sim states: render() blends between them by the loop's alpha, so
    // movement is smooth at any refresh rate although the sim ticks at 30 Hz.
    let previous: SimState = sim.state();
    let current = previous;
    let tickMs = 0; // dev: total time spent in sim.step()
    let heightScale = 1;
    let lastFrame = performance.now();

    // redraw() may be called from createView's first resize, before the loop
    // and the model exist: it waits for this flag (set once all is in place).
    let canDraw = false;
    const world = createWorld();
    const view = createShoulderCamera();
    const applyFov = (horizontal: number) => {
      view.camera.fov = verticalFov(horizontal);
      view.camera.updateProjectionMatrix();
    };
    applyFov(settings.current.fov);
    const screen = createView(element, view.camera, settings, {
      onResize: () => redraw(),
    });
    const hud = createHud(element);
    // The menu's "Play" captures the mouse (see onPlay); a click on the canvas
    // does too, as a fallback. The look starts along the spawn facing, so W
    // walks towards the gap.
    const input = createInput({
      actions,
      bindings: controls.bindings,
      pointer: {
        element: screen.canvas,
        sensitivity: () => settings.current.mouse.sensitivity,
        invertY: () => settings.current.mouse.invertY,
        pitchLimits: PITCH_LIMITS,
        initialYaw: SPAWN.facing,
        // Esc or another window: pause instead of running on into the gap.
        onUnlock: () => {
          if (play.state === "playing") {
            play.pause();
          }
        },
      },
    });
    // Parsed below, once the renderer exists: KTX2 textures are transcoded for its GPU.
    let model: AvatarModel | null = null;
    let avatar: Avatar | null = null;

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
        avatar?.tick(previous, current);
      },
      render: (alpha) => {
        draw(alpha);
      },
    });

    /** One frame of the scene; `alpha` blends the last two sim states. */
    function draw(alpha: number) {
      // A respawn is a teleport: blending would fly the avatar across the map.
      const from =
        current.respawns === previous.respawns
          ? previous.avatar
          : current.avatar;
      const to = current.avatar;
      const x = lerp(from.x, to.x, alpha);
      const y = lerp(from.y, to.y, alpha);
      const z = lerp(from.z, to.z, alpha);

      // The crouch snaps in the sim; the camera eases into it (the model
      // crouches with its own clip, see animation.ts).
      const now = performance.now();
      const ease = Math.min(1, ((now - lastFrame) / 1000) * CROUCH_EASE);
      lastFrame = now;
      heightScale += (shoulderScale(to.crouched) - heightScale) * ease;

      world.avatar.position.set(x, y, z);
      world.avatar.rotation.y = lerpAngle(from.facing, to.facing, alpha);
      avatar?.render();
      // The live look, not the tick's quantized one: turning stays smooth at
      // any refresh rate. The sim gets the same angles, quantized, every tick.
      const look = input.look();
      view.follow({ x, y, z }, look.yaw, look.pitch, heightScale, sim.castRay);

      const { hit } = current.aim;
      hud.update({
        locked: input.locked,
        prompt: play.state === "playing" && !input.locked,
        target: hit !== null,
      });
      if (dev) {
        world.aimMarker.visible = hit !== null;
        if (hit) {
          world.aimMarker.position.set(hit.point.x, hit.point.y, hit.point.z);
        }
      }
      screen.renderer.render(world.scene, view.camera);
    }

    /**
     * While the loop is stopped (menu, pause) nothing draws by itself: after a
     * resize or a settings change the picture behind the menu would be stale
     * or black. Before the model is in, there is nothing to draw yet.
     */
    function redraw() {
      if (canDraw && !loop.running) {
        draw(1);
      }
    }

    function onPlay(next: PlayState, was: PlayState) {
      if (next === "playing") {
        if (was === "menu" && played) {
          // A new game: back to the start.
          sim.restore(initial);
          current = sim.state();
          previous = current;
        }
        played = true;
        // Still inside the click on "Play" or "Continue" (play.subscribe calls
        // us synchronously), so the browser lets us capture the mouse. If it
        // refuses, the HUD asks for a click on the canvas.
        void input.lock();
        loop.start(); // start() forgets the time spent paused
        return;
      }
      loop.stop();
      input.unlock(); // a pause from the platform, not from Esc
      redraw();
    }

    // A hidden tab: a pause, not a run into the gap.
    const onVisibility = () => {
      if (document.hidden && play.state === "playing") {
        play.pause();
      }
    };
    const unsubscribers = [
      settings.subscribe((next) => {
        // Only the projection: the aim stays on the screen centre, since the
        // camera sits on the aim ray (M1-03).
        if (view.camera.fov !== verticalFov(next.fov)) {
          applyFov(next.fov);
          redraw();
        }
      }),
      controls.subscribe((next) => {
        input.setBindings(next);
      }),
      play.subscribe(onPlay),
    ];
    document.addEventListener("visibilitychange", onVisibility);

    // Reverse order of creation. It guards itself: defineGame only wraps the
    // function we *return*, so the early call below would otherwise run twice
    // (here, then again from mountGame through the wrapper).
    let disposed = false;
    const unmount = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      canDraw = false;
      document.removeEventListener("visibilitychange", onVisibility);
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
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
      avatar?.dispose();
      model?.dispose(); // geometry, material and textures of the model
      assets.release(); // the transcoder's workers, once no game uses them
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

    try {
      model = await parseAvatarModel(
        DEFAULT_AVATAR_MODEL,
        modelBytes,
        assets,
        screen.renderer,
      );
    } catch (error) {
      unmount();
      throw error;
    }
    if (signal.aborted) {
      // The shell left the page while we were setting up.
      unmount();
      return unmount;
    }
    avatar = createAvatar(model);
    world.avatar.add(avatar.root);
    // The loop waits for "Play"; until then one frame is the menu's backdrop.
    canDraw = true;
    if (play.state === "playing") {
      onPlay("playing", "menu");
    } else {
      redraw();
    }

    return unmount;
  },
});
