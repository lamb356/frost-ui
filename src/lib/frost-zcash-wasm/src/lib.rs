//! FROST Threshold Signatures for Zcash (RedPallas/Orchard)
//!
//! This module provides WASM bindings for FROST rerandomized threshold signatures
//! using the RedPallas curve, suitable for Zcash Orchard transactions.
//!
//! Key design principles:
//! - Narrow waist API: all types cross JS↔WASM boundary as opaque bytes
//! - Internal Rust types never exposed directly
//! - Serde JSON for serialization
//! - Full rerandomization support per ZIP-312

use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

// Import RedPallas FROST types from reddsa
use reddsa::frost::redpallas::{
    self,
    keys::{self, KeyPackage, PublicKeyPackage, SecretShare},
    round1::{self, SigningCommitments, SigningNonces},
    round2::{self, SignatureShare},
    Identifier, RandomizedParams, Randomizer, Signature, SigningPackage,
};

// =============================================================================
// Error Handling
// =============================================================================

/// Error response structure
#[derive(Serialize, Deserialize)]
pub struct FrostError {
    pub code: String,
    pub message: String,
}

/// Success/Error result wrapper
#[derive(Serialize)]
#[serde(untagged)]
pub enum FrostResult<T> {
    Ok(T),
    Err(FrostError),
}

impl<T: Serialize> FrostResult<T> {
    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|e| {
            serde_json::to_string(&FrostError {
                code: "SERIALIZATION_ERROR".into(),
                message: e.to_string(),
            })
            .unwrap()
        })
    }
}

// =============================================================================
// Key Generation Types
// =============================================================================

/// Result of key generation with trusted dealer
#[derive(Serialize)]
pub struct KeyGenResult {
    /// Group verifying key (hex)
    pub group_public_key: String,
    /// Individual key shares for each participant
    pub shares: Vec<KeyShareInfo>,
    /// Threshold required for signing
    pub threshold: u16,
    /// Total number of participants
    pub total: u16,
    /// Serialized PublicKeyPackage (JSON) - needed for aggregation
    pub public_key_package: String,
}

/// Individual key share info
#[derive(Serialize)]
pub struct KeyShareInfo {
    /// Participant identifier (1-indexed)
    pub identifier: u16,
    /// Serialized KeyPackage (JSON) - keep secret!
    pub key_package: String,
}

// =============================================================================
// Round 1 Types
// =============================================================================

/// Result of Round 1 commitment generation
#[derive(Serialize)]
pub struct Round1Result {
    /// Public commitment to broadcast
    pub commitment: CommitmentInfo,
    /// Secret nonces - MUST NOT be reused! (JSON)
    pub nonces: NoncesInfo,
}

/// Commitment info with identifier
#[derive(Serialize, Deserialize, Clone)]
pub struct CommitmentInfo {
    /// Participant identifier
    pub identifier: u16,
    /// Serialized SigningCommitments (JSON)
    pub commitment: String,
}

/// Nonces info with identifier (keep secret!)
#[derive(Serialize, Deserialize)]
pub struct NoncesInfo {
    /// Participant identifier
    pub identifier: u16,
    /// Serialized SigningNonces (JSON) - KEEP SECRET
    pub nonces: String,
}

// =============================================================================
// Round 2 Types
// =============================================================================

/// Signature share from Round 2
#[derive(Serialize, Deserialize)]
pub struct SignatureShareInfo {
    /// Participant identifier
    pub identifier: u16,
    /// Serialized SignatureShare (JSON)
    pub share: String,
}

// =============================================================================
// Aggregation Types
// =============================================================================

/// Result of signature aggregation
#[derive(Serialize)]
pub struct AggregateResult {
    /// Final aggregate signature (hex)
    pub signature: String,
    /// Randomizer used (hex) - for verification
    pub randomizer: String,
}

// =============================================================================
// WASM Initialization
// =============================================================================

/// Initialize panic hook for better error messages in WASM
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// =============================================================================
// Key Generation
// =============================================================================

/// Generate FROST key shares using trusted dealer
///
/// # Arguments
/// * `threshold` - Minimum signers required (t)
/// * `total` - Total number of signers (n)
///
/// # Returns
/// JSON string containing KeyGenResult or FrostError
#[wasm_bindgen]
pub fn generate_key_shares(threshold: u16, total: u16) -> String {
    match generate_key_shares_internal(threshold, total) {
        Ok(result) => FrostResult::Ok(result).to_json(),
        Err(e) => FrostResult::<KeyGenResult>::Err(FrostError {
            code: "KEYGEN_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

fn generate_key_shares_internal(threshold: u16, total: u16) -> Result<KeyGenResult, String> {
    if threshold == 0 || threshold > total {
        return Err(format!(
            "Invalid threshold: {} must be > 0 and <= {}",
            threshold, total
        ));
    }
    if total > 255 {
        return Err("Total participants must be <= 255".into());
    }

    let mut rng = OsRng;

    // Generate identifiers
    let identifiers: Vec<Identifier> = (1..=total)
        .map(|i| Identifier::try_from(i).expect("valid identifier"))
        .collect();

    // Generate key shares using trusted dealer
    let (shares, pubkey_package) =
        keys::generate_with_dealer(total, threshold, identifiers.clone(), &mut rng)
            .map_err(|e| format!("Key generation failed: {:?}", e))?;

    // Extract group public key
    let group_pubkey = pubkey_package.verifying_key();
    let group_pubkey_bytes = group_pubkey.serialize();
    let group_pubkey_hex = hex::encode(group_pubkey_bytes);

    // Serialize public key package for later use in aggregation
    let pubkey_package_json =
        serde_json::to_string(&pubkey_package).map_err(|e| format!("Serialize error: {}", e))?;

    // Convert shares to key packages and serialize
    let mut key_shares = Vec::new();
    for (id, secret_share) in shares.iter() {
        // Convert SecretShare to KeyPackage
        let key_package: KeyPackage = secret_share
            .clone()
            .try_into()
            .map_err(|e| format!("Failed to convert share to key package: {:?}", e))?;

        let key_package_json =
            serde_json::to_string(&key_package).map_err(|e| format!("Serialize error: {}", e))?;

        let id_bytes = id.serialize();
        let id_num = u16::from_le_bytes([id_bytes[0], id_bytes[1]]);

        key_shares.push(KeyShareInfo {
            identifier: id_num,
            key_package: key_package_json,
        });
    }

    // Sort by identifier for consistency
    key_shares.sort_by_key(|s| s.identifier);

    Ok(KeyGenResult {
        group_public_key: group_pubkey_hex,
        shares: key_shares,
        threshold,
        total,
        public_key_package: pubkey_package_json,
    })
}

// =============================================================================
// Round 1: Commitment Generation
// =============================================================================

/// Generate Round 1 commitment for signing
///
/// # Arguments
/// * `key_package_json` - Participant's key package (JSON)
///
/// # Returns
/// JSON string containing Round1Result or FrostError
#[wasm_bindgen]
pub fn generate_round1_commitment(key_package_json: &str) -> String {
    match generate_round1_internal(key_package_json) {
        Ok(result) => FrostResult::Ok(result).to_json(),
        Err(e) => FrostResult::<Round1Result>::Err(FrostError {
            code: "ROUND1_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

fn generate_round1_internal(key_package_json: &str) -> Result<Round1Result, String> {
    let mut rng = OsRng;

    // Parse key package
    let key_package: KeyPackage = serde_json::from_str(key_package_json)
        .map_err(|e| format!("Invalid key package JSON: {}", e))?;

    // Get identifier
    let identifier = *key_package.identifier();
    let id_bytes = identifier.serialize();
    let id_num = u16::from_le_bytes([id_bytes[0], id_bytes[1]]);

    // Generate nonces and commitments
    let (nonces, commitments) = round1::commit(key_package.signing_share(), &mut rng);

    // Serialize nonces (keep secret!)
    let nonces_json =
        serde_json::to_string(&nonces).map_err(|e| format!("Serialize nonces error: {}", e))?;

    // Serialize commitments
    let commitments_json = serde_json::to_string(&commitments)
        .map_err(|e| format!("Serialize commitments error: {}", e))?;

    Ok(Round1Result {
        commitment: CommitmentInfo {
            identifier: id_num,
            commitment: commitments_json,
        },
        nonces: NoncesInfo {
            identifier: id_num,
            nonces: nonces_json,
        },
    })
}

// =============================================================================
// Randomizer Generation
// =============================================================================

/// Generate a new randomizer for rerandomized FROST signing
///
/// # Returns
/// JSON string containing the randomizer or FrostError
#[wasm_bindgen]
pub fn generate_randomizer() -> String {
    match generate_randomizer_internal() {
        Ok(result) => serde_json::to_string(&result).unwrap(),
        Err(e) => FrostResult::<String>::Err(FrostError {
            code: "RANDOMIZER_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

#[derive(Serialize)]
struct RandomizerResult {
    /// Randomizer (hex-encoded)
    randomizer: String,
}

fn generate_randomizer_internal() -> Result<RandomizerResult, String> {
    let mut rng = OsRng;

    // Generate random scalar for randomizer
    let randomizer = Randomizer::new(&mut rng);

    // Serialize randomizer
    let randomizer_json =
        serde_json::to_string(&randomizer).map_err(|e| format!("Serialize error: {}", e))?;

    Ok(RandomizerResult {
        randomizer: randomizer_json,
    })
}

// =============================================================================
// Round 2: Signature Share Generation (Rerandomized)
// =============================================================================

/// Generate Round 2 signature share using rerandomization
///
/// # Arguments
/// * `key_package_json` - Participant's key package (JSON)
/// * `nonces_json` - Participant's nonces from Round 1 (JSON)
/// * `commitments_json` - All participants' commitments (JSON array)
/// * `message_hex` - Message to sign (hex-encoded)
/// * `randomizer_json` - Randomizer from coordinator (JSON)
///
/// # Returns
/// JSON string containing SignatureShareInfo or FrostError
#[wasm_bindgen]
pub fn generate_round2_signature(
    key_package_json: &str,
    nonces_json: &str,
    commitments_json: &str,
    message_hex: &str,
    randomizer_json: &str,
) -> String {
    match generate_round2_internal(
        key_package_json,
        nonces_json,
        commitments_json,
        message_hex,
        randomizer_json,
    ) {
        Ok(result) => FrostResult::Ok(result).to_json(),
        Err(e) => FrostResult::<SignatureShareInfo>::Err(FrostError {
            code: "ROUND2_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

fn generate_round2_internal(
    key_package_json: &str,
    nonces_json: &str,
    commitments_json: &str,
    message_hex: &str,
    randomizer_json: &str,
) -> Result<SignatureShareInfo, String> {
    // Parse inputs
    let key_package: KeyPackage = serde_json::from_str(key_package_json)
        .map_err(|e| format!("Invalid key package JSON: {}", e))?;

    let nonces_info: NoncesInfo =
        serde_json::from_str(nonces_json).map_err(|e| format!("Invalid nonces JSON: {}", e))?;

    let nonces: SigningNonces = serde_json::from_str(&nonces_info.nonces)
        .map_err(|e| format!("Invalid inner nonces JSON: {}", e))?;

    let commitments_list: Vec<CommitmentInfo> = serde_json::from_str(commitments_json)
        .map_err(|e| format!("Invalid commitments JSON: {}", e))?;

    let message = hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    let randomizer: Randomizer = serde_json::from_str(randomizer_json)
        .map_err(|e| format!("Invalid randomizer JSON: {}", e))?;

    // Build commitments map
    let mut commitments_map: BTreeMap<Identifier, SigningCommitments> = BTreeMap::new();
    for c in commitments_list {
        let id = Identifier::try_from(c.identifier)
            .map_err(|_| format!("Invalid identifier: {}", c.identifier))?;
        let commitment: SigningCommitments = serde_json::from_str(&c.commitment)
            .map_err(|e| format!("Invalid commitment JSON: {}", e))?;
        commitments_map.insert(id, commitment);
    }

    // Create signing package
    let signing_package = SigningPackage::new(commitments_map, &message)
        .map_err(|e| format!("Failed to create signing package: {:?}", e))?;

    // Generate signature share with rerandomization
    let signature_share = round2::sign(&signing_package, &nonces, &key_package, randomizer)
        .map_err(|e| format!("Signing failed: {:?}", e))?;

    // Serialize signature share
    let share_json = serde_json::to_string(&signature_share)
        .map_err(|e| format!("Serialize share error: {}", e))?;

    // Get identifier
    let id = *key_package.identifier();
    let id_bytes = id.serialize();
    let id_num = u16::from_le_bytes([id_bytes[0], id_bytes[1]]);

    Ok(SignatureShareInfo {
        identifier: id_num,
        share: share_json,
    })
}

// =============================================================================
// Signature Aggregation (Rerandomized)
// =============================================================================

/// Aggregate signature shares into final signature
///
/// # Arguments
/// * `shares_json` - All signature shares (JSON array)
/// * `commitments_json` - All commitments (JSON array)
/// * `message_hex` - Message that was signed (hex-encoded)
/// * `public_key_package_json` - Public key package (JSON)
/// * `randomizer_json` - Randomizer used for signing (JSON)
///
/// # Returns
/// JSON string containing AggregateResult or FrostError
#[wasm_bindgen]
pub fn aggregate_signature(
    shares_json: &str,
    commitments_json: &str,
    message_hex: &str,
    public_key_package_json: &str,
    randomizer_json: &str,
) -> String {
    match aggregate_internal(
        shares_json,
        commitments_json,
        message_hex,
        public_key_package_json,
        randomizer_json,
    ) {
        Ok(result) => FrostResult::Ok(result).to_json(),
        Err(e) => FrostResult::<AggregateResult>::Err(FrostError {
            code: "AGGREGATE_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

fn aggregate_internal(
    shares_json: &str,
    commitments_json: &str,
    message_hex: &str,
    public_key_package_json: &str,
    randomizer_json: &str,
) -> Result<AggregateResult, String> {
    // Parse inputs
    let shares_list: Vec<SignatureShareInfo> =
        serde_json::from_str(shares_json).map_err(|e| format!("Invalid shares JSON: {}", e))?;

    let commitments_list: Vec<CommitmentInfo> = serde_json::from_str(commitments_json)
        .map_err(|e| format!("Invalid commitments JSON: {}", e))?;

    let message = hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    let pubkey_package: PublicKeyPackage = serde_json::from_str(public_key_package_json)
        .map_err(|e| format!("Invalid public key package JSON: {}", e))?;

    let randomizer: Randomizer = serde_json::from_str(randomizer_json)
        .map_err(|e| format!("Invalid randomizer JSON: {}", e))?;

    // Build commitments map
    let mut commitments_map: BTreeMap<Identifier, SigningCommitments> = BTreeMap::new();
    for c in commitments_list {
        let id = Identifier::try_from(c.identifier)
            .map_err(|_| format!("Invalid identifier: {}", c.identifier))?;
        let commitment: SigningCommitments = serde_json::from_str(&c.commitment)
            .map_err(|e| format!("Invalid commitment JSON: {}", e))?;
        commitments_map.insert(id, commitment);
    }

    // Build signature shares map
    let mut shares_map: BTreeMap<Identifier, SignatureShare> = BTreeMap::new();
    for s in shares_list {
        let id = Identifier::try_from(s.identifier)
            .map_err(|_| format!("Invalid identifier: {}", s.identifier))?;
        let share: SignatureShare =
            serde_json::from_str(&s.share).map_err(|e| format!("Invalid share JSON: {}", e))?;
        shares_map.insert(id, share);
    }

    // Create signing package
    let signing_package = SigningPackage::new(commitments_map, &message)
        .map_err(|e| format!("Failed to create signing package: {:?}", e))?;

    // Create randomized params for aggregation
    let randomized_params = RandomizedParams::from_randomizer(pubkey_package.verifying_key(), randomizer);

    // Aggregate signature
    let signature = redpallas::aggregate(&signing_package, &shares_map, &pubkey_package, &randomized_params)
        .map_err(|e| format!("Aggregation failed: {:?}", e))?;

    // Serialize signature
    let sig_bytes = signature.serialize();
    let sig_hex = hex::encode(sig_bytes);

    // Also return the randomizer for verification
    let randomizer_json =
        serde_json::to_string(&randomizer).map_err(|e| format!("Serialize error: {}", e))?;

    Ok(AggregateResult {
        signature: sig_hex,
        randomizer: randomizer_json,
    })
}

// =============================================================================
// Signature Verification
// =============================================================================

/// Verify a rerandomized signature
///
/// # Arguments
/// * `signature_hex` - Signature to verify (hex-encoded)
/// * `message_hex` - Message that was signed (hex-encoded)
/// * `group_public_key_hex` - Group verifying key (hex-encoded)
/// * `randomizer_json` - Randomizer used for signing (JSON)
///
/// # Returns
/// JSON string containing verification result or FrostError
#[wasm_bindgen]
pub fn verify_signature(
    signature_hex: &str,
    message_hex: &str,
    group_public_key_hex: &str,
    randomizer_json: &str,
) -> String {
    match verify_internal(signature_hex, message_hex, group_public_key_hex, randomizer_json) {
        Ok(valid) => {
            serde_json::to_string(&VerifyResult { valid }).unwrap()
        }
        Err(e) => FrostResult::<VerifyResult>::Err(FrostError {
            code: "VERIFY_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

#[derive(Serialize)]
struct VerifyResult {
    valid: bool,
}

fn verify_internal(
    signature_hex: &str,
    message_hex: &str,
    group_public_key_hex: &str,
    randomizer_json: &str,
) -> Result<bool, String> {
    // Parse signature
    let sig_bytes = hex::decode(signature_hex).map_err(|e| format!("Invalid signature hex: {}", e))?;
    let sig_array: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "Signature must be 64 bytes")?;
    let signature = Signature::deserialize(sig_array)
        .map_err(|e| format!("Invalid signature: {:?}", e))?;

    // Parse message
    let message = hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    // Parse group public key
    let pubkey_bytes =
        hex::decode(group_public_key_hex).map_err(|e| format!("Invalid public key hex: {}", e))?;
    let pubkey_array: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| "Public key must be 32 bytes")?;
    let verifying_key = redpallas::VerifyingKey::deserialize(pubkey_array)
        .map_err(|e| format!("Invalid verifying key: {:?}", e))?;

    // Parse randomizer
    let randomizer: Randomizer = serde_json::from_str(randomizer_json)
        .map_err(|e| format!("Invalid randomizer JSON: {}", e))?;

    // Create randomized params and get randomized public key
    let randomized_params = RandomizedParams::from_randomizer(&verifying_key, randomizer);
    let randomized_verifying_key = randomized_params.randomized_verifying_key();

    // Verify signature against randomized public key
    // For rerandomized FROST, verification is against the randomized key
    match randomized_verifying_key.verify(&message, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

// =============================================================================
// Utility Functions
// =============================================================================

/// Get the public key from a key package
///
/// # Arguments
/// * `key_package_json` - Key package (JSON)
///
/// # Returns
/// JSON string with public key (hex) or FrostError
#[wasm_bindgen]
pub fn get_public_key(key_package_json: &str) -> String {
    match get_public_key_internal(key_package_json) {
        Ok(result) => serde_json::to_string(&result).unwrap(),
        Err(e) => FrostResult::<PublicKeyResult>::Err(FrostError {
            code: "PUBKEY_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

#[derive(Serialize)]
struct PublicKeyResult {
    public_key: String,
    identifier: u16,
}

fn get_public_key_internal(key_package_json: &str) -> Result<PublicKeyResult, String> {
    let key_package: KeyPackage = serde_json::from_str(key_package_json)
        .map_err(|e| format!("Invalid key package JSON: {}", e))?;

    let verifying_share = key_package.verifying_share();
    let pubkey_bytes = verifying_share.serialize();
    let pubkey_hex = hex::encode(pubkey_bytes);

    let id = *key_package.identifier();
    let id_bytes = id.serialize();
    let id_num = u16::from_le_bytes([id_bytes[0], id_bytes[1]]);

    Ok(PublicKeyResult {
        public_key: pubkey_hex,
        identifier: id_num,
    })
}

/// Get the group public key from a public key package
///
/// # Arguments
/// * `public_key_package_json` - Public key package (JSON)
///
/// # Returns
/// Hex-encoded group public key or error
#[wasm_bindgen]
pub fn get_group_public_key(public_key_package_json: &str) -> String {
    match get_group_public_key_internal(public_key_package_json) {
        Ok(hex) => hex,
        Err(e) => FrostResult::<String>::Err(FrostError {
            code: "PUBKEY_ERROR".into(),
            message: e,
        })
        .to_json(),
    }
}

fn get_group_public_key_internal(public_key_package_json: &str) -> Result<String, String> {
    let pubkey_package: PublicKeyPackage = serde_json::from_str(public_key_package_json)
        .map_err(|e| format!("Invalid public key package JSON: {}", e))?;

    let verifying_key = pubkey_package.verifying_key();
    let pubkey_bytes = verifying_key.serialize();
    Ok(hex::encode(pubkey_bytes))
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_generation() {
        let result = generate_key_shares(2, 3);
        let parsed: KeyGenResult = serde_json::from_str(&result).expect("Should parse result");

        assert_eq!(parsed.threshold, 2);
        assert_eq!(parsed.total, 3);
        assert_eq!(parsed.shares.len(), 3);
        assert!(!parsed.group_public_key.is_empty());
        assert!(!parsed.public_key_package.is_empty());
    }

    #[test]
    fn test_full_signing_ceremony() {
        // Generate keys
        let keygen_result = generate_key_shares(2, 3);
        let keygen: KeyGenResult =
            serde_json::from_str(&keygen_result).expect("Key generation should succeed");

        // Round 1: Generate commitments for first 2 participants
        let round1_1 = generate_round1_commitment(&keygen.shares[0].key_package);
        let r1_1: Round1Result =
            serde_json::from_str(&round1_1).expect("Round 1 participant 1 should succeed");

        let round1_2 = generate_round1_commitment(&keygen.shares[1].key_package);
        let r1_2: Round1Result =
            serde_json::from_str(&round1_2).expect("Round 1 participant 2 should succeed");

        // Collect commitments
        let commitments = vec![r1_1.commitment.clone(), r1_2.commitment.clone()];
        let commitments_json = serde_json::to_string(&commitments).unwrap();

        // Generate randomizer
        let randomizer_result = generate_randomizer();
        let randomizer_parsed: RandomizerResult =
            serde_json::from_str(&randomizer_result).expect("Randomizer should succeed");
        let randomizer_json = &randomizer_parsed.randomizer;

        // Message to sign
        let message = "48656c6c6f20576f726c64"; // "Hello World" in hex

        // Round 2: Generate signature shares with randomizer
        let nonces_1 = serde_json::to_string(&r1_1.nonces).unwrap();
        let sig_share_1 = generate_round2_signature(
            &keygen.shares[0].key_package,
            &nonces_1,
            &commitments_json,
            message,
            randomizer_json,
        );
        let share_1: SignatureShareInfo =
            serde_json::from_str(&sig_share_1).expect("Round 2 participant 1 should succeed");

        let nonces_2 = serde_json::to_string(&r1_2.nonces).unwrap();
        let sig_share_2 = generate_round2_signature(
            &keygen.shares[1].key_package,
            &nonces_2,
            &commitments_json,
            message,
            randomizer_json,
        );
        let share_2: SignatureShareInfo =
            serde_json::from_str(&sig_share_2).expect("Round 2 participant 2 should succeed");

        // Aggregate
        let shares = vec![share_1, share_2];
        let shares_json = serde_json::to_string(&shares).unwrap();

        let agg_result = aggregate_signature(
            &shares_json,
            &commitments_json,
            message,
            &keygen.public_key_package,
            randomizer_json,
        );
        let agg: AggregateResult =
            serde_json::from_str(&agg_result).expect("Aggregation should succeed");

        assert!(!agg.signature.is_empty());

        // Verify
        let verify_result = verify_signature(
            &agg.signature,
            message,
            &keygen.group_public_key,
            randomizer_json,
        );
        let verify: VerifyResult =
            serde_json::from_str(&verify_result).expect("Verification should succeed");

        assert!(verify.valid, "Signature should be valid");
    }
}
