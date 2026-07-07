import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client, Project, TimeEntry } from "../types";
import { formatHMS } from "../hooks/useElapsed";

export function TimeEntries() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [billed, setBilled] = useState<"" | "billed" | "unbilled">("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [form, setForm] = useState({
    project_id: "",
    description: "",
    started_at: "",
    ended_at: "",
  });

  useEffect(() => {
    api.listClients().then(setClients);
  }, []);

  const load = () => {
    const q: Record<string, string | number | boolean> = {};
    if (clientId !== "") q.client_id = Number(clientId);
    if (billed !== "") q.billed = billed === "billed";
    api.listEntries(q).then(setEntries);
  };
  useEffect(load, [clientId, billed]);

  useEffect(() => {
    if (clientId !== "") api.listProjects(Number(clientId)).then(setProjects);
    else setProjects([]);
  }, [clientId]);

  const addManual = async () => {
    if (!form.project_id || !form.started_at || !form.ended_at) return;
    await api.createManualEntry({
      project_id: Number(form.project_id),
      description: form.description,
      started_at: new Date(form.started_at).toISOString(),
      ended_at: new Date(form.ended_at).toISOString(),
    });
    setForm({ project_id: "", description: "", started_at: "", ended_at: "" });
    load();
  };

  const startEdit = (e: TimeEntry) => {
    setEditingId(e.id);
    setEditText(e.description);
  };
  const saveEdit = async (id: number) => {
    await api.updateEntry(id, { description: editText });
    setEditingId(null);
    load();
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Review</div>
          <h1>Time entries</h1>
        </div>
      </div>

      <div className="toolbar">
        <div className="field">
          <select value={clientId} onChange={(e) => setClientId(Number(e.target.value) || "")}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <select value={billed} onChange={(e) => setBilled(e.target.value as "" | "billed" | "unbilled")}>
            <option value="">All entries</option>
            <option value="unbilled">Unbilled</option>
            <option value="billed">Billed</option>
          </select>
        </div>
      </div>

      <div className="panel">
        <div className="panel__title">Add manual entry</div>
        <div className="form-row">
          <div className="field field--grow">
            <label className="label">Project</label>
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            >
              <option value="">
                {clientId === "" ? "Pick a client first…" : "Select project…"}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field field--grow">
            <label className="label">Description</label>
            <input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">Start</label>
            <input
              type="datetime-local"
              value={form.started_at}
              onChange={(e) => setForm({ ...form, started_at: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">End</label>
            <input
              type="datetime-local"
              value={form.ended_at}
              onChange={(e) => setForm({ ...form, ended_at: e.target.value })}
            />
          </div>
          <button className="btn btn--primary" onClick={addManual}>
            Add entry
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty">No entries match these filters.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Description</th>
                <th>Status</th>
                <th className="t-right">Duration</th>
                <th>Billed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    {editingId === e.id ? (
                      <input value={editText} onChange={(ev) => setEditText(ev.target.value)} />
                    ) : (
                      e.description || <span className="muted">No description</span>
                    )}
                  </td>
                  <td>
                    <span className={"badge badge--" + e.status}>{e.status}</span>
                  </td>
                  <td className="t-right num">{formatHMS(e.duration_seconds)}</td>
                  <td>
                    {e.invoice_id ? (
                      <span className="badge badge--invoiced">Billed</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="t-actions">
                    {editingId === e.id ? (
                      <>
                        <button className="btn btn--sm btn--primary" onClick={() => saveEdit(e.id)}>
                          Save
                        </button>
                        <button className="btn btn--sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--sm" disabled={!!e.invoice_id} onClick={() => startEdit(e)}>
                          Edit
                        </button>
                        <button
                          className="btn btn--sm btn--danger"
                          disabled={!!e.invoice_id}
                          onClick={() => api.deleteEntry(e.id).then(load)}
                        >
                          Delete
                        </button>
                      </>
                    )}
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
