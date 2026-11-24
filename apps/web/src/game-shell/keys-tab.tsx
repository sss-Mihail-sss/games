"use client";

import { useEffect, useState } from "react";

import type { Controls } from "@repo/game-core";
import { Button } from "@repo/ui";

import {
  forbiddenReason,
  keyLabel,
  MAX_KEYS_PER_ACTION,
} from "#platform/index.ts";
import type { BindingsStore, LayoutMap } from "#platform/index.ts";

import { useBindings } from "./hooks.ts";

/** `navigator.keyboard`: Chromium only, so not in the DOM types. */
interface KeyboardApi {
  getLayoutMap?: () => Promise<LayoutMap>;
}

/** The current layout, where the browser tells it; otherwise labels come from the code. */
function useLayoutMap(): LayoutMap | undefined {
  const [layout, setLayout] = useState<LayoutMap>();
  useEffect(() => {
    const keyboard = (navigator as { keyboard?: KeyboardApi }).keyboard;
    let alive = true;
    keyboard
      ?.getLayoutMap?.()
      .then((map) => {
        if (alive) {
          setLayout(map);
        }
      })
      .catch(() => {
        // Not allowed here (an iframe, an insecure page): labels from the code.
      });
    return () => {
      alive = false;
    };
  }, []);
  return layout;
}

const codeOf = (source: string) => source.replace(/^Key:/, "");

interface Slot {
  action: string;
  slot: number;
}

interface Conflict extends Slot {
  source: string;
  /** The action that has the key now. */
  holder: string;
}

/**
 * The game's actions and their keys. A click on a key waits for the next key
 * press; the platform checks it (forbidden keys, conflicts) and saves it.
 */
export function KeysTab({
  controls,
  bindings,
}: {
  controls: Controls;
  bindings: BindingsStore;
}) {
  const current = useBindings(bindings);
  const layout = useLayoutMap();
  const [capturing, setCapturing] = useState<Slot | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!capturing) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      // Ours, before anyone else: Space must not scroll, Esc must not close
      // the screen, and the menus' own Esc handling must not see it.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) {
        return;
      }
      if (event.code === "Escape") {
        setCapturing(null);
        return;
      }
      const reason = forbiddenReason(event.code);
      if (reason !== null) {
        setNotice(reason);
        return; // still waiting for a key
      }
      const source = `Key:${event.code}`;
      const result = bindings.assign(capturing.action, capturing.slot, source);
      if (!result.ok && "conflict" in result) {
        setConflict({ ...capturing, source, holder: result.conflict });
      }
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [capturing, bindings]);

  const startCapture = (slot: Slot) => {
    setConflict(null);
    setNotice(null);
    setCapturing((now) =>
      now?.action === slot.action && now.slot === slot.slot ? null : slot,
    );
  };

  const label = (action: string) => controls.labels[action] ?? action;

  return (
    <div className="grid gap-4">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-white/60">
          <tr>
            <th className="pb-2 font-normal">Действие</th>
            <th className="pb-2 font-normal">Основная</th>
            <th className="pb-2 font-normal">Дополнительная</th>
          </tr>
        </thead>
        <tbody>
          {controls.actions.map((action) => {
            const sources = current[action] ?? [];
            return (
              <tr key={action} className="border-t border-white/10">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {label(action)}
                </th>
                {Array.from({ length: MAX_KEYS_PER_ACTION }, (_, slot) => {
                  const source = sources[slot];
                  const waiting =
                    capturing?.action === action && capturing.slot === slot;
                  // Only the first empty slot: the list has no holes.
                  if (source === undefined && slot > sources.length) {
                    return <td key={slot} />;
                  }
                  return (
                    <td key={slot} className="py-1.5 pr-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={waiting ? "outline" : "solid"}
                          tone={waiting ? "primary" : "neutral"}
                          className="min-w-24"
                          aria-label={`${label(action)}, ${slot === 0 ? "основная" : "дополнительная"} клавиша: ${source ? keyLabel(codeOf(source), layout) : "нет"}`}
                          onClick={() => startCapture({ action, slot })}
                        >
                          {waiting
                            ? "Нажмите клавишу…"
                            : source
                              ? keyLabel(codeOf(source), layout)
                              : "—"}
                        </Button>
                        {source && !waiting && (
                          <Button
                            size="sm"
                            variant="subtle"
                            aria-label={`Убрать клавишу у действия «${label(action)}»`}
                            onClick={() => bindings.clear(action, slot)}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div aria-live="polite" className="min-h-6 text-sm">
        {capturing && !notice && <p className="text-white/70">Esc — отмена.</p>}
        {notice && <p className="text-amber-200">{notice}</p>}
        {conflict && (
          <div className="flex flex-wrap items-center gap-2">
            <p>
              Клавиша «{keyLabel(codeOf(conflict.source), layout)}» уже
              назначена: «{label(conflict.holder)}». Заменить?
            </p>
            <Button
              size="sm"
              tone="primary"
              autoFocus
              onClick={() => {
                bindings.assign(
                  conflict.action,
                  conflict.slot,
                  conflict.source,
                  {
                    replace: true,
                  },
                );
                setConflict(null);
              }}
            >
              Заменить
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => setConflict(null)}
            >
              Отмена
            </Button>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => {
          bindings.reset();
          setConflict(null);
          setNotice(null);
          setCapturing(null);
        }}
      >
        Сбросить к стандартным
      </Button>
    </div>
  );
}
