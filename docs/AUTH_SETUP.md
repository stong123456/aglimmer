# 邮箱登录接通步骤

已完成邮箱 → 六位验证码 → 首次选择昵称的产品界面与服务端代码。目前没有平台配置，真实邮件尚未发送。以下账户由产品所有者注册，代码不会自动注册平台账户或发真实邮件。

## 1. Supabase：先免费创建项目

1. 注册并登录 [Supabase Dashboard](https://supabase.com/dashboard)，创建一个项目。
2. 选择 Free。数据库密码请自己保存，不需要交给网站或发到聊天。
3. 在项目的连接信息/API Keys 页面获取 **Project URL** 和 **Publishable key**；旧项目的 `anon` key 也支持。
4. 不要使用 `service_role` 或 `sb_secret_` key，本站代码会拒绝把这些当作登录用钥匙。
5. 只把项目 URL 发到聊天即可。公钥可以直接由你填写到本地文件，私钥和密码不需要出现在聊天。

本站只用 Supabase 管理身份，不把现有声音和图片搬进 Supabase。原音频仍在 R2，产品档案仍在 D1。

## 2. 本地连接

把项目根目录 `.dev.vars.example` 复制为 `.dev.vars`：

```dotenv
SUPABASE_URL="https://你的项目.supabase.co"
SUPABASE_PUBLISHABLE_KEY="你的 publishable key"
TURNSTILE_SITE_KEY=""
ADMIN_USER_IDS=""
```

`.dev.vars` 已排除在 Git 和源码 ZIP 外。填写后重启本地开发服务器。不要修改 `.openai/hosting.json` 来存这些值；正式部署时使用环境变量配置。

## 3. 把邮件改为六位验证码

Supabase 的邮箱无密码登录默认邮件模板可能发送链接。需要在 Authentication 的 Email Templates 中，将 **Magic Link** 模板改为 `docs/email/otp-template.html`，并同步检查 **Confirm Signup** 模板，让首次注册也显示 `{{ .Token }}`。

主题建议：`一点光 · 你的登录验证码`。保留 Email 验证，不要为了省事关闭邮箱确认。使用六位 OTP，并把 Email OTP expiration 设置为 600 秒；这项有效期是在 Supabase 配置，不是由浏览器计时器保证。

官方参考：[邮箱 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[邮件模板变量](https://supabase.com/docs/guides/auth/auth-email-templates)。

## 4. Resend：先注册，域名买好后接邮件

1. 注册 [Resend](https://resend.com/signup)，使用免费计划。
2. 购买 AGlimmer.xyz 后，在 Resend 添加发信域名，建议使用 `mail.aglimmer.xyz`。
3. 按 Resend 提供的实际 DNS 记录完成验证；不要猜测 TXT/MX 值。
4. 创建只具备发信权限的 API key，直接由你填入 Supabase 自定义 SMTP 的 Password 字段，不需要交给网站或发到聊天。
5. Supabase 的 Custom SMTP 使用 Resend 支持的配置：Host `smtp.resend.com`、Username `resend`、SSL Port `465`、Password 为 Resend API key。发信地址填写你已验证域名下的地址，例如 `hello@mail.aglimmer.xyz`，显示名 `一点光 · A Glimmer`。
6. 如使用 Resend/Supabase 的官方连接集成，可按平台页面完成同一配置。不要开启会改写登录邮件链接的点击追踪。

官方参考：[Resend SMTP](https://resend.com/changelog/smtp-service)、[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。

未验证发信域名前，可以使用 Supabase 默认测试 SMTP 验证项目团队自己的邮箱，不能把它当作公众发信服务。

## 5. 发邮件前的限额与防刷

代码已经有按邮箱的 60 秒发送冷却、10 分钟内最多 5 次验证码验证、来源 IP 限流，限流记录只保存哈希，不存原邮箱或验证码。这里的 60 秒指成功进入发送请求后，不保证上游邮件失败时立即重发。

对公众开放前，检查 Supabase 的 Auth rate limits 和 Resend 日限额。配置 Supabase CAPTCHA 时，可选择 Cloudflare Turnstile：secret 在 Supabase 后台配置，public site key 填入本站 TURNSTILE_SITE_KEY。界面会按此配置加载人机验证，不需要在聊天中发送 secret。仅在本站限流不能阻止他人直接调用公开的身份供应商接口，因此供应商防护也要配置。

## 6. 真实验收

接通后由产品所有者使用自己的邮箱：收六位码 → 成功登录 → 选择昵称 → 保存声音 → 退出 → 再登录 → 档案仍在。再用另一个自有测试账户确认不能查看第一个账户的私密录音。验证 QQ、163 或实际目标用户邮箱的送达情况。

现有验证覆盖本地演示、SDK 和构建后 Worker 的模拟身份供应商、Cookie 往返/清理、产品 ID 映射、发送冷却及错误状态，不能代替真实 SMTP 送达验证。没有生成假验证码来假装平台已接通。

## 会话与账户说明

- 服务端调用 Supabase getUser 验证身份，不根据浏览器提供的 user ID/邮箱直接登录。
- 会话使用 HttpOnly Cookie；生产带 Secure、SameSite=Lax，不把令牌放到 localStorage。
- 产品账户 ID 与 Supabase 账号 ID 分开映射；邮箱改变时原账号 ID 不变，声音所有权保持不变。不按邮箱自动合并账户。
- 当前版本未提供站内修改邮箱界面；后续增加时必须验证新邮箱所有权。
- 本地演示入口只在 development + localhost + 尚未配置 Supabase 时可用，生产接口拒绝它。
- `/signin-with-chatgpt` 等原生 Sites 路径保留给托管基础设施，产品登录控件已改为邮箱弹窗。
- 正式对 Web2 访客发布时，托管访问策略必须允许匿名访问首页，业务写入由邮箱会话授权；私有 Sites 的平台门禁不等于邮箱登录。

本地演示账户与真实邮箱账户相互独立，不会根据邮箱文本自动合并档案。若需要迁移你自己的演示录音，应在确认两边归属后单独处理。
