# DO 批量生成系统

运行地址：`http://localhost:2658/`

## 使用方式

```bash
npm install
npm run dev
```

## 批量导入字段

Excel、CSV、或直接从表格复制粘贴都可以。建议表头：

```text
进口商,时间,船名航次,起运/目的港,主提单号,到港时间,件数,柜号,柜型,重量,码头,品名
```

系统会在浏览器本地缓存：

- 默认 DO 抬头
- 默认码头和品名
- 已导入/编辑过的票
- 当前选中的记录

## 当前能力

- 表格批量导入并生成多票 DO
- 提单 PDF 文本层提取，自动预填柜号、提单号、件数、柜型、重量、船名航次、港口
- 单票导出 PDF
- 批量导出 ZIP
- 全部数据保存在浏览器本地，不上传服务器

## 项目级记忆

以后开新对话时，Cursor 会读取工作区里的 `.cursor/rules/do-project-memory.mdc`，用于记住项目背景、目录、端口、限制和当前功能。更完整的上下文在 `../docs/project-memory.md`。

## 后续可升级

- 扫描件 OCR：接 PaddleOCR、Tesseract、Google Vision 或 Gemini
- 柜号查 MBL/ETA：接船司、码头、第三方 tracking API
- 模板升级：导入客户现有 DO PDF 作为底图，按坐标精准覆盖字段
- 团队级上下文同步：参考 MindCache / agentMemory 类项目，把项目记忆同步到 GitHub 或数据库
