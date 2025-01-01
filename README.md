# Creating Your Own "Hello Bonsol" Tutorial

## 1. Create a new Anchor workspace

```bash
anchor init hello_bonsol
cd hello_bonsol
```

## 2. Initialize a new Bonsol Program

First, ensure your Solana CLI config is set up correctly using your keypair of choice. This keypair will be responsible for signing transactions on your behalf.

```yaml
json_rpc_url: https://api.devnet.solana.com
websocket_url: ''
keypair_path: "/Users/YOUR_USERNAME/.config/solana/id.json"  # Use absolute path
address_labels:
  '11111111111111111111111111111111': System Program
commitment: confirmed
```

Then initialize your Bonsol program:
```bash
mkdir zkprograms
cd zkprograms
bonsol init --project-name say_hello
```

Implement the ZK program logic in `src/main.rs`:

```rust
use risc0_zkvm::guest::env;

fn main() {
    // Simply output "hello" as the commitment
    let message = "hello bonsol";
    env::commit_slice(message.as_bytes());
} 
```

## 3. Build the program

Using the Bonsol CLI, build the program:

```bash
cd say_hello
bonsol build --zk-program-path .
```

This will create a `target/` directory containing a `manifest.json` file. This manifest file contains all the information needed to deploy your program. Example manifest.json:

```json
{
  "name": "say_hello",
  "binaryPath": "./target/riscv-guest/riscv32im-risc0-zkvm-elf/docker/say_hello/say_hello",
  "imageId": "dcf7509f3f8fc58f90a99dab085e3b60fcbdd7a169b2c5e3b73af2f35ad480a0",
  "inputOrder": [
    "Public"
  ],
  "signature": "379yXEvXdTCeif5gvagXoVt3Tb3HuZ1oQhTJvgVheju61a5jKsgoYx97KbZ4XuJbz7E2xJvFG4GNvb6KLfFGpyPi",
  "size": 99812
}
```

## 4. Deploy the program

Deploy the program to a storage solution of your choice. Here's an example using S3.

Create a S3 bucket:
```bash
aws s3api create-bucket \
    --bucket {bucket_name} \
    --region {region} \
    --create-bucket-configuration LocationConstraint={region}
```
Deploy the program to S3:
```bash
bonsol deploy \
    --deploy-type s3 \
    --bucket {bucket_name} \
    --access-key {access-key} \
    --secret-key {secret-key} \
    --region {region} \
    --url s3://{url} \
    --manifest-path ./manifest.json \      
    --storage-account s3://{account_name}
```

You'll be prompted with the confirmation message: 
```
Deploying to Solana, which will cost real money. Are you sure you want to continue? (y/n)
```

Ensure you have enough SOL in your wallet to cover the cost of the deployment and type `y` and press enter. If you're on devnet, you will be charged devnet SOL.

Once completed, you'll be given a confirmation message with the address of your program account. 

```
7f8ebdabe3ed69b8d47b2cbc86e8668d171e1a0ced01610fd1ecc224db69767b deployed
```

## 5. Interact with your Bonsol program

Write a Solana program that interacts with your Bonsol program. The program consists of two main instructions: 
- `request_hello`: Initiates a Bonsol execution request
- `handle_hello_callback`: Handles the callback with results

Here's a reference implementation of the Solana program in `programs/hello_bonsol_tutorial/src/lib.rs`:
```rust
use anchor_lang::{
    prelude::*,
    declare_id,
};
use bonsol_interface::{
    anchor::Bonsol,
    instructions::{execute_v1, CallbackConfig, ExecutionConfig, InputRef},
    callback::handle_callback,
};
use base64::Engine as _;

declare_id!("B1AJLQqKJPdaFM45ZojBQYGfGQ8v6ysCBVtAUsgwVvkb");

const HELLO_IMAGE_ID: &str = "dcf7509f3f8fc58f90a99dab085e3b60fcbdd7a169b2c5e3b73af2f35ad480a0";

#[program]
pub mod hello_bonsol {
    use super::*;

    pub fn request_hello(ctx: Context<RequestHello>, name: String) -> Result<()> {
        let input_bytes = name.as_bytes();
        let input_data = base64::engine::general_purpose::STANDARD.encode(input_bytes);
        
        execute_v1(
            &ctx.accounts.payer.key(),
            &ctx.accounts.image_id.key(),
            HELLO_IMAGE_ID,
            &input_data,
            vec![InputRef::public(input_bytes)],
            1, // tip
            100,
            ExecutionConfig {
                verify_input_hash: false,
                input_hash: None,
                forward_output: true,
            },
            Some(CallbackConfig {
                program_id: crate::id(),
                instruction_prefix: vec![0],
                extra_accounts: vec![],
            }),
            None,
        ).map_err(|_| error!(ErrorCode::ExecutionRequestFailed))?;

        Ok(())
    }

    pub fn handle_hello_callback(ctx: Context<HandleCallback>, data: Vec<u8>) -> Result<()> {
        let ainfos = ctx.accounts.to_account_infos();
        let output = handle_callback(
            &ctx.accounts.image_id.key().to_string(),
            &ctx.accounts.execution_request.key(),
            &ainfos.as_slice(),
            &data,
        )?;
        
        let output_str = String::from_utf8(output.committed_outputs.to_vec())
            .map_err(|_| error!(ErrorCode::InvalidCallbackData))?;
        
        msg!("Received output: {}", output_str);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RequestHello<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Bonsol will validate this
    pub image_id: UncheckedAccount<'info>,
    /// CHECK: This is initialized by Bonsol
    #[account(mut)]
    pub execution_request: UncheckedAccount<'info>,
    pub bonsol: Program<'info, Bonsol>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct HandleCallback<'info> {
    /// CHECK: Bonsol will validate this
    pub image_id: UncheckedAccount<'info>,
    /// CHECK: This is the raw ER account, checked in the callback handler
    pub execution_request: UncheckedAccount<'info>,
}

#[error_code]
pub enum ErrorCode {
    InvalidCallbackData,
    ExecutionRequestFailed,
}

```

And update to your `Cargo.toml`:
```toml
[package]
name = "hello_bonsol_tutorial"
version = "0.1.0"
description = "Created with Anchor"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "hello_bonsol_tutorial"

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build"]

[dependencies]
anchor-lang = "0.30.1"
bonsol-interface = { path = "../../../bonsol/onchain/interface" , features = ["anchor", "on-chain"], default-features = false}
base64 = { version = "0.21.7", default-features = false }
```

Build and deploy your Solana program:

```bash
anchor build
anchor deploy
```

You'll be given a confirmation message with the address of your program account.

```
Program Id: B1AJLQqKJPdaFM45ZojBQYGfGQ8v6ysCBVtAUsgwVvkb

Deploy success
```

Finally, create a test client to interact with your program:
```rust
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
```
You can verify that the test is passing from the logs:

```bash
Payer pubkey: 3PDGSWCpQpgpfpyLALKno9ygotcJZArFbDxa4evUY6Ls
Execution request pubkey: BTqYvb7pY7xj7tnCiqyBFWkWdN49xaVzEhw48T5e5yjc
Transaction signature: 4r2EWmHYYX7zreaYxBs3hSfLgoMQu2jnEBdDjkbhc42okLnzxh4GMvWXTEqa7oPABWfbJ8cA7Lk1zFgQKs4hFrEX
View transaction: https://explorer.solana.com/tx/4r2EWmHYYX7zreaYxBs3hSfLgoMQu2jnEBdDjkbhc42okLnzxh4GMvWXTEqa7oPABWfbJ8cA7Lk1zFgQKs4hFrEX?cluster=devnet
Transaction successful!
    ✔ Requests hello world execution (5894ms)


  1 passing (6s)

✨  Done in 7.27s.
```

You should now be able to check the explorer to see the transaction and the callback.
<img width="1164" alt="image" src="https://github.com/user-attachments/assets/541a3e59-12e3-45fb-b9b7-cb0e4e08cdaa" />

