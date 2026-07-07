import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Client, Project, TimeEntry } from "../types";
import { formatHMS, useTicker } from "../hooks/useElapsed";
import { IconPause, IconPlay, IconStop } from "../icons";

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
      <div className="page-head">
        <div>
          <div className="eyebrow">Track</div>
          <h1>Timer</h1>
        </div>
      </div>

      <div className="console">
        <div className="console__grid">
          <div className="field field--grow">
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
          <div className="field field--grow">
            <label className="label">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(Number(e.target.value) || "")}>
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field field--grow">
            <label className="label">What are you working on?</label>
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
            />
          </div>
          <button className="btn btn--live" onClick={start} disabled={projectId === ""}>
            <IconPlay /> Start
          </button>
        </div>
      </div>

      <h2 style={{ marginBottom: 14 }}>Active timers</h2>
      {running.length === 0 ? (
        <div className="empty">No timers running. Pick a project above and hit Start.</div>
      ) : (
        <div className="timer-list">
          {running.map((e) => {
            const isRunning = e.status === "running";
            return (
              <div
                key={e.id}
                className={"timer-item" + (isRunning ? " timer-item--running" : "")}
              >
                {isRunning && <span className="live-dot" />}
                <div>
                  <div className="timer-item__time num">{formatHMS(elapsedFor(e))}</div>
                  <div className="timer-item__desc">{e.description || "No description"}</div>
                </div>
                <span className={"badge badge--" + e.status}>{e.status}</span>
                <div className="timer-item__actions">
                  {isRunning ? (
                    <button className="btn btn--sm" onClick={() => api.pauseTimer(e.id).then(refresh)}>
                      <IconPause /> Pause
                    </button>
                  ) : (
                    <button className="btn btn--sm" onClick={() => api.resumeTimer(e.id).then(refresh)}>
                      <IconPlay /> Resume
                    </button>
                  )}
                  <button className="btn btn--sm btn--danger" onClick={() => api.stopTimer(e.id).then(refresh)}>
                    <IconStop /> Stop
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
