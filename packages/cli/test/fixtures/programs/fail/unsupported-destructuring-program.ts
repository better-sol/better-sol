import { bs, cpi } from "better-sol/program";

const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);

export const unsupportedDestructuring = bs.program({
  name: "unsupported_destructuring",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badDestructuring: ix({
      accounts: { counter: bs.mut(Counter), authority: bs.signer() },
      run: ({ counter, authority }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        const { count } = counter;
        counter.count = count;
      },
    }),
}));
