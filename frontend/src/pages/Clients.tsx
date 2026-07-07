import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client, Settings } from "../types";

export function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [rate, setRate] = useState("0");

  const load = () => api.listClients().then(setClients);
  useEffect(() => {
    load();
    api.getSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const add = async () => {
    if (!name.trim()) return;
    await api.createClient({ name, contact, default_hourly_rate: rate });
    setName("");
    setContact("");
    setRate("0");
    load();
  };

  const cur = settings?.currency_symbol ?? "";

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">People</div>
          <h1>Clients</h1>
        </div>
      </div>

      <div className="panel">
        <div className="panel__title">Add client</div>
        <div className="form-row">
          <div className="field field--grow">
            <label className="label">Name</label>
            <input placeholder="Acme Inc." value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field field--grow">
            <label className="label">Contact</label>
            <input placeholder="name@acme.com" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Default rate</label>
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <button className="btn btn--primary" onClick={add}>
            Add client
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="empty">No clients yet. Add your first one above.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th className="t-right">Rate / hr</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="muted">{c.contact || "—"}</td>
                  <td className="t-right num">
                    {cur}
                    {c.default_hourly_rate}
                  </td>
                  <td className="t-actions">
                    <button className="btn btn--sm btn--danger" onClick={() => api.deleteClient(c.id).then(load)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
