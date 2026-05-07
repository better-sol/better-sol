import { parseSync, type Program } from "oxc-parser";

export function parseModule(filename: string, source: string): Program {
  const result = parseSync(filename, source, {
    lang: "ts",
    sourceType: "module",
    astType: "ts",
    preserveParens: true,
  });

  if (result.errors.length > 0) {
    const first = result.errors[0]!;
    throw new Error(
      `Parse error in ${filename}: ${first.message} (${first.labels[0]?.start ?? 0}:${first.labels[0]?.end ?? 0})`,
    );
  }

  return result.program;
}
