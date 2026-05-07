import {
  AccountRole,
  address as kitAddress,
  fetchAddressesForLookupTables,
  type AccountMeta,
  type AccountLookupMeta,
  type AccountSignerMeta,
  type Address,
} from "@solana/kit";
import type { KitRpc } from "./types.ts";

export type LookupTableIndex = ReadonlyMap<string, { readonly lookupTableAddress: Address; readonly addressIndex: number }>;

export async function buildLookupTableIndex(
  rpc: KitRpc,
  lookupTableAddresses: readonly Address[],
): Promise<LookupTableIndex> {
  if (lookupTableAddresses.length === 0) return new Map();

  const tables = await fetchAddressesForLookupTables([...lookupTableAddresses], rpc);
  const index = new Map<string, { readonly lookupTableAddress: Address; readonly addressIndex: number }>();

  for (const [tableAddress, addresses] of Object.entries(tables)) {
    if (addresses === undefined) continue;
    const lookupTableAddress = kitAddress(tableAddress);
    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      if (addr === undefined) continue;
      index.set(addr, { lookupTableAddress, addressIndex: i });
    }
  }

  return index;
}

export type ResolvedAccountMeta = AccountMeta | AccountSignerMeta | AccountLookupMeta;

export function resolveWithLookupTables(
  metas: readonly (AccountMeta | AccountSignerMeta)[],
  index: LookupTableIndex,
): readonly ResolvedAccountMeta[] {
  if (index.size === 0) return metas;

  return metas.map((meta) => {
    if ("signer" in meta) return meta;

    const entry = index.get(meta.address);
    if (entry === undefined) return meta;

    const role = isWritableRole(meta.role) ? AccountRole.WRITABLE : AccountRole.READONLY;

    return {
      address: meta.address,
      addressIndex: entry.addressIndex,
      lookupTableAddress: entry.lookupTableAddress,
      role,
    } satisfies AccountLookupMeta;
  });
}

function isWritableRole(role: AccountRole): boolean {
  return role === AccountRole.WRITABLE || role === AccountRole.WRITABLE_SIGNER;
}
