import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { Invoices } from "../pages/Invoices";
import { api } from "../api/client";

vi.mock("../api/client");

beforeEach(() => {
  (api.listClients as any).mockResolvedValue([{ id: 1, name: "Acme",
    contact: "", default_hourly_rate: "100", archived: false }]);
  (api.listInvoices as any).mockResolvedValue([]);
  (api.createInvoice as any).mockResolvedValue({ id: 5, number: "INV-0001" });
});

test("creates an invoice from client and date range", async () => {
  render(<MemoryRouter><Invoices /></MemoryRouter>);
  await screen.findByText("Acme");
  await userEvent.selectOptions(screen.getByLabelText(/client/i), "1");
  await userEvent.type(screen.getByLabelText(/from/i), "2026-07-01");
  await userEvent.type(screen.getByLabelText(/to/i), "2026-07-31");
  await userEvent.click(screen.getByRole("button", { name: /create invoice/i }));
  await waitFor(() => expect(api.createInvoice).toHaveBeenCalledWith(
    expect.objectContaining({ client_id: 1 })));
});
