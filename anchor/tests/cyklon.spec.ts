import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Cyklon } from '../target/types/cyklon';
import { createMint, mintTo, getAccount, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import * as snarkjs from "snarkjs";
import * as path from "path";
import { buildBn128, utils } from "ffjavascript";
const { unstringifyBigInts } = utils;
import { g1Uncompressed, negateAndSerializeG1, g2Uncompressed, to32ByteBuffer } from "../src/utils";

const convertToSigner = (wallet: anchor.Wallet): anchor.web3.Signer => ({
  publicKey: wallet.publicKey,
  secretKey: wallet.payer.secretKey,
});

describe('cyklon', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;

  const program = anchor.workspace.Cyklon as Program<Cyklon>;

  let poolPubkey: anchor.web3.PublicKey;
  let tokenMint0: anchor.web3.PublicKey;
  let tokenMint1: anchor.web3.PublicKey;
  const tokenMint0Decimals = 6;
  const tokenMint1Decimals = 9;  // Updated to 9 decimals

  async function getTokenDecimals(mintAddress: anchor.web3.PublicKey): Promise<number> {
    if (mintAddress.equals(tokenMint0)) {
      return tokenMint0Decimals;
    } else if (mintAddress.equals(tokenMint1)) {
      return tokenMint1Decimals;
    } else {
      throw new Error("Invalid mint address");
    }
  }

  const setupMint = async () => {
    const airdropSignature = await provider.connection.requestAirdrop(
      payer.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    const signer = convertToSigner(payer);
    tokenMint0 = await createMint(provider.connection, signer, signer.publicKey, null, tokenMint0Decimals);
    tokenMint1 = await createMint(provider.connection, signer, signer.publicKey, null, tokenMint1Decimals);

    [poolPubkey] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), tokenMint0.toBuffer(), tokenMint1.toBuffer()],
      program.programId
    );
    
    console.log(
      `Payer: ${payer.publicKey.toBase58()}
Pool PDA: ${poolPubkey.toBase58()}
Token Mint 0: ${tokenMint0.toBase58()}
Token Mint 1: ${tokenMint1.toBase58()}`
    );
  };
  
  const setupPool = async () => {
    try {
      await program.methods
        .initializePool()
        .accounts({
          tokenMint0: tokenMint0,
          tokenMint1: tokenMint1,
          payer: payer.publicKey,
        })
        .rpc();
    } catch (error) {
      console.error("Error initializing pool:", error);
      throw error;
    }
  };
  
  it('Initialize Pool', async () => {
    await setupMint();
    await setupPool();

    const poolAccount = await program.account.pool.fetch(poolPubkey);
    expect(poolAccount.tokenMint0.equals(tokenMint0)).toBe(true);
    expect(poolAccount.tokenMint1.equals(tokenMint1)).toBe(true);
  });
  
  it('Add Liquidity', async () => {
    const userTokenAccount0 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint0,
      payer.publicKey
    );
    const userTokenAccount1 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint1,
      payer.publicKey
    );

    const poolTokenAccount0 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint0,
      poolPubkey,
      true
    );
    const poolTokenAccount1 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint1,
      poolPubkey,
      true
    );

    const amount0 = 1_000_000; // 1 token with 6 decimals
    const amount1 = 2_000_000_000; // 2 tokens with 9 decimals
    await mintTo(provider.connection, convertToSigner(payer), tokenMint0, userTokenAccount0.address, convertToSigner(payer), amount0);
    await mintTo(provider.connection, convertToSigner(payer), tokenMint1, userTokenAccount1.address, convertToSigner(payer), amount1);

    try {
      await program.methods
        .addLiquidity(
          new anchor.BN(amount0),
          new anchor.BN(amount1)
        )
        .accounts({
          pool: poolPubkey,
          userTokenAccount0: userTokenAccount0.address,
          userTokenAccount1: userTokenAccount1.address,
          poolTokenAccount0: poolTokenAccount0.address,
          poolTokenAccount1: poolTokenAccount1.address,
          tokenMint0: tokenMint0,
          tokenMint1: tokenMint1,
          user: payer.publicKey,
          tokenMint0Program: anchor.utils.token.TOKEN_PROGRAM_ID,
          tokenMint1Program: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();

      const updatedPoolAccount = await program.account.pool.fetch(poolPubkey);

      expect(updatedPoolAccount.reserve0.toNumber()).toBe(amount0);
      expect(updatedPoolAccount.reserve1.toNumber()).toBe(amount1);

      const userAccount0Info = await getAccount(provider.connection, userTokenAccount0.address);
      const userAccount1Info = await getAccount(provider.connection, userTokenAccount1.address);

      expect(Number(userAccount0Info.amount)).toBe(0);
      expect(Number(userAccount1Info.amount)).toBe(0);

    } catch (error) {
      console.error("Error adding liquidity:", error);
      throw error;
    }
  });

  it('Confidential Swap', async () => {
    const normalizeAmount = (amount: number, decimals: number) => {
      return BigInt(amount) * BigInt(10 ** (9 - decimals));
    };

    const denormalizeAmount = (amount: bigint, decimals: number) => {
      return Number(amount / BigInt(10 ** (9 - decimals)));
    };

    const poolAccount = await program.account.pool.fetch(poolPubkey);

    const userTokenAccount0 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint0,
      payer.publicKey
    );
    const userTokenAccount1 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint1,
      payer.publicKey
    );

    const poolTokenAccount0 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint0,
      poolPubkey,
      true
    );
    const poolTokenAccount1 = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      convertToSigner(payer),
      tokenMint1,
      poolPubkey,
      true
    );
    
    const amountToMint = 1_000_000; // 1 token with 6 decimals for tokenMint0
    await mintTo(provider.connection, convertToSigner(payer), tokenMint0, userTokenAccount0.address, convertToSigner(payer), amountToMint);

    const decimals0 = await getTokenDecimals(tokenMint0);
    const decimals1 = await getTokenDecimals(tokenMint1);

    const normalizedReserve0 = normalizeAmount(poolAccount.reserve0.toNumber(), decimals0);
    const normalizedReserve1 = normalizeAmount(poolAccount.reserve1.toNumber(), decimals1);

    const privateAmount = normalizeAmount(100_000, decimals0); // 0.1 token of tokenMint0
    const privateMinReceived = normalizeAmount(99_000_000, decimals1); // 0.099 token of tokenMint1 (1% slippage)
    const isSwapXtoY = 1; // Swapping token0 for token1
    
    const publicInputs = {
      publicBalanceX: normalizedReserve0,
      publicBalanceY: normalizedReserve1,
      isSwapXtoY: isSwapXtoY,
      totalLiquidity: normalizedReserve0 + normalizedReserve1
    };

    const privateInputs = {
      privateAmount: privateAmount,
      privateMinReceived: privateMinReceived
    };

    const { proofA, proofB, proofC, publicSignals } = await generateProof(
      privateInputs,
      publicInputs
    );
    
    console.log("Accounts passed to the transaction:");
    console.log({
      pool: poolPubkey.toBase58(),
      userTokenAccountIn: userTokenAccount0.address.toBase58(),
      userTokenAccountOut: userTokenAccount1.address.toBase58(),
      poolTokenAccount0: poolTokenAccount0.address.toBase58(),
      poolTokenAccount1: poolTokenAccount1.address.toBase58(),
      tokenMint0: tokenMint0.toBase58(),
      tokenMint1: tokenMint1.toBase58(),
    });

    try {
      const tx = await program.methods
        .confidentialSwap(
          Array.from(proofA),
          Array.from(proofB),
          Array.from(proofC),
          publicSignals.map(signal => Array.from(signal))
        )
        .accounts({
          // @ts-expect-error Anchor is annoying as fuck.
          pool: poolPubkey,
          userTokenAccountIn: userTokenAccount0.address,
          userTokenAccountOut: userTokenAccount1.address,
          poolTokenAccount0: poolTokenAccount0.address,
          poolTokenAccount1: poolTokenAccount1.address,
          tokenMint0: tokenMint0,
          tokenMint1: tokenMint1,
          user: payer.publicKey,
          tokenMint0Program: anchor.utils.token.TOKEN_PROGRAM_ID,
          tokenMint1Program: anchor.utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .transaction();

      tx.instructions.unshift(
        anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 2_000_000 })
      );

      await provider.sendAndConfirm(tx);

      const userAccount0AfterSwap = await getAccount(provider.connection, userTokenAccount0.address);
      const userAccount1AfterSwap = await getAccount(provider.connection, userTokenAccount1.address);

      expect(Number(userAccount0AfterSwap.amount)).toBeLessThan(amountToMint);
      expect(Number(userAccount1AfterSwap.amount)).toBeGreaterThan(0);

      // You might want to add more precise checks here using the normalized values
      const normalizedAmount0After = normalizeAmount(Number(userAccount0AfterSwap.amount), decimals0);
      const normalizedAmount1After = normalizeAmount(Number(userAccount1AfterSwap.amount), decimals1);

      expect(normalizedAmount0After).toBeLessThan(normalizeAmount(amountToMint, decimals0));
      expect(normalizedAmount1After).toBeGreaterThan(BigInt(0));

      const poolAccount0AfterSwap = await getAccount(provider.connection, poolTokenAccount0.address);
      const poolAccount1AfterSwap = await getAccount(provider.connection, poolTokenAccount1.address);

      expect(Number(poolAccount0AfterSwap.amount)).toBeGreaterThan(0);
      expect(Number(poolAccount1AfterSwap.amount)).toBeGreaterThan(0);

    } catch (error) {
      console.error("Error performing confidential swap:", error);
      throw error;
    }
  }, 10000000);
});

async function generateProof(
  privateInputs: { privateAmount: bigint, privateMinReceived: bigint },
  publicInputs: { publicBalanceX: bigint, publicBalanceY: bigint, isSwapXtoY: number, totalLiquidity: bigint }
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

  console.log("Original proof:", JSON.stringify(proof, null, 2));
  console.log("Public signals:", JSON.stringify(publicSignals, null, 2));

  const curve = await buildBn128();
  const proofProc = unstringifyBigInts(proof);
  const publicSignalsUnstrigified = unstringifyBigInts(publicSignals);

  let proofA = g1Uncompressed(curve, proofProc.pi_a);
  proofA = await negateAndSerializeG1(curve, proofA);

  const proofB = g2Uncompressed(curve, proofProc.pi_b);
  const proofC = g1Uncompressed(curve, proofProc.pi_c);

  const formattedPublicSignals = publicSignalsUnstrigified.map(signal => {
    return to32ByteBuffer(BigInt(signal));
  });

  return { 
    proofA: new Uint8Array(proofA), 
    proofB: new Uint8Array(proofB), 
    proofC: new Uint8Array(proofC), 
    publicSignals: formattedPublicSignals 
  };
}