/**
 * PageFallback is the accessibility contract for every lazy-loaded page (16 of
 * them since the code-split). Its own docstring states the intent: announce the
 * load with role="status" rather than landing a screen reader on an empty
 * document. These tests pin that contract, because the failure mode is silent —
 * removing the role breaks nobody's build and every screen-reader user.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageFallback } from "./PageFallback";

describe("PageFallback", () => {
  it("exposes a live status region", () => {
    render(<PageFallback />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("is polite, not assertive — a page chunk loading must not interrupt", () => {
    render(<PageFallback />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("shows a visible loading label as well as the live region", () => {
    // A live region with no text announces nothing, which would defeat the point.
    render(<PageFallback />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("hides the animated spinner from assistive tech", () => {
    const { container } = render(<PageFallback />);
    const spinner = container.querySelector("div[aria-hidden='true']");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveClass("animate-spin");
  });
});