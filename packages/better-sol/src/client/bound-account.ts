import { address as kitAddress, fetchEncodedAccount, getProgramDerivedAddress, type Address as KitAddress } from "@solana/kit";
import { accountDiscriminator, decodeAccount, decodeZeroCopyAccount } from "#codec";
import { type AccountDefinition, type FieldSchema, type InferFields } from "#program";
import type { AddressInput, DeriveInput, KitRpc, BoundAccount } from "./types.ts";
import { seedToBytes } from "./signer.ts";

export class BoundAccountImpl<TFields extends FieldSchema, TSeeds extends readonly string[]> implements BoundAccount<TFields, TSeeds> {
  public constructor(
    private readonly definition: AccountDefinition<TFields, boolean, TSeeds>,
    private readonly programAddress: AddressInput,
    private readonly rpc: KitRpc,
    private readonly accountName: string,
    private readonly commitment: "processed" | "confirmed" | "finalized",
  ) {}

  public async derive(values: DeriveInput<TFields, TSeeds>): Promise<KitAddress> {
    for (const template of this.definition.seedValues) {
      if (!template.startsWith("{")) continue;
      const fieldName = template.slice(1, -1);
      if (!(fieldName in (values as Record<string, unknown>))) {
        throw new Error(
          `better-sol: derive requires seed field "${fieldName}" for account "${this.accountName}"`,
        );
      }
    }

    const seeds = this.definition.seedValues.map((template) => {
      if (!template.startsWith("{")) return new TextEncoder().encode(template);
      const fieldName = template.slice(1, -1);
      const token = this.definition.fields[fieldName];
      const raw = (values as Record<string, unknown>)[fieldName];
      return seedToBytes(token, raw, kitAddress);
    });
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
    const disc = this.definition.discriminator ?? await accountDiscriminator(this.accountName);
    if (!account.data.subarray(0, 8).every((b, i) => b === disc[i])) return null;
    const data = new Uint8Array(account.data.subarray(8));
    return this.definition.zeroCopyEnabled
      ? decodeZeroCopyAccount(this.definition.fields, data)
      : decodeAccount(this.definition.fields, data);
  }
}
