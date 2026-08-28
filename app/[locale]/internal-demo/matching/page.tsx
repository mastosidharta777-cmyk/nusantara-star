import { notFound } from "next/navigation";

import { InternalMatchDemo } from "@/components/internal-match-demo";

export default function InternalMatchingDemoPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <InternalMatchDemo />;
}
