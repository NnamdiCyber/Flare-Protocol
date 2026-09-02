use soroban_sdk::{Address, Env, Symbol, Vec};

use crate::types::{AdvertiserProfile, CampaignIndex, EarnerProfile};

// ---------------------------------------------------------------------------
// Storage key constructors
// ---------------------------------------------------------------------------

/// Persistent storage key for an advertiser profile, keyed by their address.
fn advertiser_key(env: &Env, address: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "adv"), address.clone())
}

/// Persistent storage key for an earner profile, keyed by their address.
fn earner_key(env: &Env, address: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "earner"), address.clone())
}

/// Persistent storage key for the global campaigns list.
fn campaigns_key(env: &Env) -> Symbol {
    Symbol::new(env, "campaigns")
}

// ---------------------------------------------------------------------------
// Advertiser storage helpers
// ---------------------------------------------------------------------------

/// Read an advertiser profile. Returns `None` if not registered.
pub fn get_advertiser(env: &Env, address: &Address) -> Option<AdvertiserProfile> {
    env.storage()
        .persistent()
        .get(&advertiser_key(env, address))
}

/// Write (create or overwrite) an advertiser profile.
pub fn set_advertiser(env: &Env, profile: &AdvertiserProfile) {
    env.storage()
        .persistent()
        .set(&advertiser_key(env, &profile.address), profile);
}

// ---------------------------------------------------------------------------
// Earner storage helpers
// ---------------------------------------------------------------------------

/// Read an earner profile. Returns `None` if not registered.
pub fn get_earner(env: &Env, address: &Address) -> Option<EarnerProfile> {
    env.storage()
        .persistent()
        .get(&earner_key(env, address))
}

/// Write (create or overwrite) an earner profile.
pub fn set_earner(env: &Env, profile: &EarnerProfile) {
    env.storage()
        .persistent()
        .set(&earner_key(env, &profile.address), profile);
}

// ---------------------------------------------------------------------------
// Campaign index storage helpers
// ---------------------------------------------------------------------------

/// Read the full campaign index list. Returns an empty vec if none stored yet.
pub fn get_campaign_list(env: &Env) -> Vec<CampaignIndex> {
    env.storage()
        .persistent()
        .get(&campaigns_key(env))
        .unwrap_or_else(|| Vec::new(env))
}

/// Append a new `CampaignIndex` entry to the persistent campaign list.
pub fn push_campaign(env: &Env, entry: &CampaignIndex) {
    let mut list = get_campaign_list(env);
    list.push_back(entry.clone());
    env.storage()
        .persistent()
        .set(&campaigns_key(env), &list);
}
