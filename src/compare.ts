// Locale-independent ordering so recorded paths and listings are identical on every machine.
export function compareStrings(left: string, right: string) {
  if (left === right) {

    return 0;
  }

  return left < right ? -1 : 1;
}
