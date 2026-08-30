# meetme · 双人时间协调

两个人互相亮出自己一周的有事/没事，随手在时间轴上画色块，对方实时可见。
支持**每周重复**、块上备注、黄色便签（可贴图）、以及**改动 5 分钟确认后的邮箱通知**。

纯静态页面（无构建步骤）+ Supabase 免费版，托管在 GitHub Pages，总费用 ¥0。

## 用法（设计成不用解释）

- 在「我」这一侧按住拖动 = 画一块，松手自动吸附到 5 分钟，块上方显示时间
- 起笔处如果是你的同类色块，这次拖动 = 擦除
- 单击色块 = 改类型 / 每周重复 / 备注（直接显示在色块上）/ 黄色便签 / 删除
- 「有事 / 没事」两个胶囊切换画笔，「每周重复」点亮后画的块每周都在
- 左右箭头或键盘 ← → 切换周
- 右上角你的名字 = 设置通知邮箱

时间范围默认 10:00–24:00，在 `app.js` 顶部 `START_HOUR / END_HOUR / SNAP` 可改（SNAP 为吸附粒度）。手机端已适配：色块窄条只显示开始时间，触屏下整周日历自动压缩进一屏。

## 一、建数据库（5 分钟）

1. [supabase.com](https://supabase.com) 注册并 **New project**（免费档）。
2. **SQL Editor** → New query → 粘贴 `schema.sql` 全部内容 → **Run**。
   （v2 数据结构与 v1 不兼容，脚本会先删旧表；报 "already exists" 忽略即可。）
3. **Settings → API** 复制 `Project URL` 和 `anon public` key（这把钥匙本来就是公开的）。
4. 填进 `config.js`。没填之前网站进入演示模式：功能齐全，数据仅存本机。

## 二、部署到 GitHub Pages（5 分钟）

```bash
cd meetme          # 即本目录 calendar-booking
git init && git add . && git commit -m "meetme"
git branch -M main
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

仓库 **Settings → Pages** → `Deploy from a branch` → `main` / `(root)` → Save。
访问 `https://<用户名>.github.io/<仓库名>/`，网址发给朋友，各自输入名字即可。
顺手把 `config.js` 里的 `SITE_URL` 填成这个地址（邮件正文会带上链接）。

## 三、邮箱通知（可选，约 15 分钟）

逻辑：任何改动先与上次快照比对；**静默 5 分钟后**确认改动落实（期间继续改动会顺延、
撤销则不发），才给对方邮箱发一封汇总邮件，不会反复推送。

1. **[brevo.com](https://www.brevo.com) 注册**（免费 300 封/天，无需域名）：
   Senders & IP → Senders → 添加并验证一个你的邮箱作为发件人 →
   SMTP & API → 生成 API Key。
2. **部署 Edge Function**（需安装 Supabase CLI，[安装指引](https://supabase.com/docs/guides/functions/quickstart)）：

   ```bash
   supabase login
   supabase link --project-ref <Settings→General→Reference ID>
   supabase functions deploy notify
   supabase secrets set BREVO_API_KEY=你的key MAIL_FROM=你验证过的发件邮箱
   ```

3. 两个人各自点右上角名字，填上邮箱。完成：之后对方改动落实 5 分钟后你就会收到邮件。

不想配邮件就跳过这节，其余功能完全不受影响。

## 防止 Supabase 免费项目休眠（可选，1 分钟）

免费项目连续 7 天无访问会暂停。把 `.github/workflows/keepalive.yml` 里两处
占位符换成你的 Supabase URL 和 anon key 后推送，GitHub 每天自动 ping 一次。

## 目录结构

```
index.html                     页面骨架（极简）
style.css                      粉紫极简样式 + 便签浮起动效
app.js                         全部逻辑（自由绘制/吸附/合并/通知/演示模式）
config.js                      ← 填 Supabase 密钥与 SITE_URL
schema.sql                     ← 粘到 Supabase SQL Editor 执行
supabase/functions/notify      邮件通知 Edge Function（可选）
.github/workflows/keepalive.yml  防休眠定时任务（可选）
.nojekyll                      让 GitHub Pages 原样伺服文件
```
