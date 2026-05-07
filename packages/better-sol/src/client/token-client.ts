import { address as kitAddress, type TransactionSigner, type Signature, type Address as KitAddress, flattenInstructionPlan } from "@solana/kit";
import { findAssociatedTokenPda, fetchMaybeMint, fetchMaybeToken, getCreateAssociatedTokenIdempotentInstructionAsync, getCreateMintInstructionPlan, getMintToCheckedInstruction, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import type { AddressInput, KitRpc, KitRpcSubscriptions, SignedTransaction, TokenClient } from "./types.ts";
import { TOKEN_2022_PROGRAM_ADDRESS } from "./types.ts";
import { requireSigner, createGeneratedSigner } from "./signer.ts";
import { buildAndSignTransaction, sendAndConfirm, type NonceConfig, type TransactionCallback } from "./transaction.ts";

export function buildTokenClient(
  rpc: KitRpc,
  signer: TransactionSigner | undefined,
  rpcSubscriptions: KitRpcSubscriptions | undefined,
  commitment: "processed" | "confirmed" | "finalized",
  tokenProgramAddress: KitAddress,
  nonceConfig: NonceConfig | undefined,
  onConfirmed: TransactionCallback,
): TokenClient {
  const deriveAtaAddr = async (owner: AddressInput, mint: AddressInput): Promise<KitAddress> => {
    const [ata] = await findAssociatedTokenPda({ owner: kitAddress(owner), tokenProgram: kitAddress(tokenProgramAddress), mint: kitAddress(mint) });
    return ata;
  };
  const sendFn = async (tx: SignedTransaction): Promise<Signature> => {
    return await sendAndConfirm(tx, rpc, rpcSubscriptions, onConfirmed, commitment);
  };
  return {
    getATA: async (params) => await deriveAtaAddr(params.owner, params.mint),
    createMint: async (params) => {
      const activeSigner = requireSigner(signer);
      const mint = await createGeneratedSigner();
      const plan = getCreateMintInstructionPlan({
        payer: activeSigner,
        newMint: mint,
        decimals: params.decimals,
        mintAuthority: kitAddress(params.authority ?? activeSigner.address),
        freezeAuthority: params.freezeAuthority === undefined ? null : params.freezeAuthority === null ? null : kitAddress(params.freezeAuthority),
      }, { tokenProgram: kitAddress(tokenProgramAddress) });
      const instructions = flattenInstructionPlan(plan).flatMap((leaf) => leaf.kind === "single" ? [leaf.instruction] : []);
      const signedTx = await buildAndSignTransaction(instructions, rpc, activeSigner, commitment, nonceConfig);
      const sig = await sendFn(signedTx);
      return { mint: mint.address, mintSigner: mint, signature: sig };
    },
    mintTo: async (params) => {
      const activeSigner = requireSigner(signer);
      const mint = kitAddress(params.mint);
      const owner = kitAddress(params.to);
      const ata = kitAddress(await deriveAtaAddr(params.to, params.mint));
      const decimals = params.decimals ?? await fetchMintDecimals(rpc, params.mint, tokenProgramAddress);
      const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: activeSigner, owner, mint, tokenProgram: kitAddress(tokenProgramAddress) });
      const mintIx = getMintToCheckedInstruction({ mint, token: ata, mintAuthority: activeSigner, amount: params.amount, decimals }, { programAddress: kitAddress(tokenProgramAddress) });
      const signedTx = await buildAndSignTransaction([createAtaIx, mintIx], rpc, activeSigner, commitment, nonceConfig);
      return await sendFn(signedTx);
    },
    transfer: async (params) => {
      const activeSigner = requireSigner(signer);
      const mint = kitAddress(params.mint);
      const sourceOwner = params.from ?? activeSigner.address;
      if (sourceOwner !== activeSigner.address) throw new Error("Token transfer source must match the active signer. Use sol.withSigner() for another owner.");
      const source = kitAddress(await deriveAtaAddr(sourceOwner, params.mint));
      const destination = kitAddress(await deriveAtaAddr(params.to, params.mint));
      const decimals = params.decimals ?? await fetchMintDecimals(rpc, params.mint, tokenProgramAddress);
      const createDestinationIx = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: activeSigner, owner: kitAddress(params.to), mint, tokenProgram: kitAddress(tokenProgramAddress) });
      const transferIx = getTransferCheckedInstruction({ source, mint, destination, authority: activeSigner, amount: params.amount, decimals }, { programAddress: kitAddress(tokenProgramAddress) });
      const signedTx = await buildAndSignTransaction([createDestinationIx, transferIx], rpc, activeSigner, commitment, nonceConfig);
      return await sendFn(signedTx);
    },
    getBalance: async (params) => {
      const ata = await deriveAtaAddr(params.owner, params.mint);
      const tokenAccount = await fetchMaybeToken(rpc, kitAddress(ata), { commitment });
      return tokenAccount.exists ? tokenAccount.data.amount : 0n;
    },
  };
}

async function fetchMintDecimals(rpc: KitRpc, mint: AddressInput, tokenProgramAddress: KitAddress): Promise<number> {
  const mintAccount = await fetchMaybeMint(rpc, kitAddress(mint));
  if (!mintAccount.exists) throw new Error(`Mint not found: ${mint}`);
  if (mintAccount.programAddress === kitAddress(tokenProgramAddress)) return mintAccount.data.decimals;
  if (tokenProgramAddress === kitAddress(TOKEN_PROGRAM_ADDRESS) && mintAccount.programAddress === kitAddress(TOKEN_2022_PROGRAM_ADDRESS)) return mintAccount.data.decimals;
  throw new Error(`Mint ${mint} is not owned by token program ${tokenProgramAddress}`);
}
