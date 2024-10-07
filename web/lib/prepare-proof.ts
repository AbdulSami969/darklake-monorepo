'use server'

import path from 'path';
// @ts-expect-error ffjavascript is not typed.
import { buildBn128, utils as ffUtils } from 'ffjavascript';
import { g1Uncompressed, negateAndSerializeG1, g2Uncompressed, to32ByteBuffer } from "@blackpool/anchor";
import * as snarkjs from 'snarkjs';

const { unstringifyBigInts } = ffUtils;

export async function generateProof(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  privateInputs: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicInputs: any
): Promise<{ proofA: Uint8Array, proofB: Uint8Array, proofC: Uint8Array, publicSignals: Uint8Array[] }> {
  'use server'

  console.log("Generating proof for inputs:", { privateInputs, publicInputs });

  const wasmPath = path.join(process.cwd(), "public", "zk", "swap.wasm");
  const zkeyPath = path.join(process.cwd(), "public", "zk", "swap_final.zkey");

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formattedPublicSignals = publicSignalsUnstrigified.map((signal: any) => {
    return to32ByteBuffer(BigInt(signal));
  });

  return { 
    proofA: new Uint8Array(proofA), 
    proofB: new Uint8Array(proofB), 
    proofC: new Uint8Array(proofC), 
    publicSignals: formattedPublicSignals 
  };
}