# M0-02 · Контракт игры

## Цель

В `@repo/game-core` есть типы и хелперы, по которым оболочка подключает любую игру, не зная её движка.

## Что сделать

- [ ] `GameManifest`: `id`, `title`, `kind: "2d" | "3d"`, `description`, `thumbnail`, `multiplayer?: { minPlayers; maxPlayers; modes: string[] }`.
- [ ] `GameContext`: `user` (гость или аккаунт), `settings` (громкость, качество), `signal: AbortSignal`, `submitScore()` (пока без реализации, только сигнатура), `log` с префиксом игры.
- [ ] `GameModule`: `{ manifest; mount(el, ctx): Promise<Unmount> }`.
- [ ] `defineGame()` — хелпер, который проверяет манифест на этапе типов (и, если хочешь, в рантайме) и возвращает `GameModule`.
- [ ] `Transport` — только интерфейс, без реализаций: `send(type, payload)`, `sendBytes(data)`, `on(type, handler)`, `onBytes(handler)`, `close()`, `state: "connecting" | "open" | "closed"`. Реализации появятся в M2.
- [ ] Тест: фейковая игра через `defineGame` монтируется в фейковый элемент, а unmount вызывает cleanup ровно один раз.

## Критерии приёмки

- В `game-core` нет зависимостей от React, Three.js и Colyseus.
- Повторный вызов `Unmount` безопасен (идемпотентен). Это проверено тестом.

## Подсказки

- Зачем `signal` в контексте: в dev-режиме `React.StrictMode` монтирует компонент дважды, и оболочка может вызвать unmount раньше, чем зарезолвится промис `mount`, пока игра ещё грузит ассеты. Игра должна уметь бросить загрузку по `signal.aborted` и не создавать WebGL-контекст впустую. Подумай, на чьей стороне эта логика: игры или оболочки. Я бы большую часть отдал оболочке (см. M0-05).
- `Transport` проектируй так, чтобы его можно было реализовать поверх `postMessage` в Worker'е, а не только поверх Colyseus. Никаких типов Colyseus в сигнатурах.
