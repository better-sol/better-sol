// ── Shared naming utilities ──

export function toSnake(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "_$1_$2")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/^_/, "");
}

export function toPascal(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function toCamel(value: string): string {
  return value
    .replace(/[_-](\w)/g, (_match, char: string) => char.toUpperCase())
    .replace(/^\w/, (char) => char.toLowerCase());
}
