import { NavLink, Outlet } from "react-router-dom";
import {
  IconDashboard,
  IconFolder,
  IconInvoice,
  IconList,
  IconSettings,
  IconStopwatch,
  IconTimer,
  IconUsers,
} from "./icons";

const links = [
  { to: "/", label: "Dashboard", Icon: IconDashboard, end: true },
  { to: "/timer", label: "Timer", Icon: IconTimer, end: false },
  { to: "/entries", label: "Entries", Icon: IconList, end: false },
  { to: "/clients", label: "Clients", Icon: IconUsers, end: false },
  { to: "/projects", label: "Projects", Icon: IconFolder, end: false },
  { to: "/invoices", label: "Invoices", Icon: IconInvoice, end: false },
  { to: "/settings", label: "Settings", Icon: IconSettings, end: false },
];

export function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">
            <IconStopwatch />
          </span>
          <span className="brand__name">
            Time-Biller
            <small>bill by the hour</small>
          </span>
        </div>
        <nav className="nav">
          {links.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => "nav__link" + (isActive ? " is-active" : "")}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">Local · single-user</div>
      </aside>
      <main className="content">
        <div className="content__inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
