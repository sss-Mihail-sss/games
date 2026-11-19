"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

interface GameErrorProps {
  error: unknown;
  retry: () => void;
}

/** Shown when the game fails to load or mount (see GameHost). */
export default function GameError({ error, retry }: GameErrorProps) {
  const { locale } = useParams<{ locale: string }>();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <h1>Игра не запустилась</h1>
      <p>Возможно, пропало соединение. Попробуйте ещё раз.</p>
      <button type="button" onClick={retry}>
        Попробовать снова
      </button>{" "}
      <Link href={`/${locale}`}>Назад в каталог</Link>
    </main>
  );
}
