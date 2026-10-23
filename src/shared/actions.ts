export const EXTRA_ACTIONS = [
  { name: "Nod", label: "点头", kind: "reaction" },
  { name: "ShakeHead", label: "摇头", kind: "reaction" },
  { name: "Wink", label: "眨眼", kind: "reaction" },
  { name: "Shy", label: "害羞", kind: "reaction" },
  { name: "Yawn", label: "打哈欠", kind: "reaction" },
  { name: "Sway", label: "轻轻摇摆", kind: "reaction" }
] as const;

export type PetReactionName = (typeof EXTRA_ACTIONS)[number]["name"];

export function isPetReactionName(value: string): value is PetReactionName {
  return EXTRA_ACTIONS.some((action) => action.name === value);
}

export const PET_ACTIONS = [
  { name: "Idle", label: "待机", kind: "motion" },
  { name: "Bounce", label: "弹跳", kind: "motion" },
  { name: "Sleep", label: "睡觉", kind: "motion" },
  { name: "Greet", label: "打招呼", kind: "motion" },
  { name: "Curious", label: "好奇", kind: "motion" },
  { name: "Happy", label: "开心", kind: "motion" },
  { name: "Pat", label: "摸头", kind: "motion" },
  { name: "Move", label: "移动", kind: "motion" },
  { name: "hair", label: "头发换色", kind: "expression" },
  ...EXTRA_ACTIONS
] as const;

export type PetActionName = (typeof PET_ACTIONS)[number]["name"];
// Wake is automatic feedback for touching a sleeping pet's head.
export type PetMotionName = Extract<(typeof PET_ACTIONS)[number], { kind: "motion" }>["name"] | "Wake";
export type PetExpressionName = Extract<(typeof PET_ACTIONS)[number], { kind: "expression" }>["name"];

const PET_ACTION_NAMES = new Set<string>(PET_ACTIONS.map((action) => action.name));

export function isPetActionName(value: unknown): value is PetActionName {
  return typeof value === "string" && PET_ACTION_NAMES.has(value);
}
