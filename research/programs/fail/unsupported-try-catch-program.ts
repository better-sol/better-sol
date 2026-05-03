import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const Vault = account({ amount: u64, authority: pubkey }).derive((seed) => ["vault", seed.authority]);

export const unsupportedTryCatch = program({
  name: "unsupported_try_catch",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badTryCatch: ix({
      accounts: { vault: p.mut(Vault), authority: p.signer() },
      args: { amount: u64 },
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
