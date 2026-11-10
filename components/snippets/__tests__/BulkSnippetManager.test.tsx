/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  BulkSnippetManager,
  type BulkManagedFolder,
  type BulkManagedSnippet,
} from "../BulkSnippetManager";

const sampleFolders: BulkManagedFolder[] = [
  { id: "folder_auth", name: "Authentication", canWrite: true },
  { id: "folder_db", name: "Database Queries", canWrite: true },
  { id: "folder_readonly", name: "Team Archive", canWrite: false },
];

const sampleSnippets: BulkManagedSnippet[] = [
  {
    id: "snip_1",
    title: "JWT Token Verifier",
    language: "typescript",
    description: "Validates Stellar session tokens",
    folderId: null,
    canEdit: true,
    canDelete: true,
  },
  {
    id: "snip_2",
    title: "Postgres Pool Helper",
    language: "typescript",
    description: "Serverless connection pool setup",
    folderId: "folder_db",
    folderName: "Database Queries",
    canEdit: true,
    canDelete: true,
  },
  {
    id: "snip_3",
    title: "Read-Only Shared Snippet",
    language: "python",
    description: "Shared by another developer",
    folderId: null,
    canEdit: false,
    canDelete: false,
  },
];

describe("BulkSnippetManager", () => {
  it("supports single and multiple snippet selection, select-all, and counter updates", () => {
    render(
      <BulkSnippetManager snippets={sampleSnippets} folders={sampleFolders} />,
    );

    expect(screen.getByTestId("selected-item-counter")).toHaveTextContent(
      "0 selected",
    );
    expect(
      screen.queryByTestId("bulk-action-toolbar"),
    ).not.toBeInTheDocument();

    // Select a single snippet
    const cb1 = screen.getByRole("checkbox", {
      name: "Select JWT Token Verifier",
    });
    fireEvent.click(cb1);

    expect(cb1).toBeChecked();
    expect(screen.getByTestId("snippet-row-snip_1")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("selected-item-counter")).toHaveTextContent(
      "1 selected",
    );
    expect(screen.getByTestId("toolbar-selected-count")).toHaveTextContent(
      "1 snippet selected",
    );
    expect(screen.getByTestId("sr-selection-announcement")).toHaveTextContent(
      "1 snippet selected",
    );

    // Select a second snippet
    const cb2 = screen.getByRole("checkbox", {
      name: "Select Postgres Pool Helper",
    });
    fireEvent.click(cb2);
    expect(screen.getByTestId("toolbar-selected-count")).toHaveTextContent(
      "2 snippets selected",
    );

    // Select all snippets
    const selectAll = screen.getByRole("checkbox", {
      name: "Select all snippets",
    });
    fireEvent.click(selectAll);
    expect(screen.getByTestId("toolbar-selected-count")).toHaveTextContent(
      "3 snippets selected",
    );

    // Clear selection via toolbar
    fireEvent.click(screen.getByRole("button", { name: "Clear Selection" }));
    expect(screen.getByTestId("selected-item-counter")).toHaveTextContent(
      "0 selected",
    );
    expect(
      screen.queryByTestId("bulk-action-toolbar"),
    ).not.toBeInTheDocument();
  });

  it("maintains selection state when navigating between folder filters", () => {
    render(
      <BulkSnippetManager snippets={sampleSnippets} folders={sampleFolders} />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select JWT Token Verifier" }),
    );
    expect(screen.getByTestId("selected-item-counter")).toHaveTextContent(
      "1 selected",
    );

    // Switch folder filter to Database Queries
    fireEvent.click(screen.getByRole("button", { name: "Database Queries" }));
    expect(screen.getByTestId("selected-item-counter")).toHaveTextContent(
      "1 selected",
    );

    // Switch back to All Snippets
    fireEvent.click(screen.getByRole("button", { name: "All Snippets" }));
    expect(
      screen.getByRole("checkbox", { name: "Select JWT Token Verifier" }),
    ).toBeChecked();
  });

  it("executes bulk move-to-folder workflow via modal dialog", async () => {
    const onBulkMove = jest.fn().mockResolvedValue({
      results: [
        { snippetId: "snip_1", status: "success" },
        { snippetId: "snip_2", status: "success" },
      ],
    });

    render(
      <BulkSnippetManager
        snippets={sampleSnippets}
        folders={sampleFolders}
        onBulkMove={onBulkMove}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select JWT Token Verifier" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Postgres Pool Helper" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Move to Folder" }));

    const dialog = screen.getByTestId("bulk-move-dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Move 2 Snippets" }),
    ).toBeInTheDocument();

    const select = within(dialog).getByLabelText("Select destination folder");
    fireEvent.change(select, { target: { value: "folder_auth" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));

    await waitFor(() =>
      expect(onBulkMove).toHaveBeenCalledWith(
        ["snip_1", "snip_2"],
        "folder_auth",
      ),
    );

    expect(await screen.findByTestId("bulk-status-banner")).toHaveTextContent(
      "Successfully moved 2 snippets.",
    );
    expect(
      within(screen.getByTestId("snippet-row-snip_1")).getByText(
        "Authentication",
      ),
    ).toBeInTheDocument();
  });

  it("executes bulk export operation and displays confirmation feedback", async () => {
    const onBulkExport = jest.fn().mockResolvedValue({
      results: [{ snippetId: "snip_1", status: "success" }],
      exportedSnippets: [{ id: "snip_1" }],
    });

    render(
      <BulkSnippetManager
        snippets={sampleSnippets}
        folders={sampleFolders}
        onBulkExport={onBulkExport}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select JWT Token Verifier" }),
    );

    fireEvent.change(screen.getByLabelText("Export format"), {
      target: { value: "markdown" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() =>
      expect(onBulkExport).toHaveBeenCalledWith(["snip_1"], "markdown"),
    );

    expect(await screen.findByTestId("bulk-status-banner")).toHaveTextContent(
      "Successfully exported 1 snippet.",
    );
  });

  it("requires confirmation dialog before executing destructive bulk deletion", async () => {
    const onBulkDelete = jest.fn().mockResolvedValue({
      results: [
        { snippetId: "snip_1", status: "success" },
        { snippetId: "snip_2", status: "success" },
      ],
    });

    render(
      <BulkSnippetManager
        snippets={sampleSnippets}
        folders={sampleFolders}
        onBulkDelete={onBulkDelete}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select JWT Token Verifier" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Postgres Pool Helper" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByTestId("bulk-delete-dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Delete 2 Snippets?" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("This action cannot be undone.");

    // Cancel first — should not delete
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onBulkDelete).not.toHaveBeenCalled();

    // Open again and confirm Delete
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(screen.getByTestId("bulk-delete-dialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() =>
      expect(onBulkDelete).toHaveBeenCalledWith(["snip_1", "snip_2"]),
    );

    expect(await screen.findByTestId("bulk-status-banner")).toHaveTextContent(
      "Successfully deleted 2 snippets.",
    );
    expect(
      screen.queryByTestId("snippet-row-snip_1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("snippet-row-snip_2"),
    ).not.toBeInTheDocument();
  });

  it("disables move and delete actions when only unauthorized snippets are selected", () => {
    render(
      <BulkSnippetManager snippets={sampleSnippets} folders={sampleFolders} />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Read-Only Shared Snippet" }),
    );

    expect(screen.getByRole("button", { name: "Move to Folder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).not.toBeDisabled();
  });

  it("retains failed selections and displays actionable error feedback on partial failures", async () => {
    const onBulkDelete = jest.fn().mockResolvedValue({
      results: [
        { snippetId: "snip_1", status: "success" },
        {
          snippetId: "snip_3",
          status: "failed",
          reason: "Permission denied",
        },
      ],
    });

    render(
      <BulkSnippetManager
        snippets={sampleSnippets}
        folders={sampleFolders}
        onBulkDelete={onBulkDelete}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select JWT Token Verifier" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Read-Only Shared Snippet" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(screen.getByTestId("bulk-delete-dialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    const errorBanner = await screen.findByTestId("bulk-error-banner");
    expect(errorBanner).toHaveTextContent(
      "Deleted 1 of 2 snippets. Failed (1): snip_3: Permission denied",
    );

    // Failed item remains selected so user does not lose selection context
    expect(screen.getByTestId("selected-item-counter")).toHaveTextContent(
      "1 selected",
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Read-Only Shared Snippet" }),
    ).toBeChecked();
  });

  it("renders empty and loading states appropriately", () => {
    const { rerender } = render(
      <BulkSnippetManager snippets={[]} isLoading={true} />,
    );
    expect(screen.getByTestId("bulk-loading-state")).toBeInTheDocument();

    rerender(<BulkSnippetManager snippets={[]} isLoading={false} />);
    expect(screen.getByTestId("bulk-empty-state")).toHaveTextContent(
      "No snippets available.",
    );
  });
});
