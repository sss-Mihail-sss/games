import Image from "next/image";

import { games } from "../../games/index.ts";
import { getLocale } from "../../locale/index.ts";
import { playPath } from "../../site/index.ts";
import { PlayLink } from "./play-link.tsx";

export default async function CatalogPage() {
  const locale = await getLocale();

  return (
    <main>
      <h1>Игры</h1>
      <ul className="catalog">
        {games.manifests.map((game, index) => (
          <li key={game.id} className="card">
            <Image
              src={game.thumbnail}
              alt=""
              width={320}
              height={180}
              // The first card is the LCP candidate: load it eagerly.
              preload={index === 0}
            />
            <h2>{game.title}</h2>
            {game.description && <p>{game.description}</p>}
            <PlayLink gameId={game.id} href={playPath(locale, game.id)}>
              Играть
            </PlayLink>
          </li>
        ))}
      </ul>
    </main>
  );
}
