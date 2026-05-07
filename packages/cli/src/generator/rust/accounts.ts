import type { IrAccount, IrStructZC, IrType } from "#ir";
import { CodeWriter } from "../code-writer";
import { toPascal, toSnake, rustType } from "./types";
import { paddingFor } from "../layout";

export function generateErrors(errors: readonly { readonly name: string; readonly message: string }[]): string {
  const cw = new CodeWriter();
  cw.block(`#[error_code]\npub enum ProgramError`, () => {
    for (const error of errors) {
      cw.line(`#[msg("${error.message}")]`);
      cw.line(`${toPascal(error.name)},`);
    }
  });
  return cw.toString();
}

export function generateEvent(event: { readonly name: string; readonly fields: readonly { readonly name: string; readonly type: IrType }[] }): string {
  const cw = new CodeWriter();
  cw.line("#[event]");
  cw.block(`pub struct ${toPascal(event.name)}`, () => {
    for (const field of event.fields) {
      cw.line(`pub ${toSnake(field.name)}: ${rustType(field.type)},`);
    }
  });
  return cw.toString();
}

export function generateStructZC(szc: IrStructZC, structs: readonly IrStructZC[]): string {
  const cw = new CodeWriter();
  cw.line("#[derive(Default)]");
  cw.line("#[zero_copy]");
  cw.block(`pub struct ${toPascal(szc.name)}`, () => {
    for (const item of layoutRustFields(szc.fields, structs)) {
      cw.line(item);
    }
  });
  return cw.toString();
}

export function generateAccount(account: IrAccount, structs: readonly IrStructZC[]): string {
  const cw = new CodeWriter();
  const attr = account.zeroCopy ? "#[account(zero_copy)]" : "#[account]";
  cw.line(attr);
  cw.block(`pub struct ${toPascal(account.name)}`, () => {
    const fields = account.zeroCopy
      ? layoutRustFields(account.fields, structs)
      : account.fields.map((field) => `pub ${toSnake(field.name)}: ${rustType(field.type, false)},`);
    for (const field of fields) cw.line(field);
  });
  return cw.toString();
}

function layoutRustFields(fields: readonly { readonly name: string; readonly type: IrType }[], structs: readonly IrStructZC[]): readonly string[] {
  const lines: string[] = [];
  let offset = 0;
  let maxAlign = 1;
  let paddingIndex = 0;

  for (const field of fields) {
    const layout = typeLayout(field.type, structs, true);
    const padding = paddingFor(offset, layout.align);
    if (padding > 0) {
      lines.push(`pub _padding_${paddingIndex}: [u8; ${padding}],`);
      paddingIndex++;
      offset += padding;
    }
    lines.push(`pub ${toSnake(field.name)}: ${rustType(field.type, true)},`);
    offset += layout.size;
    maxAlign = Math.max(maxAlign, layout.align);
  }

  const tailPadding = paddingFor(offset, maxAlign);
  if (tailPadding > 0) lines.push(`pub _padding_${paddingIndex}: [u8; ${tailPadding}],`);
  return lines;
}

function typeLayout(type: IrType, structs: readonly IrStructZC[], zeroCopy: boolean): { readonly size: number; readonly align: number } {
  if (typeof type === "string") return primitiveLayout(type, zeroCopy);
  if (type.kind === "array") {
    const inner = typeLayout(type.inner, structs, zeroCopy);
    return { size: inner.size * type.size, align: inner.align };
  }
  if (type.kind === "struct_zc_ref") {
    const struct = structs.find((candidate) => candidate.name === type.name);
    if (struct === undefined) throw new Error(`Unknown zero-copy struct '${type.name}'`);
    return structLayout(struct.fields, structs);
  }
  throw new Error(`Unsupported zero-copy type '${type.kind}'`);
}

function structLayout(fields: readonly { readonly type: IrType }[], structs: readonly IrStructZC[]): { readonly size: number; readonly align: number } {
  let offset = 0;
  let maxAlign = 1;
  for (const field of fields) {
    const layout = typeLayout(field.type, structs, true);
    offset += paddingFor(offset, layout.align) + layout.size;
    maxAlign = Math.max(maxAlign, layout.align);
  }
  return { size: offset + paddingFor(offset, maxAlign), align: maxAlign };
}

function primitiveLayout(type: string, zeroCopy: boolean): { readonly size: number; readonly align: number } {
  if (type === "bool" && zeroCopy) throw new Error("Zero-copy bool fields are not supported. Use u8 for flags.");
  switch (type) {
    case "u8": case "i8": case "bool": return { size: 1, align: 1 };
    case "u16": case "i16": return { size: 2, align: 2 };
    case "u32": case "i32": case "f32": return { size: 4, align: 4 };
    case "u64": case "i64": case "f64": return { size: 8, align: 8 };
    case "u128": case "i128": return { size: 16, align: 16 };
    case "pubkey": return { size: 32, align: 1 };
    default: throw new Error(`Unsupported zero-copy primitive '${type}'`);
  }
}
