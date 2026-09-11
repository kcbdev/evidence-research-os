"""Tier B expression conditions (PBI-059, Phase 5b guide).

`simpleeval`: restricted evaluation (no imports, no dunders, no
arbitrary calls) for inline `loop_condition` strings. Only plain
state fields are exposed as names — no filesystem, no methods beyond
basic comparisons/arithmetic. Safe even if the single-operator trust
model later loosens (unlike Tier C).
"""
import ast
from simpleeval import simple_eval

# Stock simpleeval 1.0.7 whitelists only float/int/rand/randint/str —
# the guide's own `len(open_contradictions)` example does NOT run on
# it. Inject the safe builtins explicitly (pure functions, no I/O,
# no execution surface beyond what names already expose).
SAFE_FUNCTIONS = {"len": len, "str": str, "int": int, "float": float}


def make_expr_condition(expression: str):
    """Compile once (SyntaxError raises HERE, at graph-build time —
    never mid-run without context); evaluate per state. Safety is
    simpleeval itself (no imports, no dunders, no arbitrary calls):
    hostile input evaluates to False or raises safely inside the
    evaluator — it can never execute. Missing fields read as False."""
    try:
        ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ValueError(
            f"bad loop_condition expression {expression!r}: {exc}")

    def condition(state: dict) -> bool:
        names = {k: v for k, v in dict(state).items()
                 if not k.startswith("_")}
        try:
            return bool(simple_eval(expression, names=names,
                                    functions=SAFE_FUNCTIONS))
        except Exception:
            return False  # missing fields read as false, never crash

    condition.expression = expression  # type: ignore[attr-defined]
    return condition
