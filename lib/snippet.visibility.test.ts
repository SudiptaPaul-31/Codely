import { SnippetService } from "../app/api/snippets/snippet.service";
import { SnippetRepository, SnippetVisibility } from "../app/api/snippets/snippet.repository";
import { createSnippetSchema, updateSnippetSchema, VISIBILITY_VALUES } from "../app/api/snippets/snippet.validator";

jest.mock("../lib/ipfs.service", () => ({
  IPFSService: {
    uploadToIPFS: jest.fn().mockResolvedValue("QmTestCID"),
  },
}));

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/stellar-recovery.service", () => ({
  StellarRecoveryService: jest.fn().mockImplementation(() => ({
    submitLicenseMint: jest.fn().mockResolvedValue({ status: "queued", callback_status: "pending" }),
  })),
}));

jest.mock("@/lib/audit", () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
}));

const OWNER = "GBRRHRH76DXEKWF3SCDYH7G7M4G3E4DEBIY7WBHBMRGBENRGQWSDLV2V";
const OTHER = "GDTNW5S3JSV27YLRU5XXXHXWLKATYO5ZJABA7QUITDO2YMFU5UXXKQRH";

const mockRepository = {
  findAll: jest.fn(),
  search: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  permanentlyDelete: jest.fn(),
  findSharedUsers: jest.fn().mockResolvedValue([]),
  addSharedUser: jest.fn().mockResolvedValue({}),
  removeSharedUser: jest.fn().mockResolvedValue(null),
} as unknown as SnippetRepository;

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

describe("Visibility validation", () => {
  it("accepts all three visibility values", () => {
    expect(VISIBILITY_VALUES).toEqual(["private", "public", "shared"]);
    for (const v of VISIBILITY_VALUES) {
      expect(createSnippetSchema.parse({ title: "t", description: "d", code: "c", language: "js", tags: ["x"], ownerWalletAddress: OWNER, visibility: v }).visibility).toBe(v);
    }
  });

  it("defaults to private when visibility is omitted", () => {
    const parsed = createSnippetSchema.parse({ title: "t", description: "d", code: "c", language: "js", tags: ["x"], ownerWalletAddress: OWNER });
    expect(parsed.visibility).toBe("private");
  });

  it("rejects an unknown visibility value", () => {
    expect(() =>
      createSnippetSchema.parse({ title: "t", description: "d", code: "c", language: "js", tags: ["x"], ownerWalletAddress: OWNER, visibility: "secret" }),
    ).toThrow();
  });

  it("updateSnippetSchema accepts visibility changes", () => {
    expect(updateSnippetSchema.parse({ visibility: "private" }).visibility).toBe("private");
    expect(() => updateSnippetSchema.parse({ visibility: "world" })).toThrow();
  });
});

describe("SnippetService.setVisibility", () => {
  let service: SnippetService;

  beforeEach(() => {
    service = new SnippetService(mockRepository);
    jest.clearAllMocks();
    (mockRepository.findSharedUsers as jest.Mock).mockResolvedValue([]);
  });

  it("changes visibility to private and logs the change", async () => {
    const existing = { id: "s1", owner_wallet_address: OWNER, visibility: "private" };
    (mockRepository.findById as jest.Mock).mockResolvedValue(existing);
    (mockRepository.update as jest.Mock).mockResolvedValue({ ...existing, visibility: "private" });

    const updated = await service.setVisibility("s1", "private", OWNER);

    expect(updated.visibility).toBe("private");
    expect(mockRepository.update).toHaveBeenCalledWith("s1", expect.objectContaining({ visibility: "private" }));
    const { appendActivityLog } = require("@/lib/activity-logger");
    expect(appendActivityLog).toHaveBeenCalledWith(
      "snippet.visibility_changed",
      "snippet",
      expect.objectContaining({
        resourceId: "s1",
        metadata: expect.objectContaining({ from: "public", to: "private" }),
      }),
    );
  });

  it("rejects a non-owner attempting to change visibility", async () => {
    const existing = { id: "s1", owner_wallet_address: OWNER, visibility: "private" };
    (mockRepository.findById as jest.Mock).mockResolvedValue(existing);

    await expect(service.setVisibility("s1", "private", OTHER)).rejects.toThrow(
      "Only the snippet owner can change visibility",
    );
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it("throws when the snippet does not exist", async () => {
    (mockRepository.findById as jest.Mock).mockResolvedValue(null);
    await expect(service.setVisibility("missing", "private", OWNER)).rejects.toThrow("Snippet not found");
  });

  it("keeps shared users unchanged when the grant set matches", async () => {
    const existing = { id: "s1", owner_wallet_address: OWNER, visibility: "private" };
    (mockRepository.findById as jest.Mock).mockResolvedValue(existing);
    (mockRepository.update as jest.Mock).mockResolvedValue({ ...existing, visibility: "shared" });
    (mockRepository.findSharedUsers as jest.Mock).mockResolvedValue([{ user_wallet_address: OTHER }]);

    await service.setVisibility("s1", "shared", OWNER, [OTHER]);

    expect(mockRepository.addSharedUser).not.toHaveBeenCalled();
    expect(mockRepository.removeSharedUser).not.toHaveBeenCalled();
  });

  it("removes grants that are no longer in the sharedWith list", async () => {
    const existing = { id: "s1", owner_wallet_address: OWNER, visibility: "shared" };
    (mockRepository.findById as jest.Mock).mockResolvedValue(existing);
    (mockRepository.update as jest.Mock).mockResolvedValue(existing);
    (mockRepository.findSharedUsers as jest.Mock).mockResolvedValue([{ user_wallet_address: OTHER }]);

    await service.setVisibility("s1", "shared", OWNER, []);

    expect(mockRepository.removeSharedUser).toHaveBeenCalledWith("s1", OTHER);
  });

  it("adds new grants when sharedWith contains new wallets", async () => {
    const existing = { id: "s1", owner_wallet_address: OWNER, visibility: "private" };
    (mockRepository.findById as jest.Mock).mockResolvedValue(existing);
    (mockRepository.update as jest.Mock).mockResolvedValue({ ...existing, visibility: "shared" });
    (mockRepository.findSharedUsers as jest.Mock).mockResolvedValue([]);

    await service.setVisibility("s1", "shared", OWNER, [OTHER]);

    expect(mockRepository.addSharedUser).toHaveBeenCalledWith("s1", OTHER, OWNER);
  });
});

describe("SnippetService.createSnippet with visibility", () => {
  let service: SnippetService;

  beforeEach(() => {
    service = new SnippetService(mockRepository);
    jest.clearAllMocks();
  });

  it("creates a private snippet with the requested visibility", async () => {
    (mockRepository.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({ id: "s2", ...data }),
    );

    const result = await service.createSnippet({
      title: "t", description: "d", code: "c", language: "js", tags: ["x"],
      ownerWalletAddress: OWNER, visibility: "private",
    });

    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private" }),
    );
    expect(result.visibility).toBe("private");
  });

  it("registers shared-user grants when created as 'shared' with sharedWith", async () => {
    (mockRepository.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({ id: "s3", ...data }),
    );

    await service.createSnippet({
      title: "t", description: "d", code: "c", language: "js", tags: ["x"],
      ownerWalletAddress: OWNER, visibility: "shared", sharedWith: [OTHER],
    });

    expect(mockRepository.addSharedUser).toHaveBeenCalledWith("s3", OTHER, OWNER);
  });

  it("does not register grants when sharedWith is absent", async () => {
    (mockRepository.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({ id: "s4", ...data }),
    );

    await service.createSnippet({
      title: "t", description: "d", code: "c", language: "js", tags: ["x"],
      ownerWalletAddress: OWNER, visibility: "shared",
    });

    expect(mockRepository.addSharedUser).not.toHaveBeenCalled();
  });
});

describe("Repository visibility plumbing", () => {
  it("SnippetVisibility type covers the three modes", () => {
    const modes: SnippetVisibility[] = ["private", "public", "shared"];
    expect(modes).toHaveLength(3);
  });
});
