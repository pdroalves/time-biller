import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Dashboard as D, Settings } from "../types";

type CardProps = {
  label: string;
  value: string;
  unit?: string;
  meta?: string;
  variant?: "brand" | "live" | "danger" | "ink";
};

function Stat({ label, value, unit, meta, variant = "brand" }: CardProps) {
  const cls = variant === "brand" ? "stat" : `stat stat--${variant}`;
  return (
    <div className={cls}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {meta && <div className="stat__meta">{meta}</div>}
    </div>
  );
}

export function Dashboard() {
  const [d, setD] = useState<D | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getDashboard().then(setD);
    api.getSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const cur = settings?.currency_symbol ?? "";

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Dashboard</h1>
        </div>
      </div>

      {!d ? (
        <p className="loading">Loading…</p>
      ) : (
        <div className="stat-grid">
          <Stat label="Unbilled hours" value={d.unbilled_hours} unit="h" variant="live" meta="Tracked but not yet invoiced" />
          <Stat label="Unbilled amount" value={`${cur}${d.unbilled_amount}`} variant="brand" meta="Ready to invoice" />
          <Stat label="Outstanding total" value={`${cur}${d.outstanding_total}`} variant="danger" meta="Invoiced, awaiting payment" />
          <Stat label="Outstanding invoices" value={String(d.outstanding_count)} variant="ink" meta="Not yet marked paid" />
        </div>
      )}
    </div>
  );
}
