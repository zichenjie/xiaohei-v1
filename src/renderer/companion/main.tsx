import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { COMPANION_COPY, type CompanionBubble } from "../../shared/companion.js";
import "./styles.css";

function CompanionBubbleApp() {
  const [bubble, setBubble] = useState<CompanionBubble | null>(null);
  const [replying, setReplying] = useState(false);
  useEffect(() => {
    let changed = false;
    let active = true;
    void window.xiaohei.companion.getBubble().then((value) => { if (active && !changed) setBubble(value); });
    const unsubscribe = window.xiaohei.companion.onBubble((value) => { changed = true; setBubble(value); setReplying(false); });
    return () => { active = false; unsubscribe(); };
  }, []);
  if (!bubble) return null;
  const copy = COMPANION_COPY[bubble.kind];
  const reply = (response: "accept" | "busy") => {
    if (replying) return;
    setReplying(true);
    void window.xiaohei.companion.reply({ id: bubble.id, response }).catch(() => setReplying(false));
  };
  return <aside key={bubble.id} className="companion-bubble" aria-label="小黑的邀请" data-kind={bubble.kind}>
    <p>{copy.text}</p>
    {copy.accept ? <div className="bubble-choices">
      <button disabled={replying} onClick={() => reply("accept")}>{copy.accept}</button>
      <button className="quiet-choice" disabled={replying} onClick={() => reply("busy")}>先忙</button>
    </div> : null}
  </aside>;
}

createRoot(document.getElementById("root")!).render(<CompanionBubbleApp />);
