import JSZip from "jszip";

export function validatePackageContentVersion(artifacts: Array<{ contentVersion: number }>) {
  const contentVersions = [...new Set(artifacts.map((artifact) => artifact.contentVersion))];
  return {
    passed: contentVersions.length <= 1,
    contentVersion: contentVersions[0] ?? null,
    contentVersions,
  };
}

const officeParts: Record<string, Array<{ path: string; root: string }>> = {
  docx: [
    { path: "[Content_Types].xml", root: "Types" },
    { path: "word/document.xml", root: "document" },
  ],
  xlsx: [
    { path: "[Content_Types].xml", root: "Types" },
    { path: "xl/workbook.xml", root: "workbook" },
    { path: "xl/worksheets/sheet1.xml", root: "worksheet" },
  ],
  pptx: [
    { path: "[Content_Types].xml", root: "Types" },
    { path: "ppt/presentation.xml", root: "presentation" },
    { path: "ppt/slides/slide1.xml", root: "sld" },
  ],
};

export async function validateDeliverablePackage(bytes: Buffer, format: string) {
  if (format === "pdf") {
    const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1").trimEnd();
    const passed = bytes.subarray(0, 5).toString("ascii") === "%PDF-" && tail.endsWith("%%EOF");
    return { passed, code: passed ? "PACKAGE_VALID" : "PDF_TRAILER_INVALID" };
  }

  const required = officeParts[format];
  if (!required) return { passed: false, code: "FORMAT_NOT_SUPPORTED" };
  try {
    const archive = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
    for (const part of required) {
      const file = archive.file(part.path);
      if (!file) return { passed: false, code: "OOXML_REQUIRED_PART_MISSING" };
      const xml = await file.async("string");
      if (!hasExpectedRoot(xml, part.root)) return { passed: false, code: "OOXML_REQUIRED_XML_INVALID" };
    }
    return { passed: true, code: "PACKAGE_VALID" };
  } catch {
    return { passed: false, code: "OOXML_ARCHIVE_INVALID" };
  }
}

function hasExpectedRoot(xml: string, expectedRoot: string) {
  const escaped = expectedRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}(?:\\s|>)`);
  const closing = new RegExp(`</(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}\\s*>\\s*$`);
  return opening.test(xml) && closing.test(xml.trim());
}
