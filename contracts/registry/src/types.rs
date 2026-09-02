use soroban_sdk::{contracttype, Address, BytesN, String};

/// Identifies the marketing action type for a campaign.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CampaignType {
    Referral,
    Social,
    LearnToEarn,
    AdAttention,
}

/// On-chain profile for an advertiser.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AdvertiserProfile {
    /// Stellar address of the advertiser.
    pub address: Address,
    /// Display name of the advertiser / project.
    pub name: String,
    /// Website URL for the advertiser / project.
    pub website: String,
    /// Total number of campaigns created by this advertiser.
    pub total_campaigns: u32,
    /// Cumulative amount spent across all campaigns (in asset's smallest unit).
    pub total_spent: i128,
    /// Unix timestamp (seconds) when the advertiser registered.
    pub registered_at: u64,
}

/// On-chain profile for an earner.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EarnerProfile {
    /// Stellar address of the earner.
    pub address: Address,
    /// Cumulative amount earned across all campaigns (in various asset units).
    pub total_earned: i128,
    /// Number of distinct campaigns completed.
    pub campaigns_completed: u32,
    /// Unix timestamp (seconds) when the earner registered.
    pub registered_at: u64,
}

/// Lightweight index entry stored in the registry for each campaign.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CampaignIndex {
    /// 32-byte unique campaign identifier.
    pub campaign_id: BytesN<32>,
    /// Stellar address of the advertiser who created the campaign.
    pub advertiser: Address,
    /// Type of marketing action rewarded by this campaign.
    pub campaign_type: CampaignType,
    /// Stellar asset contract address used as the reward token (SEP-0041).
    pub asset: Address,
    /// Unix timestamp (seconds) when the campaign was created.
    pub created_at: u64,
}
