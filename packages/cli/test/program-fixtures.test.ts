import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedDiagnostics } from "./fixtures/expected-diagnostics";
import { generateAnchorProject } from "../src/generator/rust";
import { parseProgramsFromFile } from "../src/parser/ast";

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures/programs");
const successDir = join(fixtureRoot, "success");
const failDir = join(fixtureRoot, "fail");

function readFixture(dir: string, fileName: string): string {
  return readFileSync(join(dir, fileName), "utf8");
}

function listTypeScriptFiles(dir: string): readonly string[] {
  return readdirSync(dir).filter((fileName) => fileName.endsWith(".ts")).toSorted();
}

describe("end-to-end program fixtures", () => {
  for (const fileName of listTypeScriptFiles(successDir)) {
    test(`${fileName} generates valid Anchor project output`, () => {
      const source = readFixture(successDir, fileName);
      const programs = parseProgramsFromFile(source, fileName);
      expect(programs.length).toBeGreaterThan(0);

      for (const program of programs) {
        const project = generateAnchorProject(program);

        expect(project.libRs).toContain("#[program]");
        expect(project.libRs).toContain(`declare_id!("${program.address}")`);
        expect(project.libRs).toContain("#[derive(Accounts)]");
        expect(project.cargoToml).toContain("anchor-lang = { version = \"=1.0.2\"");
        expect(project.cargoToml).toContain(`name = "${program.name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, "")}"`);
        expect(project.idl).toMatchObject({ name: program.name, address: program.address });

        const idl = project.idl as Record<string, unknown>;
        expect(Array.isArray(idl.instructions)).toBe(true);
        expect(Array.isArray(idl.errors)).toBe(true);
        const idlIxs = idl.instructions as ReadonlyArray<Record<string, unknown>>;
        expect(idlIxs.length).toBeGreaterThan(0);
        for (const ix of idlIxs) {
          expect(ix.name).toBeDefined();
          expect(Array.isArray(ix.accounts)).toBe(true);
          expect(Array.isArray(ix.args)).toBe(true);
        }

        for (const ix of program.instructions) {
          expect(project.libRs).toContain(`pub fn ${ix.name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`);
        }
        for (const account of program.accounts) {
          expect(project.libRs).toContain(`pub struct ${account.name}`);
        }
      }
    });
  }
});

describe("unsupported program fixtures", () => {
  for (const fileName of listTypeScriptFiles(failDir)) {
    test(`${fileName} returns the expected diagnostic`, () => {
      const expected = expectedDiagnostics[fileName];
      if (expected === undefined) throw new Error(`Missing expected diagnostic for ${fileName}`);
      const source = readFixture(failDir, fileName);
      const programs = parseProgramsFromFile(source, fileName);
      expect(programs.length).toBeGreaterThan(0);
      const program = programs[0];
      if (program === undefined) throw new Error(`No program found in ${fileName}`);
      expect(() => generateAnchorProject(program)).toThrow(expected);
    });
  }
});
