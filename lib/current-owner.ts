import { cookies } from "next/headers";

// ADAPT: replace the body with however Codely identifies the current wallet on the server.
export async function getCurrentOwner(): Promise<string | null> {
  const store = await cookies();
  return store.get("wallet_address")?.value ?? null;
}