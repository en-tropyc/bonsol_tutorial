use risc0_zkvm::guest::env;

fn main() {
    // Simply output "hello" as the commitment
    let message = "hello bonsol!";
    env::commit_slice(message.as_bytes());
} 
