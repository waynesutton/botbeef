/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as bots from "../bots.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as engine from "../engine.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as leaderboard from "../leaderboard.js";
import type * as learn from "../learn.js";
import type * as lib from "../lib.js";
import type * as migrate from "../migrate.js";
import type * as mindmap from "../mindmap.js";
import type * as models from "../models.js";
import type * as modelsAdmin from "../modelsAdmin.js";
import type * as moderation from "../moderation.js";
import type * as pages from "../pages.js";
import type * as presence from "../presence.js";
import type * as returns from "../returns.js";
import type * as rotation from "../rotation.js";
import type * as seo from "../seo.js";
import type * as shell from "../shell.js";
import type * as spend from "../spend.js";
import type * as spike from "../spike.js";
import type * as sweep from "../sweep.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  bots: typeof bots;
  config: typeof config;
  crons: typeof crons;
  engine: typeof engine;
  games: typeof games;
  http: typeof http;
  leaderboard: typeof leaderboard;
  learn: typeof learn;
  lib: typeof lib;
  migrate: typeof migrate;
  mindmap: typeof mindmap;
  models: typeof models;
  modelsAdmin: typeof modelsAdmin;
  moderation: typeof moderation;
  pages: typeof pages;
  presence: typeof presence;
  returns: typeof returns;
  rotation: typeof rotation;
  seo: typeof seo;
  shell: typeof shell;
  spend: typeof spend;
  spike: typeof spike;
  sweep: typeof sweep;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  livePool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"livePool">;
  finalPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"finalPool">;
};
