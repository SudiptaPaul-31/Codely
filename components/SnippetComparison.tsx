"use client";

import { Calendar, Code2, User } from "lucide-react";
import {
  buildSideBySideDiff,
  ComparisonSnippet,
  getContributor,
  getMetadataDifferences,
  tokenizeLine,
} from "@/lib/snippet-comparison";

const tokenColor = {
  plain: "text-slate-200",
  keyword: "text-fuchsia-300",
  string: "text-emerald-300",
  number: "text-amber-300",
  comment: "text-slate-500 italic",
};

function HighlightedLine({ code, language }: { code?: string; language: string }) {
  if (code === undefined) return <span aria-hidden="true">&nbsp;</span>;
  return <>
    {tokenizeLine(code, language).map((token, index) => (
      <span className={tokenColor[token.kind]} key={`${index}-${token.value}`}>
        {token.value}
      </span>
    ))}
  </>;
}

function Metadata({ snippet, differences }: {
  snippet: ComparisonSnippet;
  differences: ReturnType<typeof getMetadataDifferences>;
}) {
  const item = (different: boolean) =>
    `flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
      different ? "border-amber-400/40 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[.03] text-slate-400"
    }`;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className={item(differences.language)}><Code2 className="h-3.5 w-3.5" /><span>{snippet.language}</span></div>
      <div className={item(differences.createdAt)}><Calendar className="h-3.5 w-3.5" /><time>{new Date(snippet.created_at).toLocaleDateString()}</time></div>
      <div className={item(differences.contributor)} title={getContributor(snippet)}><User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{getContributor(snippet)}</span></div>
    </div>
  );
}

export function SnippetComparison({ left, right }: { left: ComparisonSnippet; right: ComparisonSnippet }) {
  const rows = buildSideBySideDiff(left.code, right.code);
  const differences = getMetadataDifferences(left, right);
  const pane = (side: "left" | "right", snippet: ComparisonSnippet) => (
    <section className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950">
      <div className="border-b border-white/10 p-4">
        <h2 className="mb-3 truncate font-semibold text-white" title={snippet.title}>{snippet.title}</h2>
        <Metadata snippet={snippet} differences={differences} />
      </div>
      <div className="overflow-x-auto" role="region" aria-label={`${snippet.title} code`}>
        <pre className="min-w-max py-2 font-mono text-[13px] leading-6">
          {rows.map((row, index) => {
            const kind = row.kind;
            const line = side === "left" ? row.left : row.right;
            const number = side === "left" ? row.leftLine : row.rightLine;
            const changed = kind === "changed";
            const removed = side === "left" && kind === "removed";
            const added = side === "right" && kind === "added";
            return (
              <div
                key={index}
                className={`flex min-h-6 ${changed ? "bg-amber-500/10" : removed ? "bg-rose-500/15" : added ? "bg-emerald-500/15" : ""}`}
              >
                <span className="w-12 shrink-0 select-none border-r border-white/5 pr-3 text-right text-slate-600">{number ?? ""}</span>
                <code className="px-4"><HighlightedLine code={line} language={snippet.language} /></code>
              </div>
            );
          })}
        </pre>
      </div>
    </section>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-400" aria-label="Difference legend">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500/60" />Removed</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/60" />Added</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/60" />Changed</span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {pane("left", left)}
        {pane("right", right)}
      </div>
    </div>
  );
}
