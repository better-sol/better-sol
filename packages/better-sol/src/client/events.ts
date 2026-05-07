import { anchorDiscriminator, decodeField } from "#codec";
import { type FieldSchema } from "#program";

export type ProgramErrorMap = ReadonlyArray<{
  readonly name: string;
  readonly message: string;
  readonly index: number;
}>;

export class ProgramError extends Error {
  public override readonly name = "ProgramError";
  public constructor(
    public readonly programName: string,
    public readonly errorName: string,
    public readonly errorIndex: number,
    public readonly originalMessage: string,
  ) {
    super(`${programName}.${errorName}: ${originalMessage}`);
  }
}

export function buildErrorIndex(
  errors: Readonly<Record<string, string>>,
): ProgramErrorMap {
  return Object.entries(errors).map(([name, message], index) => ({
    name,
    message,
    index,
  }));
}

export type ParsedEvent<TPayload = Record<string, unknown>> = {
  readonly name: string;
  readonly data: TPayload;
};

export async function buildEventDiscriminatorIndex(
  events: Readonly<Record<string, FieldSchema>>,
): Promise<
  Map<string, { readonly name: string; readonly fields: FieldSchema }>
> {
  const entries = Object.entries(events);
  const discriminators = await Promise.all(entries.map(([name]) => anchorDiscriminator(name)));
  const index = new Map<
    string,
    { readonly name: string; readonly fields: FieldSchema }
  >();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const disc = discriminators[i]!;
    const key = base64Encode(disc);
    index.set(key, { name: entry[0], fields: entry[1] });
  }
  return index;
}

const EVENT_LOG_PREFIX = "program:log:event:";
const EVENT_LOG_PREFIX_NO_DATA = "program:log:event";

export function extractEventLogs(logs: readonly string[]): readonly string[] {
  return logs.filter(
    (log) =>
      log.startsWith(EVENT_LOG_PREFIX) || log === EVENT_LOG_PREFIX_NO_DATA,
  );
}

export function parseEventLog(
  logLine: string,
  discriminatorIndex: Map<
    string,
    { readonly name: string; readonly fields: FieldSchema }
  >,
):
  | {
      readonly name: string;
      readonly data: Uint8Array;
      readonly fields: FieldSchema;
    }
  | undefined {
  if (!logLine.startsWith(EVENT_LOG_PREFIX)) return undefined;
  const payload = logLine.slice(EVENT_LOG_PREFIX.length);
  if (payload.length === 0) return undefined;

  const colonIndex = payload.indexOf(":");
  if (colonIndex === -1) return undefined;

  const discriminatorB64 = payload.slice(0, colonIndex);
  const dataB64 = payload.slice(colonIndex + 1);

  const entry = discriminatorIndex.get(discriminatorB64);
  if (entry === undefined) return undefined;

  const data = base64Decode(dataB64);
  return { name: entry.name, data, fields: entry.fields };
}

export function decodeEventData(
  fields: FieldSchema,
  data: Uint8Array,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let offset = 8;
  for (const [fieldName, token] of Object.entries(fields)) {
    const decoded = decodeField(token, data, offset);
    result[fieldName] = decoded.value;
    offset = decoded.offset;
  }
  return result;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64Decode(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    const code = binary.charCodeAt(i);
    bytes[i] = code;
  }
  return bytes;
}
