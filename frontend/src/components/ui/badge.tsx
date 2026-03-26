import React from "react";
import { cn } from "../../lib";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Badge({ className, ...props }: BadgeProps) {
  return <div className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.08em]", className)} {...props} />;
}
