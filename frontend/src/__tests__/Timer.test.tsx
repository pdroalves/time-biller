import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { Timer } from "../pages/Timer";
import { api } from "../api/client";

vi.mock("../api/client");

beforeEach(() => {
  (api.listClients as any).mockResolvedValue([{ id: 1, name: "Acme",
    contact: "", default_hourly_rate: "100", archived: false }]);
  (api.listProjects as any).mockResolvedValue([{ id: 2, client_id: 1,
    name: "Web", hourly_rate_override: null, archived: false }]);
  (api.listRunning as any).mockResolvedValue([]);
  (api.startTimer as any).mockResolvedValue({ id: 9, project_id: 2,
    description: "x", status: "running", invoice_id: null, segments: [],
    duration_seconds: 0 });
});

test("starts a timer for a selected project", async () => {
  render(<Timer />);
  await screen.findByText("Web");
  await userEvent.click(screen.getByRole("button", { name: /start/i }));
  await waitFor(() => expect(api.startTimer).toHaveBeenCalledWith(2, ""));
});
