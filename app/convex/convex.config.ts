import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import presence from "@convex-dev/presence/convex.config";

const app = defineApp();
app.use(staticHosting);
app.use(rateLimiter);
app.use(presence);
// Two AI work queues under the deployment's scheduled-job cap: realtime ticks/refreshes can't starve game setup and final scoring.
app.use(workpool, { name: "livePool" });
app.use(workpool, { name: "finalPool" });
export default app;
