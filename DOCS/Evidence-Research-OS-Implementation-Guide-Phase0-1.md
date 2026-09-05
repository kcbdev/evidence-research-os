# Evidence Research OS — Implementation Guide (Phase 0 + Phase 1 MVP)

Code-level companion to the spec and plan. Everything here is meant to be copy-adapted directly into your repo, not pseudocode.

---

## 0. Repo scaffold

```
evidence-research-os/
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/           # Pydantic schemas
│   │   ├── store/            # filesystem + git layer
│   │   ├── graph/            # LangGraph state + nodes
│   │   ├── agents/           # prompts + model routing
│   │   ├── tools/            # MCP tool implementations
│   │   └── api/              # FastAPI routers
│   └── tests/
├── frontend/                 # Next.js 15 app router
│   └── src/app/...
└── lab-projects/             # data volume, NOT in the app repo — separate git remote, own history
```

### Backend deps (`backend/pyproject.toml`)

```toml
[project]
name = "evidence-research-os"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]",
  "sse-starlette",
  "langgraph>=0.2",
  "langgraph-checkpoint-sqlite",
  "openai>=1.40",          # used against OpenRouter's OpenAI-compatible endpoint
  "pydantic>=2.8",
  "pyyaml",
  "gitpython",
  "httpx",
  "trafilatura",           # web content extraction
  "pypdf",
]
```

Use `uv` to manage this (`uv sync`) — fast, matches your existing Rust-adjacent tooling preference.

### Frontend deps

```bash
npx create-next-app@latest frontend --typescript --tailwind --app
```

No extra data-fetching library needed for MVP — native `fetch` for REST, native `EventSource` for SSE streams.

### Coolify / deployment shape

Two services + one volume:
- `backend` — uvicorn container, port 8000
- `frontend` — Next.js container, port 3000
- Volume mounted at `/data/lab-projects` in the backend container, `LAB_PROJECTS_ROOT=/data/lab-projects` env var

---

## 1. Data layer

### 1.1 Pydantic models (`app/models/evidence.py`)

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime

SourceKind = Literal[
    "primary_paper", "systematic_review", "institutional_report",
    "official_data", "technical_doc", "journalism",
    "expert_commentary", "product_analogue", "web_content",
]

class Source(BaseModel):
    id: str
    type: Literal["source"] = "source"
    kind: SourceKind
    url: str
    title: str
    retrieved_at: datetime
    quality_tier: int = Field(ge=1, le=9)
    independence_cluster: Optional[str] = None

ClaimStatus = Literal[
    "SUPPORTED", "STRONGLY_SUPPORTED", "WEAKLY_SUPPORTED",
    "DISPUTED", "CONTRADICTED", "INSUFFICIENT_EVIDENCE", "UNVERIFIABLE",
]

class Confidence(BaseModel):
    source_quality: float
    methodological_strength: float
    independent_confirmation: float
    contradiction_level: float
    overall: float

class Claim(BaseModel):
    id: str
    type: Literal["claim"] = "claim"
    statement: str
    supporting_sources: list[str] = []
    opposing_sources: list[str] = []
    status: ClaimStatus = "INSUFFICIENT_EVIDENCE"
    confidence: Optional[Confidence] = None
    adjudicated_by: Optional[str] = None

class Evidence(BaseModel):
    id: str
    type: Literal["evidence"] = "evidence"
    source_id: str
    location: dict  # {"page": int, "section": str}
    text_reference: str
    supports: list[str] = []
    evidence_type: Literal["empirical", "argumentative", "analogical"]
    strength: Literal["high", "medium", "low"]

class Task(BaseModel):
    id: str
    type: Literal["task"] = "task"
    question: str
    reason: str
    required_sources: list[str] = []
    assigned_agent: Literal["scientist", "investigator", "skeptic"]

class Decision(BaseModel):
    id: str
    what: str
    why: str
    timestamp: datetime

class BudgetState(BaseModel):
    max_model_calls: int = 50
    max_research_rounds: int = 5
    calls_used: int = 0
    rounds_used: int = 0

    def exhausted(self) -> bool:
        return self.calls_used >= self.max_model_calls or self.rounds_used >= self.max_research_rounds

class ProjectMeta(BaseModel):
    id: str
    title: str
    mode: Literal["research", "brainstorm"] = "research"
    question: str
    created_at: datetime
    budget: BudgetState = BudgetState()
    council_models: dict[str, str]   # {"scientist": "...", "investigator": "...", "skeptic": "..."}
    judge_model: str
```

### 1.2 Filesystem store (`app/store/lab_project.py`)

```python
import yaml
from pathlib import Path
from git import Repo
from app.models.evidence import Source, Claim, Evidence, Task, Decision, ProjectMeta

class LabProjectStore:
    def __init__(self, root: Path, project_id: str):
        self.path = root / project_id
        self._ensure_layout()
        self.repo = Repo(self.path) if (self.path / ".git").exists() else Repo.init(self.path)

    def _ensure_layout(self):
        for sub in ["sources", "claims", "evidence", "contradictions",
                    "experiments", "tasks", "decisions", "debates",
                    "audits", "product", "output", "tool_outputs"]:
            (self.path / sub).mkdir(parents=True, exist_ok=True)

    def _write(self, subdir: str, obj_id: str, model: BaseModel, commit_msg: str):
        p = self.path / subdir / f"{obj_id}.yaml"
        p.write_text(yaml.safe_dump(model.model_dump(mode="json")))
        self.repo.index.add([str(p.relative_to(self.path))])
        self.repo.index.commit(commit_msg)

    def _read(self, subdir: str, obj_id: str, model_cls):
        p = self.path / subdir / f"{obj_id}.yaml"
        return model_cls(**yaml.safe_load(p.read_text()))

    def _list(self, subdir: str, model_cls):
        return [model_cls(**yaml.safe_load(p.read_text()))
                for p in (self.path / subdir).glob("*.yaml")]

    # Concrete accessors — repeat this pattern per object type
    def write_claim(self, c: Claim): self._write("claims", c.id, c, f"claim: {c.id} -> {c.status}")
    def read_claim(self, id: str) -> Claim: return self._read("claims", id, Claim)
    def list_claims(self) -> list[Claim]: return self._list("claims", Claim)

    def write_source(self, s: Source): self._write("sources", s.id, s, f"source: {s.id}")
    def write_evidence(self, e: Evidence): self._write("evidence", e.id, e, f"evidence: {e.id}")
    def write_decision(self, d: Decision): self._write("decisions", d.id, d, f"decision: {d.what[:60]}")
    def write_task(self, t: Task): self._write("tasks", t.id, t, f"task: {t.id}")
```

**Every write commits.** This is the audit trail — don't make it optional or batch it "for performance" later; git log of a Lab Project directory should read as the project's history.

---

## 2. LangGraph orchestration

### 2.1 State (`app/graph/state.py`)

```python
from typing import TypedDict, Literal
from app.models.evidence import Task, BudgetState

class LabProjectState(TypedDict):
    lab_project_id: str
    mode: Literal["research", "brainstorm"]
    active_question: str
    budget: BudgetState
    pending_tasks: list[Task]
    open_contradictions: list[str]
    escalate: bool           # set by trigger_classifier
    audit_passed: bool
    needs_human_approval: bool
```

### 2.2 Checkpointer setup (`app/graph/build.py`)

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from app.graph.state import LabProjectState
from app.graph import nodes

def build_graph(lab_project_path):
    checkpoint_db = lab_project_path / "checkpoint.sqlite"
    saver = SqliteSaver.from_conn_string(str(checkpoint_db))

    g = StateGraph(LabProjectState)
    g.add_node("trigger_classifier", nodes.trigger_classifier)
    g.add_node("plan", nodes.plan)
    g.add_node("independent_first_pass", nodes.independent_first_pass)
    g.add_node("evidence_extraction", nodes.evidence_extraction)
    g.add_node("conflict_detection", nodes.conflict_detection)
    g.add_node("targeted_research", nodes.targeted_research)
    g.add_node("adversarial_review", nodes.adversarial_review)
    g.add_node("evidence_adjudication", nodes.evidence_adjudication)
    g.add_node("synthesis", nodes.synthesis)
    g.add_node("citation_audit", nodes.citation_audit)
    g.add_node("targeted_repair", nodes.targeted_repair)
    g.add_node("human_checkpoint", nodes.human_checkpoint)
    g.add_node("final_output", nodes.final_output)

    g.add_edge(START, "trigger_classifier")
    g.add_conditional_edges("trigger_classifier",
        lambda s: "plan" if s["escalate"] else "final_output")
    g.add_edge("plan", "independent_first_pass")
    g.add_edge("independent_first_pass", "evidence_extraction")
    g.add_edge("evidence_extraction", "conflict_detection")
    g.add_conditional_edges("conflict_detection",
        lambda s: "targeted_research" if s["open_contradictions"] else "adversarial_review")
    g.add_edge("targeted_research", "conflict_detection")   # loop back
    g.add_edge("adversarial_review", "evidence_adjudication")
    g.add_edge("evidence_adjudication", "synthesis")
    g.add_edge("synthesis", "citation_audit")
    g.add_conditional_edges("citation_audit",
        lambda s: "human_checkpoint" if s["audit_passed"] else "targeted_repair")
    g.add_edge("targeted_repair", "citation_audit")          # loop back
    g.add_edge("human_checkpoint", "final_output")
    g.add_edge("final_output", END)

    return g.compile(checkpointer=saver, interrupt_before=["human_checkpoint"])
```

`interrupt_before=["human_checkpoint"]` is how the API's `/approve` endpoint resumes a paused run — LangGraph natively supports this, don't build a separate pause mechanism.

### 2.3 Node stubs (`app/graph/nodes.py`)

```python
from app.agents import scientist, investigator, skeptic, judge
from app.store.lab_project import LabProjectStore

def trigger_classifier(state):
    # cheap single-pass: does this question already have a confident answer?
    # if budget is tight or question is simple, skip full council
    state["escalate"] = True   # TODO: real heuristic (iMAD-style)
    return state

def plan(state):
    plan_text = scientist.run_planning(state["active_question"])
    # write plan/research-plan.yaml
    return state

def independent_first_pass(state):
    # run scientist / investigator / skeptic CONCURRENTLY, fresh context each
    # each writes its own findings — they do NOT see each other's output here
    import asyncio
    results = asyncio.run(asyncio.gather(
        scientist.investigate(state["active_question"]),
        investigator.investigate(state["active_question"]),
        skeptic.investigate(state["active_question"]),
    ))
    state["budget"]["calls_used"] += 3
    return state

def evidence_extraction(state):
    # parse findings into Evidence objects, write to evidence/*.yaml
    return state

def conflict_detection(state):
    # compare claims across the three agents' outputs
    # populate state["open_contradictions"] and write tasks/*.yaml for each
    return state

def targeted_research(state):
    store = LabProjectStore(...)
    for task in state["pending_tasks"]:
        # dispatch to task.assigned_agent only — not the full council
        pass
    state["budget"]["rounds_used"] += 1
    return state

def adversarial_review(state):
    # Skeptic reviews every major claim against the rubric in spec §3
    return state

def evidence_adjudication(state):
    # judge model resolves each claim's status — MUST be a model
    # excluded from council rotation, validated at graph-start (see agents/config.py)
    for claim in judge.adjudicate_all(state["lab_project_id"]):
        pass
    return state

def synthesis(state):
    # produce output/report.md draft from adjudicated claims
    return state

def citation_audit(state):
    # Phase 1: existence check only. Phase 3 adds pincite + support-match.
    state["audit_passed"] = True  # TODO real check
    return state

def targeted_repair(state):
    return state

def human_checkpoint(state):
    state["needs_human_approval"] = True
    return state

def final_output(state):
    return state
```

---

## 3. Agents

### 3.1 OpenRouter client (`app/agents/client.py`)

```python
from openai import OpenAI
import os

def get_client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )

def call_model(model_id: str, system: str, user: str) -> str:
    client = get_client()
    resp = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "system", "content": system},
                   {"role": "user", "content": user}],
    )
    return resp.choices[0].message.content
```

### 3.2 Model-assignment validation (`app/agents/config.py`)

```python
def validate_model_assignment(council_models: dict[str, str], judge_model: str):
    if judge_model in council_models.values():
        raise ValueError(
            f"Judge model '{judge_model}' overlaps with a council model — "
            "this is a self-preference bias risk, refusing to start run."
        )
```

Call this at graph-build time, before any node executes — not a convention, an enforced startup check, per the plan's Phase 0 note.

### 3.3 Role prompts (`app/agents/prompts.py`)

Keep these in files, not inline strings — they'll grow and need iteration independent of code changes.

```
SCIENTIST_SYSTEM = """
You are the Scientist in a research council. Your job: decompose the
question, formulate falsifiable hypotheses, identify what evidence would
confirm or refute each one. You do not search for sources yourself —
that is the Investigator's job. Output hypotheses as structured claims,
each with an explicit falsification condition.
"""

INVESTIGATOR_SYSTEM = """
You are the Investigator. Your job: find the strongest available evidence
for and against the hypotheses in front of you. Prioritize primary sources.
Actively search for contradictory evidence, not just confirming evidence —
an Investigator who only finds support is not doing the job.
"""

SKEPTIC_SYSTEM = """
You are the Skeptic. Your job is to find out why the current claims might
be wrong: unsupported assumptions, weak methodology, correlation mistaken
for causation, outdated evidence, publication bias. You are not measured
by agreement — you are measured by how many real weaknesses you surface.
"""

JUDGE_SYSTEM = """
You are the Evidence Judge. You did not participate in generating the
claims in front of you. Resolve each claim's status
(SUPPORTED/DISPUTED/CONTRADICTED/etc.) based ONLY on the evidence graph
provided. Three agents agreeing does not make an unsupported claim true —
weigh evidence, not consensus.
"""
```

---

## 4. MCP tools

### 4.1 ripgrep wrapper (`app/tools/grep_project.py`)

```python
import subprocess

def grep_project(lab_project_path: str, pattern: str, glob: str = "*.yaml") -> str:
    result = subprocess.run(
        ["rg", "--glob", glob, "-n", pattern, lab_project_path],
        capture_output=True, text=True,
    )
    return result.stdout  # agent reads this, then requests a line-range read if needed
```

Expose this as an MCP tool with a description that nudges the iterative pattern: *"Returns matching lines with line numbers. Follow up with a read_range call on a specific file rather than re-grepping broadly."*

### 4.2 Web fetch + PDF (`app/tools/fetch.py`)

```python
import httpx, trafilatura
from pypdf import PdfReader
import io

def fetch_url(url: str) -> str:
    resp = httpx.get(url, timeout=15, follow_redirects=True)
    return trafilatura.extract(resp.text) or ""

def fetch_pdf(url: str) -> str:
    resp = httpx.get(url, timeout=30)
    reader = PdfReader(io.BytesIO(resp.content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)
```

### 4.3 Tool-output cache (`app/tools/cache.py`)

```python
import hashlib
from pathlib import Path

def cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]

def cached_fetch(lab_project_path: Path, url: str, fetch_fn):
    cache_dir = lab_project_path / "tool_outputs"
    cache_file = cache_dir / f"{cache_key(url)}.txt"
    if cache_file.exists():
        return cache_file.read_text()
    result = fetch_fn(url)
    cache_file.write_text(result)
    return result
```

Every fetch tool goes through this — check before calling, no exceptions.

---

## 5. FastAPI backend

### 5.1 App structure (`app/main.py`)

```python
from fastapi import FastAPI
from app.api import lab_projects, runs, claims

app = FastAPI(title="Evidence Research OS")
app.include_router(lab_projects.router, prefix="/api/v1")
app.include_router(runs.router, prefix="/api/v1")
app.include_router(claims.router, prefix="/api/v1")
```

### 5.2 Runs router with SSE (`app/api/runs.py`)

```python
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
import asyncio, json

router = APIRouter()

@router.post("/lab-projects/{project_id}/runs")
def start_run(project_id: str, payload: dict):
    # build graph, kick off async execution, return run_id
    ...

@router.get("/lab-projects/{project_id}/runs/{run_id}/stream")
async def stream_run(project_id: str, run_id: str):
    async def event_gen():
        async for event in run_event_source(project_id, run_id):  # your event bus
            yield {"event": event["type"], "data": json.dumps(event)}
    return EventSourceResponse(event_gen())

@router.post("/lab-projects/{project_id}/runs/{run_id}/approve")
def approve_run(project_id: str, run_id: str, decision: dict):
    # LangGraph: graph.update_state(...) then graph.stream(None, config) to resume
    ...
```

### 5.3 Claims router with SQLite view (`app/api/claims.py`)

```python
import sqlite3, yaml
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

def rebuild_claims_index(lab_project_path: Path):
    """Regenerate a queryable SQLite view from claims/*.yaml. Called on-demand
    or after each write — never hand-maintained, always derived."""
    db = sqlite3.connect(lab_project_path / ".index" / "claims.db")
    db.execute("""CREATE TABLE IF NOT EXISTS claims
        (id TEXT PRIMARY KEY, status TEXT, confidence REAL, statement TEXT)""")
    for f in (lab_project_path / "claims").glob("*.yaml"):
        c = yaml.safe_load(f.read_text())
        conf = (c.get("confidence") or {}).get("overall", 0)
        db.execute("INSERT OR REPLACE INTO claims VALUES (?,?,?,?)",
                   (c["id"], c["status"], conf, c["statement"]))
    db.commit()

@router.get("/lab-projects/{project_id}/claims")
def list_claims(project_id: str, status: str | None = None, min_confidence: float = 0.0):
    # query the .index/claims.db view — this is the "filter by status + confidence" case
    # grep can't do; the view exists exactly for this
    ...
```

---

## 6. Frontend

### 6.1 API client (`frontend/src/lib/api.ts`)

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL;

export async function listLabProjects() {
  return fetch(`${BASE}/api/v1/lab-projects`).then(r => r.json());
}

export function streamRun(projectId: string, runId: string, onEvent: (e: any) => void) {
  const es = new EventSource(`${BASE}/api/v1/lab-projects/${projectId}/runs/${runId}/stream`);
  es.onmessage = (msg) => onEvent(JSON.parse(msg.data));
  return () => es.close();  // cleanup
}
```

### 6.2 Run view with live SSE (`frontend/src/app/lab/[id]/runs/[runId]/page.tsx`)

```tsx
"use client";
import { useEffect, useState } from "react";
import { streamRun } from "@/lib/api";

export default function RunView({ params }: { params: { id: string; runId: string } }) {
  const [events, setEvents] = useState<any[]>([]);
  const [needsApproval, setNeedsApproval] = useState(false);

  useEffect(() => {
    return streamRun(params.id, params.runId, (e) => {
      setEvents((prev) => [...prev, e]);
      if (e.type === "human_checkpoint") setNeedsApproval(true);
    });
  }, [params.id, params.runId]);

  return (
    <div>
      <RunActivityFeed events={events} />
      {needsApproval && <ApprovalModal projectId={params.id} runId={params.runId} />}
    </div>
  );
}
```

### 6.3 Claims table (`frontend/src/app/lab/[id]/claims/page.tsx`)

Fetch `/claims?status=...&min_confidence=...` server-side or via a client hook, render as a filterable table, each row opens `EvidenceTraceModal` on click — pull the claim's linked evidence/sources via `/claims/{id}`.

---

## 7. Validation checklist before calling MVP done

- [ ] Create a Lab Project, confirm `.git` history shows one commit per object write
- [ ] Run a real question end-to-end: `plan → independent_first_pass → evidence_extraction → conflict_detection → adversarial_review → evidence_adjudication → synthesis → citation_audit → human_checkpoint`
- [ ] Confirm the graph actually pauses at `human_checkpoint` and resumes correctly via `/approve`
- [ ] Confirm judge model ≠ any council model — try to misconfigure it and verify the startup check refuses
- [ ] Open the Claims table in the UI, click through `EvidenceTraceModal` to a real source, confirm the trace is accurate
- [ ] Verify budget controller actually stops a run at `max_model_calls` rather than erroring out mid-call
- [ ] Confirm re-running the same question doesn't re-fetch already-cached URLs (check `tool_outputs/`)

---

## What's deliberately not here

No Tantivy, no LanceDB, no Brainstorm mode, no pincite/support-match citation checks — those are Phase 2/3 per the implementation plan, and belong in their own guide once this one is running against a real topic.
