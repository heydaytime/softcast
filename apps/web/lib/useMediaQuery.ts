"use client";

import { useEffect, useState } from "react";

// SSR-safe media query hook. Returns false on the server and the first client render
// (so the markup matches and there is no hydration mismatch), then syncs to the real
// value in useEffect and stays subscribed to changes. A `false` default means callers
// render the small-screen layout first and upgrade to the desktop layout one frame
// later on wide viewports — which avoids flashing the broken wide layout on phones.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
