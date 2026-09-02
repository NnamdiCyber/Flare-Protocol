#![no_std]

mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

use storage::{
    get_advertiser, get_campaign_list, get_earner, push_campaign, set_advertiser, set_earner,
};
use types::{AdvertiserProfile, CampaignIndex, CampaignType, EarnerProfile};

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    // -----------------------------------------------------------------------
    // Advertiser registration
    // -----------------------------------------------------------------------

    /// Register `address` as an advertiser. The address must authorize this call.
    ///
    /// Open: any wallet can register. Panics if already registered.
    ///
    /// Matches README: `register_advertiser(name, website)` — the caller's address
    /// is passed explicitly so Soroban can enforce `require_auth`.
    pub fn register_advertiser(env: Env, address: Address, name: String, website: String) {
        address.require_auth();

        if get_advertiser(&env, &address).is_some() {
            panic!("advertiser already registered");
        }

        let profile = AdvertiserProfile {
            address: address.clone(),
            name,
            website,
            total_campaigns: 0,
            total_spent: 0,
            registered_at: env.ledger().timestamp(),
        };

        set_advertiser(&env, &profile);
    }

    /// Read back an advertiser profile. Panics if not registered.
    pub fn get_advertiser(env: Env, address: Address) -> AdvertiserProfile {
        get_advertiser(&env, &address).expect("advertiser not found")
    }

    // -----------------------------------------------------------------------
    // Earner registration
    // -----------------------------------------------------------------------

    /// Register `address` as an earner. The address must authorize this call.
    ///
    /// Open: any wallet can register. Panics if already registered.
    ///
    /// Matches README: `register_earner()` — caller address passed explicitly
    /// for `require_auth`.
    pub fn register_earner(env: Env, address: Address) {
        address.require_auth();

        if get_earner(&env, &address).is_some() {
            panic!("earner already registered");
        }

        let profile = EarnerProfile {
            address: address.clone(),
            total_earned: 0,
            campaigns_completed: 0,
            registered_at: env.ledger().timestamp(),
        };

        set_earner(&env, &profile);
    }

    /// Read back an earner profile. Panics if not registered.
    pub fn get_earner(env: Env, address: Address) -> EarnerProfile {
        get_earner(&env, &address).expect("earner not found")
    }

    // -----------------------------------------------------------------------
    // Campaign indexing
    // -----------------------------------------------------------------------

    /// Index a campaign in the registry.
    ///
    /// Intended to be called by the Campaign Manager contract on campaign creation.
    /// The `advertiser` address must already be registered.
    pub fn index_campaign(
        env: Env,
        campaign_id: BytesN<32>,
        advertiser: Address,
        campaign_type: CampaignType,
        asset: Address,
    ) {
        let mut adv_profile =
            get_advertiser(&env, &advertiser).expect("advertiser not registered");

        let entry = CampaignIndex {
            campaign_id,
            advertiser: advertiser.clone(),
            campaign_type,
            asset,
            created_at: env.ledger().timestamp(),
        };

        push_campaign(&env, &entry);

        // Increment the advertiser's campaign counter.
        adv_profile.total_campaigns += 1;
        set_advertiser(&env, &adv_profile);
    }

    // -----------------------------------------------------------------------
    // Campaign discovery
    // -----------------------------------------------------------------------

    /// Return a paginated slice of the campaign index.
    ///
    /// - `filter`: optionally restrict results to a specific `CampaignType`.
    /// - `page`:   zero-based page number.
    /// - `limit`:  maximum number of entries per page.
    pub fn get_campaigns(
        env: Env,
        filter: Option<CampaignType>,
        page: u32,
        limit: u32,
    ) -> Vec<CampaignIndex> {
        let all = get_campaign_list(&env);
        let mut result: Vec<CampaignIndex> = Vec::new(&env);

        // Number of filtered entries seen so far (used for offset calculation).
        let mut filtered_count: u32 = 0;
        let start = page * limit;

        for i in 0..all.len() {
            let entry = all.get(i).unwrap();

            // Apply optional type filter.
            if let Some(ref f) = filter {
                if &entry.campaign_type != f {
                    continue;
                }
            }

            // Skip entries that belong to earlier pages.
            if filtered_count < start {
                filtered_count += 1;
                continue;
            }

            // Stop once the page is full.
            if result.len() >= limit {
                break;
            }

            result.push_back(entry);
            filtered_count += 1;
        }

        result
    }
}
