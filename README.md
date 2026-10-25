# 一点光 · A Glimmer

**每个声音里，都有一点光。**

*A little light, in every voice.*

一个温柔的声音社区：给陌生人一点力量，给未来的自己留下一封声音信。

## 已实现

- 精选声音墙、心情筛选、关键词搜索、随机收听、单实例播放器、进度与倍速。
- 七个公共主题频道：吹水、INFP、方言、晚安、重新开始、普通日子、未来重逢；支持文字、图片与直接录制/上传语音。
- 六类灵感卡、浏览器录音、90 秒自动停止、上传音频、试听与本地草稿恢复。
- 账户与署名设置、可复制的账户编号；录制日期、服务器保存时间和当次署名分别保存。
- 可撤回的注销申请，管理员确认删除 Supabase 身份后处理站内数据；中断清理可重试，关闭身份无法重新生成旧档案。
- 审核工作台按状态筛选，声音、频道消息与举报分别分页，显示完整待办数量；另有私有运行检查面板。
- 账户头像上传、更换与移除，自动居中裁切至 512 像素；目前仅在本人账户界面显示。
- 暖纸质、深蓝夜间、桃粉杂志三套可切换主题（不含亮蓝）；中英文界面，投稿原文与历史署名保持不变。
- 公开且审核通过的声音可制作带署名、日期与收听二维码的 PNG 明信片。
- 两步录音流程：先录音试听，再确认署名、日期与可见范围；其他信息可选填写。
- 公开投稿先审核，首页精选单独决定；私密内容只能由作者访问，审核员不能访问他人的私密录音。
- “给了我力量”、收藏、分享链接、举报、审核说明与审核日志。
- 按年份浏览声音年鉴、十年/二十年目标年份、“未来回声”关联新旧录音。
- 随时撤回公开、下载、删除；ZIP 分卷导出原音频及 JSON 元数据。
- 响应式布局、键盘焦点、模态窗口焦点约束、减少动画偏好。

## 技术与账户

React 19 / TypeScript / Vinext（Next.js App Router API）/ Cloudflare Workers / D1 / R2。

账户使用 **Supabase Auth 邮箱验证码**，注册和登录合一。独立身份项目已连接，Resend 在 Supabase 后台作为邮件供应商配置；本网站不保存密码，也不需要 Resend 私钥。新项目使用八位验证码，网站同时兼容六位格式；真实邮件送达仍待所有者验收。配置记录见 [邮箱登录配置](docs/AUTH_SETUP.md)。

本地未配置平台时，登录弹窗明确提示未接通，并提供仅开发可用的演示账户。生产不会信任客户端伪造的身份请求头，也不会自动将首位用户设为审核员。生产审核员通过 ADMIN_USER_IDS 设置，使用 `/api/me` 返回的产品用户 ID。

## 本地启动

需要 Node.js 24（项目最低要求 22.13，但内置 TypeScript 测试建议使用 24）与 npm。

```sh
npm ci
npm run db:generate # 仅修改 db/schema.ts 后运行；已有迁移无需重复生成
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cheerful_callisto.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_unique_amphibian.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_dear_stick.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_bent_meggan.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_overconfident_talon.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_glamorous_slapstick.sql
npm run dev -- --hostname 127.0.0.1 --port 5173
```

访问 `http://127.0.0.1:5173/`。点击登录打开邮箱验证码界面。未配置平台时，可选择明确标注的本地演示身份。数据库与音频保存在忽略的 `.wrangler/state/`，重启后仍在。不要重复执行已应用迁移；新增迁移按顺序执行。

## 验证

```sh
npm run typecheck
npm test
npm run test:auth # 未配置平台时验证本地登录/退出与错误路径
npm run test:channels # 本地频道文字、图片、语音及审核检查
npm run test:api # 本地 dev 服务运行时执行；只允许 localhost / 127.0.0.1
npm run build
npm run test:production # 构建完成后，隔离 Worker + 模拟身份供应商，不发真实邮件
npm run test:operations # 分页权限、申请/撤回、数据清理、关闭身份防复活
npm run check:live # 只读检查正式首页和存储服务
```

API 测试创建自己可清理的本地测试数据，并恢复署名。禁止针对生产运行。浏览器生成的 WebM 合成音夹具在 `tests/fixtures/`，不包含真实用户声音。

## 部署与 GitHub

正式网址：[AGlimmer.xyz](https://aglimmer.xyz/)，已发布公开测试版，域名与 HTTPS 均已生效。源码同步到 [GitHub](https://github.com/stong123456/aglimmer)。真实邮箱送达、线上管理员、自动异地备份仍需运营配置与验收。

`.openai/hosting.json` 已保留本次创建的未发布 Sites 身份和 DB/BUCKET 声明；之后继续此项目应复用该 ID，不应重复创建。Sites 部署会配置 D1/R2 并应用迁移。源码可推送到 GitHub，但 GitHub Pages 无法运行本项目的服务端功能；普通 Vercel 部署也不能直接替代 D1/R2 和 Sites 身份网关。

发布前：配置审核员白名单，确认公开访问策略，验证真实登录和双账户隔离，设置备份与恢复演练，替换演示声音。公开网站应允许匿名收听、登录后投稿。

## 长期保存的边界

- 原音频进入 R2，元数据进入 D1；保存不同于永久运营保证。
- 草稿只存在当前浏览器 IndexedDB。未发布的草稿不会跨设备同步。
- 未来年份是档案标记，**不封锁声音，也不发送定时邮件**。
- 文字稿由用户填写，**没有自动转写**。
- 无真实投稿时，展示明确标注的原创示例。首页四段示例为 HeyGen 生成的本地 MP3，使用温柔女声、沉稳男声、清亮少年声及停顿；时长从实际文件核验。示例人物与日期不是历史用户记录。
- 频道每 15 秒轮询更新；所有媒体先审核再公开，作者能看到自己的待审核消息。定向攻击/消极诱导的文字另有规则拦截，复杂语境与音频/图片依靠人工审核，不能宣称自动准确识别所有“负能量”。
- 每个账户 200 段 / 500 MB，每段 1–90 秒 / 10 MB，每小时最多 10 次提交。音频格式和时长在服务端检查，WebM 缺失 Duration 时读取块时间戳。
- 上传日期由用户填写，不能证明原音频的历史录制时间。服务器保存时间记录的是本站接收时间，不是公证时间戳。
- 不能阻止他人录制公开声音。删除立即终止本站提供；底层备份清理需要运营流程。

完整产品设计与上线条件见 [产品说明](docs/PRODUCT.md)、[运营与备份](docs/OPERATIONS.md)、[验证记录](docs/QA.md)。

## 视觉资产

`public/images/landscape.png` 由内置 ImageGen 生成。创作简述：暖白纸纹背景、鼠尾草绿层叠山丘、杏色日出、湖面和细小野花，安静、留白、无文字。界面文字、波形与控件均由代码绘制。

首页语音通过 HeyGen Speech 生成；音色说明与脚本见 [声音制作记录](docs/VOICE_ASSETS.md)。

### 本轮体验更新

- 首页“给此刻的你”：按需要选择陪伴，手动播放。
- “慢慢听”独立播客书架：1–30 分钟、30 MB，沿用人工审核。
- 播客支持本浏览器进度记忆和睡眠定时，浏览器冻结可能延迟。
- 个人声音年轮：固定问题按日期整理，可续录，默认私密。
- `npm run test:podcasts` 验证长内容时长与审核隔离，仅在本地运行。
- 待办与能力边界见 docs/PRODUCT_ROADMAP.md。

播客可在文字稿中用独立行标记章节，如 `[00:00] 故事开场`、`[02:15] 一盏小灯`。详情页显示章节导航；播客文字稿最多 15,000 字。书架支持时长筛选与重试，播放器支持前后 15 秒跳转、0.75 倍速和可用浏览器的系统媒体控制。

### 备份加密与恢复
个人 ZIP 档案或由运营者导出的快照文件可用 `scripts/archive-vault.mjs` 加密、校验和还原。口令通过隐藏输入或 stdin 提供，使用 AES-256-GCM 与 scrypt，不覆写已有文件。操作见 [运营与备份](docs/OPERATIONS.md)。这是离线工具；全站定时异地备份和自动告警仍需另行配置。

### 声音灵感馆与发布前完善

已有网络经典按 5 个主题整理，支持中英文导读、原声语言/类型筛选及搜索。通过来源官方播放器收听，保留原始署名和权利说明，不下载或转存现代演讲和电影音轨。来源核对、版权反馈与暂停机制见 [声音素材记录](docs/VOICE_ASSETS.md)。

个人档案支持年度回顾、日历周年提醒、账户隔离的本地草稿和经审核后公开；ZIP 原文件带 SHA-256 校验清单，可用 `python3 scripts/verify-export.py export.zip` 独立验证。`npm run test:release` 验证分页搜索、私密转公开、版权反馈及管理员暂停权限。

### 慢慢听与睡眠模式

原声来源记录1224条，公开展示904条（含实际书籍章节；320条听感反馈不佳的古诗录音已撤下），来源音频连接原站播放，不制作或转存；官方演讲保持可见视频播放器。首页直接进入中文选读、生活微纪录和成长演讲精选，新增自然、英文故事、睡前等书架。24个官方中文节目入口另行统计，不进入站内播放或睡眠队列。支持自动下一段、按书籍选择、进度恢复和独立深色睡眠界面，倒计时 1–240 分钟或播完指定作品停止。浏览器自动播放/后台限制会提示用户，关闭仅停止播放，不关闭浏览器标签。`tests/listening.test.ts` 覆盖清单边界、终点优先、截止时间恢复及来源适配。

2026-10-24：首听在社区为空时使用明确标注的经典原声保底；首页三组预览不重复；听众反馈不佳的320条古诗录音已暂停展示与自动播放，中文入口改为《歌声》《匆匆》等真人散文与故事，睡前清单排除未选为睡前内容的作品。原站轮转巡检、加密站内恢复副本、删除清单和样本还原均已实现，限制与无人值守步骤见 docs/MAINTENANCE.md。跨账号/异地副本和真实手机后台验收仍需完成。
