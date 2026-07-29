export class IPFSService {
  private static pinataJwt = process.env.PINATA_JWT;
  private static pinataGateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";

  /**
   * Uploads snippet content to IPFS via Pinata.
   * Returns the IPFS CID string.
   */
  static async uploadToIPFS(content: string): Promise<string> {
    if (!this.pinataJwt) {
      console.warn("[IPFSService] PINATA_JWT not configured, using mock IPFS upload.");
      // Mock CID for development/testing if Pinata is not configured
      return "QmMockCID" + Date.now().toString(36);
    }

    try {
      const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.pinataJwt}`,
        },
        body: JSON.stringify({
          pinataContent: {
            content,
          },
          pinataMetadata: {
            name: `Snippet_${Date.now()}`,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.IpfsHash;
    } catch (error) {
      console.error("[IPFSService] Error uploading to IPFS:", error);
      throw error;
    }
  }

  /**
   * Retrieves snippet content from IPFS.
   */
  static async fetchFromIPFS(cid: string): Promise<string> {
    if (cid.startsWith("QmMockCID")) {
      return "Mock content for CID: " + cid;
    }

    try {
      const url = `${this.pinataGateway}/ipfs/${cid}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from IPFS gateway: ${response.status}`);
      }
      
      const data = await response.json();
      return data.content || "";
    } catch (error) {
      console.error("[IPFSService] Error fetching from IPFS:", error);
      throw error;
    }
  }
}
