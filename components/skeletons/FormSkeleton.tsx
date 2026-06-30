import React from "react";
import Skeleton from "../ui/Skeleton";

export default function FormSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%", maxWidth: "600px", padding: "1rem" }}>
      {/* Input Row 1 */}
      <div>
        <Skeleton height="0.875rem" width="20%" style={{ marginBottom: "0.5rem" }} />
        <Skeleton height="2.5rem" style={{ borderRadius: "0.375rem" }} />
      </div>

      {/* Input Row 2 */}
      <div>
        <Skeleton height="0.875rem" width="15%" style={{ marginBottom: "0.5rem" }} />
        <Skeleton height="2.5rem" style={{ borderRadius: "0.375rem" }} />
      </div>

      {/* Selector Options Input */}
      <div>
        <Skeleton height="0.875rem" width="25%" style={{ marginBottom: "0.5rem" }} />
        <Skeleton height="2.5rem" style={{ borderRadius: "0.375rem" }} />
      </div>

      {/* Large Text Area Mock */}
      <div>
        <Skeleton height="0.875rem" width="30%" style={{ marginBottom: "0.5rem" }} />
        <Skeleton height="7rem" style={{ borderRadius: "0.375rem" }} />
      </div>

      {/* Action Buttons Row */}
      <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
        <Skeleton height="2.5rem" width="6rem" style={{ borderRadius: "0.375rem" }} />
        <Skeleton height="2.5rem" width="6rem" style={{ borderRadius: "0.375rem", backgroundColor: "transparent", border: "1px solid #e5e7eb" }} />
      </div>
    </div>
  );
}