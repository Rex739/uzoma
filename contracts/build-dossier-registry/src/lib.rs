#![no_std]

use odra::prelude::*;

/// Odra 2.8.1 represents a caller as `Address`, which preserves the Casper
/// account identity while remaining compatible with contract callers.
pub type AccountId = Address;

/// Immutable evidence recorded for one accepted Uzoma Build Dossier.
#[odra::odra_type]
pub struct DossierRecord {
    pub id: u64,
    pub creator: AccountId,
    pub job_id: String,
    pub dossier_hash: String,
    pub artifact_root_hash: String,
    pub artifact_count: u32,
    pub accepted: bool,
    /// Casper block time in milliseconds when the record was anchored.
    pub recorded_at: u64,
}

/// Emitted after a dossier has been persisted successfully.
#[odra::event]
pub struct DossierAnchored {
    pub id: u64,
    pub creator: AccountId,
    pub job_id: String,
    pub dossier_hash: String,
    pub artifact_root_hash: String,
    pub artifact_count: u32,
    pub accepted: bool,
    pub recorded_at: u64,
}

/// Validation and registry integrity errors.
#[odra::odra_error]
pub enum RegistryError {
    EmptyDossierHash = 1,
    EmptyArtifactRootHash = 2,
    ZeroArtifactCount = 3,
    DuplicateDossierHash = 4,
    DossierCountOverflow = 5,
}

/// Minimal append-only registry for accepted Uzoma Build Dossiers.
#[odra::module(events = [DossierAnchored], errors = RegistryError)]
pub struct BuildDossierRegistry {
    /// Monotonic number of dossiers anchored by this registry.
    dossier_count: Var<u64>,
    /// Canonical record lookup by one-based dossier ID.
    dossiers: Mapping<u64, DossierRecord>,
    /// Reverse lookup from immutable dossier hash to dossier ID.
    dossier_ids_by_hash: Mapping<String, u64>,
    /// Number of dossiers anchored by each Casper caller identity.
    creator_dossier_counts: Mapping<AccountId, u64>,
}

#[odra::module]
impl BuildDossierRegistry {
    /// Initializes an empty registry.
    pub fn init(&mut self) {
        self.dossier_count.set(0);
    }

    /// Anchors accepted dossier evidence and returns its one-based registry ID.
    pub fn anchor_dossier(
        &mut self,
        job_id: String,
        dossier_hash: String,
        artifact_root_hash: String,
        artifact_count: u32,
    ) -> u64 {
        if dossier_hash.is_empty() {
            self.env().revert(RegistryError::EmptyDossierHash);
        }
        if artifact_root_hash.is_empty() {
            self.env().revert(RegistryError::EmptyArtifactRootHash);
        }
        if artifact_count == 0 {
            self.env().revert(RegistryError::ZeroArtifactCount);
        }
        if self.dossier_ids_by_hash.get(&dossier_hash).is_some() {
            self.env().revert(RegistryError::DuplicateDossierHash);
        }

        let current_count = self.dossier_count.get_or_default();
        let id = current_count
            .checked_add(1)
            .unwrap_or_revert_with(self, RegistryError::DossierCountOverflow);
        let creator = self.env().caller();
        let recorded_at = self.env().get_block_time();
        let creator_count = self.creator_dossier_counts.get_or_default(&creator);
        let next_creator_count = creator_count
            .checked_add(1)
            .unwrap_or_revert_with(self, RegistryError::DossierCountOverflow);

        let record = DossierRecord {
            id,
            creator,
            job_id: job_id.clone(),
            dossier_hash: dossier_hash.clone(),
            artifact_root_hash: artifact_root_hash.clone(),
            artifact_count,
            accepted: true,
            recorded_at,
        };

        self.dossiers.set(&id, record);
        self.dossier_ids_by_hash.set(&dossier_hash, id);
        self.creator_dossier_counts
            .set(&creator, next_creator_count);
        self.dossier_count.set(id);

        self.env().emit_event(DossierAnchored::new(
            id,
            creator,
            job_id,
            dossier_hash,
            artifact_root_hash,
            artifact_count,
            true,
            recorded_at,
        ));

        id
    }

    /// Returns a dossier record by its registry ID.
    pub fn get_dossier(&self, id: u64) -> Option<DossierRecord> {
        self.dossiers.get(&id)
    }

    /// Returns a dossier record by its immutable dossier hash.
    pub fn get_dossier_by_hash(&self, dossier_hash: String) -> Option<DossierRecord> {
        self.dossier_ids_by_hash
            .get(&dossier_hash)
            .and_then(|id| self.dossiers.get(&id))
    }

    /// Returns the total number of anchored dossiers.
    pub fn get_dossier_count(&self) -> u64 {
        self.dossier_count.get_or_default()
    }

    /// Returns whether a dossier hash has already been anchored.
    pub fn has_dossier_hash(&self, dossier_hash: String) -> bool {
        self.dossier_ids_by_hash.get(&dossier_hash).is_some()
    }

    /// Returns the number of dossiers anchored by a caller identity.
    pub fn get_creator_dossier_count(&self, creator: AccountId) -> u64 {
        self.creator_dossier_counts.get_or_default(&creator)
    }
}
