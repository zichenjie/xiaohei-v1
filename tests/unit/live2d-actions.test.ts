import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PET_ACTIONS } from "../../src/shared/actions.js";

interface Model3Json {
  FileReferences?: {
    Motions?: Record<string, Array<{ File?: string }>>;
    Expressions?: Array<{ Name?: string; File?: string }>;
  };
}

interface Motion3Json {
  Meta?: {
    CurveCount?: number;
    TotalSegmentCount?: number;
    TotalPointCount?: number;
  };
  Curves?: Array<{
    Segments?: number[];
  }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("Live2D action catalog", () => {
  const modelPath = resolve("material/罗小黑免费模型/罗小黑免费模型.model3.json");
  const model = readJson<Model3Json>(modelPath);

  it("maps every motion action to a model motion group", () => {
    const motions = model.FileReferences?.Motions ?? {};
    const motionActionNames = PET_ACTIONS.filter((action) => action.kind === "motion").map((action) => action.name);

    for (const actionName of motionActionNames) {
      expect(motions[actionName]?.length, `${actionName} motion group`).toBeGreaterThan(0);
    }
  });

  it("maps every expression action to a model expression", () => {
    const expressions = model.FileReferences?.Expressions ?? [];
    const expressionNames = new Set(expressions.map((expression) => expression.Name));
    const expressionActionNames = PET_ACTIONS.filter((action) => action.kind === "expression").map((action) => action.name);

    for (const actionName of expressionActionNames) {
      expect(expressionNames.has(actionName), `${actionName} expression`).toBe(true);
    }
  });

  it("keeps generated motion metadata aligned with curve segments", () => {
    const generatedMotionFiles = [
      "睡觉.motion3.json",
      "醒来.motion3.json",
      "打招呼.motion3.json",
      "好奇.motion3.json",
      "开心.motion3.json",
      "摸头.motion3.json",
      "移动.motion3.json"
    ];

    for (const file of generatedMotionFiles) {
      const motion = readJson<Motion3Json>(resolve("material/罗小黑免费模型", file));
      const curves = motion.Curves ?? [];
      const segmentCount = curves.reduce((sum, curve) => sum + ((curve.Segments?.length ?? 2) - 2) / 3, 0);
      const pointCount = curves.reduce((sum, curve) => sum + ((curve.Segments?.length ?? 2) - 2) / 3 + 1, 0);

      expect(motion.Meta?.CurveCount, `${file} CurveCount`).toBe(curves.length);
      expect(motion.Meta?.TotalSegmentCount, `${file} TotalSegmentCount`).toBe(segmentCount);
      expect(motion.Meta?.TotalPointCount, `${file} TotalPointCount`).toBe(pointCount);
    }
  });
});
