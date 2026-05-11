# Learning Tracks

Use this reference when teaching Solana, web3, or Better Sol concepts to developers. Adapt the track to the learner's background.

## Assess background first

Ask: "What is your development background?" Then select the track:

| Background | Start track | Prerequisites |
|---|---|---|
| Frontend (React, TypeScript) | Frontend to Solana | JavaScript async, HTTP APIs |
| Backend (Node.js, Python) | Backend to Solana | REST APIs, databases |
| EVM (Solidity, Ethereum) | EVM to Solana | Solidity, ethers.js/viem |
| Rust | Rust to Solana | Rust fundamentals |
| Complete beginner | Beginner | Basic programming |

## Beginner track

### Module 1: What is a blockchain?

- Distributed ledger where transactions are grouped into blocks
- Consensus mechanism: how nodes agree on the state (Solana uses Proof of History + Proof of Stake)
- State model: accounts hold data, programs hold logic
- Transactions: signed instructions that modify state

### Module 2: What makes Solana different?

- Speed: 400ms finality, 65,000+ transactions per second
- Cost: $0.00025 per transaction
- Monolithic execution: all programs share one global state (no sharding)
- Parallel execution: transactions touch different accounts simultaneously

### Module 3: Accounts

Every piece of data on Solana lives in an account. Accounts have:

- Address (public key)
- Owner (the program that can modify the data)
- Lamports (SOL balance, minimum rent-exempt balance required)
- Data (arbitrary bytes, interpreted by the owning program)

Key concept: programs are also accounts. A program account has executable data but no mutable state of its own.

### Module 4: Programs

Programs process instructions. An instruction specifies:

- The program to call
- The accounts to read or write
- The instruction data (arguments)

Solana programs are stateless. All state lives in accounts that the program owns.

### Module 5: Your first Better Sol program

Read `cookbook-recipes.md` for the counter example. Key concepts:

- `bs.account()` defines the data schema
- `.derive()` defines PDA seeds
- `bs.program()` wraps instructions
- `ix()` defines each instruction with accounts, args, constraints, and run logic

### Module 6: Your first client

Connect to Solana and interact with the program:

```ts
const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { counter } })
await sol.counter.increment({ counter: addr, amount: 5n })
```

## EVM to Solana track

### Key differences

| Concept | Ethereum | Solana |
|---|---|---|
| State model | Contracts hold state | Accounts hold state, programs are stateless |
| Execution | Sequential (EVM) | Parallel (SVM) |
| Accounts | Implicit (storage vars) | Explicit (must pass every account) |
| Gas | Variable, auction-based | Fixed fee + optional priority |
| Programs/smart contracts | Solidity, Vyper | Rust, TypeScript (Better Sol), Anchor |
| Address model | CREATE2 for contract addresses | PDAs derived from seeds |
| Composability | Contract calls | Cross-program invocations (CPIs) |
| Token standard | ERC-20 | SPL Token, Token-2022 |
| Transaction structure | Single contract call | Multiple instructions in one transaction |

### Mental model shift

1. **No implicit storage**. In Solidity, `mapping(address => uint256) public balances` just works. On Solana, you must create an account for each entry and pass it as an instruction argument.

2. **No msg.sender**. Instead, you pass a `Signer` account and check `account.isSigner` in the program.

3. **Parallel by default**. Transactions that touch different accounts run simultaneously. This is a performance feature but requires thinking about account contention.

4. **Multi-instruction transactions**. A Solana transaction can include multiple instructions to different programs. This is the normal way to compose operations, not an advanced pattern.

### Solidity to Better Sol mapping

```solidity
// Solidity
contract Counter {
    uint256 public count;
    address public authority;
    
    function increment(uint256 amount) public {
        require(msg.sender == authority);
        count += amount;
    }
}
```

```ts
// Better Sol
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
})

export const counter = bs.program({ name: "counter", address: "<key>" }, (ix) => ({
  increment: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, ctx) => {
      ctx.require(counter.authority === authority, "Unauthorized")
    },
    run: ({ counter }, { amount }) => { counter.count += amount },
  }),
}))
```

## Frontend to Solana track

### Module 1: Wallet connection

Use `@solana/wallet-adapter-react` or `@solana/react-hooks`:

```tsx
import { useWallet } from "@solana/wallet-adapter-react"

function App() {
  const { connected, connect, disconnect, publicKey } = useWallet()
  return connected
    ? <p>Connected: {publicKey.toBase58()}</p>
    : <button onClick={connect}>Connect Wallet</button>
}
```

### Module 2: Reading on-chain data

```tsx
const sol = await createClient(walletAdapter)
const account = await sol.counter.accounts.Counter.fetch(addr)
```

### Module 3: Sending transactions

```tsx
const signature = await sol.counter.increment({ counter: addr, amount: 5n })
```

### Module 4: State management

Use TanStack Query to cache on-chain data. See `dapp-state-management.md` for patterns.

## Backend to Solana track

### Module 1: RPC basics

```ts
const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { counter } })
const balance = await sol.getBalance(address)
const account = await sol.counter.accounts.Counter.fetch(addr)
```

### Module 2: Building API endpoints

```ts
app.get("/api/counter/:address", async (req, res) => {
  const account = await sol.counter.accounts.Counter.fetch(req.params.address)
  res.json({ count: account.count, authority: account.authority })
})
```

### Module 3: Webhooks and indexing

See `data-pipelines.md` for webhook processing and indexing patterns.

## Exercise progression

| Exercise | Concepts tested |
|---|---|
| Counter program | Accounts, instructions, PDAs, typed client |
| Token transfer | SPL Token, ATAs, token operations |
| Escrow program | Multi-account state, signer checks, constraints |
| Token vault | Deposits, withdrawals, time locks |
| Governance voting | Proposals, one-vote-per-voter, deadlines |
| Rewards distribution | Token CPI, batch operations, idempotency |

Each exercise has a specification in `cookbook-recipes.md`.

## Teaching rules

- Use runnable code. Every concept must be demonstrated with a working example.
- Introduce one concept at a time: concept, Better Sol mapping, code, exercise.
- Correct misconceptions directly. Do not let wrong mental models persist.
- Contrast with the learner's existing framework (Anchor for Rust devs, EVM for Solidity devs, REST for backend devs) only when it helps understanding.
- Never explain Solana internals (sealevel, geyser, tower BFT) unless the learner asks. Start with what they need to build.

## Related

- `cookbook-recipes.md` for runnable code examples and exercises.
- `solana-knowledge-base.md` for Solana fundamentals reference.
- `web3-fundamentals.md` for blockchain and cryptography concepts.
- `program-patterns.md` for program definition patterns.
