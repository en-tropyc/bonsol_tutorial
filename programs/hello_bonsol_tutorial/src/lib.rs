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
