# 🎓 毕业班纪念站

一个温和清晰的毕业班纪念网站：老师后台维护 **班级大事记、同学照片、毕业寄语、时间倒计时**；
学生可提交回忆，**审核通过后**才公开展示；公开版与公开导出**自动隐藏联系方式**；
全部资料可一键导出留档。

零第三方依赖，Node.js 原生实现，下载即可运行。

## 快速开始

```bash
npm start            # 或 node server.js
# 打开 http://localhost:3000
```

- 公开纪念页：<http://localhost:3000/>
- 老师后台：<http://localhost:3000/admin>
- 默认账号：`teacher` / `graduation2026`

### 修改默认密码（重要）

通过环境变量设置，不要使用默认密码：

```bash
TEACHER_USER=teacher TEACHER_PASSWORD=你的强密码 PORT=3000 npm start
```

## 功能一览

### 公开版（学生 / 来宾）
- 顶部毕业 **时间倒计时**（毕业前倒数 / 毕业当天 / 毕业后纪念三种状态自动切换）
- **班级大事记** 时间线
- **同学照片** 相册（点击灯箱放大）
- 老师 **毕业寄语**
- **同学回忆墙**（仅展示审核通过的内容）
- 在线 **提交回忆**（姓名、内容、联系方式、可选配图）
- 可下载 **公开版 Markdown 毕业编年**
- 🔒 联系方式仅在提交表单中采集，**公开 API 不返回该字段**，公开页面与公开导出均不可见

### 老师后台（`/admin`）
1. **概览**：待审核数量与各项统计
2. **回忆审核**：通过 / 退回 / 重新审核 / 删除；查看仅老师可见的联系方式与配图；审核备注
3. **大事记**：增删改，按日期自动排序
4. **同学照片**：上传（浏览器端自动压缩）、改标题说明、删除、灯箱预览
5. **毕业寄语**：增删改
6. **站点与倒计时**：学校班级、毕业日期、标语、公告
7. **导出留档**：
   - 📦 **完整 JSON 归档**：全部内容 + 照片 base64 内嵌 + 联系方式，单文件长期留档 / 迁移恢复
   - 📊 **回忆明细 CSV**：含全部状态与联系方式，Excel/WPS 可直接打开（带 UTF-8 BOM）
   - 📜 **公开版 Markdown 编年**：不含任何联系方式，可打印 / 分享

## 数据与隐私

| 项目 | 说明 |
| --- | --- |
| 数据文件 | `data/db.json`（防抖原子写入：先写 tmp 再 rename） |
| 上传照片 | `uploads/`，仅接受 JPG/PNG/WEBP/GIF；魔数二次校验；**禁止上传 SVG**（种子占位图除外） |
| 会话 | HttpOnly + SameSite=Lax Cookie，内存令牌，12 小时滑动过期，不落盘不导出 |
| 密码 | scrypt 哈希 + 常量时间比较（不存明文） |
| 公开接口 | `/api/bootstrap`、`/api/memories`(提交) 与公开编年导出，均不含联系方式 |
| 限流 | 同一 IP 两次回忆提交至少间隔 15 秒 |
| 防护 | 路径穿越校验、静态资源 nosniff、前端全部 textContent 渲染防 XSS、请求体大小限制 |

## 目录结构

```
server.js              HTTP 服务与路由
src/store.js           JSON 存储 + 首次示例数据
src/auth.js            密码哈希与会话
src/http.js            请求解析 / 图片校验落盘
src/exporter.js        JSON / CSV / Markdown 导出
src/ratelimit.js       提交限流
public/                公开页
  index.html  js/public.js  css/style.css
  admin/               登录页与老师后台
data/db.json           运行后生成
uploads/               运行后生成
```

## 留档与恢复建议

- 每学期末在「导出留档」下载一次完整 JSON；毕业后随班级资料永久保存。
- 恢复时将归档 JSON 中的图片 data URL 解码回 `uploads/`、数据写回 `data/db.json` 即可
  （也可直接保存整个 `data/` 与 `uploads/` 目录）。

## 技术说明

- Node >= 18，无 `node_modules`，无需联网安装。
- 部署到服务器时建议放在 Nginx/Caddy 反向代理之后并启用 HTTPS。
