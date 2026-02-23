"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Code2,
  Zap,
  Globe,
  Shield,
  Layers,
  Share2,
  BookOpen,
  Check,
  Star,
  Sparkles,
} from "lucide-react";
import { Navbar } from "@/components/navbar";

// ─── Data ────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Zap,
    title: "Quick Save",
    description:
      "Save any code snippet in seconds with syntax highlighting across every major language.",
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-100",
  },
  {
    icon: Code2,
    title: "50+ Languages",
    description:
      "From Python to Rust, TypeScript to Solidity — every language you work with is supported.",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
  },
  {
    icon: Shield,
    title: "Blockchain Ownership",
    description:
      "Every snippet is tied to your Stellar wallet. Provable, decentralised ownership on-chain.",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100",
  },
  {
    icon: Layers,
    title: "Smart Organisation",
    description:
      "Tag, title, and categorise snippets so finding the right piece of code takes seconds.",
    color: "text-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-100",
  },
  {
    icon: Share2,
    title: "Easy Sharing",
    description:
      "Share snippets with teammates or the whole developer community with a single link.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
  },
  {
    icon: Globe,
    title: "Access Anywhere",
    description:
      "Cloud-persisted with NeonDB. Your snippets are available on every device, always in sync.",
    color: "text-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-100",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Connect Your Wallet",
    description:
      "Link your Stellar wallet to establish decentralised ownership of every snippet you save.",
  },
  {
    step: "02",
    title: "Save Your Snippets",
    description:
      "Add title, language, and code. Your snippet is stored securely in the database in one click.",
  },
  {
    step: "03",
    title: "Access From Anywhere",
    description:
      "Retrieve, edit, or share your snippets from any device — your code follows you everywhere.",
  },
];

const STATS = [
  { value: "∞", label: "Snippets per account", color: "text-indigo-600" },
  { value: "50+", label: "Languages supported", color: "text-violet-600" },
  { value: "100%", label: "Private by default", color: "text-sky-600" },
];

// ─── Code preview mock ────────────────────────────────────────────────────────

const CODE_LINES = [
  { tokens: [{ text: "const ", color: "#7c3aed" }, { text: "saveSnippet", color: "#2563eb" }, { text: " = async (", color: "#334155" }, { text: "data", color: "#0369a1" }, { text: ") => {", color: "#334155" }] },
  { tokens: [{ text: "  const ", color: "#7c3aed" }, { text: "{ title, language, code } ", color: "#0369a1" }, { text: "= data;", color: "#334155" }] },
  { tokens: [{ text: "  await ", color: "#7c3aed" }, { text: "db", color: "#0369a1" }, { text: ".", color: "#334155" }, { text: "snippet", color: "#0369a1" }, { text: ".", color: "#334155" }, { text: "create", color: "#2563eb" }, { text: "({", color: "#334155" }] },
  { tokens: [{ text: "    data", color: "#334155" }, { text: ": { title, language, code },", color: "#64748b" }] },
  { tokens: [{ text: "  });", color: "#334155" }] },
  { tokens: [{ text: "  return ", color: "#7c3aed" }, { text: "{ success: ", color: "#334155" }, { text: "true ", color: "#059669" }, { text: "};", color: "#334155" }] },
  { tokens: [{ text: "};", color: "#334155" }] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Figma Design Reference:
          Figma File: https://www.figma.com/design/codely-landing-page
          (Replace with actual Figma link once shared by project maintainer)
      */}

      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white pt-20 pb-28">
        {/* Soft decorative blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-indigo-100/60 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 right-0 w-[400px] h-[400px] rounded-full bg-violet-100/50 blur-3xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left — copy */}
            <div className="animate-fade-in-up">
              {/* Badge */}
              <span className="badge-pill mb-6 inline-flex">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Stellar-powered code storage
              </span>

              <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-slate-900 mb-6">
                The smarter way to{" "}
                <span className="text-gradient">save code snippets</span>
              </h1>

              <p className="text-lg text-slate-500 mb-10 max-w-lg leading-relaxed">
                Codely is a modern, blockchain-backed platform for developers.
                Save, organise, and access your code snippets securely — powered
                by the Stellar network.
              </p>

              {/* CTA row */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/snippets">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 font-semibold shadow-md hover:shadow-lg transition-all duration-200 group"
                  >
                    Get Started Free
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 rounded-full px-8 font-semibold transition-all duration-200"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    How It Works
                  </Button>
                </Link>
              </div>

              {/* Trust signals */}
              <div className="mt-10 flex items-center gap-6 text-sm text-slate-400">
                {["No credit card required", "Free forever tier", "Open source"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — code panel */}
            <div className="animate-slide-in-right hidden lg:block">
              <div className="animate-float relative">
                {/* Outer glow */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-300/30 to-violet-300/30 blur-2xl scale-105" />

                {/* Card */}
                <div className="relative glass-card rounded-2xl overflow-hidden">
                  {/* Window chrome */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                    <span className="w-3 h-3 rounded-full bg-rose-400" />
                    <span className="w-3 h-3 rounded-full bg-amber-400" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400" />
                    <span className="ml-4 text-xs font-mono text-slate-400">
                      saveSnippet.ts
                    </span>
                  </div>

                  {/* Line numbers + code */}
                  <div className="p-6 font-mono text-sm leading-7 bg-white">
                    {CODE_LINES.map((line, i) => (
                      <div key={i} className="flex gap-5">
                        <span className="text-slate-300 select-none w-4 text-right shrink-0">
                          {i + 1}
                        </span>
                        <span>
                          {line.tokens.map((tk, j) => (
                            <span key={j} style={{ color: tk.color }}>
                              {tk.text}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer tag */}
                  <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
                    <span className="text-xs font-mono text-indigo-500 font-medium">
                      TypeScript
                    </span>
                    <span className="text-xs text-slate-400">Codely Snippet</span>
                  </div>
                </div>

                {/* Floating badges */}
                <div className="absolute -top-4 -right-4 bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-medium text-slate-600">Saved to chain</span>
                </div>
                <div className="absolute -bottom-4 -left-4 bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-medium text-slate-600">Starred snippet</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {STATS.map(({ value, label, color }, i) => (
            <div
              key={label}
              className={`animate-fade-in-up delay-${(i + 1) * 100}`}
            >
              <div className={`text-5xl font-extrabold mb-1 ${color}`}>
                {value}
              </div>
              <p className="text-slate-500 text-sm font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Heading */}
          <div className="text-center max-w-2xl mx-auto mb-16 animate-fade-in-up">
            <span className="badge-pill mb-4 inline-flex">Everything you need</span>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
              Built for developers, by developers
            </h2>
            <p className="text-slate-500 text-lg">
              Every feature is designed to fit seamlessly into your workflow — from
              first save to team sharing.
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description, color, bg, border }, i) => (
              <div
                key={title}
                className={`animate-fade-in-up delay-${(i % 3) * 100 + 100} group rounded-2xl border ${border} ${bg} p-6 hover:shadow-md transition-all duration-300 hover:-translate-y-1`}
              >
                <div
                  className={`${bg} border ${border} w-11 h-11 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3 className="text-slate-900 font-semibold text-lg mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 animate-fade-in-up">
            <span className="badge-pill mb-4 inline-flex">Simple workflow</span>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
              Up and running in 3 steps
            </h2>
            <p className="text-slate-500 text-lg">
              No complicated setup. Connect, save, and access — that&apos;s it.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-10 left-1/6 right-1/6 h-px bg-gradient-to-r from-indigo-200 via-violet-200 to-sky-200" />

            {STEPS.map(({ step, title, description }, i) => (
              <div
                key={step}
                className={`animate-fade-in-up delay-${(i + 1) * 100} flex flex-col items-center text-center`}
              >
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full bg-white border-2 border-indigo-100 shadow-md flex items-center justify-center">
                    <span className="text-2xl font-extrabold text-gradient">{step}</span>
                  </div>
                </div>
                <h3 className="text-slate-900 font-bold text-xl mb-3">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed max-w-xs">{description}</p>
              </div>
            ))}
          </div>

          {/* CTA under how it works */}
          <div className="text-center mt-14 animate-fade-in-up delay-400">
            <Link href="/snippets">
              <Button
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-10 font-semibold shadow-md hover:shadow-lg transition-all duration-200 group"
              >
                Start Saving Now
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stellar Integration Highlight ─────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-1 shadow-xl">
            <div className="rounded-[calc(1.5rem-4px)] bg-white/95 backdrop-blur p-10 lg:p-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Copy */}
              <div className="animate-fade-in-up">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 mb-5">
                  <Globe className="w-4 h-4" />
                  Stellar Blockchain Integration
                </span>
                <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 mb-5">
                  Your code, your ownership — on-chain
                </h2>
                <p className="text-slate-500 text-base leading-relaxed mb-8">
                  Every snippet in Codely is linked to your Stellar wallet address.
                  This gives you provable, decentralised ownership — no middlemen,
                  no lock-in. Future extensions include Snippet NFTs, on-chain
                  verification, and permission-based access control.
                </p>

                <ul className="space-y-3 mb-8">
                  {[
                    "Wallet-based identity — no username/password needed",
                    "On-chain snippet ownership via Stellar",
                    "Foundation for Snippet NFTs & permissioned sharing",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <Link href="/snippets">
                  <Button
                    size="lg"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 font-semibold shadow-md hover:shadow-lg transition-all duration-200 group"
                  >
                    Connect Wallet & Start
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>

              {/* Visual */}
              <div className="animate-slide-in-right flex items-center justify-center">
                <div className="relative w-full max-w-sm">
                  {/* Outer glow ring */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 blur-3xl opacity-20 scale-110" />
                  <div className="relative glass-card rounded-2xl p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mx-auto mb-5 animate-pulse-ring">
                      <Globe className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-xs font-mono text-slate-400 mb-1">Connected wallet</p>
                    <p className="text-sm font-mono text-slate-800 font-semibold break-all mb-5">
                      G B 3 Q … X 7 K F
                    </p>
                    <div className="space-y-2">
                      {["snippet_001.ts", "snippet_002.py", "snippet_003.rs"].map((s) => (
                        <div
                          key={s}
                          className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2"
                        >
                          <Code2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="text-xs font-mono text-slate-600">{s}</span>
                          <Check className="w-3.5 h-3.5 text-emerald-500 ml-auto shrink-0" />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-emerald-600 font-medium mt-4 flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      Ownership verified on Stellar
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-8 shadow-lg mx-auto">
            <Code2 className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 mb-5">
            Ready to save smarter?
          </h2>
          <p className="text-slate-500 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Join developers who use Codely to keep every useful piece of code
            organised, accessible, and owned — forever.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/snippets">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-10 font-semibold shadow-md hover:shadow-lg transition-all duration-200 group"
              >
                Start for Free
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="#features">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 rounded-full px-10 font-semibold transition-all duration-200"
              >
                Explore Features
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
            {/* Brand */}
            <div>
              <Link href="/" className="flex items-center gap-2 mb-4">
                <Code2 className="w-6 h-6 text-indigo-600" />
                <span className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Codely
                </span>
              </Link>
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                A Stellar-powered code snippet platform for developers who care
                about ownership and organisation.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wider">
                Navigation
              </h4>
              <ul className="space-y-2.5 text-sm text-slate-500">
                {[
                  { label: "Home", href: "/" },
                  { label: "Snippets", href: "/snippets" },
                  { label: "Features", href: "#features" },
                  { label: "How It Works", href: "#how-it-works" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href} className="hover:text-indigo-600 transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Design / Contribute */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wider">
                Resources
              </h4>
              <ul className="space-y-2.5 text-sm text-slate-500">
                <li>
                  {/* Figma Design Link — replace the URL below with the actual Figma file once shared by the maintainer */}
                  <a
                    id="figma-design-link"
                    href="https://www.figma.com/design/codely-landing-page"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Figma Design File
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/SudiptaPaul-31/Codely"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 transition-colors"
                  >
                    GitHub Repository
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/SudiptaPaul-31/Codely/blob/main/README.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 transition-colors"
                  >
                    Documentation
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <p>© 2025 Codely. Save smarter, code better.</p>
            <p>
              Built with Next.js · TypeScript · Tailwind CSS · Stellar
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
