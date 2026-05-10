# Solana Knowledge Base

Use this reference when teaching Solana fundamentals or answering conceptual questions.

## Accounts

Accounts store data and lamports. Programs are accounts too, but executable. Most application state lives in non-executable accounts owned by a program.

Important account properties:

- address
- owner program
- lamports
- data
- executable flag
- rent-exemption status

Better Sol mapping: `bs.account({...})` defines the data shape for program-owned state accounts.

## Programs

Programs are stateless executable code. They receive instructions, accounts, and arguments. They can read and mutate accounts they own or interact with other programs through CPIs.

Better Sol mapping: `bs.program({...}, ix => ({ ... }))` defines instruction handlers.

## Instructions

An instruction is a call into a program. It includes:

- program ID
- account list
- instruction data

Better Sol mapping: each `ix({...})` defines required accounts, args, and run logic.

## Signers

A signer proves a wallet approved the transaction. A signer is not automatically an admin or account owner. Programs must compare signer keys to stored authority fields when authorization matters.

Better Sol mapping: `bs.signer()` gives a signer address in the run body.

## PDAs

Program Derived Addresses are deterministic addresses derived from seeds and a program ID. They let programs own predictable accounts and sign CPIs through runtime seed verification.

Better Sol mapping: `.derive(seed => ["namespace", seed.authority])` defines PDA seed structure and enables typed client derivation.

## CPIs

Cross-Program Invocations let one program call another program, such as the token program. CPI safety requires validating target programs and accounts.

Better Sol mapping: `cpi.token.*` helpers represent supported token CPI calls.

## Rent and account creation

Creating accounts requires lamports for rent exemption and allocation. Deriving an address does not create the account; an init instruction creates it.

Better Sol mapping: `bs.init(Account)` creates a new account and `bs.initIfNeeded(Account)` creates only when missing, with reinitialization risk to review.

## EVM comparison

- EVM contract storage → Solana state accounts.
- `msg.sender` → explicit signer account.
- contract address → program ID.
- mapping key → PDA seeds.
- ABI → Better Sol program definition or external IDL.
- internal call → CPI.

## Common beginner mistakes

- Thinking a program stores state inside itself.
- Forgetting to pass every account an instruction needs.
- Treating signer as authority without checking stored authority.
- Duplicating PDA derivation incorrectly in the client.
- Assuming devnet deployment means production readiness.

## Related

- `web3-fundamentals.md` for broader blockchain concepts: consensus, execution environments, state models.
- `sdk-reference.md` for Better Sol API details mapped to these concepts.
