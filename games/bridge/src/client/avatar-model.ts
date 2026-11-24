import { AnimationMixer, LoopOnce, LoopRepeat, SkinnedMesh } from "three";
import type {
  AnimationAction,
  AnimationClip,
  Object3D,
  WebGLRenderer,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { MOVEMENT } from "../sim/index.ts";
import type { SimState } from "../sim/index.ts";
import {
  AVATAR_ANIMATIONS,
  motionBetween,
  nextAnimation,
  ONE_SHOT_ANIMATIONS,
} from "./animation.ts";
import type { AvatarAnimation } from "./animation.ts";
import { disposeObject } from "./assets.ts";
import type { GltfLoader } from "./assets.ts";

/**
 * Avatar models by id. Each URL is a literal on purpose: that is how the bundler
 * finds the file and ships it with a hashed name. A character (M1-11) picks its
 * model from here. Every model follows decision 8 (metres, origin at the feet,
 * forward −Z) and has the clips in AVATAR_ANIMATIONS, with the gaits timed for
 * GAIT_SPEEDS.
 */
export const AVATAR_MODELS = {
  builder: new URL("../../assets/dist/builder.glb", import.meta.url),
} as const;
export type AvatarModelId = keyof typeof AVATAR_MODELS;
export const DEFAULT_AVATAR_MODEL: AvatarModelId = "builder";

/**
 * The speed, m/s, each stepping clip is timed for: at it the planted foot keeps
 * pace with the ground. Playback scales with the actual speed, so a slower
 * character (M1-11) or a slope takes slower steps instead of skating.
 */
export const GAIT_SPEEDS = {
  walk: MOVEMENT.walkSpeed,
  run: MOVEMENT.sprintSpeed,
  sneak: MOVEMENT.sneakSpeed,
  crouchWalk: MOVEMENT.crouchSpeed,
} as const satisfies Partial<Record<AvatarAnimation, number>>;
const GAITS = Object.keys(GAIT_SPEEDS) as (keyof typeof GAIT_SPEEDS)[];
/** Slowest gait playback: below it a fading-out step looks frozen. */
const MIN_GAIT_SCALE = 0.3;

/** Cross-fade between clips, seconds. */
const FADE = 0.2;
/** Longest frame the mixer will advance by: after a hidden tab it shouldn't jump. */
const MAX_FRAME_DT = 0.1;

/** Network only, no renderer needed: can start before the renderer exists. */
export async function fetchAvatarModel(
  id: AvatarModelId,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetch(AVATAR_MODELS[id], { signal });
  if (!response.ok) {
    throw new Error(
      `Avatar model "${id}": ${response.status} ${response.statusText}`,
    );
  }
  return response.arrayBuffer();
}

/** A loaded model: owns the GPU resources that its avatars share. */
export interface AvatarModel {
  readonly id: AvatarModelId;
  readonly scene: Object3D;
  readonly clips: Readonly<Record<AvatarAnimation, AnimationClip>>;
  dispose: () => void;
}

export async function parseAvatarModel(
  id: AvatarModelId,
  bytes: ArrayBuffer,
  loader: GltfLoader,
  renderer: WebGLRenderer,
): Promise<AvatarModel> {
  const gltf = await loader.parse(bytes, renderer);
  const dispose = () => disposeObject(gltf.scene);

  const clips = {} as Record<AvatarAnimation, AnimationClip>;
  for (const name of AVATAR_ANIMATIONS) {
    const clip = gltf.animations.find((each) => each.name === name);
    if (clip === undefined) {
      dispose();
      throw new Error(
        `Avatar model "${id}" has no "${name}" animation; it has: ${gltf.animations.map((each) => each.name).join(", ") || "none"}`,
      );
    }
    clips[name] = clip;
  }
  return { id, scene: gltf.scene, clips, dispose };
}

/** One avatar on screen. Many can share a model (other players in M2). */
export interface Avatar {
  /** Put it into the anchor group that render() moves and turns. */
  readonly root: Object3D;
  /** Once per sim tick: picks the animation from what the avatar just did. */
  tick: (previous: SimState, current: SimState) => void;
  /** Every frame: advances the animation by real time. */
  render: () => void;
  /** Its own resources only; the model's stay for other avatars. */
  dispose: () => void;
}

export function createAvatar(model: AvatarModel): Avatar {
  // SkeletonUtils.clone, not scene.clone(): a plain clone keeps the skinned
  // mesh bound to the original's bones. Geometry, materials and textures are shared.
  const root = clone(model.scene);
  const mixer = new AnimationMixer(root);
  const actions = {} as Record<AvatarAnimation, AnimationAction>;
  for (const name of AVATAR_ANIMATIONS) {
    const action = mixer.clipAction(model.clips[name]);
    if (ONE_SHOT_ANIMATIONS.includes(name)) {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true; // hold the last pose until the next clip
    } else {
      action.setLoop(LoopRepeat, Infinity);
    }
    actions[name] = action;
  }

  let animation: AvatarAnimation = "idle";
  actions.idle.play();
  let lastFrame: number | null = null;

  return {
    root,
    tick: (previous, current) => {
      const motion = motionBetween(previous, current);
      const next = nextAnimation(animation, motion);
      for (const gait of GAITS) {
        actions[gait].timeScale = Math.max(
          MIN_GAIT_SCALE,
          motion.speed / GAIT_SPEEDS[gait],
        );
      }
      if (next === animation) {
        return;
      }
      actions[next].reset().play();
      actions[animation].crossFadeTo(actions[next], FADE, false);
      animation = next;
    },
    render: () => {
      const now = performance.now();
      const dt = lastFrame === null ? 0 : (now - lastFrame) / 1000;
      lastFrame = now;
      mixer.update(Math.min(dt, MAX_FRAME_DT));
    },
    dispose: () => {
      mixer.stopAllAction();
      // The mixer caches bindings to the clone; without this it is never collected.
      mixer.uncacheRoot(root);
      // A cloned skeleton is new and has its own bone texture on the GPU.
      root.traverse((object) => {
        if (object instanceof SkinnedMesh) {
          object.skeleton.dispose();
        }
      });
      root.removeFromParent();
    },
  };
}
