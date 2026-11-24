"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { Button } from "@repo/ui";

// Loaded on the first click: the catalog's first paint (LCP) doesn't wait for
// sliders and tabs nobody opened.
const SettingsScreen = lazy(() =>
  import("#game-shell/settings-screen.tsx").then((module) => ({
    default: module.SettingsScreen,
  })),
);

/**
 * Settings from the catalog: only the general ones, since there is no game
 * here and so no keys to bind. A native modal <dialog>: it keeps focus inside,
 * makes the page behind inert and closes on Esc by itself.
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    }
  }, [open]);

  return (
    <>
      <Button
        variant="outline"
        className="border-current text-current"
        onClick={() => setOpen(true)}
      >
        Настройки
      </Button>
      {open && (
        <dialog
          ref={dialogRef}
          aria-label="Настройки"
          // Esc closes the dialog natively; keep React's state in step.
          onClose={() => setOpen(false)}
          className="m-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-visible bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        >
          <Suspense fallback={<p className="text-white">Загрузка…</p>}>
            <SettingsScreen onClose={() => dialogRef.current?.close()} />
          </Suspense>
        </dialog>
      )}
    </>
  );
}
