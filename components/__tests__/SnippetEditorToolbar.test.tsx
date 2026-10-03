/** @jest-environment jsdom */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import SnippetEditorToolbar, {
  type SnippetEditorToolbarProps,
} from "../SnippetEditorToolbar";

function renderToolbar(overrides: Partial<SnippetEditorToolbarProps> = {}) {
  const props: SnippetEditorToolbarProps = {
    language: "javascript",
    suggestion: null,
    onAcceptSuggestion: jest.fn(),
    onDismissSuggestion: jest.fn(),
    autoFormat: false,
    onAutoFormatChange: jest.fn(),
    onFormat: jest.fn(),
    formatting: false,
    formatStatus: null,
    ...overrides,
  };
  return { ...render(<SnippetEditorToolbar {...props} />), props };
}

describe("SnippetEditorToolbar", () => {
  it("shows a language indicator for the current language", () => {
    renderToolbar({ language: "typescript" });
    expect(screen.getByTestId("language-indicator")).toHaveTextContent("TypeScript");
  });

  it("renders friendly labels for special languages", () => {
    renderToolbar({ language: "cpp" });
    expect(screen.getByTestId("language-indicator")).toHaveTextContent("C++");
  });

  it("calls onFormat when the Format Code button is clicked", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByTestId("format-code-button"));
    expect(props.onFormat).toHaveBeenCalledTimes(1);
  });

  it("disables the Format Code button while formatting", () => {
    renderToolbar({ formatting: true });
    expect(screen.getByTestId("format-code-button")).toBeDisabled();
  });

  it("toggles auto-format", () => {
    const { props } = renderToolbar({ autoFormat: false });
    fireEvent.click(screen.getByTestId("auto-format-toggle"));
    expect(props.onAutoFormatChange).toHaveBeenCalledWith(true);
  });

  it("reflects the auto-format state on the switch", () => {
    renderToolbar({ autoFormat: true });
    expect(screen.getByTestId("auto-format-toggle")).toBeChecked();
  });

  it("renders no suggestion banner when there is no suggestion", () => {
    renderToolbar({ suggestion: null });
    expect(screen.queryByTestId("language-suggestion")).not.toBeInTheDocument();
  });

  it("renders the detected language with its confidence", () => {
    renderToolbar({
      suggestion: { language: "python", confidence: 0.914 },
    });
    const banner = screen.getByTestId("language-suggestion");
    expect(banner).toHaveTextContent("Python");
    expect(banner).toHaveTextContent("91%");
  });

  it("accepts and dismisses suggestions through their callbacks", () => {
    const { props } = renderToolbar({
      suggestion: { language: "python", confidence: 0.9 },
    });
    fireEvent.click(screen.getByTestId("accept-suggestion"));
    expect(props.onAcceptSuggestion).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("dismiss-suggestion"));
    expect(props.onDismissSuggestion).toHaveBeenCalledTimes(1);
  });

  it("displays the format status message", () => {
    renderToolbar({
      formatStatus: { type: "success", message: "Formatted with Prettier." },
    });
    expect(screen.getByTestId("format-status")).toHaveTextContent(
      "Formatted with Prettier.",
    );
  });
});
