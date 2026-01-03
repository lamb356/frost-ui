# Security Model

This document describes the threat model and security properties of the FROST multi-signature UI.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

**Email**: security@example.com (replace with your contact)
**Response Time**: <48 hours for initial acknowledgment
**Resolution Target**: Critical issues patched within 7 days

### Disclosure Process

1. Report via email with detailed description
2. We acknowledge within 48 hours
3. We investigate and provide timeline
4. We release patch and coordinate disclosure
5. Credit given to reporter (unless anonymity requested)

### Scope

Security issues in scope:
- Cryptographic implementation flaws
- Key material exposure
- Authentication bypass
- Message replay/forgery

Out of scope:
- Denial of service (frostd server responsibility)
- Social engineering

## Threat Model Overview

| Threat | Mitigation | Status |
|--------|------------|--------|
| Nonce reuse | Track nonces by message_id, single-use enforcement | ✅ Implemented |
| Replay attacks | Message deduplication via ID set | ✅ Implemented |
| Server reading messages | E2E encryption (X25519 + AES-GCM) | ✅ Implemented |
| Key theft at rest | PBKDF2 + AES-GCM encryption | ✅ Implemented |
| Man-in-the-middle | TLS + signature verification | ✅ Implemented |
| Malicious coordinator | Signature verification before acceptance | ✅ Implemented |
| Key generation compromise | Trusted dealer model (DKG future work) | ⚠️ Limitation |

## Nonce Lifecycle

**Critical:** Nonce reuse in FROST reveals the signing key.

### Protection Mechanisms

1. **Message ID Binding:** Each nonce is bound to a specific `message_id`
2. **Single-Use Enforcement:** State machine tracks `nonceMessageId` per session
3. **Fresh Nonces:** `generate_round1_commitment()` creates new nonces each call
4. **No Nonce Persistence:** Nonces exist only in memory during signing

### Nonce Flow

```
1. Coordinator sends SIGNING_PACKAGE with unique message_id
2. Participant calls generate_round1_commitment() → fresh nonces
3. Participant stores nonceMessageId = message_id
4. If new SIGNING_PACKAGE arrives with different message_id:
   - Old nonces are discarded
   - New nonces are generated
5. Nonces are consumed in Round 2 and never stored
```

### State Machine Enforcement

```typescript
// participant-machine.ts
context: {
  messageId: string | null,       // Current signing attempt's message_id
  nonceMessageId: string | null,  // Tracks which message nonces are bound to
  nonces: SigningNonces | null,   // Nonces (never persisted)
}

// On SIGNING_PACKAGE received:
if (context.nonceMessageId !== null && context.nonceMessageId === payload.message_id) {
  // REJECT - nonce reuse detected
  return error('NONCE_REUSE_DETECTED');
}
// Generate fresh nonces for new signing request
context.nonces = frost.generate_round1_commitment(...);
context.messageId = payload.message_id;
context.nonceMessageId = payload.message_id;  // Bind nonces to this message_id
```

## Replay Protection

### Message Deduplication

All messages include a unique `id` field (UUID). The validation module maintains a deduplication set keyed by `${sessionId}:${messageId}`:

```typescript
// validation.ts
class DeduplicationSet {
  private seen = new Set<string>();
  private maxSize = 10000;

  // Check if message was already seen
  hasSeen(sid: string, id: string): boolean {
    return this.seen.has(`${sid}:${id}`);
  }

  // Mark message as seen, returns false if already seen (duplicate)
  markSeen(sid: string, id: string): boolean {
    const key = `${sid}:${id}`;
    if (this.seen.has(key)) return false;
    // Evict oldest entries if at capacity
    if (this.seen.size >= this.maxSize) {
      const firstKey = this.seen.values().next().value;
      if (firstKey) this.seen.delete(firstKey);
    }
    this.seen.add(key);
    return true;
  }
}
```

### Message Freshness

Messages are rejected if:
- Timestamp is more than 10 minutes old (`MAX_MESSAGE_AGE_MS`)
- Timestamp is more than 1 minute in the future (`MAX_FUTURE_MS`)

### Session Binding

Every message includes `sid` (session ID). Messages for wrong session are rejected.

## Key Share Storage

### Encryption at Rest

Key shares are encrypted before localStorage storage:

```typescript
// Encryption process:
1. User provides password
2. Derive key: PBKDF2(password, salt, 100000, SHA-256) → 32 bytes
3. Encrypt: AES-256-GCM(derivedKey, keyShare, nonce)
4. Store: { salt, nonce, ciphertext } in localStorage
```

### Storage Format

```typescript
interface EncryptedKeyShare {
  salt: string;      // Hex, 16 bytes (for PBKDF2)
  nonce: string;     // Hex, 12 bytes (for AES-GCM)
  ciphertext: string; // Hex (encrypted key package + auth tag)
}
```

### Security Properties

- **Password stretching:** 100,000 PBKDF2 iterations
- **Authenticated encryption:** AES-GCM provides confidentiality + integrity
- **Unique salts:** Each key share has unique PBKDF2 salt
- **No plaintext keys:** Key shares never stored unencrypted

## E2E Encryption

### What the Server Sees

| Data | Server Visibility |
|------|-------------------|
| Session metadata | ✅ Visible (session_id, participants, timestamps) |
| Message envelope | ✅ Visible (from, to, type, timestamp) |
| Message payload | ❌ Encrypted (ciphertext only) |
| Signing commitments | ❌ Encrypted |
| Signature shares | ❌ Encrypted |
| Final signature | ❌ Encrypted until broadcast |

### What the Server CANNOT Do

- Read message contents
- Forge messages (no signing keys)
- Determine what is being signed
- Learn individual signature shares
- Reconstruct the group private key

### Encryption Protocol

```
1. Sender generates ephemeral X25519 keypair
2. Sender computes: sharedSecret = ECDH(ephemeralPrivate, recipientPublic)
3. Derive AES key: HKDF-SHA256(sharedSecret, "", "frost-e2e", 32)
4. Encrypt: AES-256-GCM(aesKey, plaintext, randomNonce)
5. Send: { ephemeralPubkey, nonce, ciphertext }
```

### Forward Secrecy

Each message uses a fresh ephemeral keypair, providing forward secrecy:
- Compromise of long-term keys doesn't reveal past messages
- Each message has independent encryption keys

## Authentication

### XEdDSA Challenge-Response

```
1. Client requests challenge: POST /challenge
2. Server returns UUID challenge
3. Client signs challenge as 16-byte binary (not string!)
4. Client sends: POST /login { pubkey, challenge, signature }
5. Server verifies XEdDSA signature
6. Server returns session token
```

### Why 16-byte Binary?

The frostd server uses Rust's `Uuid::as_bytes()` which returns 16-byte binary.
Signing the 36-byte UTF-8 string would produce invalid signatures.

## Trusted Dealer Model

### Current Limitation

Key generation currently uses a **trusted dealer**:

```
Dealer generates all key shares → distributes to participants
```

### Security Implications

- Dealer knows all shares (can reconstruct group key)
- Dealer must be trusted
- Single point of compromise during key generation

### Future: Distributed Key Generation (DKG)

DKG eliminates the trusted dealer:

```
Each participant contributes → no single party knows full key
```

This is planned for a future milestone.

## Message Types and Security

### SIGNING_PACKAGE (Coordinator → Participants)

Contains message to sign and selected signers. E2E encrypted.

**Risk:** Malicious coordinator could request signing arbitrary messages.
**Mitigation:** UI shows message for user confirmation before Round 2.

### ROUND1_COMMITMENT (Participant → Coordinator)

Contains public commitment (hiding + binding points). E2E encrypted.

**Risk:** Commitment reveals no secret information.
**Mitigation:** None needed (public data).

### COMMITMENTS_SET (Coordinator → Participants)

All collected commitments. E2E encrypted.

**Risk:** Missing or modified commitments could cause invalid signatures.
**Mitigation:** Signature verification at aggregation.

### ROUND2_SIGNATURE_SHARE (Participant → Coordinator)

Signature share. E2E encrypted.

**Risk:** Share alone reveals nothing; requires threshold shares.
**Mitigation:** E2E encryption prevents server from collecting shares.

### SIGNATURE_RESULT (Coordinator → All)

Final aggregate signature. E2E encrypted.

**Risk:** None (public information after signing).
**Mitigation:** Verification before broadcast.

### ABORT (Either direction)

Session abort with reason. E2E encrypted.

**Risk:** Denial of service (abort valid sessions).
**Mitigation:** Abort reasons are logged for audit.

## Known Limitations

1. **Trusted Dealer:** Key generation requires trusted party (DKG not yet implemented)
2. **No Key Resharing:** Cannot change threshold or remove participants
3. **Browser Storage:** localStorage vulnerable to XSS attacks
4. **Side Channels:** WASM timing attacks possible (not constant-time)
5. **No HSM Support:** Keys stored in software, not hardware

## Security Recommendations

### For Users

1. Use strong, unique passwords for key share encryption
2. Verify the message before confirming Round 2
3. Keep browser updated (XSS mitigations)
4. Don't share session IDs publicly

### For Operators

1. Run frostd with TLS (required)
2. Monitor for unusual session patterns
3. Implement rate limiting
4. Keep frostd updated

### For Auditors

Key files to review:
- `src/lib/crypto/index.ts` - Cryptographic primitives
- `src/lib/state-machines/validation.ts` - Message validation
- `src/lib/frost-zcash-wasm/src/lib.rs` - Rust FROST implementation
- `src/lib/xeddsa-wasm/src/lib.rs` - XEdDSA implementation

## Comparison with Previous Grant Attempts

| Issue | Zenith Grant | This Implementation |
|-------|--------------|---------------------|
| FROST crypto | ❌ Not delivered | ✅ Ed25519 + RedPallas |
| Zcash curves | ❌ Not delivered | ✅ RedPallas (Orchard) |
| E2E encryption | ❌ Not delivered | ✅ X25519 + AES-GCM |
| frostd integration | ❌ Partial | ✅ Full spec compliance |
| Test coverage | ❌ None | ✅ 76+ passing tests |

## References

- [FROST Paper](https://eprint.iacr.org/2020/852)
- [XEdDSA Specification](https://signal.org/docs/specifications/xeddsa/)
- [frostd Server Spec](https://frost.zfnd.org/zcash/server.html)
- [ZIP-312: Shielded Coinbase](https://zips.z.cash/zip-0312)
- [reddsa Crate](https://github.com/ZcashFoundation/reddsa)
