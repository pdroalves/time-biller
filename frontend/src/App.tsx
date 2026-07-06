import { NavLink, Outlet } from "react-router-dom";

const links = [["/", "Dashboard"], ["/timer", "Timer"], ["/entries", "Entries"],
  ["/clients", "Clients"], ["/projects", "Projects"], ["/invoices", "Invoices"],
  ["/settings", "Settings"]] as const;

export function App() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui" }}>
      <nav style={{ width: 180, background: "#111827", color: "#fff", padding: 16 }}>
        <h2 style={{ fontSize: 18 }}>Time-Biller</h2>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}
            style={({ isActive }) => ({ display: "block", padding: "8px 0",
              color: isActive ? "#60a5fa" : "#e5e7eb", textDecoration: "none" })}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 24 }}><Outlet /></main>
    </div>
  );
}
