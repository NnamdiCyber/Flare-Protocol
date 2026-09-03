use soroban_sdk::{contracttype, Address, BytesN};

/// Oracle-signed proof submitted by an earner to claim a reward.
///
/// Matches the `ClaimProof` struct in README.md exactly.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ClaimProof {
    /// 32-byte campaign identifier.
    pub campaign_id: BytesN<32>,
    /// Stellar address of the earner claiming the reward.
    pub earner: Address,
    /// SHA-256 hash of the specific action performed (content depends on module type).
    pub action_hash: BytesN<32>,
    /// Unix timestamp (seconds) at which the oracle signed the proof.
    pub timestamp: u64,
    /// ed25519 signature from the oracle backend over the canonical message.
    pub signature: BytesN<64>,
}
