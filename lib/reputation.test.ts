import { getReputationBadge } from "./reputation";

describe("Reputation System Backend", () => {
  describe("getReputationBadge", () => {
    it("returns Newcomer for score < 100", () => {
      expect(getReputationBadge(0)).toBe("Newcomer");
      expect(getReputationBadge(99)).toBe("Newcomer");
    });

    it("returns Bronze for score >= 100 and < 500", () => {
      expect(getReputationBadge(100)).toBe("Bronze");
      expect(getReputationBadge(499)).toBe("Bronze");
    });

    it("returns Silver for score >= 500 and < 1000", () => {
      expect(getReputationBadge(500)).toBe("Silver");
      expect(getReputationBadge(999)).toBe("Silver");
    });

    it("returns Gold for score >= 1000", () => {
      expect(getReputationBadge(1000)).toBe("Gold");
      expect(getReputationBadge(5000)).toBe("Gold");
    });
  });

  // Note: Database functions (addReputationPoints, etc.) would typically be mocked
  // here or run against a test database. We are omitting the DB integration tests 
  // since they require an active neon connection setup for tests.
});
