/**
 * ProtectedRoute decides, in one component, whether a worker sees a page, a
 * spinner, an error, or a login redirect. Every one of those four outcomes is
 * security-relevant: the wrong default exposes a screen to an unauthenticated
 * visitor, and the "right" default that renders a blank page is its own bug.
 *
 * useAuth is mocked rather than driven through a real AuthContext: this is a
 * test of the branch logic, and a fake context keeps the four states explicit.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const useAuth = vi.fn();
const refreshMe = vi.fn();

vi.mock("../store/AuthContext", () => ({
  useAuth: () => useAuth(),
}));

// The component asks for t("common.loading") / t("common.error") /
// t("common.retry"); echo the key so the assertions are stable regardless of
// which locale is loaded.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ProtectedRoute } from "./ProtectedRoute";

function setAuth(state: Partial<ReturnType<typeof useAuth>>) {
  useAuth.mockReturnValue({
    worker: null,
    loading: false,
    bootError: null,
    refreshMe,
    ...state,
  });
}

beforeEach(() => {
  useAuth.mockReset();
  refreshMe.mockReset();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/worker/login" element={<p>login page</p>} />
        <Route
          path="/grievances"
          element={
            <ProtectedRoute>
              <p>grievances content</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("shows a loading state and NOT the page while auth is resolving", () => {
    setAuth({ loading: true });
    renderAt("/grievances");
    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByText("grievances content")).not.toBeInTheDocument();
  });

  it("redirects an anonymous visitor to the worker login", () => {
    setAuth({});
    renderAt("/grievances");
    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("grievances content")).not.toBeInTheDocument();
  });

  it("renders the page for an authenticated worker", () => {
    setAuth({ worker: { id: "w1" } });
    renderAt("/grievances");
    expect(screen.getByText("grievances content")).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("shows the retry error when boot failed and there is no worker", () => {
    setAuth({ bootError: new Error("network down") });
    renderAt("/grievances");
    expect(screen.getByText("common.error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.retry" })).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("calls refreshMe when the worker taps retry", async () => {
    setAuth({ bootError: new Error("network down") });
    const user = userEvent.setup();
    renderAt("/grievances");
    await user.click(screen.getByRole("button", { name: "common.retry" }));
    expect(refreshMe).toHaveBeenCalledTimes(1);
  });

  it("ignores bootError once a worker is present (stale error, live session)", () => {
    // Guards against a half-refreshed context locking a signed-in worker out of
    // their own screen.
    setAuth({ worker: { id: "w1" }, bootError: new Error("stale") });
    renderAt("/grievances");
    expect(screen.getByText("grievances content")).toBeInTheDocument();
  });

  it("prefers the loading state over the error state", () => {
    setAuth({ loading: true, bootError: new Error("network down") });
    renderAt("/grievances");
    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByText("common.error")).not.toBeInTheDocument();
  });
});