import { bs, cpi } from "better-sol/program";

const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);

export const unsupportedNestedFunction = bs.program({
  name: "unsupported_nested_function",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badNestedFunction: ix({
      accounts: { counter: bs.mut(Counter), authority: bs.signer() },
      args: { amount: bs.u64() },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        const doubleAmount = () => amount + amount;
        counter.count += doubleAmount();
      },
    }),
}));
