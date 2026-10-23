import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve("material/罗小黑免费模型");
const round = (value) => Math.round(value * 10000) / 10000;
const track = (values) => values.map(([time, value]) => ({ time, value }));

function motion(file, duration, tracks, loop = false) {
  const curves = Object.entries(tracks).map(([id, values]) => {
    const keys = track(values);
    const frames = Math.round(duration * 30);
    const segments = [0, keys[0].value];
    for (let frame = 1; frame <= frames; frame++) {
      const time = duration * frame / frames;
      let next = keys.findIndex((key) => key.time >= time);
      if (next < 0) next = keys.length - 1;
      const before = keys[Math.max(0, next - 1)];
      const after = keys[next];
      const t = before.time === after.time ? 1 : Math.min(1, (time - before.time) / (after.time - before.time));
      const eased = t * t * (3 - 2 * t);
      segments.push(0, round(time), round(before.value + (after.value - before.value) * eased));
    }
    return { Target: "Parameter", Id: id, Segments: segments };
  });
  writeFileSync(resolve(directory, file), JSON.stringify({
    Version: 3,
    Meta: {
      Duration: duration, Fps: 30, Loop: loop, AreBeziersRestricted: true,
      CurveCount: curves.length,
      TotalSegmentCount: curves.reduce((sum, curve) => sum + (curve.Segments.length - 2) / 3, 0),
      TotalPointCount: curves.reduce((sum, curve) => sum + (curve.Segments.length - 2) / 3 + 1, 0),
      UserDataCount: 0, TotalUserDataSize: 0
    }, FadeInTime: 0.15, FadeOutTime: 0.15, Curves: curves
  }, null, 2) + "\n");
}

motion("打招呼.motion3.json", 2.8, {
  ParamAngleX: [[0, 0], [2.8, 0]],
  ParamAngleY: [[0, 0], [2.8, 0]],
  ParamAngleZ: [[0, 0], [2.8, 0]],
  ParamBodyAngleZ: [[0, 0], [2.8, 0]],
  ParamMouthForm: [[0, 0], [0.3, 0.75], [2.3, 0.75], [2.8, 0]],
  ParamMouthOpenY: [[0, 0], [0.35, 0.55], [0.65, 0.15], [0.95, 0.45], [1.3, 0], [2.8, 0]],
  ParamEyeLOpen: [[0, 1], [0.4, 0.8], [1.2, 1], [2.8, 1]],
  ParamEyeROpen: [[0, 1], [0.4, 0.8], [1.2, 1], [2.8, 1]]
});
motion("好奇.motion3.json", 2.6, {
  ParamAngleZ: [[0, 0], [0.5, 16], [1.45, 16], [1.95, -7], [2.6, 0]],
  ParamAngleY: [[0, 0], [0.5, 5], [1.5, 5], [2.6, 0]],
  ParamEyeBallX: [[0, 0], [0.65, 0.45], [1.4, -0.45], [2.6, 0]],
  ParamEyeBallY: [[0, 0], [0.5, 0.3], [1.7, 0.3], [2.6, 0]],
  ParamEyeLOpen: [[0, 1], [0.4, 1.2], [1.8, 1.2], [2.6, 1]],
  ParamEyeROpen: [[0, 1], [0.4, 1.2], [1.8, 1.2], [2.6, 1]],
  ParamBrowLY: [[0, 0], [0.5, 0.8], [1.8, 0.8], [2.6, 0]],
  ParamBrowRY: [[0, 0], [0.5, 0.3], [1.8, 0.3], [2.6, 0]],
  ParamMouthOpenY: [[0, 0], [0.5, 0.2], [1.7, 0.2], [2.6, 0]]
});
motion("开心.motion3.json", 3, {
  ParamEyeLOpen: [[0, 1], [0.4, 0.45], [2.35, 0.45], [3, 1]],
  ParamEyeROpen: [[0, 1], [0.4, 0.45], [2.35, 0.45], [3, 1]],
  ParamEyeLSmile: [[0, 0], [0.4, 1], [2.35, 1], [3, 0]],
  ParamEyeRSmile: [[0, 0], [0.4, 1], [2.35, 1], [3, 0]],
  ParamMouthForm: [[0, 0], [0.35, 0.9], [2.4, 0.9], [3, 0]],
  ParamMouthOpenY: [[0, 0], [0.45, 0.7], [0.85, 0.3], [1.3, 0.65], [1.8, 0.3], [2.3, 0.5], [3, 0]],
  ParamAngleZ: [[0, 0], [0.55, -5], [1.15, 5], [1.8, -4], [2.4, 3], [3, 0]]
});
motion("摸头.motion3.json", 2.4, {
  Paramby: [[0, 0], [0.4, 30], [1.65, 30], [2.25, 0], [2.4, 0]],
  ParamAngleY: [[0, 0], [0.4, -6], [1.5, -6], [2.25, 0], [2.4, 0]],
  ParamAngleZ: [[0, 0], [0.65, -4], [1.25, 4], [1.7, -3], [2.4, 0]],
  ParamEyeLOpen: [[0, 1], [0.4, 0], [1.65, 0], [2.25, 1], [2.4, 1]],
  ParamEyeROpen: [[0, 1], [0.4, 0], [1.65, 0], [2.25, 1], [2.4, 1]],
  ParamEyeLSmile: [[0, 0], [0.4, 1], [1.65, 1], [2.25, 0], [2.4, 0]],
  ParamEyeRSmile: [[0, 0], [0.4, 1], [1.65, 1], [2.25, 0], [2.4, 0]],
  ParamMouthForm: [[0, 0], [0.4, 0.55], [1.65, 0.55], [2.4, 0]]
});
motion("弹跳.motion3.json", 1.8, {
  ParamBodyAngleY: [[0, 0], [0.18, -6], [0.4, 4], [0.7, -4], [0.98, 3], [1.3, -2], [1.8, 0]],
  Paramby3: [[0, 0], [0.18, -6], [0.4, 8], [0.7, -4], [0.98, 6], [1.3, 0], [1.8, 0]],
  ParamEyeLOpen: [[0, 1], [1.8, 1]],
  ParamEyeROpen: [[0, 1], [1.8, 1]],
  ParamMouthOpenY: [[0, 0], [0.4, 0.45], [0.7, 0.1], [0.98, 0.4], [1.8, 0]],
  ParamMouthForm: [[0, 0], [0.4, 0.5], [1.2, 0.5], [1.8, 0]]
});
motion("移动.motion3.json", 2.4, {
  ParamBodyAngleZ: [[0, 0], [2.4, 0]],
  ParamBodyAngleY: [[0, 0], [2.4, 0]],
  Paramby3: [[0, 0], [2.4, 0]],
  ParamAngleZ: [[0, 0], [2.4, 0]],
  ParamEyeLOpen: [[0, 1], [2.4, 1]],
  ParamEyeROpen: [[0, 1], [2.4, 1]]
});
motion("睡觉.motion3.json", 4, {
  Paramby: [[0, 30], [4, 30]],
  ParamEyeLOpen: [[0, 0], [4, 0]],
  ParamEyeROpen: [[0, 0], [4, 0]],
  ParamAngleY: [[0, -4], [2, -7], [4, -4]],
  ParamBreath: [[0, 0.25], [2, 0.75], [4, 0.25]],
  ParamMouthOpenY: [[0, 0], [4, 0]]
}, true);
motion("醒来.motion3.json", 2.2, {
  Paramby: [[0, 30], [0.65, 0], [2.2, 0]],
  ParamEyeLOpen: [[0, 0], [0.8, 1.3], [1.4, 1], [2.2, 1]],
  ParamEyeROpen: [[0, 0], [0.8, 1.3], [1.4, 1], [2.2, 1]],
  ParamAngleY: [[0, -5], [0.9, 7], [1.6, 0], [2.2, 0]],
  ParamBodyAngleY: [[0, -2], [0.9, 5], [1.8, 0], [2.2, 0]],
  ParamMouthOpenY: [[0, 0], [0.85, 0.8], [1.45, 0.2], [2.2, 0]]
});

const modelPath = resolve(directory, "罗小黑免费模型.model3.json");
const model = JSON.parse(readFileSync(modelPath, "utf8"));
model.FileReferences.Motions.Bounce = [{ File: "弹跳.motion3.json" }];
writeFileSync(modelPath, JSON.stringify(model, null, 2) + "\n");
