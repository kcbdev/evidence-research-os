import { describe, expect, it } from "vitest";
import {
  methodologyToFlow,
  nextStageId,
  orderStages,
  stageLabel,
  type StageNode,
  type StageSpecLike,
} from "./methodology-graph";
import type { MethodologyDetail } from "./api";

function methodology(ids: string[]): MethodologyDetail {
  return {
    id: "m",
    name: "M",
    description: "",
    is_default: false,
    compatible_modes: ["research"],
    workflow: {
      stages: ids.map((id) => ({ id, node: id.split("-")[0] })),
    },
    tools: { enabled: [] },
    prompts: { set: "x", overrides: {} },
    skills: {},
    models: {},
    budget_defaults: { max_model_calls: 50, max_research_rounds: 5 },
  };
}

function stageMap(ids: string[]): Record<string, StageSpecLike> {
  return Object.fromEntries(
    ids.map((id) => [id, { id, node: "plan", loop_condition: "x > 1" }]),
  );
}

describe("methodology-graph", () => {
  it("maps stages to a vertical chain and back losslessly", () => {
    const m = methodology(["plan", "synthesis", "final_output"]);
    const { nodes, edges } = methodologyToFlow(m);
    expect(nodes.map((n) => n.id)).toEqual(["plan", "synthesis", "final_output"]);
    expect(nodes[1].position.y).toBeGreaterThan(nodes[0].position.y);
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ["plan", "synthesis"],
      ["synthesis", "final_output"],
    ]);
    const back = orderStages(nodes, edges, stageMap(["plan", "synthesis", "final_output"]));
    expect("stages" in back && back.stages.map((s) => s.id)).toEqual([
      "plan",
      "synthesis",
      "final_output",
    ]);
  });

  it("preserves untouched stage keys through reorder", () => {
    const { nodes, edges } = methodologyToFlow(methodology(["a", "b"]));
    const map = stageMap(["a", "b"]);
    const back = orderStages(nodes, edges, map);
    expect("stages" in back && back.stages[0]).toMatchObject({
      loop_condition: "x > 1",
    });
  });

  it("rejects cycles, forks, and disconnected nodes by name", () => {
    const nodes: StageNode[] = ["a", "b"].map((id, i) => ({
      id,
      type: "stage",
      position: { x: 0, y: i * 140 },
      data: { stageId: id, node: "plan", label: id },
    }));
    const map = stageMap(["a", "b"]);
    expect(orderStages(nodes, [{ id: "e1", source: "a", target: "b" }, { id: "e2", source: "b", target: "a" }], map)).toMatchObject({
      error: expect.stringContaining("cycle"),
    });
    expect(orderStages(nodes, [], map)).toMatchObject({
      error: expect.stringContaining("Disconnected stage: b"),
    });
    const lone: StageNode[] = [
      ...nodes,
      { id: "c", type: "stage", position: { x: 0, y: 280 }, data: { stageId: "c", node: "plan", label: "c" } },
    ];
    expect(
      orderStages(lone, [{ id: "e1", source: "a", target: "b" }], { ...map, c: { id: "c", node: "plan" } }),
    ).toMatchObject({ error: expect.stringContaining("Disconnected stage: c") });
  });

  it("mints unique stage ids", () => {
    expect(nextStageId("plan", new Set())).toBe("plan");
    expect(nextStageId("plan", new Set(["plan"]))).toBe("plan-2");
    expect(nextStageId("plan", new Set(["plan", "plan-2"]))).toBe("plan-3");
  });

  it("labels known stages, prettifies unknown ones", () => {
    expect(stageLabel("citation_audit")).toBe("Citation Audit");
    expect(stageLabel("my_custom_thing")).toBe("My Custom Thing");
  });
});
