use build_dossier_registry::{BuildDossierRegistry, BuildDossierRegistryHostRef, RegistryError};
use odra::{
    host::{Deployer, HostEnv, InstallConfig, NoArgs},
    prelude::ExecutionError,
};

const JOB_ID: &str = "demo-escrow";
const DOSSIER_HASH: &str = "sha256:dossier-7f78f9f8";
const ARTIFACT_ROOT_HASH: &str = "sha256:artifacts-5d331ca1";

fn deploy_registry(env: &HostEnv) -> BuildDossierRegistryHostRef {
    BuildDossierRegistry::deploy(env, NoArgs)
}

/// Casper reports Odra framework errors as 64536 plus their enum discriminant.
/// This pins the observed Testnet error to `MissingArg` instead of relying on a
/// human interpretation of the numeric revert.
#[test]
fn decodes_testnet_error_64658_as_missing_argument() {
    assert_eq!(ExecutionError::MissingArg.code(), 64_658);
}

/// Reproduces the submitted installer mismatch: Odra's required first-install
/// set contains four configuration arguments, while the failed transaction had
/// only the first three.
#[test]
fn failed_testnet_argument_set_omits_only_is_upgrade() {
    let expected = [
        "odra_cfg_package_hash_key_name",
        "odra_cfg_allow_key_override",
        "odra_cfg_is_upgradable",
        "odra_cfg_is_upgrade",
    ];
    let submitted = [
        "odra_cfg_package_hash_key_name",
        "odra_cfg_allow_key_override",
        "odra_cfg_is_upgradable",
    ];
    let missing: Vec<_> = expected
        .iter()
        .filter(|name| !submitted.contains(name))
        .copied()
        .collect();

    assert_eq!(missing, ["odra_cfg_is_upgrade"]);
}

/// Exercises Odra's generated deployment path with the exact first-install
/// configuration used for Testnet. Odra adds `odra_cfg_is_upgrade = false` to
/// this configuration before invoking the zero-argument constructor.
#[test]
fn installs_with_testnet_installer_configuration() {
    let env = odra_test::env();
    let registry = BuildDossierRegistry::deploy_with_cfg(
        &env,
        NoArgs,
        InstallConfig {
            package_named_key: "BuildDossierRegistry".to_string(),
            is_upgradable: true,
            allow_key_override: false,
        },
    );

    assert_eq!(registry.get_dossier_count(), 0);
}

fn anchor_sample(registry: &mut BuildDossierRegistryHostRef) -> u64 {
    registry.anchor_dossier(
        JOB_ID.to_string(),
        DOSSIER_HASH.to_string(),
        ARTIFACT_ROOT_HASH.to_string(),
        4,
    )
}

/// A fresh deployment must expose an empty registry.
#[test]
fn initializes_with_zero_dossiers() {
    let env = odra_test::env();
    let registry = deploy_registry(&env);

    assert_eq!(registry.get_dossier_count(), 0);
}

/// A valid accepted dossier receives the first one-based registry ID.
#[test]
fn anchors_a_dossier_successfully() {
    let env = odra_test::env();
    let mut registry = deploy_registry(&env);

    assert_eq!(anchor_sample(&mut registry), 1);
    assert!(registry.has_dossier_hash(DOSSIER_HASH.to_string()));
}

/// The registry preserves every field needed to prove the accepted delivery.
#[test]
fn stores_all_dossier_fields_correctly() {
    let env = odra_test::env();
    let creator = env.get_account(0);
    let mut registry = deploy_registry(&env);
    env.advance_block_time(1_000);
    let id = anchor_sample(&mut registry);
    let record = registry.get_dossier(id).expect("dossier should exist");

    assert_eq!(record.id, id);
    assert_eq!(record.creator, creator);
    assert_eq!(record.job_id, JOB_ID);
    assert_eq!(record.dossier_hash, DOSSIER_HASH);
    assert_eq!(record.artifact_root_hash, ARTIFACT_ROOT_HASH);
    assert_eq!(record.artifact_count, 4);
    assert!(record.accepted);
    assert_eq!(record.recorded_at, env.block_time());
}

/// Every successful anchor increments the global dossier count.
#[test]
fn increments_dossier_count() {
    let env = odra_test::env();
    let mut registry = deploy_registry(&env);

    anchor_sample(&mut registry);
    registry.anchor_dossier(
        "second-job".to_string(),
        "sha256:second-dossier".to_string(),
        "sha256:second-root".to_string(),
        2,
    );

    assert_eq!(registry.get_dossier_count(), 2);
}

/// Empty dossier hashes are not valid proof identifiers.
#[test]
fn rejects_empty_dossier_hash() {
    let env = odra_test::env();
    let mut registry = deploy_registry(&env);

    let error = registry
        .try_anchor_dossier(
            JOB_ID.to_string(),
            String::new(),
            ARTIFACT_ROOT_HASH.to_string(),
            4,
        )
        .expect_err("empty dossier hash must revert");

    assert_eq!(error, RegistryError::EmptyDossierHash.into());
}

/// Empty artifact roots cannot prove which accepted artifacts were delivered.
#[test]
fn rejects_empty_artifact_root_hash() {
    let env = odra_test::env();
    let mut registry = deploy_registry(&env);

    let error = registry
        .try_anchor_dossier(
            JOB_ID.to_string(),
            DOSSIER_HASH.to_string(),
            String::new(),
            4,
        )
        .expect_err("empty artifact root hash must revert");

    assert_eq!(error, RegistryError::EmptyArtifactRootHash.into());
}

/// A dossier without accepted artifacts cannot be anchored.
#[test]
fn rejects_zero_artifact_count() {
    let env = odra_test::env();
    let mut registry = deploy_registry(&env);

    let error = registry
        .try_anchor_dossier(
            JOB_ID.to_string(),
            DOSSIER_HASH.to_string(),
            ARTIFACT_ROOT_HASH.to_string(),
            0,
        )
        .expect_err("zero artifact count must revert");

    assert_eq!(error, RegistryError::ZeroArtifactCount.into());
}

/// The same immutable dossier hash may only be recorded once.
#[test]
fn rejects_duplicate_dossier_hash() {
    let env = odra_test::env();
    let mut registry = deploy_registry(&env);

    anchor_sample(&mut registry);
    let error = registry
        .try_anchor_dossier(
            JOB_ID.to_string(),
            DOSSIER_HASH.to_string(),
            ARTIFACT_ROOT_HASH.to_string(),
            4,
        )
        .expect_err("duplicate dossier hash must revert");

    assert_eq!(error, RegistryError::DuplicateDossierHash.into());
}

/// Reverse lookup resolves a dossier hash to its complete record.
#[test]
fn retrieves_a_dossier_by_hash() {
    let env = odra_test::env();
    let mut registry = deploy_registry(&env);
    let id = anchor_sample(&mut registry);
    let record = registry
        .get_dossier_by_hash(DOSSIER_HASH.to_string())
        .expect("dossier should be indexed by hash");

    assert_eq!(record.id, id);
    assert_eq!(record.job_id, JOB_ID);
}

/// Creator counts are isolated by the Casper caller identity.
#[test]
fn tracks_creator_dossier_count() {
    let env = odra_test::env();
    let creator = env.get_account(0);
    let other_creator = env.get_account(1);
    let mut registry = deploy_registry(&env);

    anchor_sample(&mut registry);
    registry.anchor_dossier(
        "second-job".to_string(),
        "sha256:second-dossier".to_string(),
        "sha256:second-root".to_string(),
        1,
    );

    assert_eq!(registry.get_creator_dossier_count(creator), 2);
    assert_eq!(registry.get_creator_dossier_count(other_creator), 0);
}
