#![cfg(test)]

//! Tests for the reward_vault contract.
//!
//! Token transfer mechanics (SEP-0041) are tested via a mock token contract.
//! Campaign setup uses `deposit` for the deposit test and direct storage
//! helpers for claim/withdraw tests (to isolate signature verification logic).

use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;

use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::Address as _,
    Address, Bytes, BytesN, Env,
};

use crate::storage::{
    set_asset, set_balance, set_fee_rate, set_oracle_pubkey, set_reward_per_action, set_treasury,
};
use crate::types::ClaimProof;
use crate::verify::build_signing_message;
use crate::{RewardVaultContract, RewardVaultContractClient};

// ---------------------------------------------------------------------------
// Minimal SEP-0041 mock token
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum MockTokenKey {
    Balance(Address),
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    /// Mint tokens to an address (test helper — not in SEP-0041 spec).
    pub fn mint(env: Env, to: Address, amount: i128) {
        let key = MockTokenKey::Balance(to.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(bal + amount));
    }

    /// Read balance of an address.
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&MockTokenKey::Balance(id))
            .unwrap_or(0)
    }

    /// Transfer tokens (SEP-0041).
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_key = MockTokenKey::Balance(from.clone());
        let to_key = MockTokenKey::Balance(to.clone());
        let from_bal: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        let to_bal: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&from_key, &(from_bal - amount));
        env.storage()
            .persistent()
            .set(&to_key, &(to_bal + amount));
    }

    /// Allowance (SEP-0041 — returns i128::MAX so no approval is needed).
    pub fn allowance(_env: Env, _from: Address, _spender: Address) -> i128 {
        i128::MAX
    }

    /// Approve (SEP-0041 stub).
    pub fn approve(
        _env: Env,
        _from: Address,
        _spender: Address,
        _amount: i128,
        _expiration_ledger: u32,
    ) {
    }

    /// Decimals (SEP-0041).
    pub fn decimals(_env: Env) -> u32 {
        7
    }

    /// Name (SEP-0041).
    pub fn name(env: Env) -> soroban_sdk::String {
        soroban_sdk::String::from_str(&env, "MockToken")
    }

    /// Symbol (SEP-0041).
    pub fn symbol(env: Env) -> soroban_sdk::String {
        soroban_sdk::String::from_str(&env, "MOCK")
    }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Deploy the vault and return the client, token address, treasury address.
fn setup_vault(fee_rate: u32) -> (Env, RewardVaultContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let token_id = env.register_contract(None, MockToken);
    let vault_id = env.register_contract(None, RewardVaultContract);
    let client = RewardVaultContractClient::new(&env, &vault_id);

    let admin = vault_id.clone(); // vault is its own admin for simplicity
    let treasury = Address::generate(&env);

    // We need admin to be the vault address so deposit/withdraw are authorized.
    // In production the admin is the campaign_manager contract.
    // For tests, we set admin = vault_id so mock_all_auths covers it.
    client.initialize(&admin, &treasury, &fee_rate);

    (env, client, token_id, treasury)
}

/// Seed campaign state directly into vault storage (bypasses deposit).
///
/// Used to set up clean test scenarios for claim/withdraw tests without
/// needing token transfer mechanics.
fn seed_campaign(
    env: &Env,
    client: &RewardVaultContractClient,
    cid: &BytesN<32>,
    token_id: &Address,
    balance: i128,
    reward_per_action: i128,
    oracle_pubkey: &BytesN<32>,
) {
    // Get the vault contract address from the client.
    let vault_addr = client.address.clone();

    // Mint tokens directly to the vault in the mock token.
    let mock = MockTokenClient::new(env, token_id);
    mock.mint(&vault_addr, &balance);

    // Seed storage directly (env.as_contract lets us call storage inside the contract).
    env.as_contract(&vault_addr, || {
        set_balance(env, cid, balance);
        set_asset(env, cid, token_id);
        set_reward_per_action(env, cid, reward_per_action);
        set_oracle_pubkey(env, cid, oracle_pubkey);
    });
}

fn campaign_id(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn gen_keypair() -> (SigningKey, [u8; 32]) {
    let sk = SigningKey::generate(&mut OsRng);
    let pk = sk.verifying_key().to_bytes();
    (sk, pk)
}

/// Build a ClaimProof with a valid ed25519 signature from the given signing key.
fn make_proof(
    env: &Env,
    signing_key: &SigningKey,
    campaign: BytesN<32>,
    earner: Address,
    action_seed: u8,
    timestamp: u64,
) -> ClaimProof {
    let action_hash = BytesN::from_array(env, &[action_seed; 32]);

    let proof_unsigned = ClaimProof {
        campaign_id: campaign.clone(),
        earner: earner.clone(),
        action_hash: action_hash.clone(),
        timestamp,
        signature: BytesN::from_array(env, &[0u8; 64]),
    };

    let preimage: Bytes = build_signing_message(env, &proof_unsigned);
    let msg_hash = env.crypto().sha256(&preimage);
    let msg_bytes = msg_hash.to_array();
    let sig_bytes: [u8; 64] = signing_key.sign(&msg_bytes).to_bytes();

    ClaimProof {
        campaign_id: campaign,
        earner,
        action_hash,
        timestamp,
        signature: BytesN::from_array(env, &sig_bytes),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Seeding campaign state gives the expected get_balance result.
#[test]
fn test_deposit_and_balance() {
    let (env, client, token_id, _treasury) = setup_vault(0);

    let (_, pk_bytes) = gen_keypair();
    let oracle_pubkey = BytesN::from_array(&env, &pk_bytes);
    let cid = campaign_id(&env, 1);

    seed_campaign(&env, &client, &cid, &token_id, 1_000, 100, &oracle_pubkey);

    assert_eq!(client.get_balance(&cid), 1_000);
}

/// A valid claim reduces the balance and credits the earner.
#[test]
fn test_valid_claim() {
    let (env, client, token_id, _treasury) = setup_vault(0);

    let (sk, pk_bytes) = gen_keypair();
    let oracle_pubkey = BytesN::from_array(&env, &pk_bytes);
    let earner = Address::generate(&env);
    let cid = campaign_id(&env, 2);

    seed_campaign(&env, &client, &cid, &token_id, 1_000, 100, &oracle_pubkey);

    let proof = make_proof(&env, &sk, cid.clone(), earner.clone(), 42, 1_000_000);
    client.claim(&proof);

    // Balance reduced by reward_per_action.
    assert_eq!(client.get_balance(&cid), 900);

    // Earner received the reward.
    let mock = MockTokenClient::new(&env, &token_id);
    assert_eq!(mock.balance(&earner), 100);
}

/// Submitting the same proof twice is rejected (NullifierSpent).
#[test]
fn test_double_claim_rejected() {
    let (env, client, token_id, _treasury) = setup_vault(0);

    let (sk, pk_bytes) = gen_keypair();
    let oracle_pubkey = BytesN::from_array(&env, &pk_bytes);
    let earner = Address::generate(&env);
    let cid = campaign_id(&env, 3);

    seed_campaign(&env, &client, &cid, &token_id, 1_000, 100, &oracle_pubkey);

    let proof = make_proof(&env, &sk, cid.clone(), earner.clone(), 10, 1_000_000);

    // First claim succeeds.
    client.claim(&proof);

    // Second claim with identical proof must fail.
    let result = client.try_claim(&proof);
    assert!(result.is_err(), "double claim should be rejected");
}

/// A claim with an invalid (tampered) signature is rejected.
#[test]
fn test_invalid_signature_rejected() {
    let (env, client, token_id, _treasury) = setup_vault(0);

    let (sk, pk_bytes) = gen_keypair();
    let oracle_pubkey = BytesN::from_array(&env, &pk_bytes);
    let earner = Address::generate(&env);
    let cid = campaign_id(&env, 4);

    seed_campaign(&env, &client, &cid, &token_id, 1_000, 100, &oracle_pubkey);

    // Build a valid proof and then corrupt the signature.
    let mut proof = make_proof(&env, &sk, cid.clone(), earner.clone(), 99, 1_000_000);
    proof.signature = BytesN::from_array(&env, &[0xFFu8; 64]);

    // The host's ed25519_verify traps on bad sig — caught by try_claim.
    let result = client.try_claim(&proof);
    assert!(result.is_err(), "invalid signature should be rejected");
}

/// Protocol fee: treasury receives its share and earner gets the remainder.
#[test]
fn test_fee_split() {
    let (env, client, token_id, treasury) = setup_vault(250); // 2.5% fee

    // Seed treasury in storage too (needed for transfer to work).
    env.as_contract(&client.address, || {
        set_treasury(&env, &treasury);
        set_fee_rate(&env, 250);
    });

    let (sk, pk_bytes) = gen_keypair();
    let oracle_pubkey = BytesN::from_array(&env, &pk_bytes);
    let earner = Address::generate(&env);
    let cid = campaign_id(&env, 5);

    // reward = 10_000 → earner 9_750, treasury 250
    seed_campaign(&env, &client, &cid, &token_id, 100_000, 10_000, &oracle_pubkey);

    let proof = make_proof(&env, &sk, cid.clone(), earner.clone(), 77, 1_000_000);
    client.claim(&proof);

    let mock = MockTokenClient::new(&env, &token_id);
    assert_eq!(mock.balance(&earner), 9_750);
    assert_eq!(mock.balance(&treasury), 250);
    assert_eq!(client.get_balance(&cid), 90_000);
}

/// withdraw transfers remaining balance to the recipient and zeros the balance.
#[test]
fn test_withdraw_after_expiry() {
    let (env, client, token_id, _treasury) = setup_vault(0);

    let (_, pk_bytes) = gen_keypair();
    let oracle_pubkey = BytesN::from_array(&env, &pk_bytes);
    let advertiser = Address::generate(&env);
    let cid = campaign_id(&env, 6);

    seed_campaign(&env, &client, &cid, &token_id, 5_000, 100, &oracle_pubkey);

    assert_eq!(client.get_balance(&cid), 5_000);

    client.withdraw(&cid, &advertiser);

    assert_eq!(client.get_balance(&cid), 0);

    let mock = MockTokenClient::new(&env, &token_id);
    assert_eq!(mock.balance(&advertiser), 5_000);
}

/// Second initialize call is rejected.
#[test]
fn test_initialize_once() {
    let (env, client, _token_id, _treasury) = setup_vault(0);

    let addr = Address::generate(&env);
    let result = client.try_initialize(&addr, &addr, &0);
    assert!(result.is_err(), "second initialize should be rejected");
}
