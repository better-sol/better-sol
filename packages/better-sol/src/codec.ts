import { address as kitAddress, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import type { FieldSchema, InferFields, InferType, TypeKind, TypeToken } from "#program";

type HasInner = { readonly kind: string; readonly inner: TypeToken<unknown, TypeKind> };
type HasInnerAndSize = { readonly kind: string; readonly inner: TypeToken<unknown, TypeKind>; readonly size: number };
type HasInnerAndMaxEntries = { readonly kind: string; readonly inner: TypeToken<unknown, TypeKind>; readonly maxEntries: number };
type HasFields = { readonly kind: string; readonly fields: FieldSchema };

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;

function hasInner(token: { readonly kind: string }): token is HasInner {
  return "inner" in token;
}

function hasInnerAndSize(token: { readonly kind: string }): token is HasInnerAndSize {
  return "inner" in token && "size" in token;
}

function hasInnerAndMaxEntries(token: { readonly kind: string }): token is HasInnerAndMaxEntries {
  return "inner" in token && "maxEntries" in token;
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
    case "u8": return encodeU8(expectIntegerNumber(token.kind, value, 0, 0xff));
    case "u16": return encodeU16(expectIntegerNumber(token.kind, value, 0, 0xffff));
    case "u32": return encodeU32(expectIntegerNumber(token.kind, value, 0, 0xffffffff));
    case "u64": return encodeU64(expectIntegerBigInt(token.kind, value, 0n, U64_MAX));
    case "u128": return encodeU128(expectIntegerBigInt(token.kind, value, 0n, U128_MAX));
    case "i8": return encodeI8(expectIntegerNumber(token.kind, value, -0x80, 0x7f));
    case "i16": return encodeI16(expectIntegerNumber(token.kind, value, -0x8000, 0x7fff));
    case "i32": return encodeI32(expectIntegerNumber(token.kind, value, -0x80000000, 0x7fffffff));
    case "i64": return encodeI64(expectIntegerBigInt(token.kind, value, I64_MIN, I64_MAX));
    case "i128": return encodeI128(expectIntegerBigInt(token.kind, value, I128_MIN, I128_MAX));
    case "f32": return encodeF32(expectFloat32(token.kind, value));
    case "f64": return encodeF64(expectFiniteNumber(token.kind, value));
    case "bool": return encodeBool(expectBoolean(token.kind, value));
    case "pubkey": return encodePubkey(expectString(token.kind, value));
    case "string": return encodeString(expectString(token.kind, value));
    case "bytes": return encodeBytes(expectBytes(token.kind, value));
    case "option": {
      if (!hasInner(token)) throw new Error("Option token missing inner");
      return encodeOption(token.inner, value);
    }
    case "vec": {
      if (!hasInnerAndMaxEntries(token)) throw new Error("Vec token missing inner/maxEntries");
      return encodeVec(token.inner, expectArray(token.kind, value), token.maxEntries);
    }
    case "array": {
      if (!hasInnerAndSize(token)) throw new Error("Array token missing inner/size");
      return encodeArray(token.inner, expectArray(token.kind, value), token.size);
    }
    default: throw new Error(`Unsupported encoding type: ${token.kind}`);
  }
}

export function decodeField(token: TypeToken<unknown, TypeKind>, data: Uint8Array, offset: number): { value: unknown; offset: number } {
  switch (token.kind) {
    case "u8": return { value: readByte(data, offset, token.kind), offset: offset + 1 };
    case "u16": return { value: decodeU16(data, offset), offset: offset + 2 };
    case "u32": return { value: decodeU32(data, offset), offset: offset + 4 };
    case "u64": return { value: decodeU64(data, offset), offset: offset + 8 };
    case "u128": return { value: decodeU128(data, offset), offset: offset + 16 };
    case "i8": { const v = readByte(data, offset, token.kind); return { value: v > 127 ? v - 256 : v, offset: offset + 1 }; }
    case "i16": return { value: decodeI16(data, offset), offset: offset + 2 };
    case "i32": return { value: decodeI32(data, offset), offset: offset + 4 };
    case "i64": return { value: decodeI64(data, offset), offset: offset + 8 };
    case "i128": return { value: decodeI128(data, offset), offset: offset + 16 };
    case "f32": return { value: decodeF32(data, offset), offset: offset + 4 };
    case "f64": return { value: decodeF64(data, offset), offset: offset + 8 };
    case "bool": return { value: decodeBool(readByte(data, offset, token.kind)), offset: offset + 1 };
    case "pubkey": return { value: decodePubkey(data, offset), offset: offset + 32 };
    case "string": return decodeString(data, offset);
    case "bytes": return decodeBytes(data, offset);
    case "option": {
      if (!hasInner(token)) throw new Error("Option token missing inner");
      return decodeOption(token.inner, data, offset);
    }
    case "vec": {
      if (!hasInnerAndMaxEntries(token)) throw new Error("Vec token missing inner/maxEntries");
      return decodeVec(token.inner, token.maxEntries, data, offset);
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
  const values = data as Readonly<Record<string, unknown>>;
  for (const [key, token] of Object.entries(fields)) {
    if (token === undefined) continue;
    parts.push(encodeField(token, values[key]));
  }
  return concat(parts);
}

export function decodeAccount<TFields extends FieldSchema>(fields: TFields, data: Uint8Array): InferFields<TFields> {
  const result: Record<string, unknown> = {};
  let offset = 0;
  for (const [key, token] of Object.entries(fields)) {
    if (token === undefined) continue;
    const decoded = decodeField(token, data, offset);
    result[key] = decoded.value;
    offset = decoded.offset;
  }
  return result as InferFields<TFields>;
}

export function decodeZeroCopyAccount<TFields extends FieldSchema>(fields: TFields, data: Uint8Array): InferFields<TFields> {
  const result: Record<string, unknown> = {};
  let offset = 0;
  for (const [key, token] of Object.entries(fields)) {
    if (token === undefined) continue;
    const layout = zeroCopyLayout(token);
    offset += paddingFor(offset, layout.align);
    ensureAvailable(data, offset, layout.size, `zero-copy field '${key}'`);
    result[key] = decodeZeroCopyField(token, data.subarray(offset, offset + layout.size));
    offset += layout.size;
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
  for (const token of Object.values(fields)) {
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
  for (const [key, token] of Object.entries(fields)) {
    if (token === undefined) continue;
    const layout = zeroCopyLayout(token);
    offset += paddingFor(offset, layout.align);
    ensureAvailable(data, offset, layout.size, `zero-copy field '${key}'`);
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
    case "u8": return readByte(data, 0, token.kind);
    case "u16": return decodeU16(data, 0);
    case "u32": return decodeU32(data, 0);
    case "u64": return decodeU64(data, 0);
    case "u128": return decodeU128(data, 0);
    case "i8": { const v = readByte(data, 0, token.kind); return v > 127 ? v - 256 : v; }
    case "i16": return decodeI16(data, 0);
    case "i32": return decodeI32(data, 0);
    case "i64": return decodeI64(data, 0);
    case "i128": return decodeI128(data, 0);
    case "f32": return decodeF32(data, 0);
    case "f64": return decodeF64(data, 0);
    case "bool": return decodeBool(readByte(data, 0, token.kind));
    case "pubkey": return decodePubkey(data, 0);
    case "array": {
      if (!hasInnerAndSize(token)) throw new Error("Array token missing inner/size");
      const inner = zeroCopyLayout(token.inner);
      const values: unknown[] = [];
      for (let i = 0; i < token.size; i++) {
        const start = i * inner.size;
        ensureAvailable(data, start, inner.size, `zero-copy array item ${i}`);
        values.push(decodeZeroCopyField(token.inner, data.subarray(start, start + inner.size)));
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
  const values = args as Readonly<Record<string, unknown>>;
  for (const [key, token] of Object.entries(argTypes)) {
    if (token === undefined) continue;
    const value = values[key];
    if (value === undefined && token.kind !== "option") throw new Error(`Missing instruction arg '${key}'`);
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
  return new Uint8Array([value]);
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
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}

function encodeU64(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) buf[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  return buf;
}

function encodeU128(value: bigint): Uint8Array {
  const buf = new Uint8Array(16);
  for (let i = 0; i < 16; i++) buf[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  return buf;
}

function encodeI8(value: number): Uint8Array { return encodeU8(value < 0 ? value + 256 : value); }
function encodeI16(value: number): Uint8Array { return encodeU16(value < 0 ? value + 65536 : value); }
function encodeI32(value: number): Uint8Array { return encodeU32(value < 0 ? value + 4294967296 : value); }
function encodeI64(value: bigint): Uint8Array { return encodeU64(value < 0n ? value + (1n << 64n) : value); }
function encodeI128(value: bigint): Uint8Array { return encodeU128(value < 0n ? value + (1n << 128n) : value); }

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

function decodeBool(value: number): boolean {
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error(`Invalid boolean byte: ${String(value)}`);
}

function encodePubkey(value: string): Uint8Array { return new Uint8Array(getAddressEncoder().encode(kitAddress(value))); }

function decodePubkey(data: Uint8Array, offset: number): string {
  ensureAvailable(data, offset, 32, "pubkey");
  return getAddressDecoder().decode(data.subarray(offset, offset + 32));
}

function encodeString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return concat([encodeU32(encoded.length), encoded]);
}

function decodeString(data: Uint8Array, offset: number): { value: string; offset: number } {
  const len = decodeU32(data, offset);
  const start = offset + 4;
  ensureAvailable(data, start, len, "string");
  return { value: new TextDecoder().decode(data.subarray(start, start + len)), offset: start + len };
}

function encodeBytes(value: Uint8Array): Uint8Array {
  return concat([encodeU32(value.length), value]);
}

function decodeBytes(data: Uint8Array, offset: number): { value: Uint8Array; offset: number } {
  const len = decodeU32(data, offset);
  const start = offset + 4;
  ensureAvailable(data, start, len, "bytes");
  return { value: data.subarray(start, start + len), offset: start + len };
}

function encodeOption(inner: TypeToken<unknown, TypeKind>, value: unknown): Uint8Array {
  if (value === null || value === undefined) return new Uint8Array([0]);
  return concat([new Uint8Array([1]), encodeField(inner, value)]);
}

function encodeVec(inner: TypeToken<unknown, TypeKind>, values: readonly unknown[], maxEntries: number): Uint8Array {
  if (values.length > maxEntries) throw new Error(`vec exceeds max entries ${maxEntries}: ${values.length}`);
  const parts = values.map((v) => encodeField(inner, v));
  return concat([encodeU32(values.length), ...parts]);
}

function encodeArray(inner: TypeToken<unknown, TypeKind>, values: readonly unknown[], size: number): Uint8Array {
  if (values.length !== size) throw new Error(`array length must be ${size}, got ${values.length}`);
  const parts = values.map((v) => encodeField(inner, v));
  return concat(parts);
}

function decodeU16(data: Uint8Array, offset: number): number {
  ensureAvailable(data, offset, 2, "u16");
  return readByte(data, offset, "u16") | (readByte(data, offset + 1, "u16") << 8);
}

function decodeI16(data: Uint8Array, offset: number): number {
  const value = decodeU16(data, offset);
  return value > 32767 ? value - 65536 : value;
}

function decodeU32(data: Uint8Array, offset: number): number {
  ensureAvailable(data, offset, 4, "u32");
  return (readByte(data, offset, "u32") | (readByte(data, offset + 1, "u32") << 8) | (readByte(data, offset + 2, "u32") << 16) | (readByte(data, offset + 3, "u32") << 24)) >>> 0;
}

function decodeI32(data: Uint8Array, offset: number): number {
  const value = decodeU32(data, offset);
  return value > 2147483647 ? value - 4294967296 : value;
}

function decodeU64(data: Uint8Array, offset: number): bigint {
  ensureAvailable(data, offset, 8, "u64");
  let value = 0n;
  for (let i = 0; i < 8; i++) value |= BigInt(readByte(data, offset + i, "u64")) << BigInt(i * 8);
  return value;
}

function decodeU128(data: Uint8Array, offset: number): bigint {
  ensureAvailable(data, offset, 16, "u128");
  let value = 0n;
  for (let i = 0; i < 16; i++) value |= BigInt(readByte(data, offset + i, "u128")) << BigInt(i * 8);
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
  ensureAvailable(data, offset, 4, "f32");
  return new DataView(data.buffer, data.byteOffset + offset, 4).getFloat32(0, true);
}

function decodeF64(data: Uint8Array, offset: number): number {
  ensureAvailable(data, offset, 8, "f64");
  return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(0, true);
}

function decodeOption(inner: TypeToken<unknown, TypeKind>, data: Uint8Array, offset: number): { value: unknown; offset: number } {
  const tag = readByte(data, offset, "option");
  if (tag === 0) return { value: null, offset: offset + 1 };
  if (tag === 1) return decodeField(inner, data, offset + 1);
  throw new Error(`Invalid option tag: ${tag}`);
}

function decodeVec(inner: TypeToken<unknown, TypeKind>, maxEntries: number, data: Uint8Array, offset: number): { value: unknown[]; offset: number } {
  const len = decodeU32(data, offset);
  if (len > maxEntries) throw new Error(`vec exceeds max entries ${maxEntries}: ${len}`);
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

function expectIntegerNumber(kind: string, value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${kind} expects an integer number`);
  if (value < min || value > max) throw new Error(`${kind} out of range: ${value}`);
  return value;
}

function expectFloat32(kind: string, value: unknown): number {
  const numberValue = expectFiniteNumber(kind, value);
  if (!Number.isFinite(Math.fround(numberValue))) throw new Error(`${kind} out of range: ${numberValue}`);
  return numberValue;
}

function expectFiniteNumber(kind: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${kind} expects a finite number`);
  return value;
}

function expectIntegerBigInt(kind: string, value: unknown, min: bigint, max: bigint): bigint {
  if (typeof value !== "bigint") throw new Error(`${kind} expects a bigint`);
  if (value < min || value > max) throw new Error(`${kind} out of range: ${value}`);
  return value;
}

function expectBoolean(kind: string, value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error(`${kind} expects a boolean`);
  return value;
}

function expectString(kind: string, value: unknown): string {
  if (typeof value !== "string") throw new Error(`${kind} expects a string`);
  return value;
}

function expectBytes(kind: string, value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error(`${kind} expects a Uint8Array`);
  return value;
}

function expectArray(kind: string, value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${kind} expects an array`);
  return value;
}

function readByte(data: Uint8Array, offset: number, context: string): number {
  ensureAvailable(data, offset, 1, context);
  const byte = data[offset];
  if (byte === undefined) throw new Error(`${context} read failed at offset ${offset}`);
  return byte;
}

function ensureAvailable(data: Uint8Array, offset: number, length: number, context: string): void {
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`${context} invalid offset: ${offset}`);
  if (!Number.isInteger(length) || length < 0) throw new Error(`${context} invalid length: ${length}`);
  if (offset > data.length - length) {
    const available = Math.max(data.length - offset, 0);
    throw new Error(`${context} requires ${length} byte${length === 1 ? "" : "s"} at offset ${offset}, only ${available} available`);
  }
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
