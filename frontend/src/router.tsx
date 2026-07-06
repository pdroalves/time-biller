import { createBrowserRouter } from "react-router-dom";
import { App } from "./App";
import { Dashboard } from "./pages/Dashboard";
import { Clients } from "./pages/Clients";
import { Projects } from "./pages/Projects";
import { Timer } from "./pages/Timer";
import { TimeEntries } from "./pages/TimeEntries";
import { Invoices } from "./pages/Invoices";
import { InvoiceDetail } from "./pages/InvoiceDetail";
import { SettingsPage } from "./pages/Settings";

export const router = createBrowserRouter([
  { path: "/", element: <App />, children: [
    { index: true, element: <Dashboard /> },
    { path: "clients", element: <Clients /> },
    { path: "projects", element: <Projects /> },
    { path: "timer", element: <Timer /> },
    { path: "entries", element: <TimeEntries /> },
    { path: "invoices", element: <Invoices /> },
    { path: "invoices/:id", element: <InvoiceDetail /> },
    { path: "settings", element: <SettingsPage /> },
  ]},
]);
