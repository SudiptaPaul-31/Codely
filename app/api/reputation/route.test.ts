import { GET } from "./[walletAddress]/route";
import * as reputationService from "@/lib/reputation";

// Mock the reputation service
jest.mock("@/lib/reputation", () => ({
  getReputation: jest.fn(),
  getReputationActions: jest.fn(),
  getReputationBadge: jest.fn(),
}));

describe("Reputation API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 if wallet address is missing", async () => {
    const req = new Request("http://localhost:3000/api/reputation/");
    const params = Promise.resolve({ walletAddress: "" });
    const res = await GET(req, { params });
    const json = await res.json();
    
    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing wallet address");
  });

  it("returns reputation data for a valid wallet address", async () => {
    const mockWallet = "GBXQ123";
    (reputationService.getReputation as jest.Mock).mockResolvedValue(150);
    (reputationService.getReputationBadge as jest.Mock).mockReturnValue("Bronze");
    (reputationService.getReputationActions as jest.Mock).mockResolvedValue([
      { action: "publish", points: 150, created_at: new Date() }
    ]);

    const req = new Request(`http://localhost:3000/api/reputation/${mockWallet}`);
    const params = Promise.resolve({ walletAddress: mockWallet });
    const res = await GET(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.score).toBe(150);
    expect(json.badge).toBe("Bronze");
    expect(json.actions).toHaveLength(1);
    expect(reputationService.getReputation).toHaveBeenCalledWith(mockWallet);
  });

  it("returns 500 if the service throws an error", async () => {
    const mockWallet = "GBXQ123";
    (reputationService.getReputation as jest.Mock).mockRejectedValue(new Error("DB Error"));

    const req = new Request(`http://localhost:3000/api/reputation/${mockWallet}`);
    const params = Promise.resolve({ walletAddress: mockWallet });
    const res = await GET(req, { params });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to fetch reputation data");
  });
});
