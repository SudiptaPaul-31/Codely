/**
 * @jest-environment jsdom
 */
import { getFileExtension, exportSnippet } from "./utils";

describe("utils - export functionality", () => {
  describe("getFileExtension", () => {
    it("should return correct extension for JavaScript", () => {
      expect(getFileExtension("javascript")).toBe("js");
    });

    it("should return correct extension for TypeScript", () => {
      expect(getFileExtension("typescript")).toBe("ts");
    });

    it("should return correct extension for Python", () => {
      expect(getFileExtension("python")).toBe("py");
    });

    it("should return correct extension for Java", () => {
      expect(getFileExtension("java")).toBe("java");
    });

    it("should return txt for unknown language", () => {
      expect(getFileExtension("unknown")).toBe("txt");
    });

    it("should be case-insensitive", () => {
      expect(getFileExtension("JAVASCRIPT")).toBe("js");
    });
  });

  describe("exportSnippet", () => {
    beforeEach(() => {
      // Mock Blob and URL.createObjectURL
      (global as any).Blob = jest.fn();
      (global as any).URL.createObjectURL = jest.fn();
      (global as any).URL.revokeObjectURL = jest.fn();
      document.body.appendChild = jest.fn();
      document.body.removeChild = jest.fn();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it("should generate a Blob with correct content and MIME type for JavaScript", () => {
      const snippet = {
        title: "Test Snippet",
        code: "console.log('test');",
        language: "javascript",
      };
      exportSnippet(snippet);
      expect((global as any).Blob).toHaveBeenCalledWith(["console.log('test');"], { type: "text/javascript" });
    });

    it("should generate correct MIME type for Python", () => {
      const snippet = {
        title: "Python Snippet",
        code: "print('test')",
        language: "python",
      };
      exportSnippet(snippet);
      expect((global as any).Blob).toHaveBeenCalledWith(["print('test')"], { type: "text/x-python" });
    });

    it("should create safe filename from title with invalid characters", () => {
      const snippet = {
        title: 'My Snippet: Test/File.js',
        code: "test code",
        language: "javascript",
      };
      const createElementSpy = jest.spyOn(document, "createElement");
      const mockLink = {
        href: "",
        download: "",
        click: jest.fn(),
      };
      createElementSpy.mockReturnValue(mockLink as any);

      exportSnippet(snippet);

      expect(mockLink.download).toBe("my_snippet__test_file.js.js");
    });

    it("should handle empty title with default filename", () => {
      const snippet = {
        title: "",
        code: "test code",
        language: "javascript",
      };
      const createElementSpy = jest.spyOn(document, "createElement");
      const mockLink = {
        href: "",
        download: "",
        click: jest.fn(),
      };
      createElementSpy.mockReturnValue(mockLink as any);

      exportSnippet(snippet);

      expect(mockLink.download).toBe("snippet.js");
    });

    it("should handle whitespace-only title with default filename", () => {
      const snippet = {
        title: "   ",
        code: "test code",
        language: "javascript",
      };
      const createElementSpy = jest.spyOn(document, "createElement");
      const mockLink = {
        href: "",
        download: "",
        click: jest.fn(),
      };
      createElementSpy.mockReturnValue(mockLink as any);

      exportSnippet(snippet);

      expect(mockLink.download).toBe("snippet.js");
    });

    it("should truncate very long filenames", () => {
      const longTitle = "a".repeat(200);
      const snippet = {
        title: longTitle,
        code: "test code",
        language: "javascript",
      };
      const createElementSpy = jest.spyOn(document, "createElement");
      const mockLink = {
        href: "",
        download: "",
        click: jest.fn(),
      };
      createElementSpy.mockReturnValue(mockLink as any);

      exportSnippet(snippet);

      const filename = mockLink.download;
      const baseName = filename.replace(".js", "");
      expect(baseName.length).toBeLessThanOrEqual(100);
    });

    it("should trigger download by clicking link", () => {
      const snippet = {
        title: "Test",
        code: "test",
        language: "javascript",
      };
      const createElementSpy = jest.spyOn(document, "createElement");
      const mockLink = {
        href: "",
        download: "",
        click: jest.fn(),
      };
      createElementSpy.mockReturnValue(mockLink as any);

      exportSnippet(snippet);

      expect(mockLink.click).toHaveBeenCalled();
    });

    it("should clean up link and object URL after download", () => {
      const snippet = {
        title: "Test",
        code: "test",
        language: "javascript",
      };
      const createElementSpy = jest.spyOn(document, "createElement");
      const mockLink = {
        href: "",
        download: "",
        click: jest.fn(),
      };
      createElementSpy.mockReturnValue(mockLink as any);
      ((global as any).URL.createObjectURL as jest.Mock).mockReturnValue("blob:test");

      exportSnippet(snippet);

      expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
      expect((global as any).URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    });

    it("should throw error if export fails", () => {
      const snippet = {
        title: "Test",
        code: "test",
        language: "javascript",
      };
      jest.spyOn(document, "createElement").mockImplementation(() => {
        throw new Error("Test error");
      });

      expect(() => exportSnippet(snippet)).toThrow("Failed to export snippet");
    });
  });
});