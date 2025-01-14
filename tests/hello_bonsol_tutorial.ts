import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HelloBonsol } from "../target/types/hello_bonsol";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { BN } from "bn.js";

// Program IDs
const BONSOL_PROGRAM_ID = new PublicKey("BoNsHRcyLLNdtnoDf8hiCNZpyehMC4FDMxs6NTxFi3ew");
const HELLO_PROGRAM_ID = new PublicKey("AL2sWHZ42EymvGFLDHszdDwsXqBtxTg1wWhc4wesQEku");

// Image ID for hello world program
const HELLO_IMAGE_ID = "7f8ebdabe3ed69b8d47b2cbc86e8668d171e1a0ced01610fd1ecc224db69767b";

describe("hello_bonsol", () => {
  // Configure the client to use the devnet cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Create program interface
  const program = anchor.workspace.HelloBonsol as Program<HelloBonsol>;

  beforeEach(async () => {
    // Check if program is deployed by checking if the image ID PDA exists
    const [imageId] = PublicKey.findProgramAddressSync(
      [Buffer.from(HELLO_IMAGE_ID, 'hex')],
      BONSOL_PROGRAM_ID
    );
    
    const imageAccount = await provider.connection.getAccountInfo(imageId);
    if (!imageAccount) {
      console.log("Warning: Image ID account not found. Program may not be deployed correctly on devnet.");
      console.log("Expected Image ID PDA:", imageId.toString());
      console.log("Please ensure the program is deployed with image ID:", HELLO_IMAGE_ID);
    } else {
      console.log("Image ID account found, program is deployed correctly.");
      console.log("Image ID PDA:", imageId.toString());
      console.log("Account owner:", imageAccount.owner.toString());
      console.log("Account data length:", imageAccount.data.length);
    }

    // Add a small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it("Requests hello world execution", async () => {
    // Log who's paying for the transaction
    console.log("Payer pubkey:", provider.wallet.publicKey.toString());
    
    // Derive PDA for image ID
    const [imageId] = PublicKey.findProgramAddressSync(
      [Buffer.from(HELLO_IMAGE_ID, 'hex')],
      BONSOL_PROGRAM_ID
    );
    
    // Generate execution request keypair
    const executionRequestKeypair = Keypair.generate();
    console.log("Execution request pubkey:", executionRequestKeypair.publicKey.toString());

    try {
      // Get current slot for dynamic expiry
      const currentSlot = await provider.connection.getSlot();
      const expirySlot = currentSlot + 2000; // Using 2000 slots like in the working example
      
      // Create the execution request account
      const space = 1000;
      const rentExemptBalance = await provider.connection.getMinimumBalanceForRentExemption(space);
      
      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: executionRequestKeypair.publicKey,
        lamports: rentExemptBalance,
        space: space,
        programId: HELLO_PROGRAM_ID,
      });

      // Prepare input data with explicit type
      const input = "Hello, World!";
      const inputData = {
        type: "PublicData",
        data: Buffer.from(input, 'utf-8')
      };

      // Send the request hello transaction with matching config
      const tx = await program.methods
        .requestHello(input)
        .accounts({
          payer: provider.wallet.publicKey,
          imageId: imageId,
          executionRequest: executionRequestKeypair.publicKey,
          bonsol: BONSOL_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([createAccountIx])
        .signers([executionRequestKeypair])
        .rpc();

      console.log("Transaction signature:", tx);
      console.log("View transaction: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
      console.log("Transaction successful!");
      
      // Wait for the transaction to be confirmed
      await provider.connection.confirmTransaction(tx);
      
      // Log execution request details
      console.log("Execution request created with configuration:");
      console.log("- Image ID:", HELLO_IMAGE_ID);
      console.log("- Input Type:", inputData.type);
      console.log("- Input Data:", input);
      console.log("- Tip: 12000 lamports");
      console.log("- Expiry:", expirySlot, "slots (current slot + 2000)");
      console.log("- Callback Program ID:", program.programId.toString());

      // Monitor for prover claim
      console.log("\nMonitoring for prover claim...");
      let claimed = false;
      const startTime = Date.now();
      const timeout = 60000; // 1 minute timeout

      while (!claimed && Date.now() - startTime < timeout) {
        const account = await provider.connection.getAccountInfo(executionRequestKeypair.publicKey);
        if (account && account.data.length > 0) {
          console.log("Execution request account data updated");
          claimed = true;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between checks
      }

      if (!claimed) {
        console.log("Warning: No prover claimed the request within timeout period");
      }

    } catch (error) {
      console.error("Error details:", error);
      throw error;
    }
  });
});
