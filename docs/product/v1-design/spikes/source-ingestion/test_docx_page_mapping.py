import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("extract_source_blocks.py")
SPEC = importlib.util.spec_from_file_location("source_extractor", SCRIPT)
EXTRACTOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(EXTRACTOR)


class DocxPageMappingTests(unittest.TestCase):
    def test_maps_unique_rendered_text_and_marks_duplicates_ambiguous(self):
        with tempfile.TemporaryDirectory() as temporary:
            docx_path = Path(temporary) / "fixture.docx"
            docx_path.write_bytes(b"fixture")
            blocks = [
                EXTRACTOR.make_block(source_path="fixture.docx", source_format="docx", file_sha="a" * 64,
                    block_type="paragraph", locator={"page": None, "paragraph": 1},
                    text="This unique paragraph is available on exactly one rendered page.", parser_name="test"),
                EXTRACTOR.make_block(source_path="fixture.docx", source_format="docx", file_sha="a" * 64,
                    block_type="paragraph", locator={"page": None, "paragraph": 2},
                    text="Repeated footer text appears on every page.", parser_name="test"),
            ]

            def fake_run(command, **kwargs):
                if command[0] == "soffice":
                    output_dir = Path(command[command.index("--outdir") + 1])
                    (output_dir / "fixture.pdf").write_bytes(b"rendered")
                    return subprocess.CompletedProcess(command, 0, b"", b"")
                return subprocess.CompletedProcess(command, 0, b"Cover\fThis unique paragraph is available on exactly one rendered page.\fRepeated footer text appears on every page.\fRepeated footer text appears on every page.\f", b"")

            with patch.object(EXTRACTOR.subprocess, "run", side_effect=fake_run):
                EXTRACTOR.map_docx_pages(blocks, docx_path, "soffice", "pdftotext")

        self.assertEqual(blocks[0]["locator"]["page"], 2)
        self.assertEqual(blocks[0]["structuredData"]["pageMapping"], "full_text")
        self.assertNotIn("page_not_available_from_ooxml", blocks[0]["warnings"])
        self.assertEqual(blocks[1]["structuredData"]["pageMapping"], "ambiguous")
        self.assertIn("page_mapping_ambiguous", blocks[1]["warnings"])


if __name__ == "__main__":
    unittest.main()
