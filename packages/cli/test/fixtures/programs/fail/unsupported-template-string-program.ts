import { bs, cpi } from "better-sol/program";

const Profile = bs.account({ label: bs.string(), count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["profile", seed.authority]);

export const unsupportedTemplateString = bs.program({
  name: "unsupported_template_string",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badTemplateString: ix({
      accounts: { profile: bs.mut(Profile), authority: bs.signer() },
      args: { amount: bs.u64() },
      run: ({ profile, authority }, { amount }, ctx) => {
        ctx.require(authority === profile.authority, "Unauthorized");
        profile.label = `count-${amount}`;
      },
    }),
}));
