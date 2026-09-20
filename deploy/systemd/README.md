# 单机生产运行

这组 unit 让 Web、无人值守 Worker 和外部健康探针分别运行。Worker 主动熔断后由 systemd 拉起；进程卡死但未退出时，30 秒健康探针通过 `OnFailure` 恢复 Web 与 Worker。

前提：服务器已创建不可登录的 `ningyi` 用户，代码部署到 `/opt/ningyi-ai-website`，Node.js 与 pnpm 位于 unit 声明的 `PATH` 中。

```bash
sudo install -d -o ningyi -g ningyi -m 0700 /var/lib/ningyi
sudo install -d -o root -g root -m 0700 /etc/ningyi
sudo install -o root -g root -m 0600 deploy/systemd/product.env.example /etc/ningyi/product.env
sudo install -o root -g root -m 0644 deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ningyi-web.service ningyi-product-worker.service ningyi-product-healthcheck.timer ningyi-product-backup.timer
```

启用前必须替换 Session、Worker、备份加密、下载签名四个互不相同的随机密钥及模型供应商密钥。发布版本需要先在代码目录执行 `pnpm install --frozen-lockfile && pnpm build`。检查状态：

```bash
systemctl status ningyi-web.service ningyi-product-worker.service
systemctl list-timers ningyi-product-healthcheck.timer
systemctl list-timers ningyi-product-backup.timer
journalctl -u ningyi-product-worker.service -n 100 --no-pager
```

Web 与 Worker 启动前都会运行 `scripts/product-production-check.mjs`。四个相互独立的弱密钥或重复密钥、相对路径、目录不可写、缺少 `.next` 构建、缺少 PDF 中文字体、正式模型密钥缺失或 Python 不可用时，服务不会进入运行态；输出仅包含错误码，不包含密钥值。`PRODUCT_BACKUP_ENCRYPTION_KEY` 必须与 Session、Worker、下载签名密钥分别保存，丢失后无法恢复历史备份。成果下载链接默认 120 秒失效，且始终绑定当前登录用户、方案和成果；`PRODUCT_DOWNLOAD_TTL_SECONDS` 最大只允许 300 秒。

首次部署、轮换模型密钥或调整 API Project 后，先用最低成本的小请求验证鉴权、模型权限和余额。命令只输出状态、模型、请求 ID 和 token 数，不输出密钥或供应商原始错误正文：

```bash
sudo bash -c 'set -a; . /etc/ningyi/product.env; set +a; cd /opt/ningyi-ai-website; exec pnpm provider:check'
```

返回 `PROVIDER_AUTHENTICATION_FAILED` 时检查密钥；返回 `PROVIDER_CREDITS_EXHAUSTED` 时为对应 API Project 补充额度。默认预检模型为 `gpt-5-nano`，可通过 `PRODUCT_PROVIDER_CHECK_MODEL` 显式覆盖。

Worker 会按当前成果目录自动对账历史完成项目。缺少任一声明格式的项目会分批重新进入渲染队列，不重新调用正式分析模型；`PRODUCT_DELIVERABLE_RECONCILE_BATCH` 控制每轮最多回填的项目数，默认 4，建议结合渲染 Worker 容量调整。

数据库每天使用 SQLite 在线备份 API 生成一致性副本，并在发布前执行 `integrity_check`。明文临时副本随后使用独立密钥进行 AES-256-GCM 流式加密并立即删除，只发布 `.sqlite.enc` 和包含密文 SHA-256、IV、认证标签的清单。失败后每 5 分钟重试，单小时最多 3 次；默认保留 14 天，只清理符合受控命名规则的过期备份。数据库备份不等于项目附件备份；`PRODUCT_PRIVATE_STORAGE_PATH` 仍需配置独立磁盘/对象存储快照。

先做不落盘的恢复演练；工具会核验密文摘要、GCM 认证、SQLite 完整性和表数量：

```bash
sudo bash -c 'set -a; . /etc/ningyi/product.env; set +a; cd /opt/ningyi-ai-website; exec node scripts/product-restore.mjs --backup /var/lib/ningyi/backups/product-YYYYMMDDTHHMMSSZ-xxxxxxxx.sqlite.enc'
```

需要生成候选恢复库时使用新的绝对路径，工具拒绝覆盖文件或直接写入 `PRODUCT_DB_PATH`：

```bash
sudo bash -c 'set -a; . /etc/ningyi/product.env; set +a; cd /opt/ningyi-ai-website; exec node scripts/product-restore.mjs --backup /var/lib/ningyi/backups/product-YYYYMMDDTHHMMSSZ-xxxxxxxx.sqlite.enc --output /var/lib/ningyi/restore-candidate.sqlite'
```

候选库验证完成后，应先停止 Web 与 Worker，再由部署人员原子替换数据库；恢复工具本身不会改动在线库。

若 pnpm 安装在自定义位置，应同步修改两个 service 中的 `PATH`。Web 与 Worker 必须读取同一个 `PRODUCT_DB_PATH` 和 `PRODUCT_PRIVATE_STORAGE_PATH`；当前 SQLite 方案适合单主机多 Worker，不允许多个主机通过网络文件系统共享数据库。
