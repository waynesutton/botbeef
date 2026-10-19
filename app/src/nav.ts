import { useEffect, useState } from "react";
export function go(path: string) {
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
export function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search });
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return loc;
}
// Only the per-game card (/g/{slug}?embed=1) is a compact embed. /in-tweet is the regular app (see App.tsx).
export const isEmbed = () => new URLSearchParams(location.search).has("embed");
