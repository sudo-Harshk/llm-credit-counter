import React from "react";
import { cn } from "../../lib";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function Button({ className, ...props }: ButtonProps) {
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}
