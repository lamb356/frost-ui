//! FROST WASM Bindings
//!
//! Provides WebAssembly bindings for FROST threshold signature operations
//! using Ed25519 curve.
//!
//! Note: For Zcash Orchard compatibility, a future version will migrate to
//! frost-rerandomized with RedPallas curve.

use frost_ed25519 as frost;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

// Initialize panic hook for better error messages in WASM
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// =============================================================================
// Types
// =============================================================================

/// A participant's key share
#[derive(Serialize, Deserialize)]
pub struct KeyShare {
    /// Participant identifier (1-indexed)
    pub identifier: u16,
    /// Serialized KeyPackage (JSON)
    pub key_package: String,
    /// Verifying share (hex-encoded public key share)
    pub verifying_share: String,
}

/// Result of key generation
#[derive(Serialize, Deserialize)]
pub struct KeyGenResult {
    /// Group public key (hex-encoded)
    pub group_public_key: String,
    /// Individual key shares for each participant
    pub shares: Vec<KeyShare>,
    /// Threshold required for signing
    pub threshold: u16,
    /// Total number of participants
    pub total: u16,
    /// Serialized PublicKeyPackage (JSON)
    pub public_key_package: String,
}

/// A commitment for Round 1 of signing
#[derive(Serialize, Deserialize, Clone)]
pub struct Commitment {
    /// Participant identifier
    pub identifier: u16,
    /// Serialized SigningCommitments (JSON)
    pub commitment: String,
}

/// Nonces generated during Round 1 (must be kept secret!)
#[derive(Serialize, Deserialize)]
pub struct SigningNonces {
    /// Participant identifier
    pub identifier: u16,
    /// Serialized SigningNonces (JSON) - KEEP SECRET
    pub nonces: String,
}

/// Result of Round 1 commitment generation
#[derive(Serialize, Deserialize)]
pub struct Round1Result {
    /// Public commitment to broadcast
    pub commitment: Commitment,
    /// Secret nonces to keep for Round 2
    pub nonces: SigningNonces,
}

/// A signature share from Round 2
#[derive(Serialize, Deserialize)]
pub struct SignatureShare {
    /// Participant identifier
    pub identifier: u16,
    /// Serialized SignatureShare (JSON)
    pub share: String,
}

/// Final aggregate signature
#[derive(Serialize, Deserialize)]
pub struct AggregateSignature {
    /// Full signature (hex-encoded)
    pub signature: String,
}

/// Error result
#[derive(Serialize, Deserialize)]
pub struct FrostError {
    pub code: String,
    pub message: String,
}

// =============================================================================
// Key Generation
// =============================================================================

/// Generate key shares using trusted dealer key generation.
///
/// # Arguments
/// * `threshold` - Minimum number of signers required (t)
/// * `total` - Total number of participants (n)
///
/// # Returns
/// JSON string containing KeyGenResult or FrostError
#[wasm_bindgen]
pub fn generate_key_shares(threshold: u16, total: u16) -> String {
    match generate_key_shares_internal(threshold, total) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|e| {
            serde_json::to_string(&FrostError {
                code: "SERIALIZATION_ERROR".into(),
                message: e.to_string(),
            })
            .unwrap()
        }),
        Err(e) => serde_json::to_string(&FrostError {
            code: "KEYGEN_ERROR".into(),
            message: e,
        })
        .unwrap(),
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

    // Generate key shares using trusted dealer
    let (shares, pubkey_package) = frost::keys::generate_with_dealer(
        total,
        threshold,
        frost::keys::IdentifierList::Default,
        &mut rng,
    )
    .map_err(|e| format!("Key generation failed: {:?}", e))?;

    // Serialize the public key package
    let pubkey_package_json = serde_json::to_string(&pubkey_package)
        .map_err(|e| format!("Failed to serialize public key package: {:?}", e))?;

    // Convert to our format
    let mut key_shares = Vec::with_capacity(total as usize);
    for (identifier, secret_share) in shares {
        // Build KeyPackage for this participant
        let key_package = frost::keys::KeyPackage::try_from(secret_share.clone())
            .map_err(|e| format!("Failed to create key package: {:?}", e))?;

        let key_package_json = serde_json::to_string(&key_package)
            .map_err(|e| format!("Failed to serialize key package: {:?}", e))?;

        // Get the verifying share for this participant
        let verifying_share = pubkey_package
            .verifying_shares()
            .get(&identifier)
            .ok_or("Missing verifying share")?;

        // Get identifier as u16
        let id_bytes = identifier.serialize();
        let id: u16 = u16::from_le_bytes([id_bytes[0], id_bytes[1]]);

        let verifying_share_bytes = verifying_share
            .serialize()
            .map_err(|e| format!("Failed to serialize verifying share: {:?}", e))?;

        key_shares.push(KeyShare {
            identifier: id,
            key_package: key_package_json,
            verifying_share: hex::encode(verifying_share_bytes),
        });
    }

    // Get group public key
    let group_public_key_bytes = pubkey_package
        .verifying_key()
        .serialize()
        .map_err(|e| format!("Failed to serialize group public key: {:?}", e))?;
    let group_public_key = hex::encode(group_public_key_bytes);

    Ok(KeyGenResult {
        group_public_key,
        shares: key_shares,
        threshold,
        total,
        public_key_package: pubkey_package_json,
    })
}

// =============================================================================
// Round 1: Commitment Generation
// =============================================================================

/// Generate Round 1 commitment and nonces.
///
/// # Arguments
/// * `key_package_json` - The participant's key package (JSON, from KeyGenResult)
///
/// # Returns
/// JSON string containing Round1Result or FrostError
#[wasm_bindgen]
pub fn generate_round1_commitment(key_package_json: &str) -> String {
    match generate_round1_internal(key_package_json) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|e| {
            serde_json::to_string(&FrostError {
                code: "SERIALIZATION_ERROR".into(),
                message: e.to_string(),
            })
            .unwrap()
        }),
        Err(e) => serde_json::to_string(&FrostError {
            code: "ROUND1_ERROR".into(),
            message: e,
        })
        .unwrap(),
    }
}

fn generate_round1_internal(key_package_json: &str) -> Result<Round1Result, String> {
    let mut rng = OsRng;

    // Parse key package
    let key_package: frost::keys::KeyPackage = serde_json::from_str(key_package_json)
        .map_err(|e| format!("Invalid key package JSON: {}", e))?;

    let identifier = *key_package.identifier();
    let id_bytes = identifier.serialize();
    let id: u16 = u16::from_le_bytes([id_bytes[0], id_bytes[1]]);

    // Generate nonces and commitment
    let (nonces, commitments) = frost::round1::commit(key_package.signing_share(), &mut rng);

    // Serialize
    let nonces_json = serde_json::to_string(&nonces)
        .map_err(|e| format!("Failed to serialize nonces: {:?}", e))?;
    let commitments_json = serde_json::to_string(&commitments)
        .map_err(|e| format!("Failed to serialize commitments: {:?}", e))?;

    Ok(Round1Result {
        commitment: Commitment {
            identifier: id,
            commitment: commitments_json,
        },
        nonces: SigningNonces {
            identifier: id,
            nonces: nonces_json,
        },
    })
}

// =============================================================================
// Round 2: Signature Share Generation
// =============================================================================

/// Generate Round 2 signature share.
///
/// # Arguments
/// * `key_package_json` - The participant's key package (JSON)
/// * `nonces_json` - The participant's SigningNonces (JSON from Round1)
/// * `commitments_json` - JSON array of all participants' Commitment objects
/// * `message_hex` - Message to sign (hex-encoded)
///
/// # Returns
/// JSON string containing SignatureShare or FrostError
#[wasm_bindgen]
pub fn generate_round2_signature(
    key_package_json: &str,
    nonces_json: &str,
    commitments_json: &str,
    message_hex: &str,
) -> String {
    match generate_round2_internal(key_package_json, nonces_json, commitments_json, message_hex) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|e| {
            serde_json::to_string(&FrostError {
                code: "SERIALIZATION_ERROR".into(),
                message: e.to_string(),
            })
            .unwrap()
        }),
        Err(e) => serde_json::to_string(&FrostError {
            code: "ROUND2_ERROR".into(),
            message: e,
        })
        .unwrap(),
    }
}

fn generate_round2_internal(
    key_package_json: &str,
    nonces_json: &str,
    commitments_json: &str,
    message_hex: &str,
) -> Result<SignatureShare, String> {
    // Parse key package
    let key_package: frost::keys::KeyPackage = serde_json::from_str(key_package_json)
        .map_err(|e| format!("Invalid key package JSON: {}", e))?;

    let identifier = *key_package.identifier();
    let id_bytes = identifier.serialize();
    let id: u16 = u16::from_le_bytes([id_bytes[0], id_bytes[1]]);

    // Parse nonces (our wrapper type)
    let my_nonces_wrapper: SigningNonces = serde_json::from_str(nonces_json)
        .map_err(|e| format!("Invalid nonces wrapper JSON: {}", e))?;
    let nonces: frost::round1::SigningNonces = serde_json::from_str(&my_nonces_wrapper.nonces)
        .map_err(|e| format!("Invalid nonces JSON: {}", e))?;

    // Parse commitments (our wrapper type)
    let commitments_list: Vec<Commitment> = serde_json::from_str(commitments_json)
        .map_err(|e| format!("Invalid commitments JSON: {}", e))?;

    // Parse message
    let message = hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    // Build signing commitments map
    let mut signing_commitments: BTreeMap<frost::Identifier, frost::round1::SigningCommitments> =
        BTreeMap::new();

    for c in &commitments_list {
        let cid = frost::Identifier::try_from(c.identifier)
            .map_err(|e| format!("Invalid commitment identifier: {:?}", e))?;

        let commitment: frost::round1::SigningCommitments = serde_json::from_str(&c.commitment)
            .map_err(|e| format!("Invalid commitment JSON: {}", e))?;

        signing_commitments.insert(cid, commitment);
    }

    // Create signing package
    let signing_package = frost::SigningPackage::new(signing_commitments, &message);

    // Generate signature share
    let signature_share = frost::round2::sign(&signing_package, &nonces, &key_package)
        .map_err(|e| format!("Signing failed: {:?}", e))?;

    // Serialize
    let share_json = serde_json::to_string(&signature_share)
        .map_err(|e| format!("Failed to serialize signature share: {:?}", e))?;

    Ok(SignatureShare {
        identifier: id,
        share: share_json,
    })
}

// =============================================================================
// Signature Aggregation
// =============================================================================

/// Aggregate signature shares into final signature.
///
/// # Arguments
/// * `shares_json` - JSON array of SignatureShare objects
/// * `commitments_json` - JSON array of Commitment objects
/// * `message_hex` - Message that was signed (hex-encoded)
/// * `public_key_package_json` - Serialized PublicKeyPackage (JSON, from KeyGenResult)
///
/// # Returns
/// JSON string containing AggregateSignature or FrostError
#[wasm_bindgen]
pub fn aggregate_signature(
    shares_json: &str,
    commitments_json: &str,
    message_hex: &str,
    public_key_package_json: &str,
) -> String {
    match aggregate_internal(
        shares_json,
        commitments_json,
        message_hex,
        public_key_package_json,
    ) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|e| {
            serde_json::to_string(&FrostError {
                code: "SERIALIZATION_ERROR".into(),
                message: e.to_string(),
            })
            .unwrap()
        }),
        Err(e) => serde_json::to_string(&FrostError {
            code: "AGGREGATE_ERROR".into(),
            message: e,
        })
        .unwrap(),
    }
}

fn aggregate_internal(
    shares_json: &str,
    commitments_json: &str,
    message_hex: &str,
    public_key_package_json: &str,
) -> Result<AggregateSignature, String> {
    // Parse inputs
    let shares: Vec<SignatureShare> =
        serde_json::from_str(shares_json).map_err(|e| format!("Invalid shares JSON: {}", e))?;

    let commitments_list: Vec<Commitment> = serde_json::from_str(commitments_json)
        .map_err(|e| format!("Invalid commitments JSON: {}", e))?;

    let message = hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    // Parse public key package
    let pubkey_package: frost::keys::PublicKeyPackage =
        serde_json::from_str(public_key_package_json)
            .map_err(|e| format!("Invalid public key package JSON: {}", e))?;

    // Build signing commitments map
    let mut signing_commitments: BTreeMap<frost::Identifier, frost::round1::SigningCommitments> =
        BTreeMap::new();

    for c in &commitments_list {
        let id = frost::Identifier::try_from(c.identifier)
            .map_err(|e| format!("Invalid commitment identifier: {:?}", e))?;

        let commitment: frost::round1::SigningCommitments = serde_json::from_str(&c.commitment)
            .map_err(|e| format!("Invalid commitment JSON: {}", e))?;

        signing_commitments.insert(id, commitment);
    }

    // Create signing package
    let signing_package = frost::SigningPackage::new(signing_commitments, &message);

    // Build signature shares map
    let mut frost_shares: BTreeMap<frost::Identifier, frost::round2::SignatureShare> =
        BTreeMap::new();

    for s in &shares {
        let id = frost::Identifier::try_from(s.identifier)
            .map_err(|e| format!("Invalid share identifier: {:?}", e))?;

        let share: frost::round2::SignatureShare = serde_json::from_str(&s.share)
            .map_err(|e| format!("Invalid signature share JSON: {}", e))?;

        frost_shares.insert(id, share);
    }

    // Aggregate signature
    let signature = frost::aggregate(&signing_package, &frost_shares, &pubkey_package)
        .map_err(|e| format!("Aggregation failed: {:?}", e))?;

    let signature_bytes = signature
        .serialize()
        .map_err(|e| format!("Failed to serialize signature: {:?}", e))?;

    Ok(AggregateSignature {
        signature: hex::encode(signature_bytes),
    })
}

// =============================================================================
// Verification
// =============================================================================

/// Verify a signature.
///
/// # Arguments
/// * `signature_hex` - The aggregate signature (hex-encoded)
/// * `message_hex` - The message that was signed (hex-encoded)
/// * `group_public_key_hex` - The group public key (hex-encoded)
///
/// # Returns
/// JSON string containing { "valid": bool } or FrostError
#[wasm_bindgen]
pub fn verify_signature(
    signature_hex: &str,
    message_hex: &str,
    group_public_key_hex: &str,
) -> String {
    match verify_internal(signature_hex, message_hex, group_public_key_hex) {
        Ok(valid) => serde_json::to_string(&serde_json::json!({ "valid": valid })).unwrap(),
        Err(e) => serde_json::to_string(&FrostError {
            code: "VERIFY_ERROR".into(),
            message: e,
        })
        .unwrap(),
    }
}

fn verify_internal(
    signature_hex: &str,
    message_hex: &str,
    group_public_key_hex: &str,
) -> Result<bool, String> {
    let sig_bytes = hex::decode(signature_hex).map_err(|e| format!("Invalid signature hex: {}", e))?;

    let message = hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    let group_key_bytes =
        hex::decode(group_public_key_hex).map_err(|e| format!("Invalid group public key hex: {}", e))?;

    // Parse signature - frost-ed25519 signatures are 64 bytes
    let sig_array: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "Signature must be 64 bytes")?;

    let signature = frost::Signature::deserialize(&sig_array)
        .map_err(|e| format!("Invalid signature: {:?}", e))?;

    // Parse verifying key - Ed25519 public keys are 32 bytes
    let key_array: [u8; 32] = group_key_bytes
        .try_into()
        .map_err(|_| "Public key must be 32 bytes")?;

    let verifying_key = frost::VerifyingKey::deserialize(&key_array)
        .map_err(|e| format!("Invalid group public key: {:?}", e))?;

    // Verify
    match verifying_key.verify(&message, &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keygen() {
        let result = generate_key_shares(2, 3);
        let parsed: Result<KeyGenResult, _> = serde_json::from_str(&result);
        assert!(parsed.is_ok(), "Key generation should succeed: {}", result);

        let keygen = parsed.unwrap();
        assert_eq!(keygen.threshold, 2);
        assert_eq!(keygen.total, 3);
        assert_eq!(keygen.shares.len(), 3);
        assert!(!keygen.group_public_key.is_empty());
        assert!(!keygen.public_key_package.is_empty());
    }

    #[test]
    fn test_full_signing_flow() {
        // Generate keys
        let keygen_result = generate_key_shares(2, 3);
        let keygen: KeyGenResult =
            serde_json::from_str(&keygen_result).expect("Key generation failed");

        // Round 1: Generate commitments for first 2 participants
        let round1_1 = generate_round1_commitment(&keygen.shares[0].key_package);
        let r1_1: Round1Result =
            serde_json::from_str(&round1_1).expect("Round 1 participant 1 failed");

        let round1_2 = generate_round1_commitment(&keygen.shares[1].key_package);
        let r1_2: Round1Result =
            serde_json::from_str(&round1_2).expect("Round 1 participant 2 failed");

        // Collect commitments
        let commitments = vec![r1_1.commitment.clone(), r1_2.commitment.clone()];
        let commitments_json = serde_json::to_string(&commitments).unwrap();

        // Message to sign
        let message = "48656c6c6f20576f726c64"; // "Hello World" in hex

        // Round 2: Generate signature shares
        let nonces_1 = serde_json::to_string(&r1_1.nonces).unwrap();
        let sig_share_1 = generate_round2_signature(
            &keygen.shares[0].key_package,
            &nonces_1,
            &commitments_json,
            message,
        );
        let share_1: SignatureShare =
            serde_json::from_str(&sig_share_1).expect("Round 2 participant 1 failed");

        let nonces_2 = serde_json::to_string(&r1_2.nonces).unwrap();
        let sig_share_2 = generate_round2_signature(
            &keygen.shares[1].key_package,
            &nonces_2,
            &commitments_json,
            message,
        );
        let share_2: SignatureShare =
            serde_json::from_str(&sig_share_2).expect("Round 2 participant 2 failed");

        // Aggregate
        let shares = vec![share_1, share_2];
        let shares_json = serde_json::to_string(&shares).unwrap();

        let agg_result = aggregate_signature(
            &shares_json,
            &commitments_json,
            message,
            &keygen.public_key_package,
        );
        let agg: AggregateSignature =
            serde_json::from_str(&agg_result).expect("Aggregation failed");

        assert!(!agg.signature.is_empty());

        // Verify
        let verify_result = verify_signature(&agg.signature, message, &keygen.group_public_key);
        let verify: serde_json::Value =
            serde_json::from_str(&verify_result).expect("Verification parsing failed");
        assert_eq!(verify["valid"], true, "Signature should be valid");
    }
}
