import { useState, useEffect, useRef, useCallback } from "react";

// ─── STORAGE HELPERS ─────────────────────────────────────────────────────────
const STORAGE_KEY = "dt-project-dashboard-v1";

async function loadData() {
  try {
    const res = await fetch("/.netlify/functions/sheets");
    if (!res.ok) return null;
    const data = await res.json();
    if (Object.keys(data).length === 0) return null;
    const parsed = {};
    for (const [k, v] of Object.entries(data)) {
      try { parsed[k] = JSON.parse(v); }
      catch { parsed[k] = v; }
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
  } catch { /* silent */ }
}
// ─── DEFAULT STATE ────────────────────────────────────────────────────────────
const defaultState = {
  projectCode: "",
  projectName: "",
  client: "",
  reportDate: new Date().toISOString().slice(0, 10),
  keyPersonnel: "",
  subconsultants: "",
  contractStatus: "",
  contractValue: "",
  budgetStatus: "",
  internalBudget: "",
  externalBudget: "",
  availableBudget: "",
  actualSpent: "",
  projectStatus: "",
  progressPct: "",
  targetInvoice: "",
  invoiceDueDate: "",
  clientPayments: "",
  subsPayments: "",
  programRows: [
    { stage: "", baseline: "", actual: "" },
    { stage: "", baseline: "", actual: "" },
    { stage: "", baseline: "", actual: "" },
  ],
  potentialVariations: "",
  criticalIssues: "",
  currentActions: [
    { action: "", owner: "", date: "" },
    { action: "", owner: "", date: "" },
    { action: "", owner: "", date: "" },
  ],
  nextActions: [
    { action: "", owner: "", date: "" },
    { action: "", owner: "", date: "" },
    { action: "", owner: "", date: "" },
  ],
};

// ─── TINY COMPONENTS ─────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = "text", placeholder = "", wide = false, mono = false }) {
  const base = {
    fontFamily: mono ? "'JetBrains Mono', 'Fira Mono', monospace" : "inherit",
    fontSize: 13,
    color: "#0f172a",
    background: "transparent",
    border: "none",
    borderBottom: "1.5px solid #e2e8f0",
    outline: "none",
    width: "100%",
    padding: "4px 0",
    resize: "none",
    lineHeight: 1.6,
    transition: "border-color 0.15s",
  };

  const focusStyle = { borderColor: "#0ea5e9" };

  const [focused, setFocused] = useState(false);

  if (type === "textarea") {
    return (
      <div style={{ marginBottom: 14 }}>
        {label && <div style={styles.fieldLabel}>{label}</div>}
        <textarea
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ ...base, borderBottom: `1.5px solid ${focused ? "#0ea5e9" : "#e2e8f0"}`, paddingTop: 6 }}
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={styles.fieldLabel}>{label}</div>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ ...base, borderBottom: `1.5px solid ${focused ? "#0ea5e9" : "#e2e8f0"}` }}
      />
    </div>
  );
}

function StatusBadge({ value, onChange }) {
  const options = ["Signed", "Pending", "LOA Issued", "Awaited"];
  const colors = {
    Signed: { bg: "#dcfce7", fg: "#166534" },
    Pending: { bg: "#fef9c3", fg: "#854d0e" },
    "LOA Issued": { bg: "#dbeafe", fg: "#1e40af" },
    Awaited: { bg: "#fee2e2", fg: "#991b1b" },
    "": { bg: "#f1f5f9", fg: "#64748b" },
  };
  const c = colors[value] || colors[""];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none",
          background: c.bg,
          color: c.fg,
          border: "none",
          borderRadius: 4,
          padding: "3px 24px 3px 10px",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.03em",
          cursor: "pointer",
          outline: "none",
        }}
      >
        <option value="">— Select —</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: c.fg }}>▾</span>
    </div>
  );
}

function BudgetStatusBadge({ value, onChange }) {
  const opts = ["Approved", "Pending"];
  const c = value === "Approved" ? { bg: "#dcfce7", fg: "#166534" } : { bg: "#fef9c3", fg: "#854d0e" };
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ appearance: "none", background: c.bg, color: c.fg, border: "none", borderRadius: 4, padding: "3px 24px 3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}>
        <option value="">— Select —</option>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: c.fg }}>▾</span>
    </div>
  );
}

function ProgressBar({ value, onChange }) {
  const pct = Math.min(100, Math.max(0, parseInt(value) || 0));
  const color = pct < 30 ? "#f87171" : pct < 70 ? "#fbbf24" : "#34d399";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={styles.fieldLabel}>Overall Progress</div>
        <input
          type="number" min={0} max={100} value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: 52, fontSize: 13, border: "none", borderBottom: "1.5px solid #e2e8f0", outline: "none", background: "transparent", textAlign: "right", fontWeight: 700 }}
        />
        <span style={{ fontSize: 12, color: "#64748b" }}>%</span>
      </div>
      <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function SectionHead({ title, index }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, marginTop: index === 0 ? 0 : 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {String(index + 1).padStart(2, "0")} · {title}
      </div>
      <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
    </div>
  );
}

function TwoCol({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
      {children}
    </div>
  );
}

function ActionTable({ rows, onChange, label }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={styles.th}>#</th>
            <th style={{ ...styles.th, width: "60%", textAlign: "left" }}>Action</th>
            <th style={styles.th}>Owner</th>
            <th style={styles.th}>Date</th>
            <th style={{ ...styles.th, width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.tdNum}>{String(i + 1).padStart(2, "0")}</td>
              <td style={styles.td}>
                <input value={row.action} onChange={e => onChange(i, "action", e.target.value)}
                  placeholder="Enter action item…"
                  style={styles.inlineInput} />
              </td>
              <td style={styles.td}>
                <input value={row.owner} onChange={e => onChange(i, "owner", e.target.value)}
                  placeholder="Name"
                  style={{ ...styles.inlineInput, textAlign: "center" }} />
              </td>
              <td style={styles.td}>
                <input type="date" value={row.date} onChange={e => onChange(i, "date", e.target.value)}
                  style={{ ...styles.inlineInput, textAlign: "center", fontSize: 11 }} />
              </td>
              <td style={styles.td}>
                <button onClick={() => {
                  const next = rows.filter((_, j) => j !== i);
                  onChange("_replace", null, next);
                }} style={styles.delBtn}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange("_add", null, null)}
        style={styles.addBtn}>+ Add row</button>
    </div>
  );
}

function ProgramTable({ rows, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...styles.th, textAlign: "left", width: "34%" }}>Stage</th>
            <th style={{ ...styles.th, textAlign: "left" }}>Baseline Duration</th>
            <th style={{ ...styles.th, textAlign: "left" }}>Actual Duration</th>
            <th style={{ ...styles.th, width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={styles.td}><input value={row.stage} onChange={e => onChange(i, "stage", e.target.value)} placeholder="Stage name" style={styles.inlineInput} /></td>
              <td style={styles.td}><input value={row.baseline} onChange={e => onChange(i, "baseline", e.target.value)} placeholder="e.g. 8 weeks" style={styles.inlineInput} /></td>
              <td style={styles.td}><input value={row.actual} onChange={e => onChange(i, "actual", e.target.value)} placeholder="e.g. 10 weeks" style={styles.inlineInput} /></td>
              <td style={styles.td}><button onClick={() => {
                const next = rows.filter((_, j) => j !== i);
                onChange("_replace", null, next);
              }} style={styles.delBtn}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange("_add", null, null)} style={styles.addBtn}>+ Add stage</button>
    </div>
  );
}

function BalanceIndicator({ available, spent }) {
  const av = parseFloat(available.replace(/[^0-9.-]/g, "")) || 0;
  const sp = parseFloat(spent.replace(/[^0-9.-]/g, "")) || 0;
  const balance = av - sp;
  const isPos = balance >= 0;
  const formatted = balance === 0 ? "—" : (isPos ? "+" : "") + balance.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: balance === 0 ? "#f1f5f9" : isPos ? "#dcfce7" : "#fee2e2",
      color: balance === 0 ? "#64748b" : isPos ? "#166534" : "#991b1b",
      borderRadius: 4, padding: "4px 12px", fontSize: 13, fontWeight: 700,
    }}>
      {balance !== 0 && <span style={{ fontSize: 11 }}>{isPos ? "▲" : "▼"}</span>}
      Balance: {formatted}
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = {
  fieldLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#94a3b8",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  th: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#94a3b8",
    textTransform: "uppercase",
    borderBottom: "1px solid #e2e8f0",
    padding: "0 8px 8px 8px",
    textAlign: "center",
  },
  td: {
    borderBottom: "1px solid #f1f5f9",
    padding: "4px 8px",
    verticalAlign: "middle",
  },
  tdNum: {
    borderBottom: "1px solid #f1f5f9",
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700,
    color: "#cbd5e1",
    textAlign: "center",
    fontFamily: "monospace",
  },
  inlineInput: {
    width: "100%",
    fontSize: 13,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#0f172a",
    padding: "4px 0",
  },
  delBtn: {
    background: "none",
    border: "none",
    color: "#cbd5e1",
    fontSize: 16,
    cursor: "pointer",
    padding: "2px 4px",
    lineHeight: 1,
  },
  addBtn: {
    marginTop: 8,
    background: "none",
    border: "1px dashed #cbd5e1",
    borderRadius: 4,
    color: "#94a3b8",
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 12px",
  },
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const saveTimer = useRef(null);

  // Load on mount
  useEffect(() => {
    loadData().then(d => {
      if (d) setData(d);
      setLoaded(true);
    });
  }, []);

  // Auto-save on data change
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

  const set = useCallback((key, val) => {
    setData(prev => ({ ...prev, [key]: val }));
  }, []);

  const setProgramRow = useCallback((i, field, val) => {
    setData(prev => {
      if (i === "_replace") return { ...prev, programRows: val };
      if (i === "_add") return { ...prev, programRows: [...prev.programRows, { stage: "", baseline: "", actual: "" }] };
      const rows = prev.programRows.map((r, j) => j === i ? { ...r, [field]: val } : r);
      return { ...prev, programRows: rows };
    });
  }, []);

  const setActionRow = useCallback((key, i, field, val) => {
    setData(prev => {
      if (i === "_replace") return { ...prev, [key]: val };
      if (i === "_add") return { ...prev, [key]: [...prev[key], { action: "", owner: "", date: "" }] };
      const rows = prev[key].map((r, j) => j === i ? { ...r, [field]: val } : r);
      return { ...prev, [key]: rows };
    });
  }, []);

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc", fontFamily: "system-ui" }}>
        <div style={{ fontSize: 13, color: "#94a3b8", letterSpacing: "0.08em" }}>Loading…</div>
      </div>
    );
  }

  const headerTitle = [data.projectCode, data.projectName, data.client].filter(Boolean).join(" · ") || "Untitled Project";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "'DM Sans', 'IBM Plex Sans', system-ui, sans-serif",
      color: "#0f172a",
    }}>
      {/* ── TOP NAV ──────────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        display: "flex", alignItems: "center",
        padding: "0 32px", height: 52,
        gap: 20,
      }}>
        {/* Logo mark */}
        <div style={{
          fontWeight: 800, fontSize: 15, letterSpacing: "0.05em",
          color: "#0f172a",
          borderRight: "1px solid #e2e8f0",
          paddingRight: 20, marginRight: 4,
          fontFamily: "system-ui",
        }}>DesignTomorrow</div>

        {/* Project identity inputs */}
        <input value={data.projectCode} onChange={e => set("projectCode", e.target.value)}
          placeholder="PROJECT CODE"
          style={{ ...navInput, width: 110, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }} />
        <span style={{ color: "#e2e8f0", fontWeight: 300 }}>·</span>
        <input value={data.projectName} onChange={e => set("projectName", e.target.value)}
          placeholder="Project Name"
          style={{ ...navInput, width: 200 }} />
        <span style={{ color: "#e2e8f0", fontWeight: 300 }}>·</span>
        <input value={data.client} onChange={e => set("client", e.target.value)}
          placeholder="Client"
          style={{ ...navInput, width: 160 }} />

        <div style={{ flex: 1 }} />

        {/* Report date */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>Report Date</span>
          <input type="date" value={data.reportDate} onChange={e => set("reportDate", e.target.value)}
            style={{ ...navInput, fontSize: 12 }} />
        </div>

        {/* Save indicator */}
        <div style={{ fontSize: 11, color: saving ? "#f59e0b" : "#10b981", letterSpacing: "0.04em", minWidth: 80, textAlign: "right" }}>
          {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 32px 80px" }}>

        {/* 01 · PROJECT OVERVIEW */}
        <SectionHead title="Project Overview" index={0} />
        <TwoCol>
          <Field label="Key Personnel / Project Lead" value={data.keyPersonnel}
            onChange={v => set("keyPersonnel", v)} placeholder="Enter project lead name" />
          <div>
            <div style={styles.fieldLabel}>Contract Status</div>
            <div style={{ marginBottom: 14, paddingTop: 4 }}>
              <StatusBadge value={data.contractStatus} onChange={v => set("contractStatus", v)} />
            </div>
          </div>
        </TwoCol>
        <Field label="Subconsultants" value={data.subconsultants} onChange={v => set("subconsultants", v)}
          type="textarea"
          placeholder="List all sub-consultants with disciplines  (e.g. MEP – [Firm]  |  Structure – [Firm]  |  Landscape – [Firm])" />
        <Field label="Contract Value" value={data.contractValue} onChange={v => set("contractValue", v)}
          placeholder="AED —" />

        {/* 02 · BUDGET & FINANCIALS */}
        <SectionHead title="Budget & Financials" index={1} />
        <TwoCol>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={styles.fieldLabel}>Budget Status</div>
              <BudgetStatusBadge value={data.budgetStatus} onChange={v => set("budgetStatus", v)} />
            </div>
          </div>
          <div />
        </TwoCol>
        <TwoCol>
          <Field label="Internal Resources Budget" value={data.internalBudget} onChange={v => set("internalBudget", v)} placeholder="AED —" />
          <Field label="External Sub-Consultants Budget" value={data.externalBudget} onChange={v => set("externalBudget", v)} placeholder="AED —" />
          <Field label="Available Budget To-Date" value={data.availableBudget} onChange={v => set("availableBudget", v)} placeholder="AED —" />
          <Field label="Actual Spent To-Date" value={data.actualSpent} onChange={v => set("actualSpent", v)} placeholder="AED —" />
        </TwoCol>
        <div style={{ marginBottom: 14 }}>
          <div style={styles.fieldLabel}>Balance To-Date</div>
          <BalanceIndicator available={data.availableBudget} spent={data.actualSpent} />
        </div>
        <TwoCol>
          <Field label="Target Invoice Milestone & Value" value={data.targetInvoice} onChange={v => set("targetInvoice", v)} placeholder="Milestone name / AED —" />
          <Field label="Invoice Due Date" value={data.invoiceDueDate} onChange={v => set("invoiceDueDate", v)} type="date" />
        </TwoCol>

        {/* 03 · PAYMENT STATUS */}
        <SectionHead title="Payment Status" index={2} />
        <TwoCol>
          <Field label="Client Payments" value={data.clientPayments} onChange={v => set("clientPayments", v)}
            type="textarea" placeholder="Enter invoices paid to date per contract payment milestones" />
          <Field label="Sub-Consultant Payments" value={data.subsPayments} onChange={v => set("subsPayments", v)}
            type="textarea" placeholder="Enter subs invoices paid to date per contract payment milestones" />
        </TwoCol>

        {/* 04 · PROJECT STATUS */}
        <SectionHead title="Project Status" index={3} />
        <Field label="Current Stage & Status" value={data.projectStatus} onChange={v => set("projectStatus", v)}
          placeholder="Enter current stage  (e.g. Schematic Design – in progress)" />
        <ProgressBar value={data.progressPct} onChange={v => set("progressPct", v)} />

        {/* 05 · PROGRAM */}
        <SectionHead title="Program" index={4} />
        <ProgramTable rows={data.programRows} onChange={setProgramRow} />

        {/* 06 · VARIATIONS & RISKS */}
        <SectionHead title="Variations & Risks" index={5} />
        <TwoCol>
          <Field label="Potential Variations — Plan of Action" value={data.potentialVariations}
            onChange={v => set("potentialVariations", v)} type="textarea"
            placeholder="Note potential variations and plan of action" />
          <Field label="Critical Issues & Risks" value={data.criticalIssues}
            onChange={v => set("criticalIssues", v)} type="textarea"
            placeholder="Identify critical issues, risks, and mitigation strategy" />
        </TwoCol>

        {/* 07 · ACTIONS */}
        <SectionHead title="Weekly Actions" index={6} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
          <ActionTable
            label="This Week's Actions"
            rows={data.currentActions}
            onChange={(i, field, val) => setActionRow("currentActions", i, field, val)}
          />
          <ActionTable
            label="Next Week's Actions"
            rows={data.nextActions}
            onChange={(i, field, val) => setActionRow("nextActions", i, field, val)}
          />
        </div>

      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid #e2e8f0",
        padding: "16px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#ffffff",
      }}>
        <span style={{ fontSize: 11, color: "#cbd5e1", letterSpacing: "0.06em" }}>
          DT ARCHITECTURE & DESIGN · CONFIDENTIAL · INTERNAL USE ONLY
        </span>
        <span style={{ fontSize: 11, color: "#cbd5e1" }}>
          {new Date().getFullYear()}
        </span>
      </div>
    </div>
  );
}

const navInput = {
  background: "transparent",
  border: "none",
  borderBottom: "1.5px solid transparent",
  outline: "none",
  fontSize: 13,
  color: "#0f172a",
  padding: "2px 0",
  transition: "border-color 0.15s",
  fontFamily: "inherit",
};