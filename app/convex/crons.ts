import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("spend alert check", { minutes: 15 }, internal.spend.check, {});
crons.interval("spend rollup", { minutes: 1 }, internal.spend.rollup, {});
crons.interval("model stats rollup", { minutes: 1 }, internal.models.rollup, {});
crons.interval("model raw-call cleanup", { hours: 1 }, internal.models.cleanup, {});
crons.interval("sweep stuck games", { minutes: 5 }, internal.sweep.run, {});
export default crons;
