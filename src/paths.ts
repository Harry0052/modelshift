import path from "node:path";

const SAFE_PATTERN = /^\^([A-Za-z0-9 ._-]|\\-|\[0-9\]|\[A-Za-z\]|\{[0-9]{1,2}(,[0-9]{1,2})?\})+\$$/;

export function isSafePattern(pattern: string): boolean {
  return pattern.length <= 80 && SAFE_PATTERN.test(pattern);
}

export function resolveInside(rootDir: string, request: string): string {
  if (request.length === 0 || request.includes("\0")) {
    throw new Error(`path is empty or contains a null byte: ${request}`);
  }
  if (path.isAbsolute(request)) {
    throw new Error(`path must be relative to the suite: ${request}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, request);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes the suite directory: ${request}`);
  }
  return resolved;
}
