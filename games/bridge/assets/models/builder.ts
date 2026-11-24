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
 * fall. No time or randomness: the same code writes the same bytes.
 */
import { deflateSync } from "node:zlib";

import { Document, NodeIO } from "@gltf-transform/core";
import type { Node } from "@gltf-transform/core";

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** The sim's WALK_SPEED, m/s: the walk cycle is timed for it (see WALK_CYCLE). */
const WALK_SPEED = 4;

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
    const arm: JointName = side === 1 ? "armR" : "armL";
    const lx = side * 0.1;
    const ax = side * 0.26;
    boxes.push(
      // Boots stick out forward (−Z): the toes show where the figure looks.
      {
        joint: leg,
        color: "boots",
        min: [lx - 0.075, 0, -0.14],
        max: [lx + 0.075, 0.1, 0.09],
      },
      {
        joint: leg,
        color: "jeans",
        min: [lx - 0.07, 0.1, -0.08],
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
// Animations: rotations of the joints plus a bob of the hips, sampled from
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

/** Pose at phase p ∈ [0, 1) of a looping clip. Unlisted joints stay at rest. */
interface Pose {
  rotation: Partial<Record<JointName, Quat>>;
  /** Offset of the hips from their rest position. */
  hipsOffset: Vec3;
}

interface Clip {
  name: "idle" | "walk" | "fall";
  duration: number;
  keys: number;
  pose: (p: number) => Pose;
}

const TURN = 2 * Math.PI;
/** Arms hang a few degrees away from the body. Positive Z lifts the right (+X) arm outwards. */
const ARM_OUT = 4 * DEG;

/** Leg length from hip joint to sole, and the swing of a walking leg. */
const LEG = 0.82;
const LEG_SWING = 40 * DEG;
/**
 * One cycle is two steps, each covering 2·LEG·sin(swing) metres; at WALK_SPEED
 * the feet keep pace with the ground (~0.53 s). The client scales playback by
 * the actual speed.
 */
export const WALK_CYCLE = (4 * LEG * Math.sin(LEG_SWING)) / WALK_SPEED;

const CLIPS: Clip[] = [
  {
    name: "idle",
    duration: 2.4,
    keys: 24,
    pose: (p) => {
      const breath = Math.sin(p * TURN);
      return {
        rotation: {
          spine: axisAngle("x", breath * 1.5 * DEG),
          head: axisAngle("x", -breath * 1 * DEG),
          armR: axisAngle("z", ARM_OUT + breath * 2 * DEG),
          armL: axisAngle("z", -ARM_OUT - breath * 2 * DEG),
        },
        hipsOffset: [0, breath * 0.006, 0],
      };
    },
  },
  {
    name: "walk",
    duration: WALK_CYCLE,
    keys: 16,
    pose: (p) => {
      // Positive X swings a limb forward (−Z). The right leg leads at p = 0.25.
      const swing = Math.sin(p * TURN);
      return {
        rotation: {
          legR: axisAngle("x", swing * LEG_SWING),
          legL: axisAngle("x", -swing * LEG_SWING),
          armR: multiply(
            axisAngle("z", ARM_OUT),
            axisAngle("x", -swing * 35 * DEG),
          ),
          armL: multiply(
            axisAngle("z", -ARM_OUT),
            axisAngle("x", swing * 35 * DEG),
          ),
          spine: axisAngle("y", swing * 6 * DEG),
          head: axisAngle("y", -swing * 4 * DEG),
        },
        // Highest when the legs pass each other: twice per cycle.
        hipsOffset: [0, Math.abs(Math.cos(p * TURN)) * 0.04 - 0.02, 0],
      };
    },
  },
  {
    name: "fall",
    duration: 0.6,
    keys: 12,
    pose: (p) => {
      const flail = Math.sin(p * TURN);
      const kick = Math.sin(p * TURN * 2);
      return {
        rotation: {
          armR: axisAngle("z", 150 * DEG + flail * 15 * DEG),
          armL: axisAngle("z", -150 * DEG + flail * 15 * DEG),
          legR: axisAngle("x", 15 * DEG + kick * 25 * DEG),
          legL: axisAngle("x", 15 * DEG - kick * 25 * DEG),
          spine: axisAngle("x", -8 * DEG),
          head: axisAngle("x", -12 * DEG),
        },
        hipsOffset: [0, 0, 0],
      };
    },
  },
];

const IDENTITY: Quat = [0, 0, 0, 1];

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
    // keys + 1 samples: the last one repeats the first, so the loop closes.
    const times = Array.from(
      { length: clip.keys + 1 },
      (_, i) => (i / clip.keys) * clip.duration,
    );
    const poses = times.map((_, i) => clip.pose((i % clip.keys) / clip.keys));
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
