# FROST Multi-Sig UI

![Build Status](https://github.com/lamb356/frost-ui/actions/workflows/build.yml/badge.svg)

A Next.js web application for FROST (Flexible Round-Optimized Schnorr Threshold) multi-signature operations, designed for Zcash threshold signing ceremonies.

## Features

- **Threshold Key Generation**: Create t-of-n key shares using trusted dealer key generation
- **Signing Ceremonies**: Coordinate multi-party signing sessions with real-time status
- **WASM Cryptography**: Real FROST operations via WebAssembly (Ed25519 and Orchard/RedPallas)
- **Session Management**: Track active and completed signing sessions
- **frostd Integration**: Connect to frostd server for production ceremony coordination

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
├─────────────────────────────────────────────────────────────┤
│  React Components (shadcn/ui)                               │
│  ├── Key Generation Wizard                                  │
│  ├── Signing Session Manager                                │
│  └── Participant Coordination                               │
├─────────────────────────────────────────────────────────────┤
│  State Management (Zustand)                                 │
│  └── Sessions, Participants, Connection Status              │
├─────────────────────────────────────────────────────────────┤
│  FROST WASM Modules                                         │
│  ├── frost-wasm (Ed25519 signatures)                        │
│  ├── frost-zcash-wasm (Orchard/RedPallas signatures)        │
│  └── Key generation, commitment, signing, aggregation       │
├─────────────────────────────────────────────────────────────┤
│  frostd Connection                                          │
│  └── REST API to frostd server for ceremony coordination    │
└─────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/frost-ui.git
cd frost-ui

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## WASM Build

The FROST cryptography is compiled from Rust to WebAssembly. WASM builds are automated via GitHub Actions, but you can build locally:

### Linux/macOS

```bash
# Install Rust and wasm-pack
curl https://sh.rustup.rs -sSf | sh
cargo install wasm-pack
rustup target add wasm32-unknown-unknown

# Build WASM
./scripts/build-wasm.sh
```

### Windows

See [WASM-INTEGRATION.md](./WASM-INTEGRATION.md) for Windows-specific instructions.

### CI/CD

WASM is automatically built on push via GitHub Actions. The workflow:
1. Builds and tests the Next.js application
2. Compiles WASM on Ubuntu (avoiding Windows toolchain issues)
3. Uploads WASM artifacts for use in deployments

## Project Structure

```
frost-ui/
├── src/
│   ├── app/                    # Next.js app router pages
│   │   ├── page.tsx            # Home/Dashboard
│   │   ├── sessions/           # Signing sessions
│   │   └── settings/           # Configuration
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   └── frost/              # FROST-specific components
│   └── lib/
│       ├── frost-wasm/         # Rust WASM module
│       │   ├── src/lib.rs      # FROST bindings
│       │   ├── Cargo.toml      # Rust dependencies
│       │   └── loader.ts       # TypeScript WASM loader
│       ├── hooks/              # React hooks
│       └── store.ts            # Zustand state
├── .github/workflows/          # CI/CD
└── scripts/                    # Build scripts
```

## Documentation

- [WASM Integration](./WASM-INTEGRATION.md) - Details on the FROST WASM module

## Development

```bash
# Run development server
npm run dev

# Type check
npm run lint

# Build for production
npm run build
```

## Testing

The project includes comprehensive test suites:

```bash
# Ed25519 signing ceremony against live frostd (33 tests)
npx tsx scripts/test-ceremony.ts https://localhost:2745

# Zcash/Orchard local WASM test (9 tests)
npx tsx scripts/test-zcash-ceremony.ts

# Zcash/Orchard signing ceremony against live frostd (34 tests)
npx tsx scripts/test-zcash-ceremony-live.ts https://localhost:2745
```

Total: 76+ tests covering cryptographic correctness and protocol flow.

## Testing with frostd

To test the client against a real frostd server:

### 1. Install frostd

```bash
cargo install frostd
```

### 2. Generate TLS Certificates

frostd requires TLS. Use [mkcert](https://github.com/FiloSottile/mkcert) for local development:

```bash
# Install mkcert (macOS)
brew install mkcert

# Install mkcert (Linux)
# See https://github.com/FiloSottile/mkcert#installation

# Generate local CA and certs
mkcert -install
mkcert localhost
```

### 3. Run frostd

```bash
frostd --cert localhost.pem --key localhost-key.pem
```

Default port is 2743.

### 4. Run Smoke Test

```bash
# Test against local frostd
npx tsx scripts/test-frostd.ts

# Or specify a custom URL
npx tsx scripts/test-frostd.ts https://localhost:2743
```

The smoke test validates the complete authentication and session flow:
- Challenge/response authentication with XEdDSA
- Session creation, listing, and info retrieval
- Message send/receive
- Session cleanup

## Security Considerations

- **Secret Key Storage**: Signing shares must never be logged or stored unencrypted
- **Nonce Reuse**: Nonces are single-use and bound to message_id; reuse compromises security
- **TLS Required**: All frostd communication must use TLS to prevent MITM attacks

## Related Projects

- [FROST](https://github.com/ZcashFoundation/frost) - FROST implementation in Rust
- [frostd](https://github.com/ZcashFoundation/frost) - FROST daemon for ceremony coordination

## License

MIT
