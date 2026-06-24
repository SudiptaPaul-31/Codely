import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL || "postgresql://dummy");

export async function addReputationPoints(walletAddress: string, points: number, action: string, transactionHash?: string) {
  try {
    // Upsert reputation
    await sql`
      INSERT INTO reputation (wallet_address, score, updated_at)
      VALUES (${walletAddress}, ${points}, CURRENT_TIMESTAMP)
      ON CONFLICT (wallet_address) DO UPDATE
      SET score = reputation.score + EXCLUDED.score,
          updated_at = CURRENT_TIMESTAMP
    `;

    // Add action log
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO reputation_actions (id, wallet_address, action, points, transaction_hash)
      VALUES (${id}, ${walletAddress}, ${action}, ${points}, ${transactionHash || null})
    `;

    return true;
  } catch (error) {
    console.error("Error adding reputation points:", error);
    throw error;
  }
}

export async function deductReputationPoints(walletAddress: string, points: number, action: string, transactionHash?: string) {
  try {
    // Upsert reputation (deduct)
    await sql`
      INSERT INTO reputation (wallet_address, score, updated_at)
      VALUES (${walletAddress}, 0, CURRENT_TIMESTAMP)
      ON CONFLICT (wallet_address) DO UPDATE
      SET score = GREATEST(0, reputation.score - ${points}),
          updated_at = CURRENT_TIMESTAMP
    `;

    // Add action log
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO reputation_actions (id, wallet_address, action, points, transaction_hash)
      VALUES (${id}, ${walletAddress}, ${action}, -${points}, ${transactionHash || null})
    `;

    return true;
  } catch (error) {
    console.error("Error deducting reputation points:", error);
    throw error;
  }
}

export async function getReputation(walletAddress: string) {
  try {
    const result = await sql`SELECT score FROM reputation WHERE wallet_address = ${walletAddress}`;
    return result[0]?.score || 0;
  } catch (error) {
    console.error("Error fetching reputation:", error);
    return 0;
  }
}

export async function getReputationActions(walletAddress: string, limit = 10) {
  try {
    const result = await sql`
      SELECT action, points, created_at, transaction_hash 
      FROM reputation_actions 
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return result;
  } catch (error) {
    console.error("Error fetching reputation actions:", error);
    return [];
  }
}

export function getReputationBadge(score: number): string {
  if (score >= 1000) return "Gold";
  if (score >= 500) return "Silver";
  if (score >= 100) return "Bronze";
  return "Newcomer";
}
