import type { GameContext, PlatformSettings } from "@repo/game-core";
import { WebGLRenderer } from "three";
import type { PerspectiveCamera } from "three";

/** Device pixels per CSS pixel at most: the main GPU cost knob of the quality setting. */
const PIXEL_RATIO_CAP: Record<PlatformSettings["quality"], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

export interface View {
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  dispose: () => void;
}

/**
 * A WebGL canvas that fills `element` and keeps its drawing buffer in sync with
 * the element's size, the device pixel ratio and the quality setting.
 */
export function createView(
  element: HTMLElement,
  camera: PerspectiveCamera,
  settings: GameContext["settings"],
): View {
  const renderer = new WebGLRenderer({ antialias: true });
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  element.append(canvas);

  let quality = settings.current.quality;
  // Content box, like ResizeObserver's contentRect below: padding is not ours to draw on.
  const style = getComputedStyle(element);
  let width =
    element.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
  let height =
    element.clientHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom);

  const resize = () => {
    if (width <= 0 || height <= 0) {
      return; // hidden container: keep the last good size
    }
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP[quality]),
    );
    // false: keep our CSS size, only resize the drawing buffer.
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  // The container, not the window: the game doesn't know how much of the page it gets.
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) {
      return;
    }
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    resize();
  });
  observer.observe(element);

  // Moving the window to a monitor with another pixel density changes
  // devicePixelRatio without resizing anything, so ResizeObserver stays silent.
  // A query for the current ratio fires once when it stops matching; then we
  // watch the new ratio. (Browser zoom also lands here.)
  let pixelRatioQuery: MediaQueryList | null = null;
  const onPixelRatioChange = () => {
    resize();
    watchPixelRatio();
  };
  const watchPixelRatio = () => {
    pixelRatioQuery?.removeEventListener("change", onPixelRatioChange);
    pixelRatioQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`,
    );
    pixelRatioQuery.addEventListener("change", onPixelRatioChange);
  };
  watchPixelRatio();

  const unsubscribe = settings.subscribe((next) => {
    if (next.quality === quality) {
      return; // volume and the rest don't touch the drawing buffer
    }
    quality = next.quality;
    resize();
  });

  return {
    renderer,
    canvas,
    dispose: () => {
      observer.disconnect();
      pixelRatioQuery?.removeEventListener("change", onPixelRatioChange);
      unsubscribe();
      renderer.dispose();
      // Free the GPU context now instead of on GC, or Chrome starts warning
      // "Too many active WebGL contexts" after a few visits.
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
