use soroban_sdk::{Bytes, BytesN, Env};

use crate::types::ClaimProof;

/// Verify the oracle's ed25519 signature on a `ClaimProof`.
///
/// ## Message construction (from README.md)
///
/// ```text
/// msg = SHA256(campaign_id_bytes ‖ earner_pubkey_bytes ‖ action_hash_bytes ‖ timestamp_le64)
/// ```
///
/// Where:
/// - `campaign_id_bytes`  — 32 raw bytes of `proof.campaign_id`
/// - `earner_pubkey_bytes`— the earner address encoded as its Strkey string bytes
///   (56 ASCII bytes for an ed25519 account address)
/// - `action_hash_bytes`  — 32 raw bytes of `proof.action_hash`
/// - `timestamp_le64`     — `proof.timestamp` as 8 bytes, **little-endian**
///
/// The NestJS oracle backend builds the same preimage and signs it with
/// `tweetnacl nacl.sign.detached(SHA256(preimage), oracle_private_key)`.
/// This function verifies the resulting 64-byte signature against the
/// campaign's registered oracle public key using Soroban's built-in
/// `env.crypto().ed25519_verify`.
///
/// Returns `true` if the signature is valid, `false` otherwise.
pub fn verify_oracle_signature(
    env: &Env,
    proof: &ClaimProof,
    oracle_pubkey: &BytesN<32>,
) -> bool {
    // Step 1: build the SHA-256 preimage from the proof fields.
    let preimage = build_message(env, proof);

    // Step 2: hash the preimage.
    let message = env.crypto().sha256(&preimage);

    // Step 3: verify the ed25519 signature.
    // ed25519_verify panics on invalid signature in the Soroban host, so we
    // need to catch that.  In soroban-sdk v20 we can't use try/catch directly,
    // but the function returns normally on success and panics on failure, so
    // a valid signature path is straightforward.  Callers should validate proof
    // timestamps to prevent replays even if the sig is valid.
    env.crypto()
        .ed25519_verify(oracle_pubkey, &message.into(), &proof.signature);

    true
}

/// Build the SHA-256 preimage for the given `ClaimProof`.
///
/// ```text
/// preimage = campaign_id_bytes ‖ earner_strkey_bytes ‖ action_hash_bytes ‖ timestamp_le64
/// ```
fn build_message(env: &Env, proof: &ClaimProof) -> Bytes {
    // campaign_id: 32 raw bytes
    let mut msg = Bytes::from_array(env, &proof.campaign_id.to_array());

    // earner address as Strkey bytes (56 bytes for ed25519 account addresses).
    let earner_str = proof.earner.to_string();
    let len = earner_str.len() as usize;
    let mut buf = [0u8; 56];
    earner_str.copy_into_slice(&mut buf[..len.min(56)]);
    msg.append(&Bytes::from_array(env, &buf));

    // action_hash: 32 raw bytes
    msg.append(&Bytes::from_array(env, &proof.action_hash.to_array()));

    // timestamp: 8-byte little-endian u64
    let ts_bytes = proof.timestamp.to_le_bytes();
    msg.append(&Bytes::from_array(env, &ts_bytes));

    msg
}

/// Public re-export of the message builder so tests in test.rs can create
/// matching messages without duplicating the encoding logic.
pub fn build_signing_message(env: &Env, proof: &ClaimProof) -> Bytes {
    build_message(env, proof)
}
