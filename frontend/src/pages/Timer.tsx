import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Client, Project, TimeEntry } from "../types";
import { formatHMS, useTicker } from "../hooks/useElapsed";

export function Timer() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState<TimeEntry[]>([]);
  const fetchedAt = useRef<number>(Date.now());
  useTicker(running.some((e) => e.status === "running"));

  const refresh = () => {
    fetchedAt.current = Date.now();
    return api.listRunning().then(setRunning);
  };

  useEffect(() => {
    api.listClients().then((cs) => {
      setClients(cs);
      if (cs.length > 0) setClientId((prev) => (prev === "" ? cs[0].id : prev));
    });
    refresh();
  }, []);

  useEffect(() => {
    if (clientId === "") {
      setProjects([]);
      setProjectId("");
      return;
    }
    api.listProjects(Number(clientId)).then((ps) => {
      setProjects(ps);
      setProjectId(ps.length > 0 ? ps[0].id : "");
    });
  }, [clientId]);

  useEffect(() => {
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const elapsedFor = (e: TimeEntry) => {
    if (e.status !== "running") return e.duration_seconds;
    return e.duration_seconds + Math.floor((Date.now() - fetchedAt.current) / 1000);
  };

  const start = async () => {
    if (projectId === "") return;
    await api.startTimer(Number(projectId), description);
    setDescription("");
    refresh();
  };

  return (
    <div>
      <h1>Timer</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select
          value={clientId}
          onChange={(e) => setClientId(Number(e.target.value) || "")}
        >
          <option value="">Client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={projectId}
          onChange={(e) => setProjectId(Number(e.target.value) || "")}
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button onClick={start} disabled={projectId === ""}>
          Start
        </button>
      </div>
      <h2>Running</h2>
      {running.length === 0 && <p>No active timers.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {running.map((e) => (
          <li
            key={e.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <strong style={{ fontFamily: "monospace" }}>{formatHMS(elapsedFor(e))}</strong>
            <span>{e.description || "(no description)"}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {e.status === "running" ? (
                <button onClick={() => api.pauseTimer(e.id).then(refresh)}>Pause</button>
              ) : (
                <button onClick={() => api.resumeTimer(e.id).then(refresh)}>Resume</button>
              )}
              <button onClick={() => api.stopTimer(e.id).then(refresh)}>Stop</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
