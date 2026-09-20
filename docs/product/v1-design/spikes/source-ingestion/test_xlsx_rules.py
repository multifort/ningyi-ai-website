import importlib.util
import io
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


SCRIPT = Path(__file__).with_name("extract_source_blocks.py")
SPEC = importlib.util.spec_from_file_location("source_extractor", SCRIPT)
EXTRACTOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(EXTRACTOR)


class XlsxRuleExtractionTests(unittest.TestCase):
    def test_data_validation_preserves_range_constraints_and_messages(self):
        root = ET.fromstring("""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B2:B20" error="Choose a listed value.">
            <formula1>Lists!$A$2:$A$8</formula1>
          </dataValidation></dataValidations>
        </worksheet>""")
        blocks = EXTRACTOR.extract_xlsx_rules(root, "Inputs", "fixture.xlsx", "a" * 64)
        self.assertEqual(len(blocks), 1)
        block = blocks[0]
        self.assertEqual(block["locator"]["cellRange"], "B2:B20")
        self.assertEqual(block["structuredData"]["elementType"], "data_validation")
        self.assertEqual(block["structuredData"]["formula1"], "Lists!$A$2:$A$8")
        self.assertEqual(block["structuredData"]["error"], "Choose a listed value.")

    def test_conditional_formatting_preserves_priority_and_formulas(self):
        root = ET.fromstring("""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <conditionalFormatting sqref="C2:C20"><cfRule type="cellIs" dxfId="3" priority="2" operator="greaterThan" stopIfTrue="1">
            <formula>100</formula>
          </cfRule></conditionalFormatting>
        </worksheet>""")
        blocks = EXTRACTOR.extract_xlsx_rules(root, "Metrics", "fixture.xlsx", "b" * 64)
        self.assertEqual(len(blocks), 1)
        block = blocks[0]
        self.assertEqual(block["locator"]["cellRange"], "C2:C20")
        self.assertEqual(block["structuredData"]["elementType"], "conditional_formatting")
        self.assertEqual(block["structuredData"]["rules"][0]["priority"], 2)
        self.assertEqual(block["structuredData"]["rules"][0]["formulas"], ["100"])

    def test_pivot_metadata_resolves_fields_and_source_range(self):
        package = io.BytesIO()
        files = {
            "xl/worksheets/_rels/sheet1.xml.rels": """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rPivot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/>
            </Relationships>""",
            "xl/pivotTables/pivotTable1.xml": """<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="SalesSummary" cacheId="1">
              <location ref="A3:D12"/><pivotFields><pivotField axis="axisRow"/><pivotField axis="axisCol"/><pivotField/><pivotField/></pivotFields>
              <rowFields><field x="0"/></rowFields><colFields><field x="1"/></colFields><pageFields><pageField fld="2"/></pageFields>
              <dataFields><dataField name="Total Amount" fld="3" subtotal="sum"/></dataFields>
            </pivotTableDefinition>""",
            "xl/pivotTables/_rels/pivotTable1.xml.rels": """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rCache" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="../pivotCache/pivotCacheDefinition1.xml"/>
            </Relationships>""",
            "xl/pivotCache/pivotCacheDefinition1.xml": """<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <cacheSource type="worksheet"><worksheetSource ref="A1:D50" sheet="RawData"/></cacheSource>
              <cacheFields count="4"><cacheField name="Region"/><cacheField name="Quarter"/><cacheField name="Status"/><cacheField name="Amount"/></cacheFields>
            </pivotCacheDefinition>""",
        }
        with zipfile.ZipFile(package, "w") as archive:
            for name, content in files.items():
                archive.writestr(name, content)
        package.seek(0)
        with zipfile.ZipFile(package) as archive:
            blocks = EXTRACTOR.extract_xlsx_pivots(archive, ET.Element("worksheet"), "xl/worksheets/sheet1.xml", "Summary", "fixture.xlsx", "c" * 64)
        self.assertEqual(len(blocks), 1)
        data = blocks[0]["structuredData"]
        self.assertEqual(data["name"], "SalesSummary")
        self.assertEqual(data["cellRange"], "A3:D12")
        self.assertEqual(data["sourceSheet"], "RawData")
        self.assertEqual(data["sourceRange"], "A1:D50")
        self.assertEqual(data["rowFields"], ["Region"])
        self.assertEqual(data["columnFields"], ["Quarter"])
        self.assertEqual(data["pageFields"], ["Status"])
        self.assertEqual(data["dataFields"][0]["sourceField"], "Amount")


if __name__ == "__main__":
    unittest.main()
