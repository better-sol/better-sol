# Solana Transaction Simulation API — Reference

Deep-dive reference: @solana/kit simulation API, parameter types, response shapes. For internal use only.

---

Research from actual type definitions in `@solana/rpc-api`, `@solana/rpc-types`,
`@solana/kit`, and `@solana/web3.js`.

---

## 1. `@solana/kit` (web3.js v2) — `rpc.simulateTransaction()`

### Function Name

```ts
rpc.simulateTransaction(base64EncodedWireTransaction, config?)
```

Defined in `@solana/rpc-api` as part of the `SimulateTransactionApi` interface.
Accessed via `@solana/kit`'s `createSolanaRpc()`.

### Parameters

| Param | Type | Description |
|---|---|---|
| `base64EncodedWireTransaction` | `Base64EncodedWireTransaction` (branded string) | Fully signed/unsigned transaction in wire format, base64 encoded |
| `config` (optional) | See below | Simulation configuration |

#### Config object (composed from several config types):

```ts
// Base config — always available
type SimulateTransactionConfigBase = Readonly<{
    commitment?: 'confirmed' | 'finalized' | 'processed';  // default: "confirmed" in kit
    innerInstructions?: boolean;  // default: false
    minContextSlot?: bigint;      // enforce RPC has processed up to this slot
}>;

// Signature/Blockhash control
// Option A: verify signatures
{ sigVerify: true; replaceRecentBlockhash?: false }
// Option B: replace blockhash with latest
{ replaceRecentBlockhash: true; sigVerify?: false }
// Option C: neither (default)
{ sigVerify?: false; replaceRecentBlockhash?: false }

// Account snapshot request (optional)
{
    accounts: {
        addresses: Address[];           // which accounts to snapshot
        encoding: 'base64' | 'base64+zstd' | 'jsonParsed';
    }
}

// Encoding selector (for the wire transaction itself)
{ encoding: 'base64' }  // required for new-style calls
```

### Return Type

The return type is a **union of intersection types** — TypeScript picks the right one based on
which config you pass. But the **structural shape** is always built from these building blocks:

```ts
// The wrapper
type SolanaRpcResponse<TValue> = Readonly<{
    context: Readonly<{ slot: bigint }>;
    value: TValue;
}>;

// The base response — ALWAYS present
type SimulateTransactionApiResponseBase = Readonly<{
    err: TransactionError | null;         // null = success
    logs: string[] | null;                // null if sim failed before execution
    returnData: {
        data: [Base64EncodedBytes, 'base64'];  // instruction return data
        programId: Address;                     // program that returned it
    } | null;
    unitsConsumed?: bigint;               // compute units consumed
}>;

// Optional: account post-state (only if config.accounts was set)
type SimulateTransactionApiResponseWithAccounts<TAccount> = Readonly<{
    accounts: (TAccount | null)[];  // same length as config.accounts.addresses
}>;

// Optional: inner instructions (only if config.innerInstructions = true)
// This adds an `innerInstructions` field:
type SimulateTransactionApiResponseWithInnerInstructions = Readonly<{
    innerInstructions: readonly {
        index: number;           // which outer instruction triggered this
        instructions: readonly {
            parsed?: { info?: object; type: string };
            program: string;
            programId: Address;
            stackHeight?: number;
            data?: Base58EncodedBytes;
            accounts?: Address[] | readonly number[];
        }[];
    }[];
}>;

// Optional: replacement blockhash (only if config.replaceRecentBlockhash = true)
type SimulateTransactionApiResponseWithReplacementBlockhash = Readonly<{
    replacementBlockhash: TransactionBlockhashLifetime;
}>;
```

#### What the account snapshot looks like (when `accounts.encoding = 'base64'`):

```ts
// Each account in the array:
type AccountInfoBase & AccountInfoWithBase64EncodedData = {
    executable: boolean;
    lamports: bigint;
    owner: Address;
    rentEpoch: bigint;
    space: bigint;
    data: [Base64EncodedBytes, 'base64'];  // the full account data, base64 encoded
};
```

### TransactionError Type

```ts
type TransactionError =
    | 'AccountInUse'
    | 'AccountNotFound'
    | 'AlreadyProcessed'
    | 'BlockhashNotFound'
    | 'InsufficientFundsForFee'
    | 'InvalidAccountForFee'
    | 'SanitizeFailure'
    | 'SignatureFailure'
    | 'WouldExceedMaxBlockCostLimit'
    // ... ~40 more string literals for well-known errors
    | { InstructionError: [instructionIndex: number, InstructionError] }
    | { DuplicateInstruction: instructionIndex: number }
    | { InsufficientFundsForRent: { account_index: number } }
    | { ProgramExecutionTemporarilyRestricted: { account_index: number } };

type InstructionError =
    | 'GenericError'
    | 'InvalidArgument'
    | 'InvalidInstructionData'
    | 'InvalidAccountData'
    | 'AccountAlreadyInitialized'
    | 'UninitializedAccount'
    | 'NotEnoughAccountKeys'
    | 'AccountDataSizeChanged'
    | 'AccountDataTooSmall'
    | 'InsufficientFunds'
    | 'CustomProgramError'  // via { Custom: number }
    | 'ArithmeticOverflow'
    | 'UnsupportedProgramId'
    // ... ~40 more
    | { BorshIoError: string }
    | { Custom: number };  // program-specific error codes
```

### Full Usage Example (v2)

```ts
import {
    createSolanaRpc,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    compileTransaction,
    getBase64EncodedWireTransaction,
} from '@solana/kit';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');

// Build your transaction message, sign it, then:
const wireTransactionBytes = compileTransaction(signedTransaction);

const result = await rpc
    .simulateTransaction(
        getBase64EncodedWireTransaction(wireTransactionBytes),
        {
            encoding: 'base64',
            sigVerify: false,
            replaceRecentBlockhash: true,
            innerInstructions: true,
            accounts: {
                addresses: [
                    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // ATA
                    'So11111111111111111111111111111111111111112',     // WSOL mint
                ],
                encoding: 'base64',
            },
        },
    )
    .send();

// result.value has this shape:
// {
//   err: TransactionError | null,
//   logs: string[] | null,
//   returnData: { data: [string, 'base64']; programId: Address } | null,
//   unitsConsumed?: bigint,
//   accounts: [
//     { executable, lamports, owner, rentEpoch, space, data: [string, 'base64'] } | null,
//     { executable, lamports, owner, rentEpoch, space, data: [string, 'base64'] } | null,
//   ],
//   innerInstructions: [
//     { index: 0, instructions: [...] },
//   ],
//   replacementBlockhash: { blockhash: '...', lastValidBlockHeight: 123n },
// }
```

### Compute Unit Estimation Example (from @solana/kit source)

```ts
// This is the internal implementation of getComputeUnitEstimateForTransactionMessage
const { value: { err: transactionError, unitsConsumed } } =
    await rpc.simulateTransaction(wireTransactionBytes, {
        ...simulateConfig,
        encoding: 'base64',
        replaceRecentBlockhash: !isDurableNonceTransactionMessage,
        sigVerify: false,
    }).send();
```

---

## 2. `@solana/web3.js` (v1 legacy) — `connection.simulateTransaction()`

### Function Signature

```ts
class Connection {
    // Preferred (VersionedTransaction)
    simulateTransaction(
        transaction: VersionedTransaction,
        config?: SimulateTransactionConfig,
    ): Promise<RpcResponseAndContext<SimulatedTransactionResponse>>;

    // Deprecated (legacy Transaction)
    simulateTransaction(
        transactionOrMessage: Transaction | Message,
        signers?: Array<Signer>,
        includeAccounts?: boolean | Array<PublicKey>,
    ): Promise<RpcResponseAndContext<SimulatedTransactionResponse>>;
}
```

### Config

```ts
type SimulateTransactionConfig = {
    sigVerify?: boolean;
    replaceRecentBlockhash?: boolean;
    commitment?: Commitment;
    accounts?: {
        encoding: 'base64';
        addresses: string[];        // base58 addresses
    };
    minContextSlot?: number;
    innerInstructions?: boolean;
};
```

### Return Type

```ts
type RpcResponseAndContext<T> = {
    context: { slot: number };
    value: T;
};

type SimulatedTransactionResponse = {
    err: TransactionError | string | null;
    logs: string[] | null;
    accounts?: (SimulatedTransactionAccountInfo | null)[] | null;
    unitsConsumed?: number;  // NOTE: number, not bigint
    returnData?: TransactionReturnData | null;
    innerInstructions?: ParsedInnerInstruction[] | null;
};

type SimulatedTransactionAccountInfo = {
    executable: boolean;
    owner: string;              // NOTE: plain string, not branded Address
    lamports: number;           // NOTE: number, not bigint
    data: string[];             // e.g. ["base64data", "base64"]
    rentEpoch?: number;
};

type TransactionReturnData = {
    programId: string;
    data: [string, 'base64'];
};

type ParsedInnerInstruction = {
    index: number;
    instructions: (ParsedInstruction | PartiallyDecodedInstruction)[];
};
```

### Usage Example (v1)

```ts
import { Connection, VersionedTransaction } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

const result = await connection.simulateTransaction(
    versionedTransaction,
    {
        sigVerify: false,
        replaceRecentBlockhash: true,
        innerInstructions: true,
        accounts: {
            encoding: 'base64',
            addresses: ['ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'],
        },
    },
);

// result.context.slot === 12345
// result.value.err === null (success) or TransactionError
// result.value.logs === ['Program ... invoke [1]', ...]
// result.value.unitsConsumed === 150000
// result.value.accounts[0]?.data === ["AQID...", "base64"]
```

---

## 3. Can You Get a Diff of Account State Changes?

**No, not directly from simulation.**

The `simulateTransaction` RPC method only returns **post-simulation state** for accounts you
explicitly request via `config.accounts`. It does NOT return:
- Pre-simulation account data
- A diff of what changed
- Lamport balance changes (pre vs post)

### How to Compute a Diff Yourself

You must fetch the account state before simulation, then compare:

```ts
import { createSolanaRpc, getAddressEncoder, getBase64EncodedWireTransaction } from '@solana/kit';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const targetAccounts = [
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
];

// 1. Fetch pre-simulation state
const preState = await rpc
    .getMultipleAccounts(targetAccounts, { encoding: 'base64' })
    .send();

// 2. Simulate with account snapshots
const simResult = await rpc
    .simulateTransaction(base64Tx, {
        encoding: 'base64',
        accounts: { addresses: targetAccounts, encoding: 'base64' },
        replaceRecentBlockhash: true,
        innerInstructions: true,
    })
    .send();

// 3. Compare
for (let i = 0; i < targetAccounts.length; i++) {
    const pre = preState.value[i];
    const post = simResult.value.accounts?.[i];
    
    if (pre && post) {
        const preData = pre.data[0]; // base64 string
        const postData = post.data[0]; // base64 string
        
        if (preData !== postData) {
            console.log(`Account ${targetAccounts[i]} CHANGED`);
            // Decode both with your program-specific decoder
        }
        
        if (pre.lamports !== post.lamports) {
            console.log(`Lamports: ${pre.lamports} -> ${post.lamports}`);
        }
        
        if (pre.owner !== post.owner) {
            console.log(`Owner changed: ${pre.owner} -> ${post.owner}`);
        }
    }
}
```

### What DOES include pre/post data

The `getBlock` / `getTransaction` RPC methods return confirmed transaction metadata which includes:
```ts
{
    meta: {
        preBalances: bigint[];       // lamport balances before
        postBalances: bigint[];      // lamport balances after
        preTokenBalances?: ...;      // token balances before
        postTokenBalances?: ...;     // token balances after
    }
}
```

But this is only for **confirmed** transactions, not simulations.

---

## 4. Designing Typed Decoders for Simulation Results

### Key Design Decisions

1. **The `accounts` array is `(AccountInfo | null)[]`** — `null` means the account doesn't exist
2. **Account data is base64 encoded** — you need to decode it, then apply program-specific deserialization
3. **`err` can be `null` (success), a string, or a nested object** — the v1 type is looser (`string | ...`), v2 is stricter
4. **`unitsConsumed` is optional** — may not be present on older RPC nodes
5. **`innerInstructions` is only present if you set `innerInstructions: true`** in config
6. **`logs` is `null` when simulation fails before execution** (bad blockhash, sig verify failure)

### Recommended Decoder Architecture

```ts
// Core simulation result type (simplified for practical use)
interface SimulationResult {
    success: boolean;
    error?: SimError;
    logs: string[];
    unitsConsumed?: number;
    returnData?: {
        programId: string;
        data: Uint8Array;  // decoded from base64
    };
    innerInstructions?: InnerInstruction[];
    accountChanges?: AccountChange[];
}

interface AccountChange {
    address: string;
    before: { data: Uint8Array; lamports: bigint; owner: string } | null;
    after:  { data: Uint8Array; lamports: bigint; owner: string } | null;
    diff?: {
        dataChanged: boolean;
        lamportDelta: bigint;
        ownerChanged: boolean;
    };
}

// Usage
function decodeSimulationResult(
    raw: SimulatedTransactionResponse,
    preFetchedAccounts?: AccountInfo[],
): SimulationResult { ... }
```

### v1 vs v2 Key Differences for Decoder Design

| Aspect | v1 (`@solana/web3.js`) | v2 (`@solana/kit`) |
|---|---|---|
| `unitsConsumed` | `number` | `bigint` |
| `lamports` | `number` | `bigint` |
| `rentEpoch` | `number` (optional) | `bigint` |
| `owner` | `string` | `Address` (branded string) |
| `err` type | `TransactionError \| string \| null` | `TransactionError \| null` |
| Response wrapper | `{ context: { slot: number }; value: T }` | `SolanaRpcResponse<T>` (same shape, `bigint` slot) |
| Account data | `string[]` | `[Base64EncodedBytes, 'base64']` (tuple) |
| `space` field | not present | `bigint` |

---

## 5. JSON-RPC Wire Format Reference

The actual HTTP call made by both libraries:

```jsonc
// POST to https://api.mainnet-beta.solana.com
{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "simulateTransaction",
    "params": [
        "BASE64_ENCODED_WIRE_TRANSACTION",    // base64 of serialized tx
        {
            "encoding": "base64",
            "sigVerify": false,
            "replaceRecentBlockhash": true,
            "commitment": "confirmed",
            "innerInstructions": true,
            "accounts": {
                "addresses": ["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"],
                "encoding": "base64"
            },
            "minContextSlot": 250000000
        }
    ]
}
```

Response:
```jsonc
{
    "jsonrpc": "2.0",
    "result": {
        "context": { "slot": 250000123 },
        "value": {
            "err": null,
            "logs": [
                "Program ComputeBudget111111111111111111111111111111 invoke [1]",
                "Program ComputeBudget111111111111111111111111111111 success",
                "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]",
                "Program log: Instruction: Transfer",
                "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4645 of 200000 compute units",
                "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success"
            ],
            "unitsConsumed": 150000,
            "returnData": null,
            "accounts": [
                {
                    "data": ["AQIDBA==", "base64"],
                    "executable": false,
                    "lamports": 2039280,
                    "owner": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                    "rentEpoch": 0,
                    "space": 165
                }
            ],
            "innerInstructions": [
                {
                    "index": 2,
                    "instructions": [
                        {
                            "programIdIndex": 11,
                            "accounts": [0, 3],
                            "data": "3Bxs4t"
                        }
                    ]
                }
            ],
            "replacementBlockhash": {
                "blockhash": "GHtXQBsoZHVnNFa9YbAz9beT7xgZNhB3cWCF3BjHVdMn",
                "lastValidBlockHeight": 250000500
            }
        }
    }
}
```
