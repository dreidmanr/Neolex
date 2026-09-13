import path from "node:path";
import { defineConfig } from "vitest/config";

const repositoryRoot = path.resolve(import.meta.dirname);

function assertSafeDatabaseProfile(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("R1 DB integration profile requires DATABASE_URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("R1 DB integration profile requires a valid DATABASE_URL");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    !["mysql:", "mariadb:"].includes(parsed.protocol) ||
    !allowedHosts.has(parsed.hostname) ||
    !/^lexy_r1_test_[A-Za-z0-9_]+$/.test(databaseName)
  ) {
    throw new Error("R1 DB integration profile rejected an unsafe database target");
  }
}

assertSafeDatabaseProfile();

export default defineConfig({
  root: repositoryRoot,
  resolve: {
    alias: {
      "@": path.resolve(repositoryRoot, "client", "src"),
      "@shared": path.resolve(repositoryRoot, "shared"),
      "@assets": path.resolve(repositoryRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/r1/integration/**/*.integration.test.ts"],
    mockReset: false,
    restoreMocks: false,
    unstubEnvs: false,
    unstubGlobals: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
  },
});

/*
 * This dedicated profile deliberately has no setupFiles and no vi.mock calls.
 * Integration files are excluded from the default profile and use the real DB,
 * repositories, routers, and services in one process because getDb() is cached.
 */
void 0;
