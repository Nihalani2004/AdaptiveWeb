import os
import sys
import unittest
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
os.environ.setdefault("GEMINI_API_KEY", "test-key-not-used")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from main import parse_cors_origins, parse_port  # noqa: E402


class BackendConfigurationTests(unittest.TestCase):
    def test_cors_origins_support_a_bounded_comma_separated_environment_value(self):
        self.assertEqual(
            parse_cors_origins("http://localhost:3000, https://app.example.test"),
            ["http://localhost:3000", "https://app.example.test"],
        )
        self.assertEqual(parse_cors_origins(""), ["*"])

    def test_port_parser_accepts_valid_ports_and_rejects_invalid_values(self):
        self.assertEqual(parse_port("8100"), 8100)
        for value in ("not-a-port", "0", "65536"):
            with self.assertRaises(ValueError):
                parse_port(value)


if __name__ == "__main__":
    unittest.main()
