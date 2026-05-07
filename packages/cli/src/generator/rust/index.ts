import type { IrProgram } from "#ir";
import { CodeWriter } from "../code-writer";
import { generateCargoToml, generateImports } from "./cargo";
import { generateErrors, generateEvent, generateStructZC, generateAccount } from "./accounts";
import { generateProgramModule, generateAccountsStruct } from "./instructions";
import { generateIdl } from "./idl";

export type AnchorProject = {
  readonly libRs: string;
  readonly cargoToml: string;
  readonly idl: unknown;
  readonly program: IrProgram;
};

export function generateAnchorProject(program: IrProgram): AnchorProject {
  const libRs = generateLibRs(program);
  const cargoToml = generateCargoToml(program);
  const idl = generateIdl(program);
  return { libRs, cargoToml, idl, program };
}

function generateLibRs(program: IrProgram): string {
  const cw = new CodeWriter();

  cw.line("#![allow(unexpected_cfgs)]");
  cw.blank();
  cw.line(generateImports(program));
  cw.blank();
  cw.line(`declare_id!("${program.address}");`);
  cw.blank();

  if (program.errors.length > 0) {
    cw.line(generateErrors(program.errors).trim());
    cw.blank();
  }

  for (const event of program.events) {
    cw.line(generateEvent(event).trim());
    cw.blank();
  }

  for (const szc of program.structsZC) {
    cw.line(generateStructZC(szc, program.structsZC).trim());
    cw.blank();
  }

  for (const account of program.accounts) {
    cw.line(generateAccount(account, program.structsZC).trim());
    cw.blank();
  }

  cw.line(generateProgramModule(program).trim());
  cw.blank();

  for (const ix of program.instructions) {
    cw.line(generateAccountsStruct(ix, program.accounts).trim());
    cw.blank();
  }

  return cw.toString();
}
