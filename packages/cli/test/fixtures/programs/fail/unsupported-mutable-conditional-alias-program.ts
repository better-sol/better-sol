import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const Bucket = account({ count: u64, authority: pubkey }).derive((seed) => ["bucket", seed.authority]);

export const unsupportedMutableConditionalAlias = program({
  name: "unsupported_mutable_conditional_alias",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badMutableConditionalAlias: ix({
      accounts: {
        left: p.mut(Bucket),
        right: p.mut(Bucket),
        authority: p.signer(),
      },
      args: { side: u8, amount: u64 },
      run: ({ left, right, authority }, { side, amount }, ctx) => {
        ctx.require(authority === left.authority, "Unauthorized");
        const selected = side === 0 ? left : right;
        selected.count += amount;
      },
    }),
}));
