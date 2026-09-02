#![no_std]

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct RewardVaultContract;

#[contractimpl]
impl RewardVaultContract {
    // Stub — implemented in Day 2
    pub fn ping(_env: Env) -> bool {
        true
    }
}
