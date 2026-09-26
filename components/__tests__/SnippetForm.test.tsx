/** @jest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import SnippetForm from "../SnippetForm";

// jsdom does not implement the browser APIs Radix UI relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in global)) {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const JS_SNIPPET = `
function calculateTotal(items) {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  console.log("Total:", total);
  return total;
}

module.exports = { calculateTotal };
`;

const TS_SNIPPET = `
interface User {
  id: number;
  name: string;
  email: string;
}

export function greet(user: User): string {
  return "Hello, " + user.name;
}
`;

const MESSY_JS = "const  answer=42;function  f( a ){return   a+1}";
const TIDY_JS = "const answer = 42;\nfunction f(a) {\n  return a + 1;\n}\n";

function renderForm(overrides: Partial<React.ComponentProps<typeof SnippetForm>> = {}) {
  return render(
    <SnippetForm
      editingId={null}
      closeForm={jest.fn()}
      onSuccess={jest.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  );
}

function getCodeTextarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText("Paste your code here...") as HTMLTextAreaElement;
}

function paste(text: string) {
  fireEvent.paste(getCodeTextarea(), {
    clipboardData: { getData: () => text },
  });
}

describe("SnippetForm editor integration", () => {
  it("renders the language indicator, Format Code button and auto-format toggle", () => {
    renderForm();
    expect(screen.getByTestId("language-indicator")).toHaveTextContent("JavaScript");
    expect(screen.getByTestId("format-code-button")).toBeInTheDocument();
    expect(screen.getByTestId("auto-format-toggle")).toBeInTheDocument();
  });

  it("suggests the detected language on paste and applies it when accepted", async () => {
    renderForm();
    paste(TS_SNIPPET);
    const banner = await screen.findByTestId("language-suggestion");
    expect(banner).toHaveTextContent("TypeScript");
    fireEvent.click(screen.getByTestId("accept-suggestion"));
    await waitFor(() =>
      expect(screen.getByTestId("language-indicator")).toHaveTextContent("TypeScript"),
    );
    expect(screen.queryByTestId("language-suggestion")).not.toBeInTheDocument();
  });

  it("keeps the current language when the suggestion is rejected", async () => {
    renderForm();
    paste(TS_SNIPPET);
    await screen.findByTestId("language-suggestion");
    fireEvent.click(screen.getByTestId("dismiss-suggestion"));
    expect(screen.queryByTestId("language-suggestion")).not.toBeInTheDocument();
    expect(screen.getByTestId("language-indicator")).toHaveTextContent("JavaScript");
  });

  it("shows no suggestion when detection confidence is low", () => {
    renderForm();
    paste("def ");
    expect(screen.queryByTestId("language-suggestion")).not.toBeInTheDocument();
  });

  it("formats the code when the Format Code button is clicked", async () => {
    renderForm();
    fireEvent.change(getCodeTextarea(), { target: { value: MESSY_JS } });
    fireEvent.click(screen.getByTestId("format-code-button"));
    await waitFor(() => expect(getCodeTextarea()).toHaveValue(TIDY_JS), {
      timeout: 5000,
    });
    await screen.findByText(/Formatted with Prettier/);
  }, 15000);

  it("toggles auto-format on click", () => {
    renderForm();
    const toggle = screen.getByTestId("auto-format-toggle");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("auto-formats after confirming a detected language when enabled", async () => {
    renderForm();
    fireEvent.click(screen.getByTestId("auto-format-toggle"));
    fireEvent.change(getCodeTextarea(), { target: { value: MESSY_JS } });
    paste(JS_SNIPPET);
    await screen.findByTestId("language-suggestion");
    fireEvent.click(screen.getByTestId("accept-suggestion"));
    await waitFor(() => expect(getCodeTextarea()).toHaveValue(TIDY_JS), {
      timeout: 5000,
    });
  }, 15000);

  it("stops suggesting after the user manually picks a language", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: /language/i }));
    const option = await screen.findByRole("option", { name: "Python" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(screen.getByTestId("language-indicator")).toHaveTextContent("Python"),
    );

    paste(JS_SNIPPET);
    expect(screen.queryByTestId("language-suggestion")).not.toBeInTheDocument();
  });

  it("never suggests over the saved language of an existing snippet", () => {
    renderForm({
      editingId: "snippet-1",
      initialValues: { language: "python", title: "Old", code: "def old(): pass" },
    });
    paste(JS_SNIPPET);
    expect(screen.queryByTestId("language-suggestion")).not.toBeInTheDocument();
    expect(screen.getByTestId("language-indicator")).toHaveTextContent("Python");
  });
});
