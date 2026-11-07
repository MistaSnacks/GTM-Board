import type { NextConfig } from "next";

// externalDir lets the dashboard import the item store from ../server/src/items,
// so the dashboard and the MCP server share one set of status rules.
const nextConfig: NextConfig = {
  experimental: { externalDir: true },
};
export default nextConfig;
