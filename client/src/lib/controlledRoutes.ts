const CONTROLLED_ROUTE_PREFIXES = [
  "/pilot",
  "/cabinet",
  "/auth",
  "/r1/legal",
  "/admin/pilot-diagnostics",
] as const;

export function isControlledClientRoute(pathname: string): boolean {
  return CONTROLLED_ROUTE_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export const CONTROLLED_ROUTE_PREFIXES_FOR_TEST = CONTROLLED_ROUTE_PREFIXES;
