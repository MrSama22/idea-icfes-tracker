import { Link } from "wouter";
import { cn } from "../lib/utils";

export function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="group flex items-baseline gap-2">
            <span className="font-display text-2xl font-extrabold tracking-tight">
              IDEA<span className="text-accent">.</span>
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
              ICFES Error Analytics
            </span>
          </Link>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5">{children}</main>
    </div>
  );
}

export function SectionTitle({
  n,
  children,
  aside,
}: {
  n: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 border-b-2 border-foreground pb-1.5">
      <h2 className="flex items-baseline gap-2 font-display text-lg font-bold tracking-tight">
        <span className="font-mono text-xs text-accent">{n}</span>
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function Kbd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[1.25rem] items-center justify-center rounded-[3px] border border-current/30 px-1 font-mono text-[10px] font-semibold uppercase leading-4 opacity-70",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:border-foreground active:scale-[0.98] disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
