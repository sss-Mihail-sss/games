"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { Button, button } from "@repo/ui";

import { useSettings } from "./hooks.ts";

/** The panel every menu and the settings screen sit in. */
export function Panel({
  title,
  wide = false,
  focusSelf = false,
  children,
}: {
  title: string;
  wide?: boolean;
  /**
   * Focus the panel itself on open, for a long one: autofocusing a button at
   * the bottom would scroll the top out of view.
   */
  focusSelf?: boolean;
  children: ReactNode;
}) {
  const { reducedMotion } = useSettings();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusSelf) {
      ref.current?.focus();
    }
  }, [focusSelf]);
  return (
    <section
      ref={ref}
      tabIndex={focusSelf ? -1 : undefined}
      aria-label={title}
      className={[
        "flex max-h-full w-full flex-col gap-5 overflow-y-auto rounded-2xl bg-neutral-900/90 p-6 text-white shadow-2xl outline-none",
        wide ? "max-w-lg" : "max-w-xs",
        // The OS preference (motion-safe) and the site's own setting both count.
        reducedMotion ? "" : "motion-safe:animate-[menu-in_160ms_ease-out]",
      ].join(" ")}
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function MainMenu({
  title,
  ready,
  catalogHref,
  onPlay,
  onSettings,
}: {
  title: string;
  /** The game has mounted: "Play" starts at once. */
  ready: boolean;
  catalogHref: string;
  onPlay: () => void;
  onSettings: () => void;
}) {
  return (
    <Panel title={title}>
      <nav className="grid gap-2">
        {/* Not autofocused while loading: a disabled button can't take focus. */}
        <Button
          tone="primary"
          size="lg"
          disabled={!ready}
          autoFocus={ready}
          onClick={onPlay}
        >
          {ready ? "Играть" : "Загрузка…"}
        </Button>
        {/* M1-11 puts "Персонаж" here, between "Играть" and "Настройки". */}
        <Button autoFocus={!ready} onClick={onSettings}>
          Настройки
        </Button>
        <Link href={catalogHref} className={button({ variant: "subtle" })}>
          В каталог
        </Link>
      </nav>
    </Panel>
  );
}

export function PauseMenu({
  onResume,
  onSettings,
  onExit,
}: {
  onResume: () => void;
  onSettings: () => void;
  onExit: () => void;
}) {
  return (
    <Panel title="Пауза">
      <nav className="grid gap-2">
        <Button tone="primary" size="lg" autoFocus onClick={onResume}>
          Продолжить
        </Button>
        <Button onClick={onSettings}>Настройки</Button>
        <Button variant="subtle" onClick={onExit}>
          В главное меню
        </Button>
      </nav>
    </Panel>
  );
}
