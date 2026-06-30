"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletConnect";
import { formatDistanceToNow } from "date-fns";

interface Transaction {
  id: string;
  wallet_address: string;
  type: string;
  description: string | null;
  metadata: any;
  created_at: string;
}

export default function TransactionHistoryPage() {
  const { connected, publicKey } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }

    const fetchTransactions = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(
          `/api/transactions?page=${page}&pageSize=${pageSize}`,
          {
            headers: {
              "x-wallet-address": publicKey,
            },
          },
        );

        if (!res.ok) {
          throw new Error("Failed to fetch transactions");
        }

        const data = await res.json();
        setTransactions(data.transactions || []);
        setTotalPages(Math.ceil((data.total || 0) / pageSize) || 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [connected, publicKey, page]);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500 mb-4">
          Transaction History
        </h1>
        <p className="text-gray-400 mb-6">
          Please connect your Stellar wallet to view your activity history.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl min-h-screen">
      <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500 mb-2">
        Wallet Activity
      </h1>
      <p className="text-gray-400 mb-8">
        A secure, queryable log of all actions associated with your connected
        wallet.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center text-gray-400">
          No transactions found for this wallet.
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-wider">
                      {tx.type.replace("_", " ")}
                    </span>
                    <span className="text-gray-500 text-sm">
                      {formatDistanceToNow(new Date(tx.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-gray-200">{tx.description}</p>
                </div>
                {tx.metadata?.snippetId && (
                  <div className="text-sm text-gray-500 font-mono bg-gray-950 px-3 py-1.5 rounded-md">
                    ID: {tx.metadata.snippetId.split("-")[0]}...
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-8 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-md bg-gray-800 text-gray-300 disabled:opacity-50 hover:bg-gray-700 transition-colors"
              >
                Previous
              </button>
              <span className="text-gray-400 text-sm">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-md bg-gray-800 text-gray-300 disabled:opacity-50 hover:bg-gray-700 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
