import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Settings } from "../types";

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.getSettings().then(setS);
  }, []);
  if (!s) return <p className="loading">Loading…</p>;

  const upd = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const save = async () => {
    await api.updateSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Configure</div>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="panel">
        <div className="panel__title">Business details</div>
        <div className="form-grid">
          <div className="field">
            <label className="label">Business name</label>
            <input value={s.business_name} onChange={(e) => upd({ business_name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Business address</label>
            <textarea value={s.business_address} onChange={(e) => upd({ business_address: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Invoice notes</label>
            <textarea value={s.invoice_notes} onChange={(e) => upd({ invoice_notes: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__title">Invoicing</div>
        <div className="form-grid">
          <div className="form-row">
            <div className="field field--grow">
              <label className="label">Currency symbol</label>
              <input value={s.currency_symbol} onChange={(e) => upd({ currency_symbol: e.target.value })} />
            </div>
            <div className="field field--grow">
              <label className="label">Invoice prefix</label>
              <input value={s.invoice_number_prefix} onChange={(e) => upd({ invoice_number_prefix: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="field field--grow">
              <label className="label">Rounding increment (minutes)</label>
              <input
                type="number"
                value={s.rounding_increment_minutes}
                onChange={(e) => upd({ rounding_increment_minutes: Number(e.target.value) })}
              />
            </div>
            <div className="field field--grow">
              <label className="label">Default due days</label>
              <input
                type="number"
                value={s.default_due_days}
                onChange={(e) => upd({ default_due_days: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn btn--primary" onClick={save}>
          Save changes
        </button>
        {saved && <span className="saved-flag">Saved</span>}
      </div>
    </div>
  );
}
