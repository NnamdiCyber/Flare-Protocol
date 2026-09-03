#![no_std]

mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, contracterror, Address, BytesN, Env, String, Vec};

use storage::{get_all_campaign_ids, get_campaign, push_campaign_id, set_campaign};
use types::{Campaign, CampaignState, CampaignType};

// ---------------------------------------------------------------------------
// Cross-contract client stubs
// ---------------------------------------------------------------------------

mod registry_client {
    use soroban_sdk::{contractclient, Address, BytesN, Env};
    use crate::types::CampaignType;

    #[allow(dead_code)]
    #[contractclient(name = "RegistryClient")]
    pub trait RegistryInterface {
        fn index_campaign(
            env: Env,
            campaign_id: BytesN<32>,
            advertiser: Address,
            campaign_type: CampaignType,
            asset: Address,
        );
    }
}

mod vault_client {
    use soroban_sdk::{contractclient, Address, BytesN, Env};

    #[allow(dead_code)]
    #[contractclient(name = "RewardVaultClient")]
    pub trait RewardVaultInterface {
        fn deposit(
            env: Env,
            campaign_id: BytesN<32>,
            asset: Address,
            amount: i128,
        );
        fn withdraw(env: Env, campaign_id: BytesN<32>);
    }
}

use registry_client::RegistryClient;
use vault_client::RewardVaultClient;

// ---------------------------------------------------------------------------
// Contract error codes
// Functions return Result<T, CampaignError> so try_* client methods can catch
// errors without the process aborting.
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum CampaignError {
    AlreadyInitialized  = 1,
    NotInitialized      = 2,
    InvalidBudget       = 3,
    InvalidExpiry       = 4,
    InvalidReward       = 5,
    CampaignIdExists    = 6,
    CampaignNotFound    = 7,
    NotActive           = 8,
    NotPaused           = 9,
    NotExpiredOrDrained = 10,
}

// ---------------------------------------------------------------------------
// Contract-level storage key helpers
// ---------------------------------------------------------------------------

fn registry_addr_key(env: &Env) -> soroban_sdk::Symbol {
    soroban_sdk::Symbol::new(env, "registry")
}

fn vault_addr_key(env: &Env) -> soroban_sdk::Symbol {
    soroban_sdk::Symbol::new(env, "vault")
}

// ---------------------------------------------------------------------------
// CampaignManager contract
// ---------------------------------------------------------------------------

#[contract]
pub struct CampaignManagerContract;

#[contractimpl]
impl CampaignManagerContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// One-time initialisation — store cross-contract addresses.
    pub fn initialize(
        env: Env,
        registry: Address,
        reward_vault: Address,
    ) -> Result<(), CampaignError> {
        if env.storage().persistent().has(&registry_addr_key(&env)) {
            return Err(CampaignError::AlreadyInitialized);
        }
        env.storage()
            .persistent()
            .set(&registry_addr_key(&env), &registry);
        env.storage()
            .persistent()
            .set(&vault_addr_key(&env), &reward_vault);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Campaign creation
    // -----------------------------------------------------------------------

    /// Create a campaign. Budget must be > 0; expiry must be in the future.
    /// Calls registry.index_campaign and reward_vault.deposit.
    pub fn create_campaign(env: Env, config: Campaign) -> Result<(), CampaignError> {
        config.advertiser.require_auth();

        if config.total_budget <= 0 {
            return Err(CampaignError::InvalidBudget);
        }
        if config.expiry <= env.ledger().timestamp() {
            return Err(CampaignError::InvalidExpiry);
        }
        if config.reward_per_action <= 0 {
            return Err(CampaignError::InvalidReward);
        }
        if get_campaign(&env, &config.id).is_some() {
            return Err(CampaignError::CampaignIdExists);
        }

        let campaign = Campaign {
            remaining_budget: config.total_budget,
            current_participants: 0,
            state: CampaignState::Active,
            ..config.clone()
        };

        set_campaign(&env, &campaign);
        push_campaign_id(&env, &campaign.id);

        // Cross-contract: register in registry.
        let registry: Address = env
            .storage()
            .persistent()
            .get(&registry_addr_key(&env))
            .ok_or(CampaignError::NotInitialized)?;
        RegistryClient::new(&env, &registry).index_campaign(
            &campaign.id,
            &campaign.advertiser,
            &campaign.campaign_type,
            &campaign.asset,
        );

        // Cross-contract: deposit budget into vault.
        let vault: Address = env
            .storage()
            .persistent()
            .get(&vault_addr_key(&env))
            .ok_or(CampaignError::NotInitialized)?;
        RewardVaultClient::new(&env, &vault)
            .deposit(&campaign.id, &campaign.asset, &campaign.total_budget);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Campaign state transitions
    // -----------------------------------------------------------------------

    /// Pause an Active campaign. Only the campaign's advertiser may call this.
    pub fn pause_campaign(
        env: Env,
        campaign_id: BytesN<32>,
    ) -> Result<(), CampaignError> {
        let mut campaign = Self::load_campaign(&env, &campaign_id)?;
        campaign.advertiser.require_auth();

        if campaign.state != CampaignState::Active {
            return Err(CampaignError::NotActive);
        }
        campaign.state = CampaignState::Paused;
        set_campaign(&env, &campaign);
        Ok(())
    }

    /// Resume a Paused campaign. Only the campaign's advertiser may call this.
    pub fn resume_campaign(
        env: Env,
        campaign_id: BytesN<32>,
    ) -> Result<(), CampaignError> {
        let mut campaign = Self::load_campaign(&env, &campaign_id)?;
        campaign.advertiser.require_auth();

        if campaign.state != CampaignState::Paused {
            return Err(CampaignError::NotPaused);
        }
        campaign.state = CampaignState::Active;
        set_campaign(&env, &campaign);
        Ok(())
    }

    /// Drain unspent budget. Only allowed when Expired or Drained.
    /// Auto-expires the campaign if the ledger timestamp >= expiry.
    pub fn drain_campaign(
        env: Env,
        campaign_id: BytesN<32>,
    ) -> Result<(), CampaignError> {
        let mut campaign = Self::load_campaign(&env, &campaign_id)?;
        campaign.advertiser.require_auth();

        // Auto-expire if past expiry timestamp.
        if (campaign.state == CampaignState::Active
            || campaign.state == CampaignState::Paused)
            && env.ledger().timestamp() >= campaign.expiry
        {
            campaign.state = CampaignState::Expired;
            set_campaign(&env, &campaign);
        }

        match campaign.state {
            CampaignState::Expired | CampaignState::Drained => {}
            _ => return Err(CampaignError::NotExpiredOrDrained),
        }

        // Checks-effects-interactions: update state before external call.
        campaign.state = CampaignState::Drained;
        campaign.remaining_budget = 0;
        set_campaign(&env, &campaign);

        let vault: Address = env
            .storage()
            .persistent()
            .get(&vault_addr_key(&env))
            .ok_or(CampaignError::NotInitialized)?;
        RewardVaultClient::new(&env, &vault).withdraw(&campaign_id);

        Ok(())
    }

    /// Update the off-chain metadata URI. Advertiser only.
    pub fn update_metadata(
        env: Env,
        campaign_id: BytesN<32>,
        uri: String,
    ) -> Result<(), CampaignError> {
        let mut campaign = Self::load_campaign(&env, &campaign_id)?;
        campaign.advertiser.require_auth();
        campaign.metadata_uri = uri;
        set_campaign(&env, &campaign);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Read functions
    // -----------------------------------------------------------------------

    /// Fetch a campaign by ID. Returns CampaignNotFound if missing.
    pub fn get_campaign(
        env: Env,
        campaign_id: BytesN<32>,
    ) -> Result<Campaign, CampaignError> {
        Self::load_campaign(&env, &campaign_id)
    }

    /// Paginated listing of Active campaigns, optionally filtered by type.
    /// Page is zero-based. Returns up to 20 campaigns per page.
    pub fn list_active_campaigns(
        env: Env,
        campaign_type: Option<CampaignType>,
        page: u32,
    ) -> Vec<Campaign> {
        let page_size: u32 = 20;
        let ids = get_all_campaign_ids(&env);
        let mut result: Vec<Campaign> = Vec::new(&env);
        let mut filtered_count: u32 = 0;
        let start = page * page_size;

        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let campaign = match get_campaign(&env, &id) {
                Some(c) => c,
                None => continue,
            };

            if campaign.state != CampaignState::Active {
                continue;
            }

            if let Some(ref ct) = campaign_type {
                if &campaign.campaign_type != ct {
                    continue;
                }
            }

            if filtered_count < start {
                filtered_count += 1;
                continue;
            }

            if result.len() >= page_size {
                break;
            }

            result.push_back(campaign);
            filtered_count += 1;
        }

        result
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn load_campaign(env: &Env, id: &BytesN<32>) -> Result<Campaign, CampaignError> {
        get_campaign(env, id).ok_or(CampaignError::CampaignNotFound)
    }
}
