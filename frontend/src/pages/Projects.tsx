import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client, Project } from "../types";

export function Projects() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [override, setOverride] = useState("");

  useEffect(() => { api.listClients().then(setClients); }, []);
  const load = () => { if (clientId !== "") api.listProjects(Number(clientId)).then(setProjects); };
  useEffect(() => { load(); }, [clientId]);

  const add = async () => {
    if (clientId === "" || !name.trim()) return;
    await api.createProject({ client_id: Number(clientId), name,
      hourly_rate_override: override ? override : null });
    setName(""); setOverride(""); load();
  };

  return (
    <div>
      <h1>Projects</h1>
      <select value={clientId} onChange={(e) => setClientId(Number(e.target.value) || "")}>
        <option value="">Select client…</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {clientId !== "" && (
        <>
          <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
            <input placeholder="Project name" value={name}
              onChange={(e) => setName(e.target.value)} />
            <input placeholder="Rate override (optional)" type="number" value={override}
              onChange={(e) => setOverride(e.target.value)} />
            <button onClick={add}>Add project</button>
          </div>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>{p.name}
                {p.hourly_rate_override ? ` — ${p.hourly_rate_override}/h` : " (client rate)"}
                <button style={{ marginLeft: 8 }}
                  onClick={() => api.deleteProject(p.id).then(load)}>Delete</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
