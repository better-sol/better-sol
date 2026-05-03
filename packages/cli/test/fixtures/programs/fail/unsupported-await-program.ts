import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

declare function fetchAmount(): Promise<bigint>;

const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);

export const unsupportedAwait = program({
  name: "unsupported_await",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badAwait: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      run: async ({ counter, authority }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count = await fetchAmount();
      },
    }),
}));
