import { defineGame } from "@repo/game-core";

import { manifest } from "../manifest.ts";

/**
 * Placeholder client for M0-05: proves the shell can load, mount and fully
 * dispose a WebGL game. M0-06 replaces it with the real Three.js scene.
 */
export default defineGame({
  manifest,
  mount: (element, { signal }) => {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    element.append(canvas);

    const gl = canvas.getContext("webgl2");
    gl?.clearColor(0.2, 0.4, 0.8, 1);
    gl?.clear(gl.COLOR_BUFFER_BIT);

    const unmount = () => {
      // Release the GPU context right away instead of waiting for GC:
      // otherwise Chrome warns "Too many active WebGL contexts" after a few visits.
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };

    // The shell may already have left the page; don't keep a context nobody needs.
    if (signal.aborted) {
      unmount();
    }

    return Promise.resolve(unmount);
  },
});
