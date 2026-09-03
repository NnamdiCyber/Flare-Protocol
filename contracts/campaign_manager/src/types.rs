use soroban_sdk::{contracttype, Address, BytesN, String};

// Re-export CampaignType from the registry crate so both contracts use the
// same canonical definition.  We cannot import across workspace crates in
// a Soroban no_std context, so we duplicate the enum here — keeping it
// byte-for-byte identical with registry/src/types.rs.
/// Identifies the marketing action type for a campaign.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CampaignType {
    Referral,
    Social,
    LearnToEarn,
    AdAttention,
}

/// Lifecycle state of a campaign.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CampaignState {
    Active,
    Paused,
    Expired,
    Drained,
}

/// Full on-chain record for a campaign.
///
/// Matches the `Campaign` struct in README.md exactly.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Campaign {
    /// 32-byte unique campaign identifier (supplied by the advertiser).
    pub id: BytesN<32>,
    /// Stellar address of the advertiser who owns this campaign.
    pub advertiser: Address,
    /// Marketing action type rewarded by this campaign.
    pub campaign_type: CampaignType,
    /// Stellar asset contract address used as the reward token (SEP-0041).
    pub asset: Address,
    /// Reward amount per verified action (in the asset's smallest unit).
    pub reward_per_action: i128,
    /// Total budget deposited when the campaign was created.
    pub total_budget: i128,
    /// Remaining undistributed budget.
    pub remaining_budget: i128,
    /// Maximum number of unique participants allowed.
    pub max_participants: u32,
    /// Number of unique participants who have claimed rewards so far.
    pub current_participants: u32,
    /// Unix timestamp (seconds) after which the campaign can be drained.
    pub expiry: u64,
    /// Advertiser-defined threshold, interpreted per module:
    /// - Learn-to-earn: minimum pass percentage (0–100)
    /// - Social: minimum follower count
    /// - Referral / Attention: module-specific numeric gate
    pub min_proof_threshold: u32,
    /// IPFS / Arweave URI pointing to off-chain campaign metadata and ad creatives.
    pub metadata_uri: String,
    /// Current lifecycle state of the campaign.
    pub state: CampaignState,
    /// ed25519 public key of the oracle backend that signs proofs for this campaign.
    pub oracle_pubkey: BytesN<32>,
}
