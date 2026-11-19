import type { User } from "@repo/game-core";
import * as z from "zod";

import type { KeyValueStorage } from "./type.ts";

const GUEST_ID_KEY = "games:guest-id";
const guestId = z.uuid();

/**
 * Текущий игрок. Пока аккаунтов нет, это всегда гость.
 *
 * ВРЕМЕННО (M0): id генерирует клиент, поэтому сервер не должен ему доверять.
 * В M2/M5 id будет выдавать сервер через анонимную сессию Better Auth.
 */
export function getCurrentUser(storage: KeyValueStorage): User {
  let id = storage.get(GUEST_ID_KEY);

  // localStorage — граница доверия: там может лежать что угодно.
  if (!guestId.safeParse(id).success) {
    id = crypto.randomUUID();
    storage.set(GUEST_ID_KEY, id);
  }

  return { id: id!, name: "Гость", kind: "guest" };
}
