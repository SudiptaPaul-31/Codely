import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

export type FeeStatus =
  | 'estimating'
  | 'estimated'
  | 'updated'
  | 'insufficient_balance'
  | 'unable_to_estimate'
  | 'ready_for_submission';

export interface FeeDrift {
  previousFee: string;
  currentFee: string;
  asset: string;
}

export interface FeeResult {
  estimatedFee: string;
  asset: string;
  network: string;
  feeStatus: FeeStatus;
  estimatedAt: string;
  balanceSufficient: boolean;
  requiredBalance?: string;
  availableBalance?: string;
  feeDrift?: FeeDrift | null;
  message?: string;
}

export interface FeeSummaryPanelProps {
  /** Transaction amount in the display asset (e.g. "100.00"). */
  amount: string;
  /** Asset of the transaction (e.g. "XLM"). */
  asset?: string;
  /** Currently configured Stellar network (e.g. "testnet"). */
  network: string;
  /** Serializable transaction payload used for server-side estimation. */
  transactionPayload: Record<string, unknown>;
  /** Optional pre-fetched estimate (e.g. from a parent workflow). */
  initialEstimate?: FeeResult | null;
  /** Called when the user confirms the fee and wants to proceed. */
  onConfirm?: (estimate: FeeResult) => void | Promise<void>;
  /** Called whenever the estimate changes (useful for parent state). */
  onEstimateChange?: (estimate: FeeResult | null) => void;
  /** Optional custom fetcher (for tests). Defaults to POST /api/stellar/estimate-fee. */
  fetchEstimate?: (payload: Record<string, unknown>) => Promise<FeeResult>;
  /** Optional custom validator (for tests). Defaults to POST /api/stellar/validate-transaction. */
  validateTransaction?: (payload: Record<string, unknown>) => Promise<FeeResult>;
  /** Optional className for the wrapper. */
  className?: string;
}

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

const decimalRe = /^\d{1,18}(?:\.\d{1,7})?$/;

function isValidAmount(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!decimalRe.test(trimmed)) return false;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0;
}

// Strilla (7dp) safe arithmetic using BigInt on strollas.
const STROLLAS = 10_000_000;
