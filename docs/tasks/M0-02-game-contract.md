# M0-02 · Контракт игры

## Цель

В `@repo/game-core` есть типы и хелперы, по которым оболочка подключает любую игру, не зная её движка.

## Что сделать

- [x] `GameManifest`: `id`, `title`, `kind: "2d" | "3d"`, `description`, `thumbnail`, `multiplayer?: { minPlayers; maxPlayers; modes: string[] }`.
- [x] `GameContext`: `user` (гость или аккаунт), `settings` (громкость, качество), `signal: AbortSignal`, `submitScore()` (пока без реализации, только сигнатура), `log` с префиксом игры.
- [x] `GameModule`: `{ manifest; mount(el, ctx): Promise<Unmount> }`.
- [x] `defineManifest()` — проверяет манифест схемой и возвращает его с сохранёнными литеральными типами: `<const M extends GameManifest>(manifest: M): M`.
- [x] `defineGame()` — принимает уже определённый манифест и `mount`, возвращает `GameModule` с обёрнутым `mount` (идемпотентный `Unmount`). Валидацию манифеста перенести из `defineGame` в `defineManifest`.
- [x] `Transport` — только интерфейс, без реализаций: `send(type, payload)`, `sendBytes(data)`, `on(type, handler)`, `onBytes(handler)`, `close()`, `state: "connecting" | "open" | "closed"`. Реализации появятся в M2.
- [x] Тест: фейковая игра через `defineGame` монтируется в фейковый элемент, а unmount вызывает cleanup ровно один раз.
- [x] Тесты на `defineManifest`: корректный манифест проходит, неверный слаг и `minPlayers > maxPlayers` бросают ошибку с понятным сообщением. Тип-тест: `id` манифеста, объявленного в отдельной переменной через `defineManifest`, имеет литеральный тип.

## Критерии приёмки

- В `game-core` нет зависимостей от React, Three.js и Colyseus.
- Повторный вызов `Unmount` безопасен (идемпотентен). Это проверено тестом.

## Подсказки

- Зачем `signal` в контексте: в dev-режиме `React.StrictMode` монтирует компонент дважды, и оболочка может вызвать unmount раньше, чем зарезолвится промис `mount`, пока игра ещё грузит ассеты. Игра должна уметь бросить загрузку по `signal.aborted` и не создавать WebGL-контекст впустую. Подумай, на чьей стороне эта логика: игры или оболочки. Я бы большую часть отдал оболочке (см. M0-05).
- `Transport` проектируй так, чтобы его можно было реализовать поверх `postMessage` в Worker'е, а не только поверх Colyseus. Никаких типов Colyseus в сигнатурах. Сам интерфейс положи в `@repo/game-protocol`: его используют и клиент, и сервер, а `game-core` видит DOM.
- `defineGame` стоит сделать generic по манифесту: `<const M extends GameManifest>(game: { manifest: M; mount: Mount }) => { manifest: M; mount: Mount }`. Тогда автор игры получает контекстные типы `el` и `ctx` в `mount`, а литеральный `id` проходит насквозь.
