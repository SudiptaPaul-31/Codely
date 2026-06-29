"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { ActivityItem } from "./ActivityItem";
import { Inbox, AlertCircle, RefreshCw } from "lucide-react";
import type { ActivityLog, ActivityLogsResponse } from "@/types/type";

export interface ActivityTimelineProps {
  activities?: ActivityLog[];
  limit?: number;
  pollInterval?: number;
  showEmptyState?: boolean;
  showHeader?: boolean;
  title?: string;
  className?: string;
}

function Skeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading activities">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading recent activities...</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">
        No activities yet
      </p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Activities will appear here as you create and manage snippets.
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center"
      role="alert"
    >
      <AlertCircle className="h-8 w-8 text-destructive mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">
        Failed to load activities
      </p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline transition-colors"
      >
        <RefreshCw className="h-3 w-3" />
        Try again
      </button>
    </div>
  );
}

export function ActivityTimeline({
  activities: controlledActivities,
  limit = 10,
  pollInterval = 30000,
  showEmptyState = true,
  showHeader = true,
  title = "Recent Activity",
  className,
}: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityLog[]>(
    controlledActivities ?? [],
  );
  const [loading, setLoading] = useState(!controlledActivities);
  const [error, setError] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(activities.length > 0);

  useEffect(() => {
    hasDataRef.current = activities.length > 0;
  }, [activities]);

  const fetchActivities = useCallback(async () => {
    try {
      if (!hasDataRef.current) setLoading(true);
      setPollingError(null);
      const res = await fetch(`/api/logs?page=1&pageSize=${limit}`);
      if (!res.ok) {
        if (res.status === 401) throw new Error("Authentication required");
        throw new Error("Failed to fetch activities");
      }
      const data: ActivityLogsResponse = await res.json();
      if (mountedRef.current) {
        setActivities(data.data ?? []);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Something went wrong";
        if (hasDataRef.current) {
          setPollingError(msg);
          setLoading(false);
        } else {
          setError(msg);
          setLoading(false);
        }
      }
    }
  }, [limit]);

  useEffect(() => {
    if (controlledActivities !== undefined) {
      setActivities(controlledActivities);
      return;
    }
    fetchActivities();
  }, [controlledActivities, fetchActivities]);

  useEffect(() => {
    if (controlledActivities !== undefined || pollInterval <= 0) return;
    const interval = setInterval(fetchActivities, pollInterval);
    return () => clearInterval(interval);
  }, [controlledActivities, pollInterval, fetchActivities]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showError = error && !loading && activities.length === 0;
  const showContent = !loading || activities.length > 0;

  return (
    <div className={cn("w-full", className)}>
      {showHeader && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {loading && activities.length > 0 && (
              <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
            {pollingError && (
              <span className="text-[11px] text-destructive" role="alert">
                Update failed
              </span>
            )}
          </div>
        </div>
      )}

      {loading && activities.length === 0 ? (
        <Skeleton />
      ) : showError ? (
        <ErrorState message={error} onRetry={fetchActivities} />
      ) : showContent && activities.length > 0 ? (
        <div>
          {activities.map((activity, index) => (
            <div
              key={activity.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${(index % 6) * 100}ms` }}
            >
              <ActivityItem
                activity={activity}
                isLast={index === activities.length - 1}
              />
            </div>
          ))}
        </div>
      ) : showEmptyState ? (
        <EmptyState />
      ) : null}
    </div>
  );
}
