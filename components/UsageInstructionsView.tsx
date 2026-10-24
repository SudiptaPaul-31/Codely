"use client";

import React, { useId } from "react";
import { SafeMarkdown } from "@/lib/safe-markdown";
import { PROSE_SECTIONS, type UsageExample, type UsageInstructions } from "@/lib/usage-instructions";

type HeadingTag = "h3" | "h4" | "h5";

function ExampleBlock({
  title,
  example,
  kind,
  Heading,
}: {
  title: string;
  example: UsageExample;
  kind: "input" | "output";
  Heading: HeadingTag;
}) {
  const id = useId();
  return (
    <figure aria-labelledby={id} data-testid={`usage-${kind}-example`} className="min-w-0 space-y-1.5">
      <Heading id={id} className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
        {example.language && <span className="ml-2 font-mono normal-case text-slate-500">{example.language}</span>}
      </Heading>
      <pre
        className={`overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed text-slate-200 ${
          kind === "input" ? "border-cyan-500/30 bg-cyan-950/20" : "border-emerald-500/30 bg-emerald-950/20"
        }`}
      >
        <code>{example.code}</code>
      </pre>
    </figure>
  );
}

/**
 * Read-only rendering of usage instructions. `headingLevel` is the level of
 * each section title, so the panel fits the page's heading outline.
 */
export function UsageInstructionsView({
  usage,
  headingLevel = 4,
}: {
  usage: UsageInstructions;
  headingLevel?: 4 | 5;
}) {
  const Heading = `h${headingLevel}` as HeadingTag;
  return (
    <div className="space-y-5">
      {PROSE_SECTIONS.filter(({ key }) => key !== "notes" && usage[key]).map(({ key, label }) => (
        <section key={key} aria-label={label} data-testid={`usage-section-${key}`} className="space-y-2">
          <Heading className="text-sm font-semibold text-purple-200">{label}</Heading>
          <SafeMarkdown source={usage[key]!} baseHeadingLevel={headingLevel + 1} />
        </section>
      ))}

      {(usage.inputExample || usage.outputExample) && (
        <div className="grid gap-4 md:grid-cols-2">
          {usage.inputExample && <ExampleBlock title="Input example" example={usage.inputExample} kind="input" Heading={Heading} />}
          {usage.outputExample && <ExampleBlock title="Output example" example={usage.outputExample} kind="output" Heading={Heading} />}
        </div>
      )}

      {usage.notes && (
        <section aria-label="Notes" data-testid="usage-section-notes" className="space-y-2">
          <Heading className="text-sm font-semibold text-purple-200">Notes</Heading>
          <SafeMarkdown source={usage.notes} baseHeadingLevel={headingLevel + 1} />
        </section>
      )}
    </div>
  );
}

export default UsageInstructionsView;
