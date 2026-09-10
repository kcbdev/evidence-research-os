import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Persistent application shell (PBI-030): brand header + uniform
 * responsive container on every route. Pages render their content
 * inside; navigation context (breadcrumbs) flows via props, never
 * page-local back-links alone.
 */
export default function AppShell({
  children,
  trail,
}: {
  children: ReactNode;
  trail?: { href: string; label: string }[];
}) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="font-semibold">
            Evidence Research OS
          </Link>
          {/* PBI-047: Search nav renders only now that the cross-project
              index exists (no dead UI before this phase). */}
          <Link
            href="/search"
            className="ml-auto min-h-[44px] inline-flex items-center text-sm underline"
          >
            Search
          </Link>
          {trail && trail.length > 0 && (
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              {trail.map((crumb, i) => (
                <span key={crumb.href}>
                  {" / "}
                  {i === trail.length - 1 ? (
                    <span aria-current="page">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="underline">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-8">
        {children}
      </div>
    </div>
  );
}
