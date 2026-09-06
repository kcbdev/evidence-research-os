/**
 * REST + SSE client for /api/v1 (guide §6.1). Native fetch +
 * EventSource only — no data-fetching library for MVP.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface LabProjectSummary {
  id: string;
  title: string;
  mode: string;
  question: string;
  claims_count: number;
}

export interface LabProjectDetail extends LabProjectSummary {
  counts: {
    claims: number;
    evidence: number;
    sources: number;
    ideas: number;
    tasks: number;
    decisions: number;
  };
}

export interface Budget {
  max_model_calls: number;
  max_research_rounds: number;
  calls_used: number;
  rounds_used: number;
  exhausted: boolean;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path}: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function listLabProjects(): Promise<LabProjectSummary[]> {
  return get<LabProjectSummary[]>("/api/v1/lab-projects");
}

export function getLabProject(id: string): Promise<LabProjectDetail> {
  return get<LabProjectDetail>(`/api/v1/lab-projects/${id}`);
}

export function getBudget(id: string): Promise<Budget> {
  return get<Budget>(`/api/v1/lab-projects/${id}/budget`);
}

export function getReport(id: string): Promise<{ report: string }> {
  return get<{ report: string }>(`/api/v1/lab-projects/${id}/output/report`);
}

export async function createLabProject(input: {
  title: string;
  question: string;
  mode?: string;
}): Promise<LabProjectDetail> {
  const res = await fetch(`${BASE}/api/v1/lab-projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`POST /lab-projects: ${res.status}`);
  }
  return (await res.json()) as LabProjectDetail;
}

export interface RunEvent {
  type: string;
  data: unknown;
}

const STREAM_TYPES = ["node", "human_checkpoint"] as const;

export function streamRun(
  projectId: string,
  runId: string,
  onEvent: (event: RunEvent) => void,
): () => void {
  const es = new EventSource(
    `${BASE}/api/v1/lab-projects/${projectId}/runs/${runId}/stream`,
  );
  const handlers = STREAM_TYPES.map((type) => {
    const handler = (msg: MessageEvent) => {
      try {
        onEvent({ type, data: JSON.parse(msg.data as string) });
      } catch {
        // Keep-alive comments carry no data — ignore, stay subscribed.
      }
    };
    es.addEventListener(type, handler as EventListener);
    return { type, handler: handler as EventListener };
  });
  return () => {
    for (const { type, handler } of handlers) {
      es.removeEventListener(type, handler);
    }
    es.close(); // cleanup: no dangling subscriptions
  };
}
