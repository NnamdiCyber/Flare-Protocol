#![no_std]

pub mod storage;
pub mod types;
pub mod verify;

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct RewardVaultContract;

#[contractimpl]
impl RewardVaultContract {
    // Full implementation in next commit (lib.rs).
    pub fn ping(_env: Env) -> bool {
        true
    }
}
