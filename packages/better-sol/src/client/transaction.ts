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
  type Address as KitAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import { fetchNonce } from "@solana-program/system";
import {
  AccountConstraint,
  type AccountInputs,
  type ArgsSchema,
  type InstructionDefinition,
  type AccountResolutionContext,
  type AccountAddressResolver,
} from "#program";
import type {
  InstructionSigningMode,
  KitRpc,
  KitRpcSubscriptions,
  SignedTransaction,
  SimulateResult,
} from "./types.ts";
import { CLOCK_SYSVAR_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS, CONFIRMATION_INTERVAL_MS, type ComputeUnitConfig } from "./types.ts";
import { type LookupTableIndex, type ResolvedAccountMeta, resolveWithLookupTables } from "./lookup-tables.ts";

export type NonceConfig = {
  readonly nonceAccountAddress: string;
  readonly nonceAuthority: TransactionSigner;
};

export type TransactionCallback = (signature: Signature, slot: bigint) => void;

export function createTransactionNotifier(): { readonly notify: TransactionCallback; readonly subscribe: (cb: TransactionCallback) => () => void } {
  let callback: TransactionCallback | undefined;
  return {
    notify: (signature: Signature, slot: bigint) => {
      if (callback !== undefined) callback(signature, slot);
    },
    subscribe: (cb: TransactionCallback): (() => void) => {
      callback = cb;
      return () => { callback = undefined; };
    },
  };
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
        { nonce: toNonce(nonceValue), nonceAccountAddress: kitAddress(nonceConfig.nonceAccountAddress), nonceAuthorityAddress: nonceConfig.nonceAuthority.address },
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
  const { data: { blockhash } } = await fetchNonce(rpc, kitAddress(nonceAccountAddress));
  return blockhash;
}

function toNonce(value: string): Parameters<typeof setTransactionMessageLifetimeUsingDurableNonce>[0]["nonce"] {
  return value as Parameters<typeof setTransactionMessageLifetimeUsingDurableNonce>[0]["nonce"];
}

export async function sendAndConfirm(
  transaction: SignedTransaction,
  rpc: KitRpc,
  rpcSubscriptions: KitRpcSubscriptions | undefined,
  onConfirmed?: TransactionCallback,
  commitment: "processed" | "confirmed" | "finalized" = "confirmed",
): Promise<Signature> {
  const signature = getSignatureFromTransaction(transaction);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: "base64" }).send();

  if (rpcSubscriptions !== undefined) {
    return await confirmViaWebSocket(signature, rpcSubscriptions, onConfirmed, commitment);
  }
  return await confirmViaPolling(signature, rpc, onConfirmed, commitment);
}

async function confirmViaWebSocket(
  signature: Signature,
  rpcSubscriptions: KitRpcSubscriptions,
  onConfirmed: TransactionCallback | undefined,
  commitment: "processed" | "confirmed" | "finalized",
): Promise<Signature> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIRMATION_INTERVAL_MS * 30);

  try {
    const subscription = rpcSubscriptions.signatureNotifications(signature, { commitment, enableReceivedNotification: false });
    const stream = await subscription.subscribe({ abortSignal: controller.signal });

    for await (const notification of stream) {
      if (notification.value !== undefined && "err" in notification.value && notification.value.err !== undefined && notification.value.err !== null) {
        throw new Error(`Transaction ${String(signature)} failed: ${JSON.stringify(notification.value.err)}`);
      }
      if (notification.value !== undefined && notification.value.err === null) {
        const slot = "slot" in notification ? (notification.slot as bigint) : 0n;
        if (onConfirmed !== undefined) onConfirmed(signature, slot);
        return signature;
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new Error(`Transaction ${String(signature)} confirmation subscription closed without result`);
}

async function confirmViaPolling(
  signature: Signature,
  rpc: KitRpc,
  onConfirmed: TransactionCallback | undefined,
  commitment: "processed" | "confirmed" | "finalized",
): Promise<Signature> {
  const CONFIRMATION_RETRIES = 30;
  for (let attempt = 0; attempt < CONFIRMATION_RETRIES; attempt++) {
    // oxlint-disable-next-line no-await-in-loop — intentional polling for confirmation
    const { value: statuses } = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send();
    const status = statuses[0];
    if (status !== null && status !== undefined) {
      if (status.err !== null && status.err !== undefined) {
        throw new Error(`Transaction ${String(signature)} failed: ${JSON.stringify(status.err)}`);
      }
      if (status.confirmationStatus === commitment || status.confirmationStatus === "finalized") {
        if (onConfirmed !== undefined) onConfirmed(signature, status.slot ?? 0n);
        return signature;
      }
    }
    // oxlint-disable-next-line no-await-in-loop — intentional sleep between polling retries
    await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_INTERVAL_MS));
  }
  throw new Error(`Transaction ${String(signature)} not confirmed within ${CONFIRMATION_RETRIES * CONFIRMATION_INTERVAL_MS}ms`);
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

export async function buildAccountMetas(
  ixDef: InstructionDefinition<AccountInputs, ArgsSchema | undefined>,
  params: Record<string, unknown>,
  programAddress: string,
  signer: TransactionSigner | undefined,
  mode: InstructionSigningMode,
  lookupTableIndex?: LookupTableIndex,
): Promise<readonly ResolvedAccountMeta[]> {
  const accountMetas: (AccountMeta | AccountSignerMeta)[] = [];
  const accountEntries = Object.entries(ixDef.accounts);

  let omittedSignerCount = 0;
  for (const [name, input] of accountEntries) {
    if (input instanceof AccountConstraint && input.constraintKind === "signer" && params[name] === undefined) omittedSignerCount++;
  }
  if (omittedSignerCount > 1) {
    throw new Error("Multiple signer accounts omitted. Pass explicit addresses for all but one signer, or use sol.withSigner() for a different signer.");
  }

  const resolvedAccounts: Record<string, string> = {};
  for (const [name, input] of accountEntries) {
    if (typeof params[name] === "string") resolvedAccounts[name] = params[name];
    if (input instanceof AccountConstraint && input.constraintKind === "signer" && params[name] === undefined && signer !== undefined) {
      resolvedAccounts[name] = signer.address;
    }
  }
  await accountEntries.reduce<Promise<void>>(async (previous, [name, input]) => {
    await previous;
    if (input instanceof AccountConstraint && input.constraintKind === "remaining") {
      accountMetas.push(...remainingAccountMetas(name, params[name], input.remainingItem));
      return;
    }
    const meta = await resolveAccountMetaInput(name, input, params[name], params, programAddress, resolvedAccounts, signer, mode);
    resolvedAccounts[name] = meta.address;
    accountMetas.push(meta);
  }, Promise.resolve());

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

async function resolveAccountMetaInput(
  name: string,
  input: AccountInputs[string],
  value: unknown,
  params: Readonly<Record<string, unknown>>,
  programAddress: string,
  resolvedAccounts: Readonly<Record<string, string>>,
  signer: TransactionSigner | undefined,
  mode: InstructionSigningMode,
): Promise<AccountMeta | AccountSignerMeta> {
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
  const resolvedAddress = await resolveAccountAddress(input, params, programAddress, resolvedAccounts, signer);
  if (resolvedAddress !== undefined) {
    if (value !== undefined && (typeof value !== "string" || kitAddress(value) !== kitAddress(resolvedAddress))) {
      throw new Error(`Account '${name}' must be ${resolvedAddress}`);
    }
    return { address: kitAddress(resolvedAddress), role };
  }
  if (typeof value !== "string") throw new Error(`Missing account '${name}'`);
  return { address: kitAddress(value), role };
}

async function resolveAccountAddress(
  input: { readonly addressResolver: AccountAddressResolver | undefined },
  params: Readonly<Record<string, unknown>>,
  programAddress: string,
  resolvedAccounts: Readonly<Record<string, string>>,
  signer: TransactionSigner | undefined,
): Promise<string | undefined> {
  if (input.addressResolver === undefined) return undefined;
  const context: AccountResolutionContext = {
    params,
    programAddress,
    signerAddress: signer?.address,
    resolvedAccounts,
  };
  return await input.addressResolver(context);
}

function fixedProgramMeta(name: string, value: unknown, expected: KitAddress, role: AccountRole): AccountMeta {
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
  config: ComputeUnitConfig | undefined,
): readonly Instruction[] {
  if (config === undefined) return instructions;
  const budgetInstructions: Instruction[] = [];
  if (config.computeUnitLimit !== undefined) {
    budgetInstructions.push(getSetComputeUnitLimitInstruction({ units: Number(config.computeUnitLimit) }));
  }
  if (config.computeUnitPrice !== undefined) {
    budgetInstructions.push(getSetComputeUnitPriceInstruction({ microLamports: config.computeUnitPrice }));
  }
  return [...budgetInstructions, ...instructions];
}
