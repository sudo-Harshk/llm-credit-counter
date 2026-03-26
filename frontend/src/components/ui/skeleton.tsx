import React from "react";
import { cn } from "../../lib";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-slate-700/70", className)} {...props} />;
}
