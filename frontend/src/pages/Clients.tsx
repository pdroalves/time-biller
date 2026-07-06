import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client } from "../types";

export function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [rate, setRate] = useState("0");

  const load = () => api.listClients().then(setClients);
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    await api.createClient({ name, contact, default_hourly_rate: rate });
    setName(""); setContact(""); setRate("0"); load();
  };

  return (
    <div>
      <h1>Clients</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Contact" value={contact}
          onChange={(e) => setContact(e.target.value)} />
        <input placeholder="Rate" type="number" value={rate}
          onChange={(e) => setRate(e.target.value)} />
        <button onClick={add}>Add client</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Name</th><th align="left">Contact</th>
          <th align="right">Rate</th><th></th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td><td>{c.contact}</td>
              <td align="right">{c.default_hourly_rate}</td>
              <td align="right">
                <button onClick={() => api.deleteClient(c.id).then(load)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
