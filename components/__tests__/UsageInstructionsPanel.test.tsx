/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { UsageInstructionsPanel, UsageInstructionsFormSection } from "../UsageInstructionsPanel";

const SNIPPET_ID = "snippet-1";
const TOKEN = "jwt-token";

const usage = {
  overview: "This snippet generates **JWT tokens** for authenticated users.",
  prerequisites: "- jsonwebtoken\n- Node.js 20+",
  setup: "1. Install dependencies\n2. Configure secret key\n3. Execute function",
  notes: "Expiration is configurable. See [docs](https://jwt.io).",
  inputExample: { language: "json", code: '{\n  "name": "John Doe",\n  "email": "john@example.com"\n}' },
  outputExample: { language: "json", code: '{\n  "success": true,\n  "message": "User created successfully"\n}' },
};

type FetchArgs = [string, RequestInit | undefined];
const fetchMock = jest.fn();

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

beforeEach(() => {
  fetchMock.mockReset();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  window.confirm = jest.fn(() => true);
});

const calls = () => fetchMock.mock.calls as FetchArgs[];
const writeCalls = () => calls().filter(([, init]) => init?.method === "PUT" || init?.method === "DELETE");

describe("UsageInstructionsPanel — display", () => {
  it("renders every section in a dedicated, labelled panel", () => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={usage} />);
    const panel = screen.getByRole("region", { name: "Usage Instructions" });

    expect(within(panel).getByRole("heading", { level: 3, name: "Usage Instructions" })).toBeInTheDocument();
    for (const name of ["Overview", "Prerequisites", "Setup Instructions", "Notes"]) {
      expect(within(panel).getByRole("heading", { level: 4, name })).toBeInTheDocument();
    }
    expect(within(panel).getByText("JWT tokens").tagName).toBe("STRONG");
    expect(within(screen.getByTestId("usage-section-prerequisites")).getAllByRole("listitem")).toHaveLength(2);
    expect(within(screen.getByTestId("usage-section-setup")).getByRole("list").tagName).toBe("OL");
    expect(within(panel).getByRole("link", { name: "docs" })).toHaveAttribute("href", "https://jwt.io/");
  });

  it("renders input and output examples separately, as text", () => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={usage} />);
    const input = screen.getByTestId("usage-input-example");
    const output = screen.getByTestId("usage-output-example");

    expect(input).not.toBe(output);
    expect(within(input).getByRole("heading", { name: /Input example/ })).toBeInTheDocument();
    expect(within(output).getByRole("heading", { name: /Output example/ })).toBeInTheDocument();
    expect(input.querySelector("pre code")!.textContent).toBe(usage.inputExample.code);
    expect(output.querySelector("pre code")!.textContent).toBe(usage.outputExample.code);
    expect(input.textContent).not.toContain("User created successfully");
  });

  it("keeps long lines scrollable and stacks examples on narrow screens", () => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={usage} />);
    const input = screen.getByTestId("usage-input-example");
    expect(input.querySelector("pre")).toHaveClass("overflow-x-auto");
    // One column by default; two only from the md breakpoint.
    const grid = input.parentElement!;
    expect(grid).toHaveClass("grid");
    expect(grid.className).toMatch(/\bmd:grid-cols-2\b/);
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-2\b/);
  });

  it("shows an empty state to viewers", () => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={null} />);
    expect(screen.getByTestId("usage-empty-state")).toHaveTextContent("No usage instructions yet.");
    expect(screen.getByTestId("usage-empty-state")).toHaveTextContent("hasn't documented");
    expect(screen.queryByRole("button", { name: /instructions/i })).not.toBeInTheDocument();
  });

  it("treats malformed stored data as empty instead of crashing", () => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={"{broken"} />);
    expect(screen.getByTestId("usage-empty-state")).toBeInTheDocument();
  });

  it("renders injected HTML as inert text", () => {
    const evil = { overview: '<img src=x onerror="window.__x=1"><script>window.__x=1</script>' };
    const { container } = render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={evil} />);
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByTestId("usage-section-overview")).toHaveTextContent("<script>");
  });
});

describe("UsageInstructionsPanel — who can edit", () => {
  it("offers Add to the owner when there are no instructions", () => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={null} isOwner token={TOKEN} />);
    expect(screen.getByRole("button", { name: "Add instructions" })).toBeInTheDocument();
    expect(screen.getByTestId("usage-empty-state")).toHaveTextContent("Explain what this snippet does");
    expect(fetchMock).not.toHaveBeenCalled(); // owner needs no permission round trip
  });

  it("asks the server whether a non-owner may edit, and offers Edit to a collaborator", async () => {
    fetchMock.mockReturnValue(json({ canEdit: true }));
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={usage} token={TOKEN} />);
    expect(await screen.findByRole("button", { name: "Edit instructions" })).toBeInTheDocument();
    const [url, init] = calls()[0];
    expect(url).toBe(`/api/snippets/${SNIPPET_ID}/usage`);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("offers no edit control to someone the server refuses", async () => {
    fetchMock.mockReturnValue(json({ canEdit: false }));
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={usage} token={TOKEN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Checking edit access")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /instructions/i })).not.toBeInTheDocument();
  });

  it("offers no edit control, and makes no request, when signed out", () => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={usage} />);
    expect(screen.queryByRole("button", { name: /instructions/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("UsageInstructionsPanel — editing", () => {
  const openEditor = (u: unknown = usage, onChange = jest.fn()) => {
    render(<UsageInstructionsPanel snippetId={SNIPPET_ID} usage={u} isOwner token={TOKEN} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: u ? "Edit instructions" : "Add instructions" }));
    return onChange;
  };

  it("creates instructions and shows them immediately after saving", async () => {
    const saved = { overview: "Fresh overview", updatedAt: "2026-10-19T10:00:00.000Z" };
    fetchMock.mockReturnValue(json({ usage_instructions: saved }));
    const onChange = openEditor(null);

    fireEvent.change(screen.getByLabelText("Overview"), { target: { value: "Fresh overview" } });
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));

    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "Edit usage instructions" })).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("usage-section-overview")).toHaveTextContent("Fresh overview");
    const [url, init] = writeCalls()[0];
    expect(url).toBe(`/api/snippets/${SNIPPET_ID}/usage`);
    expect(init?.method).toBe("PUT");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init!.body as string).overview).toBe("Fresh overview");
    expect(onChange).toHaveBeenCalledWith(saved);
  });

  it("prefills the editor with existing instructions, preserving formatting", () => {
    openEditor();
    expect(screen.getByLabelText("Setup Instructions")).toHaveValue(usage.setup);
    expect(screen.getByLabelText("Input example code")).toHaveValue(usage.inputExample.code);
    expect(screen.getByLabelText("Output example code")).toHaveValue(usage.outputExample.code);
  });

  it("sends input and output examples as separate fields", async () => {
    fetchMock.mockReturnValue(json({ usage_instructions: usage }));
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    await waitFor(() => expect(writeCalls()).toHaveLength(1));
    const body = JSON.parse(writeCalls()[0][1]!.body as string);
    expect(body.inputExample).toEqual(usage.inputExample);
    expect(body.outputExample).toEqual(usage.outputExample);
  });

  it("validates before sending: an empty document is refused with a message", async () => {
    openEditor(null);
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least one section/i);
    expect(writeCalls()).toHaveLength(0);
  });

  it("marks the offending field invalid and links its error message", async () => {
    fetchMock.mockReturnValue(json({ error: "Validation failed", fields: { overview: "Too long" } }, 400));
    openEditor(null);
    const overview = screen.getByLabelText("Overview");
    fireEvent.change(overview, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    await waitFor(() => expect(overview).toHaveAttribute("aria-invalid", "true"));
    const describedBy = overview.getAttribute("aria-describedby")!;
    expect(describedBy.split(" ").some((id) => document.getElementById(id)?.textContent === "Too long")).toBe(true);
  });

  it.each([
    [401, /session has expired/i],
    [403, /don't have permission/i],
    [500, /something went wrong|failed/i],
  ])("shows a clear error for HTTP %i and stays in the editor", async (status, message) => {
    // The bodies the real route sends for each status.
    const bodies: Record<number, unknown> = {
      401: { error: "Unauthorized" },
      403: { error: "Forbidden" },
      500: { error: "Failed to save usage instructions" },
    };
    fetchMock.mockReturnValue(json(bodies[status], status));
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Overview")).toBeInTheDocument();
  });

  it("shows a network error and stays in the editor", async () => {
    fetchMock.mockReturnValue(Promise.reject(new TypeError("Failed to fetch")));
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/network error/i);
  });

  it("disables the form and shows progress while saving", async () => {
    let resolve!: (v: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByLabelText("Overview")).toBeDisabled();
    resolve({ ok: true, status: 200, json: async () => ({ usage_instructions: usage }) } as Response);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving…" })).not.toBeInTheDocument());
  });

  it("deletes instructions after confirmation and shows the empty state", async () => {
    fetchMock.mockReturnValue(json({ usage_instructions: null }));
    const onChange = openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete instructions" }));
    expect(await screen.findByTestId("usage-empty-state")).toBeInTheDocument();
    expect(writeCalls()[0][1]?.method).toBe("DELETE");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does nothing when the delete is not confirmed", () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Delete instructions" }));
    expect(writeCalls()).toHaveLength(0);
  });

  it("previews formatting before saving", () => {
    openEditor(null);
    fireEvent.change(screen.getByLabelText("Setup Instructions"), { target: { value: "1. One\n2. Two" } });
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("cancels without saving", () => {
    openEditor();
    fireEvent.change(screen.getByLabelText("Overview"), { target: { value: "discarded" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("discarded")).not.toBeInTheDocument();
    expect(writeCalls()).toHaveLength(0);
  });

  it("labels every field for assistive technology", () => {
    openEditor();
    for (const label of ["Overview", "Prerequisites", "Setup Instructions", "Notes", "Input example code", "Output example code"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByLabelText("Language")).toHaveLength(2);
    expect(screen.getByRole("tablist", { name: "Editor mode" })).toBeInTheDocument();
  });
});

describe("UsageInstructionsFormSection (snippet edit form)", () => {
  it("shows a loading state, then the editor prefilled from the snippet", async () => {
    fetchMock.mockReturnValue(json({ id: SNIPPET_ID, usage_instructions: usage }));
    render(<UsageInstructionsFormSection snippetId={SNIPPET_ID} token={TOKEN} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading usage instructions/i);
    expect(await screen.findByLabelText("Overview")).toHaveValue(usage.overview);
  });

  it("shows an error state with a working retry", async () => {
    fetchMock.mockReturnValueOnce(json({ error: "x" }, 500)).mockReturnValue(json({ usage_instructions: null }));
    render(<UsageInstructionsFormSection snippetId={SNIPPET_ID} token={TOKEN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Overview")).toHaveValue("");
  });

  it("confirms a save without leaving the form", async () => {
    fetchMock
      .mockReturnValueOnce(json({ usage_instructions: null }))
      .mockReturnValue(json({ usage_instructions: { overview: "Saved", updatedAt: "2026-10-19T10:00:00.000Z" } }));
    render(<UsageInstructionsFormSection snippetId={SNIPPET_ID} token={TOKEN} />);
    fireEvent.change(await screen.findByLabelText("Overview"), { target: { value: "Saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    expect(await screen.findByText(/^Saved \d/)).toBeInTheDocument();
    expect(screen.getByLabelText("Overview")).toHaveValue("Saved");
  });
});
