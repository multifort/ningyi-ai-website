import importlib.util
import io
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("extract_source_blocks.py")
SPEC = importlib.util.spec_from_file_location("source_extractor", SCRIPT)
EXTRACTOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(EXTRACTOR)


class PptxDesignMetadataTests(unittest.TestCase):
    def test_resolves_layout_master_theme_palette_and_fonts(self):
        package = io.BytesIO()
        files = {
            "ppt/slides/_rels/slide1.xml.rels": """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
            </Relationships>""",
            "ppt/slideLayouts/_rels/slideLayout1.xml.rels": """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
            </Relationships>""",
            "ppt/slideMasters/_rels/slideMaster1.xml.rels": """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
            </Relationships>""",
            "ppt/slideLayouts/slideLayout1.xml": """<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:nvSpPr/><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr>
                <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="50"/></a:xfrm></p:spPr><p:style><a:fontRef idx="major"><a:schemeClr val="tx1"/></a:fontRef></p:style>
              </p:sp></p:spTree></p:cSld></p:sldLayout>""",
            "ppt/slideMasters/slideMaster1.xml": """<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sldMaster>""",
            "ppt/theme/theme1.xml": """<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements>
              <a:clrScheme name="Example"><a:dk1><a:sysClr val="windowText" lastClr="1F2937"/></a:dk1><a:accent1><a:srgbClr val="2563EB"/></a:accent1></a:clrScheme>
              <a:fontScheme name="Example"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Noto Sans CJK SC"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>
            </a:themeElements></a:theme>""",
        }
        with zipfile.ZipFile(package, "w") as archive:
            for name, content in files.items():
                archive.writestr(name, content)
        package.seek(0)
        with zipfile.ZipFile(package) as archive:
            design = EXTRACTOR.pptx_slide_design(archive, "ppt/slides/slide1.xml", (1000, 500))
        self.assertEqual(design["slideLayout"], "ppt/slideLayouts/slideLayout1.xml")
        self.assertEqual(design["slideMaster"], "ppt/slideMasters/slideMaster1.xml")
        self.assertEqual(design["themeTokens"]["colors"]["accent1"], "2563EB")
        self.assertEqual(design["themeTokens"]["fonts"]["majorFont"]["latin"], "Aptos Display")
        self.assertEqual(design["themeTokens"]["fonts"]["majorFont"]["eastAsian"], "Noto Sans CJK SC")
        self.assertEqual(design["layoutPlaceholders"][0]["type"], "title")
        self.assertEqual(design["layoutPlaceholders"][0]["styleReferences"]["fontRef"]["schemeColor"], "tx1")


if __name__ == "__main__":
    unittest.main()
