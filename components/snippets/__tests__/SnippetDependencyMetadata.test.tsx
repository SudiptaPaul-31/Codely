/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  SnippetDependencyEditor,
  SnippetDependencyPanel,
  type DependencyItemMetadata,
} from "../SnippetDependencyMetadata";

const sampleDeps: DependencyItemMetadata[] = [
  {
    id: "dep_1",
    name: "React",
    version: "18.3.1",
    ecosystem: "npm",
    description: "Component UI library",
  },
  {
    id: "dep_2",
    name: "Next.js",
    version: "15.0.0",
    ecosystem: "npm",
    description: "React framework",
  },
  {
    id: "dep_3",
    name: "Tailwind CSS",
    version: "4.0.0",
    ecosystem: "npm",
  },
];

beforeEach(() => {
  window.localStorage.clear();
});

describe("SnippetDependencyPanel — Details Page Display", () => {
  it("renders multiple dependencies, versions, ecosystem badges, and summary metadata", () => {
    render(
      <SnippetDependencyPanel
        snippetId="snippet_101"
        dependencies={sampleDeps}
        updatedAt="2026-10-12"
        author="GOWNER1234"
        compatibilityNotes="Node.js 20+"
      />,
    );

    const panel = screen.getByRole("region", { name: /Dependencies/i });
    expect(panel).toBeInTheDocument();

    expect(within(panel).getByText("React")).toBeInTheDocument();
    expect(within(panel).getByText("v18.3.1")).toBeInTheDocument();
    expect(within(panel).getByText("Next.js")).toBeInTheDocument();
    expect(within(panel).getByText("v15.0.0")).toBeInTheDocument();
    expect(within(panel).getByText("Tailwind CSS")).toBeInTheDocument();
    expect(within(panel).getByText("v4.0.0")).toBeInTheDocument();

    const summary = screen.getByTestId("dependency-summary-metadata");
    expect(summary).toHaveTextContent("Package Ecosystem: npm");
    expect(summary).toHaveTextContent("Total Dependencies: 3");
    expect(summary).toHaveTextContent("Last Updated: 2026-10-12");
    expect(summary).toHaveTextContent("Author: GOWNER1234");
    expect(summary).toHaveTextContent("Compatibility: Node.js 20+");
  });

  it("displays an empty state when a snippet has no dependencies", () => {
    render(
      <SnippetDependencyPanel snippetId="snippet_empty" dependencies={[]} />,
    );

    expect(screen.getByTestId("dependency-empty-state")).toHaveTextContent(
      "No external dependencies specified for this snippet.",
    );
  });

  it("renders loading and error states with retry support", () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <SnippetDependencyPanel snippetId="snippet_1" isLoading={true} />,
    );
    expect(screen.getByTestId("dependency-loading-state")).toBeInTheDocument();

    rerender(
      <SnippetDependencyPanel
        snippetId="snippet_1"
        isLoading={false}
        error="Failed to load dependency metadata."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("dependency-error-state")).toHaveTextContent(
      "Failed to load dependency metadata.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("treats user-generated metadata as inert text without executing HTML or scripts", () => {
    const untrustedDeps: DependencyItemMetadata[] = [
      {
        id: "dep_evil",
        name: "safe-pkg",
        version: "1.0.0",
        ecosystem: "npm",
        description: '<img src=x onerror="window.__hacked=true"><script>alert(1)</script>',
      },
    ];

    const { container } = render(
      <SnippetDependencyPanel
        snippetId="snippet_xss"
        dependencies={untrustedDeps}
      />,
    );

    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getByTestId("dependency-card-safe-pkg")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
  });
});

describe("SnippetDependencyEditor — Creation, Validation, Update & Removal", () => {
  it("allows adding, updating, removing, and saving dependencies", async () => {
    const onSave = jest.fn();
    render(
      <SnippetDependencyEditor
        snippetId="snippet_edit_1"
        initialDependencies={[sampleDeps[0]]}
        canEdit={true}
        onSave={onSave}
      />,
    );

    // Add a new dependency (zod)
    fireEvent.change(screen.getByLabelText("Library / Package Name"), {
      target: { value: "zod" },
    });
    fireEvent.change(screen.getByLabelText("Version Number"), {
      target: { value: "3.23.8" },
    });
    fireEvent.change(screen.getByLabelText("Package Ecosystem"), {
      target: { value: "npm" },
    });
    fireEvent.change(screen.getByLabelText("Description (Optional)"), {
      target: { value: "Schema validation" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Dependency" }));

    expect(screen.getByTestId("editor-dependency-item-zod")).toHaveTextContent(
      "v3.23.8",
    );

    // Edit existing React dependency version
    fireEvent.click(screen.getByRole("button", { name: "Edit React" }));
    fireEvent.change(screen.getByLabelText("Version Number"), {
      target: { value: "19.0.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Dependency" }));

    expect(
      screen.getByTestId("editor-dependency-item-React"),
    ).toHaveTextContent("v19.0.0");

    // Remove zod dependency
    fireEvent.click(screen.getByRole("button", { name: "Remove zod" }));
    expect(
      screen.queryByTestId("editor-dependency-item-zod"),
    ).not.toBeInTheDocument();

    // Save changes
    fireEvent.click(screen.getByRole("button", { name: "Save Dependencies" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      snippetId: "snippet_edit_1",
      dependencies: [
        expect.objectContaining({
          name: "React",
          version: "19.0.0",
          ecosystem: "npm",
        }),
      ],
    });
  });

  it("rejects empty entries, invalid package names, and malformed version strings", () => {
    render(
      <SnippetDependencyEditor snippetId="snippet_val" canEdit={true} />,
    );

    // Attempt to add empty dependency
    fireEvent.click(screen.getByRole("button", { name: "Add Dependency" }));
    expect(screen.getByTestId("dependency-validation-error")).toHaveTextContent(
      "Library or package name is required.",
    );
    expect(screen.getByTestId("dependency-validation-error")).toHaveTextContent(
      "Version number is required.",
    );

    // Attempt invalid package name with injection characters and malformed version
    fireEvent.change(screen.getByLabelText("Library / Package Name"), {
      target: { value: "<script>bad</script>" },
    });
    fireEvent.change(screen.getByLabelText("Version Number"), {
      target: { value: "not-a-semver!!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Dependency" }));

    expect(screen.getByTestId("dependency-validation-error")).toHaveTextContent(
      "Enter a valid package or library name",
    );
    expect(screen.getByTestId("dependency-validation-error")).toHaveTextContent(
      "Enter a valid version number",
    );
  });

  it("blocks unauthorized users from editing dependencies", () => {
    render(
      <SnippetDependencyEditor
        snippetId="snippet_locked"
        canEdit={false}
      />,
    );

    expect(
      screen.getByTestId("dependency-editor-unauthorized"),
    ).toHaveTextContent("Only the snippet owner can edit dependency metadata.");
    expect(
      screen.queryByRole("button", { name: "Save Dependencies" }),
    ).not.toBeInTheDocument();
  });

  it("immediately updates the details panel and persists across remounts", async () => {
    const { unmount } = render(
      <SnippetDependencyPanel
        snippetId="snippet_persist_99"
        dependencies={[]}
        canEdit={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Dependencies" }));

    fireEvent.change(screen.getByLabelText("Library / Package Name"), {
      target: { value: "tokio" },
    });
    fireEvent.change(screen.getByLabelText("Version Number"), {
      target: { value: "1.38.0" },
    });
    fireEvent.change(screen.getByLabelText("Package Ecosystem"), {
      target: { value: "Cargo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Dependency" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dependencies" }));

    await waitFor(() =>
      expect(screen.getByTestId("dependency-card-tokio")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("dependency-summary-metadata")).toHaveTextContent(
      "Package Ecosystem: Cargo",
    );

    // Unmount and remount to simulate page refresh
    unmount();

    render(
      <SnippetDependencyPanel
        snippetId="snippet_persist_99"
        dependencies={[]}
      />,
    );
    expect(screen.getByTestId("dependency-card-tokio")).toBeInTheDocument();
    expect(screen.getByText("v1.38.0")).toBeInTheDocument();
  });
});
