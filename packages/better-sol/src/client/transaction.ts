import {
  AccountRole,
  address as kitAddress,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageLifetimeUsingDurableNonce,
  signTransactionMessageWithSigners,
  type AccountMeta,
  type AccountSignerMeta,
  type Instruction,
  type TransactionSigner,
  type Signature,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  AccountConstraint,
  type AccountInputs,
  type ArgsSchema,
  type InstructionDefinition,
} from "../program";
import type {
  InstructionSigningMode,
  KitRpc,
  SignedTransaction,
  SimulateResult,
} from "./types";
import { CLOCK_SYSVAR_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS, CONFIRMATION_RETRIES, CONFIRMATION_INTERVAL_MS } from "./types";
import { type LookupTableIndex, type ResolvedAccountMeta, resolveWithLookupTables } from "./lookup-tables";

export type NonceConfig = {
  readonly nonceAccountAddress: string;
  readonly nonceAuthority: TransactionSigner;
};

export function toSnake(name: string): string {
  return name.replace(/([A-Z]+)([A-Z][a-z])/g, "_$1_$2").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/^_/, "");
}

export async function buildAndSignTransaction(
  instructions: readonly Instruction[],
  rpc: KitRpc,
  signer: TransactionSigner,
  commitment: "processed" | "confirmed" | "finalized",
  nonceConfig?: NonceConfig,
): Promise<SignedTransaction> {
  if (nonceConfig !== undefined) {
    const nonceValue = await fetchNonceFromAccount(rpc, nonceConfig.nonceAccountAddress);
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(signer, tx),
      (tx) => setTransactionMessageLifetimeUsingDurableNonce(
        { nonce: nonceValue as never, nonceAccountAddress: kitAddress(nonceConfig.nonceAccountAddress), nonceAuthorityAddress: nonceConfig.nonceAuthority.address },
        tx,
      ),
      (tx) => appendTransactionMessageInstructions(instructions, tx),
    );
    return await signTransactionMessageWithSigners(message);
  }

  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );
  return await signTransactionMessageWithSigners(message);
}

async function fetchNonceFromAccount(rpc: KitRpc, nonceAccountAddress: string): Promise<string> {
  const { fetchNonce } = await import("@solana-program/system");
  const { data: { blockhash } } = await fetchNonce(rpc, kitAddress(nonceAccountAddress));
  return blockhash;
}

export async function sendAndConfirm(
  transaction: SignedTransaction,
  rpc: KitRpc,
): Promise<Signature> {
  const signature = getSignatureFromTransaction(transaction);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: "base64" }).send();
  for (let attempt = 0; attempt < CONFIRMATION_RETRIES; attempt++) {
    const { value: statuses } = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send();
    const status = statuses[0];
    if (status !== null && status !== undefined && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_INTERVAL_MS));
  }
  throw new Error(`Transaction ${signature as unknown as string} not confirmed within ${CONFIRMATION_RETRIES * CONFIRMATION_INTERVAL_MS}ms`);
}

export async function runSimulation(
  transaction: SignedTransaction,
  rpc: KitRpc,
  commitment: "processed" | "confirmed" | "finalized",
): Promise<SimulateResult> {
  const encoded = getBase64EncodedWireTransaction(transaction);
  const simResult = await rpc.simulateTransaction(encoded, { encoding: "base64", sigVerify: true, commitment }).send();
  if (simResult.value.err !== null && simResult.value.err !== undefined) {
    const errStr = typeof simResult.value.err === "string" ? simResult.value.err : JSON.stringify(simResult.value.err);
    const logs = simResult.value.logs?.join("\n") ?? "";
    throw new Error(`Transaction simulation failed: ${errStr}\nLogs:\n${logs}`);
  }
  const rd = simResult.value.returnData;
  return {
    logs: simResult.value.logs ?? [],
    unitsConsumed: BigInt(simResult.value.unitsConsumed ?? 0),
    returnData: rd !== null && rd !== undefined ? decodeBase64Data(rd.data) : null,
  };
}

export function buildAccountMetas(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
  signer: TransactionSigner | undefined,
  mode: InstructionSigningMode,
  lookupTableIndex?: LookupTableIndex,
): readonly ResolvedAccountMeta[] {
  const accountMetas: (AccountMeta | AccountSignerMeta)[] = [];
  const accountEntries = Object.entries(ixDef.accounts);

  let omittedSignerCount = 0;
  for (const [name, input] of accountEntries) {
    if (input instanceof AccountConstraint && input.constraintKind === "signer" && params[name] === undefined) omittedSignerCount++;
  }
  if (omittedSignerCount > 1) {
    throw new Error("Multiple signer accounts omitted. Pass explicit addresses for all but one signer, or use sol.withSigner() for a different signer.");
  }

  for (const [name, input] of Object.entries(ixDef.accounts)) {
    if (input instanceof AccountConstraint && input.constraintKind === "remaining") {
      accountMetas.push(...remainingAccountMetas(name, params[name], input.remainingItem));
      continue;
    }
    accountMetas.push(resolveAccountMetaInput(name, input, params[name], signer, mode));
  }

  const hasInit = accountEntries.some(
    ([, input]) => input instanceof AccountConstraint && (input.constraintKind === "init" || input.constraintKind === "initIfNeeded"),
  );
  const alreadyHasSystemProgram = accountMetas.some((meta) => meta.address === SYSTEM_PROGRAM_ADDRESS);
  if (hasInit && !alreadyHasSystemProgram) {
    accountMetas.push({ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY });
  }

  if (lookupTableIndex !== undefined) {
    return resolveWithLookupTables(accountMetas, lookupTableIndex);
  }

  return accountMetas;
}

function resolveAccountMetaInput(
  name: string,
  input: AccountInputs[string],
  value: unknown,
  signer: TransactionSigner | undefined,
  mode: InstructionSigningMode,
): AccountMeta | AccountSignerMeta {
  if (!(input instanceof AccountConstraint)) {
    if (typeof value !== "string") throw new Error(`Missing account '${name}'`);
    return { address: kitAddress(value), role: AccountRole.READONLY };
  }

  const kind = input.constraintKind;
  const isWritable = kind === "init" || kind === "initIfNeeded" || kind === "close" || kind === "realloc" || input.mutable;
  const role = accountRole(kind === "signer", isWritable);

  if (kind === "systemProgram") return fixedProgramMeta(name, value, SYSTEM_PROGRAM_ADDRESS, role);
  if (kind === "tokenProgram") return fixedProgramMeta(name, value, TOKEN_PROGRAM_ADDRESS, role);
  if (kind === "token2022Program") return fixedProgramMeta(name, value, TOKEN_2022_PROGRAM_ADDRESS, role);
  if (kind === "clock") return fixedProgramMeta(name, value, CLOCK_SYSVAR_ADDRESS, role);

  if (kind === "signer") return signerMeta(name, value, signer, isWritable, mode);
  if (typeof value !== "string") throw new Error(`Missing account '${name}'`);
  return { address: kitAddress(value), role };
}

function fixedProgramMeta(name: string, value: unknown, expected: import("@solana/kit").Address, role: AccountRole): AccountMeta {
  if (value !== undefined && (typeof value !== "string" || kitAddress(value) !== expected)) {
    throw new Error(`Account '${name}' must be ${expected}`);
  }
  return { address: expected, role };
}

function signerMeta(
  name: string,
  value: unknown,
  signer: TransactionSigner | undefined,
  isWritable: boolean,
  mode: InstructionSigningMode,
): AccountMeta | AccountSignerMeta {
  const role = isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  if (value === undefined) {
    if (signer === undefined) throw new Error(`Missing signer account '${name}'`);
    return { address: signer.address, role, signer };
  }
  if (typeof value !== "string") throw new Error(`Signer account '${name}' must be an address`);
  const accountAddress = kitAddress(value);
  if (signer !== undefined && accountAddress === signer.address) return { address: accountAddress, role, signer };
  if (mode === "signed") throw new Error(`Signer '${name}' must match the active signer. Use sol.withSigner() for a different signer.`);
  return { address: accountAddress, role };
}

function remainingAccountMetas(name: string, value: unknown, item: unknown): readonly AccountMeta[] {
  if (!Array.isArray(value)) throw new Error(`Remaining account '${name}' must be an array of addresses`);
  const role = remainingAccountRole(item);
  return value.map((entry) => {
    if (typeof entry !== "string") throw new Error(`Remaining account '${name}' contains a non-address value`);
    return { address: kitAddress(entry), role };
  });
}

function remainingAccountRole(item: unknown): AccountRole {
  if (!(item instanceof AccountConstraint)) return AccountRole.READONLY;
  if (item.constraintKind === "signer") return item.mutable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  return item.mutable || item.constraintKind === "mut" || item.constraintKind === "init" || item.constraintKind === "initIfNeeded" || item.constraintKind === "close" || item.constraintKind === "realloc"
    ? AccountRole.WRITABLE
    : AccountRole.READONLY;
}

function accountRole(isSigner: boolean, isWritable: boolean): AccountRole.READONLY | AccountRole.WRITABLE | AccountRole.READONLY_SIGNER | AccountRole.WRITABLE_SIGNER {
  if (isSigner) return isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

function decodeBase64Data(data: readonly [string, string]): Uint8Array {
  const encoded = data[0];
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function withComputeBudget(
  instructions: readonly Instruction[],
  config: import("./types").ComputeUnitConfig | undefined,
): readonly Instruction[] {
  if (config === undefined) return instructions;
  const budgetInstructions: Instruction[] = [];
  if (config.computeUnitLimit !== undefined) {
    const { createSetComputeUnitLimitInstruction } = require("@solana-program/compute-budget");
    budgetInstructions.push(createSetComputeUnitLimitInstruction({ units: config.computeUnitLimit }));
  }
  if (config.computeUnitPrice !== undefined) {
    const { createSetComputeUnitPriceInstruction } = require("@solana-program/compute-budget");
    budgetInstructions.push(createSetComputeUnitPriceInstruction({ microLamports: config.computeUnitPrice }));
  }
  return [...budgetInstructions, ...instructions];
}
