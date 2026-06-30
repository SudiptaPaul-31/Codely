import React from "react";
import Skeleton from "../ui/Skeleton";
import CardSkeleton from "./CardSkeleton";

export default function DashboardSkeleton() {
  return (
    <div style={{ width: "100%", padding: "1.5rem" }}>
      {/* Header Profile welcoming / Title line */}
      <div style={{ marginBottom: "2rem" }}>
        <Skeleton height="2rem" width="30%" style={{ marginBottom: "0.5rem" }} />
        <Skeleton height="1rem" width="45%" />
      </div>

      {/* Metrics Row Grid Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem", marginBottom: "3rem" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.5rem" }}>
            <Skeleton height="0.875rem" width="40%" style={{ marginBottom: "0.75rem" }} />
            <Skeleton height="1.75rem" width="25%" style={{ marginBottom: "0.5rem" }} />
            <Skeleton height="0.75rem" width="60%" />
          </div>
        ))}
      </div>

      {/* Content Activity Header Block */}
      <div style={{ marginBottom: "1.25rem" }}>
        <Skeleton height="1.5rem" width="20%" />
      </div>

      {/* Feed Stream Stack Component Layout mapping */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}