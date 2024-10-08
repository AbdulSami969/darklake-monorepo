'use client'

import { AnchorProvider, utils } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { getCyklonProgram, getCyklonProgramId } from '@blackpool/anchor';
import { useAnchorProvider } from '../components/solana/solana-provider';
import { useCluster } from '../components/cluster/cluster-data-access';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { generateProof } from './prepare-proof';

export interface SwapResult {
  success: boolean;
  transaction?: Transaction;
  error?: string;
}

const NORMALIZATION_FACTOR = 9; // Normalize to 9 decimal places

const normalizeAmount = (amount: bigint, decimals: number): bigint => {
  return amount * BigInt(10 ** (NORMALIZATION_FACTOR - decimals));
};

const denormalizeAmount = (amount: bigint, decimals: number): bigint => {
  return amount / BigInt(10 ** (NORMALIZATION_FACTOR - decimals));
};

export async function prepareConfidentialSwap(
  provider: AnchorProvider,
  programId: PublicKey,
  sourceToken: PublicKey,
  destToken: PublicKey,
  amount: bigint,
  minReceived: bigint,
  sourceTokenProgram: string,
  destTokenProgram: string,
  sourceDecimals: number,
  destDecimals: number
): Promise<SwapResult> {
  try {
    const program = getCyklonProgram(provider);
    const payer = provider.wallet;

    // Sort token public keys to ensure consistent pool seed calculation
    const [token0, token1] = [sourceToken, destToken].sort((a, b) => 
      a.toBuffer().compare(b.toBuffer())
    );

    // Find pool PDA using sorted token public keys
    const [poolPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), token0.toBuffer(), token1.toBuffer()],
      programId
    );

    // Determine the token program for each token
    const sourceTokenProgramId = sourceTokenProgram === 'Token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const destTokenProgramId = destTokenProgram === 'Token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    // Get user token account addresses
    const userSourceTokenAccount = await getAssociatedTokenAddress(
      sourceToken,
      payer.publicKey,
      false,
      sourceTokenProgramId
    );
    const userDestTokenAccount = await getAssociatedTokenAddress(
      destToken,
      payer.publicKey,
      false,
      destTokenProgramId
    );

    // Get pool token account addresses
    const poolSourceTokenAccount = await getAssociatedTokenAddress(
      sourceToken,
      poolPubkey,
      true,
      sourceTokenProgramId
    );
    const poolDestTokenAccount = await getAssociatedTokenAddress(
      destToken,
      poolPubkey,
      true,
      destTokenProgramId
    );

    // Fetch pool account data
    const poolAccount = await program.account.pool.fetch(poolPubkey);

    // Normalize amounts
    const normalizedAmount = normalizeAmount(amount, sourceDecimals);
    const normalizedMinReceived = normalizeAmount(minReceived, destDecimals);
    const normalizedReserve0 = normalizeAmount(BigInt(poolAccount.reserve0), sourceDecimals);
    const normalizedReserve1 = normalizeAmount(BigInt(poolAccount.reserve1), destDecimals);

    // Determine if we're swapping from token0 to token1 or vice versa
    const isSwapXtoY = sourceToken.equals(token0) ? 1 : 0;

    // Prepare inputs for proof generation
    const publicInputs = {
      publicBalanceX: normalizedReserve0,
      publicBalanceY: normalizedReserve1,
      isSwapXtoY: isSwapXtoY,
      totalLiquidity: normalizedReserve0 + normalizedReserve1
    };

    const privateInputs = {
      privateAmount: normalizedAmount,
      privateMinReceived: normalizedMinReceived
    };

    // Generate proof
    const { proofA, proofB, proofC, publicSignals } = await generateProof(
      privateInputs,
      publicInputs
    );

    // Create the transaction
    const transaction = new Transaction();

    // Ensure the correct order of token accounts in the instruction
    const [orderedUserTokenAccountIn, orderedUserTokenAccountOut] = isSwapXtoY
      ? [userSourceTokenAccount, userDestTokenAccount]
      : [userDestTokenAccount, userSourceTokenAccount];

    const [orderedPoolTokenAccount0, orderedPoolTokenAccount1] = isSwapXtoY
      ? [poolSourceTokenAccount, poolDestTokenAccount]
      : [poolDestTokenAccount, poolSourceTokenAccount];

    // Add the confidential swap instruction to the transaction
    transaction.add(
      await program.methods
        .confidentialSwap(
          Array.from(proofA),
          Array.from(proofB),
          Array.from(proofC),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          publicSignals.map((signal: any) => Array.from(signal))
        )
        .accounts({
          // @ts-expect-error Anchor is finnick.
          pool: poolPubkey,
          userTokenAccountIn: orderedUserTokenAccountIn,
          userTokenAccountOut: orderedUserTokenAccountOut,
          poolTokenAccount0: orderedPoolTokenAccount0,
          poolTokenAccount1: orderedPoolTokenAccount1,
          tokenMint0: token0,
          tokenMint1: token1,
          user: payer.publicKey,
          tokenMint0Program: token0.equals(sourceToken) ? sourceTokenProgramId : destTokenProgramId,
          tokenMint1Program: token1.equals(destToken) ? destTokenProgramId : sourceTokenProgramId,
          associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    return { success: true, transaction };
  } catch (error) {
    console.error('Error preparing confidential swap:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function useConfidentialSwap() {
  const provider = useAnchorProvider();
  const { cluster } = useCluster();

  // @ts-expect-error Weird typing issues.
  const programId = getCyklonProgramId(cluster);

  return async (sourceToken: PublicKey, destToken: PublicKey, amount: bigint, minReceived: bigint, sourceTokenProgram: string, destTokenProgram: string, sourceDecimals: number, destDecimals: number): Promise<SwapResult> => {
    return prepareConfidentialSwap(provider, programId, sourceToken, destToken, amount, minReceived, sourceTokenProgram, destTokenProgram, sourceDecimals, destDecimals);
  };
}