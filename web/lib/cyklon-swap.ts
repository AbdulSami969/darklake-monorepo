import { AnchorProvider, Program, web3, utils, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { getCyklonProgram, getCyklonProgramId } from '@blackpool/anchor';
import { useAnchorProvider } from '../components/solana/solana-provider';
import { useCluster } from '../components/cluster/cluster-data-access';
import { getOrCreateAssociatedTokenAccount, getAccount } from '@solana/spl-token';
import * as snarkjs from 'snarkjs';
import * as path from 'path';
// @ts-expect-error ffjavascript is not typed.
import { buildBn128, utils as ffUtils } from 'ffjavascript';

const { unstringifyBigInts } = ffUtils;

export interface SwapResult {
  success: boolean;
  amount?: number;
  error?: string;
}

async function generateProof(
  privateInputs: any,
  publicInputs: any
): Promise<{ proofA: Uint8Array, proofB: Uint8Array, proofC: Uint8Array, publicSignals: Uint8Array[] }> {
  console.log("Generating proof for inputs:", { privateInputs, publicInputs });

  const wasmPath = path.join(__dirname, "../../swap_js", "swap.wasm");
  const zkeyPath = path.join(__dirname, "../../", "swap_final.zkey");

  const input = {
    privateAmount: privateInputs.privateAmount.toString(),
    privateMinReceived: privateInputs.privateMinReceived.toString(),
    publicBalanceX: publicInputs.publicBalanceX.toString(),
    publicBalanceY: publicInputs.publicBalanceY.toString(),
    isSwapXtoY: publicInputs.isSwapXtoY.toString(),
    totalLiquidity: publicInputs.totalLiquidity.toString()
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  const curve = await buildBn128();
  const proofProc = unstringifyBigInts(proof);
  const publicSignalsProc = unstringifyBigInts(publicSignals);

  const proofA = curve.G1.toUncompressed(curve.G1.fromObject(proofProc.pi_a));
  const proofB = curve.G2.toUncompressed(curve.G2.fromObject(proofProc.pi_b));
  const proofC = curve.G1.toUncompressed(curve.G1.fromObject(proofProc.pi_c));

  // Create two 32-byte arrays for public signals
  const formattedPublicSignals = [
    new Uint8Array(32),
    new Uint8Array(32)
  ];

  // Fill the last 8 bytes of each public signal with the actual values
  const newBalanceX = new BN(publicSignalsProc[0]).toArray('be', 8);
  const newBalanceY = new BN(publicSignalsProc[1]).toArray('be', 8);

  formattedPublicSignals[0].set(newBalanceX, 24);
  formattedPublicSignals[1].set(newBalanceY, 24);

  return { 
    proofA: new Uint8Array(proofA.slice(0, 64)), 
    proofB: new Uint8Array(proofB), 
    proofC: new Uint8Array(proofC.slice(0, 64)), 
    publicSignals: formattedPublicSignals 
  };
}

export async function performConfidentialSwap(
  provider: AnchorProvider,
  programId: PublicKey,
  sourceToken: PublicKey,
  destToken: PublicKey,
  amount: number,
  minReceived: number
): Promise<SwapResult> {
  try {
    const program = getCyklonProgram(provider);
    const payer = provider.wallet;

    // Find pool PDA
    const [poolPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), sourceToken.toBuffer(), destToken.toBuffer()],
      programId
    );

    // Get user token accounts
    const userTokenAccountIn = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      // @ts-expect-error Anchor is finnick.
      payer.payer,
      sourceToken,
      payer.publicKey
    );
    const userTokenAccountOut = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      // @ts-expect-error Anchor is finnick.
      payer.payer,
      destToken,
      payer.publicKey
    );

    // Get pool token accounts
    const poolTokenAccount0 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      // @ts-expect-error Anchor is finnick.
      payer.payer,
      sourceToken,
      poolPubkey,
      true
    );
    const poolTokenAccount1 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      // @ts-expect-error Anchor is finnick.
      payer.payer,
      destToken,
      poolPubkey,
      true
    );

    // Fetch pool account data
    const poolAccount = await program.account.pool.fetch(poolPubkey);

    // Prepare inputs for proof generation
    const publicInputs = {
      publicBalanceX: poolAccount.reserve0.toNumber(),
      publicBalanceY: poolAccount.reserve1.toNumber(),
      isSwapXtoY: 1, // Assuming we're always swapping from token0 to token1
      totalLiquidity: poolAccount.reserve0.toNumber() + poolAccount.reserve1.toNumber()
    };

    const privateInputs = {
      privateAmount: amount,
      privateMinReceived: minReceived
    };

    // Generate proof
    const { proofA, proofB, proofC, publicSignals } = await generateProof(
      privateInputs,
      publicInputs
    );

    // Perform the confidential swap
    await program.methods
      .confidentialSwap(
        Array.from(proofA),
        Array.from(proofB),
        Array.from(proofC),
        publicSignals.map(signal => Array.from(signal))
      )
      .accounts({
        // @ts-expect-error Anchor is finnick.
        pool: poolPubkey,
        userTokenAccountIn: userTokenAccountIn.address,
        userTokenAccountOut: userTokenAccountOut.address,
        poolTokenAccount0: poolTokenAccount0.address,
        poolTokenAccount1: poolTokenAccount1.address,
        tokenMint0: sourceToken,
        tokenMint1: destToken,
        user: payer.publicKey,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify the swap was successful
    const userAccountOutAfterSwap = await getAccount(provider.connection, userTokenAccountOut.address);
    const amountReceived = Number(userAccountOutAfterSwap.amount);

    if (amountReceived > 0) {
      return { success: true, amount: amountReceived };
    } else {
      return { success: false, error: "Swap failed: No tokens received" };
    }
  } catch (error) {
    console.error('Error performing confidential swap:', error);
    return { success: false, error: error as string };
  }
}

export function useConfidentialSwap() {
  const provider = useAnchorProvider();
  const { cluster } = useCluster();

  // @ts-expect-error Weird typing issues.
  const programId = getCyklonProgramId(cluster);

  return async (sourceToken: PublicKey, destToken: PublicKey, amount: number, minReceived: number): Promise<SwapResult> => {
    return performConfidentialSwap(provider, programId, sourceToken, destToken, amount, minReceived);
  };
}