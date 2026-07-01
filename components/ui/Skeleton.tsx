import React from "react";


interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  height?: string | number;
  width?: string | number;
  style?: React.CSSProperties;
}

export default function Skeleton({
  className = "",
  height = "1rem",
  width = "100%",
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={`skeleton-base ${className}`}
      style={{
        height: height,
        width: width,
        ...style,
      }}
      {...props}
    />
  );
}