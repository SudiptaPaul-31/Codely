"use client";

import React, { useState } from "react";
import { Check, Copy, User, Code2 } from "lucide-react";
import { tokenizeLine } from "@/lib/snippet-comparison";
import VerificationBadge from "./verification-badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PublicSnippetPreviewProps {
  snippet: {
    title?: string;
    code: string;
    language: string;
    authorName?: string;
    walletAddress?: string;
    isVerified?: boolean;
    verifiedAt?: string;
  };
  className?: string;
}

const tokenColor: Record<string, string> = {
  plain: "text-slate-200",
  keyword: "text-fuchsia-300",
  string: "text-emerald-300",
  number: "text-amber-300",
  comment: "text-slate-500 italic",
};

function HighlightedLine({ code, language }: { code?: string; language: string }) {
  if (code === undefined) return <span aria-hidden="true">&nbsp;</span>;
  return (
    <>
      {tokenizeLine(code, language).map((token, index) => (
        <span className={tokenColor[token.kind] || tokenColor.plain} key={`${index}-${token.value}`}>
          {token.value}
        </span>
      ))}
    </>
  );
}

export function PublicSnippetPreview({ snippet, className }: PublicSnippetPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  const lines = snippet.code.split("\n");
  const authorDisplay = snippet.authorName || snippet.walletAddress;

  return (
    <div className={cn("flex flex-col rounded-xl border border-white/10 bg-slate-950 overflow-hidden w-full max-w-full", className)}>
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-white/10 bg-slate-900/50">
        <div className="flex flex-col gap-1.5 min-w-0">
          {snippet.title && (
            <h2 className="text-base font-semibold text-white truncate" title={snippet.title}>
              {snippet.title}
            </h2>
          )}
          
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            {/* Language Indicator */}
            <div className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1 border border-white/10">
              <Code2 className="w-3.5 h-3.5" />
              <span>{snippet.language || "text"}</span>
            </div>

            {/* Author / Wallet Info */}
            {authorDisplay && (
              <div 
                className="flex items-center gap-1.5 max-w-full"
                title={snippet.walletAddress}
              >
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{authorDisplay}</span>
              </div>
            )}

            {/* Blockchain Verification Status */}
            {snippet.isVerified && (
              <VerificationBadge 
                verified={true} 
                walletAddress={snippet.walletAddress} 
                verifiedAt={snippet.verifiedAt}
              />
            )}
          </div>
        </div>
        
        {/* Copy Button */}
        <div className="flex-shrink-0 self-end sm:self-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="flex items-center gap-1.5 h-8 bg-white/10 hover:bg-white/20 text-white border-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>

      {/* Code section */}
      <div className="overflow-x-auto relative" role="region" aria-label={`${snippet.title || "Snippet"} code`}>
        <pre className="p-4 font-mono text-[13px] leading-6 min-w-max">
          <code>
            {lines.map((line, index) => (
              <div key={index} className="flex min-h-[1.5rem]">
                <span className="w-10 shrink-0 select-none text-right text-slate-600 pr-4 mr-2 border-r border-white/5">
                  {index + 1}
                </span>
                <span className="whitespace-pre">
                  <HighlightedLine code={line} language={snippet.language || "text"} />
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

export default PublicSnippetPreview;
