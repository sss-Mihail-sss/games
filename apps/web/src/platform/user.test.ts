import { describe, expect, test } from "bun:test";

import { createMemoryStorage } from "./storage.ts";
import { getCurrentUser } from "./user.ts";

const GUEST_ID_KEY = "games:guest-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("getCurrentUser", () => {
  test("is a guest until accounts exist", () => {
    const user = getCurrentUser(createMemoryStorage());

    expect(user.kind).toBe("guest");
    expect(user.name).toBe("Гость");
  });

  test("creates a UUID id and stores it", () => {
    const storage = createMemoryStorage();
    const user = getCurrentUser(storage);

    expect(user.id).toMatch(UUID);
    expect(storage.get(GUEST_ID_KEY)).toBe(user.id);
  });

  test("returns the same id on every call", () => {
    const storage = createMemoryStorage();

    expect(getCurrentUser(storage).id).toBe(getCurrentUser(storage).id);
  });

  test("keeps an id that is already stored", () => {
    const stored = "5b1f1c2e-8f2a-4c8e-9d2b-3a4e5f6a7b8c";

    expect(
      getCurrentUser(createMemoryStorage({ [GUEST_ID_KEY]: stored })).id,
    ).toBe(stored);
  });

  test.each(["", "not-a-uuid", "123", '{"id":1}'])(
    "replaces a stored garbage id %p with a fresh one",
    (garbage) => {
      const storage = createMemoryStorage({ [GUEST_ID_KEY]: garbage });
      const user = getCurrentUser(storage);

      expect(user.id).toMatch(UUID);
      expect(storage.get(GUEST_ID_KEY)).toBe(user.id);
    },
  );

  test("different storages get different guests", () => {
    expect(getCurrentUser(createMemoryStorage()).id).not.toBe(
      getCurrentUser(createMemoryStorage()).id,
    );
  });
});
