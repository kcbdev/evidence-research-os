"""PBI-076 gate: Elo math, pinned tournament ordering, pairwise parse,
node write-back, API sort.

Live-model stability is witnessed, not unit-asserted (Spec D6):
RNG + judge calls are injectable seams, tests pin them.
"""
import random
import pytest
from app.agents.tournament import elo_update, judge_pairwise, run_tournament
from app.graph import nodes
from app.models.evidence import BudgetState, Idea, ProjectMeta
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _idea(iid, statement="s"):
    return Idea(id=iid, statement=statement)


def test_elo_equal_ratings_split_k():
    w, l = elo_update(1200.0, 1200.0)
    assert (w, l) == (1216.0, 1184.0)


def test_elo_favorite_gains_little():
    w, l = elo_update(1400.0, 1200.0)
    assert w == pytest.approx(1407.69, abs=0.01)
    assert l == pytest.approx(1192.31, abs=0.01)
    assert w + l == pytest.approx(2600.0)


def test_tournament_pinned_ordering_and_conservation():
    # Fake judge: lexicographically smaller statement always wins.
    # Seeded RNG makes the bracket deterministic.
    def fake_judge(a, b, model_id):
        winner = a if a.statement < b.statement else b
        return winner.id, 1

    ideas = [_idea("I-001", "delta"), _idea("I-002", "alpha"),
             _idea("I-003", "charlie"), _idea("I-004", "bravo")]
    out, spent = run_tournament(ideas, "m-judge", rounds=2,
                                rng=random.Random(7), judge_fn=fake_judge)
    assert spent == 2 * 2  # rounds * pairs, every call charged
    assert sum(i.elo_score for i in out) == pytest.approx(4800.0)
    # "alpha" wins every pair it plays: strictly top.
    top = max(out, key=lambda i: i.elo_score)
    assert top.id == "I-002"
    # Deterministic: same seed, same scores.
    again, _ = run_tournament(
        [_idea("I-001", "delta"), _idea("I-002", "alpha"),
         _idea("I-003", "charlie"), _idea("I-004", "bravo")],
        "m-judge", rounds=2, rng=random.Random(7), judge_fn=fake_judge)
    assert [i.elo_score for i in out] == [i.elo_score for i in again]


def test_tournament_skips_unparseable_but_charges():
    ideas = [_idea("I-001", "a"), _idea("I-002", "b"), _idea("I-003", "c")]
    out, spent = run_tournament(
        ideas, "m-judge", rounds=1, rng=random.Random(0),
        judge_fn=lambda a, b, m: (None, 1))
    assert spent == 1  # one pair (odd one sits out), charged anyway
    assert all(i.elo_score == 1200.0 for i in out)


def test_judge_pairwise_parse(monkeypatch):
    monkeypatch.setattr(
        "app.agents.tournament.call_model_resilient",
        lambda *a, **k: ("WINNER: I-002\nsecond is stronger", 2))
    winner, attempts = judge_pairwise(_idea("I-001"), _idea("I-002"),
                                      "m-judge")
    assert (winner, attempts) == ("I-002", 2)
    monkeypatch.setattr(
        "app.agents.tournament.call_model_resilient",
        lambda *a, **k: ("WINNER: I-ghost\nunknown", 1))
    assert judge_pairwise(_idea("I-001"), _idea("I-002"),
                          "m-judge") == (None, 1)
    monkeypatch.setattr(
        "app.agents.tournament.call_model_resilient",
        lambda *a, **k: ("no verdict here", 1))
    assert judge_pairwise(_idea("I-001"), _idea("I-002"),
                          "m-judge") == (None, 1)


def _seed(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q", created_at=TS,
        council_models=COUNCIL, judge_model=JUDGE))
    return store


def _state(budget=None, **over):
    state = {
        "lab_project_id": "p", "mode": "brainstorm",
        "active_question": "q", "budget": budget or BudgetState(),
        "pending_tasks": [], "open_contradictions": [], "escalate": False,
        "audit_passed": True, "needs_human_approval": False,
        "session_id": "s-t", "first_pass": {},
    }
    state.update(over)
    return state


def test_node_passes_through_with_fewer_than_two(tmp_path, monkeypatch):
    store = _seed(tmp_path, monkeypatch)
    store.write_idea(_idea("I-001", "lone"))
    out = nodes.make_tournament_ranking(tmp_path)(_state())
    assert out == {}
    assert store.read_idea("I-001").elo_score == 1200.0


def test_node_writes_back_scores_and_charges(tmp_path, monkeypatch):
    store = _seed(tmp_path, monkeypatch)
    store.write_idea(_idea("I-001", "alpha angle here"))
    store.write_idea(_idea("I-002", "beta angle here"))
    # judge_pairwise binds call_model_resilient in the tournament
    # namespace (same pattern as nodes.py) — patch it there.
    monkeypatch.setattr("app.agents.tournament.call_model_resilient",
                        lambda *a, **k: ("WINNER: I-001\nstronger", 1))
    budget = BudgetState(max_model_calls=100, max_research_rounds=5)
    out = nodes.make_tournament_ranking(tmp_path)(_state(budget=budget))
    assert store.read_idea("I-001").elo_score > 1200.0
    assert store.read_idea("I-002").elo_score < 1200.0
    assert out["budget"].calls_used >= 1
    assert budget.calls_used == 0  # input copy, not mutation
