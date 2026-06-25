import { describe, expect, it } from "vitest";
import { calculateScore, QUESTIONS } from "../shared/diagnosticData";

describe("calculateScore", () => {
  it("returns low risk for safe answers", () => {
    const answers: Record<string, string> = {
      q1_product_type: "saas",
      q2_customers: "b2b_only",
      q3_data: "no_pd",
      q4_storage: "russia_only",
      q5_ip_rights: "rights_full",
      q6_documents: "docs_full",
      q7_payments: "invoice",
      q8_contractors: "no_contractors",
    };
    const result = calculateScore(answers);
    expect(result.riskCategory).toBe("low");
    expect(result.hasCriticalEvent).toBe(false);
    expect(result.totalScore).toBeLessThanOrEqual(6);
  });

  it("escalates to high when critical event present", () => {
    const answers: Record<string, string> = {
      q1_product_type: "saas",
      q2_customers: "b2b_only",
      q3_data: "no_pd",
      q4_storage: "abroad_only", // critical event
      q5_ip_rights: "rights_full",
      q6_documents: "docs_full",
      q7_payments: "invoice",
      q8_contractors: "no_contractors",
    };
    const result = calculateScore(answers);
    expect(result.hasCriticalEvent).toBe(true);
    expect(["high", "critical"]).toContain(result.riskCategory);
  });

  it("returns critical for multiple critical events", () => {
    const answers: Record<string, string> = {
      q1_product_type: "regulated", // critical
      q2_customers: "b2c_only",
      q3_data: "special_pd", // critical
      q4_storage: "abroad_only", // critical
      q5_ip_rights: "rights_none", // critical
      q6_documents: "docs_none", // critical
      q7_payments: "foreign_payment",
      q8_contractors: "multiple", // critical
    };
    const result = calculateScore(answers);
    expect(result.riskCategory).toBe("critical");
    expect(result.hasCriticalEvent).toBe(true);
    expect(result.totalScore).toBeGreaterThan(24);
  });

  it("returns moderate for mixed answers without critical events", () => {
    const answers: Record<string, string> = {
      q1_product_type: "b2c_software",
      q2_customers: "b2c_only",
      q3_data: "standard_pd",
      q4_storage: "russia_only",
      q5_ip_rights: "rights_full",
      q6_documents: "docs_uncertain",
      q7_payments: "ru_payment",
      q8_contractors: "no_contractors",
    };
    const result = calculateScore(answers);
    expect(result.hasCriticalEvent).toBe(false);
    expect(["moderate", "high"]).toContain(result.riskCategory);
  });

  it("includes relevant risk blocks in output", () => {
    const answers: Record<string, string> = {
      q1_product_type: "saas",
      q2_customers: "b2b_only",
      q3_data: "standard_pd",
      q4_storage: "russia_only",
      q5_ip_rights: "rights_none", // critical — ip_rights block
      q6_documents: "docs_full",
      q7_payments: "invoice",
      q8_contractors: "no_contractors",
    };
    const result = calculateScore(answers);
    const blockIds = result.activeRiskBlocks.map((b) => b.id);
    expect(blockIds).toContain("ip_rights");
  });

  it("limits risk blocks to max 5", () => {
    const answers: Record<string, string> = {
      q1_product_type: "regulated",
      q2_customers: "b2c_only",
      q3_data: "special_pd",
      q4_storage: "abroad_only",
      q5_ip_rights: "rights_none",
      q6_documents: "docs_none",
      q7_payments: "foreign_payment",
      q8_contractors: "multiple",
    };
    const result = calculateScore(answers);
    expect(result.activeRiskBlocks.length).toBeLessThanOrEqual(5);
  });

  it("generates non-empty main conclusion", () => {
    const answers: Record<string, string> = {
      q1_product_type: "saas",
      q2_customers: "b2b_only",
      q3_data: "no_pd",
      q4_storage: "russia_only",
      q5_ip_rights: "rights_full",
      q6_documents: "docs_full",
      q7_payments: "invoice",
      q8_contractors: "no_contractors",
    };
    const result = calculateScore(answers);
    expect(result.mainConclusion).toBeTruthy();
    expect(result.mainConclusion.length).toBeGreaterThan(20);
  });

  it("has correct number of questions", () => {
    expect(QUESTIONS.length).toBe(8);
  });

  it("all questions have required fields", () => {
    for (const q of QUESTIONS) {
      expect(q.id).toBeTruthy();
      expect(q.title).toBeTruthy();
      expect(q.hint).toBeTruthy();
      expect(q.options.length).toBeGreaterThan(0);
    }
  });
});
