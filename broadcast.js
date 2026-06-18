#!/usr/bin/env node
/**
 * Anchors a 32-byte Merkle root hash to Bitcoin testnet via OP_RETURN.
 *
 * Usage:
 *   node broadcast.js <WIF_KEY> <ROOT_HASH_HEX>
 *
 * To generate a new testnet wallet (no WIF key yet):
 *   node broadcast.js --keygen
 */

if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const bitcoin = require("bitcoinjs-lib");
const { ECPairFactory } = require("ecpair");
const ecc = require("tiny-secp256k1");

const ECPair = ECPairFactory(ecc);
const NETWORK = bitcoin.networks.testnet;
const ESPLORA = "https://blockstream.info/testnet/api";
const FEE_SATS = 1500; // ~10 sat/vbyte for a small OP_RETURN tx

async function getUtxos(address) {
  const res = await fetch(`${ESPLORA}/address/${address}/utxo`);
  if (!res.ok) throw new Error(`UTXO fetch failed: ${res.status}`);
  return res.json();
}

async function broadcastRaw(hex) {
  const res = await fetch(`${ESPLORA}/tx`, { method: "POST", body: hex });
  const text = await res.text();
  if (!res.ok) throw new Error(`Broadcast failed: ${text}`);
  return text.trim();
}

async function keygen() {
  const pair = ECPair.makeRandom({ network: NETWORK });
  const { address } = bitcoin.payments.p2wpkh({ pubkey: pair.publicKey, network: NETWORK });
  console.log("\n--- New testnet wallet ---");
  console.log(`Address : ${address}`);
  console.log(`WIF key : ${pair.toWIF()}`);
  console.log("\nFund this address at: https://blockstream.info/testnet/faucet");
  console.log("Then run: node broadcast.js <WIF_KEY> <ROOT_HASH_HEX>\n");
}

async function anchor(wifKey, rootHashHex) {
  if (rootHashHex.length !== 64) {
    throw new Error(`Root hash must be 64 hex chars (32 bytes), got ${rootHashHex.length}`);
  }

  const pair = ECPair.fromWIF(wifKey, NETWORK);
  const { address, output: witnessScript } = bitcoin.payments.p2wpkh({
    pubkey: pair.publicKey,
    network: NETWORK,
  });

  console.log(`\nAddress : ${address}`);
  console.log(`Root    : ${rootHashHex}`);

  const utxos = await getUtxos(address);
  if (!utxos.length) {
    console.error(`\nNo UTXOs found. Fund this address first:`);
    console.error(`  https://blockstream.info/testnet/faucet\n`);
    process.exit(1);
  }

  // Pick the largest UTXO
  const utxo = utxos.sort((a, b) => b.value - a.value)[0];
  const changeValue = utxo.value - FEE_SATS;
  if (changeValue < 0) {
    throw new Error(`UTXO value ${utxo.value} sats is less than fee ${FEE_SATS} sats`);
  }

  console.log(`UTXO    : ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
  console.log(`Fee     : ${FEE_SATS} sats  Change: ${changeValue} sats`);

  const psbt = new bitcoin.Psbt({ network: NETWORK });
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: { script: witnessScript, value: utxo.value },
  });

  // OP_RETURN embedding the 32-byte root hash
  const embed = bitcoin.payments.embed({ data: [Buffer.from(rootHashHex, "hex")] });
  psbt.addOutput({ script: embed.output, value: 0 });

  // Change back to same address
  psbt.addOutput({ address, value: changeValue });

  psbt.signInput(0, pair);
  psbt.finalizeAllInputs();

  const hex = psbt.extractTransaction().toHex();
  console.log(`\nBroadcasting…`);

  const txid = await broadcastRaw(hex);
  console.log(`\n✅ Confirmed!`);
  console.log(`TXID    : ${txid}`);
  console.log(`View    : https://blockstream.info/testnet/tx/${txid}\n`);
  return txid;
}

// ── CLI entry ────────────────────────────────────────────────────────────────
const [, , arg1, arg2] = process.argv;

if (arg1 === "--keygen") {
  keygen().catch(e => { console.error(e.stack || e.message); process.exit(1); });
} else if (arg1 && arg2) {
  anchor(arg1, arg2).catch(e => { console.error(e.stack || e.message); process.exit(1); });
} else {
  console.log(`
Usage:
  node broadcast.js <WIF_KEY> <ROOT_HASH_HEX>   # anchor a hash
  node broadcast.js --keygen                     # generate a new testnet wallet
`);
  process.exit(1);
}
