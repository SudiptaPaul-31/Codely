import React from "react";
import Skeleton from "../ui/Skeleton";

export default function CardSkeleton() {
  return (
    <div style={{ padding: "1.25rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem", background: "transparent", marginBottom: "1rem" }}>
      {/* Header/Title Lines */}
      <Skeleton height="1.25rem" width="60%" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="0.875rem" width="35%" style={{ marginBottom: "1.25rem" }} />
      
      {/* Code Snippet Box Mockup */}
      <div style={{ padding: "1rem", backgroundColor: "#f9fafb", borderRadius: "0.375rem", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Skeleton height="0.75rem" width="90%" />
        <Skeleton height="0.75rem" width="75%" />
        <Skeleton height="0.75rem" width="85%" />
      </div>
      
      {/* Footer Tags and Interaction Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", width: "40%" }}>
          <Skeleton height="1.5rem" width="3rem" />
          <Skeleton height="1.5rem" width="4rem" />
        </div>
        <Skeleton height="1.75rem" width="2rem" style={{ borderRadius: "50%" }} />
      </div>
    </div>
  );
}