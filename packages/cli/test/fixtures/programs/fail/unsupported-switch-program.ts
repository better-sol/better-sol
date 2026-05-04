import { bs, cpi } from "better-sol/program";

const State = bs.account({ value: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["state", seed.authority]);

export const unsupportedSwitch = bs.program({
  name: "unsupported_switch",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: { Unauthorized: "Unauthorized" },
  }, ix => ({
    badSwitch: ix({
      accounts: { state: bs.mut(State), authority: bs.signer() },
      args: { mode: bs.u8(), amount: bs.u64() },
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
