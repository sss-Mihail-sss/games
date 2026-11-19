import { describe, expect, test } from "bun:test";

import { defaultLocale, isLocale, localeParams, locales } from "./locale.ts";

describe("locale", () => {
  test("the default locale is the first published one", () => {
    expect(defaultLocale).toBe(locales[0]);
    expect(defaultLocale).toBe("ru");
  });

  test.each(locales)("%p is a locale", (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  test.each(["", "RU", "ru-RU", "xx", undefined, null, 1])(
    "%p is not a locale",
    (value) => {
      expect(isLocale(value)).toBe(false);
    },
  );

  test("static params cover every locale", () => {
    expect(localeParams()).toEqual(locales.map((locale) => ({ locale })));
  });
});
