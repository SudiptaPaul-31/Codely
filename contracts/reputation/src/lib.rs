#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Score(Address),
    Actions(Address),
    Admin,
}

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn add_points(env: Env, user: Address, amount: u32, action: Symbol) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        
        let mut score: u32 = env.storage().persistent().get(&DataKey::Score(user.clone())).unwrap_or(0);
        score = score.saturating_add(amount);
        env.storage().persistent().set(&DataKey::Score(user.clone()), &score);
        
        let mut actions: Vec<Symbol> = env.storage().persistent().get(&DataKey::Actions(user.clone())).unwrap_or_else(|| Vec::new(&env));
        actions.push_back(action.clone());
        env.storage().persistent().set(&DataKey::Actions(user.clone()), &actions);
        
        env.events().publish((Symbol::new(&env, "add_points"), user.clone()), (amount, action));
    }

    pub fn deduct_points(env: Env, user: Address, amount: u32, action: Symbol) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut score: u32 = env.storage().persistent().get(&DataKey::Score(user.clone())).unwrap_or(0);
        score = score.saturating_sub(amount);
        env.storage().persistent().set(&DataKey::Score(user.clone()), &score);
        
        let mut actions: Vec<Symbol> = env.storage().persistent().get(&DataKey::Actions(user.clone())).unwrap_or_else(|| Vec::new(&env));
        actions.push_back(action.clone());
        env.storage().persistent().set(&DataKey::Actions(user.clone()), &actions);
        
        env.events().publish((Symbol::new(&env, "deduct_points"), user.clone()), (amount, action));
    }

    pub fn get_score(env: Env, user: Address) -> u32 {
        env.storage().persistent().get(&DataKey::Score(user)).unwrap_or(0)
    }

    pub fn get_actions(env: Env, user: Address) -> Vec<Symbol> {
        env.storage().persistent().get(&DataKey::Actions(user)).unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod test;
