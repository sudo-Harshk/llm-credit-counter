import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { ProviderIcon } from "@lobehub/icons";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { Skeleton } from "./components/ui/skeleton";
import { SlidingNumber } from "./components/SlidingNumber";

type ProviderDefinition = {
  key: string;
  label: string;
  description: string;
  requires_key: boolean;
  /** True when this provider's env token is set on the server (no browser key needed unless user overrides). */
  backend_key_configured?: boolean;
};

type ProviderResult = {
  key: string;
  label: string;
  status: string;
  balance: number | null;
  message?: string;
};

type ProvidersResponse = {
  ok: boolean;
  providers: ProviderDefinition[];
};

type BalanceCheckResponse = {
  ok: boolean;
  provider: ProviderResult;
};

type CachedProviderState = {
  result: ProviderResult;
};

const LOW_THRESHOLD = 5;
const CRITICAL_THRESHOLD = 1;
const STORAGE_PROVIDER_KEY = "credit-counter:selected-provider";
const STORAGE_CACHE_KEY = "credit-counter:provider-cache";
const STORAGE_AUTO_REFRESH_KEY = "credit-counter:auto-refresh-enabled";
const AUTO_REFRESH_INTERVAL_MS = 30_000;
const ACTION_LABEL = "Check balance";
const ACTION_BUSY_LABEL = "Checking...";

function balanceTone(provider?: ProviderResult) {
  if (!provider || provider.status !== "ok" || provider.balance === null) return "text-slate-500";
  if (provider.balance < CRITICAL_THRESHOLD) return "text-rose-500";
  if (provider.balance < LOW_THRESHOLD) return "text-amber-500";
  return "text-emerald-500";
}

function statusTone(status: string) {
  if (status === "ok") return "text-emerald-700 border-emerald-200 bg-emerald-50";
  if (status === "missing_config") return "text-amber-700 border-amber-200 bg-amber-50";
  if (status === "unauthorized") return "text-rose-700 border-rose-200 bg-rose-50";
  if (status === "forbidden") return "text-rose-700 border-rose-200 bg-rose-50";
  return "text-slate-700 border-slate-200 bg-slate-50";
}

export default function App() {
  const [providers, setProviders] = useState<ProviderDefinition[]>([]);
  const [selectedProviderKey, setSelectedProviderKey] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [resultCache, setResultCache] = useState<Record<string, CachedProviderState>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [checking, setChecking] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [ownKeyOverrideOpen, setOwnKeyOverrideOpen] = useState(false);
  const checkingRef = useRef(false);
  const prevProviderKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const storedProvider = window.localStorage.getItem(STORAGE_PROVIDER_KEY);
    if (storedProvider) setSelectedProviderKey(storedProvider);

    const storedCache = window.localStorage.getItem(STORAGE_CACHE_KEY);
    if (storedCache) {
      try {
        setResultCache(JSON.parse(storedCache) as Record<string, CachedProviderState>);
      } catch {
        window.localStorage.removeItem(STORAGE_CACHE_KEY);
      }
    }

    const storedAutoRefresh = window.localStorage.getItem(STORAGE_AUTO_REFRESH_KEY);
    if (storedAutoRefresh !== null) {
      setAutoRefreshEnabled(storedAutoRefresh === "true");
    }
  }, []);

  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch("/api/providers");
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const payload = (await res.json()) as ProvidersResponse;
        const list = payload.providers ?? [];
        setProviders(list);
        setSelectedProviderKey((current) => current || list[0]?.key || "");
      } catch {
        setError("Could not load provider list.");
      } finally {
        setLoadingProviders(false);
      }
    }

    loadProviders();
  }, []);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.key === selectedProviderKey) ?? providers[0] ?? null,
    [providers, selectedProviderKey],
  );

  useEffect(() => {
    if (selectedProviderKey) {
      window.localStorage.setItem(STORAGE_PROVIDER_KEY, selectedProviderKey);
    }
  }, [selectedProviderKey]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_AUTO_REFRESH_KEY, String(autoRefreshEnabled));
  }, [autoRefreshEnabled]);

  useEffect(() => {
    checkingRef.current = checking;
  }, [checking]);

  const selectedCachedState = resultCache[selectedProviderKey] ?? null;
  const selectedResult = selectedCachedState?.result ?? null;

  const serverKeyReady = Boolean(selectedProvider?.backend_key_configured);
  const effectiveApiKey = !serverKeyReady || ownKeyOverrideOpen ? apiKey : "";

  useEffect(() => {
    const prev = prevProviderKeyRef.current;
    if (prev && selectedProviderKey && prev !== selectedProviderKey) {
      setOwnKeyOverrideOpen(false);
      setApiKey("");
    }
    if (selectedProviderKey) {
      prevProviderKeyRef.current = selectedProviderKey;
    }
  }, [selectedProviderKey]);

  const checkBalance = useCallback(async () => {
    if (!selectedProvider) return;

    setChecking(true);
    try {
      setError(null);
      const res = await fetch("/api/balances/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_key: selectedProvider.key,
          api_key: effectiveApiKey,
        }),
      });
      const payload = (await res.json()) as BalanceCheckResponse & { message?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || `Request failed: ${res.status}`);
      }
      setResultCache((current) => {
        const next = {
          ...current,
          [selectedProvider.key]: {
            result: payload.provider,
          },
        };
        window.localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(next));
        return next;
      });
    } catch {
      setError("Could not check the selected provider.");
    } finally {
      setChecking(false);
    }
  }, [effectiveApiKey, selectedProvider]);

  const canAutoRefresh =
    Boolean(selectedProvider) && (serverKeyReady ? !ownKeyOverrideOpen || Boolean(apiKey.trim()) : Boolean(apiKey.trim()));

  useEffect(() => {
    if (!autoRefreshEnabled || !selectedProvider || !canAutoRefresh) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (checkingRef.current) return;
      void checkBalance();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [apiKey, autoRefreshEnabled, canAutoRefresh, checkBalance, ownKeyOverrideOpen, selectedProvider, serverKeyReady]);

  return (
    <main className="mx-auto min-h-full w-full max-w-7xl px-4 py-4 text-[#1a1a1a] sm:px-5 sm:py-5 lg:px-6">
      <section className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 shadow-[0_12px_30px_rgba(26,26,26,0.06)] sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--secondary)]">
          Provider balance workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          Select a provider and check the balance.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--secondary)]">
          When a provider has a key on the server, you can check immediately. Otherwise, paste your key in the inspector (optional override if both are set).
        </p>
      </section>

      {error ? (
        <div className="mt-6 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--foreground)]">
          {error}
        </div>
      ) : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
        <aside className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(26,26,26,0.06)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--secondary)]">Supported providers</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">Choose one</h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loadingProviders
              ? Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-secondary)] p-4"
                  >
                    <Skeleton className="h-11 w-11 rounded-full bg-[var(--surface-tertiary)]" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-24 bg-[var(--surface-tertiary)]" />
                      <Skeleton className="mt-2 h-3 w-36 bg-[var(--surface-tertiary)]" />
                    </div>
                  </div>
                ))
              : providers.map((provider) => {
                  const active = provider.key === selectedProviderKey;
                  return (
                    <button
                    key={provider.key}
                    type="button"
                    onClick={() => setSelectedProviderKey(provider.key)}
                    className={`flex w-full items-center gap-3 rounded-[1.15rem] border px-4 py-3 text-left transition ${
                      active
                        ? "border-[var(--foreground)] bg-[var(--surface-secondary)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)]"
                    }`}
                  >
                      <ProviderIcon provider={provider.key as "deepseek" | "openrouter"} size={24} type="color" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                            {provider.label}
                          </p>
                          <Badge className="border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--foreground)] shadow-none">
                            {provider.key}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-[var(--secondary)]">{provider.description}</p>
                      </div>
                    </button>
                  );
                })}
          </div>
        </aside>

        <section className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(26,26,26,0.06)] sm:p-6">
          <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--secondary)]">Provider inspector</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                  {selectedProvider?.label ?? "No provider selected"}
                </h2>
                <p className="mt-2 text-xs text-[var(--secondary)]">
                  Auto refresh {autoRefreshEnabled ? `on · every ${AUTO_REFRESH_INTERVAL_MS / 1000}s` : "off"}
                </p>
              </div>
              <Badge className={statusTone(selectedResult?.status ?? "missing_config")}>
                {(selectedResult?.status ?? "idle").replaceAll("_", " ")}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={checkBalance}
                disabled={
                  checking ||
                  !selectedProvider ||
                  (!serverKeyReady && !apiKey.trim()) ||
                  (serverKeyReady && ownKeyOverrideOpen && !apiKey.trim())
                }
                className="border-[var(--border)] bg-[var(--foreground)] text-white shadow-none hover:opacity-90"
              >
                <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                {checking ? ACTION_BUSY_LABEL : ACTION_LABEL}
              </Button>
              <Button
                type="button"
                onClick={() => setAutoRefreshEnabled((current) => !current)}
                className={`border-[var(--border)] shadow-none hover:opacity-90 ${
                  autoRefreshEnabled
                    ? "bg-[var(--foreground)] text-white"
                    : "bg-[var(--surface-secondary)] text-[var(--foreground)]"
                }`}
              >
                {autoRefreshEnabled ? "Auto refresh: on" : "Auto refresh: off"}
              </Button>
              <div className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--secondary)]">
                {loadingProviders ? "Loading providers..." : `${providers.length} providers`}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <details
              key={`api-panel-${selectedProviderKey}`}
              className="group overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-secondary)]"
              defaultOpen={!serverKeyReady}
              onToggle={(event) => {
                const open = (event.currentTarget as HTMLDetailsElement).open;
                if (!open && serverKeyReady) {
                  setOwnKeyOverrideOpen(false);
                  setApiKey("");
                }
              }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <span className="block">API key</span>
                  <span className="mt-0.5 block text-xs font-normal text-[var(--secondary)]">
                    {serverKeyReady
                      ? "Tap to expand if you want to paste or override the server key."
                      : "Tap to expand and paste your key (required for this provider)."}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--secondary)] transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t border-[var(--border)] px-4 pb-4 pt-4">
                {serverKeyReady ? (
                  <>
                    <p className="text-sm leading-6 text-[var(--foreground)]">
                      This provider uses the API key from the server environment unless you override it below for this
                      browser session.
                    </p>
                    <details
                      key={`override-${selectedProviderKey}`}
                      className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
                      onToggle={(event) => {
                        const open = (event.currentTarget as HTMLDetailsElement).open;
                        setOwnKeyOverrideOpen(open);
                        if (!open) setApiKey("");
                      }}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
                        <span>Use my own API key instead</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--secondary)] transition-transform duration-200 group-open:rotate-180" />
                      </summary>
                      <div className="space-y-3 border-t border-[var(--border)] px-4 pb-4 pt-3">
                        <label className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--secondary)]">
                          {selectedProvider?.label ?? "Provider"} API key
                        </label>
                        <input
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={`Paste ${selectedProvider?.label ?? "provider"} key`}
                          className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--tab-inactive)] focus:border-[var(--foreground)]"
                        />
                        <p className="text-xs text-[var(--tab-inactive)]">
                          The key is sent only for the selected provider check. Use Check balance above.
                        </p>
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    <label className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--secondary)]">
                      {selectedProvider?.label ?? "Provider"} API key
                    </label>
                    <input
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={`Paste ${selectedProvider?.label ?? "provider"} key`}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--tab-inactive)] focus:border-[var(--foreground)]"
                    />
                    <p className="text-xs text-[var(--tab-inactive)]">
                      No server key is set for this provider. The key is sent only for the selected provider check. Use
                      Check balance above.
                    </p>
                  </>
                )}
              </div>
            </details>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-secondary)] p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--secondary)]">Balance</p>
                <div className={`mt-2 text-4xl font-bold tracking-tight sm:text-5xl ${balanceTone(selectedResult ?? undefined)}`}>
                  <span className="mr-1 align-middle text-2xl font-medium text-[var(--secondary)]">$</span>
                  <SlidingNumber
                    key={`${selectedProviderKey}-${selectedResult?.balance ?? 0}`}
                    number={selectedResult?.balance ?? 0}
                    decimalPlaces={2}
                  />
                </div>
              </div>
              <div className="max-w-[220px] text-right">
                <p className="text-xs text-[var(--secondary)] sm:text-sm">
                  {selectedResult?.message ?? selectedProvider?.description ?? "Choose a provider and test it."}
                </p>
              </div>
            </div>
          </div>
        </section>
      </section>

      <Separator className="my-8 bg-[var(--border)]" />
    </main>
  );
}
