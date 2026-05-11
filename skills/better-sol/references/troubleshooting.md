# Troubleshooting

Use this reference when a Solana program fails to compile, deploy, or execute, or when transactions fail with unexpected errors.

## Compilation failures

### "Cannot find module 'better-sol'"

Install the package:

```bash
bun install better-sol@alpha
```

### "Cannot find module '@better-sol/test'"

Install the test package as a dev dependency:

```bash
bun install -d @better-sol/test@alpha
```

### Type errors on `bs.account()`, `bs.program()`, `bs.instruction()`

Ensure the import is from `better-sol/program`:

```ts
import { bs } from "better-sol/program"
```

Not from `better-sol` (which exports the runtime client, not the program DSL).

### "Property 'derive' does not exist on type"

The `.derive()` method exists on account builders returned by `bs.account()`. It does not exist on the account type itself. Call it on the builder:

```ts
const Counter = bs.account({...}).derive((seed) => ["counter", seed.authority])
```

### "Circular dependency detected"

Program definitions must not import from each other at the module level. If two programs reference each other's accounts, extract the shared account definitions into a separate file.

## Deployment failures

### "Rate limited: 20 compiles per hour"

Get an API key from the dashboard and authenticate:

```bash
npx @better-sol/cli@alpha login <api-key>
```

This raises the limit to 100 compiles per hour.

### "Program too large"

Solana programs have a maximum size of 3,680 bytes for the deployed buffer. Reduce program complexity:

- Remove unused instructions and accounts
- Simplify constraint logic
- Split into multiple programs if the program exceeds limits

### "Insufficient SOL for deployment"

Fund the payer wallet:

```bash
solana airdrop 2 <wallet-address> --url devnet
```

Or use the CLI:

```bash
npx @better-sol/cli@alpha airdrop
```

### "Program already deployed at this address"

Deploying to the same program address requires an upgrade. The CLI handles this automatically if the keypair matches. If you get this error with a new keypair, the address is already taken. Generate a new program keypair.

### "Keypair file not found"

The CLI looks for `keypair.json` in the project root, or reads from `better-sol.config.ts`. Ensure one exists:

```bash
ls keypair.json
cat better-sol.config.ts
```

## Transaction failures

### "Simulation failed"

The transaction was simulated before submission and failed. Common causes:

1. **Uninitialized account**: the account does not exist on-chain. Call the initialize instruction first.

2. **Insufficient funds**: the payer does not have enough SOL for the transaction fee plus rent. Check the balance:
   ```ts
   const balance = await sol.getBalance(sol.payer)
   ```

3. **Account not writable**: the instruction expects a writable account but received a read-only reference. Check `bs.mut()` vs `bs.read()` in the instruction definition.

4. **Wrong account owner**: the account exists but is owned by a different program. This happens when passing system accounts where program accounts are expected.

5. **Custom program error**: the program threw a named error. Parse it:
   ```ts
   try {
     await sol.counter.increment({...})
   } catch (error) {
     if (error instanceof ProgramError) {
       console.log(error.name)    // e.g., "UnauthorizedAuthority"
       console.log(error.code)    // e.g., 6001
       console.log(error.message) // human-readable description
     }
   }
   ```

### "Blockhash not found"

The transaction's recent blockhash expired. This happens when there is a delay between building and submitting the transaction. The Better Sol client handles blockhash fetching automatically. If it persists:

- Retry the transaction
- Check the RPC endpoint is responsive
- Use a dedicated RPC provider instead of the public endpoint

### "Transaction timed out"

The transaction was submitted but not confirmed within the timeout. Check:

- Network congestion (check solana.com for status)
- RPC provider health
- Whether the transaction actually succeeded by looking up the signature:
  ```ts
  const status = await sol.rpc.getTransactionSignatureStatus(signature)
  ```

### "Custom program error: 0x1"

Generic program error without a name. This usually means the program panicked or the error is not in the program's error map. Check that all errors in the program are defined in the `errors` map.

### "Already processed"

The transaction signature already exists on-chain. This is not an error; the transaction succeeded. Look up the confirmation instead of resubmitting.

## Account issues

### "Account does not exist"

The account at the given address has not been created. Possible causes:

- PDA derivation uses different seeds than expected
- The initialize instruction was not called
- The account was closed (zeroed out) by a previous instruction

Verify the address:

```ts
const expected = await sol.counter.accounts.Counter.derive({
  authority: sol.payer,
})
console.log("Expected address:", expected)

const accountInfo = await sol.rpc.getAccountInfo(expected)
console.log("Exists:", accountInfo !== null)
```

### "Account data too small"

The on-chain account has fewer bytes than the program expects. This happens after upgrading a program that adds new fields to an account. Existing accounts must be migrated.

### "Account data deserialization failed"

The raw bytes do not match the account schema. Causes:

- The account was written by a different program version
- The account was closed and the space was reallocated to a different program
- The PDA derivation is wrong, pointing to an unrelated account

## Client issues

### "Program not found in client"

The program was not registered when creating the client:

```ts
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter, marketplace }, // must include all programs used
})
```

### "Cannot read property 'derive' of undefined"

The account builder was not registered in the program definition. Ensure the account is defined in the program and exported:

```ts
export const counter = bs.program({ name: "counter", address: "<key>" }, (ix) => ({
  initialize: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    run: ({ counter }) => {
      counter.count = 0n
      counter.authority = authority
    },
  }),
}))
```

### Wallet not signing

If using a browser wallet adapter:

- Ensure the wallet is connected before calling instruction methods
- Check that the wallet supports the `signTransaction` method
- Verify the wallet is on the correct cluster
- Try disconnecting and reconnecting

## Test failures

### "Program binary not found"

LiteSVM requires the compiled `.so` binary. Deploy first to generate it:

```bash
npx @better-sol/cli@alpha deploy
```

The binary is cached at `.better-sol/cache/<program>.so`. Tests load from this path.

### "LiteSVM: account not found"

The test tries to access an account that was not created. Either:

- Call the initialize instruction in the test setup
- Create the account manually in the test context

### "Test timeout"

LiteSVM tests should be fast (< 100ms per test). If tests are timing out:

- Check for infinite loops in program logic
- Ensure the test context is created once and reused, not per-test
- Increase the timeout if running many tests: `test("...", async () => {...}, { timeout: 10000 })`

## RPC issues

### "429 Too Many Requests"

Rate limited by the RPC provider. Mitigations:

- Use a dedicated RPC provider (Helius, Triton, Quicknode)
- Batch requests with `getMultipleAccounts`
- Implement request deduplication
- Cache read-only data
- Reduce polling frequency

### "Connection refused"

The RPC endpoint is unreachable. Check:

- The URL is correct (including `https://` prefix)
- The cluster matches (devnet URL for devnet program)
- No firewall blocking the request
- The RPC provider is not experiencing an outage

## Related

- `sdk-reference.md` for the complete API reference with types and signatures.
- `program-patterns.md` for correct account and instruction definition patterns.
- `client-testing-deploy.md` for deployment and testing workflows.
