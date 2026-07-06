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
      <h1>Time entries</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={clientId} onChange={(e) => setClientId(Number(e.target.value) || "")}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={billed} onChange={(e) => setBilled(e.target.value as "" | "billed" | "unbilled")}>
          <option value="">All</option>
          <option value="unbilled">Unbilled</option>
          <option value="billed">Billed</option>
        </select>
      </div>

      <fieldset style={{ margin: "16px 0" }}>
        <legend>Manual entry</legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
          >
            <option value="">Project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            type="datetime-local"
            value={form.started_at}
            onChange={(e) => setForm({ ...form, started_at: e.target.value })}
          />
          <input
            type="datetime-local"
            value={form.ended_at}
            onChange={(e) => setForm({ ...form, ended_at: e.target.value })}
          />
          <button onClick={addManual}>Add</button>
        </div>
      </fieldset>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Description</th>
            <th align="left">Status</th>
            <th align="right">Duration</th>
            <th align="left">Billed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} style={{ borderTop: "1px solid #eee" }}>
              <td>
                {editingId === e.id ? (
                  <input value={editText} onChange={(ev) => setEditText(ev.target.value)} />
                ) : (
                  e.description || <em>(no description)</em>
                )}
              </td>
              <td>{e.status}</td>
              <td align="right" style={{ fontFamily: "monospace" }}>
                {formatHMS(e.duration_seconds)}
              </td>
              <td>{e.invoice_id ? "Yes" : "No"}</td>
              <td align="right" style={{ whiteSpace: "nowrap" }}>
                {editingId === e.id ? (
                  <>
                    <button onClick={() => saveEdit(e.id)}>Save</button>
                    <button onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button disabled={!!e.invoice_id} onClick={() => startEdit(e)}>
                      Edit
                    </button>
                    <button disabled={!!e.invoice_id} onClick={() => api.deleteEntry(e.id).then(load)}>
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
  );
}
