---
name: "developer-community-publisher"
description: "Coordinates article cleanup and browser-based publishing for Tencent Cloud, Alibaba Cloud, CNBlogs, and Reddit. Invoke when users want an end-to-end publishing workflow."
---

# Developer Community Publisher

用于作为总入口，协调“社区版内容清洗”和“多平台浏览器发布”两类 skill，完成从原文整理到实际投递的整条流程。

适用场景：

- 用户要求把原始文章改写后发布到一个或多个开发者社区
- 用户要求处理“先清洗内容，再实际发帖”的完整链路
- 用户要求修复被社区驳回的文章并重新提交
- 用户不想手动决定该先改稿还是先发稿

## 入口职责

- 先判断原文是否需要社区化清洗
- 需要时先调用 `community-article-cleaner`
- 拿到社区版内容后，再调用 `multi-platform-article-publisher`
- 在结果汇总时，统一向用户说明各平台状态、剩余人工步骤和待补发平台

## 推荐流程

1. 读取原始文章和用户目标平台。
2. 判断当前稿件是否含明显营销或引流内容。
3. 如果需要，先调用 `community-article-cleaner` 生成社区版标题、摘要和正文。
4. 再调用 `multi-platform-article-publisher` 执行浏览器发布、状态检查和重提。
5. 若任一平台触发验证码或资格门槛，明确标记为人工接管或待补发。

## 何时优先调用内容清洗 skill

- 原文带明显宣传语、外链列表、下载引导
- 原文包含未脱敏信息或不适合公开的内部细节
- 平台已经因广告或引流驳回过一次
- 用户要求把同一篇文章复用到多个社区

## 何时直接进入发布 skill

- 用户已经提供了明确的社区版标题、摘要和正文
- 当前任务是补发、重提、查状态，而不是改稿
- 平台问题主要是验证码、资格开通、后台状态核对

## 当前拆分结果

- `community-article-cleaner`
  - 负责去广告化、去引流化、脱敏和社区版重写
- `multi-platform-article-publisher`
  - 负责腾讯云、阿里云、博客园、Reddit 的实际浏览器提交与状态判断

## 交付要求

- 给出最终采用的社区版内容或说明沿用用户已提供版本
- 给出每个平台的最新状态
- 明确哪些步骤已完成、哪些需要人工接管、哪些平台仍待补发
