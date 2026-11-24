import { SkinnedMesh, Texture } from "three";
import type { Material, Mesh, Object3D, WebGLRenderer } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

export interface GltfLoader {
  /**
   * Turns .glb bytes into a scene. KTX2 textures are transcoded to a format this
   * renderer's GPU supports (BC7, ASTC, ETC2…), so the renderer must exist first.
   */
  parse: (bytes: ArrayBuffer, renderer: WebGLRenderer) => Promise<GLTF>;
  /** Gives the loader back; the last release stops the transcoder's workers. */
  release: () => void;
}

interface Shared {
  gltf: GLTFLoader;
  ktx2: KTX2Loader;
  /** Settles (never rejects) once the transcoder has loaded or failed to. */
  transcoder: Promise<void>;
  users: number;
}

let shared: Shared | null = null;

/**
 * One loader for the page while anyone uses it. Two KTX2Loaders would mean two
 * worker pools (three warns about it), and React StrictMode mounts the game twice
 * at once. The first user starts downloading the Basis transcoder right away, in
 * parallel with whatever else the game is loading.
 *
 * The transcoder is not ours to serve: with no transcoder path set, KTX2Loader
 * refers to `basis_transcoder.js` / `.wasm` through `new URL(…, import.meta.url)`,
 * and the bundler ships them next to the game's chunk under hashed names.
 */
export function acquireGltfLoader(): GltfLoader {
  if (shared === null) {
    const ktx2 = new KTX2Loader();
    // A failure is not lost: parse() awaits the same promise and rejects with it.
    const transcoder = ktx2.init().then(
      () => {},
      () => {},
    );
    const gltf = new GLTFLoader()
      .setKTX2Loader(ktx2)
      .setMeshoptDecoder(MeshoptDecoder);
    shared = { gltf, ktx2, transcoder, users: 0 };
  }
  const loader = shared;
  loader.users += 1;

  let released = false;
  return {
    parse: (bytes, renderer) => {
      loader.ktx2.detectSupport(renderer);
      return loader.gltf.parseAsync(bytes, "");
    },
    release: () => {
      if (released) {
        return;
      }
      released = true;
      loader.users -= 1;
      // Not before the transcoder settles: init() would still create the blob URL
      // of the worker source after dispose() and nothing would revoke it. Whoever
      // comes in meanwhile gets this loader back instead of a second one.
      void loader.transcoder.then(() => {
        if (loader.users === 0 && shared === loader) {
          shared = null;
          loader.ktx2.dispose(); // workers and the blob URL of their source
        }
      });
    },
  };
}

/**
 * Frees everything `root` holds on the GPU: geometries, materials, their
 * textures and the bone textures of skeletons. Shared resources are freed once.
 * `material.dispose()` leaves textures alone (a material doesn't own them), so
 * they are collected from the material's properties: by type, not by a list of
 * slot names, so a new slot can't be missed.
 */
export function disposeObject(root: Object3D): void {
  const resources = new Set<{ dispose: () => void }>();
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) {
      resources.add(object.skeleton);
    }
    const { geometry, material } = object as Partial<Mesh>;
    if (geometry !== undefined) {
      resources.add(geometry);
    }
    const materials: Material[] =
      material === undefined
        ? []
        : Array.isArray(material)
          ? material
          : [material];
    for (const each of materials) {
      resources.add(each);
      for (const value of Object.values(each)) {
        if (value instanceof Texture) {
          resources.add(value);
        }
      }
    }
  });
  for (const resource of resources) {
    resource.dispose();
  }
}
