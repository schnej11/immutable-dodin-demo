import { useState, useEffect, useRef } from "react";

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg: "#080c14", surf: "#0d1220", surf2: "#111929", surf3: "#162030",
  border: "#1b2a3f", borderHi: "#253d58", text: "#c8d8e8", dim: "#5a7a96",
  muted: "#243040",
  green: "#2ecc71", greenBg: "#051510", greenBd: "#0a3520",
  red: "#e74c3c", redBg: "#180808", redBd: "#4d1515",
  amber: "#f39c12", amberBg: "#180e00", amberBd: "#5a3800",
  blue: "#3498db", blueBg: "#071020", blueBd: "#0e2e50",
  cyan: "#1abc9c", cyanBg: "#051a15", cyanBd: "#0a3028",
  mono: "'Courier New', Consolas, 'Lucida Console', monospace",
};

// ── Static hierarchy mappings ─────────────────────────────────────────────────
const ENDPOINT_BASE = {
  "NIPR-WS-001": "JBPHH",       "NIPR-WS-042": "JBPHH",
  "NIPR-WS-117": "Al Udeid AB", "NIPR-WS-203": "Al Udeid AB",
  "NIPR-WS-311": "Peterson SFB","NIPR-WS-408": "Peterson SFB",
};
const BASE_REGION = {
  "JBPHH": "INDOPACOM", "Al Udeid AB": "CENTCOM", "Peterson SFB": "USSPACECOM",
};
const ENDPOINTS = ["NIPR-WS-001","NIPR-WS-042","NIPR-WS-117","NIPR-WS-203","NIPR-WS-311","NIPR-WS-408"];
const BASES     = ["JBPHH","Al Udeid AB","Peterson SFB"];
const REGIONS   = ["INDOPACOM","CENTCOM","USSPACECOM"];

// ── Crypto helpers ────────────────────────────────────────────────────────────
async function sha256(data) {
  const enc = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Pair(a, b) { return sha256(a + b); }
async function buildMerkleRoot(hashes) {
  if (!hashes.length) return null;
  let lvl = [...hashes];
  while (lvl.length > 1) {
    const next = [];
    for (let i = 0; i < lvl.length; i += 2)
      next.push(await sha256Pair(lvl[i], lvl[i + 1] || lvl[i]));
    lvl = next;
  }
  return lvl[0];
}

// ── Event generators ──────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { type: "FILE_SAVE",    icon: "💾", label: "File saved"      },
  { type: "AI_PROMPT",   icon: "🤖", label: "AI prompt exec"  },
  { type: "FILE_MODIFY", icon: "✏️", label: "File modified"   },
  { type: "LOGIN_CAC",   icon: "🔐", label: "CAC login"       },
  { type: "NET_CONNECT", icon: "🌐", label: "Network connect" },
];
const FILES = [
  "logistics_manifest_v3.docx","unit_deploy_order.xlsx","supply_chain_data.csv",
  "ops_memo_final.docx","intel_brief.pdf","mission_plan_alpha.docx",
];

function genEvent(id) {
  const et   = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const ep   = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const file = FILES[Math.floor(Math.random() * FILES.length)];
  const base = ENDPOINT_BASE[ep];
  return {
    id, timestamp: Date.now(), type: et.type, icon: et.icon, label: et.label,
    endpoint: ep, base, region: BASE_REGION[base], file,
    user: "GS" + (Math.floor(Math.random() * 5) + 9) + "-" + Math.floor(1000 + Math.random() * 9000),
    payload: `${et.type}::${ep}::${file}::${Date.now()}::${Math.random()}`,
    tampered: false,
  };
}

// ── Bitcoin testnet helper ────────────────────────────────────────────────────
async function broadcastToTestnet(rootHash) {
  try {
    const res = await fetch("http://localhost:3001/anchor", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootHash }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, msg: data.error };
    return { success: true, txid: data.txid, url: data.url };
  } catch {
    return { success: false, msg: "Anchor server not running. Start with: npm run dev" };
  }
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [panel, setPanel]               = useState("hashforce");
  const [events, setEvents]             = useState([]);
  const [eventHashes, setEventHashes]   = useState([]);
  const [endpointRoots, setEndpointRoots] = useState({});
  const [baseRoots, setBaseRoots]       = useState({});
  const [regionRoots, setRegionRoots]   = useState({});
  const [globalRoot, setGlobalRoot]     = useState(null);
  const [tamperAlert, setTamperAlert]   = useState(null);
  const [anchorHistory, setAnchorHistory] = useState([]);
  const [broadcastStatus, setBroadcastStatus] = useState(null);
  const [isRunning, setIsRunning]       = useState(true);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [lastAnchorTime, setLastAnchorTime] = useState(null);

  // Two-panel state
  const [pendingQueue, setPendingQueue]     = useState([]);   // [{id, event, logEntry, status}]
  const [transmittedLogs, setTransmittedLogs] = useState([]); // confirmed+transmitted to Cyber Command
  const [expandedJson, setExpandedJson]     = useState(new Set());

  const counterRef = useRef(0);

  // ── Event simulation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => {
      const e = genEvent(++counterRef.current);
      setEvents(prev => [e, ...prev].slice(0, 100));
      setPendingQueue(prev => [{
        id: e.id,
        event: e,
        status: "pending",
        logEntry: {
          id: e.id, timestamp: e.timestamp, endpoint: e.endpoint,
          base: e.base, region: e.region, eventType: e.type,
          file: e.file, user: e.user,
          payloadHash: null, merkleRoot: null, anchorStatus: "pending", txid: null,
        },
      }, ...prev].slice(0, 100));
    }, 1200);
    return () => clearInterval(t);
  }, [isRunning]);

  // ── Merkle tree recomputation ─────────────────────────────────────────────
  useEffect(() => {
    if (!events.length) return;
    (async () => {
      const hashes = await Promise.all(
        events.map(e => e.tampered ? sha256("TAMPERED::" + e.payload) : sha256(e.payload))
      );
      setEventHashes(hashes);

      // Propagate payloadHash to queue entries that don't have it yet
      const hm = {};
      events.forEach((e, i) => { hm[e.id] = hashes[i]; });
      setPendingQueue(prev => prev.map(item => {
        const h = hm[item.id];
        if (!h || item.logEntry.payloadHash) return item;
        return { ...item, logEntry: { ...item.logEntry, payloadHash: h } };
      }));

      // Endpoint roots
      const epRoots = {};
      for (const ep of ENDPOINTS) {
        const hs = events.map((e, i) => e.endpoint === ep ? hashes[i] : null).filter(Boolean);
        if (hs.length) epRoots[ep] = await buildMerkleRoot(hs);
      }
      setEndpointRoots(epRoots);

      // Base roots (static mapping)
      const bRoots = {};
      for (const base of BASES) {
        const roots = ENDPOINTS.filter(ep => ENDPOINT_BASE[ep] === base && epRoots[ep]).map(ep => epRoots[ep]);
        const r = await buildMerkleRoot(roots);
        if (r) bRoots[base] = r;
      }
      setBaseRoots(bRoots);

      // Region roots (static mapping)
      const rRoots = {};
      for (const reg of REGIONS) {
        const roots = BASES.filter(b => BASE_REGION[b] === reg && bRoots[b]).map(b => bRoots[b]);
        const r = await buildMerkleRoot(roots);
        if (r) rRoots[reg] = r;
      }
      setRegionRoots(rRoots);

      const gr = await buildMerkleRoot(Object.values(rRoots));
      setGlobalRoot(prev => {
        if (prev && gr && prev !== gr) {
          const t = events.find(e => e.tampered);
          if (t) setTamperAlert({ endpoint: t.endpoint, file: t.file, ts: Date.now(), oldRoot: prev, newRoot: gr });
        }
        return gr;
      });
    })();
  }, [events]);

  // ── Auto-anchor every 30 s ────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (!globalRoot) return;
      setLastAnchorTime(Date.now());
      setAnchorHistory(prev => [
        { root: globalRoot, ts: Date.now(), events: events.length, status: "pending", txid: null },
        ...prev,
      ].slice(0, 10));
      setPendingQueue(prev => prev.map(item =>
        item.status === "pending"
          ? { ...item, status: "confirmed", logEntry: { ...item.logEntry, merkleRoot: globalRoot, anchorStatus: "confirmed", txid: null } }
          : item
      ));
    }, 30000);
    return () => clearInterval(t);
  }, [globalRoot, events.length]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const tamperEvent  = id => { setEvents(p => p.map(e => e.id === id ? { ...e, tampered: true  } : e)); setTamperAlert(null); };
  const restoreEvent = id => { setEvents(p => p.map(e => e.id === id ? { ...e, tampered: false } : e)); setTamperAlert(null); };

  const handleAnchor = async () => {
    if (!globalRoot) return;
    setAnchorLoading(true);
    setBroadcastStatus(null);
    const snap = { root: globalRoot, ts: Date.now(), events: events.length, status: "broadcasting", txid: null };
    setAnchorHistory(prev => [snap, ...prev].slice(0, 10));
    const result = await broadcastToTestnet(globalRoot);
    const final  = { ...snap, status: result.success ? "confirmed" : "error", txid: result.txid || null, url: result.url || null, msg: result.msg || null };
    setBroadcastStatus(final);
    setAnchorHistory(prev => [final, ...prev.slice(1)]);
    setLastAnchorTime(Date.now());
    setPendingQueue(prev => prev.map(item =>
      item.status === "pending"
        ? { ...item, status: "confirmed", logEntry: { ...item.logEntry, merkleRoot: globalRoot, anchorStatus: "confirmed", txid: result.txid || null } }
        : item
    ));
    setAnchorLoading(false);
  };

  const transmitLog = item => {
    const entry = { ...item.logEntry, tampered: item.event?.tampered || false, transmittedAt: Date.now() };
    setPendingQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "transmitted" } : q));
    setTransmittedLogs(prev => prev.find(l => l.id === entry.id) ? prev : [entry, ...prev]);
  };

  const toggleJson = id => setExpandedJson(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const hasTamper      = events.some(e => e.tampered);
  const tamperedEvents = events.filter(e => e.tampered);
  const tamperedEps    = new Set(tamperedEvents.map(e => e.endpoint));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: "100vh", fontSize: 14 }}>

      {/* ── Header ── */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.border}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ background: C.amberBg, border: `1px solid ${C.amberBd}`, color: C.amber, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 2, letterSpacing: "0.1em", fontFamily: C.mono }}>
            UNCLASSIFIED // DEMO
          </span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Immutable DoDIN — Federated Merkle Audit
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2, letterSpacing: "0.03em" }}>
              Hierarchical Merkle Tree · Bitcoin Testnet Anchor
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Panel tabs */}
          {[
            { id: "hashforce",    label: "⬡ HASH FORCE",    sub: "Operator View"                          },
            { id: "cybercommand", label: "◈ CYBER COMMAND",  sub: `${transmittedLogs.length} logs received` },
          ].map(tab => (
            <button key={tab.id} onClick={() => setPanel(tab.id)} style={{
              padding: "6px 16px", borderRadius: 4, cursor: "pointer", textAlign: "left",
              border:      `1px solid ${panel === tab.id ? C.blue : C.border}`,
              background:  panel === tab.id ? C.blueBg : C.surf2,
              color:       panel === tab.id ? C.blue : C.dim,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em" }}>{tab.label}</div>
              <div style={{ fontSize: 10, opacity: 0.75, marginTop: 1 }}>{tab.sub}</div>
            </button>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", background: isRunning ? C.green : C.amber, boxShadow: `0 0 8px ${isRunning ? C.green : C.amber}` }} />
            <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: isRunning ? C.green : C.amber, letterSpacing: "0.08em" }}>
              {isRunning ? "LIVE" : "PAUSED"}
            </span>
            <button onClick={() => setIsRunning(r => !r)} style={{ padding: "5px 13px", borderRadius: 4, border: `1px solid ${C.borderHi}`, background: C.surf2, color: C.text, cursor: "pointer", fontSize: 13 }}>
              {isRunning ? "⏸ Pause" : "▶ Resume"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tamper Alert ── */}
      {tamperAlert && (
        <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redBd}`, borderLeft: `4px solid ${C.red}`, padding: "10px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: C.red, fontSize: 14, letterSpacing: "0.06em" }}>INTEGRITY VIOLATION DETECTED — ENDPOINT QUARANTINED</div>
            <div style={{ fontSize: 12, color: C.red, opacity: 0.9, marginTop: 3 }}>
              Endpoint: <strong>{tamperAlert.endpoint}</strong> · File: <span style={{ fontFamily: C.mono }}>{tamperAlert.file}</span>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.red, opacity: 0.7, marginTop: 4, lineHeight: 1.8 }}>
              PREV: {tamperAlert.oldRoot}<br />NOW:  {tamperAlert.newRoot}
            </div>
          </div>
          <button onClick={() => setTamperAlert(null)} style={{ background: "transparent", border: `1px solid ${C.redBd}`, color: C.red, cursor: "pointer", padding: "3px 8px", borderRadius: 3, fontSize: 11 }}>✕</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          HASH FORCE PANEL
      ════════════════════════════════════════════════════════════ */}
      {panel === "hashforce" && (
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Row 1: 4 columns */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

            {/* ── Col 1: Merkle Hierarchy ── */}
            <div style={{ width: 245, flexShrink: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 13px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12 }}>Merkle Hierarchy</div>

              <div style={{ marginBottom: 13 }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" }}>Tier 4 — Global Anchor</div>
                <div style={{ background: globalRoot ? (hasTamper ? C.redBg : C.greenBg) : C.surf2, border: `1px solid ${globalRoot ? (hasTamper ? C.redBd : C.greenBd) : C.border}`, borderRadius: 4, padding: "8px 10px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: hasTamper ? C.red : C.green, marginBottom: 5, letterSpacing: "0.05em" }}>
                    {hasTamper ? "⚠  INTEGRITY FAIL" : "●  INTEGRITY OK"}
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 7.5, color: hasTamper ? C.red : C.green, wordBreak: "break-all", lineHeight: 1.6 }}>{globalRoot || "—"}</div>
                </div>
              </div>

              <div style={{ marginBottom: 13 }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" }}>Tier 3 — Regional Commands</div>
                {REGIONS.map(reg => (
                  <div key={reg} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 9px", marginBottom: 5 }}>
                    <div style={{ fontSize: 12, color: C.blue, fontWeight: 600, marginBottom: 3 }}>{reg}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.dim, wordBreak: "break-all", lineHeight: 1.5 }}>{regionRoots[reg] || "—"}</div>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" }}>Tier 2 — Installations</div>
                {BASES.map(base => (
                  <div key={base} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 9px", marginBottom: 5 }}>
                    <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginBottom: 3 }}>{base}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.muted, wordBreak: "break-all", lineHeight: 1.5 }}>{baseRoots[base] || "—"}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Col 2: Live Events Feed ── */}
            <div style={{ flex: 1, minWidth: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 13px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                <span>Live Events Feed</span>
                <span style={{ fontFamily: C.mono, color: C.muted }}>{events.length} total</span>
              </div>
              <div style={{ height: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {events.slice(0, 60).map((e, i) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", borderRadius: 4, background: e.tampered ? C.redBg : C.surf2, border: `1px solid ${e.tampered ? C.redBd : C.border}` }}>
                    <span style={{ fontSize: 13, lineHeight: 1.6, flexShrink: 0 }}>{e.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.blue, fontWeight: 700 }}>{e.endpoint}</span>
                        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, flexShrink: 0 }}>{fmtTime(e.timestamp)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: e.tampered ? C.red : C.text, marginTop: 2, fontWeight: e.tampered ? 600 : 400 }}>
                        {e.label}{e.tampered && <span style={{ marginLeft: 5, letterSpacing: "0.04em" }}>[TAMPERED]</span>}
                      </div>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginTop: 1 }}>{e.file}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.muted, marginTop: 2, wordBreak: "break-all", lineHeight: 1.5 }}>{eventHashes[i] || "hashing…"}</div>
                    </div>
                    {!e.tampered && (
                      <button onClick={() => tamperEvent(e.id)} style={{ padding: "2px 7px", fontSize: 10, borderRadius: 3, border: `1px solid ${C.redBd}`, background: C.redBg, color: C.red, cursor: "pointer", flexShrink: 0, fontFamily: C.mono, fontWeight: 700 }}>
                        TAMPER
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Col 3: Pending Log Queue ── */}
            <div style={{ width: 295, flexShrink: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 13px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Pending Log Queue</span>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>
                  {pendingQueue.filter(q => q.status === "pending").length}P / {pendingQueue.filter(q => q.status === "confirmed").length}C
                </span>
              </div>
              <div style={{ height: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
                {pendingQueue.slice(0, 60).map(item => {
                  const sc = item.status === "transmitted" ? C.cyan  : item.status === "confirmed" ? C.green  : C.amber;
                  const sb = item.status === "transmitted" ? C.cyanBg  : item.status === "confirmed" ? C.greenBg  : C.amberBg;
                  const sd = item.status === "transmitted" ? C.cyanBd  : item.status === "confirmed" ? C.greenBd  : C.amberBd;
                  const sl = item.status === "transmitted" ? "TRANSMITTED" : item.status === "confirmed" ? "CONFIRMED" : "PENDING";
                  return (
                    <div key={item.id} style={{ background: C.surf2, border: `1px solid ${item.status === "transmitted" ? C.cyanBd : C.border}`, borderRadius: 4, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, color: sc, background: sb, border: `1px solid ${sd}`, padding: "2px 7px", borderRadius: 2, letterSpacing: "0.06em" }}>
                          {sl}
                        </span>
                        <button onClick={() => toggleJson(item.id)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 10, padding: "0 2px" }}>
                          {expandedJson.has(item.id) ? "▲" : "▼"} JSON
                        </button>
                      </div>

                      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.blue, fontWeight: 700 }}>{item.logEntry.endpoint}</div>
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>{item.logEntry.eventType}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginTop: 1 }}>{item.logEntry.file}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>{fmtTime(item.logEntry.timestamp)}</span>
                        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>{item.logEntry.base}</span>
                      </div>
                      {item.logEntry.payloadHash && (
                        <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.muted, marginTop: 4, wordBreak: "break-all", lineHeight: 1.5 }}>
                          {item.logEntry.payloadHash}
                        </div>
                      )}

                      {expandedJson.has(item.id) && (
                        <pre style={{ fontFamily: C.mono, fontSize: 7.5, color: C.dim, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: "6px 8px", marginTop: 6, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>
                          {JSON.stringify(item.logEntry, null, 2)}
                        </pre>
                      )}

                      {item.status === "confirmed" && (
                        <button onClick={() => transmitLog(item)} style={{ width: "100%", marginTop: 7, padding: "5px 0", fontSize: 11, borderRadius: 3, border: `1px solid ${C.cyanBd}`, background: C.cyanBg, color: C.cyan, cursor: "pointer", fontFamily: C.mono, fontWeight: 700, letterSpacing: "0.05em" }}>
                          → TRANSMIT TO CYBER CMD
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Col 4: Tampered Events ── */}
            <div style={{ width: 210, flexShrink: 0, background: C.surf, border: `1px solid ${tamperedEvents.length ? C.redBd : C.border}`, borderRadius: 6, padding: "12px 13px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: tamperedEvents.length ? C.red : C.dim, textTransform: "uppercase", borderBottom: `1px solid ${tamperedEvents.length ? C.redBd : C.border}`, paddingBottom: 7, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Tampered</span>
                {tamperedEvents.length > 0 && (
                  <span style={{ background: C.redBg, border: `1px solid ${C.redBd}`, color: C.red, fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 3, fontFamily: C.mono }}>
                    {tamperedEvents.length}
                  </span>
                )}
              </div>
              {tamperedEvents.length === 0 ? (
                <div style={{ textAlign: "center", color: C.dim, fontSize: 12, padding: "50px 0" }}>
                  <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.4 }}>✓</div>
                  No integrity violations
                </div>
              ) : (
                <div style={{ height: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {tamperedEvents.map(e => (
                    <div key={e.id} style={{ background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 4, padding: "9px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.red, fontWeight: 700 }}>{e.endpoint}</span>
                        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.dim }}>{fmtTime(e.timestamp)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.red, marginBottom: 2 }}>{e.label}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginBottom: 7 }}>{e.file}</div>
                      <button onClick={() => restoreEvent(e.id)} style={{ width: "100%", padding: "5px 0", fontSize: 11, borderRadius: 3, border: `1px solid ${C.greenBd}`, background: C.greenBg, color: C.green, cursor: "pointer", fontWeight: 700, fontFamily: C.mono }}>
                        ↩ RESTORE INTEGRITY
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* ── Tier 1 Endpoint Nodes ── */}
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
              <span>Tier 1 — Endpoint Nodes</span>
              <span style={{ fontFamily: C.mono, color: C.muted }}>{Object.keys(endpointRoots).length} / {ENDPOINTS.length} active</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 9 }}>
              {ENDPOINTS.map(ep => {
                const isTampered = tamperedEps.has(ep);
                const root = endpointRoots[ep];
                const epEvents = events.filter(e => e.endpoint === ep);
                const last = epEvents[0];
                return (
                  <div key={ep} style={{ background: isTampered ? C.redBg : C.surf2, border: `1px solid ${isTampered ? C.redBd : C.border}`, borderRadius: 4, padding: "9px 11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: isTampered ? C.red : C.blue }}>{ep}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 2, fontFamily: C.mono, background: isTampered ? C.redBd : C.greenBg, color: isTampered ? C.red : C.green, border: `1px solid ${isTampered ? C.red : C.greenBd}` }}>
                        {isTampered ? "TAMPERED" : root ? "CLEAN" : "IDLE"}
                      </span>
                    </div>
                    {last && <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>{last.icon} {last.label} · <span style={{ fontFamily: C.mono }}>{fmtTime(last.timestamp)}</span></div>}
                    <div style={{ fontFamily: C.mono, fontSize: 7.5, color: isTampered ? C.redBd : C.muted, wordBreak: "break-all", lineHeight: 1.5 }}>{root || "no data"}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{epEvents.length} events</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Blockchain Anchor ── */}
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 7, marginBottom: 12 }}>
              Blockchain Anchor — Bitcoin Testnet
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>Current Global Root (OP_RETURN payload)</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, wordBreak: "break-all", padding: "10px 12px", background: C.surf2, borderRadius: 4, border: `1px solid ${C.border}`, color: hasTamper ? C.red : C.green, lineHeight: 1.7 }}>
                  {globalRoot || "Waiting for events…"}
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>
                  {events.length} events · {Object.keys(endpointRoots).length} endpoints · {Object.keys(baseRoots).length} bases · {Object.keys(regionRoots).length} regions
                  {lastAnchorTime && <span> · last anchored {fmtTime(lastAnchorTime)}</span>}
                </div>
              </div>

              <div style={{ minWidth: 240 }}>
                <button onClick={handleAnchor} disabled={!globalRoot || anchorLoading} style={{ width: "100%", padding: "9px 0", borderRadius: 4, border: `1px solid ${C.blueBd}`, background: C.blueBg, color: globalRoot && !anchorLoading ? C.blue : C.dim, cursor: globalRoot && !anchorLoading ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, fontFamily: C.mono, letterSpacing: "0.05em", marginBottom: 6 }}>
                  {anchorLoading ? "BROADCASTING…" : "⚓  ANCHOR TO TESTNET"}
                </button>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>Auto-anchors every 30 s · Production: 5 min</div>

                {broadcastStatus && (
                  <div style={{ background: broadcastStatus.status === "confirmed" ? C.greenBg : C.redBg, border: `1px solid ${broadcastStatus.status === "confirmed" ? C.greenBd : C.redBd}`, borderRadius: 4, padding: "8px 10px", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: broadcastStatus.status === "confirmed" ? C.green : C.red, marginBottom: 4 }}>
                      {broadcastStatus.status === "confirmed" ? "✅  CONFIRMED" : "❌  FAILED"}
                    </div>
                    {broadcastStatus.msg && <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{broadcastStatus.msg}</div>}
                    {broadcastStatus.txid && (
                      <>
                        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.blue, wordBreak: "break-all", marginBottom: 5, lineHeight: 1.6 }}>{broadcastStatus.txid}</div>
                        <a href={broadcastStatus.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.blue }}>View on Blockstream ↗</a>
                      </>
                    )}
                  </div>
                )}

                {anchorHistory.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase" }}>Anchor History</div>
                    {anchorHistory.slice(0, 5).map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, padding: "5px 8px", background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 3, marginBottom: 3 }}>
                        <span style={{ flexShrink: 0 }}>{a.status === "confirmed" ? "✅" : a.status === "pending" ? "⏳" : "❌"}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim }}>{fmtTime(a.ts)} · {a.events} events</div>
                          <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.muted, wordBreak: "break-all", lineHeight: 1.5 }}>{a.root}</div>
                          {a.txid && <a href={`https://blockstream.info/testnet/tx/${a.txid}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: C.blue }}>{a.txid}</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Footer stats ── */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              ["Events Hashed",  events.length,                           false],
              ["Endpoints",      Object.keys(endpointRoots).length,       false],
              ["Installations",  Object.keys(baseRoots).length,           false],
              ["Regions",        Object.keys(regionRoots).length,         false],
              ["Anchors",        anchorHistory.length,                    false],
              ["Tampered",       tamperedEvents.length,                   tamperedEvents.length > 0],
              ["Transmitted",    transmittedLogs.length,                  false],
              ["Chain Cost",     "32 B / 5 MIN",                         false],
            ].map(([label, val, alert]) => (
              <div key={label} style={{ flex: 1, minWidth: 80, background: C.surf, border: `1px solid ${alert ? C.redBd : C.border}`, borderRadius: 4, padding: "9px 12px" }}>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, fontFamily: C.mono, color: alert ? C.red : C.text }}>{val}</div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          CYBER COMMAND PANEL
      ════════════════════════════════════════════════════════════ */}
      {panel === "cybercommand" && (
        <div style={{ padding: "14px 20px" }}>

          {/* Panel header */}
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.cyan }}>
                ◈ Cyber Command — Situational Awareness
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                Blockchain-confirmed · Hash Force–transmitted logs only · {transmittedLogs.length} entries received
              </div>
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, padding: "4px 10px", borderRadius: 3 }}>READ ONLY</span>
          </div>

          {transmittedLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: C.dim }}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.25 }}>◈</div>
              <div style={{ fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>No logs received</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.8 }}>
                Switch to Hash Force → wait for events to be anchored on-chain<br />
                → click <strong style={{ color: C.cyan }}>TRANSMIT TO CYBER CMD</strong> on any confirmed entry
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {REGIONS.map(reg => {
                const regLogs = transmittedLogs.filter(l => l.region === reg);
                if (!regLogs.length) return null;
                const violations = regLogs.filter(l => l.tampered).length;
                return (
                  <div key={reg} style={{ background: C.surf, border: `1px solid ${violations ? C.redBd : C.border}`, borderRadius: 6, overflow: "hidden" }}>

                    {/* Region row */}
                    <div style={{ padding: "10px 16px", background: C.surf2, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: C.cyan, textTransform: "uppercase" }}>◈ {reg}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{regLogs.length} logs</span>
                      {violations > 0 && (
                        <span style={{ marginLeft: "auto", fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: C.red, background: C.redBg, border: `1px solid ${C.redBd}`, padding: "2px 9px", borderRadius: 2 }}>
                          ⚠ {violations} INTEGRITY VIOLATION{violations !== 1 ? "S" : ""}
                        </span>
                      )}
                    </div>

                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {BASES.filter(b => BASE_REGION[b] === reg).map(base => {
                        const baseLogs = regLogs.filter(l => l.base === base);
                        if (!baseLogs.length) return null;
                        return (
                          <div key={base} style={{ border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>

                            {/* Base row */}
                            <div style={{ padding: "7px 13px", background: C.surf3, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.blue }}>▸ {base}</span>
                              <span style={{ fontSize: 10, color: C.dim }}>{baseLogs.length} logs</span>
                            </div>

                            <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                              {ENDPOINTS.filter(ep => ENDPOINT_BASE[ep] === base).map(ep => {
                                const epLogs = baseLogs.filter(l => l.endpoint === ep);
                                if (!epLogs.length) return null;
                                return (
                                  <div key={ep}>
                                    {/* Endpoint row */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
                                      <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: C.blue }}>→ {ep}</span>
                                      <span style={{ fontSize: 10, color: C.dim }}>{epLogs.length} entries</span>
                                    </div>

                                    {/* Log entries */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 14 }}>
                                      {epLogs.map(log => (
                                        <div key={log.id} style={{ background: log.tampered ? C.redBg : C.greenBg, border: `1px solid ${log.tampered ? C.redBd : C.greenBd}`, borderRadius: 3, padding: "8px 11px" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
                                            {log.tampered && (
                                              <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: C.red, background: C.redBd, padding: "2px 7px", borderRadius: 2, letterSpacing: "0.04em" }}>
                                                ⚠ INTEGRITY VIOLATION
                                              </span>
                                            )}
                                            <span style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, color: log.tampered ? C.red : C.green, background: log.tampered ? C.redBg : C.greenBg, border: `1px solid ${log.tampered ? C.redBd : C.greenBd}`, padding: "1px 6px", borderRadius: 2 }}>
                                              {log.anchorStatus.toUpperCase()}
                                            </span>
                                            {log.txid && (
                                              <a href={`https://blockstream.info/testnet/tx/${log.txid}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: C.mono, fontSize: 9, color: C.blue }}>
                                                ⛓ {log.txid.slice(0, 16)}…
                                              </a>
                                            )}
                                          </div>

                                          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 5 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: log.tampered ? C.red : C.text }}>{log.eventType}</span>
                                            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{log.file}</span>
                                            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{log.user}</span>
                                            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{fmtTime(log.timestamp)}</span>
                                          </div>

                                          <div style={{ fontFamily: C.mono, fontSize: 8, color: log.tampered ? C.red : C.greenBd, wordBreak: "break-all", lineHeight: 1.6 }}>
                                            hash: {log.payloadHash || "—"}
                                          </div>
                                          {log.merkleRoot && (
                                            <div style={{ fontFamily: C.mono, fontSize: 8, color: C.muted, wordBreak: "break-all", lineHeight: 1.6, marginTop: 2 }}>
                                              root: {log.merkleRoot}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cyber Command footer stats */}
          {transmittedLogs.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {[
                ["Total Received",   transmittedLogs.length,                          false],
                ["Clean",            transmittedLogs.filter(l => !l.tampered).length, false],
                ["Violations",       transmittedLogs.filter(l => l.tampered).length,  transmittedLogs.some(l => l.tampered)],
                ["Regions Active",   new Set(transmittedLogs.map(l => l.region)).size,false],
                ["Bases Active",     new Set(transmittedLogs.map(l => l.base)).size,  false],
                ["Endpoints Active", new Set(transmittedLogs.map(l => l.endpoint)).size, false],
                ["On-Chain",         transmittedLogs.filter(l => l.txid).length,      false],
              ].map(([label, val, alert]) => (
                <div key={label} style={{ flex: 1, minWidth: 90, background: C.surf, border: `1px solid ${alert ? C.redBd : C.border}`, borderRadius: 4, padding: "9px 12px" }}>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, fontFamily: C.mono, color: alert ? C.red : C.text }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
