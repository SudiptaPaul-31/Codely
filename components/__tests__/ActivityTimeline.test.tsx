/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  ActivityItem,
  getActivityIcon,
  getActivityDescription,
  getActivityStyle,
  formatWalletAddress,
} from "../ActivityItem";
import { ActivityTimeline } from "../ActivityTimeline";
import {
  FilePlus2,
  FileEdit,
  FileX2,
  FileSymlink,
  Wallet,
  ShieldCheck,
  ShieldX,
  FileCode,
} from "lucide-react";
import type { ActivityLog } from "@/types/type";
import { formatDistanceToNow } from "date-fns";

jest.mock("date-fns", () => ({
  formatDistanceToNow: jest.fn(() => "2 hours ago"),
}));

function createMockActivity(
  overrides: Partial<ActivityLog> = {},
): ActivityLog {
  return {
    id: "act-1",
    actor_wallet: "GBXQ234V5N3ST3LL4RW4LL3T7777777775PK2E6XN",
    action: "snippet.created",
    resource_type: "snippet",
    resource_id: "res-12345",
    metadata: { title: "Test Snippet" },
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// Pure Function Tests
// ============================================================
describe("getActivityIcon", () => {
  it("returns FilePlus2 for snippet.created", () => {
    expect(getActivityIcon("snippet.created")).toBe(FilePlus2);
  });

  it("returns FileEdit for snippet.updated", () => {
    expect(getActivityIcon("snippet.updated")).toBe(FileEdit);
  });

  it("returns FileX2 for snippet.deleted", () => {
    expect(getActivityIcon("snippet.deleted")).toBe(FileX2);
  });

  it("returns FileX2 for snippet.soft_deleted", () => {
    expect(getActivityIcon("snippet.soft_deleted")).toBe(FileX2);
  });

  it("returns FileSymlink for snippet.restored", () => {
    expect(getActivityIcon("snippet.restored")).toBe(FileSymlink);
  });

  it("returns Wallet for wallet.connected", () => {
    expect(getActivityIcon("wallet.connected")).toBe(Wallet);
  });

  it("returns ShieldCheck for signature.verified", () => {
    expect(getActivityIcon("signature.verified")).toBe(ShieldCheck);
  });

  it("returns ShieldX for signature.failed", () => {
    expect(getActivityIcon("signature.failed")).toBe(ShieldX);
  });

  it("returns FileCode fallback for unknown actions", () => {
    expect(getActivityIcon("unknown.action")).toBe(FileCode);
  });
});

describe("getActivityDescription", () => {
  it("describes snippet creation", () => {
    const activity = createMockActivity({ action: "snippet.created" });
    expect(getActivityDescription(activity)).toBe(
      'Created snippet "Test Snippet"',
    );
  });

  it("describes snippet creation without title", () => {
    const activity = createMockActivity({
      action: "snippet.created",
      metadata: {},
    });
    expect(getActivityDescription(activity)).toBe("Created snippet");
  });

  it("describes snippet update", () => {
    const activity = createMockActivity({ action: "snippet.updated" });
    expect(getActivityDescription(activity)).toBe(
      'Updated snippet "Test Snippet"',
    );
  });

  it("describes snippet deletion", () => {
    const activity = createMockActivity({ action: "snippet.deleted" });
    expect(getActivityDescription(activity)).toBe(
      'Deleted snippet "Test Snippet"',
    );
  });

  it("describes snippet restore", () => {
    const activity = createMockActivity({ action: "snippet.restored" });
    expect(getActivityDescription(activity)).toBe(
      'Restored snippet "Test Snippet"',
    );
  });

  it("describes ownership change from metadata", () => {
    const activity = createMockActivity({
      action: "snippet.updated",
      metadata: {
        ownershipChanged: true,
        previousOwner: "OLDWALLET12345678901234567890",
        newOwner: "NEWWALLET12345678901234567890",
      },
    });
    const desc = getActivityDescription(activity);
    expect(desc).toContain("Transferred snippet ownership from");
    expect(desc).toContain("OLDWA...");
    expect(desc).toContain("NEWWA...");
  });

  it("describes ownership change without previous owner", () => {
    const activity = createMockActivity({
      action: "snippet.updated",
      metadata: {
        newOwner: "NEWWALLET12345678901234567890",
      },
    });
    expect(getActivityDescription(activity)).toContain(
      'Transferred ownership of snippet "Test Snippet"',
    );
  });

  it("describes wallet connection", () => {
    const activity = createMockActivity({ action: "wallet.connected" });
    expect(getActivityDescription(activity)).toBe("Wallet connected");
  });

  it("describes wallet disconnection", () => {
    const activity = createMockActivity({ action: "wallet.disconnected" });
    expect(getActivityDescription(activity)).toBe("Wallet disconnected");
  });

  it("describes signature verification", () => {
    const activity = createMockActivity({ action: "signature.verified" });
    expect(getActivityDescription(activity)).toBe("Signature verified");
  });

  it("describes signature failure", () => {
    const activity = createMockActivity({ action: "signature.failed" });
    expect(getActivityDescription(activity)).toBe(
      "Signature verification failed",
    );
  });
});

describe("formatWalletAddress", () => {
  it("truncates a wallet address", () => {
    const result = formatWalletAddress(
      "GBXQ234V5N3ST3LL4RW4LL3T7777777775PK2E6XN",
    );
    expect(result).toBe("GBXQ...6XN");
  });

  it("returns 'Unknown user' for null", () => {
    expect(formatWalletAddress(null)).toBe("Unknown user");
  });

  it("handles short wallet addresses gracefully", () => {
    expect(formatWalletAddress("ABC")).toBe("ABC...BC");
  });
});

describe("getActivityStyle", () => {
  it("returns emerald style for snippet.created", () => {
    const style = getActivityStyle("snippet.created");
    expect(style.bg).toContain("emerald");
    expect(style.dot).toContain("emerald");
  });

  it("returns blue style for snippet.updated", () => {
    const style = getActivityStyle("snippet.updated");
    expect(style.bg).toContain("blue");
  });

  it("returns default style for unknown action", () => {
    const style = getActivityStyle("unknown");
    expect(style.bg).toContain("zinc");
  });
});

// ============================================================
// Component Tests
// ============================================================
describe("ActivityItem", () => {
  it("renders the activity description", () => {
    const activity = createMockActivity();
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/Created snippet/)).toBeInTheDocument();
  });

  it("renders the relative timestamp", () => {
    const activity = createMockActivity();
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });

  it("renders the truncated actor wallet", () => {
    const activity = createMockActivity();
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/GBXQ/)).toBeInTheDocument();
  });

  it("renders the resource ID", () => {
    const activity = createMockActivity();
    render(<ActivityItem activity={activity} />);
    expect(screen.getByText(/res-12345/)).toBeInTheDocument();
  });

  it("does not render connector when isLast is true", () => {
    const activity = createMockActivity();
    const { container } = render(
      <ActivityItem activity={activity} isLast />,
    );
    const connector = container.querySelector(".absolute.left-\\[19px\\]");
    expect(connector).not.toBeInTheDocument();
  });

  it("handles different activity types correctly", () => {
    const activities = [
      createMockActivity({ id: "a1", action: "snippet.created" }),
      createMockActivity({ id: "a2", action: "snippet.updated" }),
      createMockActivity({ id: "a3", action: "snippet.deleted" }),
    ];

    const { rerender } = render(<ActivityItem activity={activities[0]} />);
    expect(screen.getByText(/Created snippet/)).toBeInTheDocument();

    rerender(<ActivityItem activity={activities[1]} />);
    expect(screen.getByText(/Updated snippet/)).toBeInTheDocument();

    rerender(<ActivityItem activity={activities[2]} />);
    expect(screen.getByText(/Deleted snippet/)).toBeInTheDocument();
  });
});

describe("ActivityTimeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Controlled mode (activities prop)", () => {
    it("renders provided activities", () => {
      const activities = [
        createMockActivity({ id: "1" }),
        createMockActivity({ id: "2" }),
      ];
      render(<ActivityTimeline activities={activities} />);
      expect(screen.getByText(/Created snippet/)).toBeInTheDocument();
    });

    it("does not fetch from API in controlled mode", () => {
      const fetchSpy = jest.spyOn(global, "fetch");
      render(<ActivityTimeline activities={[]} />);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("does not poll in controlled mode", () => {
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: [] })),
      );
      render(<ActivityTimeline activities={[]} pollInterval={1000} />);
      act(() => { jest.advanceTimersByTime(5000); });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("shows empty state when no activities in controlled mode", () => {
      render(<ActivityTimeline activities={[]} />);
      expect(screen.getByText("No activities yet")).toBeInTheDocument();
    });

    it("hides empty state when showEmptyState is false", () => {
      render(
        <ActivityTimeline activities={[]} showEmptyState={false} />,
      );
      expect(
        screen.queryByText("No activities yet"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows skeleton while loading", () => {
      jest.spyOn(global, "fetch").mockImplementation(
        () => new Promise(() => {}),
      );
      render(<ActivityTimeline pollInterval={0} />);
      expect(
        screen.getByLabelText("Loading activities"),
      ).toBeInTheDocument();
    });
  });

  describe("Error state", () => {
    it("shows error message when fetch fails", async () => {
      jest
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error("Network error"));

      render(<ActivityTimeline pollInterval={0} />);

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load activities"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    it("shows retry button on error", async () => {
      jest
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error("Network error"));

      render(<ActivityTimeline pollInterval={0} />);

      await waitFor(() => {
        expect(screen.getByText("Try again")).toBeInTheDocument();
      });
    });

    it("retries fetch when retry button is clicked", async () => {
      const fetchMock = jest
        .spyOn(global, "fetch")
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [createMockActivity({ id: "retried" })],
              total: 1,
              page: 1,
              pageSize: 10,
              hasMore: false,
            }),
            { status: 200 },
          ),
        );

      render(<ActivityTimeline pollInterval={0} />);

      await waitFor(() => {
        expect(screen.getByText("Try again")).toBeInTheDocument();
      });

      act(() => {
        screen.getByText("Try again").click();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Created snippet/),
        ).toBeInTheDocument();
      });

      fetchMock.mockRestore();
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no activities exist", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [],
            total: 0,
            page: 1,
            pageSize: 10,
            hasMore: false,
          }),
          { status: 200 },
        ),
      );

      render(<ActivityTimeline pollInterval={0} />);

      await waitFor(() => {
        expect(
          screen.getByText("No activities yet"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Header", () => {
    it("shows header by default", () => {
      render(<ActivityTimeline activities={[]} />);
      expect(
        screen.getByText("Recent Activity"),
      ).toBeInTheDocument();
    });

    it("hides header when showHeader is false", () => {
      render(
        <ActivityTimeline activities={[]} showHeader={false} />,
      );
      expect(
        screen.queryByText("Recent Activity"),
      ).not.toBeInTheDocument();
    });

    it("renders custom title", () => {
      render(
        <ActivityTimeline
          activities={[]}
          title="Custom Title"
        />,
      );
      expect(screen.getByText("Custom Title")).toBeInTheDocument();
    });
  });

  describe("Polling", () => {
    it("polls for new activities at the given interval", async () => {
      const activities1 = [createMockActivity({ id: "1" })];
      const activities2 = [
        createMockActivity({ id: "1" }),
        createMockActivity({ id: "2" }),
      ];

      const fetchMock = jest
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: activities1,
              total: 1,
              page: 1,
              pageSize: 10,
              hasMore: false,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: activities2,
              total: 2,
              page: 1,
              pageSize: 10,
              hasMore: false,
            }),
            { status: 200 },
          ),
        );

      render(<ActivityTimeline pollInterval={5000} />);

      await waitFor(() => {
        expect(
          screen.getByText(/Created snippet/),
        ).toBeInTheDocument();
      });

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      fetchMock.mockRestore();
    });
  });
});
