import { ShareRepository, CreateShareDTO } from "./share.repository";
import { SnippetRepository } from "./snippet.repository";
import { ActivityLogger } from "@/lib/activity-logger";

export class ShareService {
  constructor(
    private shareRepository: ShareRepository,
    private snippetRepository: SnippetRepository,
  ) {}

  async createShareLink(data: CreateShareDTO): Promise<{
    shareToken: string;
    shareUrl: string;
    isReadOnly: boolean;
    expiresAt: string | null;
  }> {
    const snippet = await this.snippetRepository.findById(data.snippetId);
    if (!snippet) {
      throw new Error("Snippet not found");
    }

    const existingShare = await this.shareRepository.findActiveShareBySnippet(
      data.snippetId,
    );
    if (existingShare) {
      return {
        shareToken: existingShare.share_token,
        shareUrl: this.buildShareUrl(existingShare.share_token),
        isReadOnly: existingShare.is_read_only,
        expiresAt: existingShare.expires_at,
      };
    }

    const share = await this.shareRepository.createShare(data);

    await ActivityLogger.log(
      data.snippetId,
      "SHARE",
      data.createdByWalletAddress,
      {
        shareToken: share.share_token,
        isReadOnly: share.is_read_only,
        expiresAt: share.expires_at,
      },
    );

    return {
      shareToken: share.share_token,
      shareUrl: this.buildShareUrl(share.share_token),
      isReadOnly: share.is_read_only,
      expiresAt: share.expires_at,
    };
  }

  async getSharedSnippet(
    shareToken: string,
  ): Promise<{ snippet: any; isReadOnly: boolean } | null> {
    const share = await this.shareRepository.findByToken(shareToken);
    if (!share) {
      return null;
    }

    const snippet = await this.snippetRepository.findById(share.snippet_id);
    if (!snippet) {
      return null;
    }

    return {
      snippet,
      isReadOnly: share.is_read_only,
    };
  }

  async revokeShare(
    snippetId: string,
    revokedByWalletAddress: string,
  ): Promise<boolean> {
    const existingShare = await this.shareRepository.findActiveShareBySnippet(
      snippetId,
    );
    if (!existingShare) {
      throw new Error("No active share link found for this snippet");
    }

    const revoked = await this.shareRepository.revokeShare(
      snippetId,
      revokedByWalletAddress,
    );

    if (revoked) {
      await ActivityLogger.log(
        snippetId,
        "REVOKESHARE",
        revokedByWalletAddress,
        {
          shareToken: existingShare.share_token,
        },
      );
    }

    return revoked;
  }

  private buildShareUrl(shareToken: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    return `${baseUrl}/api/snippets/shared/${shareToken}`;
  }
}