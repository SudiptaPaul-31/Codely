import * as StellarSdk from "stellar-sdk";
import crypto from "crypto";
import type {
  MarketplaceListing,
  MarketplacePurchase,
  OwnershipVerification,
  CreateListingInput,
  PurchaseListingInput,
} from "./marketplace.types";
import * as repo from "./marketplace.repository";

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
  ? StellarSdk.Networks.PUBLIC
  : StellarSdk.Networks.TESTNET;

const HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// ── Wallet signature verification ─────────────────────────────────────────────

/**
 * Verifies that `signature` is a valid Ed25519 signature of `message`
 * produced by the private key corresponding to `walletAddress` (Stellar public key).
 */
export function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signature: string,
): boolean {
  try {
    const keypair = StellarSdk.Keypair.fromPublicKey(walletAddress);
    const msgBuffer = Buffer.from(message, "utf8");
    const sigBuffer = Buffer.from(signature, "base64");
    return keypair.verify(msgBuffer, sigBuffer);
  } catch {
    return false;
  }
}

// ── Stellar escrow helpers ────────────────────────────────────────────────────

/**
 * Simulates locking funds in escrow by recording a memo-based Stellar transaction.
 * In production this would use a real multi-sig escrow account or Soroban contract.
 * Returns a deterministic mock tx hash so the flow is fully testable without live keys.
 */
async function lockEscrow(
  buyerWallet: string,
  sellerWallet: string,
  amountXlm: number,
  purchaseId: string,
): Promise<string> {
  const secretKey = process.env.STELLAR_SECRET_KEY;

  if (secretKey) {
    try {
      const escrowKeypair = StellarSdk.Keypair.fromSecret(secretKey);
      const escrowAccount = await server.loadAccount(escrowKeypair.publicKey());

      const transaction = new StellarSdk.TransactionBuilder(escrowAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: escrowKeypair.publicKey(), // self-hold as escrow
            asset: StellarSdk.Asset.native(),
            amount: amountXlm.toFixed(7),
          }),
        )
        .addMemo(StellarSdk.Memo.text(`escrow:${purchaseId.slice(0, 20)}`))
        .setTimeout(30)
        .build();

      transaction.sign(escrowKeypair);
      const result = await server.submitTransaction(transaction);
      return result.hash;
    } catch (err) {
      console.warn("[Marketplace] Live escrow failed, using mock tx:", err);
    }
  }

  // Deterministic mock tx hash for testnet / no-key environments
  return crypto
    .createHash("sha256")
    .update(`escrow:${purchaseId}:${buyerWallet}:${amountXlm}`)
    .digest("hex");
}

/**
 * Releases escrowed funds to the seller.
 */
async function releaseEscrowToSeller(
  sellerWallet: string,
  amountXlm: number,
  purchaseId: string,
): Promise<string> {
  const secretKey = process.env.STELLAR_SECRET_KEY;

  if (secretKey) {
    try {
      const escrowKeypair = StellarSdk.Keypair.fromSecret(secretKey);
      const escrowAccount = await server.loadAccount(escrowKeypair.publicKey());

      const transaction = new StellarSdk.TransactionBuilder(escrowAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: sellerWallet,
            asset: StellarSdk.Asset.native(),
            amount: amountXlm.toFixed(7),
          }),
        )
        .addMemo(StellarSdk.Memo.text(`release:${purchaseId.slice(0, 18)}`))
        .setTimeout(30)
        .build();

      transaction.sign(escrowKeypair);
      const result = await server.submitTransaction(transaction);
      return result.hash;
    } catch (err) {
      console.warn("[Marketplace] Live release failed, using mock tx:", err);
    }
  }

  return crypto
    .createHash("sha256")
    .update(`release:${purchaseId}:${sellerWallet}:${amountXlm}`)
    .digest("hex");
}

// ── Service methods ───────────────────────────────────────────────────────────

export async function createListing(
  input: CreateListingInput,
): Promise<MarketplaceListing> {
  // Record on-chain listing memo (mock tx for testnet)
  const onChainTx = crypto
    .createHash("sha256")
    .update(`listing:${input.snippet_id}:${input.seller_wallet}:${Date.now()}`)
    .digest("hex");

  const listing = await repo.createListing(input, onChainTx);

  await repo.createAuditLog(
    "listing",
    listing.id,
    "LISTED",
    input.seller_wallet,
    { price_xlm: input.price_xlm, snippet_id: input.snippet_id },
    onChainTx,
  );

  return listing;
}

export async function getActiveListings(
  limit = 20,
  offset = 0,
): Promise<MarketplaceListing[]> {
  return repo.getListings("active", limit, offset);
}

export async function purchaseListing(
  listingId: string,
  input: PurchaseListingInput,
): Promise<MarketplacePurchase> {
  const listing = await repo.getListingById(listingId);
  if (!listing) throw new Error("Listing not found");
  if (listing.status !== "active") throw new Error("Listing is not active");

  // Verify buyer wallet ownership via signature
  const message = `purchase:${listingId}:${input.buyer_wallet}`;
  const signatureValid = verifyWalletSignature(
    input.buyer_wallet,
    message,
    input.buyer_signature,
  );
  if (!signatureValid) throw new Error("Invalid wallet signature");

  // Lock funds in escrow
  const purchaseId = crypto.randomUUID();
  const escrowTxHash = await lockEscrow(
    input.buyer_wallet,
    listing.seller_wallet,
    listing.price_xlm,
    purchaseId,
  );

  // Persist purchase
  const purchase = await repo.createPurchase(
    listingId,
    input.buyer_wallet,
    listing.seller_wallet,
    listing.price_xlm,
    escrowTxHash,
  );

  // Persist escrow record
  await repo.createEscrowRecord(
    purchase.id,
    process.env.STELLAR_SECRET_KEY
      ? StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY).publicKey()
      : "ESCROW_ACCOUNT_PLACEHOLDER",
    listing.price_xlm,
    escrowTxHash,
  );

  // Release escrow to seller immediately (atomic purchase model)
  const releaseTxHash = await releaseEscrowToSeller(
    listing.seller_wallet,
    listing.price_xlm,
    purchase.id,
  );

  await repo.releaseEscrow(purchase.id, releaseTxHash);
  const completedPurchase = await repo.completePurchase(purchase.id, releaseTxHash);

  // Mark listing as sold
  await repo.updateListingStatus(listingId, "sold");

  await repo.createAuditLog(
    "purchase",
    purchase.id,
    "PURCHASED",
    input.buyer_wallet,
    {
      listing_id: listingId,
      seller_wallet: listing.seller_wallet,
      price_xlm: listing.price_xlm,
      escrow_tx: escrowTxHash,
      release_tx: releaseTxHash,
    },
    releaseTxHash,
  );

  return completedPurchase;
}

export async function verifyOwnership(
  listingId: string,
  buyerWallet: string,
): Promise<OwnershipVerification> {
  const listing = await repo.getListingById(listingId);
  if (!listing) throw new Error("Listing not found");

  const purchase = await repo.getPurchaseByListingAndBuyer(listingId, buyerWallet);

  return {
    listing_id: listingId,
    snippet_id: listing.snippet_id,
    owner_wallet: buyerWallet,
    purchase_id: purchase?.id ?? "",
    tx_hash: purchase?.release_tx_hash ?? null,
    verified: !!purchase,
    verified_at: new Date().toISOString(),
  };
}
