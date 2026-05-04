import { bs, cpi } from "better-sol/program";

const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);

export const unsupportedExtraEventField = bs.program({
  name: "unsupported_extra_event_field",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  events: { Counted: { count: bs.u64(), authority: bs.pubkey() } },
  }, ix => ({
    badExtraEventField: ix({
      accounts: { counter: bs.mut(Counter), authority: bs.signer() },
      args: { amount: bs.u64() },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count += amount;
        ctx.emit("Counted", { count: counter.count, authority, extra: amount });
      },
    }),
}));
