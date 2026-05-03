import {
  program, account,
  u64, pubkey, p,
} from "../../../packages/better-sol/src/program";

const State = account({ value: u64, authority: pubkey }).derive((seed) => ["state", seed.authority]);

export const unsupportedSwitch = program({
  name: "unsupported_switch",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badSwitch: ix({
      accounts: { state: p.mut(State), authority: p.signer() },
      args: { mode: u8, amount: u64 },
      run: ({ state, authority }, { mode, amount }, ctx) => {
        ctx.require(authority === state.authority, "Unauthorized");
        switch (mode) {
          case 0:
            state.value += amount;
            break;
          default:
            state.value -= amount;
        }
      },
    }),
}));
