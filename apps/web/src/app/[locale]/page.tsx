import Image from "next/image";

import { games } from "../../games/index.ts";
import { getLocale } from "../../locale/index.ts";
import { playPath } from "../../site/index.ts";
import { PlayLink } from "./play-link.tsx";

export default async function CatalogPage() {
  const locale = await getLocale();

  return (
    <main>
      <h1 className="mb-6 text-3xl font-bold">Игры</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
        {games.manifests.map((game, index) => (
          <li key={game.id}>
            <Image
              src={game.thumbnail}
              alt=""
              className="h-auto w-full rounded-lg"
              width={320}
              height={180}
              // The first card is the LCP element: fetch it right away and ahead of
              // the scripts. No `preload`: the <img> is in the HTML from the start,
              // and a preload link alone is fetched at low priority.
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
            />
            <h2 className="mt-3 text-xl font-semibold">{game.title}</h2>
            {game.description && (
              <p className="mt-1 opacity-80">{game.description}</p>
            )}
            <PlayLink
              gameId={game.id}
              href={playPath(locale, game.id)}
              className="mt-2 inline-block underline underline-offset-4"
            >
              Играть
            </PlayLink>
          </li>
        ))}
      </ul>
    </main>
  );
}
