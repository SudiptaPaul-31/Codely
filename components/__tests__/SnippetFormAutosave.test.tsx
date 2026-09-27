/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import SnippetForm from "../SnippetForm";

// Mock sonner toast
jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock next/navigation if needed by dependencies
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/snippets",
}));

describe("SnippetForm Autosave", () => {
  const mockOnSuccess = jest.fn().mockResolvedValue(undefined);
  const mockCloseForm = jest.fn();

  const initialValues = {
    title: "My Snippet",
    description: "A test snippet",
    code: "console.log('hello')",
    language: "javascript",
    tags: "test, snippet",
    licenseType: "None",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders autosave status indicator when editing", () => {
    render(
      <SnippetForm
        editingId="snippet-1"
        initialValues={initialValues}
        closeForm={mockCloseForm}
        onSuccess={mockOnSuccess}
      />,
    );

    // Status indicator should be present when editing
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not render autosave status when creating a new snippet", () => {
    render(
      <SnippetForm
        editingId={null}
        initialValues={initialValues}
        closeForm={mockCloseForm}
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("debounces autosave calls and saves changes", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "snippet-1", updated_at: "2024-01-01T00:00:00Z" }),
    });
    (global.fetch as jest.Mock) = mockFetch;

    render(
      <SnippetForm
        editingId="snippet-1"
        initialValues={initialValues}
        closeForm={mockCloseForm}
        onSuccess={mockOnSuccess}
      />,
    );

    // Change the code field
    const codeTextarea = screen.getByLabelText("Code");
    fireEvent.change(codeTextarea, { target: { value: "console.log('updated')" } });

    // Advance time past the debounce delay
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    // Autosave should have been called with PUT
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/snippets/snippet-1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );

    // Status should show saved
    await waitFor(() => {
      expect(screen.getByText(/Saved/i)).toBeInTheDocument();
    });
  });

  it("does not autosave when nothing has changed", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "snippet-1", updated_at: "2024-01-01T00:00:00Z" }),
    });
    (global.fetch as jest.Mock) = mockFetch;

    render(
      <SnippetForm
        editingId="snippet-1"
        initialValues={initialValues}
        closeForm={mockCloseForm}
        onSuccess={mockOnSuccess}
      />,
    );

    // Advance time without making changes
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // No autosave should have been triggered
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles autosave failure gracefully and retries", async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "snippet-1", updated_at: "2024-01-01T00:00:00Z" }),
      });
    (global.fetch as jest.Mock) = mockFetch;

    render(
      <SnippetForm
        editingId="snippet-1"
        initialValues={initialValues}
        closeForm={mockCloseForm}
        onSuccess={mockOnSuccess}
      />,
    );

    // Change the code field
    const codeTextarea = screen.getByLabelText("Code");
    fireEvent.change(codeTextarea, { target: { value: "console.log('retry test')" } });

    // First autosave attempt fails
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    // Error status should be shown
    await waitFor(() => {
      expect(screen.getByText(/Autosave failed/i)).toBeInTheDocument();
    });

    // Retry should happen after retry delay
    await act(async () => {
      jest.advanceTimersByTime(5500);
    });

    // Second attempt should succeed
    await waitFor(() => {
      expect(screen.getByText(/Saved/i)).toBeInTheDocument();
    });

    // Fetch should have been called twice (initial + retry)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends If-Unmodified-Since header for conflict detection", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "snippet-1", updated_at: "2024-01-01T00:00:00Z" }),
    });
    (global.fetch as jest.Mock) = mockFetch;

    render(
      <SnippetForm
        editingId="snippet-1"
        initialValues={initialValues}
        closeForm={mockCloseForm}
        onSuccess={mockOnSuccess}
      />,
    );

    // Change the code field
    const codeTextarea = screen.getByLabelText("Code");
    fireEvent.change(codeTextarea, { target: { value: "console.log('conflict test')" } });

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    // First call should not have If-Unmodified-Since (no prior server timestamp)
    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[1].headers).not.toHaveProperty("If-Unmodified-Since");

    // Change again to trigger a second autosave
    fireEvent.change(codeTextarea, { target: { value: "console.log('second change')" } });

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    // Second call should include If-Unmodified-Since from the first response
    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[1].headers["If-Unmodified-Since"]).toBe("2024-01-01T00:00:00Z");
  });

  it("does not block manual save when autosave is active", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "snippet-1", updated_at: "2024-01-01T00:00:00Z" }),
    });
    (global.fetch as jest.Mock) = mockFetch;

    render(
      <SnippetForm
        editingId="snippet-1"
        initialValues={initialValues}
        closeForm={mockCloseForm}
        onSuccess={mockOnSuccess}
      />,
    );

    // Change the code field
    const codeTextarea = screen.getByLabelText("Code");
    fireEvent.change(codeTextarea, { target: { value: "console.log('manual save')" } });

    // Click the manual save button
    const saveButton = screen.getByRole("button", { name: /Update Snippet/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockCloseForm).toHaveBeenCalled();
    });

    // Manual save should have been called
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/snippets/snippet-1",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
