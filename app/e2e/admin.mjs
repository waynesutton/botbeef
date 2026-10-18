// Internal (admin-only) Convex functions for e2e checks, via the CLI. Prod when SITE is the prod site.
import { execFileSync } from "node:child_process";
const S = process.env.SITE ?? "https://small-mallard-255.convex.site";
const PROD = S.includes("small-mallard-255");
export const admin = (fn, args = {}) => {
  const out = execFileSync("npx", ["convex", "run", ...(PROD ? ["--prod"] : []), fn, JSON.stringify(args)], { cwd: "/workspace/agent-battle/app", encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const t = out.trim();
  try { return JSON.parse(t); } catch { return t; }
};
