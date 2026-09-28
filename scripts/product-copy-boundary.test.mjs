import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const publicProductComponents = ["DemoShowcase.tsx", "SolutionTabs.tsx"];

test("公开产品文案不暗示项目人员参与正式交付", () => {
  const componentRoot = path.join(process.cwd(), "app", "components");
  const content = publicProductComponents
    .map((filename) => fs.readFileSync(path.join(componentRoot, filename), "utf8"))
    .join("\n");

  assert.doesNotMatch(content, /(由|与)项目人员确认/u);
  assert.match(content, /关键方向由用户确认/u);
  assert.match(content, /成本依据与待确认方向/u);
});
