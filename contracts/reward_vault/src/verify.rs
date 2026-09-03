use soroban_sdk::{Bytes, BytesN, Env};

use crate::types::ClaimProof;

/// Verify the oracle's ed25519 signature on a `ClaimProof`.
///
/// ## Message construction (from README.md)
///
/// ```text
/// msg = SHA256(campaign_id_bytes ‖ earner_strkey_bytes ‖ action_hash_bytes ‖ timestamp_le64)
/// ```
///
/// Fields encoded as:
/// - `campaign_id_bytes`   — 32 raw bytes of `proof.campaign_id`
/// - `earner_strkey_bytes` — earner address as 56-byte ASCII Strkey
/// - `action_hash_bytes`   — 32 raw bytes of `proof.action_hash`
/// - `timestamp_le64`      — 8 bytes, little-endian u64
///
/// The NestJS backend builds the identical preimage and signs with
/// `nacl.sign.detached(SHA256(preimage), oracle_private_key)`.
///
/// Returns `true` on valid signature.  Panics (host trap) on invalid signature
/// when running on-chain or in WASM mode.  In native test mode the pre-check
/// path returns `false` instead to allow test assertions.
pub fn verify_oracle_signature(
    env: &Env,
    proof: &ClaimProof,
    oracle_pubkey: &BytesN<32>,
) -> bool {
    let preimage = build_message(env, proof);
    let message_hash = env.crypto().sha256(&preimage);

    // In native (non-WASM) test builds we use ed25519-dalek to pre-verify so
    // that a bad signature returns `false` instead of triggering an abort.
    // In production (WASM) the Soroban host's ed25519_verify is authoritative.
    #[cfg(all(test, not(target_family = "wasm")))]
    {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};

        let pk_bytes = oracle_pubkey.to_array();
        let sig_bytes: [u8; 64] = proof.signature.to_array();
        let msg_bytes = message_hash.to_array();

        let vk = match VerifyingKey::from_bytes(&pk_bytes) {
            Ok(k) => k,
            Err(_) => return false,
        };
        let sig = Signature::from_bytes(&sig_bytes);
        return vk.verify(&msg_bytes, &sig).is_ok();
    }

    // Production path: Soroban host verifies and traps on failure.
    #[allow(unreachable_code)]
    {
        env.crypto()
            .ed25519_verify(oracle_pubkey, &message_hash.into(), &proof.signature);
        true
    }
}

/// Build the SHA-256 preimage from a ClaimProof's fields.
fn build_message(env: &Env, proof: &ClaimProof) -> Bytes {
    // campaign_id: 32 raw bytes
    let mut msg = Bytes::from_array(env, &proof.campaign_id.to_array());

    // earner: 56-byte Strkey string
    let earner_str = proof.earner.to_string();
    let len = earner_str.len() as usize;
    let mut buf = [0u8; 56];
    earner_str.copy_into_slice(&mut buf[..len.min(56)]);
    msg.append(&Bytes::from_array(env, &buf));

    // action_hash: 32 raw bytes
    msg.append(&Bytes::from_array(env, &proof.action_hash.to_array()));

    // timestamp: 8-byte little-endian u64
    msg.append(&Bytes::from_array(env, &proof.timestamp.to_le_bytes()));

    msg
}

/// Public re-export of the message builder for tests.
pub fn build_signing_message(env: &Env, proof: &ClaimProof) -> Bytes {
    build_message(env, proof)
}
