#!/usr/bin/env python3
"""Validate Lexy Release 0 draft artifacts without touching runtime behavior."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Iterable

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def load(relative: str) -> Any:
    path = ROOT / relative
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:  # noqa: BLE001 - aggregate all validation failures
        ERRORS.append(f"{relative}: cannot load JSON: {exc}")
        return {}


def require(condition: bool, message: str) -> None:
    if not condition:
        ERRORS.append(message)


def unique(values: Iterable[str], label: str) -> set[str]:
    items = list(values)
    result = set(items)
    require(len(items) == len(result), f"{label}: duplicate identifiers found")
    return result


def validate_instance(instance_path: str, schema_path: str) -> None:
    instance = load(instance_path)
    schema = load(schema_path)
    try:
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        for error in sorted(validator.iter_errors(instance), key=lambda item: list(item.path)):
            location = ".".join(str(part) for part in error.path) or "<root>"
            ERRORS.append(f"{instance_path}:{location}: {error.message}")
    except Exception as exc:  # noqa: BLE001
        ERRORS.append(f"{schema_path}: schema validation failed: {exc}")


def iter_dicts(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from iter_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_dicts(child)


def main() -> int:
    schema_pairs = [
        ("shared/legal-core/questionnaire_v2.json", "shared/legal-core/schemas/questionnaire.schema.json"),
        ("shared/legal-core/risk_catalog_v1.json", "shared/legal-core/schemas/risk-catalog.schema.json"),
        ("shared/legal-core/legal_basis_catalog_v1.json", "shared/legal-core/schemas/legal-basis.schema.json"),
        ("shared/legal-core/rules_v1.json", "shared/legal-core/schemas/rules.schema.json"),
        (
            "shared/legal-core/recommendation_mapping_v1.json",
            "shared/legal-core/schemas/recommendation-mapping.schema.json",
        ),
    ]
    for instance_path, schema_path in schema_pairs:
        validate_instance(instance_path, schema_path)

    report_schema = load("shared/report/report_schema_v1.json")
    try:
        Draft202012Validator.check_schema(report_schema)
    except Exception as exc:  # noqa: BLE001
        ERRORS.append(f"shared/report/report_schema_v1.json: invalid JSON Schema: {exc}")

    questionnaire = load("shared/legal-core/questionnaire_v2.json")
    questions = [question for block in questionnaire.get("blocks", []) for question in block.get("questions", [])]
    question_ids = unique((question.get("id", "") for question in questions), "questionnaire questions")
    question_by_id = {question["id"]: question for question in questions if question.get("id")}
    require(len(questions) == 63, f"questionnaire: expected 63 questions, got {len(questions)}")

    selection = questionnaire.get("release1Selection", {})
    active_core = selection.get("activeCoreQuestionIds", [])
    active_branch = selection.get("activeBranchQuestionIds", [])
    require(len(active_core) == 33, f"questionnaire: expected 33 Pilot core questions, got {len(active_core)}")
    require(len(active_branch) == 6, f"questionnaire: expected 6 Pilot branch questions, got {len(active_branch)}")
    require(not (set(active_core) & set(active_branch)), "questionnaire: core and branch Pilot lists overlap")
    require(set(active_core + active_branch) <= question_ids, "questionnaire: Pilot selection contains unknown question IDs")
    for question in questions:
        expected_active = question.get("id") in set(active_core + active_branch)
        require(
            question.get("activeInPilot") is expected_active,
            f"questionnaire:{question.get('id')}: activeInPilot does not match release1Selection",
        )

    source_export_path = Path("/home/ubuntu/lexy-r0-work/current-questionnaire-v1.json")
    if source_export_path.is_file():
        with source_export_path.open("r", encoding="utf-8") as handle:
            source_export = json.load(handle)
        source_questions = [
            question
            for block in source_export.get("blocks", [])
            for question in block.get("questions", [])
        ]
        source_by_id = {question["id"]: question for question in source_questions}
        require(set(source_by_id) == question_ids, "questionnaire: v1 and v2 question ID sets differ")
        for qid, source_question in source_by_id.items():
            target = question_by_id.get(qid, {})
            for field in ("blockId", "text", "hint", "type", "required"):
                require(
                    target.get(field) == source_question.get(field),
                    f"questionnaire:{qid}: source field {field} was not preserved",
                )
            source_options = [
                (option.get("id"), option.get("label"))
                for option in source_question.get("options", [])
            ]
            target_options = [
                (option.get("id"), option.get("label"))
                for option in target.get("options", [])
            ]
            require(target_options == source_options, f"questionnaire:{qid}: option IDs or labels were not preserved")
            critical_ids = {
                option.get("id")
                for option in source_question.get("options", [])
                if option.get("criticalTrigger") is True
            }
            target_critical_ids = set(target.get("criticalInputMetadata", {}).get("criticalOptionIds", []))
            require(target_critical_ids == critical_ids, f"questionnaire:{qid}: critical option metadata differs from v1")
            if critical_ids:
                require(target.get("activeInPilot") is True, f"questionnaire:{qid}: critical input is inactive in Pilot")

    risk_catalog = load("shared/legal-core/risk_catalog_v1.json")
    risks = risk_catalog.get("riskDefinitions", [])
    risk_ids = unique((risk.get("id", "") for risk in risks), "risk catalog")
    require(len(risks) == 25, f"risk catalog: expected 25 risks, got {len(risks)}")

    legal_catalog = load("shared/legal-core/legal_basis_catalog_v1.json")
    legal_basis_ids = unique((basis.get("id", "") for basis in legal_catalog.get("legalBases", [])), "legal basis catalog")
    require(len(legal_basis_ids) == 35, f"legal basis catalog: expected 35 bases, got {len(legal_basis_ids)}")
    required_review_bases = {
        "LB-RU-ZPP-16-1-4-2",
        "LB-RU-ZPP-32",
        "LB-RU-PD-152FZ-3-11",
    }
    require(required_review_bases <= legal_basis_ids, "legal basis catalog: post-review bases are missing")

    phrases = load("shared/legal-core/approved_phrases_v1.json")
    phrase_ids = unique(
        (
            phrase.get("id", "")
            for collection in ("reportPhrases", "riskPhrases", "evidenceStatusPhrases")
            for phrase in phrases.get(collection, [])
        ),
        "approved phrase catalog",
    )

    for risk in risks:
        rid = risk.get("id")
        require(set(risk.get("allowedLegalBasisIds", [])) <= legal_basis_ids, f"{rid}: unknown legal basis reference")
        require(set(risk.get("approvedLanguageIds", [])) <= phrase_ids, f"{rid}: unknown approved phrase reference")

    rules = load("shared/legal-core/rules_v1.json")
    risk_rules = rules.get("riskRules", [])
    rule_risk_ids = [rule.get("riskId", "") for rule in risk_rules]
    require(len(risk_rules) == 25, f"rules: expected 25 base risk rules, got {len(risk_rules)}")
    require(set(rule_risk_ids) == risk_ids, "rules: base risk coverage does not equal risk catalog")
    require(len(rule_risk_ids) == len(set(rule_risk_ids)), "rules: a risk has more than one base risk rule")
    engine_contract = rules.get("engineContract", {})
    evidence_derivation = engine_contract.get("evidenceDerivation", {}).get("manualReviewRequired", {})
    require(
        evidence_derivation.get("derivationRuleId") == "DERIVATION-EVIDENCE-001"
        and evidence_derivation.get("outputRiskBlockEvidenceStatus") == "manual_review_required",
        "rules: manual-review evidence derivation contract is missing",
    )
    queue_aggregation = engine_contract.get("escalationQueueAggregation", {})
    require(
        queue_aggregation.get("outputField") == "requiredQueueCodes"
        and queue_aggregation.get("beforeQueueEvent", {}).get("queueCode") is None
        and queue_aggregation.get("beforeQueueEvent", {}).get("status") == "required_not_routed",
        "rules: pre-event queue aggregation contract is invalid",
    )

    for node in iter_dicts(rules):
        qid = node.get("questionId")
        if isinstance(qid, str):
            require(qid in question_ids, f"rules: unknown questionId {qid}")
            option_ids = node.get("optionIds")
            if qid in question_by_id and isinstance(option_ids, list):
                allowed = {option.get("id") for option in question_by_id[qid].get("options", [])}
                require(set(option_ids) <= allowed, f"rules:{qid}: unknown optionIds {sorted(set(option_ids) - allowed)}")
        qids = node.get("questionIds")
        if isinstance(qids, list):
            require(set(qids) <= question_ids, f"rules: unknown questionIds {sorted(set(qids) - question_ids)}")
        rid = node.get("riskId")
        if isinstance(rid, str):
            require(rid in risk_ids, f"rules: unknown riskId {rid}")
        rids = node.get("riskIds")
        if isinstance(rids, list):
            require(set(rids) <= risk_ids, f"rules: unknown riskIds {sorted(set(rids) - risk_ids)}")

    mapping = load("shared/legal-core/recommendation_mapping_v1.json")
    product_codes = unique((product.get("productCode", "") for product in mapping.get("productCatalog", [])), "product catalog")
    require(
        mapping.get("selectionContract", {}).get("fallbackRuleId") == "FALLBACK-REC-001",
        "recommendation mapping: stable fallbackRuleId is missing",
    )
    selection_contract = mapping.get("selectionContract", {})
    require(
        selection_contract.get("fallbackCondition") == {
            "evaluationStage": "after_scoring",
            "operator": "no_positive_candidates",
        },
        "recommendation mapping: fallback must be restricted to no positive candidates after scoring",
    )
    score_rules = {
        item.get("ruleId"): (item.get("productCode"), item.get("points"))
        for collection in (selection_contract.get("segmentBoosts", []), selection_contract.get("goalBoosts", []))
        for item in collection
    }
    require(
        score_rules.get("SCORE-SEGMENT-001") == ("start_product", 5)
        and score_rules.get("SCORE-SEGMENT-006") == ("start_product", 1)
        and score_rules.get("SCORE-GOAL-007") == ("start_product", 1),
        "recommendation mapping: clean-case scoring trace must equal start_product 5+1+1",
    )
    routed_risks = []
    for route in mapping.get("riskRouting", []):
        rid = route.get("riskId", "")
        product = route.get("primaryProductCode", "")
        routed_risks.append(rid)
        require(rid in risk_ids, f"recommendation mapping: unknown riskId {rid}")
        require(product in product_codes, f"recommendation mapping:{rid}: unknown product code {product}")
    require(set(routed_risks) == risk_ids, "recommendation mapping: risk routing does not cover all risks")

    report_rule_pattern = report_schema.get("$defs", {}).get("ruleId", {}).get("pattern", "")
    require("FALLBACK-REC" in report_rule_pattern, "report schema: ruleId does not allow fallback trace")
    require(
        "SCORE-(SEGMENT|GOAL)" in report_rule_pattern and "DERIVATION-EVIDENCE" in report_rule_pattern,
        "report schema: ruleId does not allow post-review scoring/evidence trace",
    )
    for source in report_schema.get("sourceArtifacts", []):
        relative = source.get("relativePath")
        if not isinstance(relative, str):
            ERRORS.append("report schema: source artifact has no relativePath")
            continue
        target = ROOT / "shared" / relative
        require(target.is_file(), f"report schema: missing source artifact shared/{relative}")
        if target.is_file():
            actual_hash = hashlib.sha256(target.read_bytes()).hexdigest()
            require(
                source.get("checksumSha256") == actual_hash,
                f"report schema: checksum mismatch for shared/{relative}",
            )

    fixture_dir = ROOT / "fixtures/legal-core/v1"
    fixture_paths = sorted(fixture_dir.glob("*.json"))
    require(len(fixture_paths) == 15, f"fixtures: expected 15 JSON files, got {len(fixture_paths)}")
    fixture_ids: list[str] = []
    manifest = load("fixtures/legal-core/manifest.json")
    report_section_ids = {section.get("id") for section in manifest.get("reportSectionCatalog", [])}
    manifest_entries = {entry.get("path"): entry for entry in manifest.get("fixtures", [])}
    require(manifest.get("fixtureCount") == 15, "fixture manifest: fixtureCount must be 15")
    require(len(manifest_entries) == 15, "fixture manifest: expected 15 file entries")

    active_question_ids = set(active_core + active_branch)
    for path in fixture_paths:
        relative_name = f"v1/{path.name}"
        with path.open("r", encoding="utf-8") as handle:
            fixture = json.load(handle)
        fixture_ids.append(fixture.get("id", ""))
        require(fixture.get("status") == "draft_pending_legal_approval", f"{relative_name}: invalid draft status")
        answers = fixture.get("canonicalAnswers", {})
        require(set(answers) <= active_question_ids, f"{relative_name}: answers contain inactive/unknown questions {sorted(set(answers) - active_question_ids)}")
        for qid, answer in answers.items():
            question = question_by_id.get(qid)
            if not question:
                continue
            qtype = question.get("type")
            allowed = {option.get("id") for option in question.get("options", [])}
            if qtype == "single":
                require(isinstance(answer, str) and answer in allowed, f"{relative_name}:{qid}: invalid single answer")
            elif qtype == "multi":
                require(isinstance(answer, list) and set(answer) <= allowed, f"{relative_name}:{qid}: invalid multi answer")
            elif qtype == "text":
                require(isinstance(answer, str), f"{relative_name}:{qid}: text answer must be a string")
        expected_risks = set(fixture.get("expectedActiveRiskIds", [])) | set(fixture.get("expectedForbiddenRiskIds", []))
        require(expected_risks <= risk_ids, f"{relative_name}: unknown expected risk IDs")
        require(set(fixture.get("allowedLegalBasisIds", [])) <= legal_basis_ids, f"{relative_name}: unknown legal basis IDs")
        if relative_name == "v1/04-b2c-subscription-recurring.json":
            reason = fixture.get("expectedEscalation", {}).get("reason", "")
            require(
                "объединённый вопрос" in reason and "оспариваниях платежей" in reason,
                "B2C fixture: escalation reason must preserve the disjunctive meaning of b7_q4",
            )
        recommendation = fixture.get("expectedRecommendationProductCode")
        if fixture.get("caseKind") == "validation_only":
            require(recommendation is None, f"{relative_name}: validation-only case must not produce a recommendation")
        else:
            require(recommendation in product_codes, f"{relative_name}: unknown recommendation product")
        require(set(fixture.get("expectedReportSections", [])) <= report_section_ids, f"{relative_name}: unknown report section")
        entry = manifest_entries.get(relative_name)
        require(entry is not None, f"fixture manifest: missing {relative_name}")
        if entry:
            actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            require(entry.get("sha256") == actual_hash, f"fixture manifest:{relative_name}: SHA-256 mismatch")
            require(entry.get("fixtureId") == fixture.get("id"), f"fixture manifest:{relative_name}: fixtureId mismatch")

    unique(fixture_ids, "fixtures")

    expected_docs = [
        "docs/architecture/state-machines-v1.md",
        "docs/security/access-matrix-v1.md",
        "docs/migrations/v1-to-v2.md",
        "docs/architecture/payment-model-v1.md",
        "docs/data/file-retention-policy-v1.md",
        "docs/operations/environment-and-service-accounts-v1.md",
    ]
    for relative in expected_docs:
        require((ROOT / relative).is_file() and (ROOT / relative).stat().st_size > 0, f"missing document: {relative}")

    golden_dir = ROOT / "docs/legal-core/golden-reports"
    expected_golden = [
        golden_dir / "01-clean-b2b-saas.md",
        golden_dir / "02-b2c-subscription-critical.md",
        golden_dir / "03-ai-cross-border-escalation.md",
        golden_dir / "README.md",
    ]
    for path in expected_golden:
        require(path.is_file() and path.stat().st_size > 0, f"missing golden report artifact: {path.relative_to(ROOT)}")
    clean_golden = golden_dir / "01-clean-b2b-saas.md"
    if clean_golden.is_file():
        require(
            "start_product=7" in clean_golden.read_text(encoding="utf-8")
            and "SCORE-SEGMENT-001" in clean_golden.read_text(encoding="utf-8")
            and "FALLBACK-REC-001" in clean_golden.read_text(encoding="utf-8"),
            "clean golden report: scoring and fallback boundary are not documented",
        )
    cross_border_golden = golden_dir / "03-ai-cross-border-escalation.md"
    if cross_border_golden.is_file():
        cross_border_text = cross_border_golden.read_text(encoding="utf-8")
        require("segments=[early_saas_b2b, general]" in cross_border_text, "cross-border golden: normalized segments are incomplete")
        require("b5_q2:1" not in cross_border_text and "b1_q4:1" not in cross_border_text, "cross-border golden: fictitious answer revisions remain")

    if ERRORS:
        print(f"RELEASE 0 VALIDATION FAIL: {len(ERRORS)} issue(s)")
        for issue in ERRORS:
            print(f"- {issue}")
        return 1

    print("RELEASE 0 VALIDATION PASS")
    print(f"questions={len(questions)} pilot_core={len(active_core)} pilot_branch={len(active_branch)}")
    print(f"risks={len(risks)} risk_rules={len(risk_rules)} legal_bases={len(legal_basis_ids)}")
    print(f"fixtures={len(fixture_paths)} products={len(product_codes)}")
    print("json_schemas=6 golden_reports=3")
    return 0


if __name__ == "__main__":
    sys.exit(main())
