import React from "react";
import { cn } from "../../lib";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Separator({ className, ...props }: SeparatorProps) {
  return <div className={cn("h-px w-full bg-slate-800", className)} {...props} />;
}
