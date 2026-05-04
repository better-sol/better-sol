import { bs, cpi } from "better-sol/program";

const Bucket = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["bucket", seed.authority]);

export const unsupportedMutableConditionalAlias = bs.program({
  name: "unsupported_mutable_conditional_alias",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badMutableConditionalAlias: ix({
      accounts: {
        left: bs.mut(Bucket),
        right: bs.mut(Bucket),
        authority: bs.signer(),
      },
      args: { side: bs.u8(), amount: bs.u64() },
      run: ({ left, right, authority }, { side, amount }, ctx) => {
        ctx.require(authority === left.authority, "Unauthorized");
        const selected = side === 0 ? left : right;
        selected.count += amount;
      },
    }),
}));
