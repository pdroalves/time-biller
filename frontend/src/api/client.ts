import type { Client, Dashboard, Invoice, Project, Settings, TimeEntry } from "../types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  });
  if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || resp.statusText);
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export const api = {
  getDashboard: () => req<Dashboard>("/dashboard"),
  listClients: (inclArchived = false) =>
    req<Client[]>(`/clients?include_archived=${inclArchived}`),
  createClient: (b: Partial<Client>) =>
    req<Client>("/clients", { method: "POST", body: JSON.stringify(b) }),
  updateClient: (id: number, b: Partial<Client>) =>
    req<Client>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteClient: (id: number) => req<void>(`/clients/${id}`, { method: "DELETE" }),
  listProjects: (clientId?: number) =>
    req<Project[]>(`/projects${clientId ? `?client_id=${clientId}` : ""}`),
  createProject: (b: Partial<Project>) =>
    req<Project>("/projects", { method: "POST", body: JSON.stringify(b) }),
  updateProject: (id: number, b: Partial<Project>) =>
    req<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteProject: (id: number) => req<void>(`/projects/${id}`, { method: "DELETE" }),
  startTimer: (project_id: number, description = "") =>
    req<TimeEntry>("/time-entries/start", { method: "POST",
      body: JSON.stringify({ project_id, description }) }),
  pauseTimer: (id: number) => req<TimeEntry>(`/time-entries/${id}/pause`, { method: "POST" }),
  resumeTimer: (id: number) => req<TimeEntry>(`/time-entries/${id}/resume`, { method: "POST" }),
  stopTimer: (id: number) => req<TimeEntry>(`/time-entries/${id}/stop`, { method: "POST" }),
  createManualEntry: (b: { project_id: number; description?: string;
    started_at: string; ended_at: string }) =>
    req<TimeEntry>("/time-entries/manual", { method: "POST", body: JSON.stringify(b) }),
  listEntries: (q: Record<string, string | number | boolean> = {}) =>
    req<TimeEntry[]>(`/time-entries?${new URLSearchParams(
      Object.entries(q).map(([k, v]) => [k, String(v)])).toString()}`),
  listRunning: () => req<TimeEntry[]>("/time-entries/running"),
  updateEntry: (id: number, b: { description?: string; project_id?: number }) =>
    req<TimeEntry>(`/time-entries/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  updateSegment: (id: number, segId: number,
    b: { started_at: string; ended_at: string | null }) =>
    req<TimeEntry>(`/time-entries/${id}/segments/${segId}`, { method: "PUT",
      body: JSON.stringify(b) }),
  deleteEntry: (id: number) => req<void>(`/time-entries/${id}`, { method: "DELETE" }),
  listInvoices: () => req<Invoice[]>("/invoices"),
  getInvoice: (id: number) => req<Invoice>(`/invoices/${id}`),
  createInvoice: (b: { client_id: number; period_start: string; period_end: string }) =>
    req<Invoice>("/invoices", { method: "POST", body: JSON.stringify(b) }),
  setInvoiceStatus: (id: number, status: string) =>
    req<Invoice>(`/invoices/${id}/status`, { method: "PUT",
      body: JSON.stringify({ status }) }),
  deleteInvoice: (id: number) => req<void>(`/invoices/${id}`, { method: "DELETE" }),
  invoicePdfUrl: (id: number) => `/api/invoices/${id}/pdf`,
  getSettings: () => req<Settings>("/settings"),
  updateSettings: (b: Partial<Settings>) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify(b) }),
};
