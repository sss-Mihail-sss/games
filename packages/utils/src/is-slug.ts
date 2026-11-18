const SLUG_REGEX = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isSlug(value: string) {
  return SLUG_REGEX.test(value);
}
