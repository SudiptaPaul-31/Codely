#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

#[test]
fn test_reputation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, ReputationContract);
    let client = ReputationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    let action_publish = Symbol::new(&env, "publish");
    let action_verify = Symbol::new(&env, "verify");

    env.mock_all_auths();

    client.add_points(&user, &10, &action_publish);
    assert_eq!(client.get_score(&user), 10);
    
    let actions = client.get_actions(&user);
    assert_eq!(actions.len(), 1);
    assert_eq!(actions.get(0).unwrap(), action_publish);

    client.add_points(&user, &5, &action_verify);
    assert_eq!(client.get_score(&user), 15);

    client.deduct_points(&user, &2, &action_publish);
    assert_eq!(client.get_score(&user), 13);
    
    let actions_after = client.get_actions(&user);
    assert_eq!(actions_after.len(), 3);
}
