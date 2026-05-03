import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const DefaultAmount = 10n;
const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);

export const unsupportedExternalConstant = program({
  name: "unsupported_external_constant",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badExternalConstant: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      run: ({ counter, authority }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count = DefaultAmount;
      },
    }),
}));
