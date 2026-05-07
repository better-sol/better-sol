import type { IrProgram } from "#ir";
import { toSnake } from "./types";

const ANCHOR_VERSION = "1.0.2";

export function generateCargoToml(program: IrProgram): string {
  const usesToken2022 = program.instructions.some(hasToken2022Cpi);
  const usesToken = program.instructions.some((ix) => hasTokenCpi(ix) || usesTokenAccounts(ix)) || usesToken2022;

  const splEntry = usesToken ? buildSplDeps(usesToken2022) : "";
  const bytemuckEntry = program.accounts.some((account) => account.zeroCopy) || program.structsZC.length > 0
    ? "\nbytemuck = { version = \"=1.25.0\", features = [\"derive\"] }"
    : "";

  return `[package]
name = "${toSnake(program.name)}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
anchor-debug = []
custom-heap = []
custom-panic = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = { version = "=${ANCHOR_VERSION}", features = ["init-if-needed"] }${splEntry}${bytemuckEntry}
`;
}

function buildSplDeps(includeToken2022: boolean): string {
  const features = ["token", "associated_token"];
  if (includeToken2022) features.push("token_2022");
  return `\nanchor-spl = { version = "=${ANCHOR_VERSION}", features = [${features.map((feature) => `"${feature}"`).join(", ")}] }`;
}

export function generateImports(program: IrProgram): string {
  const usesToken = program.instructions.some((ix) => hasTokenCpi(ix) || usesTokenAccounts(ix) || hasToken2022Cpi(ix));
  const imports = ["use anchor_lang::prelude::*;"];
  if (!usesToken) return imports.join("\n");

  const standardInstructions = program.instructions.filter((ix) => !hasToken2022Cpi(ix));
  const token2022Instructions = program.instructions.filter(hasToken2022Cpi);

  if (standardInstructions.some(usesTokenAccounts) || standardInstructions.some(hasTokenCpi)) {
    const types: string[] = [];
    if (standardInstructions.some((ix) => ix.accounts.some((account) => account.constraint.kind === "tokenProgram"))) types.push("Token");
    if (standardInstructions.some((ix) => ix.accounts.some((account) => account.constraint.kind === "tokenAccount"))) types.push("TokenAccount");
    if (standardInstructions.some((ix) => ix.accounts.some((account) => account.constraint.kind === "mint"))) types.push("Mint");
    const operations = collectTokenOperations(standardInstructions);
    if (operations.length > 0) types.unshift("self");
    for (const operation of operations) types.push(operation);
    imports.push(`use anchor_spl::token::{${types.join(", ")}};`);
  }

  if (token2022Instructions.length > 0) {
    const types = ["Mint as InterfaceMint", "TokenAccount as InterfaceTokenAccount", "TokenInterface"];
    const operations = collectTokenOperations(token2022Instructions);
    if (operations.length > 0) types.unshift("self");
    for (const operation of operations) types.push(operation);
    imports.push(`use anchor_spl::token_interface::{${types.join(", ")}};`);
  }

  return imports.join("\n");
}

function collectTokenOperations(instructions: readonly { readonly body: string }[]): readonly string[] {
  const operations = new Set<string>();
  for (const ix of instructions) {
    if (ix.body.includes("token.transferChecked")) operations.add("TransferChecked");
    if (ix.body.includes("token.transfer(")) operations.add("Transfer");
    if (ix.body.includes("token.mintTo")) operations.add("MintTo");
    if (ix.body.includes("token.burn")) operations.add("Burn");
  }
  return [...operations];
}

function usesTokenAccounts(ix: { readonly accounts: readonly { readonly constraint: { readonly kind: string } }[]; readonly body: string }): boolean {
  return ix.accounts.some((account) => account.constraint.kind === "mint" || account.constraint.kind === "tokenAccount" || account.constraint.kind === "tokenProgram");
}

function hasTokenCpi(ix: { readonly body: string }): boolean {
  return ix.body.includes("token.") || ix.body.includes("system.");
}

function hasToken2022Cpi(ix: { readonly accounts: readonly { readonly constraint: { readonly kind: string } }[] }): boolean {
  return ix.accounts.some((acc) => acc.constraint.kind === "token2022Program");
}
