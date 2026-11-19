"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/WalletConnect";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Snippets", href: "/snippets" },
  { label: "Activity", href: "/transactions" },
];

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const runShortcut = useCallback((action: "save" | "search" | "create") => {
    if (action === "save") {
      window.dispatchEvent(new CustomEvent("codely:save-snippet"));
    } else if (action === "search") {
      window.dispatchEvent(new CustomEvent("codely:open-search"));
    } else {
      window.dispatchEvent(new CustomEvent("codely:create-snippet"));
    }
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      const editable = isEditableTarget(event.target);

      if (key === "s") {
        event.preventDefault();
        runShortcut("save");
      } else if (key === "k" && !editable) {
        event.preventDefault();
        runShortcut("search");
      } else if (key === "n" && !editable) {
        event.preventDefault();
        runShortcut("create");
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [runShortcut]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <header className="border-b border-white/10 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition"
        >
          <Code2 className="w-7 h-7 text-purple-400" />
          <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Codely
          </span>
        </Link>

        {/* Desktop nav links & Wallet */}
        <div className="hidden md:flex items-center gap-4">
          <nav aria-label="Primary navigation" className="flex items-center gap-1">
            {NAV_LINKS.map(({ label, href }) => (
              <Link key={href} href={href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "text-sm font-medium transition-colors",
                    pathname === href
                      ? "text-purple-400 bg-purple-400/10"
                      : "text-gray-300 hover:text-purple-400 hover:bg-purple-400/10",
                  )}
                >
                  {label}
                </Button>
              </Link>
            ))}
          </nav>
          <WalletButton />
        </div>

        {/* Mobile menu button */}
        <button
          ref={menuButtonRef}
          className="md:hidden text-gray-300 hover:text-purple-400 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          title="Shortcuts: Ctrl+S save, Ctrl+K search, Ctrl+N new snippet"
        >
          {mobileOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav id="mobile-navigation" aria-label="Mobile navigation" className="md:hidden border-t border-white/10 bg-black/80 backdrop-blur-md px-4 py-4 flex flex-col gap-2">
          {NAV_LINKS.map(({ label, href }) => (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-sm font-medium",
                  pathname === href
                    ? "text-purple-400 bg-purple-400/10"
                    : "text-gray-300 hover:text-purple-400 hover:bg-purple-400/10",
                )}
              >
                {label}
              </Button>
            </Link>
          ))}
          <div className="mt-2">
            <WalletButton />
          </div>
        </nav>
      )}
    </header>
  );
}