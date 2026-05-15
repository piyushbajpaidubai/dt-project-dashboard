import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "dt-project-dashboard-v1";

async function loadData() {
  try {
    const res = await fetch("/.netlify/functions/sheets");
    if (!res.ok) return null;
    const data = await res.json();
    if (Object.keys(data).length === 0) return null;
    const parsed = {};
    for (const [k, v] of Object.entries(data)) {
      try { parsed[k] = JSON.parse(v); } catch { parsed[k] = v; }
    }
    return parsed;
  } catch { return null; }
}

async function saveData(data) {
  try {
    await fetch("/.netlify/functions/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {}
}

// Returns the Monday-18:00 key for any given date (or current week if no date)
function getMondaySnapshotKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diffToMon);
  d.setHours(18, 0, 0, 0);
  return d.toISOString().slice(0, 13);
}
function keyToDate(key) {
  return new Date(key + ':00:00');
}
function getNextMondayKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMon = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diffToMon);
  d.setHours(18, 0, 0, 0);
  return d.toISOString().slice(0, 13);
}

// Generate all Monday dates (18:00) from Mar 16 2026 through 4 weeks past current week
function generateWeekLabels() {
  const start = new Date(2026, 2, 16, 18, 0, 0);
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const currentMon = new Date(now);
  currentMon.setDate(now.getDate() + diffToMon);
  currentMon.setHours(18, 0, 0, 0);
  const endDate = new Date(currentMon);
  endDate.setDate(endDate.getDate() + 28);
  const weeks = [];
  let cur = new Date(start);
  while (cur <= endDate) {
    weeks.push(new Date(cur));
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

const MON_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatWeekLabel(date) {
  return MON_LABELS[date.getMonth()] + " " + date.getDate();
}

const defaultState = {
  projectCode: "", projectName: "", client: "",
  reportDate: new Date().toISOString().slice(0, 10),
  keyPersonnel: "", teamThisWeek: "", subconsultantRows: [{ name: "", contractStatus: "" }],
  contractStatus: "", contractValue: "",
  budgetStatus: "", internalBudget: "", externalBudget: "", availableBudget: "",
  actualSpent: "", invoiceIssued: "", externalSpent: "",
  projectStatus: "", progressPct: "", targetInvoice: "", invoiceDueDate: "",
  budgetHistory: {},
  paymentRows: [{ milestone: "", clientStatus: "", subsStatus: "" }, { milestone: "", clientStatus: "", subsStatus: "" }],
  programRows: [
    { stage: "", baseline: "", baselineStart: "", baselineEnd: "", actual: "", actualStart: "", actualEnd: "" },
    { stage: "", baseline: "", baselineStart: "", baselineEnd: "", actual: "", actualStart: "", actualEnd: "" },
    { stage: "", baseline: "", baselineStart: "", baselineEnd: "", actual: "", actualStart: "", actualEnd: "" },
  ],
  potentialVariations: "",
  criticalIssues: [{ issue: "", status: "" }, { issue: "", status: "" }, { issue: "", status: "" }],
  currentActions: [
    { action: "", owner: "", status: "" },
    { action: "", owner: "", status: "" },
    { action: "", owner: "", status: "" },
  ],
};

function Field({ label, value, onChange, type = "text", placeholder = "", mono = false, numeric = false }) {
  const base = { fontFamily: mono ? "monospace" : "inherit", fontSize: 13, color: "#0f172a", background: "transparent", border: "none", borderBottom: "1.5px solid #e2e8f0", outline: "none", width: "100%", padding: "4px 0", resize: "none", lineHeight: 1.6 };
  const [focused, setFocused] = useState(false);
  if (type === "textarea") return (<div style={{ marginBottom: 14 }}>{label && <div style={styles.fieldLabel}>{label}</div>}<textarea rows={3} value={numeric && !focused ? fmtComma(value) : value} onChange={e => onChange(numeric ? e.target.value.replace(/,/g, "") : e.target.value)} placeholder={placeholder} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ ...base, borderBottom: `1.5px solid ${focused ? "#0ea5e9" : "#e2e8f0"}`, paddingTop: 6 }} /></div>);
  return (<div style={{ marginBottom: 14 }}>{label && <div style={styles.fieldLabel}>{label}</div>}<input type={type} value={numeric && !focused ? fmtComma(value) : value} onChange={e => onChange(numeric ? e.target.value.replace(/,/g, "") : e.target.value)} placeholder={placeholder} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ ...base, borderBottom: `1.5px solid ${focused ? "#0ea5e9" : "#e2e8f0"}` }} /></div>);
}



// Formats a raw numeric string with commas for display
function formatCommas(raw) {
  const stripped = (raw || "").replace(/[^0-9.]/g, "");
  if (!stripped) return "";
  const [intPart, decPart] = stripped.split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? formatted + "." + decPart : formatted;
}

// Currency input: stores raw digits in state, displays comma-formatted when blurred
function CurrencyField({ label, value, onChange, placeholder = "AED" }) {
  const [focused, setFocused] = useState(false);
  const [localVal, setLocalVal] = useState(value || "");

  // Keep localVal in sync when not focused (e.g. external state changes)
  useEffect(() => {
    if (!focused) setLocalVal(value || "");
  }, [value, focused]);

  const base = {
    fontFamily: "inherit",
    fontSize: 13,
    color: "#0f172a",
    background: "transparent",
    border: "none",
    borderBottom: `1.5px solid ${focused ? "#0ea5e9" : "#e2e8f0"}`,
    outline: "none",
    width: "100%",
    padding: "4px 0",
    lineHeight: 1.6,
  };

  const displayVal = focused ? localVal : formatCommas(localVal);

  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={styles.fieldLabel}>{label}</div>}
      <input
        type="text"
        inputMode="numeric"
        value={displayVal}
        placeholder={placeholder}
        onFocus={() => {
          setFocused(true);
          setLocalVal(value || "");
        }}
        onChange={e => {
          // Only allow digits and a single dot
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          setLocalVal(raw);
          onChange(raw);
        }}
        onBlur={() => {
          setFocused(false);
          setLocalVal(value || "");
        }}
        style={base}
      />
    </div>
  );
}

function StatusBadge({ value, onChange }) {
  const options = ["Signed", "Pending", "LOA Issued", "Awaited"];
  const colors = { Signed: { bg: "#dcfce7", fg: "#166534" }, Pending: { bg: "#fef9c3", fg: "#854d0e" }, "LOA Issued": { bg: "#dbeafe", fg: "#1e40af" }, Awaited: { bg: "#fee2e2", fg: "#991b1b" }, "": { bg: "#f1f5f9", fg: "#64748b" } };
  const c = colors[value] || colors[""];
  return (<div style={{ position: "relative", display: "inline-block" }}><select value={value} onChange={e => onChange(e.target.value)} style={{ appearance: "none", background: c.bg, color: c.fg, border: "none", borderRadius: 4, padding: "3px 24px 3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}><option value="">Select</option>{options.map(o => <option key={o}>{o}</option>)}</select><span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: c.fg }}>v</span></div>);
}

function BudgetStatusBadge({ value, onChange }) {
  const opts = ["Approved", "Pending"];
  const c = value === "Approved" ? { bg: "#dcfce7", fg: "#166534" } : { bg: "#fef9c3", fg: "#854d0e" };
  return (<div style={{ position: "relative", display: "inline-block" }}><select value={value} onChange={e => onChange(e.target.value)} style={{ appearance: "none", background: c.bg, color: c.fg, border: "none", borderRadius: 4, padding: "3px 24px 3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}><option value="">Select</option>{opts.map(o => <option key={o}>{o}</option>)}</select><span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: c.fg }}>v</span></div>);
}

function RiskStatusBar({ value, onChange }) {
  const opts = [
    { value: "monitor", label: "Monitor", bg: "#f97316", fg: "#ffffff" },
    { value: "high_risk", label: "High Risk", bg: "#ef4444", fg: "#ffffff" },
    { value: "action", label: "Action", bg: "#7f1d1d", fg: "#ffffff" },
    { value: "closed", label: "Closed", bg: "#9ca3af", fg: "#ffffff" },
  ];
  const selected = opts.find(o => o.value === value);
  const bg = selected ? selected.bg : "#f1f5f9";
  const fg = selected ? selected.fg : "#64748b";
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ appearance: "none", background: bg, color: fg, border: "none", borderRadius: 4, padding: "3px 24px 3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", minWidth: 90 }}>
        <option value="">Select</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: fg }}>v</span>
    </div>
  );
}

function ActionStatusBar({ value, onChange }) {
  const opts = [
    { value: "done", label: "Done", bg: "#22c55e", fg: "#ffffff" },
    { value: "pending", label: "Pending", bg: "#f97316", fg: "#ffffff" },
    { value: "on_going", label: "On Going", bg: "#0ea5e9", fg: "#ffffff" },
    { value: "delayed", label: "Delayed", bg: "#ef4444", fg: "#ffffff" },
    { value: "hold", label: "Hold", bg: "#3b82f6", fg: "#ffffff" },
  ];
  const sel = opts.find(o => o.value === value);
  const bg = sel ? sel.bg : "#e2e8f0";
  const fg = sel ? sel.fg : "#64748b";
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ appearance: "none", background: bg, color: fg, border: "none", borderRadius: 4, padding: "3px 24px 3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", minWidth: 90 }}>
        <option value="">Select</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: fg }}>v</span>
    </div>
  );
}

function SubContractStatusBar({ value, onChange }) {
  const opts = [
    { value: "signed", label: "Signed", bg: "#22c55e", fg: "#ffffff" },
    { value: "pending", label: "Pending", bg: "#f97316", fg: "#ffffff" },
    { value: "in_process", label: "In-Process", bg: "#0ea5e9", fg: "#ffffff" },
  ];
  const sel = opts.find(o => o.value === value);
  const bg = sel ? sel.bg : "#e2e8f0";
  const fg = sel ? sel.fg : "#64748b";
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ appearance: "none", background: bg, color: fg, border: "none", borderRadius: 4, padding: "3px 24px 3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", minWidth: 100 }}>
        <option value="">Select</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: fg }}>v</span>
    </div>
  );
}

function ProgressBar({ value, onChange }) {
  const pct = Math.min(100, Math.max(0, parseInt(value) || 0));
  const color = pct < 30 ? "#f87171" : pct < 70 ? "#fbbf24" : "#34d399";
  return (<div style={{ marginBottom: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}><div style={{...styles.fieldLabel, color: "#000000"}}>Overall Progress</div><input type="number" min={0} max={100} value={value} onChange={e => onChange(e.target.value)} style={{ width: 52, fontSize: 13, border: "none", borderBottom: "1.5px solid #e2e8f0", outline: "none", background: "transparent", textAlign: "right", fontWeight: 700, color: "#000000" }} /><span style={{ fontSize: 12, color: "#64748b" }}>%</span></div><div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s ease" }} /></div></div>);
}

function PageBreak() { return <div style={{ margin: "32px 0", borderTop: "1.5px dotted #000000" }} />; }

function SectionHead({ title, index }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {String(index + 1).padStart(2, "0")} . {title}
        </div>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      </div>
    </div>
  );
}

function TwoCol({ children }) {
  return (<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>{children}</div>);
}

function ActionTable({ rows, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={styles.th}>#</th><th style={{ ...styles.th, width: "60%", textAlign: "left" }}>Action</th><th style={styles.th}>Owner</th><th style={styles.th}>Status</th><th style={{ ...styles.th, width: 32 }}></th></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.tdNum}>{String(i + 1).padStart(2, "0")}</td>
              <td style={styles.td}><textarea ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} value={row.action} onChange={e => { onChange(i, "action", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} onInput={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} placeholder="Enter action item..." style={{ ...styles.inlineInput, resize: "none", minHeight: 32, height: "auto", overflow: "hidden", lineHeight: "1.4", padding: "4px 6px", boxSizing: "border-box", display: "block", width: "100%", fontFamily: "inherit" }} rows={1} /></td>
              <td style={styles.td}><input value={row.owner} onChange={e => onChange(i, "owner", e.target.value)} placeholder="Name" style={{ ...styles.inlineInput, textAlign: "center" }} /></td>
              <td style={styles.td}><ActionStatusBar value={row.status || ""} onChange={v => onChange(i, "status", v)} /></td>
              <td style={styles.td}><button onClick={() => { const next = rows.filter((_, j) => j !== i); onChange("_replace", null, next); }} style={styles.delBtn}>X</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange("_add", null, null)} style={styles.addBtn}>+ Add row</button>
    </div>
  );
}

function SubconsultantsTable({ rows, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={styles.th}>#</th>
            <th style={{ ...styles.th, width: "60%", textAlign: "left" }}>Sub-Consultant</th>
            <th style={{ ...styles.th, textAlign: "center", width: "22%" }}>Sub-Contract Status</th>
            <th style={{ ...styles.th, width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.tdNum}>{String(i + 1).padStart(2, "0")}</td>
              <td style={styles.td}><input value={row.name} onChange={e => onChange(i, "name", e.target.value)} placeholder="Enter sub-consultant name..." style={{ ...styles.inlineInput, width: "100%" }} /></td>
              <td style={{ ...styles.td, textAlign: "center" }}><SubContractStatusBar value={row.contractStatus || ""} onChange={v => onChange(i, "contractStatus", v)} /></td>
              <td style={styles.td}><button onClick={() => { const next = rows.filter((_, j) => j !== i); onChange("_replace", null, next); }} style={styles.delBtn}>X</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange("_add", null, null)} style={styles.addBtn}>+ Add row</button>
    </div>
  );
}

function ProgramTable({ rows, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...styles.th, textAlign: "left", width: "22%" }}>Stage</th>
            <th style={{ ...styles.th, textAlign: "left", width: "13%" }}>Baseline Duration</th>
            <th style={{ ...styles.th, textAlign: "center", width: "11%" }}>Baseline Start</th>
            <th style={{ ...styles.th, textAlign: "center", width: "11%" }}>Baseline End</th>
            <th style={{ ...styles.th, textAlign: "left", width: "13%" }}>Actual Duration</th>
            <th style={{ ...styles.th, textAlign: "center", width: "11%" }}>Actual Start</th>
            <th style={{ ...styles.th, textAlign: "center", width: "11%" }}>Actual End</th>
            <th style={{ ...styles.th, width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.td}><input value={row.stage} onChange={e => onChange(i, "stage", e.target.value)} placeholder="Stage name" style={styles.inlineInput} /></td>
              <td style={styles.td}>{(() => { if (row.baselineStart && row.baselineEnd) { const s = new Date(row.baselineStart), e = new Date(row.baselineEnd); const days = Math.round((e - s) / 86400000); if (days < 0) return <span style={{ color: "#ef4444", fontSize: 12 }}>Invalid</span>; const w = Math.floor(days / 7), d = days % 7; const label = w > 0 && d > 0 ? w + "w " + d + "d" : w > 0 ? w + " week" + (w !== 1 ? "s" : "") : d + " day" + (d !== 1 ? "s" : ""); return <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{label}</span>; } return <input value={row.baseline} onChange={e => onChange(i, "baseline", e.target.value)} placeholder="e.g. 8 weeks" style={styles.inlineInput} />; })()}</td>
              <td style={styles.td}><input type="date" value={row.baselineStart} onChange={e => onChange(i, "baselineStart", e.target.value)} style={{ ...styles.inlineInput, textAlign: "center", cursor: "pointer", colorScheme: "light", minWidth: 36 }} /></td>
              <td style={styles.td}><input type="date" value={row.baselineEnd} onChange={e => onChange(i, "baselineEnd", e.target.value)} style={{ ...styles.inlineInput, textAlign: "center", cursor: "pointer", colorScheme: "light", minWidth: 36 }} /></td>
              <td style={styles.td}>{(() => { if (row.actualStart && row.actualEnd) { const s = new Date(row.actualStart), e = new Date(row.actualEnd); const days = Math.round((e - s) / 86400000); if (days < 0) return <span style={{ color: "#ef4444", fontSize: 12 }}>Invalid</span>; const w = Math.floor(days / 7), d = days % 7; const label = w > 0 && d > 0 ? w + "w " + d + "d" : w > 0 ? w + " week" + (w !== 1 ? "s" : "") : d + " day" + (d !== 1 ? "s" : ""); return <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{label}</span>; } return <input value={row.actual} onChange={e => onChange(i, "actual", e.target.value)} placeholder="e.g. 10 weeks" style={styles.inlineInput} />; })()}</td>
              <td style={styles.td}><input type="date" value={row.actualStart} onChange={e => onChange(i, "actualStart", e.target.value)} style={{ ...styles.inlineInput, textAlign: "center", cursor: "pointer", colorScheme: "light", minWidth: 36 }} /></td>
              <td style={styles.td}><input type="date" value={row.actualEnd} onChange={e => onChange(i, "actualEnd", e.target.value)} style={{ ...styles.inlineInput, textAlign: "center", cursor: "pointer", colorScheme: "light", minWidth: 36 }} /></td>
              <td style={styles.td}><button onClick={() => { const next = rows.filter((_, j) => j !== i); onChange("_replace", null, next); }} style={styles.delBtn}>X</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange("_add", null, null)} style={styles.addBtn}>+ Add stage</button>
    </div>
  );
}

function CombinedPaymentTable({ rows, onChange }) {
  const statusOptions = ["Paid", "In Progress", "Overdue", "Partial"];
  const statusColors = { Paid: { bg: "#dcfce7", fg: "#166534" }, "In Progress": { bg: "#fef9c3", fg: "#854d0e" }, Overdue: { bg: "#fee2e2", fg: "#991b1b" }, Partial: { bg: "#dbeafe", fg: "#1e40af" }, "": { bg: "#f1f5f9", fg: "#64748b" } };
  function StatusSelect({ value, onChange }) {
    const c = statusColors[value] || statusColors[""];
    return (<div style={{ position: "relative", display: "inline-block" }}><select value={value} onChange={e => onChange(e.target.value)} style={{ appearance: "none", background: c.bg, color: c.fg, border: "none", borderRadius: 4, padding: "3px 24px 3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", width: "100%" }}><option value="">Select</option>{statusOptions.map(o => <option key={o}>{o}</option>)}</select><span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: c.fg }}>v</span></div>);
  }
  return (<div style={{ marginBottom: 8 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={{ ...styles.th, textAlign: "left", width: "50%" }}>Invoice Milestone</th><th style={{ ...styles.th, textAlign: "center", width: "22%" }}>Client Status</th><th style={{ ...styles.th, textAlign: "center", width: "22%" }}>Sub-Consultant Status</th><th style={{ ...styles.th, width: 32 }}></th></tr></thead><tbody>{rows.map((row, i) => (<tr key={i}><td style={styles.td}><input value={row.milestone} onChange={e => onChange(i, "milestone", e.target.value)} placeholder="e.g. Invoice 01 - Concept Design" style={styles.inlineInput} /></td><td style={{ ...styles.td, textAlign: "center" }}><StatusSelect value={row.clientStatus || ""} onChange={v => onChange(i, "clientStatus", v)} /></td><td style={{ ...styles.td, textAlign: "center" }}><StatusSelect value={row.subsStatus || ""} onChange={v => onChange(i, "subsStatus", v)} /></td><td style={styles.td}><button onClick={() => { const next = rows.filter((_, j) => j !== i); onChange("_replace", null, next); }} style={styles.delBtn}>X</button></td></tr>))}</tbody></table><button onClick={() => onChange("_add", null, null)} style={styles.addBtn}>+ Add row</button></div>);
}

function fmtComma(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  if (isNaN(n)) return String(val);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function CashVarianceIndicator({ invoiceIssued, actualSpent, externalSpent }) {
  const parse = v => parseFloat((v || "").replace(/[^0-9.-]/g, "")) || 0;
  const variance = parse(invoiceIssued) - parse(actualSpent) - parse(externalSpent);
  const isPos = variance >= 0;
  const isEmpty = !invoiceIssued && !actualSpent && !externalSpent;
  const formatted = isEmpty ? " - " : (isPos ? "+" : "") + variance.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (<div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isEmpty ? "#f1f5f9" : isPos ? "#dcfce7" : "#fee2e2", color: isEmpty ? "#64748b" : isPos ? "#166534" : "#991b1b", borderRadius: 4, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>{!isEmpty && <span style={{ fontSize: 11 }}>{isPos ? "^" : "v"}</span>}Cash Variance: {formatted}</div>);
}

function BalanceIndicator({ available, spent }) {
  const av = parseFloat(available.replace(/[^0-9.-]/g, "")) || 0;
  const sp = parseFloat(spent.replace(/[^0-9.-]/g, "")) || 0;
  const balance = av - sp;
  const isPos = balance >= 0;
  const formatted = balance === 0 ? " - " : (isPos ? "+" : "") + balance.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (<div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: balance === 0 ? "#f1f5f9" : isPos ? "#dcfce7" : "#fee2e2", color: balance === 0 ? "#64748b" : isPos ? "#166534" : "#991b1b", borderRadius: 4, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>{balance !== 0 && <span style={{ fontSize: 11 }}>{isPos ? "^" : "v"}</span>}Balance: {formatted}</div>);
}

function CPIIndicator({ contractValue, progressPct, externalSpent, actualSpent }) {
  const parse = v => parseFloat((v || "").replace(/[^0-9.-]/g, "")) || 0;
  const earned = parse(contractValue) * (parse(progressPct) / 100);
  const totalSpent = parse(externalSpent) + parse(actualSpent);
  const isEmpty = !contractValue && !progressPct && !externalSpent && !actualSpent;
  const cpi = (!isEmpty && totalSpent !== 0) ? (earned / totalSpent) : null;
  const formatted = cpi === null ? " - " : cpi.toFixed(2);
  const isGood = cpi !== null && cpi >= 1;
  return (<div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: cpi === null ? "#f1f5f9" : isGood ? "#dcfce7" : "#fee2e2", color: cpi === null ? "#64748b" : isGood ? "#166534" : "#991b1b", borderRadius: 4, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>{cpi !== null && <span style={{ fontSize: 11 }}>{isGood ? "^" : "v"}</span>}CPI: {formatted}</div>);
}

function CriticalIssuesTable({ rows, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={styles.th}>#</th>
          <th style={{ ...styles.th, width: "75%", textAlign: "left" }}>Issue / Risk</th>
          <th style={styles.th}>Status</th>
          <th style={{ ...styles.th, width: 32 }}></th>
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.tdNum}>{String(i + 1).padStart(2, "0")}</td>
              <td style={styles.td}><input value={row.issue} onChange={e => onChange(i, "issue", e.target.value)} placeholder="Describe issue or risk..." style={styles.inlineInput} /></td>
              <td style={styles.td}><RiskStatusBar value={row.status || ""} onChange={v => onChange(i, "status", v)} /></td>
              <td style={styles.td}><button onClick={() => { const next = rows.filter((_, j) => j !== i); onChange("_replace", null, next); }} style={styles.delBtn}>X</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange("_add", null, null)} style={styles.addBtn}>+ Add row</button>
    </div>
  );
}

// --- BUDGET TREND CHART -------------------------------------------------------
function BudgetTrendChart({ budgetHistory, internalBudget, availableBudget, actualSpent, onManualUpdate }) {
  const W = 820, H = 320;
  const PAD = { top: 24, right: 24, bottom: 52, left: 88 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const [justUpdated, setJustUpdated] = useState(false);

  const parseVal = v => parseFloat((v || "").replace(/[^0-9.-]/g, "")) || 0;
  const availableBudgetVal = parseVal(availableBudget);
  const dataMax = Math.max(availableBudgetVal, parseVal(actualSpent));
  const yMax = Math.max(dataMax * 1.3, 10000);
  const yMin = 0;
  const yRange = yMax - yMin;

  const weeks = generateWeekLabels();

  const dataPoints = weeks.map(weekDate => {
    const key = getMondaySnapshotKey(weekDate);
    const snap = budgetHistory[key];
    return {
      date: weekDate,
      label: formatWeekLabel(weekDate),
      internal: snap ? snap.availableBudget : null,
      actual: snap ? snap.actualSpent : null,
    };
  });

  const xPos = i => PAD.left + (i / Math.max(weeks.length - 1, 1)) * chartW;
  const yPos = v => PAD.top + chartH - ((v - yMin) / yRange) * chartH;
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + (yRange / 5) * i);

  const fmtAED = v => {
    if (v >= 1000000) return (v / 1000000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
    if (v >= 1000) return (v / 1000).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "K";
    return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const buildPath = (pts, key) => {
    let d = "";
    let started = false;
    pts.forEach((pt, i) => {
      if (pt[key] === null) { started = false; return; }
      const x = xPos(i);
      const y = yPos(pt[key]);
      if (!started) { d += `M${x},${y}`; started = true; }
      else { d += ` L${x},${y}`; }
    });
    return d;
  };

  const hasInternalData = dataPoints.some(p => p.internal !== null);
  const hasActualData = dataPoints.some(p => p.actual !== null);

  const now = new Date();
  let todayIdx = -1;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i] <= now) { todayIdx = i; break; }
  }

  // Determine current week key and its snapshot values for the Update button label
  const currentKey = getNextMondayKey(now);
  const currentSnap = budgetHistory[currentKey];
  const currentWeekLabel = formatWeekLabel(keyToDate(currentKey));

  const handleUpdate = () => {
    onManualUpdate();
    setJustUpdated(true);
    setTimeout(() => setJustUpdated(false), 2500);
  };

  return (
    <div style={{ marginTop: 28, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>
          Budget Trend  -  Weekly Snapshot (Mondays 18:00)
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, background: "#22c55e", borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Available Budget to Date</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, background: "#ef4444", borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Actual Spent To-Date (from Moment)</span>
          </div>
        </div>
      </div>
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={yPos(tick)} x2={PAD.left + chartW} y2={yPos(tick)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PAD.left - 8} y={yPos(tick) + 4} textAnchor="end" style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui" }}>{fmtAED(tick)}</text>
            </g>
          ))}
          {weeks.map((w, i) => {
            if (i % Math.max(1, Math.floor(weeks.length / 8)) !== 0) return null;
            return (<text key={i} x={xPos(i)} y={PAD.top + chartH + 20} textAnchor="middle" style={{ fontSize: 9, fill: "#94a3b8", fontFamily: "system-ui" }}>{formatWeekLabel(w)}</text>);
          })}
          {weeks.map((w, i) => (
            <line key={i} x1={xPos(i)} y1={PAD.top + chartH} x2={xPos(i)} y2={PAD.top + chartH + 4} stroke="#e2e8f0" strokeWidth="1" />
          ))}
          {todayIdx >= 0 && (
            <g>
              <line x1={xPos(todayIdx)} y1={PAD.top} x2={xPos(todayIdx)} y2={PAD.top + chartH} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
              <text x={xPos(todayIdx) + 4} y={PAD.top + 12} style={{ fontSize: 9, fill: "#0ea5e9", fontFamily: "system-ui", fontWeight: 700 }}>Current Week</text>
            </g>
          )}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="#e2e8f0" strokeWidth="1.5" />
          <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH} stroke="#e2e8f0" strokeWidth="1.5" />
          <text x={16} y={PAD.top + chartH / 2} textAnchor="middle" transform={`rotate(-90, 16, ${PAD.top + chartH / 2})`} style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>AED</text>
          <text x={PAD.left + chartW / 2} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Weeks</text>
          {hasInternalData && (<path d={buildPath(dataPoints, "internal")} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
          {hasActualData && (<path d={buildPath(dataPoints, "actual")} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
          {dataPoints.map((pt, i) => pt.internal !== null && (
            <g key={`ib-${i}`}>
              <circle cx={xPos(i)} cy={yPos(pt.internal)} r={4} fill="#22c55e" stroke="#ffffff" strokeWidth="1.5" />
              <title>Internal Budget  -  {pt.label}: AED {pt.internal.toLocaleString()}</title>
            </g>
          ))}
          {dataPoints.map((pt, i) => pt.actual !== null && (
            <g key={`as-${i}`}>
              <circle cx={xPos(i)} cy={yPos(pt.actual)} r={4} fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
              <title>Actual Spent  -  {pt.label}: AED {pt.actual.toLocaleString()}</title>
            </g>
          ))}
          {!hasInternalData && !hasActualData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fontSize: 12, fill: "#cbd5e1", fontFamily: "system-ui" }}>
              Data captured every Monday at 18:00  -  click Update to record now
            </text>
          )}
        </svg>
      </div>

      {/* -- Update button row -- */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
        {justUpdated && (
          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13 }}>OK</span> Chart updated for week of {currentWeekLabel}
          </span>
        )}
        {currentSnap && !justUpdated && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            Week of {currentWeekLabel}: Available {parseVal(availableBudget).toLocaleString()} . Spent {parseVal(actualSpent).toLocaleString()}
          </span>
        )}
        <button
          onClick={handleUpdate}
          style={{
            background: "#0f172a",
            color: "#ffffff",
            border: "none",
            borderRadius: 4,
            padding: "6px 16px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 12 }}>Refresh</span> Update Chart
        </button>
      </div>
    </div>
  );
}

// --- CASH VARIANCE CHART -----------------------------------------------------
function CashVarianceChart({ budgetHistory, invoiceIssued, externalSpent, actualSpent, onManualUpdate }) {
  const W = 820, H = 320;
  const PAD = { top: 24, right: 24, bottom: 52, left: 88 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const [justUpdated, setJustUpdated] = useState(false);

  const parseVal = v => parseFloat((v || "").replace(/[^0-9.-]/g, "")) || 0;

  const weeks = generateWeekLabels();

  const dataPoints = weeks.map(weekDate => {
    const key = getMondaySnapshotKey(weekDate);
    const snap = budgetHistory[key];
    return {
      date: weekDate,
      label: formatWeekLabel(weekDate),
      inv:   snap != null ? snap.invoiceIssued                              : null,
      spent: snap != null ? (snap.actualSpent + snap.externalSpent)        : null,
    };
  });

  const allVals = dataPoints.flatMap(p => [p.inv, p.spent]).filter(v => v !== null);
  const dataMax = allVals.length ? Math.max(...allVals) : 0;
  const yMax = Math.max(dataMax * 1.3, 10000);
  const yMin = 0;
  const yRange = yMax - yMin;

  const xPos = i => PAD.left + (i / Math.max(weeks.length - 1, 1)) * chartW;
  const yPos = v => PAD.top + chartH - ((v - yMin) / yRange) * chartH;
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + (yRange / 5) * i);

  const fmtAED = v => {
    const a = Math.abs(v);
    if (a >= 1000000) return (v / 1000000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
    if (a >= 1000)    return (v / 1000).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "K";
    return Math.round(v).toLocaleString("en-US");
  };

  const buildLinePath = (pts, key) => {
    let d = "", started = false;
    pts.forEach((pt, i) => {
      if (pt[key] === null) { started = false; return; }
      const x = xPos(i), y = yPos(pt[key]);
      if (!started) { d += `M${x},${y}`; started = true; }
      else          { d += ` L${x},${y}`; }
    });
    return d;
  };

  const fillSegments = [];
  for (let i = 0; i < dataPoints.length - 1; i++) {
    const a = dataPoints[i], b = dataPoints[i + 1];
    if (a.inv === null || a.spent === null || b.inv === null || b.spent === null) continue;
    const dA = a.inv - a.spent, dB = b.inv - b.spent;
    if (dA * dB >= 0) {
      fillSegments.push({
        pts: `${xPos(i)},${yPos(a.inv)} ${xPos(i+1)},${yPos(b.inv)} ${xPos(i+1)},${yPos(b.spent)} ${xPos(i)},${yPos(a.spent)}`,
        color: dA >= 0 ? "#22c55e" : "#ef4444",
      });
    } else {
      const t = dA / (dA - dB);
      const xC = xPos(i) + t * (xPos(i + 1) - xPos(i));
      const yC = yPos(a.inv + t * (b.inv - a.inv));
      fillSegments.push({
        pts: `${xPos(i)},${yPos(a.inv)} ${xC},${yC} ${xPos(i)},${yPos(a.spent)}`,
        color: dA >= 0 ? "#22c55e" : "#ef4444",
      });
      fillSegments.push({
        pts: `${xC},${yC} ${xPos(i+1)},${yPos(b.inv)} ${xPos(i+1)},${yPos(b.spent)}`,
        color: dB >= 0 ? "#22c55e" : "#ef4444",
      });
    }
  }

  const now = new Date();
  let todayIdx = -1;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i] <= now) { todayIdx = i; break; }
  }

  const currentKey = getNextMondayKey(now);
  const currentSnap = budgetHistory[currentKey];
  const currentWeekLabel = formatWeekLabel(keyToDate(currentKey));
  const hasData = dataPoints.some(p => p.inv !== null);

  const handleUpdate = () => {
    onManualUpdate();
    setJustUpdated(true);
    setTimeout(() => setJustUpdated(false), 2500);
  };

  return (
    <div style={{ marginTop: 28, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>
          Cash Variance
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, background: "#22c55e", borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Cumulative Invoice Issued</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, background: "#ef4444", borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Actual + External Spent</span>
          </div>
        </div>
      </div>
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={yPos(tick)} x2={PAD.left + chartW} y2={yPos(tick)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PAD.left - 8} y={yPos(tick) + 4} textAnchor="end" style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui" }}>{fmtAED(tick)}</text>
            </g>
          ))}
          {weeks.map((w, i) => {
            if (i % Math.max(1, Math.floor(weeks.length / 8)) !== 0) return null;
            return (<text key={i} x={xPos(i)} y={PAD.top + chartH + 20} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui" }}>{formatWeekLabel(w)}</text>);
          })}
          {weeks.map((w, i) => (
            <line key={i} x1={xPos(i)} y1={PAD.top + chartH} x2={xPos(i)} y2={PAD.top + chartH + 4} stroke="#e2e8f0" strokeWidth="1" />
          ))}
          {todayIdx >= 0 && (
            <g>
              <line x1={xPos(todayIdx)} y1={PAD.top} x2={xPos(todayIdx)} y2={PAD.top + chartH} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
              <text x={xPos(todayIdx) + 4} y={PAD.top + 12} style={{ fontSize: 9, fill: "#0ea5e9", fontFamily: "system-ui", fontWeight: 700 }}>Current Week</text>
            </g>
          )}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="#e2e8f0" strokeWidth="1.5" />
          <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH} stroke="#e2e8f0" strokeWidth="1.5" />
          <text x={16} y={PAD.top + chartH / 2} textAnchor="middle" transform={`rotate(-90, 16, ${PAD.top + chartH / 2})`} style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>AED</text>
          <text x={PAD.left + chartW / 2} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Weeks</text>
          {fillSegments.map((seg, i) => (
            <polygon key={i} points={seg.pts} fill={seg.color} fillOpacity={0.25} />
          ))}
          {hasData && <path d={buildLinePath(dataPoints, "inv")}   fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {hasData && <path d={buildLinePath(dataPoints, "spent")} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {dataPoints.map((pt, i) => pt.inv !== null && (
            <g key={`iv-${i}`}>
              <circle cx={xPos(i)} cy={yPos(pt.inv)} r={4} fill="#22c55e" stroke="#ffffff" strokeWidth="1.5" />
              <title>Invoice Issued  -  {pt.label}: AED {pt.inv.toLocaleString()}</title>
            </g>
          ))}
          {dataPoints.map((pt, i) => pt.spent !== null && (
            <g key={`sp-${i}`}>
              <circle cx={xPos(i)} cy={yPos(pt.spent)} r={4} fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
              <title>Actual + External  -  {pt.label}: AED {pt.spent.toLocaleString()}</title>
            </g>
          ))}
          {!hasData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fontSize: 12, fill: "#cbd5e1", fontFamily: "system-ui", fontWeight: 500 }}>
              Data captured every Monday at 18:00  -  click Update to record now
            </text>
          )}
        </svg>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
        {justUpdated && (
          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13 }}>OK</span> Chart updated for week of {currentWeekLabel}
          </span>
        )}
        {currentSnap && !justUpdated && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            Week of {currentWeekLabel}: Invoice {parseVal(invoiceIssued).toLocaleString()} . Spent {(parseVal(actualSpent) + parseVal(externalSpent)).toLocaleString()}
          </span>
        )}
        <button
          onClick={handleUpdate}
          style={{
            background: "#0f172a", color: "#ffffff", border: "none", borderRadius: 4,
            padding: "6px 16px", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ fontSize: 12 }}>Refresh</span> Update Chart
        </button>
      </div>
    </div>
  );
}


// --- CPI TREND CHART --------------------------------------------------------
function CPITrendChart({ budgetHistory, onManualUpdate }) {
  const W = 820, H = 320;
  const PAD = { top: 24, right: 24, bottom: 52, left: 64 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const [justUpdated, setJustUpdated] = useState(false);
  const weeks = generateWeekLabels();
  const dataPoints = weeks.map(weekDate => {
    const key = getMondaySnapshotKey(weekDate);
    const snap = budgetHistory[key];
    return { date: weekDate, label: formatWeekLabel(weekDate), cpi: (snap && snap.cpi != null) ? snap.cpi : null };
  });
  const cpiVals = dataPoints.map(p => p.cpi).filter(v => v !== null);
  const dataMax = cpiVals.length ? Math.max(...cpiVals) : 2;
  const yMax = Math.max(dataMax * 1.2, 2);
  const yMin = 0;
  const yRange = yMax - yMin;
  const xPos = i => PAD.left + (i / Math.max(weeks.length - 1, 1)) * chartW;
  const yPos = v => PAD.top + chartH - ((v - yMin) / yRange) * chartH;
  const yTicks = Array.from({ length: 5 }, (_, i) => parseFloat((yMin + (yRange / 4) * i).toFixed(2)));
  const now = new Date();
  let todayIdx = -1;
  for (let i = weeks.length - 1; i >= 0; i--) { if (weeks[i] <= now) { todayIdx = i; break; } }
  const currentKey = getNextMondayKey(now);
  const currentSnap = budgetHistory[currentKey];
  const currentWeekLabel = formatWeekLabel(keyToDate(currentKey));
  const hasData = dataPoints.some(p => p.cpi !== null);
  let linePath = "";
  let started = false;
  dataPoints.forEach((pt, i) => {
    if (pt.cpi === null) { started = false; return; }
    const x = xPos(i), y = yPos(pt.cpi);
    if (!started) { linePath += `M${x},${y}`; started = true; } else { linePath += ` L${x},${y}`; }
  });
  const handleUpdate = () => { onManualUpdate(); setJustUpdated(true); setTimeout(() => setJustUpdated(false), 2500); };
  return (
    <div style={{ marginTop: 28, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>CPI Trend - Weekly Snapshot (Mondays 18:00)</div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 3, background: "#8b5cf6", borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>CPI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 24, height: 0, borderTop: "2px dashed #94a3b8" }} />
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Target = 1.0</span>
          </div>
        </div>
      </div>
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={yPos(tick)} x2={PAD.left + chartW} y2={yPos(tick)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PAD.left - 8} y={yPos(tick) + 4} textAnchor="end" style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui" }}>{tick.toFixed(2)}</text>
            </g>
          ))}
          {weeks.map((w, i) => {
            if (i % Math.max(1, Math.floor(weeks.length / 8)) !== 0) return null;
            return (<text key={i} x={xPos(i)} y={PAD.top + chartH + 20} textAnchor="middle" style={{ fontSize: 9, fill: "#94a3b8", fontFamily: "system-ui" }}>{formatWeekLabel(w)}</text>);
          })}
          {weeks.map((w, i) => (<line key={i} x1={xPos(i)} y1={PAD.top + chartH} x2={xPos(i)} y2={PAD.top + chartH + 4} stroke="#e2e8f0" strokeWidth="1" />))}
          {yPos(1.0) >= PAD.top && yPos(1.0) <= PAD.top + chartH && (
            <g>
              <line x1={PAD.left} y1={yPos(1.0)} x2={PAD.left + chartW} y2={yPos(1.0)} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.7" />
              <text x={PAD.left + chartW + 4} y={yPos(1.0) + 4} style={{ fontSize: 9, fill: "#94a3b8", fontFamily: "system-ui", fontWeight: 700 }}>1.0</text>
            </g>
          )}
          {todayIdx >= 0 && (
            <g>
              <line x1={xPos(todayIdx)} y1={PAD.top} x2={xPos(todayIdx)} y2={PAD.top + chartH} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
              <text x={xPos(todayIdx) + 4} y={PAD.top + 12} style={{ fontSize: 9, fill: "#0ea5e9", fontFamily: "system-ui", fontWeight: 700 }}>Current Week</text>
            </g>
          )}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="#e2e8f0" strokeWidth="1.5" />
          <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH} stroke="#e2e8f0" strokeWidth="1.5" />
          <text x={16} y={PAD.top + chartH / 2} textAnchor="middle" transform={`rotate(-90, 16, ${PAD.top + chartH / 2})`} style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>CPI</text>
          <text x={PAD.left + chartW / 2} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8", fontFamily: "system-ui", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Weeks</text>
          {hasData && (
            <>
              <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {dataPoints.map((pt, i) => pt.cpi !== null && (
                <g key={`cpi-${i}`}>
                  <circle cx={xPos(i)} cy={yPos(pt.cpi)} r={4} fill={pt.cpi >= 1 ? "#22c55e" : "#ef4444"} stroke="#ffffff" strokeWidth="1.5" />
                  <title>CPI - {pt.label}: {pt.cpi.toFixed(2)}</title>
                </g>
              ))}
            </>
          )}
          {!hasData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fontSize: 12, fill: "#cbd5e1", fontFamily: "system-ui", fontWeight: 500 }}>
              Data captured every Monday at 18:00 - click Update to record now
            </text>
          )}
        </svg>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
        {justUpdated && (
          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13 }}>OK</span> Chart updated for week of {currentWeekLabel}
          </span>
        )}
        {currentSnap && !justUpdated && currentSnap.cpi != null && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            Week of {currentWeekLabel}: CPI {currentSnap.cpi.toFixed(2)}
          </span>
        )}
        <button onClick={handleUpdate} style={{ background: "#0f172a", color: "#ffffff", border: "none", borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12 }}>Refresh</span> Update Chart
        </button>
      </div>
    </div>
  );
}
const STAFF_OPTIONS = [];

function StaffPicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const selected = STAFF_OPTIONS.find(o => o.name === value);
  const handleManualKeyDown = (e) => {
    if (e.key === "Enter" && manualInput.trim()) {
      e.preventDefault();
      onChange(manualInput.trim());
      setManualInput("");
      setOpen(false);
    }
  };
  return (
    <div style={{ marginBottom: 14, position: "relative" }} ref={ref}>
      {label && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>}
      <div onClick={() => setOpen(o => !o)} style={{ fontSize: 13, color: value ? "#0f172a" : "#94a3b8", padding: "4px 0", borderBottom: "1.5px solid #e2e8f0", cursor: "pointer", minHeight: 28, display: "flex", alignItems: "center", gap: 6 }}>
        {selected ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f0f9ff", borderRadius: 99, padding: "2px 8px 2px 4px", fontSize: 12 }}>
            <img src={selected.photo} alt={value} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
            {value}
          </span>
        ) : value ? (
          <span style={{ fontSize: 12, color: "#0f172a" }}>{value}</span>
        ) : "Select person..."}
        {value && <span onClick={(e) => { e.stopPropagation(); onChange(""); setManualInput(""); }} style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>&#x2715;</span>}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 200, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 240, maxHeight: 260, overflowY: "auto" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
            <input
              autoFocus
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={handleManualKeyDown}
              placeholder="Type a name & press Enter..."
              style={{ width: "100%", border: "none", outline: "none", fontSize: 12, background: "transparent" }}
            />
          </div>
          {STAFF_OPTIONS.map(opt => (
            <div key={opt.name} onClick={() => { onChange(opt.name); setOpen(false); }} style={{ padding: "7px 12px", fontSize: 13, cursor: "pointer", background: value === opt.name ? "#f0f9ff" : "transparent", color: value === opt.name ? "#0f172a" : "#94a3b8", display: "flex", alignItems: "center", gap: 8 }}>
              <img src={opt.photo} alt={opt.name} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              {opt.name}
            </div>
          ))}
          {STAFF_OPTIONS.length === 0 && (
            <div style={{ padding: "7px 12px", fontSize: 12, color: "#94a3b8" }}>Type a name above and press Enter</div>
          )}
          <div onClick={() => { onChange(""); setOpen(false); }} style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", color: "#94a3b8", borderTop: "1px solid #f1f5f9" }}>
            Clear
          </div>
        </div>
      )}
    </div>
  );
}

function StaffPickerMulti({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const ref = useRef(null);
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const toggle = (opt) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(next.join(", "));
  };
  const addManual = () => {
    const name = inputVal.trim();
    if (name && !selected.includes(name)) {
      const next = [...selected, name];
      onChange(next.join(", "));
    }
    setInputVal("");
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addManual();
    }
  };
  const filtered = STAFF_OPTIONS.filter(o => o.name.toLowerCase().includes(inputVal.toLowerCase()));
  return (
    <div style={{ marginBottom: 14, position: "relative" }} ref={ref}>
      {label && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>}
      <div onClick={() => setOpen(o => !o)} style={{ fontSize: 13, color: selected.length ? "#0f172a" : "#94a3b8", padding: "4px 0", borderBottom: "1.5px solid #e2e8f0", cursor: "pointer", minHeight: 28, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
        {selected.length > 0 ? selected.map(name => {
          const member = STAFF_OPTIONS.find(o => o.name === name);
          return member ? (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f0f9ff", borderRadius: 99, padding: "2px 8px 2px 4px", fontSize: 12 }}>
              <img src={member.photo} alt={name} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
              {name}
            </span>
          ) : <span key={name} style={{ fontSize: 12 }}>{name}</span>;
        }) : "Select team members..."}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 200, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 260, maxHeight: 280, overflowY: "auto" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
            <input
              autoFocus
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a name & press Enter to add..."
              style={{ width: "100%", border: "none", outline: "none", fontSize: 12, background: "transparent" }}
            />
          </div>
          {filtered.map(opt => (
            <div key={opt.name} onClick={() => toggle(opt.name)} style={{ padding: "7px 12px", fontSize: 13, cursor: "pointer", background: selected.includes(opt.name) ? "#f0f9ff" : "transparent", color: selected.includes(opt.name) ? "#0f172a" : "#94a3b8", display: "flex", alignItems: "center", gap: 8 }}>
              <img src={opt.photo} alt={opt.name} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{opt.name}</span>
              {selected.includes(opt.name) && <span style={{ fontSize: 12, color: "#0ea5e9" }}>&#10003;</span>}
            </div>
          ))}
          {filtered.length === 0 && inputVal && (
            <div style={{ padding: "7px 12px", fontSize: 12, color: "#94a3b8" }}>
              Press Enter to add "{inputVal}"
            </div>
          )}
          {STAFF_OPTIONS.length === 0 && !inputVal && (
            <div style={{ padding: "7px 12px", fontSize: 12, color: "#94a3b8" }}>Type a name above and press Enter</div>
          )}
        </div>
      )}
    </div>
  );
}


const styles = {
  fieldLabel: { fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 },
  th: { fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", padding: "0 8px 8px 8px", textAlign: "center" },
  td: { borderBottom: "1px solid #f1f5f9", padding: "4px 8px", verticalAlign: "middle" },
  tdNum: { borderBottom: "1px solid #f1f5f9", padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#cbd5e1", textAlign: "center", fontFamily: "monospace" },
  inlineInput: { width: "100%", fontSize: 13, border: "none", outline: "none", background: "transparent", color: "#0f172a", padding: "4px 0" },
  delBtn: { background: "none", border: "none", color: "#cbd5e1", fontSize: 16, cursor: "pointer", padding: "2px 4px", lineHeight: 1 },
  addBtn: { marginTop: 8, background: "none", border: "1px dashed #cbd5e1", borderRadius: 4, color: "#94a3b8", fontSize: 12, cursor: "pointer", padding: "4px 12px" },
};

export default function App() {
  const [data, setData] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hideBudget, setHideBudget] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const saveTimer = useRef(null);
  const snapshotTimer = useRef(null);

  useEffect(() => {
    loadData().then(d => {
      if (d) setData(d);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "dt-print-styles";
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 15mm 12mm; }
        .no-print { display: none !important; }
        body { background: #fff !important; }
        [style*="position: sticky"], [style*="position:sticky"] { position: static !important; box-shadow: none !important; border-bottom: 1px solid #e2e8f0 !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;
    if (!document.getElementById("dt-print-styles")) document.head.appendChild(style);
    return () => { const el = document.getElementById("dt-print-styles"); if (el) el.remove(); };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await saveData(data);
      setSaving(false);
      setSavedAt(new Date());
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  // Auto-snapshot every Monday at 18:00
  useEffect(() => {
    if (!loaded) return;
    const takeSnapshotIfDue = () => {
      const now = new Date();
      if (now.getDay() !== 1 || now.getHours() !== 18) return;
      const key = getMondaySnapshotKey(now);
      setData(prev => {
        const existing = prev.budgetHistory || {};
        if (existing[key]) return prev;
        const parseVal = v => parseFloat((v || "").replace(/[^0-9.-]/g, "")) || 0;
        const snap = { internalBudget: parseVal(prev.internalBudget),
        availableBudget: (parseFloat(prev.progressPct || "0") / 100) * (parseFloat((prev.internalBudget || "").replace(/[^0-9.-]/g, "")) || 0),
        actualSpent: parseVal(prev.actualSpent), ts: now.toISOString() };
        return { ...prev, budgetHistory: { ...existing, [key]: snap } };
      });
    };
    takeSnapshotIfDue();
    snapshotTimer.current = setInterval(takeSnapshotIfDue, 60000);
    return () => clearInterval(snapshotTimer.current);
  }, [loaded]);

  // Manual update: overwrite the current week's snapshot with the latest live values
  const handleManualUpdate = useCallback(() => {
    const now = new Date();
    const key = getNextMondayKey(now);
    setData(prev => {
      const parseVal = v => parseFloat((v || "").replace(/[^0-9.-]/g, "")) || 0;
      const snap = {
        internalBudget: parseVal(prev.internalBudget),
        availableBudget: (parseFloat(prev.progressPct || "0") / 100) * (parseFloat((prev.internalBudget || "").replace(/[^0-9.-]/g, "")) || 0),
        actualSpent: parseVal(prev.actualSpent),
        invoiceIssued: parseVal(prev.invoiceIssued),
        externalSpent: (parseFloat(prev.progressPct || "0") / 100) * (parseFloat((prev.externalBudget || "").replace(/[^0-9.-]/g, "")) || 0),
        ts: now.toISOString(),
        manuallyUpdated: true,
        cpi: (() => { const parseV = v => parseFloat((v || "").replace(/[^0-9.-]/g, "")) || 0; const earned = parseV(prev.contractValue) * (parseV(prev.progressPct) / 100); const extSpent = (parseFloat(prev.progressPct || "0") / 100) * (parseFloat((prev.externalBudget || "").replace(/[^0-9.-]/g, "")) || 0); const totalSpent = extSpent + parseV(prev.actualSpent); return (totalSpent > 0) ? earned / totalSpent : null; })(),
      };
      return { ...prev, budgetHistory: { ...(prev.budgetHistory || {}), [key]: snap } };
    });
  }, []);

  const set = useCallback((key, val) => { setData(prev => ({ ...prev, [key]: val })); }, []);

  const setProgramRow = useCallback((i, field, val) => {
    setData(prev => {
      if (i === "_replace") return { ...prev, programRows: val };
      if (i === "_add") return { ...prev, programRows: [...prev.programRows, { stage: "", baseline: "", baselineStart: "", baselineEnd: "", actual: "", actualStart: "", actualEnd: "" }] };
      return { ...prev, programRows: prev.programRows.map((r, j) => j === i ? { ...r, [field]: val } : r) };
    });
  }, []);

  const setActionRow = useCallback((key, i, field, val) => {
    setData(prev => {
      if (i === "_replace") return { ...prev, [key]: val };
      if (i === "_add") return { ...prev, [key]: [...prev[key], { action: "", owner: "", status: "" }] };
      return { ...prev, [key]: prev[key].map((r, j) => j === i ? { ...r, [field]: val } : r) };
    });
  }, []);

  const setSubconsultantRow = useCallback((i, field, val) => {
    setData(prev => {
      if (i === "_replace") return { ...prev, subconsultantRows: val };
      if (i === "_add") return { ...prev, subconsultantRows: [...(prev.subconsultantRows || []), { name: "", contractStatus: "" }] };
      return { ...prev, subconsultantRows: (prev.subconsultantRows || []).map((r, j) => j === i ? { ...r, [field]: val } : r) };
    });
  }, []);

    const setPaymentRow = useCallback((i, field, val) => {
    setData(prev => {
      if (i === "_replace") return { ...prev, paymentRows: val };
      if (i === "_add") return { ...prev, paymentRows: [...prev.paymentRows, { milestone: "", clientStatus: "", subsStatus: "" }] };
      return { ...prev, paymentRows: prev.paymentRows.map((r, j) => j === i ? { ...r, [field]: val } : r) };
    });
  }, []);

  const setCriticalRow = useCallback((i, field, val) => {
    setData(prev => {
      if (i === "_replace") return { ...prev, criticalIssues: val };
      if (i === "_add") return { ...prev, criticalIssues: [...prev.criticalIssues, { issue: "", status: "" }] };
      return { ...prev, criticalIssues: prev.criticalIssues.map((r, j) => j === i ? { ...r, [field]: val } : r) };
    });
  }, []);

  if (!loaded) return (<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc" }}><div style={{ fontSize: 13, color: "#94a3b8" }}>Loading...</div></div>);

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans', system-ui, sans-serif", color: "#0f172a" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#ffffff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 32px", height: 52, gap: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "0.05em", color: "#0f172a", borderRight: "1px solid #e2e8f0", paddingRight: 20, marginRight: 4 }}>Project Dashboard</div>
        <input value={data.projectCode} onChange={e => set("projectCode", e.target.value)} placeholder="PROJECT CODE" style={{ ...navInput, width: 110, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }} />
        <span style={{ color: "#e2e8f0" }}>.</span>
        <input value={data.projectName} onChange={e => set("projectName", e.target.value)} placeholder="Project Name" style={{ ...navInput, width: 200 }} />
        <span style={{ color: "#e2e8f0" }}>.</span>
        <input value={data.client} onChange={e => set("client", e.target.value)} placeholder="Client" style={{ ...navInput, width: 160 }} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>Report Date</span>
          <input type="date" value={data.reportDate} onChange={e => set("reportDate", e.target.value)} style={{ ...navInput, fontSize: 12 }} />
        </div>
        <div style={{ fontSize: 11, color: saving ? "#f59e0b" : "#10b981", minWidth: 80, textAlign: "right" }}>
          {saving ? "Saving..." : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved"}
        </div>
        <button className="no-print" onClick={() => window.print()} style={{ marginLeft: 16, background: "#0f172a", color: "#ffffff", border: "none", borderRadius: 4, padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 13 }}></span> Download PDF
        </button>
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 32px 80px" }}>

        {/* 01 . PROJECT OVERVIEW */}
        <SectionHead title="Project Overview" index={0} />
        <TwoCol>
          <StaffPicker label="Key Personnel / Project Lead" value={data.keyPersonnel} onChange={v => set("keyPersonnel", v)} />
          <div><div style={styles.fieldLabel}>Contract Status</div><div style={{ marginBottom: 14, paddingTop: 4 }}><StatusBadge value={data.contractStatus} onChange={v => set("contractStatus", v)} /></div></div>
        </TwoCol>
        <StaffPickerMulti label="Team This Week" value={data.teamThisWeek} onChange={v => set("teamThisWeek", v)} />
        <div style={{ marginBottom: 14 }}><div style={styles.fieldLabel}>Subconsultants</div><SubconsultantsTable rows={data.subconsultantRows || []} onChange={(i, field, val) => setSubconsultantRow(i, field, val)} /></div>
        <Field label="Contract Value" value={data.contractValue} onChange={v => set("contractValue", v)} placeholder="AED" numeric={true} />
        <PageBreak />

        {/* 02 . PROJECT STATUS */}
        <SectionHead title="Project Status" index={1} />
        <Field label="Current Stage & Status" value={data.projectStatus} onChange={v => set("projectStatus", v)} placeholder="Enter current stage" />
        <ProgressBar value={data.progressPct} onChange={v => set("progressPct", v)} />
        <TwoCol>
          <Field label="Target Invoice Milestone & Value" value={data.targetInvoice} onChange={v => set("targetInvoice", v)} placeholder="Milestone name / AED" />
          <Field label="Invoice Due Date" value={data.invoiceDueDate} onChange={v => set("invoiceDueDate", v)} type="date" />
        </TwoCol>
        <PageBreak />

        {/* 03 . BUDGET & FINANCIALS */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <SectionHead title="Budget & Financials" index={2} />
          <button onClick={() => setHideBudget(h => !h)} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "none", border: "1px solid #e2e8f0", borderRadius: 4, color: "#94a3b8", cursor: "pointer", padding: "3px 10px", marginBottom: 20 }}>{hideBudget ? "Show" : "Hide"}</button>
        </div>
        {!hideBudget && <>
          <TwoCol><div><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><div style={styles.fieldLabel}>Budget Status</div><BudgetStatusBadge value={data.budgetStatus} onChange={v => set("budgetStatus", v)} /></div></div><div /></TwoCol>
          <TwoCol>
            <Field label="Internal Budget" value={data.internalBudget} onChange={v => set("internalBudget", v)} placeholder="AED" numeric={true} />
            <Field label="External Sub-Consultants Budget" value={data.externalBudget} onChange={v => set("externalBudget", v)} placeholder="AED" numeric={true} />
            <div style={{ marginBottom: 14 }}><div style={styles.fieldLabel}>Available Budget To-Date</div><div style={{ fontSize: 13, color: "#0f172a", padding: "4px 0", borderBottom: "1.5px solid #e2e8f0", fontWeight: 600 }}>{(() => { const pct = parseFloat((data.progressPct || "0")) || 0; const budget = parseFloat((data.internalBudget || "").replace(/[^0-9.-]/g, "")) || 0; const val = (pct / 100) * budget; return (pct === 0 && budget === 0) ? "AED" : "AED " + val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); })()}</div></div>
            <Field label="Actual Spent To-Date" value={data.actualSpent} onChange={v => set("actualSpent", v)} placeholder="AED" numeric={true} />
          </TwoCol>
          <div style={{ marginBottom: 14 }}><div style={styles.fieldLabel}>Balance To-Date</div><BalanceIndicator available={String((parseFloat(data.progressPct || "0") / 100) * (parseFloat((data.internalBudget || "").replace(/[^0-9.-]/g, "")) || 0))} spent={data.actualSpent} /></div>
          <TwoCol>
            <Field label="Value of Invoice Issued" value={data.invoiceIssued} onChange={v => set("invoiceIssued", v)} placeholder="AED" numeric={true} />
            <div style={{ marginBottom: 14 }}><div style={styles.fieldLabel}>External Spent To-Date</div><div style={{ fontSize: 13, color: "#0f172a", padding: "4px 0", borderBottom: "1.5px solid #e2e8f0", fontWeight: 600 }}>{(() => { const pct = parseFloat((data.progressPct || "0")) || 0; const budget = parseFloat((data.externalBudget || "").replace(/[^0-9.-]/g, "")) || 0; const val = (pct / 100) * budget; return (pct === 0 && budget === 0) ? "AED" : "AED " + val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); })()}</div></div>
          </TwoCol>
          <div style={{ marginBottom: 14 }}><div style={styles.fieldLabel}>Cash Variance</div><CashVarianceIndicator invoiceIssued={data.invoiceIssued} actualSpent={data.actualSpent} externalSpent={"" + ((parseFloat((data.progressPct || "0")) || 0) / 100 * (parseFloat((data.externalBudget || "").replace(/[^0-9.-]/g, "")) || 0))} /></div>
          <div style={{ marginBottom: 14 }}><div style={styles.fieldLabel}>CPI (Cost Performance Index)</div><CPIIndicator contractValue={data.contractValue} progressPct={data.progressPct} externalSpent={"" + ((parseFloat((data.progressPct || "0")) || 0) / 100 * (parseFloat((data.externalBudget || "").replace(/[^0-9.-]/g, "")) || 0))} actualSpent={data.actualSpent} /></div>

          {/* BUDGET TREND CHART */}
          <BudgetTrendChart
            budgetHistory={data.budgetHistory || {}}
            internalBudget={data.internalBudget}
            availableBudget={String(
              (parseFloat(data.progressPct || "0") / 100) *
              (parseFloat((data.internalBudget || "").replace(/[^0-9.-]/g, "")) || 0)
            )}
            actualSpent={data.actualSpent}
            onManualUpdate={handleManualUpdate}
          />

          {/* CASH VARIANCE CHART */}
          <CashVarianceChart
            budgetHistory={data.budgetHistory || {}}
            invoiceIssued={data.invoiceIssued}
            externalSpent={String(
              (parseFloat(data.progressPct || "0") / 100) *
              (parseFloat((data.externalBudget || "").replace(/[^0-9.-]/g, "")) || 0)
            )}
            actualSpent={data.actualSpent}
            onManualUpdate={handleManualUpdate}
          />
          {/* CPI TREND CHART */}
          <CPITrendChart
            budgetHistory={data.budgetHistory || {}}
            onManualUpdate={handleManualUpdate}
          />
        </>}
        <PageBreak />

        {/* 04 . PAYMENT STATUS */}
        <SectionHead title="Payment Status" index={3} />
        <CombinedPaymentTable rows={data.paymentRows} onChange={(i, field, val) => setPaymentRow(i, field, val)} />
        <PageBreak />

        {/* 05 . PROGRAM */}
        <SectionHead title="Program" index={4} />
        <ProgramTable rows={data.programRows} onChange={setProgramRow} />
        <PageBreak />

        {/* 06 . VARIATIONS & RISKS */}
        <SectionHead title="Variations & Risks" index={5} />
        <div><div style={styles.fieldLabel}>Critical Issues &amp; Risks</div><CriticalIssuesTable rows={data.criticalIssues} onChange={(i, field, val) => setCriticalRow(i, field, val)} /></div>
        <PageBreak />

        {/* 07 . ACTION LIST */}
        <SectionHead title="Action List" index={6} />
        <ActionTable rows={data.currentActions} onChange={(i, field, val) => setActionRow("currentActions", i, field, val)} />

      </div>

      <div style={{ borderTop: "1.5px solid #000000", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff" }}>
        <span style={{ fontSize: 11, color: "#cbd5e1", letterSpacing: "0.06em" }}>DT ARCHITECTURE & DESIGN . CONFIDENTIAL . INTERNAL USE ONLY</span>
        <span style={{ fontSize: 11, color: "#cbd5e1" }}>{new Date().getFullYear()}</span>
      </div>
    </div>
  );
}

const navInput = {
  background: "transparent", border: "none", borderBottom: "1.5px solid transparent",
  outline: "none", fontSize: 13, color: "#0f172a", padding: "2px 0",
  transition: "border-color 0.15s", fontFamily: "inherit"
};
