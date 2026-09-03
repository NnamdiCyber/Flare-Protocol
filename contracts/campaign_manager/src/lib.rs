#![no_std]

mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

use storage::{get_all_campaign_ids, get_campaign, push_campaign_id, set_campaign};
use types::{Campaign, CampaignState, CampaignType};

// ---------------------------------------------------------------------------
// Cross-contract client stubs
// ---------------------------------------------------------------------------
// Soroban cross-contract calls are made via generated client types.  In the
// no_std test harness we declare minimal interfaces for the two contracts
// this contract depends on: registry (index_campaign) and reward_vault
// (deposit / withdraw).  These are declared with `contracttype`-compatible
// signatures so the Soroban SDK can encode the invocations correctly.

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
// Contract-level configuration keys
// ---------------------------------------------------------------------------

/// Persistent key for the registry contract address.
fn registry_addr_key(env: &Env) -> soroban_sdk::Symbol {
    soroban_sdk::Symbol::new(env, "registry")
}

/// Persistent key for the reward_vault contract address.
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
    ///
    /// Must be called by the deployer immediately after deployment.
    pub fn initialize(env: Env, registry: Address, reward_vault: Address) {
        // Guard: only call once.
        if env.storage().persistent().has(&registry_addr_key(&env)) {
            panic!("already initialized");
        }
        env.storage()
            .persistent()
            .set(&registry_addr_key(&env), &registry);
        env.storage()
            .persistent()
            .set(&vault_addr_key(&env), &reward_vault);
    }

    // -----------------------------------------------------------------------
    // Campaign creation
    // -----------------------------------------------------------------------

    /// Create a campaign.
    ///
    /// The advertiser must authorize this call. Budget must be > 0 and expiry
    /// must be strictly in the future. On success:
    ///   1. Campaign record is written to persistent storage.
    ///   2. Registry contract is called to index the campaign.
    ///   3. Reward Vault contract is called to lock in the budget.
    pub fn create_campaign(env: Env, config: Campaign) {
        // Auth: only the advertiser can create their own campaign.
        config.advertiser.require_auth();

        // Validate inputs.
        if config.total_budget <= 0 {
            panic!("budget must be greater than zero");
        }
        if config.expiry <= env.ledger().timestamp() {
            panic!("expiry must be in the future");
        }
        if config.reward_per_action <= 0 {
            panic!("reward_per_action must be greater than zero");
        }

        // Ensure the campaign ID is not already taken.
        if get_campaign(&env, &config.id).is_some() {
            panic!("campaign id already exists");
        }

        // Build the stored campaign — force state to Active and remaining_budget
        // to total_budget regardless of what the caller supplied.
        let campaign = Campaign {
            remaining_budget: config.total_budget,
            current_participants: 0,
            state: CampaignState::Active,
            ..config.clone()
        };

        // Persist.
        set_campaign(&env, &campaign);
        push_campaign_id(&env, &campaign.id);

        // Cross-contract: register in registry.
        let registry: Address = env
            .storage()
            .persistent()
            .get(&registry_addr_key(&env))
            .expect("not initialized");
        let registry_client = RegistryClient::new(&env, &registry);
        registry_client.index_campaign(
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
            .expect("not initialized");
        let vault_client = RewardVaultClient::new(&env, &vault);
        vault_client.deposit(&campaign.id, &campaign.asset, &campaign.total_budget);
    }

    // -----------------------------------------------------------------------
    // Campaign state transitions
    // -----------------------------------------------------------------------

    /// Pause an Active campaign. Only the campaign's advertiser may call this.
    pub fn pause_campaign(env: Env, campaign_id: BytesN<32>) {
        let mut campaign = Self::load_campaign(&env, &campaign_id);
        campaign.advertiser.require_auth();

        if campaign.state != CampaignState::Active {
            panic!("campaign is not active");
        }
        campaign.state = CampaignState::Paused;
        set_campaign(&env, &campaign);
    }

    /// Resume a Paused campaign. Only the campaign's advertiser may call this.
    pub fn resume_campaign(env: Env, campaign_id: BytesN<32>) {
        let mut campaign = Self::load_campaign(&env, &campaign_id);
        campaign.advertiser.require_auth();

        if campaign.state != CampaignState::Paused {
            panic!("campaign is not paused");
        }
        campaign.state = CampaignState::Active;
        set_campaign(&env, &campaign);
    }

    /// Drain unspent budget back to the advertiser.
    ///
    /// Only callable when the campaign is Expired or Drained. Calls
    /// `reward_vault.withdraw` which transfers remaining tokens back to the
    /// advertiser.  Access control: only the advertiser.
    pub fn drain_campaign(env: Env, campaign_id: BytesN<32>) {
        let mut campaign = Self::load_campaign(&env, &campaign_id);
        campaign.advertiser.require_auth();

        // Auto-expire if past expiry timestamp.
        if campaign.state == CampaignState::Active
            || campaign.state == CampaignState::Paused
        {
            if env.ledger().timestamp() >= campaign.expiry {
                campaign.state = CampaignState::Expired;
                set_campaign(&env, &campaign);
            }
        }

        match campaign.state {
            CampaignState::Expired | CampaignState::Drained => {}
            _ => panic!("campaign must be expired or drained to withdraw"),
        }

        // Mark as fully drained before the external call.
        campaign.state = CampaignState::Drained;
        campaign.remaining_budget = 0;
        set_campaign(&env, &campaign);

        // Cross-contract: instruct vault to return remaining tokens.
        let vault: Address = env
            .storage()
            .persistent()
            .get(&vault_addr_key(&env))
            .expect("not initialized");
        let vault_client = RewardVaultClient::new(&env, &vault);
        vault_client.withdraw(&campaign_id);
    }

    /// Update the off-chain metadata URI for a campaign.
    ///
    /// Only the campaign's advertiser may call this.
    pub fn update_metadata(env: Env, campaign_id: BytesN<32>, uri: String) {
        let mut campaign = Self::load_campaign(&env, &campaign_id);
        campaign.advertiser.require_auth();

        campaign.metadata_uri = uri;
        set_campaign(&env, &campaign);
    }

    // -----------------------------------------------------------------------
    // Read functions
    // -----------------------------------------------------------------------

    /// Fetch a campaign by ID. Panics if not found.
    pub fn get_campaign(env: Env, campaign_id: BytesN<32>) -> Campaign {
        Self::load_campaign(&env, &campaign_id)
    }

    /// Return a paginated list of campaigns, optionally filtered by type.
    ///
    /// Only returns campaigns in the `Active` state.
    /// `page` is zero-based; `page_size` defaults to 20 if 0 is passed.
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

            // Only Active campaigns.
            if campaign.state != CampaignState::Active {
                continue;
            }

            // Optional type filter.
            if let Some(ref ct) = campaign_type {
                if &campaign.campaign_type != ct {
                    continue;
                }
            }

            // Skip earlier pages.
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

    fn load_campaign(env: &Env, id: &BytesN<32>) -> Campaign {
        get_campaign(env, id).expect("campaign not found")
    }
}
