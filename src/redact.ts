export function redactValue(value: unknown, paths: readonly string[]): unknown {
  if (value === undefined) return value;
  const clone = structuredClone(value);
  for (const dotted of paths) {
    const parts = dotted.split(".");
    let current: unknown = clone;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (part === undefined || current === null || typeof current !== "object" || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    const leaf = parts.at(-1);
    if (leaf && current !== null && typeof current === "object" && !Array.isArray(current) && Object.prototype.hasOwnProperty.call(current, leaf)) {
      (current as Record<string, unknown>)[leaf] = "[redacted]";
    }
  }
  return clone;
}
