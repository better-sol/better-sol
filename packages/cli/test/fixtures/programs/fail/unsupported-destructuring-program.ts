import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);

export const unsupportedDestructuring = program({
  name: "unsupported_destructuring",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badDestructuring: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      run: ({ counter, authority }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        const { count } = counter;
        counter.count = count;
      },
    }),
}));
