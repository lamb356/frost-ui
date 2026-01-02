//! FROST WASM Bindings for Zcash
//!
//! Provides WebAssembly bindings for FROST threshold signature operations
//! using the RedPallas curve for Zcash Orchard compatibility.
//!
//! This uses reddsa's frost::redpallas module which implements
//! rerandomized FROST (frost-rerandomized) for Zcash transactions.

use reddsa::frost::redpallas as frost;
use reddsa::frost::redpallas::frost as frost_core;
use reddsa::frost::redpallas::keys::EvenY;
use rand::rngs::OsRng;
use rand_core::RngCore;
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

/// A participant's key package containing all key material needed for signing
#[derive(Serialize, Deserialize)]
pub struct KeyShare {
    /// Participant identifier (1-indexed)
    pub identifier: u16,
    /// Secret signing share (hex-encoded)
    pub signing_share: String,
    /// Verifying share (public key share, hex-encoded)
    pub verifying_share: String,
    /// Full key package for signing (hex-encoded, serialized)
    pub key_package: String,
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
    /// Serialized PublicKeyPackage (hex-encoded) - needed for aggregation
    pub public_key_package: String,
}

/// A commitment for Round 1 of signing
#[derive(Serialize, Deserialize, Clone)]
pub struct Commitment {
    /// Participant identifier
    pub identifier: u16,
    /// Hiding commitment (hex-encoded)
    pub hiding: String,
    /// Binding commitment (hex-encoded)
    pub binding: String,
}

/// Nonces generated during Round 1 (must be kept secret!)
#[derive(Serialize, Deserialize)]
pub struct SigningNonces {
    /// Participant identifier
    pub identifier: u16,
    /// Hiding nonce (hex-encoded) - KEEP SECRET
    pub hiding: String,
    /// Binding nonce (hex-encoded) - KEEP SECRET
    pub binding: String,
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
    /// Signature share (hex-encoded)
    pub share: String,
}

/// Final aggregate signature
#[derive(Serialize, Deserialize)]
pub struct AggregateSignature {
    /// R component (hex-encoded)
    pub r: String,
    /// s component (hex-encoded)
    pub s: String,
    /// Full signature (hex-encoded, R || s)
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
/// Uses RedPallas curve for Zcash Orchard compatibility.
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
        frost_core::keys::IdentifierList::Default,
        &mut rng,
    )
    .map_err(|e| format!("Key generation failed: {:?}", e))?;

    // Serialize the public key package for later use in aggregation
    let pubkey_package_bytes = pubkey_package
        .serialize()
        .map_err(|e| format!("Failed to serialize public key package: {:?}", e))?;

    // Convert to our format
    let mut key_shares = Vec::with_capacity(total as usize);
    for (identifier, secret_share) in shares {
        let id: u16 = u16::from(
            *identifier
                .serialize()
                .first()
                .ok_or("Invalid identifier")?,
        );

        // Build KeyPackage for this participant
        let key_package = frost::keys::KeyPackage::try_from(secret_share.clone())
            .map_err(|e| format!("Failed to create key package: {:?}", e))?;

        let key_package_bytes = key_package
            .serialize()
            .map_err(|e| format!("Failed to serialize key package: {:?}", e))?;

        key_shares.push(KeyShare {
            identifier: id,
            signing_share: hex::encode(secret_share.signing_share().serialize()),
            verifying_share: hex::encode(
                pubkey_package
                    .verifying_shares()
                    .get(&identifier)
                    .ok_or("Missing verifying share")?
                    .serialize(),
            ),
            key_package: hex::encode(&key_package_bytes),
        });
    }

    Ok(KeyGenResult {
        group_public_key: hex::encode(pubkey_package.verifying_key().serialize()),
        shares: key_shares,
        threshold,
        total,
        public_key_package: hex::encode(&pubkey_package_bytes),
    })
}

// =============================================================================
// Round 1: Commitment Generation
// =============================================================================

/// Generate Round 1 commitment and nonces.
///
/// # Arguments
/// * `key_package_hex` - The participant's key package (hex-encoded, from KeyGenResult)
///
/// # Returns
/// JSON string containing Round1Result or FrostError
#[wasm_bindgen]
pub fn generate_round1_commitment(key_package_hex: &str) -> String {
    match generate_round1_internal(key_package_hex) {
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

fn generate_round1_internal(key_package_hex: &str) -> Result<Round1Result, String> {
    let mut rng = OsRng;

    // Decode key package
    let key_package_bytes =
        hex::decode(key_package_hex).map_err(|e| format!("Invalid key package hex: {}", e))?;

    let key_package = frost::keys::KeyPackage::deserialize(&key_package_bytes)
        .map_err(|e| format!("Invalid key package: {:?}", e))?;

    let identifier = key_package.identifier();
    let id: u16 = u16::from(
        *identifier
            .serialize()
            .first()
            .ok_or("Invalid identifier")?,
    );

    // Generate nonces and commitment
    let (nonces, commitments) = frost::round1::commit(key_package.signing_share(), &mut rng);

    // Extract commitment components
    let hiding = commitments.hiding();
    let binding = commitments.binding();

    Ok(Round1Result {
        commitment: Commitment {
            identifier: id,
            hiding: hex::encode(hiding.serialize()),
            binding: hex::encode(binding.serialize()),
        },
        nonces: SigningNonces {
            identifier: id,
            hiding: hex::encode(nonces.hiding().serialize()),
            binding: hex::encode(nonces.binding().serialize()),
        },
    })
}

// =============================================================================
// Round 2: Signature Share Generation
// =============================================================================

/// Generate Round 2 signature share.
///
/// For Zcash, uses rerandomized FROST with a randomizer.
///
/// # Arguments
/// * `key_package_hex` - The participant's key package (hex-encoded)
/// * `nonces_json` - JSON string of SigningNonces
/// * `commitments_json` - JSON string of Vec<Commitment> (all participants' commitments)
/// * `message_hex` - Message to sign (hex-encoded)
/// * `randomizer_hex` - Randomizer for rerandomization (hex-encoded, 32 bytes) or empty for default
///
/// # Returns
/// JSON string containing SignatureShare or FrostError
#[wasm_bindgen]
pub fn generate_round2_signature(
    key_package_hex: &str,
    nonces_json: &str,
    commitments_json: &str,
    message_hex: &str,
    randomizer_hex: &str,
) -> String {
    match generate_round2_internal(
        key_package_hex,
        nonces_json,
        commitments_json,
        message_hex,
        randomizer_hex,
    ) {
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
    key_package_hex: &str,
    nonces_json: &str,
    commitments_json: &str,
    message_hex: &str,
    randomizer_hex: &str,
) -> Result<SignatureShare, String> {
    // Parse key package
    let key_package_bytes =
        hex::decode(key_package_hex).map_err(|e| format!("Invalid key package hex: {}", e))?;
    let key_package = frost::keys::KeyPackage::deserialize(&key_package_bytes)
        .map_err(|e| format!("Invalid key package: {:?}", e))?;

    let identifier = key_package.identifier();
    let id: u16 = u16::from(
        *identifier
            .serialize()
            .first()
            .ok_or("Invalid identifier")?,
    );

    // Parse nonces
    let my_nonces: SigningNonces =
        serde_json::from_str(nonces_json).map_err(|e| format!("Invalid nonces JSON: {}", e))?;

    // Parse commitments
    let commitments_list: Vec<Commitment> = serde_json::from_str(commitments_json)
        .map_err(|e| format!("Invalid commitments JSON: {}", e))?;

    // Parse message
    let message =
        hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    // Reconstruct FROST nonces
    let hiding_nonce_bytes =
        hex::decode(&my_nonces.hiding).map_err(|e| format!("Invalid hiding nonce: {}", e))?;
    let binding_nonce_bytes =
        hex::decode(&my_nonces.binding).map_err(|e| format!("Invalid binding nonce: {}", e))?;

    let hiding_nonce = frost::round1::Nonce::deserialize(&hiding_nonce_bytes)
        .map_err(|e| format!("Invalid hiding nonce bytes: {:?}", e))?;
    let binding_nonce = frost::round1::Nonce::deserialize(&binding_nonce_bytes)
        .map_err(|e| format!("Invalid binding nonce bytes: {:?}", e))?;

    let nonces = frost::round1::SigningNonces::from_nonces(hiding_nonce, binding_nonce);

    // Reconstruct signing commitments
    let mut signing_commitments: BTreeMap<frost_core::Identifier, frost::round1::SigningCommitments> =
        BTreeMap::new();

    for c in &commitments_list {
        let cid = frost_core::Identifier::try_from(c.identifier)
            .map_err(|e| format!("Invalid commitment identifier: {:?}", e))?;

        let hiding_bytes =
            hex::decode(&c.hiding).map_err(|e| format!("Invalid hiding commitment: {}", e))?;
        let binding_bytes =
            hex::decode(&c.binding).map_err(|e| format!("Invalid binding commitment: {}", e))?;

        let hiding = frost::round1::NonceCommitment::deserialize(&hiding_bytes)
            .map_err(|e| format!("Invalid hiding commitment bytes: {:?}", e))?;
        let binding = frost::round1::NonceCommitment::deserialize(&binding_bytes)
            .map_err(|e| format!("Invalid binding commitment bytes: {:?}", e))?;

        let commitment = frost::round1::SigningCommitments::new(hiding, binding);
        signing_commitments.insert(cid, commitment);
    }

    // Create signing package
    let signing_package = frost::SigningPackage::new(signing_commitments, &message)
        .map_err(|e| format!("Failed to create signing package: {:?}", e))?;

    // Parse or generate randomizer
    let randomizer = if randomizer_hex.is_empty() {
        // Generate a random randomizer
        let mut rng = OsRng;
        let mut randomizer_bytes = [0u8; 32];
        rng.fill_bytes(&mut randomizer_bytes);
        frost::Randomizer::deserialize(&randomizer_bytes)
            .map_err(|e| format!("Failed to create randomizer: {:?}", e))?
    } else {
        let randomizer_bytes =
            hex::decode(randomizer_hex).map_err(|e| format!("Invalid randomizer hex: {}", e))?;
        frost::Randomizer::deserialize(&randomizer_bytes)
            .map_err(|e| format!("Invalid randomizer: {:?}", e))?
    };

    // Generate signature share using rerandomized FROST
    let signature_share = frost::round2::sign(&signing_package, &nonces, &key_package, randomizer)
        .map_err(|e| format!("Signing failed: {:?}", e))?;

    Ok(SignatureShare {
        identifier: id,
        share: hex::encode(signature_share.serialize()),
    })
}

// =============================================================================
// Signature Aggregation
// =============================================================================

/// Aggregate signature shares into final signature.
///
/// Uses rerandomized FROST aggregation for Zcash compatibility.
///
/// # Arguments
/// * `shares_json` - JSON string of Vec<SignatureShare>
/// * `commitments_json` - JSON string of Vec<Commitment>
/// * `message_hex` - Message that was signed (hex-encoded)
/// * `public_key_package_hex` - Serialized PublicKeyPackage (hex-encoded, from KeyGenResult)
/// * `randomizer_hex` - Randomizer used during signing (hex-encoded, 32 bytes)
///
/// # Returns
/// JSON string containing AggregateSignature or FrostError
#[wasm_bindgen]
pub fn aggregate_signature(
    shares_json: &str,
    commitments_json: &str,
    message_hex: &str,
    public_key_package_hex: &str,
    randomizer_hex: &str,
) -> String {
    match aggregate_internal(
        shares_json,
        commitments_json,
        message_hex,
        public_key_package_hex,
        randomizer_hex,
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
    public_key_package_hex: &str,
    randomizer_hex: &str,
) -> Result<AggregateSignature, String> {
    // Parse inputs
    let shares: Vec<SignatureShare> =
        serde_json::from_str(shares_json).map_err(|e| format!("Invalid shares JSON: {}", e))?;

    let commitments_list: Vec<Commitment> = serde_json::from_str(commitments_json)
        .map_err(|e| format!("Invalid commitments JSON: {}", e))?;

    let message =
        hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    // Parse public key package
    let pubkey_package_bytes = hex::decode(public_key_package_hex)
        .map_err(|e| format!("Invalid public key package hex: {}", e))?;
    let pubkey_package = frost::keys::PublicKeyPackage::deserialize(&pubkey_package_bytes)
        .map_err(|e| format!("Invalid public key package: {:?}", e))?;

    // Parse randomizer
    let randomizer_bytes =
        hex::decode(randomizer_hex).map_err(|e| format!("Invalid randomizer hex: {}", e))?;
    let randomizer = frost::Randomizer::deserialize(&randomizer_bytes)
        .map_err(|e| format!("Invalid randomizer: {:?}", e))?;

    // Create randomized params
    let randomized_params = frost::RandomizedParams::from_randomizer(
        pubkey_package.verifying_key(),
        randomizer,
    );

    // Reconstruct signing commitments
    let mut signing_commitments: BTreeMap<frost_core::Identifier, frost::round1::SigningCommitments> =
        BTreeMap::new();

    for c in &commitments_list {
        let id = frost_core::Identifier::try_from(c.identifier)
            .map_err(|e| format!("Invalid commitment identifier: {:?}", e))?;

        let hiding_bytes =
            hex::decode(&c.hiding).map_err(|e| format!("Invalid hiding commitment: {}", e))?;
        let binding_bytes =
            hex::decode(&c.binding).map_err(|e| format!("Invalid binding commitment: {}", e))?;

        let hiding = frost::round1::NonceCommitment::deserialize(&hiding_bytes)
            .map_err(|e| format!("Invalid hiding commitment bytes: {:?}", e))?;
        let binding = frost::round1::NonceCommitment::deserialize(&binding_bytes)
            .map_err(|e| format!("Invalid binding commitment bytes: {:?}", e))?;

        let commitment = frost::round1::SigningCommitments::new(hiding, binding);
        signing_commitments.insert(id, commitment);
    }

    // Create signing package
    let signing_package = frost::SigningPackage::new(signing_commitments, &message)
        .map_err(|e| format!("Failed to create signing package: {:?}", e))?;

    // Reconstruct signature shares
    let mut frost_shares: BTreeMap<frost_core::Identifier, frost::round2::SignatureShare> =
        BTreeMap::new();

    for s in &shares {
        let id = frost_core::Identifier::try_from(s.identifier)
            .map_err(|e| format!("Invalid share identifier: {:?}", e))?;

        let share_bytes =
            hex::decode(&s.share).map_err(|e| format!("Invalid signature share: {}", e))?;

        let share = frost::round2::SignatureShare::deserialize(&share_bytes)
            .map_err(|e| format!("Invalid signature share bytes: {:?}", e))?;

        frost_shares.insert(id, share);
    }

    // Aggregate signature using rerandomized FROST
    let signature = frost::aggregate(&signing_package, &frost_shares, &pubkey_package, &randomized_params)
        .map_err(|e| format!("Aggregation failed: {:?}", e))?;

    // Serialize the signature
    let sig_bytes = signature.serialize();

    // RedPallas signature is 64 bytes: R (32) || s (32)
    let r_bytes = &sig_bytes[..32];
    let s_bytes = &sig_bytes[32..];

    Ok(AggregateSignature {
        r: hex::encode(r_bytes),
        s: hex::encode(s_bytes),
        signature: hex::encode(&sig_bytes),
    })
}

// =============================================================================
// Verification
// =============================================================================

/// Verify a signature.
///
/// # Arguments
/// * `signature_hex` - The aggregate signature (hex-encoded, 64 bytes)
/// * `message_hex` - The message that was signed (hex-encoded)
/// * `group_public_key_hex` - The group public key (hex-encoded)
/// * `randomizer_hex` - The randomizer used during signing (hex-encoded, 32 bytes)
///
/// # Returns
/// JSON string containing { "valid": bool } or FrostError
#[wasm_bindgen]
pub fn verify_signature(
    signature_hex: &str,
    message_hex: &str,
    group_public_key_hex: &str,
    randomizer_hex: &str,
) -> String {
    match verify_internal(signature_hex, message_hex, group_public_key_hex, randomizer_hex) {
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
    randomizer_hex: &str,
) -> Result<bool, String> {
    let sig_bytes =
        hex::decode(signature_hex).map_err(|e| format!("Invalid signature hex: {}", e))?;

    let message = hex::decode(message_hex).map_err(|e| format!("Invalid message hex: {}", e))?;

    let group_key_bytes = hex::decode(group_public_key_hex)
        .map_err(|e| format!("Invalid group public key hex: {}", e))?;

    let randomizer_bytes =
        hex::decode(randomizer_hex).map_err(|e| format!("Invalid randomizer hex: {}", e))?;

    let signature = frost::Signature::deserialize(&sig_bytes)
        .map_err(|e| format!("Invalid signature: {:?}", e))?;

    let group_key = frost::VerifyingKey::deserialize(&group_key_bytes)
        .map_err(|e| format!("Invalid group public key: {:?}", e))?;

    let randomizer = frost::Randomizer::deserialize(&randomizer_bytes)
        .map_err(|e| format!("Invalid randomizer: {:?}", e))?;

    // Create randomized params for verification
    let randomized_params = frost::RandomizedParams::from_randomizer(&group_key, randomizer);

    // Use top-level verify function (randomized_verifying_key() not available in this API)
    match frost::verify(&message, &signature, &group_key, &randomized_params) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Generate a random randomizer for rerandomized FROST.
///
/// This should be called by the coordinator and shared with all signers
/// before Round 2 begins.
///
/// # Returns
/// Hex-encoded 32-byte randomizer
#[wasm_bindgen]
pub fn generate_randomizer() -> String {
    let mut rng = OsRng;
    let mut randomizer_bytes = [0u8; 32];
    rng.fill_bytes(&mut randomizer_bytes);
    hex::encode(randomizer_bytes)
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
        let keygen: KeyGenResult = serde_json::from_str(&keygen_result)
            .expect("Key generation failed");

        // Round 1: Generate commitments for first 2 participants
        let round1_1 = generate_round1_commitment(&keygen.shares[0].key_package);
        let r1_1: Round1Result = serde_json::from_str(&round1_1)
            .expect("Round 1 participant 1 failed");

        let round1_2 = generate_round1_commitment(&keygen.shares[1].key_package);
        let r1_2: Round1Result = serde_json::from_str(&round1_2)
            .expect("Round 1 participant 2 failed");

        // Collect commitments
        let commitments = vec![r1_1.commitment.clone(), r1_2.commitment.clone()];
        let commitments_json = serde_json::to_string(&commitments).unwrap();

        // Message to sign
        let message = "48656c6c6f20576f726c64"; // "Hello World" in hex

        // Generate a shared randomizer
        let randomizer = generate_randomizer();

        // Round 2: Generate signature shares
        let nonces_1 = serde_json::to_string(&r1_1.nonces).unwrap();
        let sig_share_1 = generate_round2_signature(
            &keygen.shares[0].key_package,
            &nonces_1,
            &commitments_json,
            message,
            &randomizer,
        );
        let share_1: SignatureShare = serde_json::from_str(&sig_share_1)
            .expect("Round 2 participant 1 failed");

        let nonces_2 = serde_json::to_string(&r1_2.nonces).unwrap();
        let sig_share_2 = generate_round2_signature(
            &keygen.shares[1].key_package,
            &nonces_2,
            &commitments_json,
            message,
            &randomizer,
        );
        let share_2: SignatureShare = serde_json::from_str(&sig_share_2)
            .expect("Round 2 participant 2 failed");

        // Aggregate
        let shares = vec![share_1, share_2];
        let shares_json = serde_json::to_string(&shares).unwrap();

        let agg_result = aggregate_signature(
            &shares_json,
            &commitments_json,
            message,
            &keygen.public_key_package,
            &randomizer,
        );
        let agg: AggregateSignature = serde_json::from_str(&agg_result)
            .expect("Aggregation failed");

        assert!(!agg.signature.is_empty());

        // Verify
        let verify_result = verify_signature(
            &agg.signature,
            message,
            &keygen.group_public_key,
            &randomizer,
        );
        let verify: serde_json::Value = serde_json::from_str(&verify_result)
            .expect("Verification parsing failed");
        assert_eq!(verify["valid"], true, "Signature should be valid");
    }
}
