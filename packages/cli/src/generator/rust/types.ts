import type { IrType } from "#ir";

export function rustType(type: IrType, zeroCopy: boolean = false): string {
  if (typeof type === "string") return primitiveRustType(type, zeroCopy);
  if (type.kind === "struct_zc_ref") return toPascal(type.name);
  switch (type.kind) {
    case "option": return `Option<${rustType(type.inner, zeroCopy)}>`;
    case "vec": return `Vec<${rustType(type.inner, zeroCopy)}>`;
    case "array": return `[${rustType(type.inner, zeroCopy)}; ${type.size}]`;
  }
}

function primitiveRustType(type: string, zeroCopy: boolean): string {
  if (type === "bool" && zeroCopy) throw new Error("Zero-copy bool fields are not supported. Use u8 for flags.");
  if (type === "pubkey") return "Pubkey";
  if (type === "string") return "String";
  if (type === "bytes") return "Vec<u8>";
  return type;
}

export function idlType(type: IrType): unknown {
  const map: Record<string, string> = {
    u8: "u8", u16: "u16", u32: "u32", u64: "u64", u128: "u128",
    i8: "i8", i16: "i16", i32: "i32", i64: "i64", i128: "i128",
    f32: "f32", f64: "f64",
    bool: "bool", pubkey: "publicKey", string: "string", bytes: "bytes",
  };
  if (typeof type === "string") return { defined: map[type] ?? type };
  if (type.kind === "struct_zc_ref") return { defined: type.name };
  switch (type.kind) {
    case "option": return { option: idlType(type.inner) };
    case "vec": return { vec: idlType(type.inner) };
    case "array": return { array: [idlType(type.inner), type.size] };
  }
}

export function formatSeedBytes(expression: string, type: IrType): string {
  if (type === "pubkey") return `${expression}.as_ref()`;
  if (isIntegerType(type)) return `${expression}.to_le_bytes().as_ref()`;
  throw new Error(`Unsupported PDA seed type '${formatSeedType(type)}'. PDA field seeds must be pubkey or integer values.`);
}

function isIntegerType(type: IrType): boolean {
  return typeof type === "string" && ["u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128"].includes(type);
}

function formatSeedType(type: IrType): string {
  if (typeof type === "string") return type;
  return type.kind;
}

export function toPascal(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function toSnake(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "_$1_$2")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/^_/, "");
}
