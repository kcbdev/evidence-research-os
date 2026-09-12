export interface OpenRouterModel {
  id: string;
  name: string;
}

const ENDPOINT = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "evid-os:openrouter-models:v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_MODELS: Record<string, string> = {
  // Witnessed working set (SLM lineage, ran in prod) — real ids,
  // changeable via the selector. Never invent entries here.
  scientist: "deepseek/deepseek-v4-flash-0731",
  investigator: "qwen/qwen3.5-flash-02-23",
  skeptic: "deepseek/deepseek-v4-flash-0731",
  ideator: "deepseek/deepseek-v4-flash-0731",
  judge: "meta-llama/llama-3.3-70b-instruct",
};

type Cached = { fetched_at: number; models: OpenRouterModel[] };

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!Array.isArray(parsed.models)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(models: OpenRouterModel[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetched_at: Date.now(), models }),
    );
  } catch {
    // Private mode / quota — cache is a nicety, never load-bearing.
  }
}

export function cachedModels(): OpenRouterModel[] | null {
  const cached = readCache();
  return cached?.models ?? null;
}

export function cacheFresh(): boolean {
  const cached = readCache();
  return cached !== null && Date.now() - cached.fetched_at < CACHE_TTL_MS;
}

export async function fetchModels(): Promise<OpenRouterModel[]> {
  // Keyless endpoint; throws on network/API failure (caller degrades).
  const res = await fetch(ENDPOINT);
  if (!res.ok) {
    throw new Error(`OpenRouter models: ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: { id?: string; name?: string }[];
  };
  const models = (body.data ?? [])
    .filter((m) => typeof m.id === "string" && m.id.length > 0)
    .map((m) => ({
      id: m.id as string,
      name: typeof m.name === "string" && m.name ? m.name : (m.id as string),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  writeCache(models);
  return models;
}
