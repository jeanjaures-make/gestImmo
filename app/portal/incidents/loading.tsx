import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only" role="status">
        Chargement en cours\u2026
      </span>
      <ListSkeleton rows={4} />
    </div>
  );
}
