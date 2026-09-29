#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = path.join(root, "sources");
const font = path.resolve(process.cwd(), "assets/fonts/NotoSansCJKsc-Regular.otf");
const fixedDate = new Date("2026-09-29T00:00:00.000Z");
await fsp.mkdir(sources, { recursive: true });

await buildSecurityPdf(path.join(sources, "security-requirements.pdf"));
await buildCapacityWorkbook(path.join(sources, "resource-capacity.xlsx"));
await buildTopology(path.join(sources, "network-topology.png"));
await writeManifest();

async function buildSecurityPdf(output) {
  const doc = new PDFDocument({ size: "A4", margins: { top: 54, right: 54, bottom: 54, left: 54 }, info: { Title: "澄川制造私有化部署安全要求（合成材料）", CreationDate: fixedDate, ModDate: fixedDate } });
  doc.registerFont("cjk", font).font("cjk");
  const stream = fs.createWriteStream(output);
  doc.pipe(stream);
  pageTitle(doc, "澄川制造私有化部署安全要求", "SEC-SYN-2026-09 · 合成基准材料");
  section(doc, "1. 部署边界", [
    "系统部署在客户自有数据中心，不使用公有云托管数据库或 AWS S3。对象存储采用客户内网私有 MinIO 集群，通过 S3 兼容 API 接入。",
    "生产、UAT、开发环境使用独立数据库、Bucket、密钥和服务账号；不得跨环境复用访问凭证。",
    "互联网用户只可经双机 WAF 和 API 网关进入应用区；应用区不能直接访问互联网，外部模型调用必须经过审计代理并允许关闭。",
  ]);
  section(doc, "2. 身份、网络与数据", [
    "管理后台接入企业 OIDC，管理员强制 MFA；服务账号使用最小权限并每 90 天轮换。",
    "数据库与 MinIO 位于数据区，只允许应用区和备份区的明确端口访问；运维访问必须经过堡垒机。",
    "传输使用 TLS 1.2 及以上。数据库、备份和 MinIO 服务端加密开启，密钥由客户 KMS 托管。",
    "MinIO Bucket 必须为私有；下载签名 URL 有效期 10 分钟。上传文件先进入 quarantine Bucket，恶意文件扫描通过后才能进入正式 Bucket。",
  ]);
  doc.addPage();
  pageTitle(doc, "可用性、备份与容量要求", "正式方案必须保持数值一致");
  section(doc, "3. 可用性与恢复", [
    "生产应用部署 3 个实例并跨 3 台计算节点；PostgreSQL 采用 2 个数据库节点加 1 个仲裁节点；MinIO 使用 4 节点纠删码集群。",
    "月度可用性目标为 99.9%。数据库目标 RPO 为 15 分钟、RTO 为 2 小时；对象存储目标 RPO 为 1 小时、RTO 为 4 小时。",
    "数据库每周全量、每日增量并持续归档 WAL；MinIO 每日增量复制到备份区。备份保留 35 天，并每季度执行一次恢复演练。",
  ]);
  section(doc, "4. 容量与性能", [
    "一期注册用户 400 人，峰值并发 80 人；每日新增文件 12,000 个，单文件最大 30 MB，日均原始新增量 180 GB。",
    "原始文件在线保留 365 天，归档保留 5 年。容量估算按原始数据 × 1.35 派生与版本系数 × 1.5 MinIO 冗余系数 × 1.2 余量计算。",
    "Web/API 正常排队 P95 不超过 5 秒；突发容量排队 P95 不超过 30 秒。单用户不得占用超过 25% 的 Worker 并发。",
  ]);
  doc.addPage();
  pageTitle(doc, "运营、安全与范围边界", "实施计划和报价须显式列出责任方");
  section(doc, "5. 安全运营", [
    "安全日志在线保留 180 天、归档保留 3 年；认证失败、跨租户访问、恶意文件、密钥读取和删除操作均生成审计事件。",
    "高危漏洞须在 72 小时内完成修复或隔离；中危漏洞在 30 天内处理。每季度复核服务账号、网络白名单和备份恢复证据。",
    "删除任务必须覆盖数据库、正式 Bucket、quarantine Bucket、缓存和备份索引，并保留不可反向恢复的删除墓碑。",
  ]);
  section(doc, "6. 外部成本与首期排除", [
    "资源表中的硬件、KMS、WAF、堡垒机、杀毒引擎、备份介质和专线属于客户采购或第三方成本，软件实施报价必须单独列示，不得默认为已包含。",
    "首期不包含双数据中心双活、跨境数据传输、公共互联网 Bucket、AWS S3、自动购买硬件、自动执行生产扩容和替客户签署等保测评结论。",
  ]);
  doc.end();
  await new Promise((resolve, reject) => stream.on("finish", resolve).on("error", reject));
}

async function buildCapacityWorkbook(output) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ningyi synthetic benchmark";
  workbook.created = fixedDate;
  workbook.modified = fixedDate;
  const resources = workbook.addWorksheet("资源清单", { views: [{ state: "frozen", ySplit: 1 }] });
  resources.columns = [
    { header: "资源层", key: "layer", width: 18 }, { header: "组件", key: "component", width: 26 }, { header: "数量", key: "quantity", width: 10 },
    { header: "单节点 vCPU", key: "cpu", width: 14 }, { header: "单节点内存 GB", key: "memory", width: 16 }, { header: "单节点可用存储 TB", key: "storage", width: 20 },
    { header: "部署说明", key: "note", width: 48 },
  ];
  [
    ["接入区", "WAF/API 网关", 2, 4, 8, 0.2, "双机；仅开放 443"],
    ["应用区", "Web/API", 3, 8, 16, 0.2, "跨 3 台计算节点"],
    ["应用区", "Worker", 4, 16, 32, 0.5, "单用户并发不超过总量 25%"],
    ["数据区", "PostgreSQL", 2, 16, 64, 2, "同步高可用；另设 1 个仲裁节点"],
    ["数据区", "PostgreSQL 仲裁", 1, 2, 4, 0.1, "不得承载业务数据"],
    ["数据区", "私有 MinIO", 4, 16, 64, 24, "4 节点纠删码；私有 Bucket"],
    ["安全区", "恶意文件扫描", 2, 8, 16, 0.5, "quarantine 扫描后转正式 Bucket"],
    ["运维区", "监控与日志", 2, 8, 32, 4, "指标、日志、告警与审计"],
    ["备份区", "备份节点", 1, 8, 32, 80, "数据库、对象和配置备份"],
  ].forEach((values) => resources.addRow(values));
  styleSheet(resources, "A1:G10");

  const capacity = workbook.addWorksheet("容量参数", { views: [{ state: "frozen", ySplit: 1 }] });
  capacity.columns = [{ header: "参数", key: "parameter", width: 34 }, { header: "数值", key: "value", width: 18 }, { header: "单位/公式", key: "unit", width: 42 }, { header: "责任来源", key: "owner", width: 30 }];
  [
    ["一期注册用户", 400, "人", "项目 Intake"], ["峰值并发", 80, "人", "安全要求"], ["每日新增文件", 12000, "个", "安全要求"],
    ["单文件最大值", 30, "MB", "安全要求"], ["日均原始新增量", 180, "GB/日", "安全要求"], ["在线保留", 365, "天", "安全要求"],
    ["派生与版本系数", 1.35, "倍", "容量规则"], ["MinIO 冗余系数", 1.5, "倍", "容量规则"], ["余量系数", 1.2, "倍", "容量规则"],
  ].forEach((values) => capacity.addRow(values));
  capacity.addRow(["一年对象存储原始量", { formula: "B6*B7/1024", result: 64.16015625 }, "TB = 日均 GB × 在线天数 ÷ 1024", "确定性公式"]);
  capacity.addRow(["一年对象存储规划容量", { formula: "B11*B8*B9*B10", result: 155.9091796875 }, "TB = 原始量 × 1.35 × 1.5 × 1.2", "确定性公式"]);
  styleSheet(capacity, "A1:D12");

  const cost = workbook.addWorksheet("外部成本边界", { views: [{ state: "frozen", ySplit: 1 }] });
  cost.columns = [{ header: "类别", key: "category", width: 25 }, { header: "责任方", key: "owner", width: 18 }, { header: "是否含软件实施报价", key: "included", width: 24 }, { header: "说明", key: "note", width: 60 }];
  [
    ["服务器与存储硬件", "客户", "否", "按资源清单采购或复用"], ["KMS/HSM", "客户", "否", "密钥托管与轮换"], ["WAF、堡垒机、杀毒引擎", "客户/第三方", "否", "须提供可调用接口与许可"],
    ["备份介质与异地链路", "客户", "否", "满足 35 天保留和恢复演练"], ["平台软件实施与联调", "实施方", "是", "以正式报价工作包为准"], ["容量扩展", "双方确认", "否", "达到 70% 水位触发评估，不自动采购或扩容"],
  ].forEach((values) => cost.addRow(values));
  styleSheet(cost, "A1:D7");
  for (const sheet of workbook.worksheets) {
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    sheet.pageSetup.printTitlesRow = "1:1";
  }
  await workbook.xlsx.writeFile(output);
  const archive = await JSZip.loadAsync(await fsp.readFile(output));
  for (const entry of Object.values(archive.files)) entry.date = fixedDate;
  await fsp.writeFile(output, await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "DOS" }));
}

async function buildTopology(output) {
  const pdfPath = path.join(sources, ".network-topology.pdf");
  const doc = new PDFDocument({ size: [1600, 1000], margin: 0, info: { Title: "私有化部署网络拓扑（合成材料）", CreationDate: fixedDate, ModDate: fixedDate } });
  doc.registerFont("cjk", font).font("cjk");
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  doc.rect(0, 0, 1600, 1000).fill("#f5f7fb");
  doc.fontSize(40).fillColor("#102a43").text("私有化部署网络拓扑（合成材料）", 80, 55);
  drawZone(doc, 60, 140, 300, 720, "互联网/办公网", "#dbeafe"); drawZone(doc, 390, 140, 330, 720, "接入与应用区", "#dcfce7"); drawZone(doc, 750, 140, 420, 720, "数据区", "#fef3c7"); drawZone(doc, 1200, 140, 330, 720, "运维与备份区", "#ede9fe");
  drawBox(doc, 100, 230, 220, 90, "互联网用户"); drawBox(doc, 100, 390, 220, 90, "企业 OIDC / MFA"); drawBox(doc, 100, 550, 220, 90, "堡垒机运维入口");
  drawBox(doc, 440, 210, 230, 90, "双机 WAF / API 网关"); drawBox(doc, 440, 370, 230, 90, "Web / API × 3"); drawBox(doc, 440, 530, 230, 90, "Worker × 4"); drawBox(doc, 440, 690, 230, 90, "外部模型审计代理");
  drawBox(doc, 800, 210, 320, 90, "PostgreSQL 2+1"); drawBox(doc, 800, 370, 320, 90, "私有 MinIO × 4"); drawBox(doc, 800, 530, 320, 90, "quarantine Bucket"); drawBox(doc, 800, 690, 320, 90, "恶意文件扫描 × 2");
  drawBox(doc, 1250, 230, 230, 90, "监控 / 日志 × 2"); drawBox(doc, 1250, 420, 230, 90, "客户 KMS"); drawBox(doc, 1250, 610, 230, 90, "备份区 35 天");
  [[320,275,440,255],[555,300,555,370],[670,415,800,255],[670,575,800,575],[960,620,960,690],[1120,255,1250,275],[1120,415,1250,465],[1120,415,1250,655],[320,595,440,575]].forEach((points) => drawArrow(doc, ...points));
  drawRoutedArrow(doc, [[1120,735],[1150,735],[1150,415],[1120,415]]);
  doc.fontSize(24).fillColor("#486581").text("仅 443 入站；数据区无公网出口；生产/UAT/开发环境的数据库、Bucket、密钥和账号完全隔离。", 80, 910, { width: 1440 });
  doc.end();
  await new Promise((resolve, reject) => stream.on("finish", resolve).on("error", reject));
  const result = spawnSync("pdftoppm", ["-png", "-singlefile", "-scale-to-x", "1600", "-scale-to-y", "1000", pdfPath, output.replace(/\.png$/i, "")], { encoding: "utf8" });
  await fsp.rm(pdfPath, { force: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "topology conversion failed");
}

async function writeManifest() {
  const entries = [
    ...["automatic-content-checks.json", "deterministic-values.json", "expected-relations.json", "key-facts.json", "prohibited-claims.json", "scoring-rubric.json"].map((name) => [`expected/${name}`, "content", "json"]),
    ["intake.json", "content", "json"], ["sources/network-topology.png", "content", "png"], ["sources/resource-capacity.xlsx", "content", "xlsx"], ["sources/security-requirements.pdf", "content", "pdf"],
  ];
  const files = await Promise.all(entries.map(async ([relative, category, format]) => ({ path: relative, sha256: createHash("sha256").update(await fsp.readFile(path.join(root, relative))).digest("hex"), category, format, licenseStatus: "synthetic" })));
  const manifest = {
    benchmarkId: "BM-14", benchmarkVersion: "1.0", title: "私有化部署项目", projectType: "deployment", difficulty: "L3",
    coverageTags: ["private_deployment", "network_isolation", "private_minio", "capacity_planning", "backup_restore", "security_operations", "external_cost_boundary"],
    expectedScale: { requirements: { min: 18, max: 46 }, features: { min: 14, max: 38 }, solutionCharacters: { min: 16000, max: 38000 }, slideCount: { min: 12, max: 24 } },
    timeoutSeconds: 2400,
    blockingChecks: ["all_manifest_hashes_match", "private_minio_boundary_preserved", "network_zones_and_environment_isolation_preserved", "capacity_formula_and_resource_counts_preserved", "rpo_rto_and_backup_policy_preserved", "external_costs_separated", "scope_exclusions_preserved", "all_formal_claims_have_source_refs"],
    files,
  };
  await fsp.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function pageTitle(doc, title, subtitle) { doc.fontSize(24).fillColor("#102a43").text(title).moveDown(0.25).fontSize(10).fillColor("#627d98").text(subtitle).moveDown(1.3); }
function section(doc, title, items) { doc.fontSize(15).fillColor("#1f4e79").text(title).moveDown(0.4); for (const item of items) doc.fontSize(10.5).fillColor("#243b53").text(`• ${item}`, { lineGap: 5 }).moveDown(0.45); doc.moveDown(0.6); }
function styleSheet(sheet, range) { sheet.getRow(1).font = { name: "Noto Sans CJK SC", bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } }; sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" }; sheet.getRow(1).height = 24; sheet.eachRow((row, index) => { row.font = { ...row.font, name: "Noto Sans CJK SC" }; if (index > 1) row.alignment = { vertical: "top", wrapText: true }; }); sheet.autoFilter = range; }
function drawZone(doc, x, y, width, height, label, color) { doc.roundedRect(x, y, width, height, 24).fillAndStroke(color, "#9fb3c8"); doc.fontSize(26).fillColor("#243b53").text(label, x + 24, y + 18, { width: width - 48 }); }
function drawBox(doc, x, y, width, height, label) { doc.roundedRect(x, y, width, height, 15).fillAndStroke("#ffffff", "#486581"); doc.fontSize(20).fillColor("#102a43").text(label, x + 10, y + 31, { width: width - 20, align: "center" }); }
function drawArrow(doc, x1, y1, x2, y2) { doc.save().strokeColor("#334e68").lineWidth(4).moveTo(x1, y1).lineTo(x2, y2).stroke(); const angle = Math.atan2(y2 - y1, x2 - x1); const size = 13; doc.moveTo(x2, y2).lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)).lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)).closePath().fill("#334e68").restore(); }
function drawRoutedArrow(doc, points) { doc.save().strokeColor("#334e68").lineWidth(4).moveTo(...points[0]); for (const point of points.slice(1)) doc.lineTo(...point); doc.stroke(); const [x2, y2] = points.at(-1); const [x1, y1] = points.at(-2); const angle = Math.atan2(y2 - y1, x2 - x1); const size = 13; doc.moveTo(x2, y2).lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)).lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)).closePath().fill("#334e68").restore(); }
