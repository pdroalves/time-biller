import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Invoice } from "../types";

export function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const load = () => api.getInvoice(Number(id)).then(setInv);
  useEffect(() => {
    load();
  }, [id]);
  if (!inv) return <p className="loading">Loading…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link className="link-back" to="/invoices">
            ← Invoices
          </Link>
          <h1 style={{ marginTop: 6 }}>Invoice {inv.number}</h1>
          <div className="page-head__sub">
            <span className={"badge badge--" + inv.status}>{inv.status}</span>
          </div>
        </div>
        <a className="btn" href={api.invoicePdfUrl(inv.id)} target="_blank" rel="noreferrer">
          Download PDF
        </a>
      </div>

      <div className="toolbar">
        <span className="label" style={{ alignSelf: "center" }}>
          Mark as
        </span>
        {["invoiced", "sent", "paid"].map((s) => (
          <button
            key={s}
            className={"btn btn--sm" + (inv.status === s ? " btn--primary" : "")}
            disabled={inv.status === s}
            onClick={() => api.setInvoiceStatus(inv.id, s).then(load)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th className="t-right">Hours</th>
              <th className="t-right">Rate</th>
              <th className="t-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id}>
                <td className="num">{l.entry_date.slice(0, 10)}</td>
                <td>{l.description || <span className="muted">No description</span>}</td>
                <td className="t-right num">{l.hours}</td>
                <td className="t-right num">
                  {inv.currency_symbol}
                  {l.rate}
                </td>
                <td className="t-right num">
                  {inv.currency_symbol}
                  {l.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="totals">
        <span className="totals__label">Total</span>
        <span className="totals__value">
          {inv.currency_symbol}
          {inv.subtotal}
        </span>
      </div>
    </div>
  );
}
