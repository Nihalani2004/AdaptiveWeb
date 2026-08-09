import json
import os
import sys
import unittest

BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

from main import parse_shortcut_response  # noqa: E402


def shortcut_context():
    return json.dumps({
        "schemaVersion": 2,
        "availableActions": [
            {
                "targetId": "shortcut-target-1",
                "label": "Search",
                "type": "search",
                "capabilities": ["focus"],
            },
            {
                "targetId": "shortcut-target-2",
                "label": "Open details",
                "type": "button",
                "capabilities": ["focus", "activate"],
            },
            {
                "targetId": "shortcut-target-3",
                "label": "Submit payment",
                "type": "button",
                "capabilities": ["focus", "activate"],
            },
        ],
    })


class ShortcutContractTests(unittest.TestCase):
    def test_preserves_grounded_modifier_and_sequence_shortcuts(self):
        result = parse_shortcut_response(json.dumps({"shortcuts": [
            {"key": "Ctrl+Enter", "action": "Open details", "actionType": "activate", "targetId": "shortcut-target-2"},
            {"key": "G then H", "action": "Focus search", "actionType": "focus", "targetId": "shortcut-target-1"},
            {"key": "Alt+Shift+Home", "action": "Go to start", "actionType": "scroll_top", "targetId": None},
        ]}), shortcut_context())
        self.assertEqual(result["shortcuts"][0]["key"], "Ctrl+Enter")
        self.assertEqual(result["shortcuts"][1]["key"], "G then H")
        self.assertEqual(result["shortcuts"][0]["targetId"], "shortcut-target-2")

    def test_rejects_invented_targets_and_fills_with_local_bindings(self):
        result = parse_shortcut_response(json.dumps({"shortcuts": [
            {"key": "X", "action": "Invented", "actionType": "activate", "targetId": "missing"}
        ]}), shortcut_context())
        self.assertGreaterEqual(len(result["shortcuts"]), 3)
        self.assertNotIn("missing", {item.get("targetId") for item in result["shortcuts"]})

    def test_downgrades_sensitive_activation_to_focus(self):
        result = parse_shortcut_response(json.dumps({"shortcuts": [
            {"key": "Ctrl+Enter", "action": "Submit payment", "actionType": "activate", "targetId": "shortcut-target-3"},
            {"key": "Alt+Shift+Home", "action": "Go to start", "actionType": "scroll_top", "targetId": None},
            {"key": "Alt+Shift+End", "action": "Go to end", "actionType": "scroll_bottom", "targetId": None},
        ]}), shortcut_context())
        self.assertEqual(result["shortcuts"][0]["actionType"], "focus")

    def test_invalid_model_output_returns_working_local_fallback(self):
        result = parse_shortcut_response("not json", shortcut_context())
        self.assertEqual(result["method"], "local_fallback_parse")
        self.assertEqual(
            [item["actionType"] for item in result["shortcuts"][:3]],
            ["scroll_top", "scroll_bottom", "toggle_shortcuts"],
        )


if __name__ == "__main__":
    unittest.main()
