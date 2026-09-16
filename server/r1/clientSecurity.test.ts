import { readFile } from "node:fs/promises";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { isControlledClientRoute } from "../../client/src/lib/controlledRoutes";
import {
  LEGACY_ANALYTICS_SCRIPT_ATTRIBUTE,
  removeLegacyAnalyticsScripts,
} from "../../client/src/lib/legacyAnalytics";
import {
  PROMO_REDEEM_MUTATION_KEY,
  acquireLogicalPromoRetryKey,
  buildPromoCanonicalSignature,
  createLogicalPromoRetryState,
  disposeSettledPromoMutation,
  markLogicalPromoRequestSucceeded,
} from "../../client/src/lib/promoMutationSecurity";
import { getDocumentRegistryForValidation } from "./legal/documentRegistry";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function canonical(marketing: boolean) {
  return buildPromoCanonicalSignature("lexy-advanced-diagnostic", [
    {
      documentId: "termsdraft",
      documentVersion: "drafttestv1",
      contentHash: "a".repeat(64),
      consentType: "terms",
      accepted: true,
    },
    {
      documentId: "marketingdraft",
      documentVersion: "drafttestv1",
      contentHash: "b".repeat(64),
      consentType: "marketing",
      accepted: marketing,
    },
  ]);
}

describe("controlled client security contracts", () => {
  it("keeps a logical retry key stable and replaces it only for a canonical change or success", () => {
    const state = createLogicalPromoRetryState();
    const generate = vi
      .fn<() => string | null>()
      .mockReturnValueOnce("key-one")
      .mockReturnValueOnce("key-two")
      .mockReturnValueOnce("key-three");
    const firstSignature = canonical(false);
    const changedSignature = canonical(true);

    expect(acquireLogicalPromoRetryKey(state, firstSignature, generate)).toBe("key-one");
    expect(acquireLogicalPromoRetryKey(state, firstSignature, generate)).toBe("key-one");
    expect(generate).toHaveBeenCalledTimes(1);

    expect(acquireLogicalPromoRetryKey(state, changedSignature, generate)).toBe("key-two");
    expect(generate).toHaveBeenCalledTimes(2);

    markLogicalPromoRequestSucceeded(state);
    expect(acquireLogicalPromoRetryKey(state, changedSignature, generate)).toBe("key-three");
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("resets the observer and removes only the settled promo attempt from a real mutation cache", async () => {
    const queryClient = new QueryClient();
    const variables = { promoValue: "raw-test-only-value" };
    const promoMutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: PROMO_REDEEM_MUTATION_KEY,
      gcTime: 0,
      mutationFn: async (input: typeof variables) => input.promoValue.length,
    });
    const unrelatedMutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: [["unrelated"]],
      mutationFn: async () => true,
    });
    await promoMutation.execute(variables);
    await unrelatedMutation.execute(undefined);
    const reset = vi.fn();

    disposeSettledPromoMutation(queryClient, variables, reset);

    expect(reset).toHaveBeenCalledOnce();
    expect(queryClient.getMutationCache().getAll()).toEqual([unrelatedMutation]);
    expect(JSON.stringify(queryClient.getMutationCache().getAll())).not.toContain(
      variables.promoValue
    );
  });

  it("shares exact controlled route classification including draft legal and admin diagnostics", () => {
    for (const route of [
      "/pilot",
      "/pilot/access",
      "/cabinet",
      "/cabinet/case",
      "/auth/consume",
      "/r1/legal/termsdraft",
      "/admin/pilot-diagnostics",
      "/admin/pilot-diagnostics/detail",
    ]) {
      expect(isControlledClientRoute(route), route).toBe(true);
    }
    for (const route of ["/", "/legal/terms", "/admin", "/pilot-public"]) {
      expect(isControlledClientRoute(route), route).toBe(false);
    }
  });

  it("removes every owned analytics script node", () => {
    const removeFirst = vi.fn();
    const removeSecond = vi.fn();
    const documentObject = {
      querySelectorAll: vi.fn().mockReturnValue([
        { remove: removeFirst },
        { remove: removeSecond },
      ]),
    } as unknown as Document;

    removeLegacyAnalyticsScripts(documentObject);

    expect(documentObject.querySelectorAll).toHaveBeenCalledWith(
      `script[${LEGACY_ANALYTICS_SCRIPT_ATTRIBUTE}]`
    );
    expect(removeFirst).toHaveBeenCalledOnce();
    expect(removeSecond).toHaveBeenCalledOnce();
  });

  it("declares the legal route before generic routes and every registry href resolves by document ID", async () => {
    const appSource = await readFile(
      path.join(repositoryRoot, "client/src/App.tsx"),
      "utf8"
    );
    const promoSource = await readFile(
      path.join(repositoryRoot, "client/src/components/r1/PromoForm.tsx"),
      "utf8"
    );
    const mainSource = await readFile(
      path.join(repositoryRoot, "client/src/main.tsx"),
      "utf8"
    );

    expect(appSource).toContain('path="/r1/legal/:documentId"');
    expect(appSource.indexOf('path="/r1/legal/:documentId"')).toBeLessThan(
      appSource.indexOf('path="/legal/:doc"')
    );
    for (const document of getDocumentRegistryForValidation()) {
      expect(document.href).toBe(`/r1/legal/${document.documentId}`);
    }
    expect(promoSource).toMatch(/useMutation\(\{\s*gcTime:\s*0\s*\}\)/);
    expect(promoSource).toContain("disposeSettledPromoMutation");
    expect(promoSource).toContain("redeemPromo.reset");
    expect(mainSource).not.toContain("mountLegacyAnalytics");
    expect(mainSource).toContain("isControlledClientRoute");
    expect(appSource).toContain("removeLegacyAnalyticsScripts(document)");
  });
});
