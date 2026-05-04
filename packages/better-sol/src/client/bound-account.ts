import { address as kitAddress, fetchEncodedAccount, type Address as KitAddress } from "@solana/kit";
import { accountDiscriminator, decodeAccount, decodeZeroCopyAccount } from "../coder";
import { type AccountDefinition, type FieldSchema, type InferFields } from "../program";
import type { AddressInput, DeriveInput, KitRpc, BoundAccount } from "./types";
import { seedToBytes } from "./signer";

export class BoundAccountImpl<TFields extends FieldSchema, TSeeds extends readonly string[]> implements BoundAccount<TFields, TSeeds> {
  public constructor(
    private readonly definition: AccountDefinition<TFields, boolean, TSeeds>,
    private readonly programAddress: AddressInput,
    private readonly rpc: KitRpc,
    private readonly accountName: string,
    private readonly commitment: "processed" | "confirmed" | "finalized",
  ) {}

  public async derive(values: DeriveInput<TFields, TSeeds>): Promise<KitAddress> {
    const seeds = this.definition.seedValues.map((template) => {
      if (!template.startsWith("{")) return new TextEncoder().encode(template);
      const fieldName = template.slice(1, -1);
      const token = this.definition.fields[fieldName];
      const raw = (values as Record<string, unknown>)[fieldName];
      return seedToBytes(token, raw, kitAddress);
    });
    const { getProgramDerivedAddress } = await import("@solana/kit");
    const [pda] = await getProgramDerivedAddress({ programAddress: kitAddress(this.programAddress), seeds });
    return pda;
  }

  public async fetch(address: AddressInput): Promise<InferFields<TFields> | null> {
    return await this.decodeAccount(address);
  }

  public async fetchMultiple(addresses: readonly AddressInput[]): Promise<(InferFields<TFields> | null)[]> {
    return await Promise.all(addresses.map((addr) => this.decodeAccount(addr)));
  }

  private async decodeAccount(address: AddressInput): Promise<InferFields<TFields> | null> {
    const account = await fetchEncodedAccount(this.rpc, kitAddress(address), { commitment: this.commitment });
    if (!account.exists || account.data.length === 0) return null;
    if (account.programAddress !== kitAddress(this.programAddress)) return null;
    const disc = await accountDiscriminator(this.accountName);
    if (!account.data.subarray(0, 8).every((b, i) => b === disc[i])) return null;
    const data = new Uint8Array(account.data.subarray(8));
    return this.definition.zeroCopyEnabled
      ? decodeZeroCopyAccount(this.definition.fields, data)
      : decodeAccount(this.definition.fields, data);
  }
}
