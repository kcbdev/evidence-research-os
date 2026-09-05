"""Graph nodes. Classifier + plan are PBI-006/008; the council loop below
is PBI-011; review/adjudication/synthesis (PBI-012) and audit/repair/
checkpoint/output (PBI-013) remain named stubs.

PBI-011 design notes:
- Council LLM calls run concurrently via asyncio.to_thread (the OpenAI
  client is blocking); ALL store writes happen after the gather, inside
  single-threaded node bodies — so the git-index race (PBI-004 review)
  cannot trigger by construction. Nodes return PARTIAL updates, never
  mutated full state (parallel-branch lost-update risk).
- Extraction parses a documented line protocol (FINDING_FORMAT, sent in
  the user message so system prompts stay guide-verbatim). Detection is
  deliberately cheap/heuristic (token-overlap challenge matching); the
  expensive targeted-research loop is the quality mechanism, not the
  detector.
- Conflict routing gained an exhaustion branch (PBI-007 deferral, see
  build.py): an exhausted budget mid-loop ends at final_output.
"""
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import yaml
from app.agents.client import call_model
from app.agents.prompts import load_prompt
from app.graph.budget import consume_calls, consume_round, is_exhausted
from app.graph.state import LabProjectState
from app.models.evidence import Claim, Evidence, Source, Task
from app.store.lab_project import LabProjectStore

FINDING_FORMAT = """
Append structured findings using these exact line prefixes (one per line):
CLAIM: <a falsifiable statement>
EVIDENCE: <short excerpt> || <source URL> || <page/section> [|| <empirical|argumentative|analogical>]
(Skeptic only) CHALLENGE: <a statement from the question area you dispute, in your own words>
"""

ROLES = ("scientist", "investigator", "skeptic")

# MVP-crude matcher floor: token overlap bar for challenge→claim matches.
CHALLENGE_OVERLAP = 0.4


def _tokens(text: str) -> set[str]:
    out = set()
    for raw in text.lower().split():
        tok = "".join(c for c in raw if c.isalnum())
        if len(tok) > 3 and tok.endswith("s"):
            tok = tok[:-1]  # crude stemmer, applied symmetrically
        if tok:
            out.add(tok)
    return out


def _overlap(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def parse_findings(text: str):
    """Parse the FINDING_FORMAT protocol into ordered events.

    Yields ("claim", statement), ("evidence", excerpt, url, loc, etype),
    ("challenge", statement). Malformed lines are ignored.
    """
    for line in (text or "").splitlines():
        line = line.strip()
        if line.startswith("CLAIM:"):
            statement = line[len("CLAIM:"):].strip()
            if statement:
                yield ("claim", statement)
        elif line.startswith("EVIDENCE:"):
            parts = [p.strip() for p in line[len("EVIDENCE:"):].split("||")]
            if len(parts) >= 3 and parts[0] and parts[1]:
                etype = parts[3] if len(parts) > 3 else "argumentative"
                if etype not in ("empirical", "argumentative", "analogical"):
                    etype = "argumentative"
                yield ("evidence", parts[0], parts[1], parts[2], etype)
        elif line.startswith("CHALLENGE:"):
            statement = line[len("CHALLENGE:"):].strip()
            if statement:
                yield ("challenge", statement)


def trigger_classifier(state: LabProjectState) -> LabProjectState:
    # Cheap single-pass gate (iMAD-style). TODO: real heuristic — skip the
    # full council for answered/simple questions or tight budgets.
    # Hard stop (PBI-007): an exhausted budget never escalates — the run
    # ends at final_output instead of erroring mid-council.
    state["escalate"] = not is_exhausted(state)
    return state


def make_plan(lab_project_path: Path):
    """Plan node bound to a project dir. PBI-008 wires the Scientist here;
    until then it records run intent as a placeholder (a run artifact like
    output/report.md — not an evidence object type, so the store doesn't
    own it). Decided PBI-008: plan/ stays an uncommitted run artifact;
    the human's scope approval is recorded in decisions/ by PBI-014's
    approve endpoint, not by versioning the plan file."""

    def plan(state: LabProjectState) -> LabProjectState:
        plan_dir = Path(lab_project_path) / "plan"
        plan_dir.mkdir(parents=True, exist_ok=True)
        (plan_dir / "research-plan.yaml").write_text(
            yaml.safe_dump({
                "question": state["active_question"],
                "mode": state["mode"],
                "status": "stub",
            })
        )
        return state

    return plan


def make_independent_first_pass(lab_project_path: Path):
    """Run the three council roles concurrently, fresh context each: every
    role sees ONLY the question + format block, never another role's
    output (spec anti-pattern). Models come from project.yaml (single
    source of truth) at run time."""

    async def _run_all(question: str, models: dict) -> dict:
        async def _one(role: str) -> tuple[str, str]:
            text = await asyncio.to_thread(
                call_model,
                models[role],
                load_prompt(role),
                question + "\n" + FINDING_FORMAT,
            )
            return role, text

        return dict(await asyncio.gather(*(_one(r) for r in ROLES)))

    def independent_first_pass(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        models = store.read_meta().council_models
        findings = asyncio.run(_run_all(state["active_question"], models))
        budget = state["budget"].model_copy(
            update={"calls_used": state["budget"].calls_used + 3})
        return {"first_pass": findings, "budget": budget}

    return independent_first_pass


def make_evidence_extraction(lab_project_path: Path):
    """Parse first-pass findings into Claim/Evidence/Source objects.

    Caps (ProjectMeta max_sources / max_sources_per_claim, PBI-011 owns):
    per-claim evidence truncated in order, new sources stop at the cap.
    Unassessed web sources enter at quality_tier 9 (lowest) — honest
    placeholder until the citation pipeline grades them (Phase 3).
    """

    def evidence_extraction(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        caps = store.read_meta()  # project.yaml always exists; loud if not
        per_claim, max_sources = caps.max_sources_per_claim, caps.max_sources
        findings = state.get("first_pass", {}) or {}
        for role in ROLES:
            _extract_role(store, role, findings.get(role, ""),
                          per_claim, max_sources)
        return {}

    return evidence_extraction


def _extract_role(store: LabProjectStore, role: str, text: str,
                  per_claim: int, max_sources: int):
    ci = ei = 0
    current_claim: str | None = None
    claimed_evidence = 0
    url_to_source: dict[str, str] = {}
    for event in parse_findings(text):
        if event[0] == "claim":
            ci += 1
            current_claim = f"C-{role}-{ci:03d}"
            claimed_evidence = 0
            store.write_claim(Claim(id=current_claim, statement=event[1]))
        elif event[0] == "evidence":
            if current_claim is None or claimed_evidence >= per_claim:
                continue
            _, excerpt, url, loc, etype = event
            if url not in url_to_source:
                if len(url_to_source) >= max_sources:
                    continue
                sid = f"S-{role}-{len(url_to_source) + 1:03d}"
                url_to_source[url] = sid
                store.write_source(Source(
                    id=sid, kind="web_content", url=url, title=url,
                    retrieved_at=datetime.now(timezone.utc),
                    quality_tier=9))
            ei += 1
            claimed_evidence += 1
            store.write_evidence(Evidence(
                id=f"E-{role}-{ei:03d}", source_id=url_to_source[url],
                location={"section": loc}, text_reference=excerpt,
                supports=[current_claim], evidence_type=etype,
                strength="medium"))


def make_conflict_detection(lab_project_path: Path):
    """Recompute open contradictions from scratch (overwrite, never append):
    skeptic CHALLENGE lines token-matched against extracted claims."""

    def conflict_detection(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        findings = state.get("first_pass", {}) or {}
        challenges = [e[1] for e in parse_findings(findings.get("skeptic", ""))
                      if e[0] == "challenge"]
        claims = store.list_claims()
        open_ids: list[str] = []
        tasks: list[Task] = []
        for claim in claims:
            hit = next((c for c in challenges
                        if _overlap(c, claim.statement) >= CHALLENGE_OVERLAP),
                       None)
            if hit is not None:
                open_ids.append(claim.id)
                tasks.append(Task(
                    id=f"T-{claim.id}",
                    question=f"Adjudicate conflicting evidence on: {claim.statement}",
                    reason=f"Skeptic challenge: {hit}",
                    assigned_agent="investigator"))
        for task in tasks:
            existing = {t.id for t in store.list_tasks()}
            if task.id not in existing:
                store.write_task(task)
        return {"open_contradictions": open_ids,
                "pending_tasks": tasks}

    return conflict_detection


def make_targeted_research(lab_project_path: Path):
    """Dispatch each pending task to its assigned agent only (not the full
    council). Transcripts land in debates/<task>.md (discardable scratch,
    like plan/). Tasks are consumed; the loop-back recomputes conflicts."""

    def targeted_research(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        models = store.read_meta().council_models
        debates = Path(lab_project_path) / state["lab_project_id"] / "debates"
        debates.mkdir(parents=True, exist_ok=True)
        for task in state.get("pending_tasks", []) or []:
            agent = task.assigned_agent if isinstance(task, Task) else task["assigned_agent"]
            tid = task.id if isinstance(task, Task) else task["id"]
            model = models.get(agent, next(iter(models.values())))
            text = call_model(model, load_prompt(agent),
                              task.question if isinstance(task, Task)
                              else task["question"])
            (debates / f"{tid}.md").write_text(text)
        budget = state["budget"].model_copy(
            update={"rounds_used": state["budget"].rounds_used + 1})
        return {"pending_tasks": [], "budget": budget}

    return targeted_research


def adversarial_review(state: LabProjectState) -> LabProjectState:
    return state  # PBI-012


def evidence_adjudication(state: LabProjectState) -> LabProjectState:
    return state  # PBI-012


def synthesis(state: LabProjectState) -> LabProjectState:
    return state  # PBI-012


def citation_audit(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013


def targeted_repair(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013


def human_checkpoint(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013 (sets needs_human_approval there)


def final_output(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013
