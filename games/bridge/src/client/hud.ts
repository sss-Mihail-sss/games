/**
 * DOM on top of the canvas: the crosshair and the "click to play" overlay.
 * Plain DOM with inline styles: the game package doesn't depend on the site's CSS.
 */
export interface Hud {
  /** Call every frame; touches the DOM only when something changed. */
  update: (state: { locked: boolean; target: boolean }) => void;
  dispose: () => void;
}

export function createHud(element: HTMLElement): Hud {
  // The overlay and the crosshair are positioned against the game's container.
  const previousPosition = element.style.position;
  if (getComputedStyle(element).position === "static") {
    element.style.position = "relative";
  }

  const crosshair = document.createElement("div");
  Object.assign(crosshair.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "6px",
    height: "6px",
    margin: "-3px 0 0 -3px",
    borderRadius: "50%",
    background: "white",
    boxShadow: "0 0 0 1.5px rgba(0, 0, 0, 0.6)",
    pointerEvents: "none",
    transition: "transform 80ms ease-out",
  } satisfies Partial<CSSStyleDeclaration>);

  // Clicks must reach the canvas, which captures the mouse: no pointer events here.
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    background: "rgba(0, 0, 0, 0.45)",
    color: "white",
    font: "600 1.25rem system-ui, sans-serif",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  const title = document.createElement("div");
  title.textContent = "Кликни, чтобы играть";
  const hint = document.createElement("div");
  hint.textContent = "Мышь — обзор, WASD — ходьба, Esc — отпустить мышь";
  Object.assign(hint.style, { font: "400 0.875rem system-ui, sans-serif" });
  overlay.append(title, hint);

  element.append(crosshair, overlay);

  let shown: { locked: boolean; target: boolean } | null = null;

  return {
    update: (state) => {
      if (shown?.locked === state.locked && shown.target === state.target) {
        return;
      }
      shown = state;
      overlay.style.display = state.locked ? "none" : "flex";
      crosshair.style.display = state.locked ? "block" : "none";
      // Something within reach: the dot grows and turns warm.
      crosshair.style.transform = state.target ? "scale(1.8)" : "scale(1)";
      crosshair.style.background = state.target ? "#ffd166" : "white";
    },
    dispose: () => {
      crosshair.remove();
      overlay.remove();
      element.style.position = previousPosition;
    },
  };
}
