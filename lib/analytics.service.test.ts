/**
 * @jest-environment node
 */
import { AnalyticsService } from "../app/api/snippets/analytics.service";
import { AnalyticsRepository, ActionType } from "../app/api/snippets/analytics.repository";

// Mock the repository
const mockRepository = {
  logAction: jest.fn(),
  getSnippetAggregations: jest.fn(),
  getGlobalAggregations: jest.fn(),
} as unknown as AnalyticsRepository;

// Suppress console.error in tests to keep output clean during expected retry errors
let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

describe("AnalyticsService", () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService(mockRepository);
    jest.clearAllMocks();
  });

  describe("logAction", () => {
    it("should successfully log an action", async () => {
      const validData = { snippetId: "123", actionType: "view" as ActionType };
      const expectedResult = { id: "1", ...validData, created_at: new Date() };
      
      (mockRepository.logAction as jest.Mock).mockResolvedValue(expectedResult);

      const result = await service.logAction(validData);
      expect(result).toEqual(expectedResult);
      expect(mockRepository.logAction).toHaveBeenCalledWith(validData);
      expect(mockRepository.logAction).toHaveBeenCalledTimes(1);
    });

    it("should throw error for invalid action type", async () => {
      const invalidData = { snippetId: "123", actionType: "invalid" as any };

      await expect(service.logAction(invalidData)).rejects.toThrow(
        "Invalid action type: invalid. Must be one of: view, copy, share."
      );
      expect(mockRepository.logAction).not.toHaveBeenCalled();
    });

    it("should retry on failure and eventually succeed", async () => {
      const validData = { snippetId: "123", actionType: "copy" as ActionType };
      const expectedResult = { id: "2", ...validData };

      // Fail twice, succeed on third attempt
      (mockRepository.logAction as jest.Mock)
        .mockRejectedValueOnce(new Error("DB error 1"))
        .mockRejectedValueOnce(new Error("DB error 2"))
        .mockResolvedValueOnce(expectedResult);

      const result = await service.logAction(validData);
      expect(result).toEqual(expectedResult);
      expect(mockRepository.logAction).toHaveBeenCalledTimes(3);
    });

    it("should throw error after max retries are exhausted", async () => {
      const validData = { snippetId: "123", actionType: "share" as ActionType };

      // Fail consistently
      (mockRepository.logAction as jest.Mock).mockRejectedValue(new Error("Persistent DB error"));

      await expect(service.logAction(validData, 2)).rejects.toThrow(
        "Failed to log analytics action after 2 attempts. Last error: Persistent DB error"
      );
      expect(mockRepository.logAction).toHaveBeenCalledTimes(2);
    });
  });

  describe("getSnippetAggregations", () => {
    it("should return formatted aggregations with all fields", async () => {
      const dbResult = [
        { action_type: "view", count: 10 },
        { action_type: "share", count: 2 },
      ];
      (mockRepository.getSnippetAggregations as jest.Mock).mockResolvedValue(dbResult);

      const result = await service.getSnippetAggregations("123");
      expect(result).toEqual({
        views: 10,
        copies: 0,
        shares: 2,
      });
      expect(mockRepository.getSnippetAggregations).toHaveBeenCalledWith("123");
    });
  });

  describe("getGlobalAggregations", () => {
    it("should return formatted global aggregations", async () => {
      const dbResult = [
        { action_type: "copy", count: 50 },
        { action_type: "view", count: 500 },
      ];
      (mockRepository.getGlobalAggregations as jest.Mock).mockResolvedValue(dbResult);

      const result = await service.getGlobalAggregations();
      expect(result).toEqual({
        views: 500,
        copies: 50,
        shares: 0,
      });
      expect(mockRepository.getGlobalAggregations).toHaveBeenCalledTimes(1);
    });
  });
});
