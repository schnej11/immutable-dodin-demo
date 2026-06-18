require("dotenv").config();
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const express = require("express");
const bitcoin = require("bitcoinjs-lib");
const { ECPairFactory } = require("ecpair");
const ecc = require("tiny-secp256k1");

const ECPair = ECPairFactory(ecc);
const NETWORK = bitcoin.networks.testnet;
const ESPLORA = "https://blockstream.info/testnet/api";
const FEE_SATS = 1500n;

const app = express();
app.use(express.json());

// Allow requests from any localhost origin (covers Vite on any port)
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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

app.post("/anchor", async (req, res) => {
  const { rootHash } = req.body;

  if (!rootHash || rootHash.length !== 64) {
    return res.status(400).json({ error: "rootHash must be 64 hex characters" });
  }

  const wifKey = process.env.WIF_KEY;
  if (!wifKey) {
    return res.status(500).json({ error: "WIF_KEY not set in .env" });
  }

  try {
    const pair = ECPair.fromWIF(wifKey, NETWORK);
    const { address, output: witnessScript } = bitcoin.payments.p2wpkh({
      pubkey: pair.publicKey,
      network: NETWORK,
    });

    const utxos = await getUtxos(address);
    if (!utxos.length) {
      return res.status(402).json({ error: `No UTXOs. Fund ${address} at https://coinfaucet.eu/en/btc-testnet/` });
    }

    const utxo = utxos.sort((a, b) => b.value - a.value)[0];
    const utxoValue = BigInt(utxo.value);
    const changeValue = utxoValue - FEE_SATS;
    if (changeValue < 0n) {
      return res.status(402).json({ error: `Insufficient funds: ${utxo.value} sats < ${FEE_SATS} fee` });
    }

    const psbt = new bitcoin.Psbt({ network: NETWORK });
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: witnessScript, value: utxoValue },
    });

    const embed = bitcoin.payments.embed({ data: [Buffer.from(rootHash, "hex")] });
    psbt.addOutput({ script: embed.output, value: 0n });
    psbt.addOutput({ address, value: changeValue });

    psbt.signInput(0, pair);
    psbt.finalizeAllInputs();

    const txid = await broadcastRaw(psbt.extractTransaction().toHex());
    console.log(`Anchored ${rootHash.slice(0, 8)}… → ${txid}`);
    res.json({ txid, url: `https://blockstream.info/testnet/tx/${txid}` });
  } catch (e) {
    console.error("Anchor error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Anchor server running on http://localhost:${PORT}`));
