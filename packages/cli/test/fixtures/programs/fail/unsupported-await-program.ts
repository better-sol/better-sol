import { bs, cpi } from "better-sol/program";

declare function fetchAmount(): Promise<bigint>;

const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);

export const unsupportedAwait = bs.program({
  name: "unsupported_await",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badAwait: ix({
      accounts: { counter: bs.mut(Counter), authority: bs.signer() },
      run: async ({ counter, authority }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count = await fetchAmount();
      },
    }),
}));
