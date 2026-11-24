# 家庭保质期管家 PWA

面向单台 iPhone 的本地优先 PWA。GitHub Pages 只托管公开的应用程序文件；商品资料、照片和家庭设置保存在当前设备浏览器的 IndexedDB，不上传 GitHub，不使用云数据库、付费 API、统计 SDK 或第三方 CDN。

## 功能

- P0 风格首页：商品总数、即将到期、已过期、四个商品分类、临近到期列表、底部导航。
- 商品增删改查、分类筛选、搜索、详情页。
- 商品封面、生产日期/保质期标签、配料表照片：分别支持拍照和相册导入。
- 日期计算：包装标注到期日优先；没有包装日期时可用生产日期 + 保质期时长推算；已开封商品可录入开封日期和开封后期限，最终采用更早的到期日。
- 配料表关键词核对：本地内置提示规则、家庭关注人群开关、自定义关键词规则。结果不是医学诊断或安全保证。
- 标签文字辅助：在 iPhone 照片中用“实况文本”复制标签文字，粘贴到应用后提取日期候选；所有候选必须人工核对。本版没有内置 OCR，也不调用 OCR 云服务。
- 完整 JSON 备份与恢复，包含商品图片。
- Service Worker 缓存应用外壳，首次成功打开并缓存后可离线使用。

## 明确不包含

- 不支持两台手机之间同步；每台设备各自有独立本地数据库。
- 不提供应用关闭时的定时推送提醒。无服务器/推送服务条件下，本版只在打开应用时显示到期状态。
- 不会自动识别图片中的日期或配料表；请使用 iPhone“照片”的实况文本复制后粘贴。
- 不读取旧 Scriptable 的 P0/P1 数据目录。旧脚本和旧数据不会被覆盖；如需迁移，必须另做明确的数据转换与人工验收。

## 发布方式

本仓库使用 GitHub Actions 自动发布 Pages：

1. 将完整源码压缩包上传到仓库根目录，文件名必须为 `家庭保质期管家_PWA_V1.0_源码包.zip`。
2. 上传后，Actions 工作流会自动解压源码、运行测试并部署 GitHub Pages。
3. 在仓库的 **Actions** 页面查看 `Deploy Family Expiry Manager PWA` 工作流，等待 build 和 deploy 均成功。
4. 项目站点地址为：`https://rusuan11-debug.github.io/family-expiry-manager-pwa/`。
5. 首次用 iPhone **Safari** 打开站点，等待首页完全显示；再点分享 → 添加到主屏幕，并保持“作为网页 App 打开”开启。

工作流文件位于 `.github/workflows/deploy.yml`。如果 Pages 尚未启用，工作流会尝试通过官方配置动作启用 Pages；若仓库权限或账户策略阻止自动启用，请在 Settings → Pages 中将 Build and deployment 的 Source 设为 GitHub Actions 后重新运行工作流。

## 本地测试

要求 Node.js 18 或更新版本：

```bash
npm test
node --check app.js
node --check core.js
node --check storage.js
node --check sw.js
```

## 数据与隐私

- 应用静态程序文件公开托管在 GitHub Pages；**不要把个人商品资料、照片、备份 JSON 上传到仓库**。
- 商品资料和照片只存在当前设备浏览器的 IndexedDB。
- 清除 Safari 网站数据、移除网页 App、系统清理浏览器数据或更换设备可能导致本地数据丢失。请定期从“家庭与设置”导出完整备份，并保存到 iPhone“文件”或电脑。
- GitHub Pages 是免费静态托管服务，受 GitHub 使用限制约束，不承诺无限流量或永久可用。

## 源码目录

- `index.html`：应用入口
- `styles.css`：手机界面
- `app.js`：页面与交互
- `core.js`：日期计算、日期解析、配料关键词提示
- `storage.js`：IndexedDB 本地存储和备份恢复
- `sw.js`：离线缓存
- `manifest.webmanifest`：主屏幕网页 App 配置
- `assets/`：应用图标
