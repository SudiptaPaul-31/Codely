/**
 * @jest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SafeMarkdown, parseBlocks, safeHref } from "./safe-markdown";

const renderMd = (source: string, base?: number) =>
  render(<SafeMarkdown source={source} baseHeadingLevel={base} />).container;

describe("SafeMarkdown", () => {
  describe("structured formatting", () => {
    it("renders headings, offset so they nest under the panel's own headings", () => {
      const c = renderMd("# Install\n\n## Configure", 5);
      expect(c.querySelector("h5")).toHaveTextContent("Install");
      expect(c.querySelector("h6")).toHaveTextContent("Configure");
      expect(c.querySelector("h1, h2")).toBeNull();
    });

    it("clamps deep headings at h6", () => {
      expect(renderMd("###### Deep", 5).querySelector("h6")).toHaveTextContent("Deep");
    });

    it("renders paragraphs, joining wrapped lines", () => {
      const ps = renderMd("First line\nsame paragraph\n\nSecond").querySelectorAll("p");
      expect(ps).toHaveLength(2);
      expect(ps[0]).toHaveTextContent("First line same paragraph");
    });

    it("renders unordered and ordered lists, keeping the start number", () => {
      const c = renderMd("- jsonwebtoken\n- Node.js 20+\n\n3. Configure\n4. Run");
      expect(c.querySelectorAll("ul > li")).toHaveLength(2);
      const ol = c.querySelector("ol")!;
      expect(ol).toHaveAttribute("start", "3");
      expect(ol.querySelectorAll("li")).toHaveLength(2);
    });

    it("keeps an indented continuation line inside its list item", () => {
      const items = renderMd("1. Install\n   with npm\n2. Run").querySelectorAll("li");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Install with npm");
    });

    it("renders fenced code blocks verbatim, with their language", () => {
      const c = renderMd("```js\nconst x = 1;\n  indented();\n```");
      const pre = c.querySelector("pre")!;
      expect(pre).toHaveAttribute("data-language", "js");
      expect(pre.querySelector("code")!.textContent).toBe("const x = 1;\n  indented();");
    });

    it("runs an unclosed fence to the end instead of dropping text", () => {
      expect(renderMd("```\nstill code").querySelector("code")!.textContent).toBe("still code");
    });

    it("renders inline code, bold and italic", () => {
      const c = renderMd("Call `sign()` **now**, *carefully*.");
      expect(c.querySelector("code")).toHaveTextContent("sign()");
      expect(c.querySelector("strong")).toHaveTextContent("now");
      expect(c.querySelector("em")).toHaveTextContent("carefully");
    });

    it("does not parse Markdown inside code", () => {
      const c = renderMd("`**not bold**`");
      expect(c.querySelector("strong")).toBeNull();
      expect(c.querySelector("code")).toHaveTextContent("**not bold**");
    });
  });

  describe("links", () => {
    it("renders safe links that open in a new tab without referrer or opener", () => {
      const a = renderMd("[Docs](https://example.com/docs)").querySelector("a")!;
      expect(a).toHaveAttribute("href", "https://example.com/docs");
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toEqual(expect.stringContaining("noopener"));
      expect(a.getAttribute("rel")).toEqual(expect.stringContaining("noreferrer"));
      expect(a.getAttribute("rel")).toEqual(expect.stringContaining("nofollow"));
    });

    it("allows mailto links", () => {
      expect(renderMd("[Mail](mailto:dev@example.com)").querySelector("a")).toHaveAttribute(
        "href",
        "mailto:dev@example.com",
      );
    });

    it.each([
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "//evil.example.com",
      "/relative/path",
    ])("does not link %s, but keeps the text", (url) => {
      const c = renderMd(`[click me](${url})`);
      expect(c.querySelector("a")).toBeNull();
      expect(c).toHaveTextContent("click me");
    });

    it("safeHref only returns http(s) and mailto URLs", () => {
      expect(safeHref("https://a.example")).toBe("https://a.example/");
      expect(safeHref(" javascript:alert(1)")).toBeNull();
      expect(safeHref("not a url")).toBeNull();
    });
  });

  describe("XSS protection", () => {
    const payloads = [
      "<script>window.__pwned = true</script>",
      '<img src=x onerror="window.__pwned=true">',
      '<a href="javascript:alert(1)">x</a>',
      "<iframe src=\"https://evil.example\"></iframe>",
      "<svg onload=alert(1)>",
      '"><b onmouseover=alert(1)>hover</b>',
    ];

    it.each(payloads)("renders %s as inert text", (payload) => {
      const c = renderMd(`# ${payload}\n\n${payload}\n\n- ${payload}\n\n\`${payload}\``);
      expect(c.querySelector("script, img, iframe, svg, b, a[href^='javascript']")).toBeNull();
      expect(c.innerHTML).not.toMatch(/<(script|img|iframe|svg)\b/i);
      // The payload text survives, escaped; no element carries an event handler.
      for (const el of Array.from(c.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) expect(attr.name).not.toMatch(/^on/i);
      }
      expect(c.textContent).toContain(payload.slice(0, 8));
      expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    });

    it("never sets an attribute from author text except a vetted href", () => {
      const c = renderMd('[x](https://ok.example "title") <a title="t">');
      for (const el of Array.from(c.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
          expect(["class", "href", "target", "rel", "start", "data-language"]).toContain(attr.name);
        }
      }
    });
  });

  it("parses blocks independently of rendering", () => {
    expect(parseBlocks("# T\n\ntext\n\n- a\n\n```sh\nls\n```").map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "code",
    ]);
  });
});
