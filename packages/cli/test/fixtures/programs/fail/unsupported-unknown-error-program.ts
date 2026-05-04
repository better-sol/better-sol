import { bs, cpi } from "better-sol/program";

const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);

export const unsupportedUnknownError = bs.program({
  name: "unsupported_unknown_error",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badUnknownError: ix({
      accounts: { counter: bs.mut(Counter), authority: bs.signer() },
      args: { amount: bs.u64() },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "MissingError");
        counter.count += amount;
      },
    }),
}));
