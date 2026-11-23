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
      <h1 className="mb-2 text-2xl font-bold">Игра не запустилась</h1>
      <p className="mb-4">Возможно, пропало соединение. Попробуйте ещё раз.</p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={retry}
          className="rounded-md border px-3 py-1.5"
        >
          Попробовать снова
        </button>
        <Link href={`/${locale}`} className="underline underline-offset-4">
          Назад в каталог
        </Link>
      </div>
    </main>
  );
}
