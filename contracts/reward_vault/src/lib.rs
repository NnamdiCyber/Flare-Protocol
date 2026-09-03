#![no_std]

pub mod storage;
pub mod types;

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct RewardVaultContract;

#[contractimpl]
impl RewardVaultContract {
    // Full implementation added in the next commit (verify.rs + lib.rs).
    pub fn ping(_env: Env) -> bool {
        true
    }
}
