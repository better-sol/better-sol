import { bs, cpi } from "better-sol/program";

const Vault = bs.account({ amount: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["vault", seed.authority]);

export const unsupportedTryCatch = bs.program({
  name: "unsupported_try_catch",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badTryCatch: ix({
      accounts: { vault: bs.mut(Vault), authority: bs.signer() },
      args: { amount: bs.u64() },
      run: ({ vault, authority }, { amount }, ctx) => {
        ctx.require(authority === vault.authority, "Unauthorized");
        try {
          vault.amount += amount;
        } catch {
          vault.amount = 0n;
        }
      },
    }),
}));
