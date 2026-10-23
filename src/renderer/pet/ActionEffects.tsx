import type { CSSProperties } from "react";
import { isPetReactionName } from "../../shared/actions.js";
import { SOFT_DURATION } from "./live2d/presenceAnimator.js";

export function ActionEffects({ action }: { action: string }) {
  if (!isPetReactionName(action)) return null;
  return <div className="reaction-effects" data-effect={action}
    style={{ "--effect-duration": `${SOFT_DURATION[action]}s` } as CSSProperties}>
    {action === "Nod" ? <span className="reaction-symbol reaction-agree">✓</span> : null}
    {action === "ShakeHead" ? <svg className="reaction-lines" viewBox="0 0 100 100"><path d="M8 28 Q2 40 8 52 M92 28 Q98 40 92 52" /></svg> : null}
    {action === "Wink" ? <><span className="reaction-symbol reaction-star">✦</span><span className="reaction-symbol reaction-star-small">✧</span></> : null}
    {action === "Shy" ? <svg className="reaction-blush" viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="30" cy="85" rx="8" ry="4" /><ellipse cx="70" cy="85" rx="8" ry="4" /></svg> : null}
    {action === "Yawn" ? <span className="reaction-symbol reaction-yawn">· · ·</span> : null}
    {action === "Sway" ? <><span className="reaction-symbol reaction-note">♪</span><span className="reaction-symbol reaction-note-second">♫</span></> : null}
  </div>;
}
