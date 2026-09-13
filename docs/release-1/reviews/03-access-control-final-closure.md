# READ-ONLY final closure review: Release 1 / Vertical increment 1 — Access control

**Author:** Manus AI
**Date:** 2026-09-13
**Repository:** `/home/ubuntu/Neolex`
**Branch:** `feat/lexy-release-1-pilot`
**Scope:** Final read-only closure check of M-01 and static regression review of M-02–M-05 and m-01/m-02. No runtime, test, schema, migration, or client source was changed. This report is the only review artifact written.
**Verdict:** **PASS**

> This is a technical security and architecture closure review. It is **not legal advice, human legal approval, or authorization for client/runtime launch**.

## 1. Decision

**PASS.** There are **zero blockers and zero majors attributable to the v2 increment**. The sole remaining M-01 issue in the preceding closure—the exact disposable database-name check in the DB wrapper and DB Vitest profile—is closed.

The runtime release gate, DB test wrapper, and DB integration profile now have a consistent safe-target boundary: only MySQL/MariaDB URLs, loopback hosts, and an exactly matching disposable database name are accepted. The full database-name expression in all three controls is:

```text
^lexy_r1_test_[A-Za-z0-9_]+$
```

The runtime gate additionally requires exact test mode, the synthetic-test flag, `r1-harness` identity, `disposable_test` database class, and a dedicated customer-session secret. The test wrapper independently enforces the same exact environment/profile values and requires distinct, sufficiently long customer-session and JWT secrets before it runs migrations or the DB suite. The dedicated Vitest DB profile independently rejects unsafe protocol, host, or database targets at configuration load.

| Classification | Count | Disposition |
|---|---:|---|
| Blocker attributable to v2 increment | 0 | None found. |
| Major attributable to v2 increment | 0 | M-01 closed; no M-02–M-05 regression found. |
| Minor attributable to v2 increment | 0 | No m-01/m-02 regression found. |
| Accepted external P0 / global blocker | 1 | B-01 legacy bearer/LLM remains outside v2 and blocks a global §31.3 or launch-ready claim. |

## 2. M-01 closure matrix

| Required invariant | Result | Evidence |
|---|---|---|
| Client mode is permanently disabled | **PASS** | `clientRuntimeAllowed` is hard-coded `false`; fake approval/hash/client-enable values cannot enable it.[1] [2] |
| Synthetic mode has exact test identity/profile | **PASS** | Runtime requires exact `NODE_ENV=test`, flag `true`, identity `r1-harness`, and class `disposable_test`; the wrapper requires the same values before executing.[1] [3] |
| MySQL/MariaDB only | **PASS** | Runtime, wrapper, and DB profile permit only `mysql:`/`mariadb:` URLs.[1] [3] [4] |
| Loopback only | **PASS** | Each target validator permits only `localhost`, `127.0.0.1`, `::1`, or `[::1]`.[1] [3] [4] |
| Exact disposable database name | **PASS** | Each target validator decodes the pathname and applies `^lexy_r1_test_[A-Za-z0-9_]+$` rather than a prefix match.[1] [3] [4] |
| Remote, HTTPS, and suffix targets fail closed | **PASS** | Unit tests explicitly deny remote MySQL, `https:`, and `lexy_r1_test_gate/other`; the wrapper/profile use the same protocol, host, and exact-name restriction.[2] [3] [4] |
| Dedicated secrets | **PASS** | Runtime requires a customer secret of at least 32 characters, distinct from JWT; wrapper requires both secrets to be at least 32 characters and distinct.[1] [3] |
| No public synthetic writer | **PASS** | The mounted v2 Pilot router contains status, authentication-status, and customer read procedures only. `createSyntheticCase` is a service-only export guarded by `assertSyntheticTestAllowed()` and is not mounted in `appRouter`.[5] [6] [7] |

The prior wrapper/profile suffix-path defect is therefore closed throughout the relevant test and runtime boundary, not only in the runtime gate.

## 3. Static regression check

No regression was identified by static inspection of the previously closed findings.

| Finding | Result | Current evidence |
|---|---|---|
| **M-02 — transition idempotency, CAS, and atomic side effects** | **No regression** | Keyed request/key hashes, idempotency claim, owner-scoped lookup, CAS, audit, outbox, and completion remain inside one transaction. Existing real-DB coverage exercises replay, different-command conflict, race, stale rollback, audit rollback, outbox rollback, and ownership isolation.[8] [9] |
| **M-03 — real DB evidence** | **No regression** | The isolated profile includes only integration tests, has no setup mocks, runs in one fork, and validates a safe DB target before loading.[4] The final validation run passed **102 unit tests plus 15 real-DB integration tests**. |
| **M-04 — denial audit and request correlation** | **No regression** | Context supplies a server-generated request ID. Owner, role, and purpose denials retain minimal audited contracts without raw resource locator or raw purpose; real-DB tests assert neutral denial behavior and safe audit contents.[10] [11] [12] [13] |
| **M-05 — strict audit/outbox privacy contracts** | **No regression** | Strict discriminated event schemas and complete generated-envelope validation remain in place before persistence; arbitrary/nested free-form fields are rejected.[14] [15] [16] |
| **m-01 — secret domain separation** | **No regression** | Customer-session secret has no JWT fallback; gate/wrapper enforce separation and strength.[1] [3] [17] |
| **m-02 — idempotency retention/completion semantics** | **No regression** | Keys remain non-reclaimable semantic identities; expiry is cleanup metadata; completion requires exactly one pending row.[18] |

## 4. Migration, foreign keys, and legacy compatibility

`0005_r1_access_control_expand.sql` remains **add-only**: `CREATE TABLE`, `ALTER TABLE ... ADD CONSTRAINT`, and `CREATE INDEX`. Static inspection found no `DROP`, `DELETE FROM`, `TRUNCATE`, `RENAME`, `MODIFY`, or `CHANGE`. Its seven `ALTER TABLE` statements add foreign keys only to added v2 tables; no existing legacy table is altered.[19] [20]

The seven explicit foreign-key names are **22–28 characters**, below the MySQL/MariaDB 64-character identifier limit. The existing real-DB schema suite checks 11 v2 tables, seven foreign keys, required indexes, FK/unique enforcement, and retention of all 12 named legacy tables with unchanged row counts.[19] [20] No static legacy-schema regression was found.

## 5. Validation performed

| Check | Result | Notes |
|---|---|---|
| `pnpm check` | **PASS** | `tsc --noEmit` exited 0. |
| `pnpm test` | **PASS** | **13 test files, 102 unit tests passed**. The default profile intentionally excludes `server/r1/integration/**`.[21] |
| `git diff --check` | **PASS** | No whitespace errors were reported. |
| M-01 runtime/wrapper/profile inspection | **PASS** | Verified MySQL/MariaDB, loopback-only, exact database regex, test identity/profile values, dedicated secrets, client-off invariant, remote/HTTPS/suffix denial, and no public synthetic writer.[1] [2] [3] [4] [5] [6] [7] |
| `pnpm test:r1:db` | **PASS** | Migrations applied to the local loopback disposable MariaDB; **3 test files, 15 real-DB integration tests passed**. |

## 6. Residual global limitation

**B-01 legacy bearer/LLM is an accepted external P0/global launch blocker.** It is not a v2-increment defect and does not change this increment's technical **PASS**. Retained legacy `sessionToken` bearer routes and the legacy public LLM surface prevent any application-wide §31.3-compliance or launch-ready assertion.[22] [23]

This review is **not legal approval** and does not authorize client/runtime launch or a global security/compliance claim. A launch decision requires separate human legal, product, and deployment approval, together with separate treatment, isolation, or retirement of the legacy bearer/LLM surface.

## References

[1]: file:///home/ubuntu/Neolex/server/r1/releaseGate.ts "Release 1 runtime release gate"
[2]: file:///home/ubuntu/Neolex/server/r1/releaseGate.test.ts "Release 1 release-gate unit tests"
[3]: file:///home/ubuntu/Neolex/tools/run-r1-db-tests.ts "Fail-closed Release 1 DB test wrapper"
[4]: file:///home/ubuntu/Neolex/vitest.r1-db.config.ts "Isolated Release 1 real-DB Vitest profile"
[5]: file:///home/ubuntu/Neolex/server/routers.ts "Application router mounts"
[6]: file:///home/ubuntu/Neolex/server/r1/cases/router.ts "Mounted read-only Pilot router"
[7]: file:///home/ubuntu/Neolex/server/r1/cases/caseService.ts "Gate-protected synthetic case service"
[8]: file:///home/ubuntu/Neolex/server/r1/transitions/transitionService.ts "Transactional case transition service"
[9]: file:///home/ubuntu/Neolex/server/r1/integration/transitions.integration.test.ts "Real DB transition tests"
[10]: file:///home/ubuntu/Neolex/server/_core/context.ts "Server-generated request IDs and customer context"
[11]: file:///home/ubuntu/Neolex/server/_core/trpc.ts "Audited Release 1 admin middleware"
[12]: file:///home/ubuntu/Neolex/server/r1/admin/router.ts "Purpose-denial audit"
[13]: file:///home/ubuntu/Neolex/server/r1/integration/access.integration.test.ts "Real DB access and admin audit tests"
[14]: file:///home/ubuntu/Neolex/server/r1/events/contracts.ts "Strict audit and outbox contracts"
[15]: file:///home/ubuntu/Neolex/server/r1/audit/auditRepository.ts "Audit envelope validation"
[16]: file:///home/ubuntu/Neolex/server/r1/outbox/outboxRepository.ts "Outbox envelope validation"
[17]: file:///home/ubuntu/Neolex/server/_core/env.ts "Customer-session environment configuration"
[18]: file:///home/ubuntu/Neolex/server/r1/idempotency/idempotencyRepository.ts "Idempotency semantics and completion CAS"
[19]: file:///home/ubuntu/Neolex/drizzle/0005_r1_access_control_expand.sql "Add-only Release 1 access-control migration"
[20]: file:///home/ubuntu/Neolex/server/r1/integration/schema.integration.test.ts "Real DB schema and legacy-compatibility tests"
[21]: file:///home/ubuntu/Neolex/vitest.config.ts "Default unit-test profile"
[22]: file:///home/ubuntu/Neolex/docs/release-1/reviews/01-access-control-review.md "Initial access-control review and B-01"
[23]: file:///home/ubuntu/Neolex/docs/release-1/implementation-plan.md "Release 1 implementation plan"
