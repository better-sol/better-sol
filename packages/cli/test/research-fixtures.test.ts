import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAnchorProject } from "../src/generator/rust";
import { parseProgramsFromFile } from "../src/parser/ast";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const successDir = join(repoRoot, "research/programs/success");
const failDir = join(repoRoot, "research/programs/fail");

const expectedDiagnostics: Readonly<Record<string, string>> = {
  "unsupported-await-program.ts": "await expressions",
  "unsupported-destructuring-program.ts": "destructuring variable declarations",
  "unsupported-external-constant-program.ts": "identifier 'DefaultAmount'",
  "unsupported-extra-event-field-program.ts": "unknown field 'extra'",
  "unsupported-for-of-program.ts": "for...of/for...in loops",
  "unsupported-math-call-program.ts": "function call 'Math.max'",
  "unsupported-missing-event-field-program.ts": "without required field 'authority'",
  "unsupported-mutable-conditional-alias-program.ts": "mutable conditional alias 'selected'",
  "unsupported-nested-function-program.ts": "nested functions",
  "unsupported-object-spread-program.ts": "object spread",
  "unsupported-return-program.ts": "return statements",
  "unsupported-switch-program.ts": "switch statements",
  "unsupported-template-string-program.ts": "template string expressions",
  "unsupported-try-catch-program.ts": "try/catch/finally",
  "unsupported-unknown-error-program.ts": "unknown error 'MissingError'",
  "unsupported-unknown-event-program.ts": "unknown event 'MissingEvent'",
  "unsupported-unknown-field-program.ts": "unknown field 'missingField'",
  "unsupported-while-loop-program.ts": "while/do loops",
};

function readFixture(dir: string, fileName: string): string {
  return readFileSync(join(dir, fileName), "utf8");
}

function listTypeScriptFiles(dir: string): readonly string[] {
  return readdirSync(dir).filter((fileName) => fileName.endsWith(".ts")).toSorted();
}

describe("research success fixtures", () => {
  for (const fileName of listTypeScriptFiles(successDir)) {
    test(`${fileName} generates Anchor project output`, () => {
      const source = readFixture(successDir, fileName);
      const programs = parseProgramsFromFile(source, fileName);
      expect(programs.length).toBeGreaterThan(0);
      for (const program of programs) {
        const project = generateAnchorProject(program);
        expect(project.libRs).toContain("#[program]");
        expect(project.cargoToml).toContain("anchor-lang");
        expect(JSON.stringify(project.idl)).toContain(program.name);
      }
    });
  }
});

describe("research failure fixtures", () => {
  for (const fileName of listTypeScriptFiles(failDir)) {
    test(`${fileName} returns the expected diagnostic`, () => {
      const expected = expectedDiagnostics[fileName];
      if (expected === undefined) throw new Error(`Missing expected diagnostic for ${fileName}`);
      const source = readFixture(failDir, fileName);
      const program = parseProgramsFromFile(source, fileName)[0];
      if (program === undefined) throw new Error(`No program found in ${fileName}`);
      expect(() => generateAnchorProject(program)).toThrow(expected);
    });
  }
});
