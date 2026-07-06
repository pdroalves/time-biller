import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Settings } from "../types";

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.getSettings().then(setS);
  }, []);
  if (!s) return <p>Loading…</p>;

  const upd = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const save = async () => {
    await api.updateSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <h1>Settings</h1>
      <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>
          Business name
          <input value={s.business_name} onChange={(e) => upd({ business_name: e.target.value })} />
        </label>
        <label>
          Business address
          <textarea
            value={s.business_address}
            onChange={(e) => upd({ business_address: e.target.value })}
          />
        </label>
        <label>
          Invoice notes
          <textarea
            value={s.invoice_notes}
            onChange={(e) => upd({ invoice_notes: e.target.value })}
          />
        </label>
        <label>
          Currency symbol
          <input
            value={s.currency_symbol}
            onChange={(e) => upd({ currency_symbol: e.target.value })}
          />
        </label>
        <label>
          Invoice prefix
          <input
            value={s.invoice_number_prefix}
            onChange={(e) => upd({ invoice_number_prefix: e.target.value })}
          />
        </label>
        <label>
          Rounding increment (min)
          <input
            type="number"
            value={s.rounding_increment_minutes}
            onChange={(e) => upd({ rounding_increment_minutes: Number(e.target.value) })}
          />
        </label>
        <label>
          Default due days
          <input
            type="number"
            value={s.default_due_days}
            onChange={(e) => upd({ default_due_days: Number(e.target.value) })}
          />
        </label>
        <button onClick={save}>Save</button>
        {saved && <span style={{ color: "green" }}>Saved</span>}
      </div>
    </div>
  );
}
