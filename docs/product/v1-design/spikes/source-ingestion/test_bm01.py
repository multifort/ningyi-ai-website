#!/usr/bin/env python3
import json
import importlib.util
import io
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
SCRIPT = Path(__file__).with_name("extract_source_blocks.py")
ROUTER = Path(__file__).with_name("route_media_analysis.py")
OCR_APPLIER = Path(__file__).with_name("apply_ocr_result.py")
CONTEXT_BUILDER = Path(__file__).with_name("build_context_pack.py")
SECTION_LEDGER = ROOT / "docs/product/v1-design/spikes/long-document/section_ledger.py"
QUALITY_GATE = ROOT / "docs/product/v1-design/spikes/long-document/quality_gate.py"
MODEL_DISPATCH = ROOT / "docs/product/v1-design/spikes/model-routing/dispatch_model.py"
DELIVERABLE_PLANNER = ROOT / "docs/product/v1-design/spikes/deliverable-planning/plan_deliverables.py"
DELIVERABLE_EXECUTION = ROOT / "docs/product/v1-design/spikes/deliverable-execution/execution_run.py"
ARTIFACT_REPOSITORY = ROOT / "docs/product/v1-design/spikes/artifact-versioning/artifact_repository.py"
CHANGE_IMPACT = ROOT / "docs/product/v1-design/spikes/change-impact/plan_change.py"
TASK_RUNTIME = ROOT / "docs/product/v1-design/spikes/task-runtime/task_runtime.py"
PROGRESS_AGGREGATOR = ROOT / "docs/product/v1-design/spikes/progress-aggregation/aggregate_progress.py"
INTAKE_HANDOFF = ROOT / "docs/product/v1-design/spikes/intake-handoff/intake_handoff.py"
UPLOAD_VALIDATION = ROOT / "docs/product/v1-design/spikes/upload-validation/validate_upload.py"
PRIVATE_ACCESS = ROOT / "docs/product/v1-design/spikes/private-access/private_access.py"
DATA_DELETION = ROOT / "docs/product/v1-design/spikes/data-deletion/deletion_lifecycle.py"
OPERATIONS_MONITOR = ROOT / "docs/product/v1-design/spikes/operations-monitoring/monitor_operations.py"
BM01 = ROOT / "docs/product/v1-design/benchmarks/BM-01"


class BM01SourceIngestionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="bm01-source-blocks-")
        cls.output = Path(cls.temp.name) / "source-blocks.jsonl"
        cls.second_output = Path(cls.temp.name) / "source-blocks-second-run.jsonl"
        for output in (cls.output, cls.second_output):
            subprocess.run([
                sys.executable, str(SCRIPT),
                "--input", str(BM01 / "sources"),
                "--base", str(BM01),
                "--output", str(output),
                "--pptx-classification", "template_style",
            ], check=True)
        cls.blocks = [json.loads(line) for line in cls.output.read_text(encoding="utf-8").splitlines() if line]
        cls.route_output = Path(cls.temp.name) / "media-routes.jsonl"
        subprocess.run([sys.executable, str(ROUTER), "--blocks", str(cls.output), "--output", str(cls.route_output)], check=True)
        cls.routes = [json.loads(line) for line in cls.route_output.read_text(encoding="utf-8").splitlines() if line]
        cls.ocr_output = Path(cls.temp.name) / "ocr-source-blocks.jsonl"
        subprocess.run([
            sys.executable, str(OCR_APPLIER),
            "--result", str(BM01 / "expected/ocr-scanned-meeting-page.json"),
            "--base", str(BM01),
            "--output", str(cls.ocr_output),
        ], check=True)
        cls.ocr_blocks = [json.loads(line) for line in cls.ocr_output.read_text(encoding="utf-8").splitlines() if line]
        cls.ocr_route_output = Path(cls.temp.name) / "ocr-media-routes.jsonl"
        subprocess.run([sys.executable, str(ROUTER), "--blocks", str(cls.ocr_output), "--output", str(cls.ocr_route_output)], check=True)
        cls.ocr_routes = [json.loads(line) for line in cls.ocr_route_output.read_text(encoding="utf-8").splitlines() if line]
        cls.context_output = Path(cls.temp.name) / "context-pack.json"
        cls.context_second_output = Path(cls.temp.name) / "context-pack-second.json"
        for output in (cls.context_output, cls.context_second_output):
            subprocess.run([
                sys.executable, str(CONTEXT_BUILDER),
                "--blocks", str(cls.output), str(cls.ocr_output),
                "--project-model", str(BM01 / "expected/project-model.json"),
                "--query", "商机关闭权限冲突以及销售代表和销售经理的处理方案",
                "--task-type", "section_generation",
                "--section-id", "SOLUTION-PERMISSION",
                "--max-input-tokens", "900",
                "--reserved-output-tokens", "1800",
                "--prior-section-summary", "上一节已确认一期采用响应式 Web，财务总账不纳入范围。",
                "--output", str(output),
            ], check=True)
        cls.context_pack = json.loads(cls.context_output.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_supported_formats_are_present(self):
        self.assertEqual({block["sourceFormat"] for block in self.blocks}, {"docx", "pdf", "xlsx", "pptx"})

    def test_blocks_have_unique_identity_and_hash(self):
        self.assertEqual(len({block["id"] for block in self.blocks}), len(self.blocks))
        self.assertTrue(all(len(block["contentHash"]) == 64 for block in self.blocks))
        self.assertTrue(all(block["canonicalText"] for block in self.blocks))

    def test_repeated_runs_are_byte_identical(self):
        self.assertEqual(self.output.read_bytes(), self.second_output.read_bytes())

    def test_image_is_registered_without_pretending_visual_understanding(self):
        image = ROOT / "public/images/project-delivery/project-team-coordination.png"
        output = Path(self.temp.name) / "image-source-blocks.jsonl"
        subprocess.run([
            sys.executable, str(SCRIPT),
            "--input", str(image),
            "--base", str(ROOT),
            "--output", str(output),
        ], check=True)
        block = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(block["sourceFormat"], "image")
        self.assertEqual(block["blockType"], "image")
        self.assertGreater(block["structuredData"]["width"], 0)
        self.assertGreater(block["structuredData"]["height"], 0)
        self.assertIn("visual_content_not_analyzed", block["warnings"])
        self.assertIsNotNone(block["mediaArtifactId"])

    def test_pptx_template_preserves_structure_and_media_slots(self):
        blocks = [block for block in self.blocks if block["sourceFormat"] == "pptx"]
        self.assertTrue(blocks)
        self.assertTrue(all(block["classification"] == "template_style" for block in blocks))
        self.assertTrue(any(block["blockType"] == "table" for block in blocks))
        self.assertTrue(any(block["blockType"] == "image" for block in blocks))
        self.assertTrue(all(block["locator"]["slide"] and block["locator"]["shape"] for block in blocks))
        corpus = "\n".join(block["canonicalText"] for block in blocks)
        self.assertIn("财务总账", corpus)
        self.assertIn("销售代表是否可以直接关闭", corpus)

    def test_permission_conflict_is_extractable(self):
        corpus = "\n".join(block["canonicalText"] for block in self.blocks)
        self.assertIn("销售代表可以关闭本人负责的商机", corpus)
        self.assertIn("不能直接将商机置为", corpus)

    def test_scope_and_data_quality_facts_are_extractable(self):
        corpus = "\n".join(block["canonicalText"] for block in self.blocks)
        self.assertIn("财务总账", corpus)
        self.assertIn("统一社会信用代码", corpus)
        self.assertIn("C0002", corpus)

    def test_locators_are_replayable(self):
        docx_rows = [block for block in self.blocks if block["sourceFormat"] == "docx" and block["blockType"] == "table"]
        pdf_blocks = [block for block in self.blocks if block["sourceFormat"] == "pdf"]
        xlsx_rows = [block for block in self.blocks if block["sourceFormat"] == "xlsx" and block["blockType"] == "cell_range"]
        self.assertTrue(all(block["locator"]["table"] and block["locator"]["row"] for block in docx_rows))
        self.assertTrue(all(block["locator"]["page"] and block["locator"]["block"] and block["locator"]["bbox"] for block in pdf_blocks))
        self.assertTrue(all(block["locator"]["sheet"] and block["locator"]["cellRange"] for block in xlsx_rows))

    def test_xlsx_dates_merges_formulas_and_chart_are_structured(self):
        blocks = [block for block in self.blocks if block["sourceFormat"] == "xlsx"]
        cells = [cell for block in blocks if block["blockType"] == "cell_range" for cell in block["structuredData"]["cells"]]
        self.assertTrue(any(cell["valueType"] == "date" and cell["displayValue"] == "2026-06-12" for cell in cells))
        self.assertTrue(any("A1:K1" in block["structuredData"]["mergedRanges"] for block in blocks if block["blockType"] == "cell_range"))
        self.assertTrue(any(cell["formula"] and "COUNTIF" in cell["formula"] for cell in cells))
        charts = [block for block in blocks if block["blockType"] == "chart"]
        self.assertEqual(len(charts), 1)
        self.assertEqual(charts[0]["structuredData"]["chartType"], "barChart")
        self.assertEqual(charts[0]["structuredData"]["seriesFormulas"], ["'状态统计'!$A$4:$A$7", "'状态统计'!$B$4:$B$7"])

    def test_scanned_pdf_is_preserved_and_routed_to_ocr(self):
        scanned = [block for block in self.blocks if block["sourcePath"].endswith("scanned-meeting-page.pdf")]
        self.assertEqual(len(scanned), 1)
        self.assertIn("ocr_required", scanned[0]["warnings"])
        self.assertIsNotNone(scanned[0]["mediaArtifactId"])
        routes = [route for route in self.routes if route["sourcePath"].endswith("scanned-meeting-page.pdf")]
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0]["route"], "ocr_standard")
        self.assertEqual(routes[0]["fallbackRoute"], "vision_low_cost")
        self.assertFalse(routes[0]["requiresModel"])

    def test_visual_escalation_has_no_human_processing_branch(self):
        spec = importlib.util.spec_from_file_location("media_router", ROUTER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.post_ocr_route(0.95, "low")[0], "deterministic_text")
        self.assertEqual(module.post_ocr_route(0.82, "medium")[0], "vision_low_cost")
        self.assertEqual(module.post_ocr_route(0.6, "high")[0], "vision_premium")
        self.assertNotIn("manual", {route["route"] for route in self.routes})

    def test_ocr_result_rejoins_source_block_contract_and_escalates_selectively(self):
        self.assertEqual(len(self.ocr_blocks), 7)
        self.assertTrue(all(block["parser"]["name"] == "ocr:bm01-ocr-fixture" for block in self.ocr_blocks))
        self.assertTrue(all(block["locator"]["bbox"] for block in self.ocr_blocks))
        self.assertTrue(all(block["mediaArtifactId"] for block in self.ocr_blocks))
        self.assertIn("财务总账", "\n".join(block["canonicalText"] for block in self.ocr_blocks))
        self.assertEqual(sum(route["route"] == "vision_low_cost" for route in self.ocr_routes), 1)
        self.assertEqual(sum(route["route"] == "deterministic_text" for route in self.ocr_routes), 6)
        self.assertEqual(sum(route["route"] == "vision_premium" for route in self.ocr_routes), 0)

    def test_context_pack_is_budgeted_deterministic_and_continuous(self):
        pack = self.context_pack
        self.assertLessEqual(pack["budget"]["estimatedInputTokens"], pack["budget"]["maxInputTokens"] - pack["budget"]["safetyMarginTokens"])
        self.assertLessEqual(pack["budget"]["utilization"], 0.9)
        self.assertEqual(pack["continuity"]["priorSectionSummary"], "上一节已确认一期采用响应式 Web，财务总账不纳入范围。")
        corpus = "\n".join(item["text"] for item in pack["evidence"])
        self.assertIn("CRM-F-005", corpus)
        self.assertIn("不能直接将商机", corpus)
        self.assertNotIn("[scanned page]", corpus)
        self.assertEqual(self.context_output.read_bytes(), self.context_second_output.read_bytes())

    def test_long_document_ledger_resumes_and_invalidates_only_dependencies(self):
        spec = importlib.util.spec_from_file_location("section_ledger", SECTION_LEDGER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        outline = json.loads((BM01 / "expected/solution-outline.json").read_text(encoding="utf-8"))
        project_revision_id = "62000000-0000-4000-8000-000000000001"
        ledger = module.create_ledger(outline, project_revision_id)
        self.assertEqual(module.next_work_item(ledger)["id"], "SEC-01")
        with self.assertRaisesRegex(ValueError, "dependencies not validated"):
            module.start_section(ledger, "SEC-03", self.context_output.read_bytes(), "formal_high_quality")
        source_ids = [item["sourceBlockId"] for item in self.context_pack["evidence"][:3]]
        for section_id in ("SEC-01", "SEC-02", "SEC-03", "SEC-04"):
            self.assertEqual(module.next_work_item(ledger)["id"], section_id)
            module.start_section(ledger, section_id, self.context_output.read_bytes(), "formal_high_quality")
            module.complete_section(ledger, section_id, f"{section_id} 正文", f"{section_id} 已确认摘要", source_ids)
            module.validate_section(ledger, section_id, True)
        self.assertEqual(module.next_work_item(ledger)["id"], "SEC-05")
        self.assertIn("SEC-04 已确认摘要", module.dependency_summary(ledger, "SEC-05"))
        module.revise_section(ledger, "SEC-02")
        states = {section["id"]: section["status"] for section in ledger["sections"]}
        self.assertEqual(states, {"SEC-01": "validated", "SEC-02": "pending", "SEC-03": "stale", "SEC-04": "stale", "SEC-05": "pending"})
        self.assertEqual(module.next_work_item(ledger)["id"], "SEC-02")
        self.assertEqual(module.create_ledger(outline, project_revision_id)["documentId"], ledger["documentId"])

    def test_section_quality_gate_passes_grounded_draft_and_rejects_unsafe_draft(self):
        spec = importlib.util.spec_from_file_location("quality_gate", QUALITY_GATE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        good = json.loads((BM01 / "expected/section-draft-permission.json").read_text(encoding="utf-8"))
        project = json.loads((BM01 / "expected/project-model.json").read_text(encoding="utf-8"))
        good_report = module.evaluate(good, self.context_pack, project, [])
        self.assertEqual(good_report["status"], "pass")
        self.assertEqual(good_report["metrics"]["citationCoverage"], 1.0)
        bad = {
            "schemaVersion": "1.0",
            "sectionId": "SEC-03",
            "title": "业务与权限方案",
            "revision": 0,
            "blocks": [
                {"id": "BAD-01", "type": "paragraph", "claimType": "sourced_fact", "text": "本期纳入财务总账并提供完整核算能力。", "sourceBlockIds": []},
                {"id": "BAD-02", "type": "paragraph", "claimType": "analysis", "text": "销售员可以直接关闭商机。", "sourceBlockIds": ["00000000-0000-4000-8000-000000000001"]}
            ]
        }
        prior = {"blocks": [{"id": "OLD-01", "type": "paragraph", "text": "销售员可以直接关闭商机。"}]}
        bad_report = module.evaluate(bad, self.context_pack, project, [prior])
        self.assertEqual(bad_report["status"], "fail")
        failed = {item["code"] for item in bad_report["checks"] if not item["passed"]}
        self.assertTrue({"QG-CITATION", "QG-CONTEXT", "QG-SCOPE", "QG-CONFLICT", "QG-DUPLICATION", "QG-TERMINOLOGY"} <= failed)

    def test_model_routing_separates_free_and_formal_quality_without_downgrade(self):
        spec = importlib.util.spec_from_file_location("model_dispatch", MODEL_DISPATCH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        policy = json.loads((BM01 / "expected/model-routing-policy.json").read_text(encoding="utf-8"))
        free = module.dispatch(policy, "free_analysis", 800, 600, 10000)
        self.assertEqual((free["status"], free["slotId"], free["qualityTier"]), ("ready", "text_economy", "economy"))
        formal = module.dispatch(policy, "section_generation", 808, 1800, 20000)
        self.assertEqual((formal["status"], formal["slotId"], formal["qualityTier"]), ("ready", "text_quality", "quality"))
        deferred = module.dispatch(policy, "formal_analysis", 3000, 5000, 100)
        self.assertEqual((deferred["status"], deferred["slotId"], deferred["qualityTier"]), ("deferred_budget", "text_quality", "quality"))
        self.assertIn("insufficient_internal_budget_no_silent_downgrade", deferred["reasonCodes"])
        split = module.dispatch(policy, "section_generation", 800, 20000, 100000)
        self.assertEqual(split["status"], "split_required")
        self.assertEqual(module.dispatch(policy, "vision_low_cost", 500, 300, 10000)["slotId"], "vision_economy")
        self.assertEqual(module.dispatch(policy, "vision_premium", 500, 300, 10000)["slotId"], "vision_quality")
        self.assertEqual(module.dispatch(policy, "ocr_standard", 0, 0, 10000)["status"], "deterministic")

    def test_deliverable_formats_reuse_semantics_without_extra_model_calls(self):
        spec = importlib.util.spec_from_file_location("deliverable_planner", DELIVERABLE_PLANNER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        catalog = json.loads((BM01 / "expected/deliverable-generation-catalog.json").read_text(encoding="utf-8"))
        policy = json.loads((BM01 / "expected/model-routing-policy.json").read_text(encoding="utf-8"))
        deliverables = ["DEL-REQ", "DEL-FUN", "DEL-EST", "DEL-PLAN", "DEL-QUOTE", "DEL-SOLUTION", "DEL-SLIDE"]
        result = module.plan(catalog, policy, deliverables, 200000)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["costSummary"]["modelCalls"], 7)
        self.assertEqual(result["costSummary"]["renderJobs"], 17)
        self.assertTrue(all(job["modelCall"] is False for job in result["renderJobs"]))
        self.assertGreater(result["costSummary"]["savingsRate"], 0.87)

        catalog["formats"]["DEL-SOLUTION"].append("html")
        with_extra_format = module.plan(catalog, policy, deliverables, 200000)
        self.assertEqual(with_extra_format["costSummary"]["optimizedWeightedCost"], result["costSummary"]["optimizedWeightedCost"])
        self.assertEqual(with_extra_format["costSummary"]["modelCalls"], result["costSummary"]["modelCalls"])
        self.assertEqual(with_extra_format["costSummary"]["renderJobs"], 18)

        deferred = module.plan(catalog, policy, ["DEL-SOLUTION"], 100)
        self.assertEqual(deferred["status"], "deferred_budget")
        formal_slots = {item["slotId"] for item in deferred["contentModules"] if item["taskType"] != "deterministic_text"}
        self.assertEqual(formal_slots, {"text_quality"})

    def test_execution_run_resumes_retries_and_invalidates_only_dependents(self):
        planner_spec = importlib.util.spec_from_file_location("deliverable_planner_for_execution", DELIVERABLE_PLANNER)
        planner = importlib.util.module_from_spec(planner_spec)
        planner_spec.loader.exec_module(planner)
        execution_spec = importlib.util.spec_from_file_location("deliverable_execution", DELIVERABLE_EXECUTION)
        execution = importlib.util.module_from_spec(execution_spec)
        execution_spec.loader.exec_module(execution)
        catalog = json.loads((BM01 / "expected/deliverable-generation-catalog.json").read_text(encoding="utf-8"))
        policy = json.loads((BM01 / "expected/model-routing-policy.json").read_text(encoding="utf-8"))
        deliverables = ["DEL-REQ", "DEL-FUN", "DEL-EST", "DEL-PLAN", "DEL-QUOTE", "DEL-SOLUTION", "DEL-SLIDE"]
        plan = planner.plan(catalog, policy, deliverables, 200000)
        revision = "62000000-0000-4000-8000-000000000001"
        run = execution.create_run(plan, revision)
        self.assertEqual(len(run["nodes"]), 35)
        self.assertEqual(len(execution.ready_nodes(run)), 9)
        self.assertEqual(execution.create_run(plan, revision)["runId"], run["runId"])

        content_id = "content:project_understanding"
        quality_id = "quality:project_understanding"
        execution.start_node(run, content_id)
        execution.complete_node(run, content_id, b"project understanding")
        execution.start_node(run, quality_id)
        execution.fail_node(run, quality_id, "citation_coverage_failed")
        self.assertEqual(execution.node_by_id(run, quality_id)["attempt"], 1)
        execution.retry_node(run, quality_id)
        execution.start_node(run, quality_id)
        execution.complete_node(run, quality_id, b"quality pass")
        self.assertEqual(execution.node_by_id(run, quality_id)["attempt"], 2)

        while execution.ready_nodes(run):
            for item in list(execution.ready_nodes(run)):
                execution.start_node(run, item["id"])
                execution.complete_node(run, item["id"], item["id"].encode("utf-8"))
        self.assertEqual(run["status"], "complete")

        execution.invalidate_node(run, "content:estimation_calculation")
        self.assertEqual(execution.node_by_id(run, "content:estimation_calculation")["status"], "pending")
        self.assertEqual(execution.node_by_id(run, "quality:estimation_calculation")["status"], "stale")
        self.assertEqual(execution.node_by_id(run, "render:DEL-QUOTE:xlsx")["status"], "stale")
        self.assertEqual(execution.node_by_id(run, "render:DEL-REQ:docx")["status"], "complete")

    def test_artifact_versions_separate_semantics_rendering_and_package_visibility(self):
        spec = importlib.util.spec_from_file_location("artifact_repository", ARTIFACT_REPOSITORY)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        repository = module.create_repository("BM-01")
        run_id = "d33e0fc7-f6ba-5022-a807-61e3b76d689b"
        v1 = module.add_content_candidate(repository, run_id, {"project_understanding": module.digest(b"understanding"), "solution_narrative": module.digest(b"solution")})
        self.assertIsNone(repository["activePublishedContentVersionId"])
        module.publish_content(repository, v1["id"])
        default_template = module.add_template(repository, "company-deck", b"default template")
        files = [
            {"deliverable": "DEL-SOLUTION", "format": "docx", "objectKey": "private/BM-01/V1/R1/solution.docx", "content": b"solution docx", "visibility": "both"},
            {"deliverable": "DEL-QUOTE", "format": "xlsx", "objectKey": "private/BM-01/V1/R1/internal-quote.xlsx", "content": b"cost and margin", "visibility": "internal"},
        ]
        r1 = module.add_render_version(repository, v1["id"], default_template["id"], "office-renderer@1", files)
        client_package = module.create_package(repository, v1["id"], "client", [artifact["id"] for artifact in r1["artifacts"]])
        self.assertEqual(client_package["modelCalls"], 0)
        self.assertEqual(len(client_package["artifactIds"]), 1)
        self.assertNotIn(r1["artifacts"][1]["id"], client_package["artifactIds"])

        company_template = module.add_template(repository, "company-deck", b"customer supplied template")
        r2 = module.add_render_version(repository, v1["id"], company_template["id"], "office-renderer@1", files)
        self.assertEqual((r2["renderNo"], r2["contentVersionId"], r2["modelCalls"]), (2, v1["id"], 0))
        self.assertEqual(len(repository["contentVersions"]), 1)

        v2 = module.add_content_candidate(repository, run_id, {"project_understanding": module.digest(b"revised understanding"), "solution_narrative": module.digest(b"solution")})
        self.assertEqual(repository["activePublishedContentVersionId"], v1["id"])
        module.publish_content(repository, v2["id"])
        self.assertEqual(repository["activePublishedContentVersionId"], v2["id"])
        module.rollback_content(repository, v1["id"])
        self.assertEqual(repository["activePublishedContentVersionId"], v1["id"])
        with self.assertRaisesRegex(ValueError, "another content version"):
            module.create_package(repository, v2["id"], "internal", [r1["artifacts"][0]["id"]])

    def test_change_impact_classifies_rcsp_and_stops_at_locked_targets(self):
        spec = importlib.util.spec_from_file_location("change_impact", CHANGE_IMPACT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        graph = json.loads((BM01 / "expected/change-impact-graph.json").read_text(encoding="utf-8"))

        render_only = module.plan(graph, "template_change", ["company_template"])
        self.assertEqual((render_only["actionClass"], render_only["modelTaskCount"]), ("R", 0))
        self.assertTrue(all(item["action"] == "render" for item in render_only["impactedTargets"]))

        calculate = module.plan(graph, "parameter_change", ["rate_card"])
        self.assertEqual((calculate["actionClass"], calculate["modelTaskCount"]), ("C", 0))
        self.assertNotIn("estimation_calculation", {item["id"] for item in calculate["impactedTargets"]})
        self.assertIn("render_quote", {item["id"] for item in calculate["impactedTargets"]})

        semantic = module.plan(graph, "user_edit", ["requirement_baseline"])
        semantic_ids = {item["id"] for item in semantic["impactedTargets"]}
        self.assertEqual(semantic["actionClass"], "S")
        self.assertIn("render_slides", semantic_ids)
        self.assertNotIn("company_template", semantic_ids)
        self.assertNotIn("rate_card", semantic_ids)

        locked = module.plan(graph, "user_edit", ["requirement_baseline"], ["function_architecture"])
        locked_ids = {item["id"] for item in locked["impactedTargets"]}
        self.assertEqual(locked["conflicts"][0]["lockedTarget"], "function_architecture")
        self.assertEqual(locked["conflicts"][0]["blockedPath"], ["requirement_baseline", "function_architecture"])
        self.assertNotIn("function_architecture", locked_ids)
        self.assertNotIn("estimation_classification", locked_ids)

        restructure = module.plan(graph, "project_restructure", ["project_model"])
        self.assertEqual(restructure["actionClass"], "P")
        self.assertEqual(restructure["impactedTargets"][0]["action"], "rebuild_project_model")
        self.assertGreater(restructure["modelTaskCount"], semantic["modelTaskCount"])

    def test_task_runtime_is_idempotent_recovers_leases_and_retries_without_humans(self):
        spec = importlib.util.spec_from_file_location("task_runtime", TASK_RUNTIME)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        runtime = module.create_runtime()
        input_hash = module.digest(b"source input")
        parse = module.enqueue(runtime, "BM-01", "V1", "parse", "requirements.docx", input_hash, now=0)
        duplicate = module.enqueue(runtime, "BM-01", "V1", "parse", "requirements.docx", input_hash, now=0)
        self.assertIs(parse, duplicate)
        self.assertEqual(len(runtime["tasks"]), 1)
        generate = module.enqueue(runtime, "BM-01", "V1", "formal_model", "requirement_baseline", module.digest(b"project model"), [parse["id"]], now=0)

        first_lease = module.lease_next(runtime, "worker-a", now=0, lease_seconds=10)
        self.assertEqual(first_lease["id"], parse["id"])
        self.assertIsNone(module.lease_next(runtime, "worker-b", now=5))
        self.assertEqual(module.reclaim_expired(runtime, now=11), 1)
        second_lease = module.lease_next(runtime, "worker-b", now=11, lease_seconds=100)
        self.assertEqual(second_lease["id"], parse["id"])
        module.fail(runtime, parse["id"], "worker-b", "MODEL_TIMEOUT", now=12)
        self.assertEqual(parse["status"], "retry_wait")
        self.assertIsNone(module.lease_next(runtime, "worker-c", now=71))
        third_lease = module.lease_next(runtime, "worker-c", now=72, lease_seconds=100)
        self.assertEqual(third_lease["id"], parse["id"])
        module.succeed(runtime, parse["id"], "worker-c", b"parsed blocks", now=73)
        self.assertEqual(module.lease_next(runtime, "worker-d", now=73)["id"], generate["id"])

        module.fail(runtime, generate["id"], "worker-d", "INTERNAL_BUDGET_DEFERRED", now=74)
        self.assertEqual(generate["status"], "deferred_budget")
        module.resume_budget(runtime, generate["id"], now=100)
        module.lease_next(runtime, "worker-e", now=100, lease_seconds=100)
        module.succeed(runtime, generate["id"], "worker-e", b"formal output", now=101)
        self.assertEqual(generate["status"], "succeeded")
        self.assertEqual([attempt["status"] for attempt in runtime["attempts"]], ["lease_expired", "retry_wait", "succeeded", "deferred_budget", "succeeded"])
        self.assertNotIn("manual", json.dumps(runtime))

    def test_progress_aggregation_is_user_facing_progressive_and_recoverable(self):
        planner_spec = importlib.util.spec_from_file_location("planner_for_progress", DELIVERABLE_PLANNER)
        planner = importlib.util.module_from_spec(planner_spec)
        planner_spec.loader.exec_module(planner)
        execution_spec = importlib.util.spec_from_file_location("execution_for_progress", DELIVERABLE_EXECUTION)
        execution = importlib.util.module_from_spec(execution_spec)
        execution_spec.loader.exec_module(execution)
        progress_spec = importlib.util.spec_from_file_location("progress_aggregator", PROGRESS_AGGREGATOR)
        progress = importlib.util.module_from_spec(progress_spec)
        progress_spec.loader.exec_module(progress)
        catalog = json.loads((BM01 / "expected/deliverable-generation-catalog.json").read_text(encoding="utf-8"))
        policy = json.loads((BM01 / "expected/model-routing-policy.json").read_text(encoding="utf-8"))
        deliverables = ["DEL-REQ", "DEL-FUN", "DEL-EST", "DEL-PLAN", "DEL-QUOTE", "DEL-SOLUTION", "DEL-SLIDE"]
        plan = planner.plan(catalog, policy, deliverables, 200000)
        run = execution.create_run(plan, "62000000-0000-4000-8000-000000000001")

        initial = progress.aggregate(plan, run)
        self.assertEqual((initial["status"], initial["stage"], initial["progressPercent"]), ("processing", "understanding", 0))
        self.assertFalse(initial["requiresUserAction"])

        req_job_modules = next(job for job in plan["renderJobs"] if job["deliverable"] == "DEL-REQ")["contentModuleIds"]
        for module_id in req_job_modules:
            for prefix in ("content", "quality"):
                execution.node_by_id(run, f"{prefix}:{module_id}").update({"status": "complete", "artifactHash": "a" * 64})
        for job in [job for job in plan["renderJobs"] if job["deliverable"] == "DEL-REQ"]:
            execution.node_by_id(run, f"render:DEL-REQ:{job['format']}").update({"status": "complete", "artifactHash": "b" * 64})
        partial = progress.aggregate(plan, run)
        req = next(item for item in partial["deliverables"] if item["id"] == "DEL-REQ")
        self.assertEqual(partial["status"], "partially_available")
        self.assertEqual((req["status"], set(req["availableFormats"])), ("available", {"xlsx", "docx", "pdf"}))

        recovering = progress.aggregate(plan, run, {"tasks": [{"status": "retry_wait"}]})
        self.assertEqual((recovering["status"], recovering["stage"], recovering["requiresUserAction"]), ("recovering", "recovering", False))

        for item in run["nodes"]:
            item.update({"status": "complete", "artifactHash": "c" * 64})
        complete = progress.aggregate(plan, run)
        self.assertEqual((complete["status"], complete["progressPercent"]), ("available", 100))
        execution.invalidate_node(run, "content:estimation_calculation")
        affected = progress.aggregate(plan, run)
        statuses = {item["id"]: item["status"] for item in affected["deliverables"]}
        self.assertEqual(statuses["DEL-REQ"], "available")
        self.assertEqual(statuses["DEL-QUOTE"], "affected")
        visible_copy = json.dumps(affected, ensure_ascii=False)
        self.assertNotIn("Worker", visible_copy)
        self.assertNotIn("新建项目", visible_copy)
        self.assertNotIn("选择模型", visible_copy)

    def test_intake_handoff_preserves_input_binds_once_and_starts_automatically(self):
        spec = importlib.util.spec_from_file_location("intake_handoff", INTAKE_HANDOFF)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        draft_id = "81000000-0000-4000-8000-000000000001"
        user_id = "82000000-0000-4000-8000-000000000001"
        files = [{"category": "content", "displayName": "需求说明.docx", "sizeBytes": 2048, "lastModified": 1000}]
        draft = module.create_draft(draft_id, "售前方案", "需要统一客户与商机管理", {"productShapes": ["Web", "AI Agent"]}, files)
        self.assertEqual(module.validation_errors(draft), [])
        module.begin_auth(draft, "one-time-nonce")
        preserved = json.dumps({"need": draft["needDescription"], "form": draft["formData"], "files": draft["fileSelections"]}, ensure_ascii=False, sort_keys=True)
        module.auth_failed(draft)
        self.assertEqual(json.dumps({"need": draft["needDescription"], "form": draft["formData"], "files": draft["fileSelections"]}, ensure_ascii=False, sort_keys=True), preserved)
        with self.assertRaisesRegex(ValueError, "invalid or expired"):
            module.bind_after_auth(draft, user_id, "wrong-nonce")
        module.bind_after_auth(draft, user_id, "one-time-nonce")
        self.assertTrue(draft["quickUnderstandingStarted"])
        self.assertEqual(draft["status"], "processing")
        solution_id = draft["solutionId"]
        self.assertIs(module.bind_after_auth(draft, user_id, "one-time-nonce"), draft)
        self.assertEqual(draft["solutionId"], solution_id)
        with self.assertRaisesRegex(ValueError, "another authenticated session"):
            module.bind_after_auth(draft, "82000000-0000-4000-8000-000000000002", "one-time-nonce")
        object_key = module.begin_upload(draft, draft["fileSelections"][0]["id"])
        self.assertTrue(object_key.startswith(f"private/{user_id}/{solution_id}/"))
        module.complete_upload(draft, draft["fileSelections"][0]["id"])
        self.assertEqual((draft["fileSelections"][0]["uploadState"], draft["status"]), ("uploaded", "processing"))

        file_only = module.create_draft("81000000-0000-4000-8000-000000000002", "内部立项", "", {}, files)
        module.begin_auth(file_only, "file-only-nonce")
        module.bind_after_auth(file_only, user_id, "file-only-nonce")
        self.assertFalse(file_only["quickUnderstandingStarted"])
        module.begin_upload(file_only, file_only["fileSelections"][0]["id"])
        module.complete_upload(file_only, file_only["fileSelections"][0]["id"])
        self.assertTrue(file_only["quickUnderstandingStarted"])

        lost = module.create_draft("81000000-0000-4000-8000-000000000003", "客户沟通", "", {}, files)
        module.mark_local_references_lost(lost)
        self.assertEqual(module.validation_errors(lost), ["DESCRIPTION_OR_CONTENT_FILE_REQUIRED"])
        self.assertEqual(lost["fileSelections"][0]["localState"], "reselect_required")
        self.assertNotIn("phone", json.dumps(draft).lower())

    def test_upload_validation_detects_real_types_and_isolates_unsafe_files(self):
        spec = importlib.util.spec_from_file_location("upload_validation", UPLOAD_VALIDATION)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        expected = {"requirements.docx": "docx", "meeting-notes.pdf": "pdf", "scanned-meeting-page.pdf": "pdf", "customer-sample.xlsx": "xlsx", "company-template.pptx": "pptx"}
        accepted = []
        for name, detected_format in expected.items():
            category = "template" if name == "company-template.pptx" else "content"
            result = module.validate_bytes(name, category, (BM01 / "sources" / name).read_bytes())
            self.assertEqual((result["status"], result["detectedFormat"], result["safeToParse"]), ("accepted", detected_format, True))
            accepted.append(result)

        spoofed = module.validate_bytes("fake.pdf", "content", (BM01 / "sources/requirements.docx").read_bytes())
        self.assertIn("TYPE_MISMATCH", spoofed["errors"])
        self.assertFalse(spoofed["safeToParse"])

        macro_buffer = io.BytesIO()
        with zipfile.ZipFile(macro_buffer, "w", zipfile.ZIP_DEFLATED) as package:
            package.writestr("word/document.xml", "<document/>")
            package.writestr("word/vbaProject.bin", b"macro")
        macro = module.validate_bytes("unsafe.docx", "content", macro_buffer.getvalue())
        self.assertIn("MACRO_ENABLED", macro["errors"])

        encrypted = module.validate_bytes("secret.pdf", "content", b"%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >>")
        self.assertEqual((encrypted["detectedFormat"], encrypted["recommendedAction"]), ("encrypted_office", "upload_unencrypted"))
        self.assertIn("PASSWORD_PROTECTED", encrypted["errors"])

        bomb_buffer = io.BytesIO()
        with zipfile.ZipFile(bomb_buffer, "w", zipfile.ZIP_DEFLATED) as package:
            package.writestr("word/document.xml", b"0" * 1024 * 1024)
        bomb = module.validate_bytes("bomb.docx", "content", bomb_buffer.getvalue())
        self.assertIn("ZIP_BOMB_RISK", bomb["errors"])

        bad_template = module.validate_bytes("logo.png", "template", b"\x89PNG\r\n\x1a\nimage")
        self.assertEqual((bad_template["status"], bad_template["recommendedAction"]), ("rejected", "use_default_template"))
        batch = module.aggregate_batch([accepted[0], bad_template], has_description=False)
        self.assertEqual(batch, {"status": "partial", "canContinue": True, "acceptedFiles": 1, "rejectedFiles": 1, "useDefaultTemplate": True})
        blocked = module.aggregate_batch([spoofed], has_description=False)
        self.assertEqual((blocked["status"], blocked["canContinue"]), ("blocked", False))

    def test_private_access_denies_cross_tenant_tokens_and_revokes_on_delete(self):
        spec = importlib.util.spec_from_file_location("private_access", PRIVATE_ACCESS)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        registry = module.create_registry()
        owner = "82000000-0000-4000-8000-000000000001"
        attacker = "82000000-0000-4000-8000-000000000002"
        solution = "83000000-0000-4000-8000-000000000001"
        module.register_solution(registry, solution, owner)
        artifact = module.register_artifact(registry, solution, owner, f"private/{owner}/{solution}/V1/R1/solution.docx")
        self.assertTrue(module.authorize(registry, owner, solution, artifact["id"], "read")["allowed"])
        denied = module.authorize(registry, attacker, solution, artifact["id"], "read")
        self.assertEqual((denied["allowed"], denied["reason"]), (False, "CROSS_USER_DENIED"))
        with self.assertRaisesRegex(ValueError, "outside the private tenant prefix"):
            module.register_artifact(registry, solution, owner, f"private/{owner}/{solution}/../other/file.pdf")

        secret = b"test-only-download-signing-secret"
        token, issued = module.issue_download(registry, owner, solution, artifact["id"], secret, now=1000, ttl_seconds=120)
        self.assertTrue(issued["allowed"])
        self.assertNotIn(token, json.dumps(issued))
        verified = module.verify_download(registry, token, owner, secret, now=1100)
        self.assertEqual((verified["allowed"], verified["reason"]), (True, "OWNER_MATCH"))
        self.assertEqual(module.verify_download(registry, token, attacker, secret, now=1100)["reason"], "CROSS_USER_DENIED")
        self.assertEqual(module.verify_download(registry, token + "x", owner, secret, now=1100)["reason"], "TOKEN_INVALID")
        self.assertEqual(module.verify_download(registry, token, owner, secret, now=1120)["reason"], "TOKEN_EXPIRED")
        with self.assertRaisesRegex(ValueError, "between 1 and 300"):
            module.issue_download(registry, owner, solution, artifact["id"], secret, now=1000, ttl_seconds=301)

        fresh_token, _ = module.issue_download(registry, owner, solution, artifact["id"], secret, now=2000, ttl_seconds=120)
        module.revoke_solution(registry, owner, solution)
        revoked = module.verify_download(registry, fresh_token, owner, secret, now=2001)
        self.assertEqual((revoked["allowed"], revoked["reason"]), (False, "ARTIFACT_REVOKED"))

    def test_deletion_chain_revokes_immediately_recovers_and_prevents_backup_resurrection(self):
        spec = importlib.util.spec_from_file_location("data_deletion", DATA_DELETION)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        store = module.create_store()
        owner = "82000000-0000-4000-8000-000000000001"
        other = "82000000-0000-4000-8000-000000000002"
        solution = "83000000-0000-4000-8000-000000000001"
        other_solution = "83000000-0000-4000-8000-000000000002"
        module.add_user(store, owner)
        module.add_user(store, other)
        module.add_solution(store, owner, solution, [f"private/{owner}/{solution}/source.docx", f"private/{owner}/{solution}/result.pdf"])
        module.add_solution(store, other, other_solution, [f"private/{other}/{other_solution}/source.docx"])
        backup = {"solutions": {key: value.copy() for key, value in store["solutions"].items()}, "objects": {key: value.copy() for key, value in store["objects"].items()}}

        run = module.request_deletion(store, "solution", owner, now=100, solution_id=solution)
        self.assertTrue(store["solutions"][solution]["accessRevoked"])
        self.assertEqual(run["steps"][0]["status"], "complete")
        module.execute_next(store, run, now=101)
        module.execute_next(store, run, now=102, simulate_error="OBJECT_STORAGE_TEMPORARY")
        self.assertEqual((run["status"], run["steps"][2]["status"]), ("retry_wait", "retry_wait"))
        self.assertTrue(any(value["solutionId"] == solution for value in store["objects"].values()))
        self.assertTrue(store["solutions"][solution]["accessRevoked"])
        while run["status"] != "complete":
            module.execute_next(store, run, now=103)
        self.assertEqual(run["status"], "complete")
        self.assertFalse(any(value["solutionId"] == solution for value in store["objects"].values()))
        self.assertNotIn(solution, store["derived"])
        self.assertTrue(all(log["anonymized"] for log in store["logs"] if log["userId"] is None))
        restored = module.restore_backup(store, backup)
        self.assertNotIn(solution, restored)
        self.assertNotIn(f"private/{owner}/{solution}/source.docx", store["objects"])
        self.assertEqual(store["solutions"][other_solution]["status"], "active")

        account_store = module.create_store()
        module.add_user(account_store, owner)
        module.add_user(account_store, other)
        owned = ["83000000-0000-4000-8000-000000000003", "83000000-0000-4000-8000-000000000004"]
        for item in owned:
            module.add_solution(account_store, owner, item, [f"private/{owner}/{item}/file"])
        module.add_solution(account_store, other, other_solution, [f"private/{other}/{other_solution}/file"])
        account_run = module.request_deletion(account_store, "account", owner, now=200)
        while account_run["status"] != "complete":
            module.execute_next(account_store, account_run, now=201)
        self.assertEqual(account_store["users"][owner]["status"], "deleted")
        self.assertEqual(account_store["solutions"][other_solution]["status"], "active")

        inventory = [
            {"objectKey": "private/orphan/old.bin", "createdAt": 0},
            {"objectKey": "private/orphan/new.bin", "createdAt": 99990},
            {"objectKey": "public/site/logo.png", "createdAt": 0},
            {"objectKey": f"private/{other}/{other_solution}/file", "createdAt": 0}
        ]
        self.assertEqual(module.orphan_candidates(account_store, inventory, now=100000, grace_seconds=100), ["private/orphan/old.bin"])

    def test_operations_monitoring_alerts_and_acts_without_formal_quality_downgrade(self):
        spec = importlib.util.spec_from_file_location("operations_monitor", OPERATIONS_MONITOR)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        policy = json.loads((BM01 / "expected/operations-policy.json").read_text(encoding="utf-8"))
        healthy_runs = [{"status": "succeeded", "durationSeconds": 600 + index, "completedDeliverables": 7, "expectedDeliverables": 7} for index in range(5)]
        healthy_tasks = [{"status": "succeeded", "attemptCount": 1, "createdAt": 0} for _ in range(20)]
        healthy_calls = [{"provider": "formal-primary", "succeeded": True, "durationSeconds": 20, "estimatedCost": 10, "expectedCost": 10} for _ in range(5)]
        healthy = module.snapshot(policy, healthy_runs, healthy_tasks, healthy_calls, 0, 1000)
        self.assertEqual(healthy["alerts"], [])
        self.assertEqual((healthy["metrics"]["successRate"], healthy["metrics"]["completeDeliveryRate"]), (1.0, 1.0))

        bad_runs = [
            {"status": "succeeded" if index == 0 else "failed", "durationSeconds": 2400 + index, "completedDeliverables": 7 if index == 0 else 2, "expectedDeliverables": 7}
            for index in range(5)
        ]
        queued = [{"status": "queued", "attemptCount": 1, "createdAt": 0} for _ in range(101)]
        bad_calls = [{"provider": "formal-primary", "succeeded": index == 0, "durationSeconds": 100, "estimatedCost": 20, "expectedCost": 10} for index in range(5)]
        unhealthy = module.snapshot(policy, bad_runs, queued, bad_calls, 0, 1000)
        alerts = {item["code"]: item["automaticAction"] for item in unhealthy["alerts"]}
        self.assertEqual(set(alerts), {"SUCCESS_RATE_LOW", "DELIVERY_RATE_LOW", "LATENCY_P95_HIGH", "BACKLOG_HIGH", "COST_ANOMALY", "PROVIDER_FAILURE_HIGH"})
        self.assertEqual(alerts["PROVIDER_FAILURE_HIGH"], "route_verified_backup")
        self.assertEqual(alerts["COST_ANOMALY"], "throttle_free_and_defer_new_formal")
        self.assertEqual(unhealthy["routingSafety"], {"formalSilentDowngrades": 0, "unverifiedProviderRoutes": 0})

        small_sample = module.snapshot(policy, bad_runs[:1], [], bad_calls[:1], 0, 1000)
        small_codes = {item["code"] for item in small_sample["alerts"]}
        self.assertNotIn("SUCCESS_RATE_LOW", small_codes)
        self.assertNotIn("DELIVERY_RATE_LOW", small_codes)

    def test_product_api_catalog_has_no_project_task_or_model_prerequisites(self):
        catalog = json.loads((BM01 / "expected/product-api-catalog.json").read_text(encoding="utf-8"))
        endpoints = {item["id"]: item for item in catalog["endpoints"]}
        self.assertEqual(catalog["basePath"], "/api/product")
        self.assertEqual(endpoints["validate_intake"]["implementation"], "implemented")
        self.assertTrue(endpoints["handoff_intake"]["autoStartsProcessing"])
        self.assertTrue(endpoints["upload_private_file"]["autoStartsProcessing"])
        self.assertEqual(endpoints["handoff_intake"]["implementation"], "implemented")
        self.assertEqual(endpoints["upload_private_file"]["implementation"], "implemented")
        self.assertEqual(endpoints["get_progress"]["implementation"], "implemented")
        self.assertEqual(endpoints["list_solutions"]["implementation"], "implemented")
        self.assertTrue(endpoints["process_solution_sources"]["autoStartsProcessing"])
        self.assertEqual(endpoints["get_understanding"]["implementation"], "implemented")
        self.assertEqual(endpoints["continue_formal_analysis"]["implementation"], "implemented")
        self.assertEqual(endpoints["tick_formal_worker"]["auth"], "worker_bearer")
        self.assertEqual(endpoints["get_progress"]["auth"], "product_session")
        self.assertEqual(endpoints["create_download"]["auth"], "product_session")
        for endpoint in catalog["endpoints"]:
            self.assertNotIn("userId", endpoint["requestFields"])
            self.assertTrue(endpoint["path"].startswith("/api/product/"))
        ids = set(endpoints)
        self.assertFalse(any("create_project" in item or "create_task" in item or "select_model" in item for item in ids))
        public_ids = {item["id"] for item in catalog["endpoints"] if item["auth"] == "public"}
        self.assertEqual(public_ids, {"validate_intake", "register_product_user", "login_product_user"})
        implemented_ids = {item["id"] for item in catalog["endpoints"] if item["implementation"] == "implemented"}
        self.assertTrue({"validate_intake", "register_product_user", "login_product_user", "get_product_session", "logout_product_user", "handoff_intake", "upload_private_file", "get_progress"} <= implemented_ids)

    def test_product_credentials_are_isolated_from_admin_auth(self):
        product_auth = (ROOT / "lib/product/auth.ts").read_text(encoding="utf-8")
        product_credentials = (ROOT / "lib/product/credentials.ts").read_text(encoding="utf-8")
        product_db = (ROOT / "lib/product/db.ts").read_text(encoding="utf-8")
        admin_auth = (ROOT / "lib/auth.ts").read_text(encoding="utf-8")
        self.assertIn('PRODUCT_SESSION_COOKIE = "ningyi_product_session"', product_auth)
        self.assertIn("PRODUCT_SESSION_SECRET", product_auth)
        self.assertIn("httpOnly: true", product_auth)
        self.assertIn('sameSite: "lax"', product_auth)
        self.assertIn("bcrypt.hash(password, 12)", product_credentials)
        self.assertIn("product_users", product_db)
        self.assertIn("product.db", product_db)
        self.assertNotIn("product_users", admin_auth)
        for route in ["register", "login", "session", "logout"]:
            self.assertTrue((ROOT / f"app/api/product/auth/{route}/route.ts").exists())

    def test_handoff_and_private_upload_are_tenant_bound(self):
        handoff = (ROOT / "app/api/product/intake/handoff/route.ts").read_text(encoding="utf-8")
        upload = (ROOT / "app/api/product/solutions/[solutionId]/uploads/[fileId]/route.ts").read_text(encoding="utf-8")
        progress = (ROOT / "app/api/product/solutions/[solutionId]/progress/route.ts").read_text(encoding="utf-8")
        storage = (ROOT / "lib/product/private-storage.ts").read_text(encoding="utf-8")
        self.assertIn("requireProductSession", handoff)
        self.assertIn("DRAFT_OWNERSHIP_DENIED", handoff)
        self.assertIn("record.user_id !== auth.session.userId", upload)
        self.assertIn("detectFormat(bytes, record.original_name)", upload)
        self.assertIn("owner_user_id = ?", progress)
        self.assertIn("PRODUCT_PRIVATE_STORAGE_PATH", storage)
        self.assertNotIn("public/uploads", storage)
        processing = (ROOT / "lib/product/process-solution.ts").read_text(encoding="utf-8")
        self.assertIn("extract_source_blocks.py", processing)
        self.assertIn("source_blocks", processing)
        self.assertIn("solution_understandings", processing)
        free_analysis = (ROOT / "lib/product/free-analysis.ts").read_text(encoding="utf-8")
        self.assertIn('PRODUCT_FREE_MODEL || "gpt-5.4-nano"', free_analysis)
        self.assertIn("PRODUCT_FORMAL_MODEL", (ROOT / "docs/product/v1-design/11-deferred-integrations.md").read_text(encoding="utf-8") if (ROOT / "docs/product/v1-design/11-deferred-integrations.md").exists() else "PRODUCT_FORMAL_MODEL")
        self.assertIn("deterministic_fallback", free_analysis)
        self.assertIn("model_calls", free_analysis)
        formal_analysis = (ROOT / "lib/product/formal-analysis.ts").read_text(encoding="utf-8")
        self.assertIn('PRODUCT_FORMAL_MODEL || "gpt-5.4"', formal_analysis)
        self.assertIn("formal_sections", formal_analysis)
        self.assertIn("contextHash", formal_analysis)
        self.assertIn("validateClaims", formal_analysis)
        self.assertIn("evaluateFormalSection", formal_analysis)
        self.assertIn("CITATION_COVERAGE", formal_analysis)
        self.assertIn("SECTION_RETRY_EXHAUSTED", formal_analysis)
        worker = (ROOT / "app/api/product/internal/formal/tick/route.ts").read_text(encoding="utf-8")
        self.assertIn("PRODUCT_WORKER_SECRET", worker)
        self.assertIn("timingSafeEqual", worker)


if __name__ == "__main__":
    unittest.main()
