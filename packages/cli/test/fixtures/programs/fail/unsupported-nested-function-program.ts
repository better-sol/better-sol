import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);

export const unsupportedNestedFunction = program({
  name: "unsupported_nested_function",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badNestedFunction: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        const doubleAmount = () => amount + amount;
        counter.count += doubleAmount();
      },
    }),
}));
