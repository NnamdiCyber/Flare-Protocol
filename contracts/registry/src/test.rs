#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String,
};

use crate::types::CampaignType;
use crate::{RegistryContract, RegistryContractClient};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Deploy a fresh registry contract and return `(env, client)`.
fn setup() -> (Env, RegistryContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, RegistryContract);
    let client = RegistryContractClient::new(&env, &contract_id);
    (env, client)
}

/// Create a deterministic 32-byte campaign ID from a seed byte.
fn campaign_id(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Registering an advertiser stores the correct profile data.
#[test]
fn test_register_advertiser() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let name = String::from_str(&env, "Acme Corp");
    let website = String::from_str(&env, "https://acme.example");

    client.register_advertiser(&advertiser, &name, &website);

    let profile = client.get_advertiser(&advertiser);

    assert_eq!(profile.address, advertiser);
    assert_eq!(profile.name, name);
    assert_eq!(profile.website, website);
    assert_eq!(profile.total_campaigns, 0);
    assert_eq!(profile.total_spent, 0);
}

/// Registering the same advertiser twice should panic.
#[test]
#[should_panic(expected = "advertiser already registered")]
fn test_register_advertiser_duplicate() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let name = String::from_str(&env, "Acme Corp");
    let website = String::from_str(&env, "https://acme.example");

    client.register_advertiser(&advertiser, &name, &website);
    // Second call must panic.
    client.register_advertiser(&advertiser, &name, &website);
}

/// Registering an earner stores the correct profile data.
#[test]
fn test_register_earner() {
    let (env, client) = setup();

    let earner = Address::generate(&env);

    client.register_earner(&earner);

    let profile = client.get_earner(&earner);

    assert_eq!(profile.address, earner);
    assert_eq!(profile.total_earned, 0);
    assert_eq!(profile.campaigns_completed, 0);
}

/// Registering the same earner twice should panic.
#[test]
#[should_panic(expected = "earner already registered")]
fn test_register_earner_duplicate() {
    let (env, client) = setup();

    let earner = Address::generate(&env);

    client.register_earner(&earner);
    // Second call must panic.
    client.register_earner(&earner);
}

/// Indexing a campaign stores it and increments the advertiser's counter.
#[test]
fn test_index_campaign() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);

    client.register_advertiser(
        &advertiser,
        &String::from_str(&env, "Test Advertiser"),
        &String::from_str(&env, "https://test.example"),
    );

    let cid = campaign_id(&env, 1);

    client.index_campaign(&cid, &advertiser, &CampaignType::Referral, &asset);

    // Campaign should appear in the index.
    let campaigns = client.get_campaigns(&None, &0, &10);
    assert_eq!(campaigns.len(), 1);

    let entry = campaigns.get(0).unwrap();
    assert_eq!(entry.campaign_id, cid);
    assert_eq!(entry.advertiser, advertiser);
    assert_eq!(entry.asset, asset);

    // Advertiser's campaign count should be 1.
    let profile = client.get_advertiser(&advertiser);
    assert_eq!(profile.total_campaigns, 1);
}

/// Indexing a campaign for an unregistered advertiser should panic.
#[test]
#[should_panic(expected = "advertiser not registered")]
fn test_index_campaign_unregistered_advertiser() {
    let (env, client) = setup();

    let stranger = Address::generate(&env);
    let asset = Address::generate(&env);
    let cid = campaign_id(&env, 99);

    client.index_campaign(&cid, &stranger, &CampaignType::Social, &asset);
}

/// Paginated retrieval returns the correct slice of results.
#[test]
fn test_get_campaigns_pagination() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);

    client.register_advertiser(
        &advertiser,
        &String::from_str(&env, "Paginator"),
        &String::from_str(&env, "https://paginator.example"),
    );

    // Index 5 campaigns with different IDs.
    for seed in 1u8..=5 {
        let cid = campaign_id(&env, seed);
        // Advance ledger timestamp so created_at differs per entry.
        env.ledger().with_mut(|l| l.timestamp += 1);
        client.index_campaign(&cid, &advertiser, &CampaignType::Referral, &asset);
    }

    // Page 0, limit 2 → first two campaigns.
    let page0 = client.get_campaigns(&None, &0, &2);
    assert_eq!(page0.len(), 2);
    assert_eq!(page0.get(0).unwrap().campaign_id, campaign_id(&env, 1));
    assert_eq!(page0.get(1).unwrap().campaign_id, campaign_id(&env, 2));

    // Page 1, limit 2 → next two campaigns.
    let page1 = client.get_campaigns(&None, &1, &2);
    assert_eq!(page1.len(), 2);
    assert_eq!(page1.get(0).unwrap().campaign_id, campaign_id(&env, 3));
    assert_eq!(page1.get(1).unwrap().campaign_id, campaign_id(&env, 4));

    // Page 2, limit 2 → one remaining campaign.
    let page2 = client.get_campaigns(&None, &2, &2);
    assert_eq!(page2.len(), 1);
    assert_eq!(page2.get(0).unwrap().campaign_id, campaign_id(&env, 5));
}

/// Filtering by campaign type returns only matching entries.
#[test]
fn test_get_campaigns_filter_by_type() {
    let (env, client) = setup();

    let advertiser = Address::generate(&env);
    let asset = Address::generate(&env);

    client.register_advertiser(
        &advertiser,
        &String::from_str(&env, "Filter Test"),
        &String::from_str(&env, "https://filter.example"),
    );

    // Index 3 Referral campaigns and 2 Social campaigns.
    for seed in 1u8..=3 {
        client.index_campaign(
            &campaign_id(&env, seed),
            &advertiser,
            &CampaignType::Referral,
            &asset,
        );
    }
    for seed in 4u8..=5 {
        client.index_campaign(
            &campaign_id(&env, seed),
            &advertiser,
            &CampaignType::Social,
            &asset,
        );
    }

    let referrals = client.get_campaigns(&Some(CampaignType::Referral), &0, &10);
    assert_eq!(referrals.len(), 3);

    let socials = client.get_campaigns(&Some(CampaignType::Social), &0, &10);
    assert_eq!(socials.len(), 2);

    // LearnToEarn filter should return empty.
    let learn = client.get_campaigns(&Some(CampaignType::LearnToEarn), &0, &10);
    assert_eq!(learn.len(), 0);
}
