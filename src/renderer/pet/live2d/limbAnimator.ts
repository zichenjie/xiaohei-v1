import { footPlacement, smoothStep, walkFacing, walkPhase, WALK_STRIDE_UNITS, walkTravel, type WalkFrame } from "../../../shared/walk.js";

export interface LimbCore {
  update(): void;
  getParameterValueById?(id: string): number;
  setParameterValueById?(id: string, value: number): void;
  getModel?(): { drawables: { ids: ArrayLike<string>; vertexPositions: ArrayLike<Float32Array> } };
}

// The bundled model has separate arm/leg meshes, but no articulated limb
// parameters. Deform those meshes after Cubism evaluates the authored pose.
export function createLimbAnimator(core: LimbCore, now = () => performance.now()) {
  const drawables = core.getModel?.().drawables;
  const ids = drawables ? Array.from(drawables.ids) : [];
  const limbs = {
    rightArm: ["ArtMesh60", "ArtMesh66", "ArtMesh68"],
    leftArm: ["ArtMesh51", "ArtMesh52", "ArtMesh53"],
    rightLeg: ["ArtMesh54"], leftLeg: ["ArtMesh55"]
  };
  const supported = Object.values(limbs).flat().every((id) => ids.includes(id));
  // Preserve the authored pants silhouette. Body-yaw physics can otherwise
  // shear the legs before foot locking adds another deformation on top.
  const restingPants = new Map<string, Float32Array>();
  const restingArms = new Map<string, Float32Array>();
  if (drawables && supported) {
    for (const name of [...limbs.rightLeg, ...limbs.leftLeg, "ArtMesh116"]) {
      const index = ids.indexOf(name);
      if (index >= 0) restingPants.set(name, drawables.vertexPositions[index].slice());
    }
    for (const name of [...limbs.rightArm, ...limbs.leftArm]) {
      restingArms.set(name, drawables.vertexPositions[ids.indexOf(name)].slice());
    }
  }
  const originalUpdate = core.update;
  let active: { group: "Greet" | "Move"; start: number; duration: number } | null = null;
  let walkFrame: WalkFrame | null = null;
  const originals = new Map<Float32Array, Float32Array>();
  const facingParameters = new Map<string, number>();
  const soles = new Map<string, { indices: number[]; x: number; y: number }>();
  let settling: { start: number; meshes: Map<Float32Array, Float32Array> } | null = null;

  function settleMeshes() {
    if (!settling) return;
    const weight = smoothStep((now() - settling.start) / 260);
    for (const [vertices, previous] of settling.meshes) {
      if (!originals.has(vertices)) originals.set(vertices, vertices.slice());
      for (let index = 0; index < vertices.length; index++) vertices[index] = previous[index] + (vertices[index] - previous[index]) * weight;
    }
    if (weight >= 1) settling = null;
  }

  function rememberSoles() {
    soles.clear();
    if (!drawables || !supported) return;
    for (const name of [...limbs.rightLeg, ...limbs.leftLeg]) {
      const vertices = restingPants.get(name) ?? drawables.vertexPositions[ids.indexOf(name)];
      let bottom = Infinity;
      for (let index = 1; index < vertices.length; index += 2) bottom = Math.min(bottom, vertices[index]);
      const indices: number[] = [];
      for (let index = 0; index < vertices.length; index += 2) {
        if (vertices[index + 1] < bottom + 0.008) indices.push(index);
      }
      soles.set(name, {
        indices, x: indices.reduce((sum, index) => sum + vertices[index], 0) / indices.length,
        y: indices.reduce((sum, index) => sum + vertices[index + 1], 0) / indices.length
      });
    }
  }

  function restoreFacing() {
    for (const [id, value] of facingParameters) core.setParameterValueById?.(id, value);
    facingParameters.clear();
  }

  function applyFacing() {
    restoreFacing();
    if (active?.group !== "Move" || !supported || !walkFrame) return;
    const facing = walkFacing(walkFrame.progress, walkFrame.stride);
    for (const [id, value] of [["ParamAngleX", facing * 30], ["ParamBodyAngleX", facing * 10], ["ParamEyeBallX", facing * 0.65]] as const) {
      facingParameters.set(id, core.getParameterValueById?.(id) ?? 0);
      core.setParameterValueById?.(id, value);
    }
  }

  function restore() {
    for (const [vertices, baseline] of originals) vertices.set(baseline);
    originals.clear();
  }

  function transform(names: string[], pivotX: number, pivotY: number, angle: number, lift = 0) {
    if (!drawables) return;
    for (const name of names) {
      const vertices = drawables.vertexPositions[ids.indexOf(name)];
      if (!originals.has(vertices)) originals.set(vertices, vertices.slice());
      for (let index = 0; index < vertices.length; index += 2) {
        const x = vertices[index] - pivotX;
        const y = vertices[index + 1] - pivotY;
        // Keep the attachment covered by the shirt while the distal limb moves.
        const weight = Math.min(1, Math.max(0, Math.hypot(x, y) / 0.045));
        const rotation = angle * weight;
        vertices[index] = pivotX + x * Math.cos(rotation) - y * Math.sin(rotation);
        vertices[index + 1] = pivotY + x * Math.sin(rotation) + y * Math.cos(rotation) + lift * weight;
      }
    }
  }

  function placeFoot(names: string[], x: number, lift: number) {
    if (!drawables) return;
    for (const name of names) {
      const vertices = drawables.vertexPositions[ids.indexOf(name)];
      if (!originals.has(vertices)) originals.set(vertices, vertices.slice());
      const sole = soles.get(name);
      const correctionX = sole ? sole.x - sole.indices.reduce((sum, index) => sum + vertices[index], 0) / sole.indices.length : 0;
      const correctionY = sole ? sole.y - sole.indices.reduce((sum, index) => sum + vertices[index + 1], 0) / sole.indices.length : 0;
      for (let index = 0; index < vertices.length; index += 2) {
        // Pin the waistband and crotch under the shirt. Only taper the step
        // into the lower leg; moving the visible upper thigh opens a hole.
        const weight = smoothStep((-0.3 - vertices[index + 1]) / 0.095);
        vertices[index] += (x + correctionX) * weight;
        vertices[index + 1] += (lift + correctionY) * weight;
      }
    }
  }

  function applyRestingMeshes(meshes: Map<string, Float32Array>) {
    for (const [name, baseline] of meshes) {
      const vertices = drawables!.vertexPositions[ids.indexOf(name)];
      originals.set(vertices, vertices.slice());
      vertices.set(baseline);
    }
  }

  function waveArm(upperAngle: number, forearmAngle: number) {
    // Character's right arm is on the viewer's left. Keep the shoulder cap
    // attached while the upper arm and forearm share the waving motion.
    // Bend the elbow along an arc. Cross-sections follow the arc's normal
    // instead of collapsing into a straight blend between two bone poses.
    const arc = [{ x: -0.1, y: -0.115 }];
    const segments = 16;
    const dy = -0.04 / segments;
    for (let i = 0; i < segments; i++) {
      const angle = forearmAngle * smoothStep((i + 0.5) / segments);
      const previous = arc[i];
      arc.push({ x: previous.x - Math.sin(angle) * dy, y: previous.y + Math.cos(angle) * dy });
    }
    for (const name of limbs.leftArm) {
      const vertices = drawables!.vertexPositions[ids.indexOf(name)];
      for (let index = 0; index < vertices.length; index += 2) {
        const x = vertices[index];
        const y = vertices[index + 1];
        const weight = smoothStep((-0.115 - y) / 0.04);
        const forearmRotation = forearmAngle * weight;
        const t = Math.max(0, Math.min(1, (-0.115 - y) / 0.04)) * segments;
        const segment = Math.min(segments - 1, Math.floor(t));
        const fraction = t - segment;
        const extension = y > -0.115 ? y + 0.115 : y < -0.155 ? y + 0.155 : 0;
        const centerX = arc[segment].x + (arc[segment + 1].x - arc[segment].x) * fraction - Math.sin(forearmRotation) * extension;
        const centerY = arc[segment].y + (arc[segment + 1].y - arc[segment].y) * fraction + Math.cos(forearmRotation) * extension;
        const forearmX = centerX + (x + 0.1) * Math.cos(forearmRotation);
        const forearmY = centerY + (x + 0.1) * Math.sin(forearmRotation);
        const shoulderWeight = smoothStep((-0.092 - y) / 0.028);
        const upperRotation = upperAngle * shoulderWeight;
        const shoulderX = forearmX + 0.073;
        const shoulderY = forearmY + 0.08;
        vertices[index] = -0.073 + shoulderX * Math.cos(upperRotation) - shoulderY * Math.sin(upperRotation);
        vertices[index + 1] = -0.08 + shoulderX * Math.sin(upperRotation) + shoulderY * Math.cos(upperRotation);
      }
    }
  }

  function turnTorso(facing: number) {
    if (!drawables) return;
    // Keep the waist/leg attachment unchanged. Narrow the chest and attached
    // arms together to support the authored three-quarter head turn.
    for (const name of ["ArtMesh46", "ArtMesh47", "ArtMesh57", ...limbs.rightArm, ...limbs.leftArm]) {
      const drawableIndex = ids.indexOf(name);
      if (drawableIndex < 0) continue;
      const vertices = drawables.vertexPositions[drawableIndex];
      if (!originals.has(vertices)) originals.set(vertices, vertices.slice());
      for (let index = 0; index < vertices.length; index += 2) {
        const weight = smoothStep((vertices[index + 1] + 0.27) / 0.12);
        vertices[index] *= 1 - 0.12 * Math.abs(facing) * weight;
      }
    }
  }

  function carryUpperBody(phase: number, envelope: number) {
    if (!drawables) return;
    const lift = Math.sin(phase * Math.PI) ** 2 * 0.003 * envelope;
    const sway = Math.sin(phase * Math.PI) * 0.0015 * envelope;
    // Keep grounded feet and the pants seam intact. The shirt covers the
    // small weight transfer at the hips; head, hair and arms move together.
    for (const name of ids) {
      if (restingPants.has(name)) continue;
      const vertices = drawables.vertexPositions[ids.indexOf(name)];
      if (!originals.has(vertices)) originals.set(vertices, vertices.slice());
      for (let index = 0; index < vertices.length; index += 2) {
        const weight = smoothStep((vertices[index + 1] + 0.29) / 0.08);
        vertices[index] += sway * weight;
        vertices[index + 1] += lift * weight;
      }
    }
  }

  core.update = function () {
    restore();
    originalUpdate.call(core);
    if (!active || !supported) { settleMeshes(); return; }
    const elapsed = Math.max(0, (now() - active.start) / 1000);
    const progress = Math.min(1, elapsed / active.duration);
    if (active.group === "Greet") {
      applyRestingMeshes(restingArms);
      const raised = smoothStep(elapsed / 0.65) * (1 - smoothStep((elapsed - 2.05) / 0.75));
      const waveTime = Math.max(0, Math.min(1, (elapsed - 0.65) / 1.4));
      const wave = Math.sin(waveTime * Math.PI * 5) * Math.sin(waveTime * Math.PI);
      // Let the forearm follow the upper arm with a small delay and wider arc.
      // The shared envelope brings both segments smoothly back to rest.
      const forearmWave = Math.sin(waveTime * Math.PI * 5 - 0.45) * Math.sin(waveTime * Math.PI);
      waveArm((-0.4 + wave * 0.11) * raised, (-1.1 + forearmWave * 0.22) * raised);
    } else {
      applyRestingMeshes(restingPants);
      const phase = walkFrame?.progress ?? progress;
      const stride = walkFrame?.stride ?? WALK_STRIDE_UNITS;
      const distance = walkFrame?.distance ?? walkTravel(phase) * stride;
      const right = footPlacement(phase, "right", distance, stride);
      const left = footPlacement(phase, "left", distance, stride);
      placeFoot(limbs.rightLeg, right.x, right.lift);
      placeFoot(limbs.leftLeg, left.x, left.lift);
      const stepPhase = walkPhase(phase);
      const envelope = smoothStep(phase / 0.12) * (1 - smoothStep((phase - 0.8) / 0.2));
      const swing = Math.cos(stepPhase * Math.PI) * envelope;
      const direction = Math.sign(stride);
      transform(limbs.rightArm, 0.074, -0.082, swing * direction * 0.18);
      transform(limbs.leftArm, -0.073, -0.082, -swing * direction * 0.18);
      turnTorso(walkFacing(phase, stride));
      carryUpperBody(stepPhase, envelope);
    }
    settleMeshes();
  };

  return {
    applyFacing,
    start(group: string, duration: number) {
      restore();
      restoreFacing();
      if (group === "Move") rememberSoles();
      walkFrame = null;
      active = group === "Greet" || group === "Move" ? { group, start: now(), duration } : null;
    },
    setWalkFrame(frame: WalkFrame) { walkFrame = frame; },
    stop(gently = false) {
      if (gently && originals.size) settling = { start: now(), meshes: new Map([...originals.keys()].map((vertices) => [vertices, vertices.slice()])) };
      if (!gently) settling = null;
      active = null; restore(); restoreFacing(); soles.clear();
    },
    dispose() { active = null; settling = null; restore(); restoreFacing(); soles.clear(); core.update = originalUpdate; }
  };
}
