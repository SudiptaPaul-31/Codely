"use client";

import React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, Eye, Files, GitFork, MoreVertical } from "lucide-react";
import { SnippetSummary } from "@/types/type";
import { Button } from "./ui/button";

interface SnippetCardContextMenuProps {
  snippet: SnippetSummary;
  children: React.ReactNode;
  onViewDetails?: (snippet: SnippetSummary) => void;
  onDuplicate?: (snippet: SnippetSummary) => void;
  onFork?: (snippet: SnippetSummary) => void;
  onCopyCode?: (snippet: SnippetSummary) => void;
  showDropdownButton?: boolean;
}

export function SnippetCardContextMenu({
  snippet,
  children,
  onViewDetails,
  onDuplicate,
  onFork,
  onCopyCode,
  showDropdownButton = false,
}: SnippetCardContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative group/context">
          {children}

          {showDropdownButton && (
            <div
              className="absolute top-2 right-2 opacity-0 group-hover/context:opacity-100 transition-opacity z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md rounded-md"
                  >
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-slate-950/95 border-purple-500/30">
                  {onViewDetails && (
                    <DropdownMenuItem
                      onClick={() => onViewDetails(snippet)}
                      className="gap-2 cursor-pointer"
                    >
                      <Eye className="h-4 w-4 text-slate-400" />
                      <span>View Details</span>
                    </DropdownMenuItem>
                  )}
                  {onDuplicate && (
                    <DropdownMenuItem
                      onClick={() => onDuplicate(snippet)}
                      className="gap-2 cursor-pointer text-purple-300"
                    >
                      <Files className="h-4 w-4" />
                      <span>Duplicate</span>
                    </DropdownMenuItem>
                  )}
                  {onFork && (
                    <DropdownMenuItem
                      onClick={() => onFork(snippet)}
                      className="gap-2 cursor-pointer text-cyan-300"
                    >
                      <GitFork className="h-4 w-4" />
                      <span>Fork Snippet</span>
                    </DropdownMenuItem>
                  )}
                  {onCopyCode && (
                    <>
                      <DropdownMenuSeparator className="bg-purple-500/20" />
                      <DropdownMenuItem
                        onClick={() => onCopyCode(snippet)}
                        className="gap-2 cursor-pointer"
                      >
                        <Copy className="h-4 w-4 text-slate-400" />
                        <span>Copy Code</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        {onViewDetails && (
          <ContextMenuItem onClick={() => onViewDetails(snippet)}>
            <Eye className="h-4 w-4 text-slate-400" />
            <span>View Details</span>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {onDuplicate && (
          <ContextMenuItem onClick={() => onDuplicate(snippet)}>
            <Files className="h-4 w-4 text-purple-400" />
            <span>Duplicate Snippet</span>
          </ContextMenuItem>
        )}

        {onFork && (
          <ContextMenuItem onClick={() => onFork(snippet)}>
            <GitFork className="h-4 w-4 text-cyan-400" />
            <span>Fork Snippet</span>
          </ContextMenuItem>
        )}

        {onCopyCode && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onCopyCode(snippet)}>
              <Copy className="h-4 w-4 text-slate-400" />
              <span>Copy Code</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default SnippetCardContextMenu;
