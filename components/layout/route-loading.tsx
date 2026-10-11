import { PageSkeleton } from "@/components/layout/page-skeleton";

/**
 * Default export for loading.tsx files. Client navigations only re-render below the layout
 * shared by both routes, so every leaf segment needs its own boundary to navigate instantly.
 */
export default function RouteLoading() {
  return <PageSkeleton />;
}
