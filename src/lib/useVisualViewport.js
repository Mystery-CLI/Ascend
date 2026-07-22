import { useEffect, useState } from "react";

// Mobile keyboards shrink the VISUAL viewport, but `fixed`/`inset-0` on most
// mobile browsers is measured against the LAYOUT viewport, which does not
// shrink. A sheet anchored to "the bottom of the viewport" ends up anchored
// behind the keyboard instead of above it, which is why a composer input
// looked like it got shoved down the moment it was tapped. Tracking the real
// visual viewport and applying it as an explicit pixel height/offset fixes
// that everywhere a full-screen overlay holds a text input.
export function useVisualViewport() {
  const [rect, setRect] = useState(() => ({
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    offsetTop: 0,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setRect({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return rect;
}
