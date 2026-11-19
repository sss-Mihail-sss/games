# M0-05 · Оболочка web на Next.js

## Цель

Сайт на Next.js (App Router): каталог игр `/ru` и страница `/ru/play/[id]` отдаются как статический HTML с meta-тегами, а сама игра — клиентский остров, который лениво грузит модуль, монтирует его и полностью убирает при уходе со страницы.

Устройство и мотивация — в `docs/ARCHITECTURE.md`, раздел «Web: Next.js, а не Bun SPA».

## Что сделать

### 0. Спайк: Next собирает наши пакеты (сначала, до остального кода)

- [x] `apps/web` на Next.js (App Router, TypeScript, без ESLint — у нас `bun lint`), React из каталога.
- [x] `next.config.ts`: `transpilePackages` для всех используемых `@repo/*`, `output: "standalone"`.
- [x] Страница-заглушка импортирует что-нибудь из `@repo/game-core` и `@repo/game-bridge/manifest`. `next dev` и `next build` проходят: проверяем, что Next понимает TS-исходники из workspace и импорты с расширением `.ts`.
- [x] `bun run typecheck` проходит вместе с tsconfig от Next (`next-env.d.ts`, plugin `next`).

Если спайк не проходит — стоп, обсуждаем до продолжения.

### 1. `mountGame` — ядро, без React и без Next

- [x] `mountGame({ element, load, context, onError }) → cleanup`: грузит модуль, монтирует, корректно обрабатывает «cleanup пришёл раньше, чем закончился load / mount». `AbortController`, проверка `signal.aborted` после каждого `await`.
- [x] Тесты (см. критерии приёмки).

### 2. Платформа — сборка `GameContext`, без React

- [x] Гость: `{ id, name, kind: "guest" }`, `id` из `crypto.randomUUID()` в `localStorage` (обращения в `try/catch`).
- [x] Хранилище `PlatformSettings`: `current`, `subscribe → unsubscribe`, внутренний `set`, значения в `localStorage`.
- [x] `log` с префиксом игры, `submitScore`-заглушка.
- [x] Тесты: подписка/отписка, `id` гостя стабилен между вызовами.

### 3. Реестр игр

- [x] `@repo/game-<game>/manifest` — статический импорт, `@repo/game-<game>/client` — `() => import(...)`. `GameId` выводится из манифестов.
- [x] `preload(id)` — запускает `load()` заранее (для наведения на «Играть»), повторный вызов не грузит второй раз.

### 4. Страницы

- [x] Язык в URL через root params: корневой layout — `app/[locale]/layout.tsx` с `<html lang={await locale()}>` (`import { locale } from "next/root-params"`) и `generateStaticParams` → `[{ locale: "ru" }]`. Неизвестный язык → `notFound()`.
- [x] `/` → `/ru`: статический `redirects()` в `next.config.ts` (`permanent: false`). Выбор языка по cookie и `Accept-Language` — позже, в `proxy.ts`.
- [ ] `app/[locale]/page.tsx` — каталог (серверный компонент, SSG): карточки из манифестов, превью через `next/image`.
- [ ] `app/[locale]/play/[id]/page.tsx` — серверная оболочка: `generateStaticParams` из реестра, `generateMetadata` (title, description, Open Graph, `alternates.languages`), `notFound()` для неизвестного `id`. Внутри — клиентский `<GameHost>`, язык передаётся ему через props.
- [ ] `app/[locale]/not-found.tsx`, кнопка «Назад в каталог» (`next/link`).
- [ ] `app/sitemap.ts` из реестра, с URL для каждого языка.
- [ ] `<GameHost>` (`"use client"`) — тонкая обёртка над `mountGame` в `useEffect`; ошибки загрузки и монтирования попадают в `error.tsx` (через бросок из state при рендере).
- [ ] Ссылка «Играть» в каталоге вызывает `preload(id)` на `pointerenter` / `focus`.

### 5. Игра-заглушка

- [x] `games/bridge/src/client/index.ts`: canvas с WebGL-контекстом, cleanup через `WEBGL_lose_context`. M0-06 заменит её настоящей сценой.

## Критерии приёмки

- `next build` проходит. В выводе сборки `/ru` и `/ru/play/bridge` помечены как статические (SSG), `/` отдаёт редирект на `/ru`.
- `curl` страницы `/ru/play/bridge` из `next start` возвращает HTML с `<html lang="ru">`, `<title>` и `og:title` из манифеста — без выполнения JS.
- На странице каталога в Network нет чанка игры; при наведении на «Играть» он начинает грузиться, при переходе — не грузится второй раз.
- `React.StrictMode` (в App Router включён по умолчанию): в dev на странице игры один `<canvas>`.
- 20 переходов «каталог → игра → каталог» подряд: в консоли нет «Too many active WebGL contexts».
- Тесты `mountGame`: обычный mount/unmount; cleanup до завершения `load`; cleanup до завершения `mount` (игра получает aborted `signal`, cleanup вызван один раз); ошибка `load` → `onError`; ошибка `mount` после cleanup → `onError` не вызван; StrictMode-сценарий mount → cleanup → mount оставляет ровно одну живую игру.
- Lighthouse для `/ru` (Mobile, Slow 4G): LCP < 1,5 с, JS < 100 КБ gzip. Результат — в описании PR.
- `bun run typecheck`, `bun run test`, `bun lint`, `bun fmt --check` проходят.

## Подсказки

- Порядок важен: спайк → `mountGame` → платформа → реестр → страницы. `mountGame` и платформа не зависят от Next, их можно писать и тестировать параллельно со спайком.
- Граница сервер/клиент: всё, что трогает `window`, `localStorage`, `document` или игру, — только в `"use client"`-компонентах и только внутри `useEffect`. Серверные компоненты импортируют только манифесты.
- Не используй `next/dynamic` для игры: модуль игры — не React-компонент. Ленивую загрузку делает `load()` из реестра внутри `mountGame`, и Next всё равно вынесет её в отдельный чанк.
- `error.tsx` ловит только ошибки рендера. Ошибку из промиса (`load()` или `mount()`) положи в state и брось при следующем рендере.
- В deps `useEffect` у `<GameHost>` — только игра. Если туда попадёт `context`, создаваемый на каждом рендере, игра будет перемонтироваться.
- Рантайм — Bun: скрипты `web` запускают Next через `bun --bun`. Запускай `bun run dev` / `build` / `start`, а не `next …` напрямую — иначе Next стартует под Node.
