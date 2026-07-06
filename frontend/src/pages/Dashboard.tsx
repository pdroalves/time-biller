import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Dashboard as D } from "../types";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, minWidth: 180 }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export function Dashboard() {
  const [d, setD] = useState<D | null>(null);
  useEffect(() => {
    api.getDashboard().then(setD);
  }, []);
  if (!d) return <p>Loading…</p>;
  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Card label="Unbilled hours" value={d.unbilled_hours} />
        <Card label="Unbilled amount" value={d.unbilled_amount} />
        <Card label="Outstanding total" value={d.outstanding_total} />
        <Card label="Outstanding invoices" value={String(d.outstanding_count)} />
      </div>
    </div>
  );
}
