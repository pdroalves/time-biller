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
      <h1>Invoices</h1>
      <fieldset style={{ marginBottom: 16 }}>
        <legend>New invoice</legend>
        <label>
          Client
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={create}>Create invoice</button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </fieldset>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Number</th>
            <th align="left">Status</th>
            <th align="right">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id}>
              <td>
                <Link to={`/invoices/${i.id}`}>{i.number}</Link>
              </td>
              <td>{i.status}</td>
              <td align="right">
                {i.currency_symbol}
                {i.subtotal}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
