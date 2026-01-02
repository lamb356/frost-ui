//! XEdDSA WASM bindings using the exact xeddsa 1.0.2 crate for frostd compatibility.
//!
//! This module provides WASM bindings for XEdDSA signing and verification,
//! using the same xeddsa crate that frostd uses for authentication.

use wasm_bindgen::prelude::*;
use xeddsa::xed25519::{PrivateKey as XEdPrivateKey, PublicKey as XEdPublicKey};
use xeddsa::{Sign, Verify}; // Import traits for sign/verify methods
use x25519_dalek::{PublicKey, StaticSecret};
use rand::rngs::OsRng;

/// Result of keypair generation
#[wasm_bindgen]
pub struct Keypair {
    private_key: Vec<u8>,
    public_key: Vec<u8>,
}

#[wasm_bindgen]
impl Keypair {
    #[wasm_bindgen(getter)]
    pub fn private_key(&self) -> Vec<u8> {
        self.private_key.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn public_key(&self) -> Vec<u8> {
        self.public_key.clone()
    }
}

/// Generate a new X25519 keypair for XEdDSA signing.
/// Returns a Keypair with 32-byte private_key and 32-byte public_key.
#[wasm_bindgen]
pub fn generate_keypair() -> Keypair {
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);

    Keypair {
        private_key: secret.as_bytes().to_vec(),
        public_key: public.as_bytes().to_vec(),
    }
}

/// Get the X25519 public key from a private key.
///
/// # Arguments
/// * `private_key` - 32-byte X25519 private key
///
/// # Returns
/// 32-byte X25519 public key
#[wasm_bindgen]
pub fn get_public_key(private_key: &[u8]) -> Result<Vec<u8>, JsValue> {
    if private_key.len() != 32 {
        return Err(JsValue::from_str("Private key must be 32 bytes"));
    }

    let mut pk_bytes = [0u8; 32];
    pk_bytes.copy_from_slice(private_key);

    let secret = StaticSecret::from(pk_bytes);
    let public = PublicKey::from(&secret);

    Ok(public.as_bytes().to_vec())
}

/// Sign a message using XEdDSA with an X25519 private key.
/// This uses the exact same algorithm as frostd for authentication.
///
/// # Arguments
/// * `private_key` - 32-byte X25519 private key
/// * `message` - Message bytes to sign
///
/// # Returns
/// 64-byte XEdDSA signature
#[wasm_bindgen]
pub fn sign(private_key: &[u8], message: &[u8]) -> Result<Vec<u8>, JsValue> {
    if private_key.len() != 32 {
        return Err(JsValue::from_str("Private key must be 32 bytes"));
    }

    let mut pk_bytes = [0u8; 32];
    pk_bytes.copy_from_slice(private_key);

    // Create XEdDSA private key from bytes
    let xed_privkey = XEdPrivateKey(pk_bytes);

    // Use xeddsa crate's sign method - same as frostd uses
    // Returns [u8; 64] signature
    let signature: [u8; 64] = xed_privkey.sign(message, &mut OsRng);

    Ok(signature.to_vec())
}

/// Verify an XEdDSA signature using an X25519 public key.
/// This uses the exact same algorithm as frostd for authentication.
///
/// # Arguments
/// * `public_key` - 32-byte X25519 public key
/// * `message` - Original message bytes
/// * `signature` - 64-byte XEdDSA signature
///
/// # Returns
/// true if signature is valid, false otherwise
#[wasm_bindgen]
pub fn verify(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, JsValue> {
    if public_key.len() != 32 {
        return Err(JsValue::from_str("Public key must be 32 bytes"));
    }
    if signature.len() != 64 {
        return Err(JsValue::from_str("Signature must be 64 bytes"));
    }

    let mut pk_bytes = [0u8; 32];
    pk_bytes.copy_from_slice(public_key);

    let mut sig_bytes = [0u8; 64];
    sig_bytes.copy_from_slice(signature);

    // Create XEdDSA public key from bytes
    let xed_pubkey = XEdPublicKey(pk_bytes);

    // Use xeddsa crate's verify method - same as frostd uses
    let result = xed_pubkey.verify(message, &sig_bytes);

    Ok(result.is_ok())
}
