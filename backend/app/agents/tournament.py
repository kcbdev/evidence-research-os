"""Pairwise Elo tournament for brainstorm ideas (PBI-076, guide Task 53).

Ideas face off in shuffled pairs over N rounds; winners take Elo points
from losers (k=32). Unparseable verdicts skip the pair (no score change)
but are still charged — garbage is never free (PBI-007). Odd idea out
sits the round. RNG and judge calls are injectable seams (Spec D6) so
tests pin ordering without live models; live stability is witnessed,
not unit-asserted.
"""
import random as _random

from app.agents.client import call_model_resilient
from app.agents.prompts import load_prompt


def elo_update(winner: float, loser: float,
               k: float = 32) -> tuple[float, float]:
    expected = 1 / (1 + 10 ** ((loser - winner) / 400))
    return winner + k * (1 - expected), loser - k * (1 - expected)


def _pair_text(a, b) -> str:
    return (f"IDEA {a.id}: {a.statement}\n"
            f"IDEA {b.id}: {b.statement}\n")


def judge_pairwise(a, b, model_id: str) -> tuple[str | None, int]:
    """Returns (winner_id or None, attempts). None = unparseable or
    unknown id (fail-safe skip, still charged)."""
    text, attempts = call_model_resilient(
        model_id, load_prompt("tournament_judge"), _pair_text(a, b))
    for line in text.splitlines():
        if line.strip().startswith("WINNER:"):
            winner = line.split(":", 1)[1].strip().split()[0] \
                if line.split(":", 1)[1].strip() else ""
            return (winner if winner in (a.id, b.id) else None), attempts
    return None, attempts


def run_tournament(ideas: list, model_id: str, rounds: int = 3,
                   rng=None, judge_fn=None) -> tuple[list, int]:
    """Shuffle a copy of the list; mutate the Idea objects' elo_score
    in place (callers persist). Returns (ideas, model attempts spent)."""
    rng = rng if rng is not None else _random
    judge_fn = judge_fn if judge_fn is not None else judge_pairwise
    pool = list(ideas)
    spent = 0
    for _ in range(rounds):
        rng.shuffle(pool)
        for a, b in zip(pool[::2], pool[1::2]):
            winner_id, attempts = judge_fn(a, b, model_id)
            spent += attempts
            if winner_id == a.id:
                a.elo_score, b.elo_score = elo_update(a.elo_score,
                                                     b.elo_score)
            elif winner_id == b.id:
                b.elo_score, a.elo_score = elo_update(b.elo_score,
                                                     a.elo_score)
    return pool, spent
