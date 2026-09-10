# Evidence Research OS — API Reference v1

Base path: `/api/v1`. All requests/responses are JSON except the SSE stream endpoint (`text/event-stream`). No auth in v1 — single-operator, bind to localhost/private network only; add auth before exposing beyond that.

**Conventions:**
- IDs are prefixed and sequential per type: `S-004` (source), `C-017` (claim), `E-102` (evidence), `I-008` (idea), `D-011` (decision), `R-042` (task).
- Timestamps: ISO 8601 UTC.
- Errors: standard FastAPI shape, `{"detail": "message"}`, with the relevant 4xx/5xx status code.
- No pagination in v1 (single-operator scale) — list endpoints return everything matching the filter.

---

## Lab Projects

### `GET /lab-projects`
List all Lab Projects.

**Query params:** none.
**Response:**
```json
[{
  "id": "runfusion-model-sourcing",
  "title": "...",
  "mode": "research",
  "status": "idle | running | awaiting_approval | done",
  "open_contradictions": 2,
  "last_activity": "2026-09-01T10:00:00Z",
  "budget": {"calls_used": 12, "max_model_calls": 50}
}]
```

### `POST /lab-projects`
Create a Lab Project.

**Body:**
```json
{
  "title": "string, required",
  "question": "string, required",
  "mode": "research | brainstorm | academic",
  "methodology_id": "string, optional — defaults to the default methodology for this mode",
  "budget_overrides": {"max_model_calls": 50, "max_research_rounds": 5}
}
```
**Response:** the created `ProjectMeta` object (spec §1.1), 201.

### `GET /lab-projects/{project_id}`
Full project metadata + summary counts.

**Path params:** `project_id`.
**Response:** `ProjectMeta` + `{"claim_counts": {...}, "idea_counts": {...}}`.

### `DELETE /lab-projects/{project_id}`
Archive (soft — never hard-deletes). Requires `?confirm=true` or returns 400.

**Query params:** `confirm: bool`.
**Response:** 204.

---

## Runs

### `POST /lab-projects/{project_id}/runs`
Start a new run.

**Body:**
```json
{
  "question": "string, optional override of the project's question",
  "mode": "research | brainstorm | academic, optional, defaults to project mode",
  "methodology_id": "string, optional, defaults to the mode's default methodology",
  "budget_override": {"max_model_calls": 50, "max_research_rounds": 5}
}
```
**Response:** `{"run_id": "...", "status": "started"}`, 202.

### `GET /lab-projects/{project_id}/runs`
List all runs for a project (history).

**Response:**
```json
[{"run_id": "...", "started_at": "...", "mode": "research",
  "methodology_id": "...", "status": "done", "duration_seconds": 340,
  "estimated_cost_usd": 0.14}]
```

### `GET /lab-projects/{project_id}/runs/{run_id}`
Single run status/detail.

**Response:** as above, plus `"current_node": "adversarial_review"` if live, plus the full node-transition log if completed.

### `GET /lab-projects/{project_id}/runs/{run_id}/stream`
SSE stream of live run events. `Content-Type: text/event-stream`.

**Event payloads** (`event` field / `data` JSON):
- `node_transition` — `{"node": "...", "summary": "1-line description"}`
- `human_checkpoint` — `{"pending_action": "...", "context": {...}}`
- `budget_update` — `{"calls_used": 13, "rounds_used": 2}`
- `run_complete` — `{"status": "done | failed", "error": "... (if failed)"}`

### `POST /lab-projects/{project_id}/runs/{run_id}/approve`
Resolve a paused `human_checkpoint`.

**Body:**
```json
{"decision": "approve | reject | edit", "edited_content": "optional, only if decision=edit"}
```
**Response:** `{"status": "resumed"}`, 200.

### `POST /lab-projects/{project_id}/runs/{run_id}/retry`
Retry a failed run from its last successful checkpoint.

**Response:** `{"run_id": "...", "status": "resumed"}`, 202.

---

## Claims

### `GET /lab-projects/{project_id}/claims`
Filterable claim list, backed by the regenerated SQLite view (spec §5.3).

**Query params:**
- `status`: comma-separated `ClaimStatus` values, optional
- `min_confidence`: float 0-1, optional
- `contradictions_only`: bool, optional

**Response:**
```json
[{"id": "C-017", "statement": "...", "status": "DISPUTED",
  "confidence": {"overall": 0.68, ...}, "source_count": 3,
  "has_open_contradiction": true}]
```

### `GET /lab-projects/{project_id}/claims/{claim_id}`
Full claim detail — evidence and sources embedded (single call for `EvidenceTraceModal`, no separate evidence/source fetches needed).

**Response:**
```json
{
  "id": "C-017", "statement": "...", "status": "DISPUTED",
  "confidence": {"source_quality": 0.92, "methodological_strength": 0.84,
                 "independent_confirmation": 0.78, "contradiction_level": 0.22,
                 "overall": 0.68},
  "adjudicated_by": "model-id", "adjudicated_at": "...",
  "evidence": [{"id": "E-102", "source": {"id": "S-021", "title": "...", "url": "..."},
                "text_reference": "...", "strength": "high", "supports": true}],
  "audit": {"existence": "PASS", "pincite": "PASS", "support_match": "WARNING",
            "detail": "..."}
}
```

---

## Ideas (brainstorm mode)

### `GET /lab-projects/{project_id}/ideas`

**Query params:** `status`: one of `IdeaStatus`, optional.
**Response:**
```json
[{"id": "I-008", "statement": "...", "status": "under_skeptic_review",
  "novelty_check": {"status": "novel", "against": []},
  "proposed_experiment": {"hypothesis": "...", "falsification_condition": "...",
                          "feasibility": "medium"}}]
```

### `PATCH /lab-projects/{project_id}/ideas/{idea_id}`
Manual status change (promote/reject).

**Body:** `{"status": "promoted_to_claim | rejected"}`
**Response:** updated `Idea`. If `promoted_to_claim`, also returns `{"created_claim_id": "C-021"}`.

---

## Evidence graph

### `GET /lab-projects/{project_id}/graph`
Node/edge data for the graph explorer view.

**Query params:** `status_filter`: optional claim-status filter, restricts to matching claims and their neighborhood.
**Response:**
```json
{
  "nodes": [{"id": "C-017", "type": "claim", "status": "DISPUTED"},
            {"id": "S-021", "type": "source"}, {"id": "E-102", "type": "evidence"}],
  "edges": [{"from": "E-102", "to": "C-017", "relation": "supports"}]
}
```

---

## Citation audit

### `GET /lab-projects/{project_id}/audits/latest`

**Query params:** `status`: `PASS|WARNING|FAIL`, optional filter.
**Response:**
```json
[{"claim_id": "C-017", "evidence_id": "E-102",
  "checks": [{"stage": "existence", "status": "PASS", "detail": ""},
             {"stage": "pincite", "status": "PASS", "detail": ""},
             {"stage": "support_match", "status": "WARNING", "detail": "..."}]}]
```

### `POST /lab-projects/{project_id}/audits/rerun`
Re-run the audit (optionally scoped to one claim).

**Body:** `{"claim_id": "optional, omit for full re-run"}`
**Response:** `{"status": "started"}`, 202 (audit runs async, poll `/audits/latest`).

---

## Decisions (episodic log)

### `GET /lab-projects/{project_id}/decisions`

**Response:** `[{"id": "D-011", "what": "...", "why": "...", "timestamp": "..."}]`, reverse-chronological.

---

## Output

### `GET /lab-projects/{project_id}/output/report`

**Response:** `{"markdown": "...", "generated_at": "..."}` — or 404 if no completed run yet.

### `POST /lab-projects/{project_id}/product-notes`

**Body:** `{"note": "string, required", "linked_area": "optional /areas/ slug"}`
**Response:** created `ProductNote`, 201.

### `GET /lab-projects/{project_id}/product-notes`

**Response:** `[{"id": "...", "note": "...", "linked_area": "...", "created_at": "..."}]`

---

## Budget

### `GET /lab-projects/{project_id}/budget`

**Response:** `{"max_model_calls": 50, "calls_used": 12, "max_research_rounds": 5, "rounds_used": 1}`

---

## Cross-project search (Phase 4)

### `GET /search`

**Query params:** `q`: string, required. `limit`: int, default 20.
**Response:**
```json
[{"project_id": "...", "project_title": "...", "claim_id": "C-017",
  "matching_text": "...", "score": 0.87}]
```

---

## Methodologies (Phase 5)

### `GET /methodologies`

**Response:** `[{"id": "...", "name": "...", "description": "...", "is_default": true, "compatible_modes": ["research"]}]`

### `POST /methodologies`
Create a new methodology.

**Body:** full `Methodology` object (spec Phase 5 §Task 40 schema — workflow/tools/prompts/skills/models/budget_defaults, plus optional `custom_roles` per Phase 5b).
**Response:** created object, 201. Validation errors (unknown node name, judge/council overlap) return 422 with the specific field.

### `GET /methodologies/{id}`
Full methodology definition (for the YAML editor view).

### `PUT /methodologies/{id}`
Update an existing methodology. Same body/validation as POST.

### `POST /methodologies/{id}/set-default`
**Response:** `{"default": "id"}`. Unsets `is_default` on whichever methodology previously held it for the same `compatible_modes` entry.

---

## Settings

### `GET /settings/models`
Current per-role model assignment (used as the fallback when a methodology doesn't specify its own).

**Response:** `{"scientist": "...", "investigator": "...", "skeptic": "...", "judge": "...", "ideator": "..."}`

### `PUT /settings/models`
**Body:** same shape as above.
**Response:** 200, or 422 with `{"detail": "judge model overlaps with council model"}` if validation fails — same check the backend enforces at run-start, surfaced here before a run ever gets the chance to hit it.

### `GET /settings/budget`
### `PUT /settings/budget`
**Body/response:** `{"max_model_calls": 50, "max_research_rounds": 5, "max_sources": 100, "max_sources_per_claim": 10}` — fallback defaults for new Lab Projects/methodologies that don't specify their own.

---

## Endpoint summary table

| Method | Path |
|---|---|
| GET | `/lab-projects` |
| POST | `/lab-projects` |
| GET | `/lab-projects/{id}` |
| DELETE | `/lab-projects/{id}` |
| POST | `/lab-projects/{id}/runs` |
| GET | `/lab-projects/{id}/runs` |
| GET | `/lab-projects/{id}/runs/{run_id}` |
| GET | `/lab-projects/{id}/runs/{run_id}/stream` |
| POST | `/lab-projects/{id}/runs/{run_id}/approve` |
| POST | `/lab-projects/{id}/runs/{run_id}/retry` |
| GET | `/lab-projects/{id}/claims` |
| GET | `/lab-projects/{id}/claims/{claim_id}` |
| GET | `/lab-projects/{id}/ideas` |
| PATCH | `/lab-projects/{id}/ideas/{idea_id}` |
| GET | `/lab-projects/{id}/graph` |
| GET | `/lab-projects/{id}/audits/latest` |
| POST | `/lab-projects/{id}/audits/rerun` |
| GET | `/lab-projects/{id}/decisions` |
| GET | `/lab-projects/{id}/output/report` |
| POST | `/lab-projects/{id}/product-notes` |
| GET | `/lab-projects/{id}/product-notes` |
| GET | `/lab-projects/{id}/budget` |
| GET | `/search` |
| GET | `/methodologies` |
| POST | `/methodologies` |
| GET | `/methodologies/{id}` |
| PUT | `/methodologies/{id}` |
| POST | `/methodologies/{id}/set-default` |
| GET | `/settings/models` |
| PUT | `/settings/models` |
| GET | `/settings/budget` |
| PUT | `/settings/budget` |

31 endpoints total. `/search`, `/methodologies/*` only apply from Phase 4/5 onward — don't scaffold their routers until those phases start, per the build-order already set.
