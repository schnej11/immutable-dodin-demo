import { useState, useEffect, useRef } from "react";

// ── Color palette (dark ops) ──────────────────────────────────────────────────
const C = {
  bg:       "#080c14",
  surf:     "#0d1220",
  surf2:    "#111929",
  surf3:    "#162030",
  border:   "#1b2a3f",
  borderHi: "#253d58",
  text:     "#c8d8e8",
  dim:      "#5a7a96",
  muted:    "#243040",
  green:    "#2ecc71",
  greenBg:  "#051510",
  greenBd:  "#0a3520",
  red:      "#e74c3c",
  redBg:    "#180808",
  redBd:    "#4d1515",
  amber:    "#f39c12",
  amberBg:  "#180e00",
  amberBd:  "#5a3800",
  blue:     "#3498db",
  blueBg:   "#071020",
  blueBd:   "#0e2e50",
  mono:     "'Courier New', Consolas, 'Lucida Console', monospace",
};

// ── Crypto helpers ────────────────────────────────────────────────────────────
async function sha256(data) {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Pair(a, b) { return sha256(a + b); }

async function buildMerkleRoot(hashes) {
  if (!hashes.length) return sha256("empty");
  let level = [...hashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2)
      next.push(await sha256Pair(level[i], level[i + 1] || level[i]));
    level = next;
  }
  return level[0];
}

// ── Event generators ──────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { type: "FILE_SAVE",    icon: "💾", label: "File saved"      },
  { type: "AI_PROMPT",   icon: "🤖", label: "AI prompt exec"  },
  { type: "FILE_MODIFY", icon: "✏️", label: "File modified"   },
  { type: "LOGIN_CAC",   icon: "🔐", label: "CAC login"       },
  { type: "NET_CONNECT", icon: "🌐", label: "Network connect" },
];

const ENDPOINTS = [
  "NIPR-WS-001", "NIPR-WS-042", "NIPR-WS-117",
  "NIPR-WS-203", "NIPR-WS-311", "NIPR-WS-408",
];

const BASES   = ["JBPHH", "Al Udeid AB", "Peterson SFB"];
const REGIONS = ["INDOPACOM", "CENTCOM", "USSPACECOM"];

const FILES = [
  "logistics_manifest_v3.docx",
  "unit_deploy_order.xlsx",
  "supply_chain_data.csv",
  "ops_memo_final.docx",
  "intel_brief.pdf",
  "mission_plan_alpha.docx",
];

function genEvent(id) {
  const et = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const file = FILES[Math.floor(Math.random() * FILES.length)];
  return {
    id,
    timestamp: Date.now(),
    type: et.type,
    icon: et.icon,
    label: et.label,
    endpoint: ep,
    file,
    user: "GS" + (Math.floor(Math.random() * 5) + 9) + "-" + Math.floor(1000 + Math.random() * 9000),
    payload: `${et.type}::${ep}::${file}::${Date.now()}::${Math.random()}`,
    tampered: false,
  };
}

// ── Bitcoin Testnet helpers (local anchor server) ─────────────────────────────
async function broadcastToTestnet(rootHash) {
  try {
    const res = await fetch("http://localhost:3001/anchor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootHash }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, msg: data.error };
    return { success: true, txid: data.txid, url: data.url };
  } catch {
    return { success: false, msg: "Anchor server not running. Start with: npm run dev" };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [events, setEvents]               = useState([]);
  const [eventHashes, setEventHashes]     = useState([]);
  const [endpointRoots, setEndpointRoots] = useState({});
  const [baseRoots, setBaseRoots]         = useState({});
  const [regionRoots, setRegionRoots]     = useState({});
  const [globalRoot, setGlobalRoot]       = useState(null);
  const [tamperAlert, setTamperAlert]     = useState(null);
  const [anchorHistory, setAnchorHistory] = useState([]);
  const [broadcastStatus, setBroadcastStatus] = useState(null);
  const [isRunning, setIsRunning]         = useState(true);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [lastAnchorTime, setLastAnchorTime] = useState(null);
  const counterRef = useRef(0);
  const intervalRef = useRef(null);
  const merkleIntervalRef = useRef(null);

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      const e = genEvent(++counterRef.current);
      setEvents(prev => [e, ...prev].slice(0, 100));
    }, 1200);
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  useEffect(() => {
    if (!events.length) return;
    (async () => {
      const hashes = await Promise.all(
        events.map(e => e.tampered ? sha256("TAMPERED::" + e.payload) : sha256(e.payload))
      );
      setEventHashes(hashes);

      const byEndpoint = {};
      events.forEach((e, i) => {
        if (!byEndpoint[e.endpoint]) byEndpoint[e.endpoint] = [];
        byEndpoint[e.endpoint].push(hashes[i]);
      });
      const epRoots = {};
      for (const [ep, hs] of Object.entries(byEndpoint))
        epRoots[ep] = await buildMerkleRoot(hs);
      setEndpointRoots(epRoots);

      const baseAssign = Object.fromEntries(BASES.map(b => [b, []]));
      Object.entries(epRoots).forEach(([, root], i) => baseAssign[BASES[i % 3]].push(root));
      const bRoots = {};
      for (const [base, roots] of Object.entries(baseAssign))
        bRoots[base] = await buildMerkleRoot(roots);
      setBaseRoots(bRoots);

      const regAssign = Object.fromEntries(REGIONS.map(r => [r, []]));
      Object.entries(bRoots).forEach(([, root], i) => regAssign[REGIONS[i % 3]].push(root));
      const rRoots = {};
      for (const [reg, roots] of Object.entries(regAssign))
        rRoots[reg] = await buildMerkleRoot(roots);
      setRegionRoots(rRoots);

      const gr = await buildMerkleRoot(Object.values(rRoots));
      setGlobalRoot(prev => {
        if (prev && prev !== gr) {
          const tampered = events.find(e => e.tampered);
          if (tampered)
            setTamperAlert({ endpoint: tampered.endpoint, file: tampered.file, ts: Date.now(), oldRoot: prev, newRoot: gr });
        }
        return gr;
      });
    })();
  }, [events]);

  useEffect(() => {
    merkleIntervalRef.current = setInterval(() => {
      if (globalRoot) {
        setLastAnchorTime(Date.now());
        setAnchorHistory(prev => [{
          root: globalRoot, ts: Date.now(), events: events.length, status: "pending", txid: null,
        }, ...prev].slice(0, 10));
      }
    }, 30000);
    return () => clearInterval(merkleIntervalRef.current);
  }, [globalRoot, events.length]);

  const tamperEvent  = id => { setEvents(prev => prev.map(e => e.id === id ? { ...e, tampered: true  } : e)); setTamperAlert(null); };
  const restoreEvent = id => { setEvents(prev => prev.map(e => e.id === id ? { ...e, tampered: false } : e)); setTamperAlert(null); };

  const handleAnchor = async () => {
    if (!globalRoot) return;
    setAnchorLoading(true);
    setBroadcastStatus(null);
    const anchor = { root: globalRoot, ts: Date.now(), events: events.length, status: "broadcasting", txid: null };
    setAnchorHistory(prev => [anchor, ...prev].slice(0, 10));
    const result = await broadcastToTestnet(globalRoot);
    const final  = { ...anchor, status: result.success ? "confirmed" : "error", txid: result.txid || null, url: result.url || null, msg: result.msg || null };
    setBroadcastStatus(final);
    setAnchorHistory(prev => [final, ...prev.slice(1)]);
    setLastAnchorTime(Date.now());
    setAnchorLoading(false);
  };

  const hasTamper      = events.some(e => e.tampered);
  const tamperedEvents = events.filter(e => e.tampered);
  const tamperedEps    = new Set(tamperedEvents.map(e => e.endpoint));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: "100vh", fontSize: 14 }}>

      {/* ── Header ── */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ background: C.amberBg, border: `1px solid ${C.amberBd}`, color: C.amber, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 2, letterSpacing: "0.1em", fontFamily: C.mono }}>
            UNCLASSIFIED // DEMO
          </span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Immutable DoDIN — Federated Merkle Audit
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2, letterSpacing: "0.03em" }}>
              Hierarchical Merkle Tree &nbsp;·&nbsp; Bitcoin Testnet Anchor
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: isRunning ? C.green : C.amber, boxShadow: `0 0 8px ${isRunning ? C.green : C.amber}`, display: "inline-block" }} />
            <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: isRunning ? C.green : C.amber, letterSpacing: "0.08em" }}>
              {isRunning ? "LIVE" : "PAUSED"}
            </span>
          </div>
          <button onClick={() => setIsRunning(r => !r)} style={{ padding: "6px 16px", borderRadius: 4, border: `1px solid ${C.borderHi}`, background: C.surf2, color: C.text, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            {isRunning ? "⏸ Pause" : "▶ Resume"}
          </button>
        </div>
      </div>

      {/* ── Tamper Alert ── */}
      {tamperAlert && (
        <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redBd}`, borderLeft: `4px solid ${C.red}`, padding: "12px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 22 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 700, color: C.red, fontSize: 15, letterSpacing: "0.06em" }}>INTEGRITY VIOLATION DETECTED — ENDPOINT QUARANTINED</div>
            <div style={{ fontSize: 13, color: C.red, opacity: 0.9, marginTop: 4 }}>
              Endpoint: <strong>{tamperAlert.endpoint}</strong> &nbsp;·&nbsp; File: <span style={{ fontFamily: C.mono }}>{tamperAlert.file}</span>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.red, opacity: 0.7, marginTop: 5, lineHeight: 1.8 }}>
              PREV: {tamperAlert.oldRoot}<br />
              NOW:  {tamperAlert.newRoot}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Row 1: Merkle tree | Live events | Tampered events ── */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>

          {/* Merkle hierarchy */}
          <div style={{ width: 290, flexShrink: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12 }}>
              Merkle Hierarchy
            </div>

            {/* T4 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>Tier 4 — Global Anchor</div>
              <div style={{ background: globalRoot ? (hasTamper ? C.redBg : C.greenBg) : C.surf2, border: `1px solid ${globalRoot ? (hasTamper ? C.redBd : C.greenBd) : C.border}`, borderRadius: 4, padding: "10px 11px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: hasTamper ? C.red : C.green, marginBottom: 6, letterSpacing: "0.05em" }}>
                  {hasTamper ? "⚠  INTEGRITY FAIL" : "●  INTEGRITY OK"}
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 8, color: hasTamper ? C.red : C.green, wordBreak: "break-all", lineHeight: 1.6 }}>
                  {globalRoot || "—"}
                </div>
              </div>
            </div>

            {/* T3 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>Tier 3 — Regional Commands</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {REGIONS.map(reg => (
                  <div key={reg} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "7px 9px" }}>
                    <div style={{ fontSize: 13, color: C.blue, fontWeight: 600, marginBottom: 4 }}>{reg}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 8, color: C.dim, wordBreak: "break-all", lineHeight: 1.6 }}>
                      {regionRoots[reg] || "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* T2 */}
            <div>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>Tier 2 — Installations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {BASES.map(base => (
                  <div key={base} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "7px 9px" }}>
                    <div style={{ fontSize: 12, color: C.dim, fontWeight: 600, marginBottom: 4 }}>{base}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 8, color: C.muted, wordBreak: "break-all", lineHeight: 1.6 }}>
                      {baseRoots[base] || "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live events */}
          <div style={{ flex: 1, minWidth: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>Live Events Feed</span>
              <span style={{ color: C.muted, fontFamily: C.mono }}>{events.length} total</span>
            </div>
            <div style={{ height: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {events.slice(0, 50).map((e, i) => (
                <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 9px", borderRadius: 4, background: e.tampered ? C.redBg : C.surf2, border: `1px solid ${e.tampered ? C.redBd : C.border}` }}>
                  <span style={{ fontSize: 15, lineHeight: 1.5, flexShrink: 0 }}>{e.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue, fontWeight: 700 }}>{e.endpoint}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, flexShrink: 0 }}>{fmtTime(e.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: e.tampered ? C.red : C.text, marginTop: 2, fontWeight: e.tampered ? 600 : 400 }}>
                      {e.label}
                      {e.tampered && <span style={{ fontWeight: 700, marginLeft: 6, letterSpacing: "0.04em" }}>[TAMPERED]</span>}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 2 }}>{e.file}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 8, color: C.muted, marginTop: 2, wordBreak: "break-all", lineHeight: 1.5 }}>
                      {eventHashes[i] || "hashing…"}
                    </div>
                  </div>
                  {!e.tampered && (
                    <button onClick={() => tamperEvent(e.id)} style={{ padding: "3px 9px", fontSize: 11, borderRadius: 3, border: `1px solid ${C.redBd}`, background: C.redBg, color: C.red, cursor: "pointer", flexShrink: 0, fontFamily: C.mono, fontWeight: 700, letterSpacing: "0.04em" }}>
                      TAMPER
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tampered events */}
          <div style={{ width: 270, flexShrink: 0, background: C.surf, border: `1px solid ${tamperedEvents.length ? C.redBd : C.border}`, borderRadius: 6, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: tamperedEvents.length ? C.red : C.dim, textTransform: "uppercase", borderBottom: `1px solid ${tamperedEvents.length ? C.redBd : C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Tampered Events</span>
              {tamperedEvents.length > 0 && (
                <span style={{ background: C.redBg, border: `1px solid ${C.redBd}`, color: C.red, fontSize: 12, fontWeight: 700, padding: "1px 8px", borderRadius: 3, fontFamily: C.mono }}>
                  {tamperedEvents.length}
                </span>
              )}
            </div>
            {tamperedEvents.length === 0 ? (
              <div style={{ textAlign: "center", color: C.dim, fontSize: 13, padding: "60px 0" }}>
                <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.4 }}>✓</div>
                No integrity violations
              </div>
            ) : (
              <div style={{ height: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
                {tamperedEvents.map(e => (
                  <div key={e.id} style={{ background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 4, padding: "10px 11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 13, color: C.red, fontWeight: 700 }}>{e.endpoint}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{fmtTime(e.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.red, marginBottom: 3 }}>{e.label}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginBottom: 8 }}>{e.file}</div>
                    <button onClick={() => restoreEvent(e.id)} style={{ width: "100%", padding: "6px 0", fontSize: 12, borderRadius: 3, border: `1px solid ${C.greenBd}`, background: C.greenBg, color: C.green, cursor: "pointer", fontWeight: 700, fontFamily: C.mono, letterSpacing: "0.05em" }}>
                      ↩ RESTORE INTEGRITY
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ── Row 2: Tier 1 Endpoints ── */}
        <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span>Tier 1 — Endpoint Nodes</span>
            <span style={{ color: C.muted, fontFamily: C.mono }}>{Object.keys(endpointRoots).length} / {ENDPOINTS.length} active</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 9 }}>
            {ENDPOINTS.map(ep => {
              const isTampered = tamperedEps.has(ep);
              const root       = endpointRoots[ep];
              const epEvents   = events.filter(e => e.endpoint === ep);
              const last       = epEvents[0];
              return (
                <div key={ep} style={{ background: isTampered ? C.redBg : C.surf2, border: `1px solid ${isTampered ? C.redBd : C.border}`, borderRadius: 4, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: isTampered ? C.red : C.blue }}>{ep}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 2, fontFamily: C.mono, letterSpacing: "0.05em", background: isTampered ? C.redBd : C.greenBg, color: isTampered ? C.red : C.green, border: `1px solid ${isTampered ? C.red : C.greenBd}` }}>
                      {isTampered ? "TAMPERED" : root ? "CLEAN" : "IDLE"}
                    </span>
                  </div>
                  {last && (
                    <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>
                      {last.icon} {last.label} &nbsp;·&nbsp; <span style={{ fontFamily: C.mono }}>{fmtTime(last.timestamp)}</span>
                    </div>
                  )}
                  <div style={{ fontFamily: C.mono, fontSize: 8, color: isTampered ? C.redBd : C.muted, wordBreak: "break-all", lineHeight: 1.6 }}>
                    {root || "no data"}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>{epEvents.length} events</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Row 3: Blockchain Anchor ── */}
        <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12 }}>
            Blockchain Anchor — Bitcoin Testnet
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

            <div style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em", marginBottom: 7, textTransform: "uppercase" }}>Current Global Root (OP_RETURN payload)</div>
              <div style={{ fontFamily: C.mono, fontSize: 12, wordBreak: "break-all", padding: "11px 13px", background: C.surf2, borderRadius: 4, border: `1px solid ${C.border}`, color: hasTamper ? C.red : C.green, lineHeight: 1.7 }}>
                {globalRoot || "Waiting for events…"}
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 7 }}>
                {events.length} events &nbsp;·&nbsp; {Object.keys(endpointRoots).length} endpoints &nbsp;·&nbsp; {Object.keys(baseRoots).length} bases &nbsp;·&nbsp; {Object.keys(regionRoots).length} regions
                {lastAnchorTime && <span> &nbsp;·&nbsp; last anchored {fmtTime(lastAnchorTime)}</span>}
              </div>
            </div>

            <div style={{ minWidth: 250 }}>
              <button onClick={handleAnchor} disabled={!globalRoot || anchorLoading} style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: `1px solid ${C.blueBd}`, background: C.blueBg, color: globalRoot && !anchorLoading ? C.blue : C.dim, cursor: globalRoot && !anchorLoading ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 700, fontFamily: C.mono, letterSpacing: "0.05em", marginBottom: 7 }}>
                {anchorLoading ? "BROADCASTING…" : "⚓  ANCHOR TO TESTNET"}
              </button>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>Auto-anchors every 30 s &nbsp;·&nbsp; Production: 5 min</div>

              {broadcastStatus && (
                <div style={{ background: broadcastStatus.status === "confirmed" ? C.greenBg : C.redBg, border: `1px solid ${broadcastStatus.status === "confirmed" ? C.greenBd : C.redBd}`, borderRadius: 4, padding: "9px 11px", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: broadcastStatus.status === "confirmed" ? C.green : C.red, marginBottom: 5 }}>
                    {broadcastStatus.status === "confirmed" ? "✅  CONFIRMED" : "❌  FAILED"}
                  </div>
                  {broadcastStatus.msg && <div style={{ fontSize: 11, color: C.dim, marginBottom: 5 }}>{broadcastStatus.msg}</div>}
                  {broadcastStatus.txid && (
                    <>
                      <div style={{ fontSize: 10, color: C.dim, marginBottom: 2, letterSpacing: "0.06em" }}>TXID</div>
                      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.blue, wordBreak: "break-all", marginBottom: 6, lineHeight: 1.6 }}>{broadcastStatus.txid}</div>
                      <a href={broadcastStatus.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.blue }}>View on Blockstream ↗</a>
                    </>
                  )}
                </div>
              )}

              {anchorHistory.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase" }}>Anchor History</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {anchorHistory.slice(0, 6).map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "6px 9px", background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 3 }}>
                        <span style={{ flexShrink: 0, marginTop: 1 }}>
                          {a.status === "confirmed" ? "✅" : a.status === "pending" ? "⏳" : "❌"}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{fmtTime(a.ts)} &nbsp;·&nbsp; {a.events} events</div>
                          <div style={{ fontFamily: C.mono, fontSize: 8, color: C.muted, wordBreak: "break-all", lineHeight: 1.6 }}>{a.root}</div>
                          {a.txid && (
                            <a href={`https://blockstream.info/testnet/tx/${a.txid}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: C.blue }}>
                              {a.txid}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer stats ── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["Events Hashed", events.length,                             false],
            ["Endpoints",     Object.keys(endpointRoots).length,         false],
            ["Installations", Object.keys(baseRoots).length,             false],
            ["Regions",       Object.keys(regionRoots).length,           false],
            ["Anchors",       anchorHistory.length,                      false],
            ["Tampered",      tamperedEvents.length,                     tamperedEvents.length > 0],
            ["Chain Cost",    "32 B / 5 MIN",                            false],
          ].map(([label, val, alert]) => (
            <div key={label} style={{ flex: 1, minWidth: 90, background: C.surf, border: `1px solid ${alert ? C.redBd : C.border}`, borderRadius: 4, padding: "10px 13px" }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: C.mono, color: alert ? C.red : C.text }}>{val}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
