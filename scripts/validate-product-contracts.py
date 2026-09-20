#!/usr/bin/env python3
"""Validate the roadmap's foundational, non-benchmark product contracts."""

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print(
        "jsonschema is required for contract validation; install it with "
        "'python3 -m pip install jsonschema'.",
        file=sys.stderr,
    )
    sys.exit(2)


ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "docs/product/v1-design/contracts"
CASES = (
    ("project-model.schema.json", "examples/minimal-project-model.json"),
    ("task-runtime.schema.json", "examples/task-runtime.example.json"),
    ("change-impact-plan.schema.json", "examples/change-impact-plan.example.json"),
)


def main() -> int:
    failures = 0
    for schema_name, example_name in CASES:
        schema_path = CONTRACTS / schema_name
        example_path = CONTRACTS / example_name
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            example = json.loads(example_path.read_text(encoding="utf-8"))
            jsonschema.Draft202012Validator.check_schema(schema)
            validator = jsonschema.Draft202012Validator(
                schema, format_checker=jsonschema.FormatChecker()
            )
            errors = sorted(
                validator.iter_errors(example),
                key=lambda error: (list(map(str, error.absolute_path)), error.message),
            )
        except (OSError, json.JSONDecodeError, jsonschema.SchemaError) as error:
            print(f"FAIL {schema_name}: {error}", file=sys.stderr)
            failures += 1
            continue

        if errors:
            failures += 1
            print(f"FAIL {schema_name} <- {example_name}")
            for error in errors:
                location = ".".join(map(str, error.absolute_path)) or "$"
                print(f"  {location}: {error.message}")
        else:
            print(f"PASS {schema_name} <- {example_name}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
