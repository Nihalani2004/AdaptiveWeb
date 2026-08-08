import json
import os
import sys
import unittest
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
os.environ.setdefault("GEMINI_API_KEY", "test-key-not-used")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from main import parse_suggestion_response  # noqa: E402


def cursor_context():
    return json.dumps({
        "schemaVersion": 2,
        "availableActions": [
            {
                "targetId": "target-1",
                "label": "Read details",
                "capabilities": ["highlight", "focus", "activate"],
            },
            {
                "targetId": "target-2",
                "label": "Purchase now",
                "capabilities": ["highlight", "activate"],
            },
        ],
    })


class SuggestionContractTests(unittest.TestCase):
    def test_valid_json_is_grounded_and_bounded(self):
        content = json.dumps({
            "summary": "The details link is the clearest next step.",
            "actions": [{
                "label": "Open details",
                "description": "Read the supporting information.",
                "actionType": "activate",
                "targetId": "target-1",
                "confidence": 1.7,
            }],
        })
        result = parse_suggestion_response(content, cursor_context())
        self.assertTrue(result["structured"])
        self.assertEqual(result["actions"][0]["targetId"], "target-1")
        self.assertEqual(result["actions"][0]["actionType"], "activate")
        self.assertTrue(result["actions"][0]["requiresConfirmation"])
        self.assertEqual(result["actions"][0]["confidence"], 1.0)

    def test_markdown_json_fences_are_supported(self):
        content = "```json\n" + json.dumps({
            "summary": "Review the details.",
            "actions": [{"label": "Show details", "targetId": "target-1", "actionType": "highlight"}],
        }) + "\n```"
        result = parse_suggestion_response(content, cursor_context())
        self.assertEqual(result["actions"][0]["label"], "Show details")

    def test_unknown_targets_and_action_types_cannot_execute(self):
        content = json.dumps({
            "actions": [{
                "label": "Run arbitrary script",
                "description": "Unsafe model output.",
                "actionType": "execute_script",
                "targetId": "invented-target",
            }],
        })
        result = parse_suggestion_response(content, cursor_context())
        self.assertIsNone(result["actions"][0]["targetId"])
        self.assertEqual(result["actions"][0]["actionType"], "highlight")
        self.assertFalse(result["actions"][0]["requiresConfirmation"])

    def test_sensitive_actions_are_coerced_to_highlight(self):
        content = json.dumps({
            "actions": [{
                "label": "Purchase now",
                "description": "Complete the transaction.",
                "actionType": "activate",
                "targetId": "target-2",
            }],
        })
        result = parse_suggestion_response(content, cursor_context())
        self.assertEqual(result["actions"][0]["actionType"], "highlight")
        self.assertFalse(result["actions"][0]["requiresConfirmation"])

    def test_invalid_model_output_uses_grounded_local_fallback(self):
        result = parse_suggestion_response("not json", cursor_context())
        self.assertEqual(result["method"], "local_fallback_parse")
        self.assertGreaterEqual(len(result["actions"]), 1)
        self.assertEqual(result["actions"][0]["targetId"], "target-1")
        self.assertIn(result["actions"][0]["actionType"], {"focus", "highlight"})


if __name__ == "__main__":
    unittest.main()
