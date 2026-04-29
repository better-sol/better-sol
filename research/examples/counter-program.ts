// ============================================================
// Counter Program — The "Hello World" of Solana
//
// This is what a developer sees FIRST when they try our library.
// It should be dead simple, instantly understandable.
//
// Compare to Anchor (Rust):
//   - Anchor: ~80 lines across 3 files (lib.rs, mod.rs, Cargo.toml)
//   - Ours:   ~30 lines in ONE file
//
// And the same file is the typed client SDK. Zero extra code.
// ============================================================

import { program, account, ix, u64, bool, pubkey, p } from '@solana-kit/program'

// Define the counter account — like a Zod schema
const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).seeds('counter', '{authority}')

// Define the program — flat instruction map
export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', {

  // Create a new counter
  initialize: ix({
    accounts: {
      counter: p.init(Counter),
      authority: p.signer(),
    },
    args: { initialValue: u64 },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
      counter.isActive = true
    },
  }),

  // Increment the counter
  increment: ix({
    accounts: {
      counter: p.mut(Counter),
      authority: p.signer(),
    },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }) => {
      require(authority === counter.authority, 'Only the creator can increment')
      require(counter.isActive, 'Counter is not active')
      counter.count += amount
    },
  }),

  // Decrement the counter
  decrement: ix({
    accounts: {
      counter: p.mut(Counter),
      authority: p.signer(),
    },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }) => {
      require(authority === counter.authority, 'Only the creator can decrement')
      require(counter.isActive, 'Counter is not active')
      require(counter.count >= amount, 'Counter would go below zero')
      counter.count -= amount
    },
  }),

  // Toggle the active status
  toggle: ix({
    accounts: {
      counter: p.mut(Counter),
      authority: p.signer(),
    },
    run: ({ counter, authority }) => {
      require(authority === counter.authority, 'Only the creator can toggle')
      counter.isActive = !counter.isActive
    },
  }),

  // Close the counter and recover rent
  close: ix({
    accounts: {
      counter: p.close(Counter, 'authority'),
      authority: p.signer(),
    },
    run: ({ authority }) => {
      // Account is closed automatically by p.close()
      // This runs any cleanup logic before closure
    },
  }),
})


// ══════════════════════════════════════════
// Client usage (same file, zero extra code)
// ══════════════════════════════════════════

import { createClient } from '@solana-kit/sdk'

const client = createClient({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { counter },
})

const payer = client.payer

// Derive the counter PDA from seed definition
const counterAddr = counter.accounts.Counter.derive({ authority: payer })

// Create a counter starting at 42
await client.counter.initialize({
  counter: counterAddr,
  authority: payer,
  initialValue: 42n,
})

// Increment by 10
await client.counter.increment({
  counter: counterAddr,
  authority: payer,
  amount: 10n,
})

// Fetch the account (fully typed)
const data = await counter.accounts.Counter.fetch(counterAddr)
console.log(data.count)     // 52n
console.log(data.isActive)  // true

// Decrement by 2
await client.counter.decrement({
  counter: counterAddr,
  authority: payer,
  amount: 2n,
})

// Close it
await client.counter.close({
  counter: counterAddr,
  authority: payer,
})
