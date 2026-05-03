import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const Profile = account({ label: string, count: u64, authority: pubkey }).derive((seed) => ["profile", seed.authority]);

export const unsupportedTemplateString = program({
  name: "unsupported_template_string",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badTemplateString: ix({
      accounts: { profile: p.mut(Profile), authority: p.signer() },
      args: { amount: u64 },
      run: ({ profile, authority }, { amount }, ctx) => {
        ctx.require(authority === profile.authority, "Unauthorized");
        profile.label = `count-${amount}`;
      },
    }),
}));
