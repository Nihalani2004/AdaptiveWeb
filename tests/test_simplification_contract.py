import json
import asyncio
import os
import sys
import unittest
import warnings
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

warnings.filterwarnings("ignore")
os.environ.setdefault("GEMINI_API_KEY", "test-key-not-used")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import main  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from main import build_local_simplification, parse_simplification_response, simplify_text  # noqa: E402
from models import SimplifyRequest  # noqa: E402


SOURCE = (
    "On 15 August 2025, Adaptive Web processed 42 records in New Delhi. "
    "The result applies only when the consent condition is satisfied."
)


class SimplificationContractTests(unittest.TestCase):
    def test_valid_structured_result_is_bounded_and_preserves_critical_facts(self):
        payload = {
            "simplified": (
                "Adaptive Web processed 42 records in New Delhi on 15 August 2025. "
                "This applies only when the consent condition is satisfied."
            ),
            "keyTerms": [{"term": "consent", "meaning": "Permission required by the stated condition."}],
            "example": "The condition must be satisfied before the result applies.",
            "warnings": [],
        }
        result = parse_simplification_response(json.dumps(payload), SOURCE, "simplify")
        self.assertEqual(result["method"], "gemini_structured")
        self.assertTrue(result["structured"])
        self.assertIn("42", result["simplified"])
        self.assertIn("New Delhi", result["simplified"])

    def test_missing_numbers_or_names_rejects_model_output(self):
        payload = {
            "simplified": "Some records were processed, and a consent condition applies.",
            "keyTerms": [],
            "example": "",
            "warnings": [],
        }
        result = parse_simplification_response(json.dumps(payload), SOURCE, "simplify")
        self.assertEqual(result["method"], "local_fallback_validation")
        self.assertIn("42 records", result["simplified"])
        self.assertIn("New Delhi", result["simplified"])

    def test_invalid_json_uses_complete_non_inventive_fallback(self):
        result = parse_simplification_response("not json", SOURCE, "terms")
        self.assertEqual(result["method"], "local_fallback_parse")
        self.assertEqual(result["mode"], "terms")
        self.assertIn(SOURCE.split(". ")[0], result["simplified"])
        self.assertIn("without invented definitions", result["warnings"][0])

    def test_local_fallback_supports_each_user_selected_mode(self):
        for mode in ("simplify", "terms", "example"):
            with self.subTest(mode=mode):
                result = build_local_simplification(SOURCE, mode)
                self.assertEqual(result["mode"], mode)
                self.assertEqual(result["originalLength"], len(SOURCE))
                self.assertTrue(result["simplified"])
                self.assertLessEqual(len(result["keyTerms"]), 5)

    def test_endpoint_returns_validated_gemini_contract_for_selected_mode(self):
        model_payload = json.dumps({
            "simplified": (
                "Adaptive Web processed 42 records in New Delhi on 15 August 2025. "
                "This applies only when the consent condition is satisfied."
            ),
            "keyTerms": [{"term": "consent", "meaning": "The required permission."}],
            "example": "The consent condition must be met first.",
            "warnings": [],
        })
        main.RESPONSE_CACHE.clear()
        with patch.object(main.model, "generate_content", return_value=SimpleNamespace(text=model_payload)):
            result = asyncio.run(simplify_text(SimplifyRequest(text=SOURCE, mode="terms")))
        self.assertEqual(result["method"], "gemini_structured")
        self.assertEqual(result["mode"], "terms")
        self.assertEqual(result["keyTerms"][0]["term"], "consent")

    def test_endpoint_failure_is_labeled_local_and_does_not_truncate(self):
        main.RESPONSE_CACHE.clear()
        with patch.object(main.model, "generate_content", side_effect=RuntimeError("offline")):
            result = asyncio.run(simplify_text(SimplifyRequest(text=SOURCE, mode="example")))
        self.assertEqual(result["method"], "local_fallback_error")
        self.assertIn("42 records", result["simplified"])
        self.assertIn("New Delhi", result["simplified"])

    def test_endpoint_rejects_unknown_modes(self):
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(simplify_text(SimplifyRequest(text=SOURCE, mode="unsupported")))
        self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
