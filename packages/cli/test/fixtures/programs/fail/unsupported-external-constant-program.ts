import { bs, cpi } from "better-sol/program";

const DefaultAmount = 10n;
const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);

export const unsupportedExternalConstant = bs.program({
  name: "unsupported_external_constant",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badExternalConstant: ix({
      accounts: { counter: bs.mut(Counter), authority: bs.signer() },
      run: ({ counter, authority }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count = DefaultAmount;
      },
    }),
}));
