import {
  program, account,
  u64, u8, i64, pubkey, string, bytes, array,
  p, token, sol,
} from 'better-sol/program'

const Vault = account({
  authority: pubkey,
  mint: pubkey,
  balance: u64,
  depositCount: u64,
  name: string,
  data: bytes,
  tag: u8,
  flags: u8,
  createdAt: i64,
  history: array(u64, 16),
  bump: u8,
}).derive((seed) => ["vault", seed.authority, seed.mint])

export const showcase = program({
  name: 'showcase',
  address: 'FxRr5uqM4tVX2kE2m2VjBZ6KkQnC3bFjC7hY5AhRdsQ',
  errors: {
    Unauthorized: 'Not authorized',
    InvalidAmount: 'Amount must be greater than zero',
    InsufficientBalance: 'Insufficient balance',
    VaultFull: 'Vault history is full',
  },
  events: {
    Deposited: { authority: pubkey, amount: u64 },
    Withdrawn: { authority: pubkey, amount: u64 },
  },
  }, ix => ({

    initVault: ix({
      accounts: {
        vault: p.create(Vault),
        mint: p.mint(),
        authority: p.signer(),
        systemProgram: p.systemProgram(),
      },
      args: { name: string },
      run: ({ vault, mint, authority }, { name }) => {
        vault.authority = authority
        vault.mint = mint.key
        vault.balance = 0n
        vault.depositCount = 0n
        vault.name = name
        vault.data = new Uint8Array([0])
        vault.tag = 1
        vault.flags = 0
        vault.createdAt = sol.timestamp()
        vault.bump = 0
        for (let i = 0; i < 16; i++) {
          vault.history[i] = 0n
        }
      },
    }),

    deposit: ix({
      accounts: {
        vault: p.mut(Vault),
        tokenAccount: p.tokenAccount().mut(),
        vaultTokenAccount: p.tokenAccount().mut(),
        authority: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: ({ vault, tokenAccount, vaultTokenAccount, authority }, { amount }, ctx) => {
        ctx.require(amount > 0n, 'InvalidAmount')
        ctx.require(authority === vault.authority, 'Unauthorized')

        token.transfer({ from: tokenAccount, to: vaultTokenAccount, authority, amount })

        const index = vault.depositCount
        if (index < 16) {
          vault.history[index] = amount
        }

        vault.balance += amount
        vault.depositCount += 1n

        ctx.emit('Deposited', { authority, amount })
      },
    }),

    depositT22: ix({
      accounts: {
        vault: p.mut(Vault),
        tokenAccount: p.tokenAccount().mut(),
        vaultTokenAccount: p.tokenAccount().mut(),
        mint: p.mint(),
        authority: p.signer(),
        tokenProgram: p.token2022Program(),
      },
      args: { amount: u64, decimals: u8 },
      run: ({ vault, tokenAccount, vaultTokenAccount, mint, authority }, { amount, decimals }, ctx) => {
        ctx.require(amount > 0n, 'InvalidAmount')
        ctx.require(authority === vault.authority, 'Unauthorized')

        token.transferChecked({ from: tokenAccount, to: vaultTokenAccount, mint, authority, amount, decimals })

        vault.balance += amount
        ctx.emit('Deposited', { authority, amount })
      },
    }),

    withdraw: ix({
      accounts: {
        vault: p.mut(Vault),
        tokenAccount: p.tokenAccount().mut(),
        vaultTokenAccount: p.tokenAccount().mut(),
        authority: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: ({ vault, tokenAccount, vaultTokenAccount, authority }, { amount }, ctx) => {
        ctx.require(amount > 0n, 'InvalidAmount')
        ctx.require(authority === vault.authority, 'Unauthorized')
        ctx.require(vault.balance >= amount, 'InsufficientBalance')

        token.transfer({ from: vaultTokenAccount, to: tokenAccount, authority, amount })

        vault.balance -= amount
        ctx.emit('Withdrawn', { authority, amount })
      },
    }),

    batchDeposit: ix({
      accounts: {
        vault: p.mut(Vault),
        source1: p.tokenAccount().mut(),
        source2: p.tokenAccount().mut(),
        authority: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount1: u64, amount2: u64 },
      run: ({ vault, source1, source2, authority }, { amount1, amount2 }, ctx) => {
        ctx.require(authority === vault.authority, 'Unauthorized')
        ctx.require(amount1 > 0n, 'InvalidAmount')
        ctx.require(amount2 > 0n, 'InvalidAmount')

        token.transfer({ from: source1, to: source2, authority, amount: amount1 })
        token.transfer({ from: source2, to: source1, authority, amount: amount2 })

        vault.balance += amount1 + amount2
        ctx.emit('Deposited', { authority, amount: amount1 + amount2 })
      },
    }),

    closeVault: ix({
      accounts: {
        vault: p.close(Vault, 'authority'),
        authority: p.signer(),
      },
      run: ({ vault, authority }, ctx) => {
        ctx.require(authority === vault.authority, 'Unauthorized')
        ctx.require(vault.balance === 0n, 'InsufficientBalance')
      },
    }),

    logState: ix({
      accounts: {
        vault: p.mut(Vault),
        authority: p.signer(),
      },
      run: ({ vault, authority }, ctx) => {
        ctx.require(authority === vault.authority, 'Unauthorized')
        ctx.log('balance {}', vault.balance)
        ctx.log('deposits {}', vault.depositCount)
        vault.tag = 2
      },
    }),

    mintToVault: ix({
      accounts: {
        vault: p.mut(Vault),
        mint: p.mint().mut(),
        vaultTokenAccount: p.tokenAccount().mut(),
        authority: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: ({ vault, mint, vaultTokenAccount, authority }, { amount }, ctx) => {
        ctx.require(authority === vault.authority, 'Unauthorized')
        token.mintTo({ mint, to: vaultTokenAccount, authority, amount })
        vault.balance += amount
        ctx.emit('Deposited', { authority, amount })
      },
    }),

    burnFromVault: ix({
      accounts: {
        vault: p.mut(Vault),
        mint: p.mint(),
        vaultTokenAccount: p.tokenAccount().mut(),
        authority: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amount: u64 },
      run: ({ vault, mint, vaultTokenAccount, authority }, { amount }, ctx) => {
        ctx.require(amount > 0n, 'InvalidAmount')
        ctx.require(authority === vault.authority, 'Unauthorized')
        ctx.require(vault.balance >= amount, 'InsufficientBalance')
        token.burn({ from: vaultTokenAccount, mint, authority, amount })
        vault.balance -= amount
        ctx.emit('Withdrawn', { authority, amount })
      },
    }),

}))
