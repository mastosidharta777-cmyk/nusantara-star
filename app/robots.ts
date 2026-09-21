import type { MetadataRoute } from "next";
import { getLaunchMode } from "@/lib/launch-control";

export default function robots(): MetadataRoute.Robots {
  if (getLaunchMode() === "coming_soon") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return { rules: { userAgent: "*", allow: "/" } };
}
