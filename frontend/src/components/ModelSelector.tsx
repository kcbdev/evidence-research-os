"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  cachedModels,
  cacheFresh,
  fetchModels,
  type OpenRouterModel,
} from "@/lib/openrouter";

export default function ModelSelector({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    const cached = cachedModels();
    if (cached) setModels(cached);
    if (cached && cacheFresh()) return;
    fetchModels()
      .then((fresh) => {
        if (!cancelled) {
          setModels(fresh);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = value.trim().toLowerCase();
  const matches = (models ?? [])
    .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    .slice(0, 50);
  const showList = open && matches.length > 0;

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setHighlight(0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && showList) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp" && showList) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && showList && matches[highlight]) {
      e.preventDefault();
      choose(matches[highlight].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  async function onRefresh() {
    setFailed(false);
    try {
      setModels(await fetchModels());
    } catch {
      setFailed(true);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            id={id}
            aria-label={label}
            placeholder={`${label} (OpenRouter ID)`}
            className="font-mono min-h-[44px]"
            value={value}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </div>
        <button
          type="button"
          className="min-h-[44px] px-2 text-xs underline text-muted-foreground"
          onClick={() => void onRefresh()}
          aria-label={`Refresh ${label} list`}
        >
          Refresh
        </button>
      </div>
      {failed && (
        <p className="mt-1 text-xs text-muted-foreground">
          Model list unavailable — type any OpenRouter ID manually.
        </p>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border bg-background shadow-md"
        >
          {matches.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === highlight}
              className={`cursor-pointer px-2 py-2 text-sm min-h-[44px] flex flex-col justify-center ${i === highlight ? "bg-muted" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m.id);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="font-medium">{m.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{m.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
