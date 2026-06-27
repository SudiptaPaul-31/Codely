"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Loader from "@/components/ui/loader";
import {
  History,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface VersionContent {
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
}

interface SnippetVersion {
  id: string;
  snippet_id: string;
  content: VersionContent;
  editor_id: string | null;
  version_number: number;
  created_at: string;
}

interface VersionHistory {
  versions: SnippetVersion[];
  total: number;
  page: number;
  pageSize: number;
}

interface VersionHistoryProps {
  snippetId: string;
  onRestore?: (version: SnippetVersion) => void;
}

export function VersionHistoryPanel({
  snippetId,
  onRestore,
}: VersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<VersionHistory | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<SnippetVersion | null>(
    null,
  );
  const [viewingVersion, setViewingVersion] = useState<SnippetVersion | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchVersionHistory = async (pageNum: number = 1) => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/snippets/${snippetId}?action=versions&page=${pageNum}&pageSize=${pageSize}`,
      );
      if (!res.ok) throw new Error("Failed to fetch version history");
      const data = await res.json();
      setHistory(data);
      setPage(pageNum);
    } catch (e) {
      console.error("Error fetching version history:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    fetchVersionHistory(1);
  };

  const handleViewVersion = async (version: SnippetVersion) => {
    setViewingVersion(version);
  };

  const handleRestoreVersion = async (version: SnippetVersion) => {
    if (
      !confirm(
        `Restore to version ${version.version_number}? This will create a new version entry.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/snippets/${snippetId}?action=restore`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });

      if (!res.ok) throw new Error("Failed to restore version");

      alert(`Successfully restored to version ${version.version_number}`);
      setViewingVersion(null);
      setIsOpen(false);

      if (onRestore) {
        onRestore(version);
      }
    } catch (e) {
      console.error("Error restoring version:", e);
      alert("Failed to restore version");
    }
  };

  const handlePageChange = (newPage: number) => {
    if (
      history &&
      newPage >= 1 &&
      newPage <= Math.ceil(history.total / pageSize)
    ) {
      fetchVersionHistory(newPage);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <History className="w-4 h-4 mr-2" />
        Version History
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View and restore previous versions of this snippet.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader />
            </div>
          ) : history && history.versions.length > 0 ? (
            <div className="space-y-4">
              {history.versions.map((version) => (
                <Card key={version.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold">
                          Version {version.version_number}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(version.created_at)}
                        </span>
                        {version.editor_id && (
                          <span className="text-xs bg-muted px-2 py-1 rounded">
                            {version.editor_id}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {version.content.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {version.content.language} •{" "}
                        {version.content.tags?.join(", ") || "No tags"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewVersion(version)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestoreVersion(version)}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}

              {/* Pagination */}
              {history.total > pageSize && (
                <div className="flex justify-center items-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page} of {Math.ceil(history.total / pageSize)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(history.total / pageSize)}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No version history available.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Version View Dialog */}
      <Dialog
        open={!!viewingVersion}
        onOpenChange={() => setViewingVersion(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {viewingVersion && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Version {viewingVersion.version_number}
                </DialogTitle>
                <DialogDescription>
                  Created at {formatDate(viewingVersion.created_at)}
                  {viewingVersion.editor_id &&
                    ` by ${viewingVersion.editor_id}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <p className="text-sm">{viewingVersion.content.title}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <p className="text-sm">
                    {viewingVersion.content.description}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Language</label>
                  <p className="text-sm">{viewingVersion.content.language}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <p className="text-sm">
                    {viewingVersion.content.tags?.join(", ") || "No tags"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Code</label>
                  <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs max-h-60">
                    <code>{viewingVersion.content.code}</code>
                  </pre>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setViewingVersion(null)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    if (viewingVersion) {
                      handleRestoreVersion(viewingVersion);
                    }
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore This Version
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
