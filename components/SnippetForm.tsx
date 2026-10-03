"use client";

import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";
import FormSkeleton from "@/components/skeletons/FormSkeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import React, { useEffect, useRef, useState } from "react";
import { SnippetFormValues } from "@/types/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { snippetSchema } from "@/validiation/snippet-form-validiation";
import { toast } from "sonner";
import { useWallet } from "@/wallet/context/WalletContext";
import { signMessage } from "@/wallet/lib/walletAdapters";

interface SnippetFormProps {
  editingId: string | null;
  initialValues?: Partial<SnippetFormValues>;
  closeForm: () => void;
  onSuccess: () => Promise<void>;
  isLoading?: boolean; // Added hook control to intercept loading state
}

type AutosaveStatus = "idle" | "saving" | "saved" | "error";

// Debounce delay for autosave (ms)
const AUTOSAVE_DEBOUNCE_MS = 2000;
// Retry delay after a failed autosave (ms)
const AUTOSAVE_RETRY_MS = 5000;
// Max consecutive retries before giving up on the current draft
const MAX_AUTOSAVE_RETRIES = 3;

export default function SnippetForm({
  editingId,
  initialValues,
  closeForm,
  onSuccess,
  isLoading = false,
}: SnippetFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const wallet = useWallet();
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    getValues,
    formState: { errors },
  } = useForm<SnippetFormValues>({
    resolver: zodResolver(snippetSchema),
    defaultValues: {
      title: "",
      description: "",
      code: "",
      language: "javascript",
      tags: "",
      visibility: "private",
      sharedWith: "",
    },
  });

  // Track the server's updated_at for conflict detection
  const serverUpdatedAtRef = useRef<string | null>(null);
  // Track the last successfully autosaved snapshot to avoid redundant saves
  const lastSavedSnapshotRef = useRef<string>("");
  // Track retry count for the current pending draft
  const retryCountRef = useRef(0);
  // Flag to prevent autosave while a manual save is in progress
  const manualSavingRef = useRef(false);
  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Retry timer ref
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build a stable snapshot string of the current form values
  const buildSnapshot = (values: SnippetFormValues): string => {
    return JSON.stringify({
      title: values.title,
      description: values.description,
      code: values.code,
      language: values.language,
      tags: values.tags,
      licenseType: values.licenseType,
      visibility: values.visibility,
      sharedWith: values.sharedWith,
    });
  };

  useEffect(() => {
    reset({
      title: initialValues?.title ?? "",
      description: initialValues?.description ?? "",
      code: initialValues?.code ?? "",
      language: initialValues?.language ?? "javascript",
      tags: initialValues?.tags ?? "",
      licenseType: initialValues?.licenseType ?? "None",
      visibility: initialValues?.visibility ?? "private",
      sharedWith: initialValues?.sharedWith ?? "",
    });
    // Reset autosave state when switching snippets
    serverUpdatedAtRef.current = null;
    // Seed the last-saved snapshot with the initial values so that autosave
    // does not fire until the user actually changes something.
    lastSavedSnapshotRef.current = buildSnapshot({
      title: initialValues?.title ?? "",
      description: initialValues?.description ?? "",
      code: initialValues?.code ?? "",
      language: initialValues?.language ?? "javascript",
      tags: initialValues?.tags ?? "",
      licenseType: initialValues?.licenseType ?? "None",
      visibility: initialValues?.visibility ?? "private",
      sharedWith: initialValues?.sharedWith ?? "",
    });
    retryCountRef.current = 0;
    setAutosaveStatus("idle");
    setLastSavedAt(null);
  }, [initialValues, reset]);

  // Watch all form fields to trigger autosave
  const watchedValues = watch();

  const buildPayload = (values: SnippetFormValues) => ({
    title: values.title,
    description: values.description,
    code: values.code,
    language: values.language,
    tags: values.tags
      ? values.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    licenseType: values.licenseType === "None" ? undefined : values.licenseType,
    visibility: values.visibility ?? "private",
    sharedWith:
      values.visibility === "shared" && values.sharedWith
        ? values.sharedWith
            .split(",")
            .map((w) => w.trim())
            .filter(Boolean)
        : undefined,
  });

  const performAutosave = async () => {
    if (!editingId) return;
    if (manualSavingRef.current) return;

    const values = getValues();
    const snapshot = buildSnapshot(values);

    // Skip if nothing changed since last successful save
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    // Basic validation before autosaving — skip if required fields are empty
    if (!values.title || !values.description || !values.code || !values.language) {
      return;
    }

    setAutosaveStatus("saving");

    try {
      const payload = buildPayload(values);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      // Send the last known server updated_at for conflict detection
      if (serverUpdatedAtRef.current) {
        headers["If-Unmodified-Since"] = serverUpdatedAtRef.current;
      }

      const res = await fetch(`/api/snippets/${editingId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        // Conflict — another session modified the snippet
        setAutosaveStatus("error");
        toast.error(
          "This snippet was modified in another session. Your changes were not overwritten.",
        );
        return;
      }

      if (!res.ok) throw new Error("Autosave failed");

      const updated = await res.json();
      if (updated?.updated_at) {
        serverUpdatedAtRef.current = updated.updated_at;
      }

      lastSavedSnapshotRef.current = snapshot;
      retryCountRef.current = 0;
      setAutosaveStatus("saved");
      setLastSavedAt(new Date());
    } catch (error) {
      console.error("Autosave error:", error);
      setAutosaveStatus("error");
      toast.error("Autosave failed. Retrying…");

      // Retry mechanism
      if (retryCountRef.current < MAX_AUTOSAVE_RETRIES) {
        retryCountRef.current += 1;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          performAutosave();
        }, AUTOSAVE_RETRY_MS);
      } else {
        toast.error(
          "Autosave failed repeatedly. Your changes are still in the editor — please save manually.",
        );
      }
    }
  };

  // Debounced autosave effect
  useEffect(() => {
    if (!editingId) return;
    if (manualSavingRef.current) return;

    // Skip autosave until initial values are loaded
    if (!watchedValues.title && !watchedValues.code) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      performAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [watchedValues, editingId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const onSubmit = async (data: SnippetFormValues) => {
    try {
      setSubmitting(true);
      manualSavingRef.current = true;

      // Cancel any pending autosave timers
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

      const payload = buildPayload(data);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      // Send the last known server updated_at for conflict detection so a
      // manual save cannot overwrite changes made in another session.
      if (editingId && serverUpdatedAtRef.current) {
        headers["If-Unmodified-Since"] = serverUpdatedAtRef.current;
      }

      if (!editingId && (!wallet?.connected || !wallet.publicKey || !wallet.walletProvider)) {
        throw new Error("Connect a Stellar wallet before creating a snippet.");
      }

      if (!editingId && wallet?.publicKey && wallet.walletProvider) {
        const snippetId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const hashBuffer = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(payload.code),
        );
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        const proofPayload = {
          createdAt,
          hash,
          ownerWallet: wallet.publicKey.toUpperCase(),
          snippetId,
        };
        const signature = await signMessage(
          wallet.walletProvider,
          JSON.stringify(proofPayload),
        );
        Object.assign(payload, {
          ownershipProof: { ...proofPayload, signature },
        });
      }

      const res = await fetch(
        editingId ? `/api/snippets/${editingId}` : "/api/snippets",
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
            ...(wallet?.publicKey ? { "x-wallet-address": wallet.publicKey } : {}),
            ...(wallet?.token ? { Authorization: `Bearer ${wallet.token}` } : {}),
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.status === 409) {
        toast.error(
          "This snippet was modified in another session. Refresh to see the latest version.",
        );
        return;
      }

      if (!res.ok) throw new Error("Failed to save snippet.");

      const saved = await res.json();
      if (saved?.updated_at) {
        serverUpdatedAtRef.current = saved.updated_at;
      }
      lastSavedSnapshotRef.current = buildSnapshot(data);
      retryCountRef.current = 0;
      setAutosaveStatus("saved");
      setLastSavedAt(new Date());

      await onSuccess();
      closeForm();
    } catch (error) {
      console.error("Error saving snippet:", error);
      toast.error("Failed to save snippet. Please try again.");
    } finally {
      setSubmitting(false);
      manualSavingRef.current = false;
    }
  };

  const renderAutosaveStatus = () => {
    if (!editingId) return null;

    let content: React.ReactNode;
    let className = "";

    switch (autosaveStatus) {
      case "saving":
        content = (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
            Saving…
          </span>
        );
        className = "text-yellow-400";
        break;
      case "saved":
        content = (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Saved
            {lastSavedAt
              ? ` ${lastSavedAt.toLocaleTimeString()}`
              : ""}
          </span>
        );
        className = "text-green-400";
        break;
      case "error":
        content = (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Autosave failed — retrying
          </span>
        );
        className = "text-red-400";
        break;
      default:
        content = (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gray-500" />
            Unsaved changes
          </span>
        );
        className = "text-gray-400";
    }

    return (
      <div className={`text-xs font-medium ${className}`} role="status">
        {content}
      </div>
    );
  };

  // Intercept layout rendering if initial data prefetch is unresolved
  if (isLoading) {
    return (
      <Card className="mb-8 bg-slate-800/50 border-purple-500/30 backdrop-blur-xl p-6">
        <FormSkeleton />
      </Card>
    );
  }

  return (
    <Card className="mb-8 bg-slate-800/50 border-purple-500/30 backdrop-blur-xl p-6 skeleton-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">
          {editingId ? "Edit Snippet" : "Add New Snippet"}
        </h2>
        {renderAutosaveStatus()}
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-white">
            Title
          </Label>
          <Input
            id="title"
            placeholder="e.g., React useEffect Hook"
            {...register("title")}
            className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400"
          />
          {errors.title && (
            <p className="text-red-400 text-sm">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-white">
            Description
          </Label>
          <Textarea
            id="description"
            placeholder="Describe what this snippet does..."
            {...register("description")}
            className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400 min-h-20"
          />
          {errors.description && (
            <p className="text-red-400 text-sm">{errors.description.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-white">Language</Label>
          <Controller
            name="language"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="bg-slate-700/50 border-purple-500/30 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang.charAt(0).toUpperCase() + lang.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-white">License</Label>
          <Controller
            name="licenseType"
            control={control}
            render={({ field }) => (
              <Select value={field.value || "None"} onValueChange={field.onChange}>
                <SelectTrigger className="bg-slate-700/50 border-purple-500/30 text-white">
                  <SelectValue placeholder="Select a license" />
                </SelectTrigger>
                <SelectContent>
                  {["None", "MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause"].map((lic) => (
                    <SelectItem key={lic} value={lic}>
                      {lic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-white">Visibility</Label>
          <Controller
            name="visibility"
            control={control}
            render={({ field }) => (
              <Select value={field.value || "private"} onValueChange={field.onChange}>
                <SelectTrigger className="bg-slate-700/50 border-purple-500/30 text-white">
                  <SelectValue placeholder="Who can see this snippet?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private — only you</SelectItem>
                  <SelectItem value="public">Public — anyone can view</SelectItem>
                  <SelectItem value="shared">Shared — specific wallets</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {watchedValues.visibility === "shared" && (
          <div className="space-y-2">
            <Label htmlFor="sharedWith" className="text-white">
              Share with (wallet addresses, comma-separated)
            </Label>
            <Input
              id="sharedWith"
              placeholder="GABC...,GXYZ..."
              {...register("sharedWith")}
              className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="code" className="text-white">
            Code
          </Label>
          <Textarea
            id="code"
            placeholder="Paste your code here..."
            {...register("code")}
            className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400 font-mono min-h-64"
          />
          {errors.code && (
            <p className="text-red-400 text-sm">{errors.code.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags" className="text-white">
            Tags (comma-separated)
          </Label>
          <Input
            id="tags"
            placeholder="e.g., react, hooks, useEffect"
            {...register("tags")}
            className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400"
          />
        </div>

        <div className="flex gap-4">
          <Button
            type="submit"
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0"
            disabled={submitting}
          >
            {submitting ? (
              <Loader />
            ) : editingId ? (
              "Update Snippet"
            ) : (
              "Save Snippet"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={closeForm}
            className="border-purple-400/50 text-white bg-transparent"
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
