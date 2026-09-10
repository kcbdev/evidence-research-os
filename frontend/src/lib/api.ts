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
  archived?: boolean; // PBI-020: list hides archived unless requested
}

export interface LabProjectDetail extends LabProjectSummary {
  council_models: Record<string, string>;
  judge_model: string;
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
    throw new Error(`GET ${path}: ${res.status} — ${await res.text()}`);
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
  council_models?: Record<string, string>;
  judge_model?: string;
}): Promise<LabProjectDetail> {
  const res = await fetch(`${BASE}/api/v1/lab-projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`POST /lab-projects: ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as LabProjectDetail;
}

export interface RunSummary {
  run_id: string;
  status: string;
  needs_approval: boolean;
  events_count: number;
  error: string | null;
}

export function listRuns(projectId: string): Promise<RunSummary[]> {
  return get<RunSummary[]>(`/api/v1/lab-projects/${projectId}/runs`);
}

export interface RunStatus {
  run_id: string;
  project_id: string;
  status: string;
  events: { node: string; etype?: string }[];
  needs_approval: boolean;
  error: string | null;
}

export async function startRun(
  projectId: string,
  input: { question?: string; mode?: string } = {},
): Promise<{ run_id: string; status: string }> {
  const res = await fetch(`${BASE}/api/v1/lab-projects/${projectId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // Surface the server's reason (e.g. judge-overlap refusal) — a bare
    // status code sent a witness on a blind alley during PBI-019.
    throw new Error(`POST runs: ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as { run_id: string; status: string };
}

export function getRun(projectId: string, runId: string): Promise<RunStatus> {
  return get<RunStatus>(
    `/api/v1/lab-projects/${projectId}/runs/${runId}`,
  );
}

export async function retryRun(
  projectId: string,
  runId: string,
): Promise<{ run_id: string; status: string }> {
  const res = await fetch(
    `${BASE}/api/v1/lab-projects/${projectId}/runs/${runId}/retry`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(`POST retry: ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as { run_id: string; status: string };
}

export async function approveRun(
  projectId: string,
  runId: string,
  decision: "approve" | "reject",
  note = "",
): Promise<{ run_id: string; status: string }> {
  const res = await fetch(
    `${BASE}/api/v1/lab-projects/${projectId}/runs/${runId}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    },
  );
  if (!res.ok) {
    throw new Error(`POST approve: ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as { run_id: string; status: string };
}

export async function updateModels(
  projectId: string,
  input: { council_models?: Record<string, string>; judge_model?: string },
): Promise<LabProjectDetail> {
  const res = await fetch(`${BASE}/api/v1/lab-projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`PATCH lab-project: ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as LabProjectDetail;
}

export interface RunEvent {
  type: string;
  data: unknown;
}

export interface ClaimRow {
  id: string;
  status: string;
  confidence: number;
  opposition: number;
  statement: string;
}

export interface Confidence {
  source_quality: number;
  methodological_strength: number;
  independent_confirmation: number;
  contradiction_level: number;
  overall: number;
}

export interface ClaimDetail {
  claim: {
    id: string;
    statement: string;
    status: string;
    supporting_sources: string[];
    opposing_sources: string[];
    confidence: Confidence | null;
    adjudicated_by: string | null;
  };
  evidence: {
    id: string;
    source_id: string;
    location: { page?: number; section?: string };
    text_reference: string;
    supports: string[];
    evidence_type: string;
    strength: string;
  }[];
  sources: {
    id: string;
    url: string;
    title: string;
    quality_tier: number;
  }[];
}

export interface ClaimFilters {
  status?: string;
  min_confidence?: number;
  contradictions_only?: boolean;
}

export function listClaims(
  projectId: string,
  filters: ClaimFilters = {},
): Promise<ClaimRow[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.min_confidence !== undefined) {
    params.set("min_confidence", String(filters.min_confidence));
  }
  if (filters.contradictions_only) {
    params.set("contradictions_only", "true");
  }
  const query = params.toString();
  return get<ClaimRow[]>(
    `/api/v1/lab-projects/${projectId}/claims${query ? `?${query}` : ""}`,
  );
}

export function getClaimDetail(
  projectId: string,
  claimId: string,
): Promise<ClaimDetail> {
  return get<ClaimDetail>(
    `/api/v1/lab-projects/${projectId}/claims/${claimId}`,
  );
}

export interface DelegatedTask {
  id: string;
  question: string;
  reason: string;
  required_sources: string[];
  assigned_agent: string;
}

export function listTasks(
  projectId: string,
  claimId?: string,
): Promise<DelegatedTask[]> {
  const query = claimId ? `?claim_id=${encodeURIComponent(claimId)}` : "";
  return get<DelegatedTask[]>(
    `/api/v1/lab-projects/${projectId}/tasks${query}`,
  );
}

export interface GraphData {
  nodes: {
    id: string;
    type: "claim" | "source" | "evidence";
    status?: string;
    statement?: string;
    title?: string;
    url?: string;
    excerpt?: string;
    strength?: string;
  }[];
  edges: { from: string; to: string; relation: string }[];
}

export function getGraph(
  projectId: string,
  statusFilter?: string,
): Promise<GraphData> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return get<GraphData>(`/api/v1/lab-projects/${projectId}/graph${query}`);
}

export interface SearchHit {
  project_id: string;
  project_title: string;
  claim_id: string | null;
  matching_text: string;
  score: number;
}

export function searchProjects(
  q: string,
  limit = 20,
): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return get<SearchHit[]>(`/api/v1/search?${params.toString()}`);
}

export interface Idea {
  id: string;
  statement: string;
  novelty_check: { status: string; against: string[] } | null;
  proposed_experiment: { hypothesis: string; falsification_condition: string; feasibility: string } | null;
  status: "proposed" | "under_skeptic_review" | "promoted_to_claim" | "rejected";
}

export function getIdeas(projectId: string, status?: string): Promise<Idea[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return get<Idea[]>(`/api/v1/lab-projects/${projectId}/ideas${query}`);
}

export async function patchIdea(
  projectId: string,
  ideaId: string,
  input: { status: "promoted_to_claim" | "rejected" },
): Promise<{ created_claim_id?: string } & Idea> {
  const res = await fetch(`${BASE}/api/v1/lab-projects/${projectId}/ideas/${ideaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`PATCH idea: ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as { created_claim_id?: string } & Idea;
}

export interface AuditRow {
  claim_id: string;
  evidence_id: string | null;
  stage: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export function getAuditLatest(
  projectId: string,
  filters: { status?: string; claim_id?: string } = {},
): Promise<{ audit_run_id: string | null; results: AuditRow[] }> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.claim_id) params.set("claim_id", filters.claim_id);
  const query = params.toString();
  return get<{ audit_run_id: string | null; results: AuditRow[] }>(
    `/api/v1/lab-projects/${projectId}/audits/latest${query ? `?${query}` : ""}`,
  );
}

export async function rerunAudit(
  projectId: string,
  claimId?: string,
): Promise<{ audit_run_id: string; rows: number; failed: boolean }> {
  const res = await fetch(`${BASE}/api/v1/lab-projects/${projectId}/audits/rerun`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(claimId ? { claim_id: claimId } : {}),
  });
  if (!res.ok) {
    throw new Error(`POST audits/rerun: ${res.status} — ${await res.text()}`);
  }
  return (await res.json()) as { audit_run_id: string; rows: number; failed: boolean };
}

const STREAM_TYPES = ["node", "human_checkpoint", "run_done"] as const;

export function streamRun(
  projectId: string,
  runId: string,
  onEvent: (event: RunEvent) => void,
  onOpen?: () => void,
): () => void {
  const es = new EventSource(
    `${BASE}/api/v1/lab-projects/${projectId}/runs/${runId}/stream`,
  );
  // Reset-on-open: the server replays full history on every (re)connect,
  // so the slate must clear first or replayed events duplicate. Native
  // auto-reconnect fires open again — same path, no special casing.
  const openHandler = onOpen as EventListener | undefined;
  if (openHandler) {
    es.addEventListener("open", openHandler);
  }
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
    if (openHandler) {
      es.removeEventListener("open", openHandler);
    }
    es.close(); // cleanup: no dangling subscriptions
  };
}
