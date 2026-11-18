# games.secrii.dev

Сайт с браузерными 2D- и 3D-играми, включая соревновательный мультиплеер в реальном времени.

- Архитектура и принятые решения: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Задачи и процесс работы: [docs/tasks/](docs/tasks/README.md)

## Требования

- [Bun](https://bun.com) 1.4+

## Команды

```bash
bun install          # установить зависимости всех пакетов
bun run typecheck    # проверка типов всех проектов (по references в tsconfig.json)
bun run test         # тесты (bun test)
bun run dev:web      # оболочка сайта
bun run dev:api      # API
bun run dev:game     # игровой сервер (Colyseus)
```

## Структура

```
apps/       приложения: web, api, game-server
packages/   общая платформа: ui, game-core, contracts, db, auth, …
games/      игры, по одному пакету на игру
docs/       архитектура и задачи
```

## Имена пакетов

Внутренние пакеты используют scope `@repo`:

- библиотеки — `@repo/<name>`, например `@repo/ui`, `@repo/game-core`;
- игры — `@repo/game-<game>`, например `@repo/game-bridge`;
- приложения — без scope: `web`, `api`, `game-server`.

Все пакеты приватные (`"private": true`), подключаются через `"workspace:*"` и не публикуются в npm. Подробнее — в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
