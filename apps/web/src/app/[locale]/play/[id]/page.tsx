import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { games } from "../../../../games/index.ts";
import type { GameId } from "../../../../games/index.ts";
import { getLocale, locales } from "../../../../locale/index.ts";
import { playPath, siteName } from "../../../../site/index.ts";
import { GameHost } from "./game-host.tsx";

type Props = PageProps<"/[locale]/play/[id]">;

// Only registered games have pages: any other id is a 404 (app/global-not-found.tsx)
// without rendering. Needed here too, not only in the layout, so the page stays static.
export const dynamicParams = false;

export function generateStaticParams(): { id: GameId }[] {
  return games.manifests.map((game) => ({ id: game.id }));
}

async function gameIdFrom(params: Props["params"]): Promise<GameId> {
  const { id } = await params;
  if (!games.has(id)) {
    notFound();
  }
  return id;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = await gameIdFrom(params);
  const locale = await getLocale();
  const game = games.manifest(id);
  const path = playPath(locale, id);

  return {
    title: game.title,
    description: game.description,
    alternates: {
      canonical: path,
      languages: Object.fromEntries(
        locales.map((other) => [other, playPath(other, id)]),
      ),
    },
    openGraph: {
      // A page's openGraph replaces the layout's one instead of merging into it.
      siteName,
      type: "website",
      title: game.title,
      description: game.description,
      url: path,
      locale,
      images: [{ url: game.thumbnail, width: 320, height: 180 }],
    },
  };
}

export default async function PlayPage({ params }: Props) {
  const id = await gameIdFrom(params);
  const locale = await getLocale();
  const game = games.manifest(id);

  return (
    <main className="play">
      <h1>{game.title}</h1>
      <GameHost gameId={id} locale={locale} />
    </main>
  );
}
