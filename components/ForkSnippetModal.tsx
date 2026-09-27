"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import { GitFork, Sparkles } from "lucide-react";
import Loader from "@/components/ui/loader";
import { toast } from "sonner";
import { useWallet } from "@/components/WalletConnect";

export interface SnippetToFork {
  id: string;
  title: string;
  description?: string;
  code?: string;
  language?: string;
  tags?: string[] | string;
  licenseType?: string;
}

interface ForkSnippetModalProps {
  snippet: SnippetToFork | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (forkedSnippet: any) => Promise<void> | void;
}

export function ForkSnippetModal({
  snippet,
  isOpen,
  onClose,
  onSuccess,
}: ForkSnippetModalProps) {
  const wallet = useWallet();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [tags, setTags] = useState("");
  const [licenseType, setLicenseType] = useState("None");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (snippet) {
      setTitle(`Fork of ${snippet.title}`);
      setDescription(snippet.description || "");
      setCode(snippet.code || "");
      setLanguage(snippet.language || "javascript");
      const tagStr = Array.isArray(snippet.tags)
        ? snippet.tags.join(", ")
        : typeof snippet.tags === "string"
        ? snippet.tags
        : "";
      setTags(tagStr);
      setLicenseType(snippet.licenseType || "None");
    }
  }, [snippet]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snippet) return;

    const walletAddress = wallet?.publicKey;
    if (!walletAddress) {
      toast.error("Please connect your Stellar wallet to fork this snippet.");
      return;
    }

    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }

    if (!code.trim()) {
      toast.error("Code cannot be empty.");
      return;
    }

    try {
      setSubmitting(true);
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        title: title.trim(),
        description: description.trim(),
        code,
        language,
        tags: parsedTags.length > 0 ? parsedTags : ["fork"],
        licenseType: licenseType === "None" ? undefined : licenseType,
        ownerWalletAddress: walletAddress,
      };

      const res = await fetch(`/api/snippets/${snippet.id}/fork`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Failed to fork snippet");
      }

      const forkedSnippet = await res.json();
      toast.success(`Successfully forked "${snippet.title}"!`);

      if (onSuccess) {
        await onSuccess(forkedSnippet);
      }
      onClose();
    } catch (err: any) {
      console.error("Error forking snippet:", err);
      toast.error(err.message || "Failed to fork snippet. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!snippet) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-900 border-purple-500/30 text-slate-100 backdrop-blur-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-cyan-400">
            <GitFork className="h-5 w-5" />
            <span className="text-xs uppercase font-semibold tracking-wider">
              Fork & Customize
            </span>
          </div>
          <DialogTitle className="text-xl font-bold text-white">
            Fork Snippet
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            Create an independent, editable copy derived from{" "}
            <span className="text-slate-200 font-semibold font-mono">
              &ldquo;{snippet.title}&rdquo;
            </span>
            . Derivation history will be linked to the original snippet.
          </DialogDescription>
        </DialogHeader>

        {/* Derivation origin banner */}
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 p-3 flex items-center gap-2.5 text-xs text-cyan-300">
          <Sparkles className="h-4 w-4 shrink-0 text-cyan-400" />
          <div className="min-w-0">
            <span className="font-semibold">Original snippet ID:</span>{" "}
            <span className="font-mono text-slate-300">{snippet.id}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fork-title" className="text-white text-xs font-semibold">
              Title
            </Label>
            <Input
              id="fork-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Snippet title"
              required
              className="bg-slate-800/80 border-purple-500/30 text-white placeholder-slate-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fork-desc" className="text-white text-xs font-semibold">
              Description
            </Label>
            <Textarea
              id="fork-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe modifications or purpose of this fork"
              rows={2}
              className="bg-slate-800/80 border-purple-500/30 text-white placeholder-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-white text-xs font-semibold">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="bg-slate-800/80 border-purple-500/30 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-purple-500/30 text-white max-h-60">
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang.charAt(0).toUpperCase() + lang.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-white text-xs font-semibold">License</Label>
              <Select value={licenseType} onValueChange={setLicenseType}>
                <SelectTrigger className="bg-slate-800/80 border-purple-500/30 text-white">
                  <SelectValue placeholder="Select license" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-purple-500/30 text-white">
                  {["None", "MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause"].map((lic) => (
                    <SelectItem key={lic} value={lic}>
                      {lic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fork-code" className="text-white text-xs font-semibold">
              Code
            </Label>
            <Textarea
              id="fork-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter snippet code..."
              rows={8}
              required
              className="bg-slate-950 font-mono text-xs text-slate-200 border-purple-500/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fork-tags" className="text-white text-xs font-semibold">
              Tags (comma-separated)
            </Label>
            <Input
              id="fork-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. react, hooks, stellar"
              className="bg-slate-800/80 border-purple-500/30 text-white placeholder-slate-500"
            />
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader /> Forking...
                </>
              ) : (
                <>
                  <GitFork className="h-4 w-4" /> Fork Snippet
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ForkSnippetModal;
