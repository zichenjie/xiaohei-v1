export const STATUS_ACTIVITIES = {
    awake: "安静陪着你",
    playing: "正在活动",
    sleeping: "正在睡觉，慢慢恢复精力",
    stroking: "正在享受摸摸",
    loading: "正在加载模型",
    error: "模型暂时不可用"
};
export function isPetStatus(value) {
    if (!value || typeof value !== "object")
        return false;
    const status = value;
    return [status.energy, status.mood].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100)
        && typeof status.activity === "string" && Object.hasOwn(STATUS_ACTIVITIES, status.activity);
}
export function moodDescription(value) {
    return value >= 75 ? "很开心" : value < 45 ? "有些低落" : "心情平静";
}
export function energyDescription(value) {
    return value <= 35 ? "需要休息" : value < 60 ? "有些疲倦" : "精力充足";
}
