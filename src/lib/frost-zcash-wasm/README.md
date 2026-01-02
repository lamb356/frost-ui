# FROST Zcash WASM

WASM bindings for FROST rerandomized threshold signatures using the RedPallas curve, suitable for Zcash Orchard transactions.

## Features

- **Rerandomized FROST**: Full support for ZIP-312 rerandomized FROST signing
- **RedPallas Curve**: Uses the Pallas curve with BLAKE2b-512 hash, compatible with Zcash Orchard
- **Threshold Signatures**: 2-of-3, 3-of-5, etc. threshold signing schemes
- **WASM Target**: Runs in browsers and Node.js

## Build Requirements

### Windows

1. **Visual Studio Build Tools** with C++ workload
2. **Windows SDK** (includes `kernel32.lib` and other system libraries)
3. **Rust toolchain** with `wasm32-unknown-unknown` target
4. **wasm-pack** for building WASM

**Important**: Make sure MSVC's `link.exe` is in your PATH before Git's `link.exe`:
```powershell
# Check which link.exe is found first
where.exe link.exe

# Should show MSVC's link.exe first:
# C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\...\bin\HostX64\x64\link.exe
```

If Git's link.exe is found first, run from a Visual Studio Developer Command Prompt.

### Linux/macOS

1. **Rust toolchain** with `wasm32-unknown-unknown` target
2. **wasm-pack**

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

## Building

```bash
# From this directory
wasm-pack build --target web

# For Node.js
wasm-pack build --target nodejs
```

The output will be in the `pkg/` directory.

## Usage

```typescript
import {
  initFrostZcash,
  generateKeyShares,
  generateRound1Commitment,
  generateRandomizer,
  generateRound2Signature,
  aggregateSignature,
  verifySignature
} from './loader';

// Initialize WASM
await initFrostZcash();

// Generate 2-of-3 key shares
const keygen = generateKeyShares(2, 3);
console.log('Group public key:', keygen.group_public_key);

// Each participant gets their key package
const participant1KeyPackage = keygen.shares[0].key_package;
const participant2KeyPackage = keygen.shares[1].key_package;

// Round 1: Generate commitments
const round1_1 = generateRound1Commitment(participant1KeyPackage);
const round1_2 = generateRound1Commitment(participant2KeyPackage);

// Coordinator generates randomizer
const { randomizer } = generateRandomizer();

// Collect commitments
const commitments = [round1_1.commitment, round1_2.commitment];
const commitmentsJson = JSON.stringify(commitments);

// Message to sign (hex-encoded)
const messageHex = '48656c6c6f20576f726c64'; // "Hello World"

// Round 2: Generate signature shares
const share1 = generateRound2Signature(
  participant1KeyPackage,
  JSON.stringify(round1_1.nonces),
  commitmentsJson,
  messageHex,
  randomizer
);

const share2 = generateRound2Signature(
  participant2KeyPackage,
  JSON.stringify(round1_2.nonces),
  commitmentsJson,
  messageHex,
  randomizer
);

// Aggregate shares
const shares = [share1, share2];
const result = aggregateSignature(
  JSON.stringify(shares),
  commitmentsJson,
  messageHex,
  keygen.public_key_package,
  randomizer
);

console.log('Signature:', result.signature);

// Verify
const verification = verifySignature(
  result.signature,
  messageHex,
  keygen.group_public_key,
  randomizer
);

console.log('Valid:', verification.valid);
```

## API

### Key Generation

- `generateKeyShares(threshold, total)`: Generate key shares using trusted dealer

### Round 1

- `generateRound1Commitment(keyPackageJson)`: Generate commitment and nonces

### Randomization

- `generateRandomizer()`: Generate randomizer for rerandomized signing

### Round 2

- `generateRound2Signature(...)`: Generate signature share with randomizer

### Aggregation

- `aggregateSignature(...)`: Aggregate shares into final signature

### Verification

- `verifySignature(...)`: Verify a rerandomized signature

## Security Considerations

1. **Nonce Reuse**: Never reuse nonces! Each signing session must use fresh nonces from `generateRound1Commitment`.

2. **Key Package Security**: The `key_package` in each share contains the participant's secret key. Keep it secure!

3. **Randomizer Distribution**: The randomizer must be distributed to all signers via a secure channel.

4. **Threshold Security**: The threshold (t) determines how many participants must collude to compromise the key. Choose wisely.

## License

MIT OR Apache-2.0
