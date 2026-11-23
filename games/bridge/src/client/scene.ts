import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from "three";

import { LEVEL } from "../sim/index.ts";

const WATER_LEVEL = -3.5;
const SKY = 0x9ecbf0;

export interface World {
  scene: Scene;
  /**
   * An empty anchor for the avatar model: its origin stands on the ground and
   * rotation.y is the facing. The model is added by the caller (avatar-model.ts).
   */
  avatar: Group;
  dispose: () => void;
}

/** Temporary art from primitives, built from the sim's LEVEL so walls match. */
export function createWorld(): World {
  // Everything that holds GPU memory goes through own(), so dispose() can't miss it.
  const owned: { dispose: () => void }[] = [];
  const own = <T extends { dispose: () => void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };

  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 40, 120);

  scene.add(new HemisphereLight(0xffffff, 0x4a5a3a, 1.2));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(10, 20, 8);
  scene.add(sun);

  const grass = own(new MeshStandardMaterial({ color: 0x6b9b4a }));
  const bankGeometry = own(
    new BoxGeometry(LEVEL.bankLength, LEVEL.bankDepth, LEVEL.width),
  );
  for (const side of [-1, 1]) {
    const bank = new Mesh(bankGeometry, grass);
    // Top face at y = 0, inner edge at ±gap/2.
    bank.position.set(
      side * (LEVEL.gap / 2 + LEVEL.bankLength / 2),
      -LEVEL.bankDepth / 2,
      0,
    );
    scene.add(bank);
  }

  const water = new Mesh(
    own(new PlaneGeometry(200, 200)),
    own(new MeshStandardMaterial({ color: 0x3d7ab8 })),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  scene.add(water);

  const avatar = new Group();
  scene.add(avatar);

  return {
    scene,
    avatar,
    dispose: () => {
      for (const resource of owned) {
        resource.dispose();
      }
      owned.length = 0;
      scene.clear();
    },
  };
}
