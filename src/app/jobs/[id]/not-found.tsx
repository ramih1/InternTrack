import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function JobNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Job not found</h1>
      <p className="text-muted-foreground mt-2">This listing may have been removed.</p>
      <Button asChild className="mt-6">
        <Link href="/jobs">Back to job board</Link>
      </Button>
    </div>
  );
}
