# 一点光 · A Glimmer

**每个声音里，都有一点光。**

*A little light, in every voice.*

一个温柔的声音社区：给陌生人一点力量，给未来的自己留下一封声音信。

## 已实现

- 精选声音墙、心情筛选、关键词搜索、随机收听、单实例播放器、进度与倍速。
- 七个公共主题频道：吹水、INFP、方言、晚安、重新开始、普通日子、未来重逢；支持文字、图片与直接录制/上传语音。
- 六类灵感卡、浏览器录音、90 秒自动停止、上传音频、试听与本地草稿恢复。
- 账户与署名设置；录制日期、服务器保存时间和当次署名分别保存。
- 公开投稿先审核，首页精选单独决定；私密内容只能由作者访问，审核员不能访问他人的私密录音。
- “给了我力量”、收藏、分享链接、举报、审核说明与审核日志。
- 按年份浏览声音年鉴、十年/二十年目标年份、“未来回声”关联新旧录音。
- 随时撤回公开、下载、删除；ZIP 分卷导出原音频及 JSON 元数据。
- 响应式布局、键盘焦点、模态窗口焦点约束、减少动画偏好。

## 技术与账户

React 19 / TypeScript / Vinext（Next.js App Router API）/ Cloudflare Workers / D1 / R2。

账户使用 **Supabase Auth 邮箱验证码**，注册和登录合一。Resend 在 Supabase 后台作为邮件供应商配置；本网站不保存密码，也不需要 Resend 私钥。平台账户由产品所有者注册，真实邮件暂未接通。接通步骤见 [邮箱登录配置](docs/AUTH_SETUP.md)。

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
```

API 测试创建自己可清理的本地测试数据，并恢复署名。禁止针对生产运行。浏览器生成的 WebM 合成音夹具在 `tests/fixtures/`，不包含真实用户声音。

## 部署与 GitHub

当前按用户要求 **尚未推送 GitHub、尚未上线**。

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
