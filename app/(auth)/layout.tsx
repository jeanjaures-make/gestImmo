import { Building2 } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-6" />
          </span>
          <span className="font-heading text-lg font-semibold">CaisseOps</span>
        </div>
        {children}
      </div>
    </main>
  );
}
