use soroban_sdk::{BytesN, Env, Symbol, Vec};

use crate::types::Campaign;

// ---------------------------------------------------------------------------
// Storage key constructors
// ---------------------------------------------------------------------------

/// Persistent storage key for a single campaign record, keyed by its 32-byte ID.
fn campaign_key(env: &Env, id: &BytesN<32>) -> (Symbol, BytesN<32>) {
    (Symbol::new(env, "campaign"), id.clone())
}

/// Persistent storage key for the ordered list of all campaign IDs.
/// Used for paginated listing via `list_active_campaigns`.
fn campaign_ids_key(env: &Env) -> Symbol {
    Symbol::new(env, "campaign_ids")
}

// ---------------------------------------------------------------------------
// Campaign storage helpers
// ---------------------------------------------------------------------------

/// Read a campaign by ID. Returns `None` if not found.
pub fn get_campaign(env: &Env, id: &BytesN<32>) -> Option<Campaign> {
    env.storage()
        .persistent()
        .get(&campaign_key(env, id))
}

/// Write (create or overwrite) a campaign record.
pub fn set_campaign(env: &Env, campaign: &Campaign) {
    env.storage()
        .persistent()
        .set(&campaign_key(env, &campaign.id), campaign);
}

/// Append a campaign ID to the global ordered list.
/// Called once on campaign creation so listing is O(n) over IDs only.
pub fn push_campaign_id(env: &Env, id: &BytesN<32>) {
    let mut ids = get_all_campaign_ids(env);
    ids.push_back(id.clone());
    env.storage()
        .persistent()
        .set(&campaign_ids_key(env), &ids);
}

/// Return the full ordered list of campaign IDs.
pub fn get_all_campaign_ids(env: &Env) -> Vec<BytesN<32>> {
    env.storage()
        .persistent()
        .get(&campaign_ids_key(env))
        .unwrap_or_else(|| Vec::new(env))
}
