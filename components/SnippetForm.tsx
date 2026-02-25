"use client";

import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import { fetchSnippets } from "@/lib/utils";
import React, { SetStateAction } from "react";
import { SnippetFormValues } from "@/types/type";
import { zodResolver } from "@hookform/resolvers/zod";
import { snippetSchema } from "@/validiation/snippet-form-validiation";
import { toast } from "sonner";

interface SnippetFormProps {
  editingId: string | null;
  submitting: boolean;
  setSubmitting: React.Dispatch<SetStateAction<boolean>>;
  closeForm: () => void;
}

export default function SnippetForm({
  editingId,
  setSubmitting,
  closeForm,
  submitting,
}: SnippetFormProps) {
  const form = useForm<SnippetFormValues>({
    resolver: zodResolver(snippetSchema),
    defaultValues: {
      title: "",
      description: "",
      code: "",
      language: "javascript",
      tags: "",
    },
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form;

  const onSubmit = async (data: SnippetFormValues) => {
    // Mock isConnected state - replace with real state later
    const isConnected = false;

    if (!isConnected) {
      toast.error("Please connect your wallet before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        title: data.title,
        description: data.description,
        code: data.code,
        language: data.language,
        tags: data.tags
          ? data.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      };

      const res = await fetch(
        editingId ? `/api/snippets/${editingId}` : "/api/snippets",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) throw new Error("Failed to save snippet");

      await fetchSnippets();
      closeForm();
    } catch (error) {
      console.error("Error saving snippet:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-8 bg-slate-800/50 border-purple-500/30 backdrop-blur-xl p-6">
      <h2 className="text-2xl font-bold text-white mb-6">
        {editingId ? "Edit Snippet" : "Add New Snippet"}
      </h2>
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
