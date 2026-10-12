export { baseEnv } from "./base";

import { apiEnv } from "./presets/api";

/**
 * Default env - use apiEnv for server-side packages.
 * For apps, use the app-specific preset: apiEnv, dashboardEnv.
 */
export const env = apiEnv;

export * from "./modules";
export * from "./presets";
