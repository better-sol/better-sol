import { bs, cpi } from "better-sol/program";

const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);

export const unsupportedObjectSpread = bs.program({
  name: "unsupported_object_spread",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  events: { Counted: { count: bs.u64(), authority: bs.pubkey() } },
  }, ix => ({
    badObjectSpread: ix({
      accounts: { counter: bs.mut(Counter), authority: bs.signer() },
      args: { amount: bs.u64() },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count += amount;
        const eventPayload = { count: counter.count, authority };
        ctx.emit("Counted", { ...eventPayload });
      },
    }),
}));
