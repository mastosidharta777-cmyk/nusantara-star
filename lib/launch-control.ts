export type LaunchMode = "coming_soon" | "live";

/**
 * Public-site switch. It is deliberately server-only: changing the Vercel
 * environment variable does not expose an administrative control to visitors.
 */
export function getLaunchMode(): LaunchMode {
  return process.env.NUSANTARA_STAR_LAUNCH_MODE === "live" ? "live" : "coming_soon";
}
