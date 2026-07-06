export interface Client { id: number; name: string; contact: string;
  default_hourly_rate: string; archived: boolean; }
export interface Project { id: number; client_id: number; name: string;
  hourly_rate_override: string | null; archived: boolean; }
export interface Segment { id: number; started_at: string; ended_at: string | null; }
export interface TimeEntry { id: number; project_id: number; description: string;
  status: "running" | "paused" | "stopped"; invoice_id: number | null;
  segments: Segment[]; duration_seconds: number; }
export interface InvoiceLine { id: number; entry_date: string; description: string;
  hours: string; rate: string; amount: string; }
export interface Invoice { id: number; client_id: number; number: string;
  issue_date: string; due_date: string; period_start: string; period_end: string;
  status: "invoiced" | "sent" | "paid"; currency_symbol: string;
  business_name: string; business_address: string; notes: string;
  subtotal: string; lines: InvoiceLine[]; }
export interface Settings { business_name: string; business_address: string;
  logo_path: string; invoice_notes: string; currency_symbol: string;
  invoice_number_prefix: string; next_invoice_seq: number;
  rounding_increment_minutes: number; default_due_days: number; }
export interface Dashboard { unbilled_hours: string; unbilled_amount: string;
  outstanding_total: string; outstanding_count: number; }
