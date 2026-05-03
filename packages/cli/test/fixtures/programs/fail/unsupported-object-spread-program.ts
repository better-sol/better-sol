import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);

export const unsupportedObjectSpread = program({
  name: "unsupported_object_spread",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  events: { Counted: { count: u64, authority: pubkey } },
  }, ix => ({
    badObjectSpread: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count += amount;
        const eventPayload = { count: counter.count, authority };
        ctx.emit("Counted", { ...eventPayload });
      },
    }),
}));
