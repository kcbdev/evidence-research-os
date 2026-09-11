export type StagePreview = {
  id: string;
  node: string;
  via?: string;
  interrupt?: boolean;
};

export function previewStages(yamlText: string): { stages: StagePreview[]; error: string | null } {
  // Preview-grade scan (not validation — the server owns that): find
  // `- id:` entries and their sibling keys by indentation. Honest
  // approximation, labeled as such in the UI.
  try {
    const stages: StagePreview[] = [];
    const lines = yamlText.split("\n");
    let current: StagePreview | null = null;
    let baseIndent = -1;
    const push = () => {
      if (current) stages.push(current);
      current = null;
    };
    for (const raw of lines) {
      const m = /^(\s*)-\s+id:\s*(\S+)\s*$/.exec(raw);
      if (m) {
        push();
        baseIndent = m[1].length;
        current = { id: m[2], node: "?" };
        continue;
      }
      if (current) {
        const km = /^(\s*)([A-Za-z_]+):\s*(.*?)\s*$/.exec(raw);
        if (!km) continue;
        if (km[1].length <= baseIndent) {
          push();
          continue;
        }
        const [, , key, val] = km;
        if (key === "node") current.node = val;
        else if (key === "route") current.via = `route ${val}`;
        else if (key === "loop_while") current.via = `loop ${val}`;
        else if (key === "loop_target") current.via = `${current.via ?? "loop"} → ${val}`;
        else if (key === "interrupt" && val === "true") current.interrupt = true;
      }
    }
    push();
    return { stages, error: null };
  } catch (err) {
    return { stages: [], error: err instanceof Error ? err.message : "parse failed" };
  }
}
