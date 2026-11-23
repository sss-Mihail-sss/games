"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { gameLoader } from "#game-loader/index.ts";
import type { GameId } from "#games/index.ts";

interface PlayLinkProps {
  gameId: GameId;
  href: string;
  children: ReactNode;
}

/**
 * Link to a game page that starts downloading the game code as soon as the user
 * shows intent (pointer over the link, or keyboard focus). Next only prefetches
 * the page itself; the game chunk is loaded by GameHost, so we warm it up here.
 */
export function PlayLink({ gameId, href, children }: PlayLinkProps) {
  const preload = () => {
    gameLoader.preload(gameId);
  };

  return (
    <Link href={href} onPointerEnter={preload} onFocus={preload}>
      {children}
    </Link>
  );
}
