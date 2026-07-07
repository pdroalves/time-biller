import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client, Project, Settings } from "../types";

export function Projects() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [override, setOverride] = useState("");

  useEffect(() => {
    api.listClients().then(setClients);
    api.getSettings().then(setSettings).catch(() => setSettings(null));
  }, []);
  const load = () => {
    if (clientId !== "") api.listProjects(Number(clientId)).then(setProjects);
  };
  useEffect(load, [clientId]);

  const add = async () => {
    if (clientId === "" || !name.trim()) return;
    await api.createProject({
      client_id: Number(clientId),
      name,
      hourly_rate_override: override ? override : null,
    });
    setName("");
    setOverride("");
    load();
  };

  const cur = settings?.currency_symbol ?? "";

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Work</div>
          <h1>Projects</h1>
        </div>
      </div>

      <div className="toolbar">
        <div className="field field--grow" style={{ maxWidth: 320 }}>
          <label className="label">Client</label>
          <select value={clientId} onChange={(e) => setClientId(Number(e.target.value) || "")}>
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {clientId === "" ? (
        <div className="empty">Choose a client to see and add their projects.</div>
      ) : (
        <>
          <div className="panel">
            <div className="panel__title">Add project</div>
            <div className="form-row">
              <div className="field field--grow">
                <label className="label">Project name</label>
                <input placeholder="Website redesign" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Rate override</label>
                <input
                  type="number"
                  placeholder="client rate"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                />
              </div>
              <button className="btn btn--primary" onClick={add}>
                Add project
              </button>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="empty">No projects for this client yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="t-right">Rate / hr</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="t-right num">
                        {p.hourly_rate_override ? (
                          `${cur}${p.hourly_rate_override}`
                        ) : (
                          <span className="muted">client rate</span>
                        )}
                      </td>
                      <td className="t-actions">
                        <button className="btn btn--sm btn--danger" onClick={() => api.deleteProject(p.id).then(load)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
