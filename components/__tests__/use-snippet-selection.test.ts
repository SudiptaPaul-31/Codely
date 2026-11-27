import { renderHook, act } from "@testing-library/react";
import { useSnippetSelection } from "@/hooks/use-snippet-selection";

describe("useSnippetSelection", () => {
  it("selects a single snippet", () => {
    const { result } = renderHook(() => useSnippetSelection());
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it("selects multiple and updates the counter", () => {
    const { result } = renderHook(() => useSnippetSelection());
    act(() => {
      result.current.toggle("a");
      result.current.toggle("b");
    });
    expect(result.current.count).toBe(2);
  });

  it("deselects", () => {
    const { result } = renderHook(() => useSnippetSelection());
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("a"));
    expect(result.current.count).toBe(0);
  });

  it("clears selection", () => {
    const { result } = renderHook(() => useSnippetSelection());
    act(() => result.current.selectAll(["a", "b", "c"]));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });
});