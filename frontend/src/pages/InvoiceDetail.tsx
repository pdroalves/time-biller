import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Invoice } from "../types";

export function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const load = () => api.getInvoice(Number(id)).then(setInv);
  useEffect(() => {
    load();
  }, [id]);
  if (!inv) return <p>Loading…</p>;

  return (
    <div>
      <h1>Invoice {inv.number}</h1>
      <p>
        Status: <strong>{inv.status}</strong>
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["invoiced", "sent", "paid"].map((s) => (
          <button
            key={s}
            disabled={inv.status === s}
            onClick={() => api.setInvoiceStatus(inv.id, s).then(load)}
          >
            Mark {s}
          </button>
        ))}
        <a href={api.invoicePdfUrl(inv.id)} target="_blank" rel="noreferrer">
          Download PDF
        </a>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Date</th>
            <th align="left">Description</th>
            <th align="right">Hours</th>
            <th align="right">Rate</th>
            <th align="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.entry_date.slice(0, 10)}</td>
              <td>{l.description}</td>
              <td align="right">{l.hours}</td>
              <td align="right">
                {inv.currency_symbol}
                {l.rate}
              </td>
              <td align="right">
                {inv.currency_symbol}
                {l.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 style={{ textAlign: "right" }}>
        Total: {inv.currency_symbol}
        {inv.subtotal}
      </h2>
    </div>
  );
}
