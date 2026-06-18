# Immutable DoDIN — Federated Merkle Audit Demo

A React component demonstrating a hierarchical Merkle tree audit system for DoDIN endpoints, with Bitcoin testnet anchoring.

## What it does

Simulates a live event feed from DoDIN endpoints (file saves, AI prompts, logins, network connections) and cryptographically hashes each event using SHA-256. Events are organized into a 4-tier Merkle tree:

| Tier | Level |
|------|-------|
| 1 | Individual endpoints (NIPR workstations) |
| 2 | Base/installation roots |
| 3 | Regional gateway roots (EUCOM, INDOPACOM, CENTCOM) |
| 4 | Global anchor root → Bitcoin testnet OP_RETURN |

The global root is anchored to the Bitcoin testnet every 5 minutes (30 seconds in demo mode), providing a tamper-evident, immutable audit trail at a cost of 32 bytes per cycle.

## Tamper detection

Click **Tamper** on any live event to simulate an adversarial log modification. The Merkle root instantly invalidates and a quarantine alert fires showing the exact endpoint, file, and root hash mismatch.

## Blockchain anchoring

Provide a testnet WIF private key to broadcast a real `OP_RETURN` transaction via the Blockstream Esplora API. Without a key, the component runs in demo/preview mode showing what would be broadcast.

To broadcast for real:
1. `npm i bitcoinjs-lib`
2. Fund a testnet wallet via the [Blockstream faucet](https://blockstream.info/testnet/faucet)
3. Build an `OP_RETURN` output with the 32-byte global root hash
4. Sign with your WIF key and POST to `https://blockstream.info/testnet/api/tx`

## Usage

Drop `immutable-dodin-demo.jsx` into any React project and render `<App />`. No external dependencies beyond React itself — SHA-256 uses the browser's native `crypto.subtle` API.

```jsx
import App from './immutable-dodin-demo';

export default function Page() {
  return <App />;
}
```

---

`UNCLASSIFIED // DEMO`
