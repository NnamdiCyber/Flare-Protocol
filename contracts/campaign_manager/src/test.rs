#![cfg(test)]

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String,
};

use crate::types::{Campaign, CampaignState, CampaignType};
use crate::{CampaignManagerContract, CampaignManagerContractClient};

// ---------------------------------------------------------------------------
// Mock Registry contract
// ---------------------------------------------------------------------------

#[contract]
pub struct MockRegistry;

#[contractimpl]
impl MockRegistry {
    pub fn index_campaign(
        _env: Env,
        _campaign_id: BytesN<32>,
        _advertiser: Address,
        _campaign_type: CampaignType,
        _asset: Address,
    ) {
        // No-op: tests only verify CampaignManager state.
    }
}

// ---------------------------------------------------------------------------
// Mock RewardVault contract
// ---------------------------------------------------------------------------

#[contract]
pub struct MockVault;

#[contractimpl]
impl MockVault {
    pub fn deposit(
        _env: Env,
        _campaign_id: BytesN<32>,
        _asset: Address,
        _amount: i128,
    ) {
        // No-op.
    }

    pub fn withdraw(_env: Env, _campaign_id: BytesN<32>) {
        // No-op.
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup() -> (Env, CampaignManagerContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register_contract(None, MockRegistry);
    let vault_id = env.register_contract(None, MockVault);

    let cm_id = env.register_contract(None, CampaignManagerContract);
    let client = CampaignManagerContractClient::new(&env, &cm_id);

    // initialize() returns () on success; panics on error — so direct call is fine.
    client.initialize(&registry_id, &vault_id);

    (env, client)
}

fn make_campaign(
    env: &Env,
    advertiser: &Address,
    asset: &Address,
    id_seed: u8,
    expiry_offset: u64,
) -> Campaign {
    Campaign {
        id: BytesN::from_array(env, &[id_seed; 32]),
        advertiser: advertiser.clone(),
        campaign_type: CampaignType::Referral,
        asset: asset.clone(),
        reward_per_action: 100,
        total_budget: 10_000,
        remaining_budget: 10_000,
        max_participants: 100,
        current_participants: 0,
        expiry: env.ledger().timestamp() + expiry_offset,
        min_proof_threshold: 0,
        metadata_uri: String::from_str(env, "ipfs://test"),
        state: CampaignState::Active,
        oracle_pubkey: BytesN::from_array(env, &[0xAB; 32]),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Creating a campaign stores it with state == Active and correct fields.
#[test]
fn test_create_campaign() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 1, 3600);

    client.create_campaign(&config);

    let stored = client.get_campaign(&config.id);
    assert_eq!(stored.state, CampaignState::Active);
    assert_eq!(stored.advertiser, advertiser);
    assert_eq!(stored.total_budget, 10_000);
    assert_eq!(stored.remaining_budget, 10_000);
    assert_eq!(stored.current_participants, 0);
}

/// Creating a campaign with budget == 0 returns an error.
#[test]
fn test_create_campaign_zero_budget_rejected() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let mut config = make_campaign(&env, &advertiser, &asset, 2, 3600);
    config.total_budget = 0;

    // try_create_campaign returns Result<Result<(), CampaignError>, soroban_sdk::Error>
    let result = client.try_create_campaign(&config);
    assert!(result.is_err(), "zero budget should be rejected");
}

/// Creating a campaign with past expiry returns an error.
#[test]
fn test_create_campaign_past_expiry_rejected() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let mut config = make_campaign(&env, &advertiser, &asset, 3, 3600);
    config.expiry = 0;

    let result = client.try_create_campaign(&config);
    assert!(result.is_err(), "past expiry should be rejected");
}

/// pause_campaign: Active → Paused; resume_campaign: Paused → Active.
#[test]
fn test_pause_resume() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 4, 3600);

    client.create_campaign(&config);

    client.pause_campaign(&config.id);
    assert_eq!(client.get_campaign(&config.id).state, CampaignState::Paused);

    client.resume_campaign(&config.id);
    assert_eq!(client.get_campaign(&config.id).state, CampaignState::Active);
}

/// Drain before expiry returns an error.
#[test]
fn test_drain_requires_expiry() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 5, 3600);
    client.create_campaign(&config);

    let result = client.try_drain_campaign(&config.id);
    assert!(result.is_err(), "drain before expiry should return an error");
}

/// Drain after expiry transitions campaign to Drained with 0 budget.
#[test]
fn test_drain_after_expiry_succeeds() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 6, 10);
    client.create_campaign(&config);

    env.ledger().with_mut(|l| l.timestamp += 100);

    client.drain_campaign(&config.id);

    let drained = client.get_campaign(&config.id);
    assert_eq!(drained.state, CampaignState::Drained);
    assert_eq!(drained.remaining_budget, 0);
}

/// The stored advertiser field is the creating address, not a stranger.
#[test]
fn test_advertiser_integrity() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let stranger = Address::generate(&env);
    let asset = Address::generate(&env);

    let config = make_campaign(&env, &advertiser, &asset, 7, 3600);
    client.create_campaign(&config);

    let stored = client.get_campaign(&config.id);
    assert_eq!(stored.advertiser, advertiser);
    assert_ne!(stored.advertiser, stranger);
}

/// update_metadata stores the new URI.
#[test]
fn test_update_metadata() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 8, 3600);
    client.create_campaign(&config);

    let new_uri = String::from_str(&env, "ipfs://new-metadata-hash");
    client.update_metadata(&config.id, &new_uri);

    assert_eq!(client.get_campaign(&config.id).metadata_uri, new_uri);
}

/// list_active_campaigns returns only Active campaigns.
#[test]
fn test_list_active_campaigns() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);

    for seed in 10u8..=12 {
        let config = make_campaign(&env, &advertiser, &asset, seed, 3600);
        client.create_campaign(&config);
    }

    client.pause_campaign(&BytesN::from_array(&env, &[11u8; 32]));

    let active = client.list_active_campaigns(&None, &0);
    assert_eq!(active.len(), 2, "only 2 of 3 campaigns should be Active");
}

/// list_active_campaigns filters by type correctly.
#[test]
fn test_list_active_campaigns_type_filter() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);

    let mut c1 = make_campaign(&env, &advertiser, &asset, 20, 3600);
    c1.campaign_type = CampaignType::Referral;

    let mut c2 = make_campaign(&env, &advertiser, &asset, 21, 3600);
    c2.campaign_type = CampaignType::Social;

    client.create_campaign(&c1);
    client.create_campaign(&c2);

    let referrals = client.list_active_campaigns(&Some(CampaignType::Referral), &0);
    assert_eq!(referrals.len(), 1);

    let socials = client.list_active_campaigns(&Some(CampaignType::Social), &0);
    assert_eq!(socials.len(), 1);
}

/// Second initialize call returns an error.
#[test]
fn test_initialize_once() {
    let (env, client) = setup(); // already initialized

    let addr = Address::generate(&env);
    let result = client.try_initialize(&addr, &addr);
    assert!(result.is_err(), "second initialize should be rejected");
}

/// Pausing an already-Paused campaign returns an error.
#[test]
fn test_pause_already_paused() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 30, 3600);
    client.create_campaign(&config);

    client.pause_campaign(&config.id);

    let result = client.try_pause_campaign(&config.id);
    assert!(result.is_err(), "pausing a Paused campaign should return an error");
}

/// Resuming an Active campaign (not Paused) returns an error.
#[test]
fn test_resume_active_rejected() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 31, 3600);
    client.create_campaign(&config);

    let result = client.try_resume_campaign(&config.id);
    assert!(result.is_err(), "resuming an Active campaign should return an error");
}

/// Duplicate campaign ID returns an error.
#[test]
fn test_duplicate_campaign_id_rejected() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);
    let config = make_campaign(&env, &advertiser, &asset, 40, 3600);

    client.create_campaign(&config);

    let result = client.try_create_campaign(&config);
    assert!(result.is_err(), "duplicate campaign ID should be rejected");
}

/// get_campaign on a non-existent ID returns an error.
#[test]
fn test_get_nonexistent_campaign() {
    let (env, client) = setup();

    let fake_id = BytesN::from_array(&env, &[0xFFu8; 32]);
    let result = client.try_get_campaign(&fake_id);
    assert!(result.is_err(), "get_campaign on missing ID should return an error");
}
