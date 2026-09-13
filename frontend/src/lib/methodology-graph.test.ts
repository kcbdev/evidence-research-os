import { describe, expect, it } from "vitest";
import {
  applyLoopConnect,
  bridgeDeletions,
  chainTailId,
  compileCondition,
  connectConstrained,
  connectLoop,
  defaultRowFor,
  embedDiffers,
  findJudgeOverlaps,
  isLoopEdge,
  LOOP_EDGE_PREFIX,
  methodologyToFlow,
  nextStageId,
  operatorsForFieldType,
  orderStages,
  parseCondition,
  stageLabel,
  validateLoops,
  type ConditionFieldLite,
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
      data: { stageId: id, node: "plan", label: id, kind: "stage" as const },
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
      { id: "c", type: "stage", position: { x: 0, y: 280 }, data: { stageId: "c", node: "plan", label: "c", kind: "stage" as const } },
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

  it("refuses an empty canvas", () => {
    expect(orderStages([], [], {})).toMatchObject({
      error: expect.stringContaining("empty"),
    });
  });

  it("connectConstrained prunes forks and reports replacement", () => {    const diamond = [
      { id: "e-ab", source: "a", target: "b" },
      { id: "e-ac", source: "a", target: "c" },
    ];
    const { edges, replaced } = connectConstrained(diamond, {
      source: "b",
      target: "c",
    });
    expect(replaced).toBe(true);
    // A->C died (target taken), A->B survived, B->C added: one chain.
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    const clean = connectConstrained([{ id: "e-ab", source: "a", target: "b" }], {
      source: "b",
      target: "c",
    });
    expect(clean.replaced).toBe(false);
    expect(connectConstrained(diamond, { source: null, target: "c" }).replaced).toBe(false);
  });

  it("bridgeDeletions re-links middle, ends, and blocks", () => {
    const chain = [
      { id: "e-ab", source: "a", target: "b" },
      { id: "e-bc", source: "b", target: "c" },
      { id: "e-cd", source: "c", target: "d" },
    ];
    const pair = (es: { id: string; source: string; target: string }[]) =>
      es.map((e) => [e.source, e.target]).sort();
    // Single middle delete bridges across.
    expect(pair(bridgeDeletions(chain, ["b"]))).toEqual([
      ["a", "c"],
      ["c", "d"],
    ]);
    // Head/tail delete just drops touching edges.
    expect(pair(bridgeDeletions(chain, ["a"]))).toEqual([
      ["b", "c"],
      ["c", "d"],
    ]);
    expect(pair(bridgeDeletions(chain, ["d"]))).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    // Simultaneous block delete bridges the whole closure at once.
    expect(pair(bridgeDeletions(chain, ["b", "c"]))).toEqual([["a", "d"]]);
    // Forked entries never guess: no bridge, save names the fallout.
    const fork = [...chain, { id: "e-xc", source: "x", target: "c" }];
    expect(pair(bridgeDeletions(fork, ["b", "c"]))).toEqual([]);
    expect(bridgeDeletions(chain, [])).toBe(chain);
  });

  it("embedDiffers compares model and tool sets, protects unknowns", () => {
    const lib = { model: "m", tools: ["a", "b"] };
    expect(embedDiffers({ model: "m", tools: ["b", "a"] }, lib)).toBe(false);
    expect(embedDiffers({ model: "other", tools: ["a", "b"] }, lib)).toBe(true);
    expect(embedDiffers({ model: "m", tools: ["a"] }, lib)).toBe(true);
    expect(embedDiffers(undefined, lib)).toBe(true);
    expect(embedDiffers({ model: "m", tools: [] }, undefined)).toBe(true);
  });
});

const FIELDS: ConditionFieldLite[] = [
  { field: "open_contradictions", type: "count" },
  { field: "pending_tasks", type: "count" },
  { field: "audit_passed", type: "bool" },
];

function flowNodes(ids: string[]): StageNode[] {
  return ids.map((id, i) => ({
    id,
    type: "stage",
    position: { x: 0, y: i * 140 },
    data: { stageId: id, node: "plan", label: id, kind: "stage" as const },
  }));
}

describe("conditions and loop-backs", () => {
  it("compiles rows to the backend Tier B expression form", () => {
    expect(
      compileCondition([
        { field: "open_contradictions", op: ">", value: 0 },
      ]),
    ).toBe("len(open_contradictions) > 0");
    expect(
      compileCondition([{ field: "audit_passed", op: "is false", value: false }]),
    ).toBe("audit_passed == False");
    expect(
      compileCondition([
        { field: "open_contradictions", op: ">", value: 0 },
        { field: "audit_passed", op: "is true", value: true },
      ]),
    ).toBe("len(open_contradictions) > 0 and audit_passed == True");
    expect(compileCondition([])).toBeNull();
  });

  it("filters operators by field type (counts never offer contains)", () => {
    expect(operatorsForFieldType("count")).toEqual([">", "<", "==", "!="]);
    expect(operatorsForFieldType("count")).not.toContain("contains");
    expect(operatorsForFieldType("bool")).toEqual(["is true", "is false"]);
  });

  it("round-trips simple single and AND-chained expressions", () => {
    expect(parseCondition("len(open_contradictions) > 0", FIELDS)).toEqual([
      { field: "open_contradictions", op: ">", value: 0 },
    ]);
    expect(
      parseCondition(
        "len(pending_tasks) != 2 and audit_passed == True",
        FIELDS,
      ),
    ).toEqual([
      { field: "pending_tasks", op: "!=", value: 2 },
      { field: "audit_passed", op: "is true", value: true },
    ]);
  });

  it("refuses complex, unknown, or type-mismatched expressions instead of rewriting", () => {
    expect(
      parseCondition("len(open_contradictions) > 0 or audit_passed == True", FIELDS),
    ).toBeNull();
    expect(parseCondition("not audit_passed", FIELDS)).toBeNull();
    expect(parseCondition("len(mystery_list) > 0", FIELDS)).toBeNull();
    expect(parseCondition("len(audit_passed) > 0", FIELDS)).toBeNull();
    expect(parseCondition("open_contradictions == True", FIELDS)).toBeNull();
    expect(parseCondition("definitely not an expression ((((", FIELDS)).toBeNull();
    expect(parseCondition("", FIELDS)).toBeNull();
  });

  it("connectLoop tags one dashed loop per source and never touches the chain", () => {
    const chain = [{ id: "e-ab", source: "a", target: "b" }];
    const first = connectLoop(chain, { source: "b", target: "a" });
    expect(first.replaced).toBe(false);
    expect(first.edges).toHaveLength(2);
    const loop = first.edges.find((e) => e.source === "b");
    expect(loop?.id.startsWith(LOOP_EDGE_PREFIX)).toBe(true);
    expect(isLoopEdge(loop!)).toBe(true);
    expect(isLoopEdge(chain[0])).toBe(false);
    expect(loop?.style).toMatchObject({ strokeDasharray: expect.stringContaining("6") });
    // A second loop from the same stage replaces, keeping the chain.
    const second = connectLoop(first.edges, { source: "b", target: "b" });
    expect(second.replaced).toBe(true);
    expect(second.edges.filter(isLoopEdge)).toHaveLength(1);
    expect(second.edges.map((e) => [e.source, e.target])).toContainEqual(["a", "b"]);
    expect(connectLoop(chain, { source: null, target: "a" }).edges).toBe(chain);
  });

  it("connectConstrained and bridgeDeletions ignore loop edges", () => {
    const edges = [
      { id: "e-ab", source: "a", target: "b" },
      { id: `${LOOP_EDGE_PREFIX}b-a`, source: "b", target: "a" },
    ];
    // Sequential rewire prunes the chain link, keeps the loop.
    const { edges: rewired, replaced } = connectConstrained(edges, {
      source: "a",
      target: "c",
    });
    expect(replaced).toBe(true);
    expect(rewired.filter(isLoopEdge)).toHaveLength(1);
    expect(rewired.filter((e) => !isLoopEdge(e)).map((e) => [e.source, e.target])).toEqual([
      ["a", "c"],
    ]);
    // Deleting across a loop drops it instead of re-hanging it.
    const dropped = bridgeDeletions(
      [...edges, { id: "e-bc", source: "b", target: "c" }],
      ["b"],
    );
    expect(dropped.some(isLoopEdge)).toBe(false);
  });

  it("orderStages walks past backward loops instead of crying cycle", () => {
    const nodes = flowNodes(["a", "b", "c"]);
    const edges = [
      { id: "e-ab", source: "a", target: "b" },
      { id: "e-bc", source: "b", target: "c" },
      { id: `${LOOP_EDGE_PREFIX}b-a`, source: "b", target: "a" },
    ];
    const map: Record<string, StageSpecLike> = {
      a: { id: "a", node: "plan" },
      b: {
        id: "b",
        node: "plan",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "a",
      },
      c: { id: "c", node: "plan" },
    };
    const back = orderStages(nodes, edges, map);
    expect("stages" in back && back.stages.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("methodologyToFlow draws canvas-owned loops and skips hand-owned forms", () => {
    const m = methodology(["a", "b", "c"]);
    m.workflow.stages = [
      { id: "a", node: "plan" },
      {
        id: "b",
        node: "plan",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "a",
      } as unknown as { id: string; node: string },
      { id: "c", node: "plan", loop_while: "has_open", loop_target: "a" } as unknown as {
        id: string;
        node: string;
      },
    ];
    const { edges } = methodologyToFlow(m);
    const loops = edges.filter(isLoopEdge);
    expect(loops.map((e) => [e.source, e.target])).toEqual([["b", "a"]]);
    expect(loops[0].style).toMatchObject({ stroke: "#f59e0b" });
  });

  it("validateLoops fails loud on every split-brain shape, passes the happy path", () => {
    const nodes = flowNodes(["a", "b"]);
    const good: Record<string, StageSpecLike> = {
      a: { id: "a", node: "plan" },
      b: {
        id: "b",
        node: "plan",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "a",
      },
    };
    const goodEdges = [{ id: `${LOOP_EDGE_PREFIX}b-a`, source: "b", target: "a" }];
    expect(validateLoops(nodes, goodEdges, good)).toBeNull();
    // Edge without condition.
    expect(
      validateLoops(nodes, goodEdges, {
        a: good.a,
        b: { id: "b", node: "plan", loop_target: "a" },
      }),
    ).toMatch(/no condition/);
    // Keys without edge.
    expect(validateLoops(nodes, [], good)).toMatch(/no canvas edge/);
    // Unknown target.
    expect(
      validateLoops(nodes, [], {
        a: good.a,
        b: {
          id: "b",
          node: "plan",
          loop_condition: "len(open_contradictions) > 0",
          loop_target: "ghost",
        },
      }),
    ).toMatch(/unknown stage ghost/);
    // Registry-owned stages are exempt.
    expect(
      validateLoops(nodes, [], {
        a: good.a,
        b: { id: "b", node: "plan", loop_while: "has_open", loop_target: "a" },
      }),
    ).toBeNull();
  });

  it("orderStages passes hand-owned keys through by reference", () => {
    const { nodes, edges } = methodologyToFlow(methodology(["a", "b"]));
    const map: Record<string, StageSpecLike> = {
      a: { id: "a", node: "plan", loop_always: "b" },
      b: { id: "b", node: "plan" },
    };
    const back = orderStages(nodes, edges, map);
    expect("stages" in back && back.stages[0]).toBe(map.a);
    expect("stages" in back && back.stages[0]).toMatchObject({ loop_always: "b" });
  });

  it("validateLoops rejects dual branch forms naming the stage", () => {
    const nodes = flowNodes(["a", "b"]);
    const edges = [{ id: `${LOOP_EDGE_PREFIX}b-a`, source: "b", target: "a" }];
    const dual: Record<string, StageSpecLike> = {
      a: { id: "a", node: "plan" },
      b: {
        id: "b",
        node: "plan",
        loop_while: "has_open",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "a",
      },
    };
    expect(validateLoops(nodes, edges, dual)).toMatch(
      /Stage b sets both loop_while and loop_condition/,
    );
    expect(validateLoops(nodes, edges, dual)).toMatch(/mutually exclusive/);
  });

  it("chainTailId ignores loop edges when finding the append point", () => {
    const nodes = flowNodes(["a", "b"]);
    const chain = [{ id: "e-ab", source: "a", target: "b" }];
    expect(chainTailId(nodes, chain)).toBe("b");
    // A loop-back out of the tail must not strand appends: the tail
    // is still the tail.
    expect(
      chainTailId(nodes, [
        ...chain,
        { id: `${LOOP_EDGE_PREFIX}b-a`, source: "b", target: "a" },
      ]),
    ).toBe("b");
    expect(chainTailId(nodes, [])).toBeNull();
    expect(
      chainTailId(flowNodes(["a", "b", "c"]), [
        { id: "e-ab", source: "a", target: "b" },
      ]),
    ).toBeNull();
  });

  it("applyLoopConnect writes target, selects source, and says replacements aloud", () => {    const map: Record<string, StageSpecLike> = {
      a: { id: "a", node: "plan" },
      b: { id: "b", node: "plan" },
    };
    const first = applyLoopConnect([], map, { source: "b", target: "a" });
    expect(first.edges.filter(isLoopEdge).map((e) => [e.source, e.target])).toEqual([
      ["b", "a"],
    ]);
    expect(first.stageMap.b).toMatchObject({ loop_target: "a" });
    expect(first.selectId).toBe("b");
    expect(first.notice).toBeNull();
    // Original map untouched (pure).
    expect(map.b).not.toHaveProperty("loop_target");
    const second = applyLoopConnect(first.edges, first.stageMap, {
      source: "b",
      target: "b",
    });
    expect(second.edges.filter(isLoopEdge).map((e) => [e.source, e.target])).toEqual([
      ["b", "b"],
    ]);
    expect(second.notice).toMatch(/Replaced the existing loop-back/);
    const noop = applyLoopConnect([], map, { source: null, target: "a" });
    expect(noop.edges).toEqual([]);
    expect(noop.stageMap).toBe(map);
    expect(noop.selectId).toBeNull();
    expect(noop.notice).toBeNull();
  });

  it("findJudgeOverlaps mirrors the save/run gates (auditor included, blanks quiet)", () => {
    expect(
      findJudgeOverlaps({ scientist: "m", judge: "m", ideator: "x" }),
    ).toEqual(["scientist"]);
    // The save/run gates check every slot but judge — the auditor's
    // rotation exemption does not survive the PUT.
    expect(
      findJudgeOverlaps({ scientist: "s", judge: "m", auditor: "m" }),
    ).toEqual(["auditor"]);
    // Blanks never highlight — the save gate skips blank judges.
    expect(findJudgeOverlaps({ scientist: "", judge: "" })).toEqual([]);
    expect(findJudgeOverlaps({ scientist: "m" })).toEqual([]);
  });
});
