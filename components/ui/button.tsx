import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "light" };
export function Button({ className, variant = "primary", ...props }: Props) {
  return <button className={cn("inline-flex h-12 items-center justify-center gap-2 px-6 text-sm font-bold uppercase tracking-[.12em] transition-colors disabled:opacity-50", variant === "primary" && "bg-ink text-white hover:bg-ember", variant === "outline" && "border border-ink bg-transparent text-ink hover:bg-ink hover:text-white", variant === "light" && "bg-white text-ink hover:bg-sand", className)} {...props} />;
}
