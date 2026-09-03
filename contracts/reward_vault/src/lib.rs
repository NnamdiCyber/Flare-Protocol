#![no_std]

mod storage;
mod types;
mod verify;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, contracterror, symbol_short, token, Address, BytesN, Env};

use storage::{
    compute_nullifier, get_asset, get_balance, get_fee_rate, get_oracle_pubkey,
    get_reward_per_action, get_treasury, nullifier_exists, set_asset, set_balance, set_fee_rate,
    set_nullifier, set_oracle_pubkey, set_reward_per_action, set_treasury,
};
use types::ClaimProof;
use verify::verify_oracle_signature;

// ---------------------------------------------------------------------------
// Contract errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum VaultError {
    AlreadyInitialized  = 1,
    NotInitialized      = 2,
    CampaignNotFound    = 3,
    NullifierSpent      = 4,
    InvalidSignature    = 5,
    InsufficientBalance = 6,
    Unauthorized        = 7,
}

// ---------------------------------------------------------------------------
// Storage key for the admin address
// ---------------------------------------------------------------------------

fn admin_key(env: &Env) -> soroban_sdk::Symbol {
    soroban_sdk::Symbol::new(env, "admin")
}

// ---------------------------------------------------------------------------
// RewardVault contract
// ---------------------------------------------------------------------------

#[contract]
pub struct RewardVaultContract;

#[contractimpl]
impl RewardVaultContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// One-time initialisation.
    ///
    /// - `admin`    — address authorised to call `deposit` and `withdraw`
    ///                (the campaign_manager contract address).
    /// - `treasury` — address that receives protocol fees.
    /// - `fee_rate` — protocol fee in basis points (0–10000). 0 = fee-free.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        fee_rate: u32,
    ) -> Result<(), VaultError> {
        if env.storage().persistent().has(&admin_key(&env)) {
            return Err(VaultError::AlreadyInitialized);
        }
        env.storage().persistent().set(&admin_key(&env), &admin);
        set_treasury(&env, &treasury);
        set_fee_rate(&env, fee_rate);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Deposit
    // -----------------------------------------------------------------------

    /// Lock a campaign's budget in the vault.
    ///
    /// Called by campaign_manager on campaign creation.  Pulls `amount` tokens
    /// from `advertiser` to this contract via `token::Client::transfer`.
    /// Records campaign metadata (asset, reward_per_action, oracle_pubkey).
    ///
    /// Only the admin (campaign_manager) may call this.
    pub fn deposit(
        env: Env,
        campaign_id: BytesN<32>,
        asset: Address,
        amount: i128,
        reward_per_action: i128,
        oracle_pubkey: BytesN<32>,
        advertiser: Address,
    ) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&admin_key(&env))
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();

        // Pull tokens from the advertiser into the vault contract.
        token::Client::new(&env, &asset)
            .transfer(&advertiser, &env.current_contract_address(), &amount);

        // Record campaign state.
        set_balance(&env, &campaign_id, amount);
        set_asset(&env, &campaign_id, &asset);
        set_reward_per_action(&env, &campaign_id, reward_per_action);
        set_oracle_pubkey(&env, &campaign_id, &oracle_pubkey);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Claim
    // -----------------------------------------------------------------------

    /// Process a reward claim submitted by an earner.
    ///
    /// Steps (matching README.md):
    ///  1. Verify ed25519 signature against the campaign's `oracle_pubkey`.
    ///  2. Check nullifier — `(campaign_id, earner, action_hash)` must be unused.
    ///  3. Write nullifier to prevent double-claim forever.
    ///  4. Deduct `reward_per_action` from campaign balance.
    ///  5. Compute earner share and treasury share per protocol fee.
    ///  6. Transfer both shares via SEP-0041 token interface.
    ///  7. Emit `RewardClaimed` event: `(campaign_id, earner, earner_amount)`.
    ///
    /// Fee formula (from README.md):
    ///   earner_receives  = reward * (10000 - fee_rate) / 10000
    ///   treasury_receives = reward * fee_rate / 10000
    pub fn claim(env: Env, proof: ClaimProof) -> Result<(), VaultError> {
        let campaign_id = proof.campaign_id.clone();

        // Fetch oracle pubkey — doubles as a campaign-exists check.
        let oracle_pubkey = get_oracle_pubkey(&env, &campaign_id)
            .ok_or(VaultError::CampaignNotFound)?;

        // 1. Verify ed25519 signature.
        // verify_oracle_signature calls env.crypto().ed25519_verify which
        // panics (host trap) on an invalid signature.  In the test harness,
        // try_claim catches that trap and returns Err.
        verify_oracle_signature(&env, &proof, &oracle_pubkey);

        // 2. Check nullifier.
        let nullifier = compute_nullifier(&env, &campaign_id, &proof.earner, &proof.action_hash);
        if nullifier_exists(&env, &nullifier) {
            return Err(VaultError::NullifierSpent);
        }

        // 3. Write nullifier (checks-effects).
        set_nullifier(&env, &nullifier);

        // 4. Load balance and reward.
        let reward = get_reward_per_action(&env, &campaign_id);
        let balance = get_balance(&env, &campaign_id);
        if balance < reward {
            return Err(VaultError::InsufficientBalance);
        }

        // 5. Compute fee split.
        let fee_rate = get_fee_rate(&env) as i128;
        let earner_amount = reward * (10_000 - fee_rate) / 10_000;
        let treasury_amount = reward - earner_amount;

        // Deduct from balance (effects before external calls).
        set_balance(&env, &campaign_id, balance - reward);

        // 6. Transfer tokens.
        let asset = get_asset(&env, &campaign_id).ok_or(VaultError::CampaignNotFound)?;
        let token = token::Client::new(&env, &asset);

        token.transfer(&env.current_contract_address(), &proof.earner, &earner_amount);

        if treasury_amount > 0 {
            if let Some(treasury) = get_treasury(&env) {
                token.transfer(&env.current_contract_address(), &treasury, &treasury_amount);
            }
        }

        // 7. Emit RewardClaimed event.
        env.events().publish(
            (symbol_short!("reward"), symbol_short!("claimed")),
            (campaign_id, proof.earner.clone(), earner_amount),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Withdraw
    // -----------------------------------------------------------------------

    /// Return remaining campaign budget to a recipient (the advertiser).
    ///
    /// Called by campaign_manager after a campaign expires.
    /// Only the admin (campaign_manager) may call this.
    pub fn withdraw(
        env: Env,
        campaign_id: BytesN<32>,
        recipient: Address,
    ) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&admin_key(&env))
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();

        let balance = get_balance(&env, &campaign_id);
        if balance <= 0 {
            return Ok(()); // Nothing to withdraw.
        }

        let asset = get_asset(&env, &campaign_id).ok_or(VaultError::CampaignNotFound)?;

        // Zero balance before external call (checks-effects-interactions).
        set_balance(&env, &campaign_id, 0);

        token::Client::new(&env, &asset)
            .transfer(&env.current_contract_address(), &recipient, &balance);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Read functions
    // -----------------------------------------------------------------------

    /// Query remaining balance for a campaign.
    pub fn get_balance(env: Env, campaign_id: BytesN<32>) -> i128 {
        get_balance(&env, &campaign_id)
    }
}
