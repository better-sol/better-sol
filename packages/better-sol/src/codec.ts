import { address as kitAddress, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import type { FieldSchema, InferFields, InferType, TypeKind, TypeToken } from "#program";

type HasInner = { readonly kind: string; readonly inner: TypeToken<unknown, TypeKind> };
type HasInnerAndSize = { readonly kind: string; readonly inner: TypeToken<unknown, TypeKind>; readonly size: number };
type HasFields = { readonly kind: string; readonly fields: FieldSchema };

function hasInner(token: { readonly kind: string }): token is HasInner {
  return "inner" in token;
}

function hasInnerAndSize(token: { readonly kind: string }): token is HasInnerAndSize {
  return "inner" in token && "size" in token;
}

function hasFields(token: { readonly kind: string }): token is HasFields {
  return "fields" in token;
}

export async function anchorDiscriminator(name: string): Promise<Uint8Array> {
  return await discriminator(`global:${name}`);
}

export async function accountDiscriminator(name: string): Promise<Uint8Array> {
  return await discriminator(`account:${toPascal(name)}`);
}

const discriminatorCache = new Map<string, Uint8Array>();

async function discriminator(preimage: string): Promise<Uint8Array> {
  const cached = discriminatorCache.get(preimage);
  if (cached !== undefined) return cached;
  const encoded = new TextEncoder().encode(preimage);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const result = new Uint8Array(hash).subarray(0, 8);
  discriminatorCache.set(preimage, result);
  return result;
}

export function encodeField(token: TypeToken<unknown, TypeKind>, value: unknown): Uint8Array {
  switch (token.kind) {
    case "u8": return encodeU8(value as number);
    case "u16": return encodeU16(value as number);
    case "u32": return encodeU32(value as number);
    case "u64": return encodeU64(value as bigint);
    case "u128": return encodeU128(value as bigint);
    case "i8": return encodeI8(value as number);
    case "i16": return encodeI16(value as number);
    case "i32": return encodeI32(value as number);
    case "i64": return encodeI64(value as bigint);
    case "i128": return encodeI128(value as bigint);
    case "f32": return encodeF32(value as number);
    case "f64": return encodeF64(value as number);
    case "bool": return encodeBool(value as boolean);
    case "pubkey": return encodePubkey(value as string);
    case "string": return encodeString(value as string);
    case "bytes": return encodeBytes(value as Uint8Array);
    case "option": {
      if (!hasInner(token)) throw new Error("Option token missing inner");
      return encodeOption(token.inner, value);
    }
    case "vec": {
      if (!hasInner(token)) throw new Error("Vec token missing inner");
      return encodeVec(token.inner, value as unknown[]);
    }
    case "array": {
      if (!hasInnerAndSize(token)) throw new Error("Array token missing inner/size");
      return encodeArray(token.inner, value as unknown[]);
    }
    default: throw new Error(`Unsupported encoding type: ${token.kind}`);
  }
}

export function decodeField(token: TypeToken<unknown, TypeKind>, data: Uint8Array, offset: number): { value: unknown; offset: number } {
  switch (token.kind) {
    case "u8": return { value: data[offset]!, offset: offset + 1 };
    case "u16": return { value: data[offset]! | (data[offset + 1]! << 8), offset: offset + 2 };
    case "u32": return { value: decodeU32(data, offset), offset: offset + 4 };
    case "u64": return { value: decodeU64(data, offset), offset: offset + 8 };
    case "u128": return { value: decodeU128(data, offset), offset: offset + 16 };
    case "i8": return { value: data[offset]! > 127 ? data[offset]! - 256 : data[offset]!, offset: offset + 1 };
    case "i16": { const v = data[offset]! | (data[offset + 1]! << 8); return { value: v > 32767 ? v - 65536 : v, offset: offset + 2 }; }
    case "i32": { const v = decodeU32(data, offset); return { value: v > 2147483647 ? v - 4294967296 : v, offset: offset + 4 }; }
    case "i64": return { value: decodeI64(data, offset), offset: offset + 8 };
    case "i128": return { value: decodeI128(data, offset), offset: offset + 16 };
    case "f32": return { value: decodeF32(data, offset), offset: offset + 4 };
    case "f64": return { value: decodeF64(data, offset), offset: offset + 8 };
    case "bool": return { value: decodeBool(data[offset]), offset: offset + 1 };
    case "pubkey": return { value: getAddressDecoder().decode(data.subarray(offset, offset + 32)), offset: offset + 32 };
    case "string": { const len = decodeU32(data, offset); const str = new TextDecoder().decode(data.subarray(offset + 4, offset + 4 + len)); return { value: str, offset: offset + 4 + len }; }
    case "bytes": { const len = decodeU32(data, offset); return { value: data.subarray(offset + 4, offset + 4 + len), offset: offset + 4 + len }; }
    case "option": {
      if (!hasInner(token)) throw new Error("Option token missing inner");
      return decodeOption(token.inner, data, offset);
    }
    case "vec": {
      if (!hasInner(token)) throw new Error("Vec token missing inner");
      return decodeVec(token.inner, data, offset);
    }
    case "array": {
      if (!hasInnerAndSize(token)) throw new Error("Array token missing inner/size");
      return decodeArray(token.inner, token.size, data, offset);
    }
    default: throw new Error(`Unsupported decoding type: ${token.kind}`);
  }
}

export function encodeAccount<TFields extends FieldSchema>(fields: TFields, data: InferFields<TFields>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const key of Object.keys(fields)) {
    const token = fields[key as keyof TFields];
    if (token === undefined) continue;
    const value = data[key as keyof InferFields<TFields>];
    parts.push(encodeField(token, value));
  }
  return concat(parts);
}

export function decodeAccount<TFields extends FieldSchema>(fields: TFields, data: Uint8Array): InferFields<TFields> {
  const result = {} as Record<string, unknown>;
  let offset = 0;
  for (const key of Object.keys(fields)) {
    const token = fields[key as keyof TFields];
    if (token === undefined) continue;
    const decoded = decodeField(token, data, offset);
    result[key] = decoded.value;
    offset = decoded.offset;
  }
  return result as InferFields<TFields>;
}

export function decodeZeroCopyAccount<TFields extends FieldSchema>(fields: TFields, data: Uint8Array): InferFields<TFields> {
  const result = {} as Record<string, unknown>;
  let offset = 0;
  let maxAlign = 1;
  for (const key of Object.keys(fields)) {
    const token = fields[key as keyof TFields];
    if (token === undefined) continue;
    const layout = zeroCopyLayout(token);
    const padding = (layout.align - (offset % layout.align)) % layout.align;
    offset += padding;
    const view = data.subarray(offset, offset + layout.size);
    result[key] = decodeZeroCopyField(token, view);
    offset += layout.size;
    if (layout.align > maxAlign) maxAlign = layout.align;
  }
  return result as InferFields<TFields>;
}

function zeroCopyLayout(token: TypeToken<unknown, TypeKind>): { readonly size: number; readonly align: number } {
  switch (token.kind) {
    case "u8": case "i8": case "bool": return { size: 1, align: 1 };
    case "u16": case "i16": return { size: 2, align: 2 };
    case "u32": case "i32": case "f32": return { size: 4, align: 4 };
    case "u64": case "i64": case "f64": return { size: 8, align: 8 };
    case "u128": case "i128": return { size: 16, align: 16 };
    case "pubkey": return { size: 32, align: 1 };
    case "array": {
      if (!hasInnerAndSize(token)) throw new Error("Array token missing inner/size");
      const inner = zeroCopyLayout(token.inner);
      return { size: inner.size * token.size, align: inner.align };
    }
    case "struct_zc_ref": {
      if (!hasFields(token)) throw new Error("Zero-copy struct token missing fields");
      return zeroCopyStructLayout(token.fields);
    }
    default: throw new Error(`Zero-copy decoding not supported for type: ${token.kind}`);
  }
}

function zeroCopyStructLayout(fields: FieldSchema): { readonly size: number; readonly align: number } {
  let offset = 0;
  let maxAlign = 1;
  for (const key of Object.keys(fields)) {
    const token = fields[key];
    if (token === undefined) continue;
    const layout = zeroCopyLayout(token);
    offset += paddingFor(offset, layout.align) + layout.size;
    if (layout.align > maxAlign) maxAlign = layout.align;
  }
  return { size: offset + paddingFor(offset, maxAlign), align: maxAlign };
}

function decodeZeroCopyStruct(fields: FieldSchema, data: Uint8Array): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let offset = 0;
  for (const key of Object.keys(fields)) {
    const token = fields[key];
    if (token === undefined) continue;
    const layout = zeroCopyLayout(token);
    offset += paddingFor(offset, layout.align);
    result[key] = decodeZeroCopyField(token, data.subarray(offset, offset + layout.size));
    offset += layout.size;
  }
  return result;
}

function paddingFor(offset: number, align: number): number {
  const remainder = offset % align;
  return remainder === 0 ? 0 : align - remainder;
}

function decodeZeroCopyField(token: TypeToken<unknown, TypeKind>, data: Uint8Array): unknown {
  switch (token.kind) {
    case "u8": return data[0]!;
    case "u16": return data[0]! | (data[1]! << 8);
    case "u32": return decodeU32(data, 0);
    case "u64": return decodeU64(data, 0);
    case "u128": return decodeU128(data, 0);
    case "i8": return data[0]! > 127 ? data[0]! - 256 : data[0]!;
    case "i16": { const v = data[0]! | (data[1]! << 8); return v > 32767 ? v - 65536 : v; }
    case "i32": { const v = decodeU32(data, 0); return v > 2147483647 ? v - 4294967296 : v; }
    case "i64": return decodeI64(data, 0);
    case "i128": return decodeI128(data, 0);
    case "f32": return decodeF32(data, 0);
    case "f64": return decodeF64(data, 0);
    case "bool": return data[0]! !== 0;
    case "pubkey": return getAddressDecoder().decode(data);
    case "array": {
      if (!hasInnerAndSize(token)) throw new Error("Array token missing inner/size");
      const inner = zeroCopyLayout(token.inner);
      const values: unknown[] = [];
      for (let i = 0; i < token.size; i++) {
        values.push(decodeZeroCopyField(token.inner, data.subarray(i * inner.size, (i + 1) * inner.size)));
      }
      return values;
    }
    case "struct_zc_ref": {
      if (!hasFields(token)) throw new Error("Zero-copy struct token missing fields");
      return decodeZeroCopyStruct(token.fields, data);
    }
    default: throw new Error(`Zero-copy field decoding not supported for: ${token.kind}`);
  }
}

export async function encodeInstruction<TArgs extends Record<string, TypeToken<unknown, TypeKind>>>(ixName: string, argTypes: TArgs, args: { [K in keyof TArgs]: InferType<TArgs[K]> }): Promise<Uint8Array> {
  const disc = await anchorDiscriminator(ixName);
  const parts: Uint8Array[] = [disc];
  for (const key of Object.keys(argTypes)) {
    const token = argTypes[key as keyof TArgs];
    if (token === undefined) continue;
    const value = args[key as keyof typeof args];
    if (value === undefined) throw new Error(`Missing instruction arg '${key}'`);
    parts.push(encodeField(token, value));
  }
  return concat(parts);
}

function toPascal(name: string): string {
  return name
    .split(/[_\s-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function encodeU8(value: number): Uint8Array {
  const buf = new Uint8Array(1);
  buf[0] = value & 0xff;
  return buf;
}

function encodeU16(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = value & 0xff;
  buf[1] = (value >> 8) & 0xff;
  return buf;
}

function encodeU32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >> 8) & 0xff;
  buf[2] = (value >> 16) & 0xff;
  buf[3] = (value >> 24) & 0xff;
  return buf;
}

function encodeU64(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const pos = value < 0n ? value + (1n << 64n) : value;
  for (let i = 0; i < 8; i++) buf[i] = Number((pos >> BigInt(i * 8)) & 0xffn);
  return buf;
}

function encodeU128(value: bigint): Uint8Array {
  const buf = new Uint8Array(16);
  const pos = value < 0n ? value + (1n << 128n) : value;
  for (let i = 0; i < 16; i++) buf[i] = Number((pos >> BigInt(i * 8)) & 0xffn);
  return buf;
}

function encodeI8(value: number): Uint8Array { return encodeU8(value < 0 ? value + 256 : value); }
function encodeI16(value: number): Uint8Array { return encodeU16(value < 0 ? value + 65536 : value); }
function encodeI32(value: number): Uint8Array { return encodeU32(value < 0 ? value + 4294967296 : value); }
function encodeI64(value: bigint): Uint8Array { return encodeU64(value); }
function encodeI128(value: bigint): Uint8Array { return encodeU128(value); }

function encodeF32(value: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  return new Uint8Array(buf);
}

function encodeF64(value: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, true);
  return new Uint8Array(buf);
}

function encodeBool(value: boolean): Uint8Array { return new Uint8Array([value ? 1 : 0]); }

function decodeBool(value: number | undefined): boolean {
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error(`Invalid boolean byte: ${String(value)}`);
}

function encodePubkey(value: string): Uint8Array { return new Uint8Array(getAddressEncoder().encode(kitAddress(value))); }

function encodeString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return concat([encodeU32(encoded.length), encoded]);
}

function encodeBytes(value: Uint8Array): Uint8Array {
  return concat([encodeU32(value.length), value]);
}

function encodeOption(inner: TypeToken<unknown, TypeKind>, value: unknown): Uint8Array {
  if (value === null || value === undefined) return new Uint8Array([0]);
  return concat([new Uint8Array([1]), encodeField(inner, value)]);
}

function encodeVec(inner: TypeToken<unknown, TypeKind>, values: readonly unknown[]): Uint8Array {
  const parts = values.map((v) => encodeField(inner, v));
  return concat([encodeU32(values.length), ...parts]);
}

function encodeArray(inner: TypeToken<unknown, TypeKind>, values: readonly unknown[]): Uint8Array {
  const parts = values.map((v) => encodeField(inner, v));
  return concat(parts);
}

function decodeU32(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24);
}

function decodeU64(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) value |= BigInt(data[offset + i]!) << BigInt(i * 8);
  return value;
}

function decodeU128(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 16; i++) value |= BigInt(data[offset + i]!) << BigInt(i * 8);
  return value;
}

function decodeI64(data: Uint8Array, offset: number): bigint {
  const raw = decodeU64(data, offset);
  return raw >= (1n << 63n) ? raw - (1n << 64n) : raw;
}

function decodeI128(data: Uint8Array, offset: number): bigint {
  const raw = decodeU128(data, offset);
  return raw >= (1n << 127n) ? raw - (1n << 128n) : raw;
}

function decodeF32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getFloat32(0, true);
}

function decodeF64(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(0, true);
}

function decodeOption(inner: TypeToken<unknown, TypeKind>, data: Uint8Array, offset: number): { value: unknown; offset: number } {
  const isSome = (data[offset] as number) === 1;
  if (!isSome) return { value: null, offset: offset + 1 };
  return decodeField(inner, data, offset + 1);
}

function decodeVec(inner: TypeToken<unknown, TypeKind>, data: Uint8Array, offset: number): { value: unknown[]; offset: number } {
  const len = decodeU32(data, offset);
  offset += 4;
  const values: unknown[] = [];
  for (let i = 0; i < len; i++) {
    const decoded = decodeField(inner, data, offset);
    values.push(decoded.value);
    offset = decoded.offset;
  }
  return { value: values, offset };
}

function decodeArray(inner: TypeToken<unknown, TypeKind>, size: number, data: Uint8Array, offset: number): { value: unknown[]; offset: number } {
  const values: unknown[] = [];
  for (let i = 0; i < size; i++) {
    const decoded = decodeField(inner, data, offset);
    values.push(decoded.value);
    offset = decoded.offset;
  }
  return { value: values, offset };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
