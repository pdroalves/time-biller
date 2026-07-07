import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Client, Invoice } from "../types";

export function Invoices() {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  const load = () => api.listInvoices().then(setInvoices);
  useEffect(() => {
    api.listClients().then(setClients);
    load();
  }, []);

  const create = async () => {
    setError("");
    if (!clientId || !from || !to) return;
    try {
      await api.createInvoice({
        client_id: Number(clientId),
        period_start: new Date(from + "T00:00:00").toISOString(),
        period_end: new Date(to + "T23:59:59").toISOString(),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Bill</div>
          <h1>Invoices</h1>
        </div>
      </div>

      <div className="panel">
        <div className="panel__title">New invoice from tracked time</div>
        <div className="form-row">
          <div className="field field--grow">
            <label className="label" htmlFor="inv-client">
              Client
            </label>
            <select id="inv-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="inv-from">
              From
            </label>
            <input id="inv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="inv-to">
              To
            </label>
            <input id="inv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn--primary" onClick={create}>
            Create invoice
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>}
      </div>

      {invoices.length === 0 ? (
        <div className="empty">No invoices yet. Generate one from a client's tracked hours above.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Number</th>
                <th>Status</th>
                <th className="t-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link to={`/invoices/${i.id}`}>{i.number}</Link>
                  </td>
                  <td>
                    <span className={"badge badge--" + i.status}>{i.status}</span>
                  </td>
                  <td className="t-right num">
                    {i.currency_symbol}
                    {i.subtotal}
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
