import type { IrProgram } from "#ir";
import { toSnake, toPascal, idlType } from "./types";
import { isMutable } from "./instructions";

export function generateIdl(program: IrProgram): unknown {
  return {
    version: "0.1.0",
    name: program.name,
    address: program.address,
    metadata: { name: program.name, version: "0.1.0" },
    instructions: program.instructions.map((ix) => ({
      name: toSnake(ix.name),
      accounts: ix.accounts
        .filter((acc) => acc.constraint.kind !== "remaining")
        .map((acc) => ({
          name: toSnake(acc.name),
          isMut: isMutable(acc),
          isSigner: acc.constraint.kind === "signer",
        })),
      args: ix.args.map((arg) => ({
        name: toSnake(arg.name),
        type: idlType(arg.type),
      })),
    })),
    accounts: program.accounts
      .filter((a) => a.name !== "Config" && a.name !== "Event")
      .map((a) => ({
        name: toSnake(a.name),
        type: {
          kind: "struct",
          fields: a.fields.map((f) => ({
            name: toSnake(f.name),
            type: idlType(f.type),
          })),
        },
      })),
    errors: program.errors.map((e, i) => ({
      code: 6000 + i,
      name: toPascal(e.name),
      msg: e.message,
    })),
    events: program.events.map((e) => ({
      name: toPascal(e.name),
      fields: e.fields.map((f) => ({
        name: toSnake(f.name),
        type: idlType(f.type),
        index: false,
      })),
    })),
  };
}
