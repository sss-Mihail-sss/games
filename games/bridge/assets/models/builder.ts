/**
 * "Builder", the default avatar: a low-poly figure in a hard hat, generated from
 * code so the art is ours and every change is a reviewable diff.
 *
 *   bun run --filter @repo/game-bridge model:builder   → assets/src/builder.glb
 *   bun run assets                                      → assets/dist/builder.glb
 *
 * Conventions (docs/tasks/README.md, decision 8): metres, origin at the feet,
 * forward is −Z. One skinned mesh with rigid weights (every vertex follows one
 * bone), one material, colours from a 32×32 palette texture. Clips: idle, walk,
 * run, sneak, crouch, crouchWalk, jump (one-shot), fall; the gaits are timed
 * for the sim's speeds in MOVEMENT. No time or randomness: the same code
 * writes the same bytes.
 */
import { deflateSync } from "node:zlib";

import { Document, NodeIO } from "@gltf-transform/core";
import type { Node } from "@gltf-transform/core";

import { MOVEMENT } from "../../src/sim/movement.ts";

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

// ---------------------------------------------------------------------------
// Palette: 4×4 cells of 8×8 px. ETC1S encodes 4×4 blocks with shared endpoint
// colours, so cells aligned to blocks keep neighbours from bleeding into each other.

const PALETTE_SIZE = 32;
const CELLS = 4;
const COLORS = {
  boots: 0x3b2a1e,
  jeans: 0x2f4a7a,
  vest: 0xf07c1e,
  stripe: 0xdcdca8,
  shirt: 0xe9e2d0,
  skin: 0xf1c27d,
  eyes: 0x222222,
  hat: 0xf5c518,
} as const;
type ColorName = keyof typeof COLORS;
const COLOR_NAMES = Object.keys(COLORS) as ColorName[];

/** UV at the centre of the colour's cell. */
function paletteUv(color: ColorName): [number, number] {
  const index = COLOR_NAMES.indexOf(color);
  return [
    ((index % CELLS) + 0.5) / CELLS,
    (Math.floor(index / CELLS) + 0.5) / CELLS,
  ];
}

function palettePixels(): Uint8Array {
  const cell = PALETTE_SIZE / CELLS;
  const rgba = new Uint8Array(PALETTE_SIZE * PALETTE_SIZE * 4);
  for (let y = 0; y < PALETTE_SIZE; y++) {
    for (let x = 0; x < PALETTE_SIZE; x++) {
      const name =
        COLOR_NAMES[Math.floor(y / cell) * CELLS + Math.floor(x / cell)];
      const hex = name === undefined ? 0x808080 : COLORS[name];
      rgba.set(
        [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff, 0xff],
        (y * PALETTE_SIZE + x) * 4,
      );
    }
  }
  return rgba;
}

/** A minimal RGBA8 PNG encoder: one IDAT, filter 0 on every row. */
export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length);
    body.set(new TextEncoder().encode(type));
    body.set(data, 4);
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(body, 4);
    view.setUint32(8 + data.length, Bun.hash.crc32(body));
    return out;
  };

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, deflate, no filter set, no interlace

  const rows = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rows.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (1 + width * 4) + 1,
    );
  }

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(rows, { level: 9 }))),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

// ---------------------------------------------------------------------------
// Skeleton. Rest pose has no rotations, so a joint is just its position; the
// inverse bind matrix is a translation by minus that position.

const JOINTS = {
  hips: { parent: null, at: [0, 0.88, 0] },
  spine: { parent: "hips", at: [0, 0.95, 0] },
  head: { parent: "spine", at: [0, 1.4, 0] },
  // Facing −Z, the figure's right hand is on +X.
  armR: { parent: "spine", at: [0.26, 1.34, 0] },
  armL: { parent: "spine", at: [-0.26, 1.34, 0] },
  legR: { parent: "hips", at: [0.1, 0.82, 0] },
  legL: { parent: "hips", at: [-0.1, 0.82, 0] },
  // Knees and ankles let a crouch bend the legs instead of squashing the body.
  kneeR: { parent: "legR", at: [0.1, 0.45, 0] },
  kneeL: { parent: "legL", at: [-0.1, 0.45, 0] },
  footR: { parent: "kneeR", at: [0.1, 0.1, 0] },
  footL: { parent: "kneeL", at: [-0.1, 0.1, 0] },
} as const satisfies Record<string, { parent: string | null; at: Vec3 }>;
type JointName = keyof typeof JOINTS;
const JOINT_NAMES = Object.keys(JOINTS) as JointName[];

// ---------------------------------------------------------------------------
// Body: axis-aligned boxes, each bound to one joint. min/max in metres.

interface Box {
  joint: JointName;
  color: ColorName;
  min: Vec3;
  max: Vec3;
}

const ARM = { width: 0.11, top: 1.38, sleeveEnd: 1.0, bottom: 0.88 };

function limbBoxes(): Box[] {
  const boxes: Box[] = [];
  for (const side of [1, -1] as const) {
    const leg: JointName = side === 1 ? "legR" : "legL";
    const knee: JointName = side === 1 ? "kneeR" : "kneeL";
    const foot: JointName = side === 1 ? "footR" : "footL";
    const arm: JointName = side === 1 ? "armR" : "armL";
    const lx = side * 0.1;
    const ax = side * 0.26;
    boxes.push(
      // Boots stick out forward (−Z): the toes show where the figure looks.
      {
        joint: foot,
        color: "boots",
        min: [lx - 0.075, 0, -0.14],
        max: [lx + 0.075, 0.1, 0.09],
      },
      // The shin is a little thinner than the thigh and reaches into it and
      // into the boot: a bent knee or ankle shows no gap, a straight one no
      // flickering faces where two boxes would share a plane.
      {
        joint: knee,
        color: "jeans",
        min: [lx - 0.065, 0.06, -0.075],
        max: [lx + 0.065, 0.49, 0.075],
      },
      {
        joint: leg,
        color: "jeans",
        min: [lx - 0.07, 0.43, -0.08],
        max: [lx + 0.07, 0.84, 0.08],
      },
      {
        joint: arm,
        color: "shirt",
        min: [ax - ARM.width / 2, ARM.sleeveEnd, -ARM.width / 2],
        max: [ax + ARM.width / 2, ARM.top, ARM.width / 2],
      },
      {
        joint: arm,
        color: "skin",
        min: [ax - ARM.width / 2 + 0.01, ARM.bottom, -ARM.width / 2 + 0.01],
        max: [ax + ARM.width / 2 - 0.01, ARM.sleeveEnd, ARM.width / 2 - 0.01],
      },
      // Eyes sit just in front of the face, which looks along −Z.
      {
        joint: "head",
        color: "eyes",
        min: [side * 0.05 - 0.02, 1.5, -0.125],
        max: [side * 0.05 + 0.02, 1.54, -0.11],
      },
    );
  }
  return boxes;
}

const BOXES: Box[] = [
  ...limbBoxes(),
  {
    joint: "hips",
    color: "jeans",
    min: [-0.18, 0.78, -0.1],
    max: [0.18, 0.96, 0.1],
  },
  {
    joint: "spine",
    color: "vest",
    min: [-0.2, 0.95, -0.11],
    max: [0.2, 1.38, 0.11],
  },
  // A reflective stripe round the vest, a little proud of it.
  {
    joint: "spine",
    color: "stripe",
    min: [-0.205, 1.1, -0.115],
    max: [0.205, 1.14, 0.115],
  },
  {
    joint: "head",
    color: "skin",
    min: [-0.11, 1.38, -0.11],
    max: [0.11, 1.6, 0.11],
  },
  {
    joint: "head",
    color: "hat",
    min: [-0.13, 1.6, -0.13],
    max: [0.13, 1.72, 0.13],
  },
  // The brim of the hard hat reaches forward, like a cap's peak.
  {
    joint: "head",
    color: "hat",
    min: [-0.14, 1.59, -0.22],
    max: [0.14, 1.62, 0.13],
  },
];

/** Six faces with their own normals (flat shading): 24 vertices, 36 indices. */
const FACES: { normal: Vec3; corners: (min: Vec3, max: Vec3) => Vec3[] }[] = [
  {
    normal: [1, 0, 0],
    corners: (a, b) => [
      [b[0], a[1], b[2]],
      [b[0], a[1], a[2]],
      [b[0], b[1], a[2]],
      [b[0], b[1], b[2]],
    ],
  },
  {
    normal: [-1, 0, 0],
    corners: (a, b) => [
      [a[0], a[1], a[2]],
      [a[0], a[1], b[2]],
      [a[0], b[1], b[2]],
      [a[0], b[1], a[2]],
    ],
  },
  {
    normal: [0, 1, 0],
    corners: (a, b) => [
      [a[0], b[1], b[2]],
      [b[0], b[1], b[2]],
      [b[0], b[1], a[2]],
      [a[0], b[1], a[2]],
    ],
  },
  {
    normal: [0, -1, 0],
    corners: (a, b) => [
      [a[0], a[1], a[2]],
      [b[0], a[1], a[2]],
      [b[0], a[1], b[2]],
      [a[0], a[1], b[2]],
    ],
  },
  {
    normal: [0, 0, 1],
    corners: (a, b) => [
      [a[0], a[1], b[2]],
      [b[0], a[1], b[2]],
      [b[0], b[1], b[2]],
      [a[0], b[1], b[2]],
    ],
  },
  {
    normal: [0, 0, -1],
    corners: (a, b) => [
      [b[0], a[1], a[2]],
      [a[0], a[1], a[2]],
      [a[0], b[1], a[2]],
      [b[0], b[1], a[2]],
    ],
  },
];

function bodyGeometry() {
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  const indices: number[] = [];
  for (const box of BOXES) {
    const [u, v] = paletteUv(box.color);
    const joint = JOINT_NAMES.indexOf(box.joint);
    for (const face of FACES) {
      const first = position.length / 3;
      for (const corner of face.corners(box.min, box.max)) {
        position.push(...corner);
        normal.push(...face.normal);
        uv.push(u, v);
        joints.push(joint, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }
      // Counter-clockwise seen from outside, as glTF expects.
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  return { position, normal, uv, joints, weights, indices };
}

// ---------------------------------------------------------------------------
// Animations: rotations of the joints plus an offset of the hips, sampled from
// sines. Every clip keys every joint, so a cross-fade never leaves a limb behind.

const DEG = Math.PI / 180;

function axisAngle(axis: "x" | "y" | "z", angle: number): Quat {
  const s = Math.sin(angle / 2);
  const c = Math.cos(angle / 2);
  return axis === "x"
    ? [s, 0, 0, c]
    : axis === "y"
      ? [0, s, 0, c]
      : [0, 0, s, c];
}

/** About X, in degrees. Positive swings a hanging limb forward (−Z) and leans the spine back. */
const rx = (degrees: number) => axisAngle("x", degrees * DEG);

function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function rotate([qx, qy, qz, qw]: Quat, [vx, vy, vz]: Vec3): Vec3 {
  // v + 2w(q × v) + 2q × (q × v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Pose at phase p ∈ [0, 1] of a clip. Unlisted joints stay at rest. */
interface Pose {
  rotation: Partial<Record<JointName, Quat>>;
  /** Offset of the hips from their rest position. */
  hipsOffset: Vec3;
}

const IDENTITY: Quat = [0, 0, 0, 1];

/** Forward kinematics: where each joint is and how it is turned in model space. */
function jointTransforms(pose: Pose) {
  const out = {} as Record<JointName, { at: Vec3; rotation: Quat }>;
  for (const name of JOINT_NAMES) {
    const { parent, at } = JOINTS[name];
    const local = pose.rotation[name] ?? IDENTITY;
    if (parent === null) {
      out[name] = {
        at: [
          at[0] + pose.hipsOffset[0],
          at[1] + pose.hipsOffset[1],
          at[2] + pose.hipsOffset[2],
        ],
        rotation: local,
      };
      continue;
    }
    const base = out[parent];
    const from = JOINTS[parent].at;
    const offset = rotate(base.rotation, [
      at[0] - from[0],
      at[1] - from[1],
      at[2] - from[2],
    ]);
    out[name] = {
      at: [
        base.at[0] + offset[0],
        base.at[1] + offset[1],
        base.at[2] + offset[2],
      ],
      rotation: multiply(base.rotation, local),
    };
  }
  return out;
}

/** The lowest corner of any box in this pose, metres. */
function lowestPoint(pose: Pose): number {
  const joints = jointTransforms(pose);
  let lowest = Infinity;
  for (const box of BOXES) {
    const joint = joints[box.joint];
    const rest = JOINTS[box.joint].at;
    for (const x of [box.min[0], box.max[0]]) {
      for (const y of [box.min[1], box.max[1]]) {
        for (const z of [box.min[2], box.max[2]]) {
          const [, wy] = rotate(joint.rotation, [
            x - rest[0],
            y - rest[1],
            z - rest[2],
          ]);
          lowest = Math.min(lowest, joint.at[1] + wy);
        }
      }
    }
  }
  return lowest;
}

/**
 * Puts the lowest boot on the ground and the ankles' midpoint over the origin
 * (the collider's centre), whatever the legs do: bent-leg poses stay standing
 * on the floor instead of floating or sinking.
 */
function onGround(pose: Pose): Pose {
  const joints = jointTransforms(pose);
  const ankles = (joints.footR.at[2] + joints.footL.at[2]) / 2;
  return {
    rotation: pose.rotation,
    hipsOffset: [
      pose.hipsOffset[0],
      pose.hipsOffset[1] - lowestPoint(pose),
      pose.hipsOffset[2] - ankles,
    ],
  };
}

/**
 * How far one ankle travels front to back, relative to the hips, over a
 * cycle: the length of a step. A foot covers it while on the ground.
 */
function stride(pose: (p: number) => Pose): number {
  const samples = Array.from(
    { length: 64 },
    (_, i) => jointTransforms(pose(i / 64)).footR.at[2],
  );
  return Math.max(...samples) - Math.min(...samples);
}

/**
 * Legs for one side. Angles in degrees about X: the thigh from the hip, the
 * knee (negative bends it), the foot from the shin. `out` splays the leg
 * sideways (positive outwards); the foot undoes it so the sole stays flat.
 */
function leg(
  side: 1 | -1,
  thigh: number,
  knee: number,
  foot: number,
  out = 0,
): Partial<Record<JointName, Quat>> {
  const splay = axisAngle("z", side * out * DEG);
  return side === 1
    ? {
        legR: multiply(splay, rx(thigh)),
        kneeR: rx(knee),
        footR: multiply(rx(foot), axisAngle("z", -side * out * DEG)),
      }
    : {
        legL: multiply(splay, rx(thigh)),
        kneeL: rx(knee),
        footL: multiply(rx(foot), axisAngle("z", -side * out * DEG)),
      };
}

/** An arm: `forward` degrees about X, `out` degrees away from the body. */
function arm(side: 1 | -1, forward: number, out: number): Quat {
  return multiply(axisAngle("z", side * out * DEG), rx(forward));
}

interface Clip {
  name: AnimationName;
  duration: number;
  keys: number;
  /** One-shot clips play once and hold the last pose; the rest loop. */
  loop: boolean;
  pose: (p: number) => Pose;
}
type AnimationName =
  "idle" | "walk" | "run" | "sneak" | "crouch" | "crouchWalk" | "jump" | "fall";

const TURN = 2 * Math.PI;
/** Arms hang a few degrees away from the body, in degrees. */
const ARM_OUT = 4;

/** Leg length from hip joint to sole, and the swing of a walking leg. */
const LEG = 0.82;
const LEG_SWING = 40 * DEG;
/**
 * One cycle is two steps, each covering 2·LEG·sin(swing) metres; at walking
 * speed the feet keep pace with the ground (~0.53 s). The client scales
 * playback by the actual speed.
 */
export const WALK_CYCLE = (4 * LEG * Math.sin(LEG_SWING)) / MOVEMENT.walkSpeed;

/** 0 → 1 with zero slope at both ends. */
const smooth = (t: number) => t * t * (3 - 2 * t);
/** The positive half of a wave: how much a leg is swinging forward right now. */
const ahead = (x: number) => Math.max(0, x);

function walkPose(p: number): Pose {
  // The right leg leads at p = 0.25 and swings forward while cos > 0.
  const swing = Math.sin(p * TURN);
  const forward = Math.cos(p * TURN);
  return {
    rotation: {
      ...leg(1, swing * 40, -35 * ahead(forward) ** 2, 0),
      ...leg(-1, -swing * 40, -35 * ahead(-forward) ** 2, 0),
      armR: arm(1, -swing * 35, ARM_OUT),
      armL: arm(-1, swing * 35, ARM_OUT),
      spine: axisAngle("y", swing * 6 * DEG),
      head: axisAngle("y", -swing * 4 * DEG),
    },
    // Highest when the legs pass each other: twice per cycle.
    hipsOffset: [0, Math.abs(forward) * 0.04 - 0.02, 0],
  };
}

/** A sprint's limbs: long swings, the knee folds up as the leg comes through. */
function runLimbs(p: number): Pose["rotation"] {
  const swing = Math.sin(p * TURN);
  const forward = Math.cos(p * TURN);
  const side = (s: 1 | -1) =>
    leg(
      s,
      8 + s * swing * 48,
      -15 - 95 * ahead(s * forward),
      10 * ahead(s * forward),
    );
  return {
    ...side(1),
    ...side(-1),
    armR: arm(1, 20 - swing * 55, ARM_OUT + 6),
    armL: arm(-1, 20 + swing * 55, ARM_OUT + 6),
    // Leaning into it, eyes ahead.
    spine: multiply(axisAngle("y", swing * 10 * DEG), rx(-14)),
    head: multiply(axisAngle("y", -swing * 7 * DEG), rx(12)),
  };
}

/** Hips height with the planted leg straight under them (p = 0). */
const RUN_HIPS = -lowestPoint({ rotation: runLimbs(0), hipsOffset: [0, 0, 0] });

/**
 * Not grounded key by key: that would yank the hips down whenever the legs
 * spread. Up between footfalls (both feet off the ground), a little down as
 * the front foot reaches for the ground.
 */
function runPose(p: number): Pose {
  const swing = Math.sin(p * TURN);
  const flight = Math.abs(Math.sin(p * TURN * 2));
  return {
    rotation: runLimbs(p),
    hipsOffset: [0, RUN_HIPS + flight * 0.04 - swing * swing * 0.07, 0],
  };
}

/** Share of a run cycle that one foot spends on the ground: under ½, so both are up in between. */
const RUN_STANCE = 0.3;
/** The run is timed for sprinting: the planted foot keeps pace with the ground. */
export const RUN_CYCLE = stride(runPose) / (RUN_STANCE * MOVEMENT.sprintSpeed);

/** Deep squat: thighs almost level, heels down, leaning forward to balance. */
function crouchPose(p: number): Pose {
  const breath = Math.sin(p * TURN);
  return onGround({
    rotation: {
      ...leg(1, 78, -108, 30, 10),
      ...leg(-1, 78, -108, 30, 10),
      spine: rx(-32 + breath * 1.5),
      head: rx(28 - breath),
      armR: arm(1, 50 + breath * 2, ARM_OUT + 10),
      armL: arm(-1, 50 + breath * 2, ARM_OUT + 10),
    },
    hipsOffset: [0, 0, 0],
  });
}

/** A duck walk: the crouch with the legs stepping and the body rocking. */
function crouchWalkPose(p: number): Pose {
  const swing = Math.sin(p * TURN);
  const forward = Math.cos(p * TURN);
  const side = (s: 1 | -1) => {
    const thigh = 66 + s * swing * 24;
    // The shin's angle to the vertical; lifted back a little while it swings through.
    const shin = -26 + s * swing * 36 - 18 * ahead(s * forward);
    return leg(s, thigh, shin - thigh, -shin, 10);
  };
  return onGround({
    rotation: {
      ...side(1),
      ...side(-1),
      spine: multiply(axisAngle("z", swing * 4 * DEG), rx(-28)),
      head: rx(24),
      armR: arm(1, 45 - swing * 15, ARM_OUT + 10),
      armL: arm(-1, 45 + swing * 15, ARM_OUT + 10),
    },
    hipsOffset: [0, 0, 0],
  });
}

/** Creeping on bent knees, hunched, hands up in front. */
function sneakPose(p: number): Pose {
  const swing = Math.sin(p * TURN);
  const forward = Math.cos(p * TURN);
  const side = (s: 1 | -1) => {
    const thigh = 12 + s * swing * 26;
    const knee = -30 - 35 * ahead(s * forward);
    // Mostly flat feet, toes down a little as the foot swings through.
    return leg(s, thigh, knee, -(thigh + knee) * 0.8);
  };
  return onGround({
    rotation: {
      ...side(1),
      ...side(-1),
      spine: multiply(axisAngle("y", swing * 5 * DEG), rx(-22)),
      head: rx(18),
      armR: arm(1, 65 - swing * 10, ARM_OUT + 12),
      armL: arm(-1, 65 + swing * 10, ARM_OUT + 12),
    },
    hipsOffset: [0, 0, 0],
  });
}

/** Both feet move the ground speed for half a cycle each. */
export const CROUCH_WALK_CYCLE =
  (2 * stride(crouchWalkPose)) / MOVEMENT.crouchSpeed;
export const SNEAK_CYCLE = (2 * stride(sneakPose)) / MOVEMENT.sneakSpeed;

/** From the push-off (legs straight, toes pointed) to a tuck (knees up). */
function jumpPose(p: number): Pose {
  const t = smooth(p);
  const mix = (from: number, to: number) => from + (to - from) * t;
  return {
    rotation: {
      ...leg(1, mix(-5, 62), mix(0, -100), mix(-30, 25)),
      ...leg(-1, mix(-5, 48), mix(0, -85), mix(-30, 20)),
      armR: arm(1, mix(-25, 70), ARM_OUT + mix(0, 18)),
      armL: arm(-1, mix(-25, 70), ARM_OUT + mix(0, 18)),
      spine: rx(mix(-4, -8)),
      head: rx(mix(-6, 6)),
    },
    hipsOffset: [0, mix(0, 0.06), 0],
  };
}

const CLIPS: Clip[] = [
  {
    name: "idle",
    duration: 2.4,
    keys: 24,
    loop: true,
    pose: (p) => {
      const breath = Math.sin(p * TURN);
      return {
        rotation: {
          spine: rx(breath * 1.5),
          head: rx(-breath),
          armR: arm(1, 0, ARM_OUT + breath * 2),
          armL: arm(-1, 0, ARM_OUT + breath * 2),
        },
        hipsOffset: [0, breath * 0.006, 0],
      };
    },
  },
  { name: "walk", duration: WALK_CYCLE, keys: 16, loop: true, pose: walkPose },
  { name: "run", duration: RUN_CYCLE, keys: 16, loop: true, pose: runPose },
  {
    name: "sneak",
    duration: SNEAK_CYCLE,
    keys: 20,
    loop: true,
    pose: sneakPose,
  },
  { name: "crouch", duration: 2.4, keys: 24, loop: true, pose: crouchPose },
  {
    name: "crouchWalk",
    duration: CROUCH_WALK_CYCLE,
    keys: 16,
    loop: true,
    pose: crouchWalkPose,
  },
  { name: "jump", duration: 0.3, keys: 10, loop: false, pose: jumpPose },
  {
    name: "fall",
    duration: 0.6,
    keys: 12,
    loop: true,
    pose: (p) => {
      const flail = Math.sin(p * TURN);
      const kick = Math.sin(p * TURN * 2);
      return {
        rotation: {
          armR: arm(1, 0, 150 + flail * 15),
          armL: arm(-1, 0, 150 - flail * 15),
          ...leg(1, 15 + kick * 25, -25 - kick * 15, 0),
          ...leg(-1, 15 - kick * 25, -25 + kick * 15, 0),
          spine: rx(-8),
          head: rx(-12),
        },
        hipsOffset: [0, 0, 0],
      };
    },
  },
];

// ---------------------------------------------------------------------------

export async function buildBuilderModel(): Promise<Uint8Array> {
  const doc = new Document();
  doc.getRoot().getAsset().generator =
    "games.secrii.dev assets/models/builder.ts";
  const buffer = doc.createBuffer();

  const texture = doc
    .createTexture("palette")
    .setMimeType("image/png")
    .setImage(encodePng(PALETTE_SIZE, PALETTE_SIZE, palettePixels()));
  const material = doc
    .createMaterial("builder")
    .setBaseColorTexture(texture)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.85);

  const g = bodyGeometry();
  const attribute = (
    type: "VEC2" | "VEC3" | "VEC4",
    array: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>,
  ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setMaterial(material)
    .setIndices(
      doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array(g.indices))
        .setBuffer(buffer),
    )
    .setAttribute("POSITION", attribute("VEC3", new Float32Array(g.position)))
    .setAttribute("NORMAL", attribute("VEC3", new Float32Array(g.normal)))
    .setAttribute("TEXCOORD_0", attribute("VEC2", new Float32Array(g.uv)))
    .setAttribute("JOINTS_0", attribute("VEC4", new Uint8Array(g.joints)))
    .setAttribute("WEIGHTS_0", attribute("VEC4", new Float32Array(g.weights)));
  const mesh = doc.createMesh("builder").addPrimitive(primitive);

  // Joint nodes hold positions relative to their parents.
  const nodes = {} as Record<JointName, Node>;
  for (const name of JOINT_NAMES) {
    const { parent, at } = JOINTS[name];
    const origin: Vec3 = parent === null ? [0, 0, 0] : [...JOINTS[parent].at];
    const node = doc
      .createNode(name)
      .setTranslation([
        at[0] - origin[0],
        at[1] - origin[1],
        at[2] - origin[2],
      ]);
    nodes[name] = node;
    if (parent !== null) {
      nodes[parent].addChild(node);
    }
  }

  const skin = doc.createSkin("builder").setSkeleton(nodes.hips);
  const inverseBind: number[] = [];
  for (const name of JOINT_NAMES) {
    skin.addJoint(nodes[name]);
    const [x, y, z] = JOINTS[name].at;
    inverseBind.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1); // column-major
  }
  skin.setInverseBindMatrices(
    attribute("VEC4", new Float32Array(inverseBind)).setType("MAT4"),
  );

  const root = doc
    .createNode("Builder")
    .addChild(doc.createNode("body").setMesh(mesh).setSkin(skin))
    .addChild(nodes.hips);
  doc.createScene("Builder").addChild(root);

  for (const clip of CLIPS) {
    const animation = doc.createAnimation(clip.name);
    // keys + 1 samples: in a loop the last one repeats the first, so the
    // loop closes; a one-shot clip ends on its own last pose.
    const times = Array.from(
      { length: clip.keys + 1 },
      (_, i) => (i / clip.keys) * clip.duration,
    );
    const poses = times.map((_, i) =>
      clip.pose(clip.loop ? (i % clip.keys) / clip.keys : i / clip.keys),
    );
    const input = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Float32Array(times))
      .setBuffer(buffer);

    const channel = (
      node: Node,
      path: "rotation" | "translation",
      values: number[],
    ) => {
      const sampler = doc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(
          attribute(
            path === "rotation" ? "VEC4" : "VEC3",
            new Float32Array(values),
          ),
        )
        .setInterpolation("LINEAR");
      animation
        .addSampler(sampler)
        .addChannel(
          doc
            .createAnimationChannel()
            .setTargetNode(node)
            .setTargetPath(path)
            .setSampler(sampler),
        );
    };

    for (const name of JOINT_NAMES) {
      channel(
        nodes[name],
        "rotation",
        poses.flatMap((pose) => pose.rotation[name] ?? IDENTITY),
      );
    }
    const rest = JOINTS.hips.at;
    channel(
      nodes.hips,
      "translation",
      poses.flatMap((pose) => [
        rest[0] + pose.hipsOffset[0],
        rest[1] + pose.hipsOffset[1],
        rest[2] + pose.hipsOffset[2],
      ]),
    );
  }

  return new NodeIO().writeBinary(doc);
}

export const BUILDER_SOURCE = new URL("../src/builder.glb", import.meta.url);

if (import.meta.main) {
  const glb = await buildBuilderModel();
  await Bun.write(BUILDER_SOURCE, glb);
  console.info(
    `${BUILDER_SOURCE.pathname}: ${(glb.length / 1024).toFixed(1)} KB`,
  );
}
