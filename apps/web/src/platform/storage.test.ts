import { afterEach, describe, expect, test } from "bun:test";

import { createBrowserStorage, createMemoryStorage } from "./storage.ts";

describe("createMemoryStorage", () => {
  test("returns null for a missing key", () => {
    expect(createMemoryStorage().get("missing")).toBeNull();
  });

  test("returns what was set", () => {
    const storage = createMemoryStorage();
    storage.set("key", "value");

    expect(storage.get("key")).toBe("value");
  });

  test("starts with the initial values", () => {
    expect(createMemoryStorage({ key: "value" }).get("key")).toBe("value");
  });

  test("remove forgets the key", () => {
    const storage = createMemoryStorage({ key: "value" });
    storage.remove("key");

    expect(storage.get("key")).toBeNull();
  });

  test("instances do not share data", () => {
    const a = createMemoryStorage();
    const b = createMemoryStorage();
    a.set("key", "value");

    expect(b.get("key")).toBeNull();
  });
});

describe("createBrowserStorage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  function stubLocalStorage(value: unknown) {
    Object.defineProperty(globalThis, "localStorage", {
      value,
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  test("reads and writes through localStorage", () => {
    const data = new Map<string, string>();
    stubLocalStorage({
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
    const storage = createBrowserStorage();

    storage.set("key", "value");

    expect(data.get("key")).toBe("value");
    expect(storage.get("key")).toBe("value");

    storage.remove("key");
    expect(data.has("key")).toBe(false);
  });

  test("works without localStorage (server render)", () => {
    stubLocalStorage(undefined);
    const storage = createBrowserStorage();

    expect(storage.get("key")).toBeNull();
    expect(() => storage.set("key", "value")).not.toThrow();
    expect(() => storage.remove("key")).not.toThrow();
  });

  test("never throws when localStorage does (private mode, quota)", () => {
    stubLocalStorage({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    const storage = createBrowserStorage();

    expect(storage.get("key")).toBeNull();
    expect(() => storage.set("key", "value")).not.toThrow();
    expect(() => storage.remove("key")).not.toThrow();
  });
});
