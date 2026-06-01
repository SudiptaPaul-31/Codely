import crypto from "crypto";

export async function mintSnippetNFT({
  title,
  language,
  code,
}: {
  title: string;
  language: string;
  code: string;
}) {
  const snippetHash = crypto.createHash("sha256").update(code).digest("hex");
  const txHash = crypto.randomBytes(32).toString("hex");

  return {
    success: true,
    txHash,
    metadata: {
      title,
      language,
      snippetHash,
      createdAt: new Date().toISOString(),
    },
  };
}