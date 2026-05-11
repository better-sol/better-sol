# Project Scaffolding

Use this reference when setting up a new Better Sol project from scratch. It covers three project types: web dApps, mobile dApps, and backend-only programs.

## Step 0: Analyze what to build

Before scaffolding, determine the project type based on what the user asked to build:

| Signals | Project type | Scaffold |
|---|---|---|
| Users connect wallets, see balances, sign transactions, interact with a UI | **Web dApp** | Vite + React + Tailwind + Wallet Adapter |
| Users interact on mobile, scan QR codes, native wallet integration | **Mobile dApp** | Expo + React Native + Mobile Wallet Adapter |
| Cron jobs, indexer, bot, data pipeline, no user-facing UI | **Backend** | Better Sol init only, no frontend |

When in doubt, scaffold a web dApp. It covers the most common case and includes the full client + wallet setup.

## Step 1: Initialize the Better Sol project

Every project type starts here. This creates the program scaffolding, payer keypair, and gitignore.

First, install the latest alpha versions of all Better Sol packages:

```bash
mkdir my-project && cd my-project
git init
bun init -y

bun add better-sol@alpha
bun add -d @better-sol/test@alpha
```

Both `better-sol` and `@better-sol/test` must be from the same alpha release. Version mismatches cause type errors.

Now initialize the project:

```bash
bunx @better-sol/cli@alpha init --yes --json
```

After init, the project has:

```
my-project/
  keypair.json          # payer keypair (do not commit)
  programs/             # program definitions go here
  .better-sol/          # program keypairs (do not commit)
  .gitignore
```

Then create your first program:

```bash
bunx @better-sol/cli@alpha create my-program --yes --json
```

## Step 2: Scaffold the project type

### Web dApp

#### Create Vite + React + TypeScript

```bash
bunx create-vite@latest app --template react-ts
```

This creates `app/` with React, TypeScript, and Vite. The Better Sol program lives in the repo root at `programs/`, and the web app lives in `app/`.

#### Install dependencies

```bash
cd app
bun install
bun add better-sol @anza-xyz/wallet-adapter @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-base @solana/web3.js
bun add -d tailwindcss @tailwindcss/vite
cd ..
```

#### Configure Tailwind CSS v4

Update `app/vite.config.ts`:

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
})
```

Replace the contents of `app/src/index.css`:

```css
@import "tailwindcss";
```

#### Create wallet context provider

Create `app/src/wallet-provider.tsx`:

```tsx
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base"
import { clusterApiUrl } from "@solana/web3.js"
import { type ReactNode, useMemo } from "react"

import "@solana/wallet-adapter-react-ui/styles.css"

const WalletContextProvider = ({ children }: { children: ReactNode }) => {
  const network = WalletAdapterNetwork.Devnet
  const endpoint = useMemo(() => clusterApiUrl(network), [network])
  const wallets = useMemo(() => [], [network])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default WalletContextProvider
```

The empty `wallets` array is intentional. Wallets that support the Solana Wallet Standard (Phantom, Solflare, Backpack, etc.) are detected automatically. You only need to add explicit adapters for wallets that do not support the standard.

#### Wire into the app

Update `app/src/App.tsx`:

```tsx
import WalletContextProvider from "./wallet-provider"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"

function App() {
  return (
    <WalletContextProvider>
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-8">
        <h1 className="text-4xl font-bold">My Solana dApp</h1>
        <WalletMultiButton />
      </div>
    </WalletContextProvider>
  )
}

export default App
```

#### Use the Better Sol client

Create `app/src/client.ts`:

```ts
import { betterSol, keypairFile } from "better-sol"
import { myProgram } from "../programs/my-program"

export const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("../keypair.json"),
  programs: { myProgram },
})
```

In the browser (wallet-connected), use the wallet adapter signer:

```ts
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { betterSol } from "better-sol"
import { walletAdapter } from "better-sol/wallets"
import { myProgram } from "../../programs/my-program"

function MyComponent() {
  const wallet = useWallet()

  const handleClick = async () => {
    if (!wallet.connected) return

    const baseSol = await betterSol({
      cluster: "devnet",
      programs: { myProgram },
    })

    const sol = await baseSol.withSigner(walletAdapter(wallet))
    const address = await sol.myProgram.accounts.MyAccount.derive({
      authority: sol.payer,
    })

    await sol.myProgram.initialize({ myAccount: address, initialValue: 0n })
  }

  return <button onClick={handleClick}>Initialize</button>
}
```

#### Run the dev server

```bash
cd app
bun run dev
```

#### Full web project structure

```
my-project/
  app/                          # Vite + React web app
    src/
      wallet-provider.tsx       # ConnectionProvider + WalletProvider
      client.ts                 # Better Sol client (server-side)
      App.tsx                   # App entry with wallet button
      index.css                 # Tailwind import
    vite.config.ts              # Vite + Tailwind plugin
    package.json
    tsconfig.json
    index.html
  programs/
    my-program.ts               # Better Sol program definition
  keypair.json                  # payer keypair (gitignored)
  .better-sol/                  # program keypairs (gitignored)
  .gitignore
```

### Mobile dApp

#### Create Expo project

```bash
npx create-expo-app@latest app --template default@sdk-55
```

#### Install dependencies

```bash
cd app
npx expo install @solana/web3.js @solana/mobile-wallet-adapter-protocol @solana/mobile-wallet-adapter-protocol-web3js react-native-provider
bun add better-sol
cd ..
```

#### Create mobile wallet connection

Create `app/components/WalletButton.tsx`:

```tsx
import { StyleSheet, Text, Pressable } from "react-native"
import { useAuthorization } from "../utils/useAuthorization"

export function WalletButton() {
  const { authorizeSession, selectedAccount } = useAuthorization()

  const handlePress = async () => {
    if (selectedAccount) {
      return
    }
    await authorizeSession()
  }

  return (
    <Pressable
      style={styles.button}
      onPress={handlePress}
    >
      <Text style={styles.text}>
        {selectedAccount
          ? `${selectedAccount.address.slice(0, 4)}...${selectedAccount.address.slice(-4)}`
          : "Connect Wallet"}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#9945FF",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
})
```

Follow the Solana Mobile Wallet Adapter protocol for the full `useAuthorization` hook implementation. Refer to the `@solana/mobile-wallet-adapter-protocol-web3js` package for the correct transact signing flow.

#### Run the Expo dev server

```bash
cd app
npx expo start
```

### Backend-only

No frontend scaffolding needed. The project structure from Step 1 is sufficient.

Install the Better Sol SDK and test package:

```bash
bun add better-sol
bun add -d @better-sol/test
```

Write your program in `programs/`, tests alongside it, and deploy with:

```bash
bunx @better-sol/cli@alpha deploy --program my-program --cluster devnet
```

## Step 3: Write the program

Regardless of project type, the program definition lives in `programs/`:

```ts
import { bs } from "better-sol/program"

const MyAccount = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["my-account", seed.authority])

export const myProgram = bs.program(
  {
    name: "my-program",
    address: "YOUR_PROGRAM_ADDRESS",
    accounts: { MyAccount },
    errors: {
      Unauthorized: "Only the authority can perform this action",
    },
  },
  (ix) => ({
    initialize: ix({
      accounts: {
        myAccount: bs.init(MyAccount),
        authority: bs.signer(),
      },
      args: { initialValue: bs.u64() },
      run: ({ myAccount, authority }, { initialValue }) => {
        myAccount.count = initialValue
        myAccount.authority = authority
      },
    }),
    increment: ix({
      accounts: {
        myAccount: bs.mut(MyAccount),
        authority: bs.signer(),
      },
      args: { amount: bs.u64() },
      run: ({ myAccount, authority }, { amount }, ctx) => {
        ctx.require(myAccount.authority === authority, "Unauthorized")
        myAccount.count += amount
      },
    }),
  }),
)
```

## Step 4: Test

Write tests with `@better-sol/test`:

```ts
import { describe, expect, test } from "bun:test"
import { createTestContext } from "@better-sol/test"
import { myProgram } from "./programs/my-program"

describe("my-program", () => {
  test("initialize and increment", async () => {
    const ctx = await createTestContext({ programs: { myProgram } })
    const address = await ctx.myProgram.accounts.MyAccount.derive({
      authority: ctx.payer,
    })

    await ctx.myProgram.initialize({ myAccount: address, initialValue: 0n })
    await ctx.myProgram.increment({ myAccount: address, amount: 5n })

    const account = await ctx.myProgram.accounts.MyAccount.fetch(address)
    expect(account?.count).toBe(5n)
  })
})
```

Tests require a compiled binary. Compile first:

```bash
bunx @better-sol/cli@alpha deploy --program my-program --dry-run
bunx @better-sol/cli@alpha deploy --program my-program --cluster devnet
```

Then run tests:

```bash
bun test
```

## Step 5: Deploy

```bash
bunx @better-sol/cli@alpha deploy --cluster devnet
```

If the airdrop fails due to rate limiting, the CLI will print a link to https://faucet.solana.com/ with your address pre-filled. Fund there and re-run.
