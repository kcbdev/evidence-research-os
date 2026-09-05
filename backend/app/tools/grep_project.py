"""Tier-1 retrieval: ripgrep wrapper (guide §4.1).

Requires the `rg` binary on PATH (hard gate prerequisite, not optional):
Windows `winget install BurntSushi.ripgrep.MSVC`, Debian
`apt install ripgrep`, production images must bake it in — there is no
pure-Python fallback by design: Tier 1 IS ripgrep per spec §4.3).

Agent contract (also the future MCP tool description): returns matching
lines as `file:line: text`. Do NOT re-grep broadly — narrow the pattern,
then follow up with a line-range read of the specific file. Iterative
narrow → read → narrow again; never single-shot.
"""
import subprocess


def grep_project(lab_project_path: str, pattern: str, glob: str = "*.yaml") -> str:
    """Returns matching lines as `file:line: text` (empty when no match).

    Agent contract (also the future MCP tool description): narrow the
    pattern, then follow up with a line-range read of the specific file.
    Iterative narrow → read → narrow again; never single-shot.
    """
    result = subprocess.run(
        ["rg", "--glob", glob, "-n", pattern, lab_project_path],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode not in (0, 1):  # 1 = clean miss; else tool error
        raise RuntimeError(f"ripgrep failed: {result.stderr.strip()}")
    return result.stdout  # empty string when nothing matches (rg exit 1)
