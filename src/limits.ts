export const MAX_INPUT_BYTES = 65_536;
export const MAX_JSON_DEPTH = 8;
export const MAX_STRING_LENGTH = 4_000;
export const MAX_CASES = 200;

export function jsonDepth(value: unknown, depth = 1): number {
  if (Array.isArray(value)) {
    let max = depth;
    for (const item of value) {
      max = Math.max(max, jsonDepth(item, depth + 1));
    }
    return max;
  }
  if (value !== null && typeof value === "object") {
    let max = depth;
    for (const item of Object.values(value as Record<string, unknown>)) {
      max = Math.max(max, jsonDepth(item, depth + 1));
    }
    return max;
  }
  return depth;
}

export function findLongString(value: unknown, limit = MAX_STRING_LENGTH): string | undefined {
  if (typeof value === "string") {
    return value.length > limit ? value.slice(0, 40) : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findLongString(item, limit);
      if (found) return found;
    }
    return undefined;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findLongString(item, limit);
      if (found) return found;
    }
  }
  return undefined;
}
