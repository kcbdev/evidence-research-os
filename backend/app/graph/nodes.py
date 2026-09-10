"""Graph nodes. Classifier + plan are PBI-006/008, the council loop is
PBI-011, review/adjudication/synthesis are PBI-012; audit/repair/
checkpoint/output remain named stubs for PBI-013.

PBI-011 design notes:
- Council LLM calls run concurrently via asyncio.to_thread (the OpenAI
  client is blocking); ALL store writes happen after the gather, inside
  single-threaded node bodies — so the git-index race (PBI-004 review)
  cannot trigger by construction. The concurrent-loop nodes return
  PARTIAL updates and consume budget via the PBI-007 helpers on copies,
  never mutated full state (parallel-branch lost-update risk). The older
  sync nodes (classifier/plan) still return full state — moot, as the
  topology has no parallel graph branches.
- NOTE on fetching: these nodes make no fetch calls at all (LLM boundary
  only). Runtime MCP fetch wiring + session_id readers arrive with the
  run harness (open backlog, see PROGRESS) — the raw-fetch ban test
  guards the boundary meanwhile.
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
from app.agents.client import call_model_resilient
from app.agents.prompts import load_prompt, get_skeptic_rubric
from app.graph.budget import consume_calls, consume_round, is_exhausted
from app.graph.state import LabProjectState
from app.models.evidence import AuditCheck, Claim, Decision, Evidence, Idea, NoveltyCheck, ProposedExperiment, Source, Task
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


def _has_substance(text: str) -> bool:
    """MVP-crude floor for model-emitted lines (PBI-019 witness: a live
    model wrote `CLAIM: ...` and the parser enshrined literal dots as a
    claim). A finding must carry prose: >= 10 chars with >= 2
    alphanumeric words. Below that is a placeholder, not a finding —
    dropped. English-token assumption (space-split); non-alphabetic
    scripts need a revisit, not silent judging today."""
    words = [w for w in text.split() if any(c.isalnum() for c in w)]
    return len(text.strip()) >= 10 and len(words) >= 2


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


def parse_findings(text: str) -> tuple[list[tuple], int]:
    """Parse the FINDING_FORMAT protocol into ordered events plus a
    skipped-line count (malformed lines are NEVER silent: the count is
    returned for tests and, at runtime, for the future observability
    surface — see the runtime-MCP backlog note in PROGRESS).

    Yields ("claim", statement), ("evidence", excerpt, url, loc, etype),
    ("challenge", statement).
    """
    events: list[tuple] = []
    skipped = 0
    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("CLAIM:"):
            statement = line[len("CLAIM:"):].strip()
            if statement:
                events.append(("claim", statement))
            else:
                skipped += 1
        elif line.startswith("EVIDENCE:"):
            parts = [p.strip() for p in line[len("EVIDENCE:"):].split("||")]
            if len(parts) >= 3 and parts[0] and parts[1]:
                etype = parts[3] if len(parts) > 3 else "argumentative"
                if etype not in ("empirical", "argumentative", "analogical"):
                    etype = "argumentative"
                events.append(("evidence", parts[0], parts[1], parts[2], etype))
            else:
                skipped += 1
        elif line.startswith("CHALLENGE:"):
            statement = line[len("CHALLENGE:"):].strip()
            if statement:
                events.append(("challenge", statement))
            else:
                skipped += 1
        else:
            skipped += 1
    return events, skipped


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
            }), encoding="utf-8"
        )
        return state

    return plan


def make_independent_first_pass(lab_project_path: Path):
    """Run the three council roles concurrently, fresh context each: every
    role sees ONLY the question + format block, never another role's
    output (spec anti-pattern). Models come from project.yaml (single
    source of truth) at run time."""

    async def _run_all(question: str, models: dict) -> dict:
        async def _one(role: str) -> tuple[str, str, int]:
            text, attempts = await asyncio.to_thread(
                call_model_resilient,
                models[role],
                load_prompt(role),
                question + "\n" + FINDING_FORMAT,
            )
            return role, text, attempts

        return {role: (text, attempts)
                for role, text, attempts
                in await asyncio.gather(*(_one(r) for r in ROLES))}

    def independent_first_pass(state) -> dict:
        if state.get("mode") == "brainstorm":
            return _brainstorm_pass(Path(lab_project_path), state)
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        models = store.read_meta().council_models
        # Sync-node only: LangGraph runs sync nodes in a worker thread with
        # no running loop, so asyncio.run is safe. Never await this node
        # directly from async code (would raise "asyncio.run() cannot be
        # called from a running event loop").
        results = asyncio.run(_run_all(state["active_question"], models))
        findings = {role: text for role, (text, _) in results.items()}
        spent = sum(attempts for _, (_, attempts) in results.items())
        # Route through the PBI-007 helper (no dead imports): consume on a
        # copy so the input BudgetState is never mutated in place.
        tmp = {"budget": state["budget"].model_copy()}
        consume_calls(tmp, spent)
        return {"first_pass": findings, "budget": tmp["budget"]}

    return independent_first_pass


def _brainstorm_pass(lab_project_path: Path, state) -> dict:
    """Sequential ideation loop (PBI-034): each proposal sees all prior
    ideas, so calls are sequential, never gathered. New ideas per run are
    capped by max_research_rounds (the loop bound); attempts are charged
    whether the proposal parses or not — junk is never free."""
    from app.agents.ideator import propose
    store = LabProjectStore(lab_project_path, state["lab_project_id"])
    meta = store.read_meta()
    try:
        model = meta.council_models["ideator"]
    except KeyError:
        raise ValueError(
            "brainstorm mode needs an 'ideator' model in council_models")
    cap = max(1, meta.budget.max_research_rounds)
    prior = [i.statement for i in store.list_ideas()]
    statements: list[str] = []
    spent = 0
    for _ in range(cap):
        idea, attempts = propose(state["active_question"],
                                 prior + statements, model)
        spent += attempts
        if idea is None:
            continue  # unparsable proposal: charged, not written
        if not idea["hypothesis"] or not idea["falsification_condition"]:
            continue  # no falsification test, no hypothesis (the
            # ideator prompt's own rule) — charged, not written
        n = len(store.list_ideas()) + 1
        store.write_idea(Idea(
            id=f"I-{n:03d}", statement=idea["statement"],
            proposed_experiment=ProposedExperiment(
                hypothesis=idea["hypothesis"],
                falsification_condition=idea["falsification_condition"],
                feasibility=idea["feasibility"])))
        statements.append(idea["statement"])
    tmp = {"budget": state["budget"].model_copy()}
    consume_calls(tmp, spent)
    return {"first_pass": {"ideator": "\n".join(statements)},
            "budget": tmp["budget"]}


NOVELTY_FORMAT = """
Classify the candidate idea against the existing list. Reply with exactly:
VERDICT: <NOVEL|ADJACENT|DUPLICATE>
AGAINST: <comma-separated idea ids it overlaps, or "none">
"""


def _parse_novelty(text: str) -> tuple[str, list[str]]:
    """Parse VERDICT/AGAINST lines. Unparseable verdicts default to novel
    (least destructive — PBI-035's skeptic review re-examines everything);
    unknown ids in AGAINST are dropped, never enshrined."""
    verdict, against = "novel", []
    for line in (text or "").splitlines():
        line = line.strip()
        if line.startswith("VERDICT:"):
            v = line[len("VERDICT:"):].strip().upper()
            if v in ("NOVEL", "ADJACENT", "DUPLICATE"):
                verdict = v.lower()
        elif line.startswith("AGAINST:"):
            rest = line[len("AGAINST:"):].strip()
            if rest.lower() != "none":
                against = [p.strip() for p in rest.split(",") if p.strip()]
    return verdict, against


def make_novelty_check(lab_project_path: Path):
    """PBI-034 (guide Task 23): Skeptic-model novelty judgment for fresh
    `proposed` ideas lacking a novelty_check — replaces conflict_detection
    on brainstorm runs. Sequential (each verdict joins the priors for the
    next). NOTE: still on the research skeptic rubric; PBI-035 swaps in
    the brainstorm rubric + idea lifecycle."""

    def novelty_check(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        models = store.read_meta().council_models
        ideas = store.list_ideas()
        fresh = [i for i in ideas
                 if i.status == "proposed" and i.novelty_check is None]
        priors = [i for i in ideas if i not in fresh]
        spent = 0
        for idea in fresh:
            listing = "\n".join(f"{p.id}: {p.statement}" for p in priors)
            text, attempts = call_model_resilient(
                models["skeptic"], load_prompt("skeptic"),
                f"Candidate idea:\n{idea.id}: {idea.statement}\n\n"
                f"Existing ideas:\n{listing or '(none yet)'}\n"
                f"{NOVELTY_FORMAT}")
            spent += attempts
            verdict, against = _parse_novelty(text)
            known = {p.id for p in priors} | {idea.id}
            idea.novelty_check = NoveltyCheck(
                status=verdict,
                against=[a for a in against
                         if a in known and a != idea.id])
            store.write_idea(idea)
            priors.append(idea)
        tmp = {"budget": state["budget"].model_copy()}
        consume_calls(tmp, spent)
        return {"budget": tmp["budget"]}

    return novelty_check


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
        # Global URL registry (preloaded with existing sources): the
        # max_sources cap spans roles AND prior runs, not per role.
        url_to_source = {s.url: s.id for s in store.list_sources()}
        for role in ROLES:
            events, _skipped = parse_findings(findings.get(role, ""))
            _extract_role(store, role, events, per_claim, max_sources,
                          url_to_source)
        return {}

    return evidence_extraction


def _extract_role(store: LabProjectStore, role: str, events: list,
                  per_claim: int, max_sources: int,
                  url_to_source: dict[str, str]):
    ci = ei = 0
    current_claim: str | None = None
    claimed_evidence = 0
    for event in events:
        if event[0] == "claim":
            if not _has_substance(event[1]):
                continue  # placeholder, not a finding (witness: "...").
                # NOTE: current_claim deliberately NOT reset — trailing
                # evidence after a stray placeholder still attaches to the
                # last real claim (recall-tolerant; revisit if abused).
            ci += 1
            current_claim = f"C-{role}-{ci:03d}"
            claimed_evidence = 0
            store.write_claim(Claim(id=current_claim, statement=event[1]))
        elif event[0] == "evidence":
            if current_claim is None or claimed_evidence >= per_claim:
                continue
            _, excerpt, url, loc, etype = event
            if not _has_substance(excerpt):
                continue
            if url not in url_to_source:
                if len(url_to_source) >= max_sources:
                    continue
                # Global cap, per-role readable suffix.
                n = sum(1 for sid in url_to_source.values()
                        if sid.startswith(f"S-{role}-")) + 1
                url_to_source[url] = f"S-{role}-{n:03d}"
                store.write_source(Source(
                    id=url_to_source[url], kind="web_content", url=url,
                    title=url,
                    retrieved_at=datetime.now(timezone.utc),
                    quality_tier=9))
            ei += 1
            claimed_evidence += 1
            store.write_evidence(Evidence(
                id=f"E-{role}-{ei:03d}", source_id=url_to_source[url],
                location={"section": loc}, text_reference=excerpt,
                supports=[current_claim], evidence_type=etype,
                # "medium": an LLM-synthesized finding is neither a vetted
                # empirical result (high) nor a throwaway (low) until audit.
                strength="medium"))


def make_conflict_detection(lab_project_path: Path):
    """Recompute open contradictions from scratch (overwrite, never append):
    skeptic CHALLENGE lines token-matched against extracted claims."""

    def conflict_detection(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        findings = state.get("first_pass", {}) or {}
        events, _skipped = parse_findings(findings.get("skeptic", ""))
        challenges = [e[1] for e in events if e[0] == "challenge"]
        claims = store.list_claims()
        computed: dict[str, Task] = {}
        for claim in claims:
            hit = next((c for c in challenges
                        if _overlap(c, claim.statement) >= CHALLENGE_OVERLAP),
                       None)
            if hit is not None:
                computed[f"T-{claim.id}"] = Task(
                    id=f"T-{claim.id}",
                    question=f"Adjudicate conflicting evidence on: {claim.statement}",
                    reason=f"Skeptic challenge: {hit}",
                    assigned_agent="investigator")
        # Reconcile the queue (a queue, not an archive): upsert new or
        # changed reasons, prune tasks whose contradiction cleared.
        existing = {t.id: t for t in store.list_tasks()}
        for tid, task in computed.items():
            if tid not in existing or existing[tid].reason != task.reason:
                store.write_task(task)
        for tid in existing:
            if tid.startswith("T-C-") and tid not in computed:
                store.delete_task(tid)
        open_ids = sorted(claim.id for claim in claims
                          if f"T-{claim.id}" in computed)
        pending = [computed[f"T-{cid}"] for cid in open_ids]
        return {"open_contradictions": open_ids, "pending_tasks": pending}

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
        pending = state.get("pending_tasks", []) or []
        spent = 0
        for task in pending:
            agent = task.assigned_agent if isinstance(task, Task) else task["assigned_agent"]
            tid = task.id if isinstance(task, Task) else task["id"]
            question = task.question if isinstance(task, Task) else task["question"]
            model = models.get(agent, next(iter(models.values())))
            text, attempts = call_model_resilient(
                model, load_prompt(agent), question)
            spent += attempts
            (debates / f"{tid}.md").write_text(text, encoding="utf-8")
        # Every dispatch AND every retry is a model call, plus one round:
        # route all through the PBI-007 helpers on a copy.
        tmp = {"budget": state["budget"].model_copy()}
        consume_calls(tmp, spent)
        consume_round(tmp)
        return {"pending_tasks": [], "budget": tmp["budget"]}

    return targeted_research


def make_adversarial_review(lab_project_path: Path):
    """Skeptic reviews every claim against the spec §3 rubric. Findings go
    to debates/adversarial.md (transcript scratch) — claims are NEVER
    edited here; the transcript is fed to the judge as context."""

    def adversarial_review(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        models = store.read_meta().council_models
        model = models["skeptic"]
        if state.get("mode") == "brainstorm":
            return _brainstorm_adversarial_review(store, model, state)
        claims = store.list_claims()
        listing = "\n".join(f"{c.id}: {c.statement} [{c.status}]"
                            for c in claims)
        text, attempts = call_model_resilient(
            model, load_prompt("skeptic"),
            "Review these claims for weaknesses:\n" + listing)
        debates = Path(lab_project_path) / state["lab_project_id"] / "debates"
        debates.mkdir(parents=True, exist_ok=True)
        (debates / "adversarial.md").write_text(text, encoding="utf-8")
        tmp = {"budget": state["budget"].model_copy()}
        consume_calls(tmp, attempts)
        return {"budget": tmp["budget"]}

    return adversarial_review


def _brainstorm_adversarial_review(store, model, state):
    """PBI-035: Skeptic reviews Ideas (not claims) against the brainstorm
    rubric. Writes verdicts onto Ideas: status under_skeptic_review,
    novelty_check detail, experiment critique. No claim/evidence/source writes."""
    from app.models.evidence import Idea
    ideas = [i for i in store.list_ideas()
             if i.status in ("proposed", "under_skeptic_review")]
    if not ideas:
        return {}
    listing = "\n".join(f"{i.id}: {i.statement} [novelty={i.novelty_check.status if i.novelty_check else 'pending'}, "
                        f"exp={i.proposed_experiment.falsification_condition if i.proposed_experiment else 'none'}]"
                        for i in ideas)
    text, attempts = call_model_resilient(
        model, load_prompt(get_skeptic_rubric("brainstorm")),
        "Review these IDEAS for novelty, falsifiability, and experiment design:\n" + listing)
    debates = Path(store.path) / "debates"
    debates.mkdir(parents=True, exist_ok=True)
    (debates / "adversarial.md").write_text(text, encoding="utf-8")
    for idea in ideas:
        idea.status = "under_skeptic_review"
        store.write_idea(idea)
    tmp = {"budget": state["budget"].model_copy()}
    consume_calls(tmp, attempts)
    return {"budget": tmp["budget"]}


JUDGE_STATUSES = ("SUPPORTED", "STRONGLY_SUPPORTED", "WEAKLY_SUPPORTED",
                  "DISPUTED", "CONTRADICTED", "INSUFFICIENT_EVIDENCE",
                  "UNVERIFIABLE")

JUDGE_FORMAT = """
Adjudicate each claim below from the evidence graph ONLY.
Respond with one line per claim: STATUS <claim-id>: <STATUS>
Valid statuses: SUPPORTED STRONGLY_SUPPORTED WEAKLY_SUPPORTED DISPUTED
CONTRADICTED INSUFFICIENT_EVIDENCE UNVERIFIABLE
Optionally append judged confidence: STATUS <id>: <STATUS> | sq ms ic cl ov
(five 0-1 floats: source_quality methodological_strength
independent_confirmation contradiction_level overall). Omit the segment
when you cannot score — never invent precision.
Three agents agreeing does not make an unsupported claim true.
"""


def _parse_confidence(segment: str):
    """Five floats or None (malformed → unscored, never fabricate)."""
    import math
    from app.models.evidence import Confidence
    try:
        values = [float(p) for p in segment.split()]
    except ValueError:
        return None
    if len(values) != 5 or not all(math.isfinite(v) for v in values):
        return None
    sq, ms, ic, cl, ov = (min(1.0, max(0.0, v)) for v in values)
    return Confidence(source_quality=sq, methodological_strength=ms,
                      independent_confirmation=ic, contradiction_level=cl,
                      overall=ov)


def make_evidence_adjudication(lab_project_path: Path):
    """Judge resolves every claim from evidence, never consensus.

    Two layers: (1) deterministic guard — a claim with ZERO supporting
    evidence resolves INSUFFICIENT_EVIDENCE without spending a judge
    call (adjudicated_by "rule:no-evidence"); unanimous council support
    cannot override physics. (2) Judge LLM for evidenced claims, with
    the skeptic transcript as context; unparseable output leaves the
    claim untouched (fail-safe, never fabricate a verdict).
    validate_model_assignment is re-asserted here: project.yaml may have
    changed between build time and run time."""

    def evidence_adjudication(state) -> dict:
        from app.agents.config import validate_model_assignment
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        meta = store.read_meta()
        validate_model_assignment(meta.council_models, meta.judge_model)
        by_claim: dict[str, list] = {}
        for ev in store.list_evidence():
            for cid in ev.supports:
                by_claim.setdefault(cid, []).append(ev)
        judged = 0
        for claim in store.list_claims():
            supporting = by_claim.get(claim.id, [])
            if not supporting:
                claim.status = "INSUFFICIENT_EVIDENCE"
                claim.adjudicated_by = "rule:no-evidence"
                store.write_claim(claim)
                continue
            verdicts, attempts = _consult_judge(meta.judge_model, store,
                                                claim, supporting)
            judged += attempts  # calls made, whatever came back
            if claim.id in verdicts:
                status, confidence = verdicts[claim.id]
                claim.status = status
                if confidence is not None:
                    claim.confidence = confidence
                claim.adjudicated_by = meta.judge_model
                store.write_claim(claim)
        tmp = {"budget": state["budget"].model_copy()}
        consume_calls(tmp, judged)
        return {"budget": tmp["budget"]}

    return evidence_adjudication


def _consult_judge(judge_model: str, store: LabProjectStore, claim,
                   supporting: list) -> tuple[dict, int]:
    debates = store.path / "debates" / "adversarial.md"
    notes = debates.read_text(encoding="utf-8") if debates.exists() else "(none)"
    lines = [f"{claim.id}: {claim.statement}"]
    for ev in supporting:
        src = store.read_source(ev.source_id)
        lines.append(f"{ev.id} ({ev.evidence_type}/{ev.strength}) "
                     f"for {','.join(ev.supports)}: {ev.text_reference} "
                     f"[source: {src.url}]")
    text, attempts = call_model_resilient(
        judge_model, load_prompt("judge"),
        JUDGE_FORMAT + "\nCLAIMS:\n" + "\n".join(lines)
        + "\nSKEPTIC NOTES:\n" + notes)
    verdicts = {}
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("STATUS "):
            rest = line[len("STATUS "):]
            if "|" in rest:
                # PBI-023: verdict left, confidence right — a bad right
                # side voids ONLY the numbers, never the verdict.
                rest, _, conf_segment = rest.partition("|")
                confidence = _parse_confidence(conf_segment.strip())
            else:
                confidence = None
            if ":" in rest:
                cid, status = (p.strip() for p in rest.split(":", 1))
                if status in JUDGE_STATUSES:
                    verdicts[cid] = (status, confidence)
    return verdicts, attempts


def make_synthesis(lab_project_path: Path):
    """Deterministic draft render from adjudicated claims (no LLM call:
    a draft must be complete and traceable, not eloquent — polish is a
    later phase's job). Run artifact, written directly like plan/."""

    def synthesis(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        meta = store.read_meta()
        out = [f"# {meta.title}", "", f"Question: {meta.question}", "",
               "## Adjudicated claims", ""]
        pending = [c for c in store.list_claims()
                   if c.adjudicated_by is None]
        for claim in store.list_claims():
            if claim.adjudicated_by is None:
                continue
            conf = (claim.confidence.overall if claim.confidence is not None
                    else 0.0)
            out.append(f"### {claim.id} — {claim.status}")
            out.append("")
            out.append(claim.statement)
            out.append("")
            out.append(f"Confidence: {conf:.2f} | "
                       f"Adjudicated by: {claim.adjudicated_by}")
            out.append(f"Supporting: {', '.join(claim.supporting_sources) or '—'} | "
                       f"Opposing: {', '.join(claim.opposing_sources) or '—'}")
            out.append("")
        out.append("## Pending review (not cited above)")
        out.append("")
        out.append(", ".join(c.id for c in pending) or "(none)")
        out.append("")
        output_dir = Path(lab_project_path) / state["lab_project_id"] / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "report.md").write_text("\n".join(out), encoding="utf-8")
        return {}

    return synthesis


def make_citation_audit(lab_project_path: Path):
    """3-stage audit (PBI-039): claim-level citation sweep (MVP behavior
    kept: every cited id must exist — FAIL routes to repair) PLUS per
    (claim, evidence) existence → pincite → support_match with per-stage
    rows persisted to audits/*.yaml for the UI. Unassessed stages are
    WARNING with reason, never silent PASS. Auditor model calls are
    charged to the budget (fetches are free); claims are never mutated
    here."""

    def citation_audit(state) -> dict:
        from datetime import datetime, timezone
        from app.models.evidence import AuditRun, ClaimAudit
        from app.tools.citation_verify import (
            check_existence, check_pincite, check_support_match,
            resolve_auditor)
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        session = state["session_id"]
        auditor = resolve_auditor(Path(lab_project_path))
        results: list[ClaimAudit] = []
        spent = 0
        known = {s.id for s in store.list_sources()}
        for claim in store.list_claims():
            cited = list(claim.supporting_sources) + list(claim.opposing_sources)
            missing = [sid for sid in cited if sid not in known]
            if missing:
                results.append(ClaimAudit(
                    claim_id=claim.id, evidence_id=None,
                    checks=[AuditCheck(
                        stage="existence", status="FAIL",
                        detail="cited source ids have no source object: "
                               + ", ".join(sorted(set(missing))))]))
            for ev in store.list_evidence():
                if claim.id not in ev.supports:
                    continue
                try:
                    source = store.read_source(ev.source_id)
                except FileNotFoundError:
                    results.append(ClaimAudit(
                        claim_id=claim.id, evidence_id=ev.id,
                        checks=[AuditCheck(
                            stage="existence", status="FAIL",
                            detail=f"source object {ev.source_id} missing"),
                            AuditCheck(
                                stage="pincite", status="WARNING",
                                detail="no source text (existence failed)"),
                            AuditCheck(
                                stage="support_match", status="WARNING",
                                detail="no source text (existence failed)")]))
                    continue
                text, existence = check_existence(
                    source.url, Path(lab_project_path) / state["lab_project_id"],
                    session)
                pincite = check_pincite(ev.location, text)
                if text is None:
                    # No source text: judging support blind would spend a
                    # call for noise — WARNING with reason, zero attempts.
                    support, attempts = AuditCheck(
                        stage="support_match", status="WARNING",
                        detail="no source text (existence failed)"), 0
                else:
                    support, attempts = check_support_match(
                        claim.statement, ev.text_reference, auditor)
                spent += attempts
                results.append(ClaimAudit(
                    claim_id=claim.id, evidence_id=ev.id,
                    checks=[existence, pincite, support]))
        n = len(store.list_audit_runs()) + 1
        store.write_audit_run(AuditRun(
            id=f"A-{n:03d}", created_at=datetime.now(timezone.utc),
            results=results))
        passed = all(c.status != "FAIL"
                     for row in results for c in row.checks)
        tmp = {"budget": state["budget"].model_copy()}
        consume_calls(tmp, spent)
        return {"audit_passed": passed, "budget": tmp["budget"]}

    return citation_audit


def make_targeted_repair(lab_project_path: Path):
    """Void dangling linkages: drop cited ids with no source object.
    The linkage was void (the citation doesn't exist), so removing it is
    hygiene, not revision — adjudicated statuses are untouched."""

    def targeted_repair(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        known = {s.id for s in store.list_sources()}
        for claim in store.list_claims():
            supporting = [s for s in claim.supporting_sources if s in known]
            opposing = [s for s in claim.opposing_sources if s in known]
            if supporting != list(claim.supporting_sources) or \
                    opposing != list(claim.opposing_sources):
                claim.supporting_sources = supporting
                claim.opposing_sources = opposing
                store.write_claim(claim)
        return {}

    return targeted_repair


def human_checkpoint(state) -> dict:
    # The pause itself comes from interrupt_before (build.py) — the only
    # pause mechanism. This node just records that approval is pending.
    return {"needs_human_approval": True}


def make_final_output(lab_project_path: Path):
    """Terminal node: references.md + a terminal decisions/ entry.
    Reason derives from budget state (exhausted vs completed) — this is
    the PBI-007 remainder: every run end is recorded, no silent exits."""

    def final_output(state) -> dict:
        from datetime import datetime, timezone
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        # Fail-closed: every real run carries session_id (PBI-014 mints it
        # as run_id, unique per run). No "adhoc" fallback — colliding
        # terminal records would weaken "every run end recorded".
        session = state["session_id"]
        sources = store.list_sources()
        lines = ["# References", ""]
        for src in sources:
            lines.append(f"- [{src.id}] {src.title} ({src.url}) — "
                         f"tier {src.quality_tier}")
        if not sources:
            lines.append("(no sources)")
        output_dir = Path(lab_project_path) / state["lab_project_id"] / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "references.md").write_text("\n".join(lines) + "\n",
                                                  encoding="utf-8")
        reason = ("budget_exhausted" if is_exhausted(state) else "completed")
        store.write_decision(Decision(
            id=f"D-terminal-{session}", what=f"Run ended: {reason}",
            why=(f"calls {state['budget'].calls_used}/"
                 f"{state['budget'].max_model_calls}, rounds "
                 f"{state['budget'].rounds_used}/"
                 f"{state['budget'].max_research_rounds}"),
            timestamp=datetime.now(timezone.utc)))
        return {}

    return final_output
