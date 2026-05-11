# @solana/kit Reference

Use this reference when Better Sol does not expose a lower-level Solana primitive yet. Prefer Better Sol for programs, typed clients, token helpers, tests, and deployment. Drop to `@solana/kit` for raw RPC, custom transaction construction, custom instructions, address utilities, codecs, signers, subscriptions, lookup tables, durable nonce flows, off-chain messages, and other official SDK primitives.

`@solana/kit` is the official JavaScript SDK for Solana apps on Node.js, web, and React Native. It re-exports many `@solana/*` packages and adds higher-level helpers with sensible defaults.

## Import

```ts
import {
  address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  generateKeyPairSigner,
  lamports,
} from "@solana/kit"
```

Use direct package imports only when tree-shaking or package boundaries matter. Otherwise import from `@solana/kit`.

## When to use `@solana/kit` from Better Sol projects

Use `@solana/kit` when you need to:

- Call RPC methods not wrapped by Better Sol.
- Build raw instructions for external programs not described by Better Sol or an IDL.
- Compose custom transactions around Better Sol `.instruction()` output.
- Use address lookup tables manually.
- Use durable nonce transaction lifetimes manually.
- Estimate compute units by simulation.
- Create custom signers, keypairs, or no-op signers.
- Decode raw account data with official codecs.
- Subscribe to account, program, slot, block, or signature notifications directly.
- Work with off-chain messages.

Better Sol instruction methods expose `.instruction()` and `.plan()` so raw Kit primitives can compose with Better Sol output.

## RPC

### Create RPC clients

```ts
import { createSolanaRpc, createSolanaRpcSubscriptions, devnet } from "@solana/kit"

const rpc = createSolanaRpc(devnet("https://api.devnet.solana.com"))
const rpcSubscriptions = createSolanaRpcSubscriptions(devnet("wss://api.devnet.solana.com"))
```

Core exports:

| API | Use |
|---|---|
| `createSolanaRpc(url)` | Create HTTP JSON-RPC client |
| `createSolanaRpcFromTransport(transport)` | Create RPC from custom transport |
| `createDefaultRpcTransport(url)` | Create default HTTP transport |
| `getRpcTransportWithRequestCoalescing(transport)` | Deduplicate/coalesce identical requests |
| `createSolanaRpcSubscriptions(url)` | Create WebSocket subscriptions client |
| `createSolanaRpcSubscriptions_UNSTABLE(url)` | Experimental subscriptions client |
| `createSolanaRpcSubscriptionsFromTransport(transport)` | Create subscriptions from custom transport |
| `createDefaultRpcSubscriptionsTransport(url)` | Create default subscription transport |
| `createDefaultRpcSubscriptionsChannelCreator(url)` | Create default WebSocket channel creator |
| `createDefaultSolanaRpcSubscriptionsChannelCreator(url)` | Solana-specific WebSocket channel creator |
| `getRpcSubscriptionsChannelWithAutoping(channel)` | Keep subscription channel alive |
| `getRpcSubscriptionsChannelWithJSONSerialization(channel)` | JSON serialization wrapper |
| `getRpcSubscriptionsChannelWithBigIntJSONSerialization(channel)` | BigInt-safe JSON wrapper |
| `getRpcSubscriptionsTransportWithSubscriptionCoalescing(transport)` | Coalesce identical subscriptions |
| `createChannelPool()` | Manage subscription channels |
| `getChannelPoolingChannelCreator(config)` | Reuse subscription channels |

RPC methods follow the `.send()` pattern:

```ts
const { value } = await rpc.getBalance(address("11111111111111111111111111111111")).send()
```

Common RPC calls:

```ts
await rpc.getAccountInfo(accountAddress, { encoding: "base64" }).send()
await rpc.getMultipleAccounts([addr1, addr2], { encoding: "base64" }).send()
await rpc.getProgramAccounts(programAddress).send()
await rpc.getLatestBlockhash().send()
await rpc.getSignatureStatuses([signature]).send()
await rpc.getTransaction(signature, { maxSupportedTransactionVersion: 0 }).send()
await rpc.simulateTransaction(encodedTransaction, { encoding: "base64" }).send()
await rpc.sendTransaction(encodedTransaction, { encoding: "base64" }).send()
```

Subscription requests are async iterables:

```ts
const notifications = await rpcSubscriptions.signatureNotifications(signature).subscribe({ abortSignal })
for await (const notification of notifications) {
  console.log(notification.value)
}
```

Common subscriptions:

```ts
rpcSubscriptions.accountNotifications(accountAddress)
rpcSubscriptions.programNotifications(programAddress)
rpcSubscriptions.signatureNotifications(signature)
rpcSubscriptions.slotNotifications()
rpcSubscriptions.rootNotifications()
rpcSubscriptions.logsNotifications("all")
```

## Cluster URLs and branded values

```ts
import { devnet, mainnet, testnet, lamports, blockhash, signature } from "@solana/kit"

const url = devnet("https://api.devnet.solana.com")
const amount = lamports(1_000_000_000n)
```

Core branded helpers:

| Helper | Purpose |
|---|---|
| `devnet(url)` | Brand devnet URL |
| `testnet(url)` | Brand testnet URL |
| `mainnet(url)` | Brand mainnet URL |
| `lamports(bigint)` | Brand lamports |
| `blockhash(string)` | Brand blockhash |
| `signature(string)` | Brand signature |
| `stringifiedNumber(string)` | Validate JSON number string |
| `stringifiedBigInt(string)` | Validate JSON bigint string |
| `unixTimestamp(bigint)` | Brand unix timestamp |

Validation helpers generally come in three forms:

```ts
isLamports(value)
assertIsLamports(value)
lamports(value)
```

## Addresses and PDAs

```ts
import { address, getProgramDerivedAddress, getAddressEncoder } from "@solana/kit"

const programAddress = address("11111111111111111111111111111111")
const [pda, bump] = await getProgramDerivedAddress({
  programAddress,
  seeds: [new TextEncoder().encode("vault"), getAddressEncoder().encode(ownerAddress)],
})
```

Core exports:

| API | Use |
|---|---|
| `address(value)` | Validate and brand base58 address |
| `isAddress(value)` | Check address string |
| `assertIsAddress(value)` | Assert address string |
| `getAddressEncoder()` | 32-byte address encoder |
| `getAddressDecoder()` | 32-byte address decoder |
| `getAddressCodec()` | Address codec |
| `getAddressComparator()` | Sort/compare addresses |
| `getProgramDerivedAddress({ programAddress, seeds })` | Derive PDA and bump |
| `isProgramDerivedAddress(value)` | Check PDA tuple |
| `assertIsProgramDerivedAddress(value)` | Assert PDA tuple |
| `createAddressWithSeed({ baseAddress, programAddress, seed })` | System-derived address |
| `isOffCurveAddress(address)` | Check off-curve address |
| `assertIsOffCurveAddress(address)` | Assert off-curve address |
| `offCurveAddress(address)` | Brand off-curve address |
| `getAddressFromPublicKey(publicKey)` | CryptoKey public key to address |
| `getPublicKeyFromAddress(address)` | Address to CryptoKey public key |

## Accounts

```ts
import { fetchEncodedAccount, decodeAccount, assertAccountExists } from "@solana/kit"

const account = await fetchEncodedAccount(rpc, accountAddress)
assertAccountExists(account)
const decoded = decodeAccount(account, myDecoder)
```

Core exports:

| API | Use |
|---|---|
| `parseBase64RpcAccount(address, rpcAccount)` | Parse base64 RPC account response |
| `parseBase58RpcAccount(address, rpcAccount)` | Parse base58 RPC account response |
| `parseJsonRpcAccount(address, rpcAccount)` | Parse JSON parsed RPC account response |
| `fetchEncodedAccount(rpc, address, config?)` | Fetch one account as bytes |
| `fetchEncodedAccounts(rpc, addresses, config?)` | Fetch multiple byte accounts |
| `fetchJsonParsedAccount(rpc, address, config?)` | Fetch one JSON-parsed account |
| `fetchJsonParsedAccounts(rpc, addresses, config?)` | Fetch multiple JSON-parsed accounts |
| `assertAccountExists(account)` | Assert maybe-account exists |
| `assertAccountsExist(accounts)` | Assert all maybe-accounts exist |
| `decodeAccount(account, decoder)` | Decode one encoded account |
| `assertAccountDecoded(account)` | Assert account data was decoded |
| `assertAccountsDecoded(accounts)` | Assert all account data decoded |

Types:

| Type | Use |
|---|---|
| `Account<TData, TAddress>` | Account with decoded or raw data |
| `EncodedAccount<TAddress>` | Account with raw bytes |
| `MaybeAccount<TData, TAddress>` | Existing or missing account |
| `MaybeEncodedAccount<TAddress>` | Existing or missing raw account |
| `FetchAccountConfig` | Commitment and minContextSlot config |
| `FetchAccountsConfig` | Multiple account fetch config |

## Instructions

```ts
import { AccountRole, type Instruction } from "@solana/kit"

const instruction: Instruction = {
  programAddress,
  accounts: [
    { address: payer, role: AccountRole.WRITABLE_SIGNER },
    { address: recipient, role: AccountRole.WRITABLE },
  ],
  data,
}
```

Core exports:

| API | Use |
|---|---|
| `Instruction` | Raw instruction type |
| `InstructionWithAccounts` | Instruction guaranteed to have accounts |
| `InstructionWithData` | Instruction guaranteed to have data |
| `AccountRole` | `READONLY`, `WRITABLE`, `READONLY_SIGNER`, `WRITABLE_SIGNER` |
| `AccountMeta` | Instruction account metadata |
| `ReadonlyAccount` | Read-only account meta |
| `WritableAccount` | Writable account meta |
| `ReadonlySignerAccount` | Read-only signer meta |
| `WritableSignerAccount` | Writable signer meta |
| `AccountLookupMeta` | Address lookup table account meta |
| `ReadonlyAccountLookup` | Read-only lookup meta |
| `WritableAccountLookup` | Writable lookup meta |
| `isInstructionForProgram(ix, programAddress)` | Narrow instruction program |
| `assertIsInstructionForProgram(ix, programAddress)` | Assert instruction program |
| `isInstructionWithAccounts(ix)` | Narrow instruction with accounts |
| `assertIsInstructionWithAccounts(ix)` | Assert instruction has accounts |
| `isInstructionWithData(ix)` | Narrow instruction with data |
| `assertIsInstructionWithData(ix)` | Assert instruction has data |
| `isSignerRole(role)` | Check signer role |
| `isWritableRole(role)` | Check writable role |
| `mergeRoles(a, b)` | Merge account roles |
| `upgradeRoleToSigner(role)` | Add signer capability |
| `upgradeRoleToWritable(role)` | Add writable capability |
| `downgradeRoleToNonSigner(role)` | Remove signer capability |
| `downgradeRoleToReadonly(role)` | Remove writable capability |

## Transaction messages

Kit builds transactions through immutable transaction messages.

```ts
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit"

const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
const message = pipe(
  createTransactionMessage({ version: 0 }),
  m => setTransactionMessageFeePayerSigner(payer, m),
  m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  m => appendTransactionMessageInstruction(instruction, m),
)
```

Core exports:

| API | Use |
|---|---|
| `createTransactionMessage({ version })` | Create legacy/v0/v1 transaction message |
| `setTransactionMessageFeePayer(address, message)` | Set fee payer address |
| `setTransactionMessageFeePayerSigner(signer, message)` | Set fee payer signer |
| `setTransactionMessageLifetimeUsingBlockhash(blockhash, message)` | Add blockhash lifetime |
| `setTransactionMessageLifetimeUsingDurableNonce(nonceConfig, message)` | Add durable nonce lifetime |
| `appendTransactionMessageInstruction(ix, message)` | Append instruction |
| `appendTransactionMessageInstructions(ixs, message)` | Append instructions |
| `prependTransactionMessageInstruction(ix, message)` | Prepend instruction |
| `prependTransactionMessageInstructions(ixs, message)` | Prepend instructions |
| `replaceTransactionMessageInstruction(index, ix, message)` | Replace instruction |
| `removeTransactionMessageInstruction(index, message)` | Remove instruction |
| `compressTransactionMessageUsingAddressLookupTables(message, lookupTables)` | Use ALTs in v0 message |
| `decompileTransactionMessageFetchingLookupTables(compiled, rpc, config?)` | Decompile and fetch lookup tables |
| `fetchAddressesForLookupTables(addresses, rpc, config?)` | Fetch ALT address lists |

## Compute budget and priority fees

```ts
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
  estimateComputeUnitLimitFactory,
  setTransactionMessageComputeUnitLimit,
} from "@solana/kit"

const estimateComputeUnitLimit = estimateComputeUnitLimitFactory({ rpc })
const units = await estimateComputeUnitLimit(message)
const withLimit = setTransactionMessageComputeUnitLimit(units, message)
```

Core exports:

| API | Use |
|---|---|
| `getSetComputeUnitLimitInstruction(units)` | Create compute unit limit instruction |
| `getSetComputeUnitPriceInstruction(microLamports)` | Create priority fee instruction |
| `getRequestHeapFrameInstruction(bytes)` | Create heap frame request instruction |
| `getSetLoadedAccountsDataSizeLimitInstruction(limit)` | Create loaded account data limit instruction |
| `setTransactionMessageComputeUnitLimit(units, message)` | Set CU limit in message |
| `getTransactionMessageComputeUnitLimit(message)` | Read CU limit from message |
| `setTransactionMessageComputeUnitPrice(microLamports, message)` | Set CU price in message |
| `getTransactionMessageComputeUnitPrice(message)` | Read CU price from message |
| `setTransactionMessagePriorityFeeLamports(lamports, message)` | Set priority fee in lamports |
| `getTransactionMessagePriorityFeeLamports(message)` | Read priority fee in lamports |
| `estimateComputeUnitLimitFactory({ rpc })` | Build CU estimator from simulation |
| `estimateAndSetComputeUnitLimitFactory(estimator)` | Estimate and update message |
| `fillTransactionMessageProvisoryComputeUnitLimit(message)` | Reserve space for later CU estimate |
| `MAX_COMPUTE_UNIT_LIMIT` | `1_400_000` |
| `COMPUTE_BUDGET_PROGRAM_ADDRESS` | Compute Budget program address |

## Durable nonce

```ts
import { createAdvanceNonceAccountInstruction, setTransactionMessageLifetimeUsingDurableNonce } from "@solana/kit"

const message = setTransactionMessageLifetimeUsingDurableNonce({
  nonce,
  nonceAccountAddress,
  nonceAuthorityAddress,
}, baseMessage)

const advanceNonceIx = createAdvanceNonceAccountInstruction({
  nonceAccountAddress,
  nonceAuthorityAddress,
})
```

Core exports:

| API | Use |
|---|---|
| `setTransactionMessageLifetimeUsingDurableNonce(config, message)` | Use durable nonce lifetime |
| `isTransactionMessageWithDurableNonceLifetime(message)` | Check nonce lifetime |
| `assertIsTransactionMessageWithDurableNonceLifetime(message)` | Assert nonce lifetime |
| `createAdvanceNonceAccountInstruction(config)` | Advance nonce account instruction |
| `isAdvanceNonceAccountInstruction(ix)` | Check advance nonce instruction |
| `Nonce` | Branded nonce value |

## Transactions

```ts
import {
  compileTransaction,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
} from "@solana/kit"

const signed = await signTransactionMessageWithSigners(message)
const wire = getBase64EncodedWireTransaction(signed)
const signature = getSignatureFromTransaction(signed)
```

Core exports:

| API | Use |
|---|---|
| `compileTransaction(message)` | Compile transaction from message |
| `partiallySignTransaction(transaction, keyPairs)` | Partially sign compiled transaction |
| `signTransaction(transaction, keyPairs)` | Fully sign compiled transaction |
| `partiallySignTransactionWithSigners(transaction)` | Partially sign with attached signers |
| `signTransactionWithSigners(transaction)` | Sign with attached signers |
| `signTransactionMessageWithSigners(message)` | Sign transaction message with attached signers |
| `partiallySignTransactionMessageWithSigners(message)` | Partially sign transaction message |
| `getBase64EncodedWireTransaction(transaction)` | Serialize transaction for RPC |
| `getSignatureFromTransaction(transaction)` | Get transaction signature |
| `getTransactionSize(transaction)` | Compute serialized transaction size |
| `getTransactionSizeLimit(transaction)` | Get applicable size limit |
| `isTransactionWithinSizeLimit(transaction)` | Check transaction size |
| `assertIsTransactionWithinSizeLimit(transaction)` | Assert transaction size |
| `isFullySignedTransaction(transaction)` | Check signedness |
| `assertIsFullySignedTransaction(transaction)` | Assert signedness |
| `isSendableTransaction(transaction)` | Check fully signed and size-safe |
| `assertIsSendableTransaction(transaction)` | Assert sendable |
| `LEGACY_TRANSACTION_SIZE_LIMIT` | 1232 bytes |
| `V1_TRANSACTION_SIZE_LIMIT` | 4096 bytes |
| `TRANSACTION_SIZE_LIMIT` | Packet payload limit |

## Sending and confirmation

```ts
import { sendAndConfirmTransactionFactory } from "@solana/kit"

const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })
await sendAndConfirm(signedTransaction, { commitment: "confirmed" })
```

Core exports:

| API | Use |
|---|---|
| `sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })` | Send blockhash transaction and wait for confirmation |
| `sendAndConfirmDurableNonceTransactionFactory({ rpc, rpcSubscriptions })` | Send durable nonce transaction and wait for confirmation |
| `sendTransactionWithoutConfirmingFactory({ rpc })` | Send transaction without waiting for confirmation |
| `airdropFactory({ rpc, rpcSubscriptions })` | Request and confirm airdrop on test clusters |

## Signers and keys

```ts
import { generateKeyPairSigner, createNoopSigner, addSignersToInstruction } from "@solana/kit"

const payer = await generateKeyPairSigner()
const noop = createNoopSigner(address("11111111111111111111111111111111"))
const ixWithSigner = addSignersToInstruction([payer], instruction)
```

Core exports:

| API | Use |
|---|---|
| `generateKeyPair()` | Generate Web Crypto keypair |
| `createKeyPairFromBytes(bytes)` | Create CryptoKeyPair from 64-byte secret |
| `createKeyPairFromPrivateKeyBytes(bytes)` | Create CryptoKeyPair from private key bytes |
| `createPrivateKeyFromBytes(bytes)` | Create CryptoKey private key |
| `getPublicKeyFromPrivateKey(privateKey)` | Derive public key |
| `writeKeyPair(keyPair)` | Serialize keypair |
| `grindKeyPair(config)` / `grindKeyPairs(config)` | Vanity keypair search |
| `generateKeyPairSigner()` | Generate signer |
| `createSignerFromKeyPair(keyPair)` | CryptoKeyPair to signer |
| `createKeyPairSignerFromBytes(bytes)` | Secret bytes to signer |
| `createKeyPairSignerFromPrivateKeyBytes(bytes)` | Private key bytes to signer |
| `writeKeyPairSigner(signer)` | Serialize signer |
| `grindKeyPairSigner(config)` / `grindKeyPairSigners(config)` | Vanity signer search |
| `createNoopSigner(address)` | Placeholder signer for wallet/offline flows |
| `isTransactionSigner(value)` | Check transaction signer |
| `assertIsTransactionSigner(value)` | Assert transaction signer |
| `isTransactionPartialSigner(value)` | Check partial signer |
| `assertIsTransactionPartialSigner(value)` | Assert partial signer |
| `isTransactionModifyingSigner(value)` | Check modifying signer |
| `isTransactionSendingSigner(value)` | Check sending signer |
| `addSignersToInstruction(signers, ix)` | Attach signers to instruction |
| `addSignersToTransactionMessage(signers, message)` | Attach signers to message |
| `getSignersFromInstruction(ix)` | Extract instruction signers |
| `getSignersFromTransactionMessage(message)` | Extract message signers |
| `deduplicateSigners(signers)` | Remove duplicate signers |
| `signBytes(key, data)` | Sign raw bytes |
| `verifySignature(key, signature, data)` | Verify raw bytes |
| `signature(value)` / `signatureBytes(bytes)` | Brand signature values |

Signer categories:

| Type | Meaning |
|---|---|
| `TransactionPartialSigner` | Can sign transaction bytes |
| `TransactionModifyingSigner` | Can modify a transaction while signing |
| `TransactionSendingSigner` | Can send a transaction itself |
| `TransactionSigner` | Union of transaction signer capabilities |
| `MessagePartialSigner` | Can sign off-chain message bytes |
| `MessageSigner` | Union of message signer capabilities |
| `KeyPairSigner` | Keypair-backed transaction and message signer |
| `NoopSigner` | Placeholder signer with an address only |

## Instruction and transaction plans

Use plans when a flow may span multiple instructions or multiple transactions.

```ts
import { singleInstructionPlan, sequentialInstructionPlan, flattenInstructionPlan } from "@solana/kit"

const plan = sequentialInstructionPlan([
  singleInstructionPlan(ix1),
  singleInstructionPlan(ix2),
])
const flat = flattenInstructionPlan(plan)
```

Core exports:

| API | Use |
|---|---|
| `singleInstructionPlan(ix)` | One instruction plan |
| `sequentialInstructionPlan(plans)` | Sequential instruction plan |
| `nonDivisibleSequentialInstructionPlan(plans)` | Sequential plan that should not be split |
| `parallelInstructionPlan(plans)` | Parallel instruction plan |
| `parseInstructionPlanInput(input)` | Normalize instruction plan input |
| `flattenInstructionPlan(plan)` | Flatten plan into single instruction plans |
| `findInstructionPlan(plan, predicate)` | Find nested plan |
| `everyInstructionPlan(plan, predicate)` | Check nested plans |
| `transformInstructionPlan(plan, visitor)` | Transform nested plans |
| `getLinearMessagePackerInstructionPlan(...)` | Pack linear instruction list |
| `getMessagePackerInstructionPlanFromInstructions(...)` | Build packer plan from instructions |
| `getReallocMessagePackerInstructionPlan(...)` | Build realloc-aware packer plan |
| `singleTransactionPlan(transaction)` | One transaction plan |
| `sequentialTransactionPlan(plans)` | Sequential transaction plan |
| `nonDivisibleSequentialTransactionPlan(plans)` | Sequential all-or-nothing transaction plan |
| `parallelTransactionPlan(plans)` | Parallel transaction plan |
| `flattenTransactionPlan(plan)` | Flatten transaction plan |
| `createTransactionPlanExecutor(config)` | Execute transaction plan |
| `createTransactionPlanner(config)` | Plan instructions into transactions |
| `summarizeTransactionPlanResult(result)` | Summarize plan execution result |

## Codecs

Kit re-exports `@solana/codecs`, including core, number, string, data-structure, and option codecs.

Common codecs:

| API | Use |
|---|---|
| `getU8Encoder/Decoder/Codec()` | u8 |
| `getU16Encoder/Decoder/Codec()` | u16 |
| `getU32Encoder/Decoder/Codec()` | u32 |
| `getU64Encoder/Decoder/Codec()` | u64 |
| `getU128Encoder/Decoder/Codec()` | u128 |
| `getI8Encoder/Decoder/Codec()` | i8 |
| `getI16Encoder/Decoder/Codec()` | i16 |
| `getI32Encoder/Decoder/Codec()` | i32 |
| `getI64Encoder/Decoder/Codec()` | i64 |
| `getI128Encoder/Decoder/Codec()` | i128 |
| `getF32Encoder/Decoder/Codec()` | f32 |
| `getF64Encoder/Decoder/Codec()` | f64 |
| `getShortU16Encoder/Decoder/Codec()` | compact short u16 |
| `getBase58Encoder/Decoder/Codec()` | base58 strings |
| `getBase64Encoder/Decoder/Codec()` | base64 strings |
| `getBase16Encoder/Decoder/Codec()` | hex/base16 strings |
| `getUtf8Encoder/Decoder/Codec()` | UTF-8 strings |
| `getAddressEncoder/Decoder/Codec()` | Solana addresses |
| `getBlockhashEncoder/Decoder/Codec()` | blockhashes |
| `getLamportsEncoder/Decoder/Codec()` | lamports |
| `getOptionEncoder/Decoder/Codec()` | options |

Codec composition:

| API | Use |
|---|---|
| `createEncoder`, `createDecoder`, `createCodec` | Build custom codecs |
| `combineCodec(encoder, decoder)` | Combine encoder and decoder |
| `fixEncoderSize`, `fixDecoderSize`, `fixCodecSize` | Force fixed size |
| `addEncoderSizePrefix`, `addDecoderSizePrefix`, `addCodecSizePrefix` | Prefix variable data with size |
| `addEncoderSentinel`, `addDecoderSentinel`, `addCodecSentinel` | Sentinel-terminated data |
| `transformEncoder`, `transformDecoder`, `transformCodec` | Map between domain and wire types |
| `offsetEncoder`, `offsetDecoder`, `offsetCodec` | Read/write at offset |
| `resizeEncoder`, `resizeDecoder`, `resizeCodec` | Resize encoded data |
| `reverseEncoder`, `reverseDecoder`, `reverseCodec` | Reverse byte order |
| `mergeBytes`, `padBytes`, `fixBytes`, `containsBytes`, `bytesEqual` | Byte utilities |
| `getEncodedSize(codec, value)` | Encoded byte size |
| `isFixedSize`, `assertIsFixedSize`, `isVariableSize`, `assertIsVariableSize` | Size guards |
| `createDecoderThatConsumesEntireByteArray(decoder)` | Decode and reject trailing bytes |

## Options

```ts
import { some, none, isSome, unwrapOption } from "@solana/kit"

const value = some(1n)
if (isSome(value)) console.log(value.value)
```

Core exports:

| API | Use |
|---|---|
| `some(value)` | Create Some option |
| `none<T>()` | Create None option |
| `isOption(value)` | Check option |
| `isSome(option)` | Check Some |
| `isNone(option)` | Check None |
| `unwrapOption(option, fallback?)` | Unwrap one option |
| `unwrapOptionRecursively(value, fallback?)` | Deep unwrap options |
| `wrapNullable(value)` | Convert nullable to option |
| `getOptionEncoder/Decoder/Codec()` | Encode/decode options |

## Program errors

```ts
import { isProgramError } from "@solana/kit"

if (isProgramError(error, programAddress, 6000)) {
  console.log("Matched program error")
}
```

Core exports:

| API | Use |
|---|---|
| `isProgramError(error, programAddress, code?)` | Check custom program error |
| `getSolanaErrorFromRpcError(error)` | Convert RPC error to Solana error |
| `getSolanaErrorFromInstructionError(error)` | Convert instruction error |
| `isSolanaError(error, code?)` | Check Solana error |
| `SOLANA_ERROR__...` constants | Typed error codes |
| `unwrapSimulationError(error)` | Extract simulation failure cause |

## Reactive state and subscriptions

Use these when building UI or indexer primitives not yet wrapped by Better Sol.

```ts
import { createReactiveStoreWithInitialValueAndSlotTracking } from "@solana/kit"

const store = createReactiveStoreWithInitialValueAndSlotTracking({
  abortSignal,
  rpcRequest: rpc.getBalance(owner),
  rpcValueMapper: value => value,
  rpcSubscriptionRequest: rpcSubscriptions.accountNotifications(owner),
  rpcSubscriptionValueMapper: notification => notification.lamports,
})
```

Core exports:

| API | Use |
|---|---|
| `createReactiveStoreWithInitialValueAndSlotTracking(config)` | Store compatible with React/Svelte/Solid primitives |
| `createAsyncGeneratorWithInitialValueAndSlotTracking(config)` | Async generator combining initial fetch and live updates |

## Off-chain messages

Use off-chain messages for wallet signatures that do not submit a transaction.

Core exports:

| API | Use |
|---|---|
| `createSignableMessage(config)` | Create signable message |
| `partiallySignOffchainMessageWithSigners(message)` | Partially sign off-chain message |
| `signOffchainMessageWithSigners(message)` | Fully sign off-chain message |
| `compileOffchainMessageEnvelope(message)` | Compile off-chain message envelope |
| `signOffchainMessageEnvelope(envelope, keyPairs)` | Sign envelope |
| `verifyOffchainMessageEnvelope(envelope)` | Verify envelope |
| `OffchainMessageContentFormat` | Content format enum |
| `offchainMessageContentRestrictedAsciiOf1232BytesMax(text)` | Restricted ASCII content |
| `offchainMessageContentUtf8Of1232BytesMax(text)` | UTF-8 short content |
| `offchainMessageContentUtf8Of65535BytesMax(text)` | UTF-8 long content |
| `offchainMessageApplicationDomain(domain)` | Application domain |

## Better Sol composition patterns

### Add a custom Kit instruction to a Better Sol transaction

```ts
const betterSolIx = await sol.counter.increment.instruction({ counter: addr, amount: 1n })
const customIx = {
  programAddress: customProgram,
  accounts: [{ address: user, role: AccountRole.WRITABLE_SIGNER }],
  data: new Uint8Array([1, 2, 3]),
}
await sol.send([customIx, betterSolIx])
```

### Use Kit RPC from a Better Sol client

```ts
const { value } = await sol.rpc.getLatestBlockhash().send()
const account = await sol.rpc.getAccountInfo(addr, { encoding: "base64" }).send()
```

### Use Kit subscriptions from a Better Sol client

```ts
if (sol.rpcSubscriptions !== undefined) {
  const notifications = await sol.rpcSubscriptions.accountNotifications(addr).subscribe({ abortSignal })
  for await (const notification of notifications) {
    console.log(notification.value)
  }
}
```

### Use Kit signers with Better Sol

```ts
const signer = await generateKeyPairSigner()
const userSol = await sol.withSigner(signer)
await userSol.counter.increment({ counter: addr, amount: 1n })
```

## Related

- `sdk-reference.md` for Better Sol APIs.
- `client-testing-deploy.md` for Better Sol client, testing, and deploy workflows.
- `advanced-solana.md` for compute budget, ALTs, durable nonce, compression, and advanced Solana patterns.
