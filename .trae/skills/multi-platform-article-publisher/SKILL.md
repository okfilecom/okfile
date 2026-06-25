---
name: "multi-platform-article-publisher"
description: "Publishes or republishes technical articles through browser flows on Tencent Cloud, Alibaba Cloud, CNBlogs, and Reddit. Invoke when users ask to post, resubmit, or check status."
---

# Multi Platform Article Publisher

用于通过浏览器自动化把文章发布或重提到腾讯云开发者社区、阿里云开发者社区、博客园和 Reddit，并在需要时切换到人工接管。

适用场景：

- 用户要求把文章发布到腾讯云开发者社区
- 用户要求把文章发布到阿里云开发者社区
- 用户要求把文章发布到博客园
- 用户要求把文章发布到 Reddit
- 用户要求同时发到多个社区
- 用户要求修复被驳回的文章并重新提交
- 用户要求核对某个平台当前是否已提交、审核中或被风控拦截

## 使用前提

- 用户已经在浏览器里登录对应平台账号
- 可以使用 Chrome DevTools MCP 工具操作浏览器
- 文章内容已经准备好，优先来自本地 Markdown 或清洗后的社区版正文
- 如平台要求验证码，用户愿意在最后一步手动接管

## 总流程

1. 先读取待发布内容，确认标题、摘要、正文是否已经是社区版。
2. 如果原文营销味较重，先调用内容清洗类 skill，不要直接发布原始宣传稿。
3. 打开目标社区写作页，优先使用可稳定定位的编辑入口。
4. 填写标题、正文、摘要、标签等字段。
5. 提交后不要只看当前页面，必须回后台或结果页确认真实状态。
6. 若遇到验证码、风控或人工审核门槛，明确切换为人工接管或待补发。

## 腾讯云发布要点

- 写作页：
  - `https://cloud.tencent.com/developer/article/write-new`
- 创作者后台：
  - `https://cloud.tencent.com/developer/creator/article`
- 处理重点：
  - 被驳回后，进入“文章管理”点击“立即修改”重新编辑
  - 若驳回原因是广告或引流，优先改标题、摘要、首段和结论
  - `去发布` 后不代表真正完成，必须继续完成右侧发布抽屉
  - 标题、正文改完后，摘要可能仍保留旧内容，需要再次覆盖
- 成功判定：
  - 后台出现 `审核中` 或 `已发布`
  - 必要时检查是否真的发出了 `addArticle` / `editArticle` 请求

## 阿里云发布要点

- 写作页：
  - `https://developer.aliyun.com/article/new#/`
- 常见阻塞：
  - 安全验证
  - 滑块拼图验证码
- 处理策略：
  - 先跑自动流程
  - 若标准 `fill` 不稳定，直接用脚本设置 DOM `value` 并触发 `input` / `change`
  - 若进入强交互验证码，准备让用户手动完成最后一步
- 成功判定：
  - 页面跳转到文章详情页
  - URL 形如 `https://developer.aliyun.com/article/<id>`

## 博客园处理要点

- 申请页：
  - `https://account.cnblogs.com/blog-apply`
- 判断原则：
  - 若账号未开通博客，先看申请页状态，不要误判为登录失败
  - `您的申请正在审核队列中等候处理` 表示已进入人工审核
  - `您上次的申请被拒绝` 表示需要重写申请理由后重新提交
- 申请理由建议突出：
  - Python
  - 自动化测试
  - 文件上传链路
  - CLI 工具接入
  - 静态站点发布
  - 工程实践和问题排查
- 在博客资格开通之前，把博客园视为待补发平台

## Reddit 处理要点

- 优先使用旧版个人主页发帖页：
  - `https://old.reddit.com/user/<username>/submit`
- 推荐发帖类型：
  - `text`
- 文风建议：
  - 第一人称
  - 轻量使用笔记
  - 不写强推荐
  - 不写产品卖点清单
  - 不写“立即试用”式结尾
- 常见阻塞：
  - `reCAPTCHA`
  - `That was a tricky one. Why don't you try that again.`
- 判断原则：
  - 如果标题、正文、`submit` 和 `reCAPTCHA` 都已出现，但提交后仍报上面那类提示，优先判断为平台风控
  - 这时不要继续误判为文案问题，应让用户手动完成最后一步

## 自动化判定原则

### 真正成功

- 腾讯云：后台出现 `审核中` 或 `已发布`
- 阿里云：跳转到文章详情页
- 博客园：博客已开通且文章后台可用
- Reddit：页面跳转或出现明确发帖成功结果

### 需要人工接管

- 出现滑块、拼图或强交互验证码
- Reddit 出现 `reCAPTCHA` 且自动提交后仍提示 `That was a tricky one`
- 页面表单已完整，但最后一步被平台风控阻塞

### 不能误判为失败

- `审核中`：已提交成功，等待审核
- `已发布`：公开可见
- `未通过`：需要进入后台修改后重新提交
- 博客园显示审核队列：等待开通，不是失败
- 腾讯云已出现 `addArticle` / `editArticle`：应继续回后台确认
- 阿里云未跳转详情页：应继续检查必填项和安全验证

## 与用户沟通

- 触发验证码时，明确说明需要用户接管
- 文章被驳回时，先说明驳回原因，再说明重写方向
- 发布完成后，给出各平台状态、可访问链接和待办人工步骤
