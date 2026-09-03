use soroban_sdk::{Address, Bytes, BytesN, Env, Symbol};

// ---------------------------------------------------------------------------
// Storage key constructors
// ---------------------------------------------------------------------------

/// Persistent key for the balance (i128) held for a given campaign.
fn balance_key(env: &Env, campaign_id: &BytesN<32>) -> (Symbol, BytesN<32>) {
    (Symbol::new(env, "balance"), campaign_id.clone())
}

/// Persistent key for the oracle pubkey registered for a given campaign.
fn oracle_key(env: &Env, campaign_id: &BytesN<32>) -> (Symbol, BytesN<32>) {
    (Symbol::new(env, "oracle"), campaign_id.clone())
}

/// Persistent key for the reward-per-action amount for a given campaign.
fn reward_key(env: &Env, campaign_id: &BytesN<32>) -> (Symbol, BytesN<32>) {
    (Symbol::new(env, "reward"), campaign_id.clone())
}

/// Persistent key for the asset contract address for a given campaign.
fn asset_key(env: &Env, campaign_id: &BytesN<32>) -> (Symbol, BytesN<32>) {
    (Symbol::new(env, "asset"), campaign_id.clone())
}

/// Persistent key for the protocol fee rate in basis points (e.g. 250 = 2.5%).
fn fee_rate_key(env: &Env) -> Symbol {
    Symbol::new(env, "fee_rate")
}

/// Persistent key for the treasury address that receives protocol fees.
fn treasury_key(env: &Env) -> Symbol {
    Symbol::new(env, "treasury")
}

/// Persistent key for the nullifier map entry.
///
/// The key is the raw 32-byte SHA-256 hash of (campaign_id ‖ earner_bytes ‖ action_hash).
/// A stored value of `true` means the nullifier has been spent.
fn nullifier_key(env: &Env, nullifier: &BytesN<32>) -> (Symbol, BytesN<32>) {
    (Symbol::new(env, "null"), nullifier.clone())
}

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

pub fn get_balance(env: &Env, campaign_id: &BytesN<32>) -> i128 {
    env.storage()
        .persistent()
        .get(&balance_key(env, campaign_id))
        .unwrap_or(0)
}

pub fn set_balance(env: &Env, campaign_id: &BytesN<32>, amount: i128) {
    env.storage()
        .persistent()
        .set(&balance_key(env, campaign_id), &amount);
}

// ---------------------------------------------------------------------------
// Oracle pubkey helpers
// ---------------------------------------------------------------------------

pub fn get_oracle_pubkey(env: &Env, campaign_id: &BytesN<32>) -> Option<BytesN<32>> {
    env.storage()
        .persistent()
        .get(&oracle_key(env, campaign_id))
}

pub fn set_oracle_pubkey(env: &Env, campaign_id: &BytesN<32>, pubkey: &BytesN<32>) {
    env.storage()
        .persistent()
        .set(&oracle_key(env, campaign_id), pubkey);
}

// ---------------------------------------------------------------------------
// Reward-per-action helpers
// ---------------------------------------------------------------------------

pub fn get_reward_per_action(env: &Env, campaign_id: &BytesN<32>) -> i128 {
    env.storage()
        .persistent()
        .get(&reward_key(env, campaign_id))
        .unwrap_or(0)
}

pub fn set_reward_per_action(env: &Env, campaign_id: &BytesN<32>, amount: i128) {
    env.storage()
        .persistent()
        .set(&reward_key(env, campaign_id), &amount);
}

// ---------------------------------------------------------------------------
// Asset address helpers
// ---------------------------------------------------------------------------

pub fn get_asset(env: &Env, campaign_id: &BytesN<32>) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&asset_key(env, campaign_id))
}

pub fn set_asset(env: &Env, campaign_id: &BytesN<32>, asset: &Address) {
    env.storage()
        .persistent()
        .set(&asset_key(env, campaign_id), asset);
}

// ---------------------------------------------------------------------------
// Fee rate + treasury helpers
// ---------------------------------------------------------------------------

pub fn get_fee_rate(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&fee_rate_key(env))
        .unwrap_or(0)
}

pub fn set_fee_rate(env: &Env, fee_rate: u32) {
    env.storage()
        .persistent()
        .set(&fee_rate_key(env), &fee_rate);
}

pub fn get_treasury(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&treasury_key(env))
}

pub fn set_treasury(env: &Env, treasury: &Address) {
    env.storage()
        .persistent()
        .set(&treasury_key(env), treasury);
}

// ---------------------------------------------------------------------------
// Nullifier helpers
// ---------------------------------------------------------------------------

/// Check whether the nullifier derived from (campaign_id ‖ earner_bytes ‖ action_hash)
/// has already been spent.
pub fn nullifier_exists(env: &Env, nullifier: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .has(&nullifier_key(env, nullifier))
}

/// Mark a nullifier as spent, preventing double-claims forever.
pub fn set_nullifier(env: &Env, nullifier: &BytesN<32>) {
    env.storage()
        .persistent()
        .set(&nullifier_key(env, nullifier), &true);
}

// ---------------------------------------------------------------------------
// Nullifier construction
// ---------------------------------------------------------------------------

/// Compute the nullifier for a (campaign_id, earner, action_hash) triple.
///
/// nullifier = SHA256(campaign_id_bytes ‖ earner_strkey_bytes ‖ action_hash_bytes)
///
/// Matches the spec in README.md: "Nullifier map key: use SHA256(campaign_id ‖
/// earner_bytes ‖ action_hash) as the storage key".
pub fn compute_nullifier(
    env: &Env,
    campaign_id: &BytesN<32>,
    earner: &Address,
    action_hash: &BytesN<32>,
) -> BytesN<32> {
    // campaign_id as raw bytes (32 bytes)
    let mut preimage = Bytes::from_array(env, &campaign_id.to_array());

    // earner address as Strkey string bytes.
    // A Stellar account Strkey is 56 ASCII characters; a contract Strkey is also 56.
    // We copy into a fixed 56-byte buffer.
    let earner_str = earner.to_string();
    let len = earner_str.len() as usize;
    // Max Strkey length is 56 bytes for ed25519 account addresses.
    let mut buf = [0u8; 56];
    let buf_slice = &mut buf[..len.min(56)];
    earner_str.copy_into_slice(buf_slice);
    let earner_bytes = Bytes::from_array(env, &buf);
    preimage.append(&earner_bytes);

    // action_hash as raw bytes (32 bytes)
    preimage.append(&Bytes::from_array(env, &action_hash.to_array()));

    env.crypto().sha256(&preimage)
}
