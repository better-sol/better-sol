import { intro, log, outro, spinner } from "@clack/prompts";
import { join } from "node:path";
import { loadConfig, parseCluster } from "../config";
import { ensureDirectory } from "../path";
import type { DeployOptions } from "../types";
import { discoverPrograms } from "../parser/discover";
import { compileProgram } from "../api/client";
import { generateAnchorProject } from "../generator/rust";

export async function deploy(options: DeployOptions): Promise<void> {
  intro("better-sol deploy");

  const config = await loadConfig();
  const cluster = parseCluster(options.cluster, config.cluster);
  const src = options.src ?? config.programs;
  const programFilter = options.program;
  const out = options.output ?? config.out;
  const outDir = out.startsWith("/") ? out : join(process.cwd(), out);
  const compilerUrl = options.compilerUrl ?? process.env.BETTER_SOL_COMPILER_URL ?? "http://localhost:8080";
  const apiKey = options.apiKey ?? process.env.BETTER_SOL_COMPILER_API_KEY;

  if (!options.dryRun && !apiKey) {
    log.warn("No API key provided. Set BETTER_SOL_COMPILER_API_KEY or pass --api-key.");
    log.info("Obtain an API key through the Better Sol website or by running the compiler API with COMPILER_SHARED_SECRET for local development.");
  }

  const s = spinner();
  s.start(`Discovering programs from ${src}`);
  const programs = await discoverPrograms(src);
  if (programs.length === 0) {
    s.stop("No programs found");
    throw new Error(`No program() definitions found in ${src}`);
  }

  const matched = programFilter !== undefined
    ? programs.filter((p) => p.name === programFilter)
    : programs;
  if (programFilter !== undefined && matched.length === 0) {
    s.stop("Program not found");
    const available = programs.map((p) => `  ${p.name}`).join("\n");
    throw new Error(`No program named '${programFilter}' found in ${src}.\nAvailable programs:\n${available}`);
  }

  const projects = matched.map((program) => generateAnchorProject(program));

  if (options.verify || options.dryRun || options.output !== undefined) {
    s.message(`Writing generated Anchor projects`);
    await ensureDirectory(outDir);
    const { writeFile } = await import("node:fs/promises");
    await Promise.all(projects.map(async (project) => {
      const dir = join(outDir, project.program.name);
      await ensureDirectory(join(dir, "src"));
      await writeFile(join(dir, "Cargo.toml"), project.cargoToml);
      await writeFile(join(dir, "src", "lib.rs"), project.libRs);
    }));
  }

  if (options.dryRun) {
    s.stop("Dry run complete");
    for (const project of projects) printProgramSummary(project.program, cluster, outDir, true);
    outro("Generated Anchor Rust only. No compile or deploy performed.");
    return;
  }

  s.message(`Compiling via ${compilerUrl}`);
  const compileResults = await Promise.all(projects.map((project) => compileProgram({
    compilerUrl,
    apiKey,
    program: project.program,
    libRs: project.libRs,
    cargoToml: project.cargoToml,
    idl: project.idl,
  })));
  s.stop("Compilation completed");

  for (const project of projects) printProgramSummary(project.program, cluster, outDir, options.verify);
  for (const result of compileResults) {
    log.info([
      `Compile artifact: ${result.id}`,
      `Source hash: ${result.source_hash}`,
      `Bytecode hash: ${result.bytecode_hash ?? "not built"}`,
      `IDL: ${result.idl_url}`,
      `Artifact: ${result.artifact_url}`,
      `Source: ${result.source_url}`,
    ].join("\n"));
  }

  log.warn("On-chain deployment adapter is not connected yet. Compilation and IDL persistence are wired end-to-end.");
  outro(options.verify ? "Commit generated/ and run better-sol verify after deployment adapters are connected." : "Compile flow completed.");
}

function printProgramSummary(program: { readonly name: string; readonly address: string }, cluster: string, out: string, wroteRust: boolean): void {
  log.info([
    `${program.name}`,
    `Program: ${program.address}`,
    `Cluster: ${cluster}`,
    wroteRust ? `Generated Rust: ${out}/${program.name}/` : null,
  ].filter((line): line is string => line !== null).join("\n"));
}
