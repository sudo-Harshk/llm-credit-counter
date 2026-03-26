import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { ProviderIcon } from "@lobehub/icons";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Separator } from "./components/ui/separator";
import { Skeleton } from "./components/ui/skeleton";
import { SlidingNumber } from "./components/SlidingNumber";

type Provider = {
  key: string;
  label: string;
  status: string;
  balance: number | null;
  message?: string;
};

type ApiResponse = {
  ok: boolean;
  checked_at: string;
  providers: Provider[];
  summary: { healthy: number; degraded: number; configured: number };
};

type ProviderBrand = {
  label: string;
};

const BRAND_STYLES: Record<string, ProviderBrand> = {
  deepseek: {
    label: "DeepSeek",
  },
  openrouter: {
    label: "OpenRouter",
  },
};

const LOW_THRESHOLD = 5;
const CRITICAL_THRESHOLD = 1;

function balanceTone(provider: Provider) {
  if (provider.status !== "ok" || provider.balance === null)
    return "text-slate-500";
  if (provider.balance < CRITICAL_THRESHOLD) return "text-rose-500";
  if (provider.balance < LOW_THRESHOLD) return "text-amber-500";
  return "text-emerald-500";
}

function statusTone(status: string) {
  if (status === "ok")
    return "text-emerald-700 border-emerald-200 bg-emerald-50";
  if (status === "missing_config")
    return "text-amber-700 border-amber-200 bg-amber-50";
  if (status === "unauthorized")
    return "text-rose-700 border-rose-200 bg-rose-50";
  return "text-slate-700 border-slate-200 bg-slate-50";
}

function providerBrand(key: string): ProviderBrand {
  return (
    BRAND_STYLES[key] ?? {
      label: key,
      shortLabel: key.slice(0, 2).toUpperCase(),
      bg: "bg-[var(--surface-secondary)]",
      fg: "text-[var(--foreground)]",
      ring: "ring-[var(--border)]",
    }
  );
}

function formatCurrencySymbol(provider: Provider): string {
  if (provider.status !== "ok" || provider.balance === null) {
    return "$";
  }

  return "$";
}

function formatDayWithSuffix(day: number): string {
  const remainder10 = day % 10;
  const remainder100 = day % 100;

  if (remainder10 === 1 && remainder100 !== 11) return `${day}st`;
  if (remainder10 === 2 && remainder100 !== 12) return `${day}nd`;
  if (remainder10 === 3 && remainder100 !== 13) return `${day}rd`;
  return `${day}th`;
}

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [updatedFlash, setUpdatedFlash] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setError(null);
      const res = await fetch("/api/balances");
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      setData(await res.json());
      setRefreshToken((current) => current + 1);
      setUpdatedFlash(true);
    } catch {
      setError("Could not load live balances.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!updatedFlash) return;
    const timeout = window.setTimeout(() => setUpdatedFlash(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [updatedFlash]);

  const providers = data?.providers ?? [];
  const lastChecked = useMemo(
    () => {
      if (!data?.checked_at) return null;
      const date = new Date(data.checked_at);
      const day = formatDayWithSuffix(date.getDate());
      const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(date);
      const year = date.getFullYear();
      const time = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
      return `${day}-${month},${year} ${time} local time`;
    },
    [data?.checked_at],
  );

  return (
    <main className="mx-auto min-h-full w-full max-w-5xl px-4 py-4 text-[#1a1a1a] sm:px-5 sm:py-5 lg:px-6">
      <section className="mb-6 overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_12px_30px_rgba(26,26,26,0.06)] sm:p-6">
        <div className="flex flex-col gap-6">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4 text-sm font-medium text-[var(--secondary)]">
              <Sparkles className="h-4 w-4 text-[var(--secondary)]" />
              <span>Real-time monitoring for LLM providers</span>
            </div>
            <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl lg:text-5xl">
              Monitor LLM Credits
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--secondary)] sm:text-base">
              A focused view for API balances, provider health, and low-fund
              warning states.
            </p>
          </div>
          <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <p className="text-sm text-[var(--secondary)]">
                {lastChecked
                  ? `Last checked ${lastChecked}`
                  : "Waiting for first check..."}
              </p>
              {updatedFlash ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none">
                  Updated
                </Badge>
              ) : null}
            </div>
            <Button
              aria-busy={refreshing}
              disabled={refreshing}
              onClick={load}
              className="border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--foreground)] shadow-none hover:bg-[var(--surface-tertiary)]"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-6 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--foreground)]">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {(loading && !data ? Array.from({ length: 3 }) : providers).map(
          (provider, index) =>
            loading && !data ? (
              <Card
                key={index}
                className="min-h-[220px] border-[var(--border)] bg-[var(--surface)] shadow-none"
              >
                <CardHeader>
                  <Skeleton className="h-4 w-24 bg-[var(--surface-tertiary)]" />
                  <Skeleton className="h-6 w-40 bg-[var(--surface-tertiary)]" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="mt-6 h-14 w-52 bg-[var(--surface-tertiary)]" />
                  <Skeleton className="mt-6 h-4 w-36 bg-[var(--surface-tertiary)]" />
                  <Skeleton className="mt-2 h-3 w-48 bg-[var(--surface-tertiary)]" />
                </CardContent>
              </Card>
            ) : (
              <ProviderCard
                key={provider.key}
                provider={provider}
                refreshToken={refreshToken}
                refreshing={refreshing}
              />
            ),
        )}
      </section>

      <Separator className="my-8 bg-[var(--border)]" />
    </main>
  );
}

function ProviderCard({
  provider,
  refreshToken,
  refreshing,
}: {
  provider: Provider;
  refreshToken: number;
  refreshing: boolean;
}) {
  const value = provider.balance ?? null;
  const status = provider.status.replaceAll("_", " ");
  const brand = providerBrand(provider.key);

  return (
    <Card
      aria-busy={refreshing}
      className={`min-h-[220px] border-[var(--border)] bg-[var(--surface)] shadow-none transition duration-300 hover:-translate-y-0.5 hover:bg-[var(--surface-secondary)] ${refreshing ? "opacity-90" : ""}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <ProviderIcon
              provider={provider.key as "deepseek" | "openrouter"}
              size={28}
              type="color"
            />
            <div className="flex items-center gap-6">
              <CardTitle>{brand.label}</CardTitle>
              {provider.status === "ok" ? (
                <span className="inline-flex items-center gap-2 pl-2 text-sm text-[var(--secondary)]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>healthy</span>
                </span>
              ) : (
                <Badge className={statusTone(provider.status)}>{status}</Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={`text-5xl font-bold tracking-tight ${balanceTone(provider)} ${refreshing ? "opacity-85" : ""}`}
        >
          <span className="mr-1 align-middle text-2xl font-medium text-[var(--secondary)]">{formatCurrencySymbol(provider)}</span>
          <SlidingNumber key={`${provider.key}-${refreshToken}`} number={value ?? 0} decimalPlaces={2} />
        </div>
        <p className="mt-4 text-sm text-[var(--secondary)]">
          {provider.message ?? "Live balance"}
        </p>
        <p className="mt-2 text-xs text-[var(--tab-inactive)]">
          Thresholds: under 5 low, under 1 critical
        </p>
      </CardContent>
      <CardFooter className="text-xs text-[var(--tab-inactive)]">
        Auto-checked from the server API
      </CardFooter>
    </Card>
  );
}
