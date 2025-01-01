import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HelloBonsol } from "../target/types/hello_bonsol";
import { PublicKey } from "@solana/web3.js";

describe("hello_bonsol", () => {
  // Configure the client to use the devnet cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Create program interface
  const program = anchor.workspace.HelloBonsol as Program<HelloBonsol>;

  it("Requests hello world execution", async () => {
    // Log who's paying for the transaction
    console.log("Payer pubkey:", provider.wallet.publicKey.toString());
    
    // Convert hex string to bytes array and derive PDA
    const imageId_hex = "7f8ebdabe3ed69b8d47b2cbc86e8668d171e1a0ced01610fd1ecc224db69767b";
    const [imageId] = PublicKey.findProgramAddressSync(
      [Buffer.from(imageId_hex, 'hex')],
      program.programId
    );
    
    // Generate execution request account and log its pubkey
    const executionRequestKeypair = anchor.web3.Keypair.generate();
    console.log("Execution request pubkey:", executionRequestKeypair.publicKey.toString());

    try {
      // Calculate the space needed for the execution request account
      const EXECUTION_REQUEST_SIZE = 1000; // Adjust this size based on your actual needs

      // Create the execution request account
      const createAccountIx = anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: executionRequestKeypair.publicKey,
        space: EXECUTION_REQUEST_SIZE,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(EXECUTION_REQUEST_SIZE),
        programId: program.programId,
      });

      await program.methods
        .requestHello("World")
        .accounts({
          payer: provider.wallet.publicKey,
          imageId: imageId,
          executionRequest: executionRequestKeypair.publicKey,
          bonsol: new PublicKey("BoNsHRcyLLNdtnoDf8hiCNZpyehMC4FDMxs6NTxFi3ew"),
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .preInstructions([createAccountIx])
        .signers([executionRequestKeypair])
        .rpc()
        .then(sig => {
          console.log("Transaction signature:", sig);
          console.log("View transaction: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
        });
      
      console.log("Transaction successful!");
    } catch (error) {
      console.error("Error details:", error);
      throw error;
    }
  });
});
