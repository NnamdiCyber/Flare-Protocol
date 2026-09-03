#![no_std]

mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, contracterror, Address, BytesN, Env, String, Vec};

use storage::{
    get_advertiser, get_campaign_list, get_earner, push_campaign, set_advertiser, set_earner,
};
use types::{AdvertiserProfile, CampaignIndex, CampaignType, EarnerProfile};

// ---------------------------------------------------------------------------
// Contract errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum RegistryError {
    AdvertiserAlreadyRegistered = 1,
    AdvertiserNotFound          = 2,
    EarnerAlreadyRegistered     = 3,
    EarnerNotFound              = 4,
    AdvertiserNotRegistered     = 5,
}

// ---------------------------------------------------------------------------
// Registry contract
// ---------------------------------------------------------------------------

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    // -----------------------------------------------------------------------
    // Advertiser registration
    // -----------------------------------------------------------------------

    /// Register `address` as an advertiser.
    ///
    /// Open: any wallet can register. Returns AdvertiserAlreadyRegistered if
    /// the address is already registered.
    pub fn register_advertiser(
        env: Env,
        address: Address,
        name: String,
        website: String,
    ) -> Result<(), RegistryError> {
        address.require_auth();

        if get_advertiser(&env, &address).is_some() {
            return Err(RegistryError::AdvertiserAlreadyRegistered);
        }

        set_advertiser(
            &env,
            &AdvertiserProfile {
                address: address.clone(),
                name,
                website,
                total_campaigns: 0,
                total_spent: 0,
                registered_at: env.ledger().timestamp(),
            },
        );
        Ok(())
    }

    /// Read back an advertiser profile. Returns AdvertiserNotFound if missing.
    pub fn get_advertiser(
        env: Env,
        address: Address,
    ) -> Result<AdvertiserProfile, RegistryError> {
        get_advertiser(&env, &address).ok_or(RegistryError::AdvertiserNotFound)
    }

    // -----------------------------------------------------------------------
    // Earner registration
    // -----------------------------------------------------------------------

    /// Register `address` as an earner.
    ///
    /// Open: any wallet can register. Returns EarnerAlreadyRegistered if
    /// the address is already registered.
    pub fn register_earner(env: Env, address: Address) -> Result<(), RegistryError> {
        address.require_auth();

        if get_earner(&env, &address).is_some() {
            return Err(RegistryError::EarnerAlreadyRegistered);
        }

        set_earner(
            &env,
            &EarnerProfile {
                address: address.clone(),
                total_earned: 0,
                campaigns_completed: 0,
                registered_at: env.ledger().timestamp(),
            },
        );
        Ok(())
    }

    /// Read back an earner profile. Returns EarnerNotFound if missing.
    pub fn get_earner(env: Env, address: Address) -> Result<EarnerProfile, RegistryError> {
        get_earner(&env, &address).ok_or(RegistryError::EarnerNotFound)
    }

    // -----------------------------------------------------------------------
    // Campaign indexing
    // -----------------------------------------------------------------------

    /// Index a campaign in the registry.
    ///
    /// Called by the Campaign Manager on campaign creation.
    /// Returns AdvertiserNotRegistered if the advertiser is not registered.
    pub fn index_campaign(
        env: Env,
        campaign_id: BytesN<32>,
        advertiser: Address,
        campaign_type: CampaignType,
        asset: Address,
    ) -> Result<(), RegistryError> {
        let mut adv_profile = get_advertiser(&env, &advertiser)
            .ok_or(RegistryError::AdvertiserNotRegistered)?;

        push_campaign(
            &env,
            &CampaignIndex {
                campaign_id,
                advertiser: advertiser.clone(),
                campaign_type,
                asset,
                created_at: env.ledger().timestamp(),
            },
        );

        adv_profile.total_campaigns += 1;
        set_advertiser(&env, &adv_profile);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Campaign discovery
    // -----------------------------------------------------------------------

    /// Return a paginated slice of the campaign index.
    ///
    /// - `filter` — optional type filter.
    /// - `page`   — zero-based page number.
    /// - `limit`  — maximum entries per page.
    pub fn get_campaigns(
        env: Env,
        filter: Option<CampaignType>,
        page: u32,
        limit: u32,
    ) -> Vec<CampaignIndex> {
        let all = get_campaign_list(&env);
        let mut result: Vec<CampaignIndex> = Vec::new(&env);
        let mut filtered_count: u32 = 0;
        let start = page * limit;

        for i in 0..all.len() {
            let entry = all.get(i).unwrap();

            if let Some(ref f) = filter {
                if &entry.campaign_type != f {
                    continue;
                }
            }

            if filtered_count < start {
                filtered_count += 1;
                continue;
            }

            if result.len() >= limit {
                break;
            }

            result.push_back(entry);
            filtered_count += 1;
        }

        result
    }
}
