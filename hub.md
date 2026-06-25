# Skill 发布渠道记录

更新时间：2026-06-06

## 当前统计

- 目前已整理的相关 skill 发布网站：`3` 个
- 当前仓库里已存在对应平台专用文档：`3` 份
- 当前主技能源文件：`SKILL.md`

## 平台清单

| 序号 | 平台 | 网站 | 当前状态 | 对应文件 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | SkillHub | `https://skillhub.cn/` | 已提交 `1.0.3`，当前 `安全审核中` | `SKILL.skillhub.club.md` | 本地平台文档与打包副本已同步到 `1.0.3`，仓库里保留了 `.publish/skillhub/` 打包产物 |
| 2 | Skills Hub | `https://skills-hub.ai/` | 已发布 `1.0.3` | `SKILL.skills-hub.md` | 当前仓库已有专用格式文档 |
| 3 | The Skills Directory | `https://theskills.directory/` | 已确认存在自助提交入口，但当前暂时停止继续提交 | `SKILL.theskills.directory.md` | 本地平台文档已同步到 `1.0.3`，站点后端提交接口返回 `500`，先暂停 |

## 仓库内相关文件

- 主技能文档：`SKILL.md`
- SkillHub 渠道文档：`SKILL.skillhub.club.md`
- Skills Hub 渠道文档：`SKILL.skills-hub.md`
- The Skills Directory 渠道文档：`SKILL.theskills.directory.md`
- SkillHub 打包目录：`.publish/skillhub/`
- Trae 本地技能副本：`.trae/skills/okfile/SKILL.md`

## 当前可直接回答的结论

- “目前是几个？”：按当前仓库里已明确整理并保留平台专用文档的发布网站计算，`3` 个。
- 如果按“已经做过提交或提交流程处理”的最保守口径，当前至少可确认 `1` 个：
  - `skillhub.cn`
- 其余 `2` 个平台当前仓库里已有专用文档，可继续用于后续同步更新：
  - `skills-hub.ai`
  - `theskills.directory`

## 提交入口与操作方式

| 平台 | 可用入口 | 当前判断 | 建议操作 |
| --- | --- | --- | --- |
| SkillHub | `https://skillhub.cn/` | 公开页面可看到顶部导航含“发布 skill/关于发布skill”相关入口，提交通常需要先登录后进入站内流程 | 登录后优先从站点顶部发布入口进入，继续沿用 `SKILL.skillhub.club.md` |
| Skills Hub | `https://skills-hub.ai/publish` | 已确认存在公开发布页，也支持 CLI 发布 | 网页发布或执行 `npx @skills-hub-ai/cli publish`，使用 `SKILL.skills-hub.md` |
| The Skills Directory | `https://theskills.directory/` | 当前公开搜索只确认首页和 `GitHub` 登录入口，暂未查到明确自助发布页 | 先登录并观察站内能力；如仍无入口，按“人工收录/等待开放提交”记录 |

## 当前建议状态

- `skillhub.cn`
  - 状态：已提交 `1.0.3`，当前 `安全审核中`
  - 下一步：等待审核完成；如继续发新版，沿用已同步到 `1.0.3` 的 `SKILL.skillhub.club.md` 和 `.publish/skillhub/`
- `skills-hub.ai`
  - 状态：技能页已对外公开，当前最新版本为 `1.0.3`
  - 下一步：后续发新版时沿用 `SKILL.skills-hub.md` 和现有 `okfile-2` 条目继续更新
- `theskills.directory`
  - 状态：已确认开放自助发布，但当前暂停提交
  - 下一步：如恢复提交，直接使用已同步到 `1.0.3` 的 `SKILL.theskills.directory.md`

### SkillHub

- 平台：`skillhub.cn`
- 提交日期：`2026-06-05`
- 提交账号：`user_68ec2dc0`
- 提交入口：`https://skillhub.cn/dashboard/publish`
- 使用文档：`SKILL.skillhub.club.md`
- 打包文件：`.publish/skillhub/okfile-skillhub.zip`
- 当前状态：
  - 已成功提交 `OkFile` 的 `1.0.1` 版本
  - 后台“我的 Skills”中已可见条目：`OkFile`
  - 历史状态：`已发布`
- 备注：
  - `1.0.0` 版本已存在，本次通过升级到 `1.0.1` 完成提审
  - `1.0.1` 已补充目录站点发布能力说明，包括站点子域名、目录列表回退、图片视频预览与其它文件下载

### SkillHub 二次更新

- 平台：`skillhub.cn`
- 提交日期：`2026-06-06`
- 提交账号：`user_68ec2dc0`
- 提交入口：`https://skillhub.cn/dashboard`
- 使用文档：`SKILL.skillhub.club.md`
- 打包文件：`.publish/skillhub/okfile-skillhub.zip`
- 当前状态：
  - 已提交 `1.0.3`
  - 后台“我的 Skills”当前显示：`安全审核中`
  - 当前版本号显示：`V 1.0.3`
- 备注：
  - 本次已重新上传同步后的 zip 包
  - 变更说明已补充站点发布能力，包括 `site/prepare`、`site/complete`、`siteUrl`、`entryUrl` 与目录列表回退
  - 等待平台审核完成后，再把状态更新为 `已发布`

## 平台更新记录

### Skills Hub

- 平台：`skills-hub.ai`
- 提交日期：`2026-06-04`
- 提交账号：`okfilecom`
- 提交入口：`https://skills-hub.ai/publish`
- 技能链接：`https://skills-hub.ai/skills/okfile-2`
- 安装命令：`npx @skills-hub-ai/cli install okfile-2`
- 使用文档：`SKILL.skills-hub.md`
- 当前状态：
  - 已补发 `1.0.3`，并在描述与说明中加入 `https://www.okfile.com/`
  - 后台 API 当前显示最新版本：`v1.0.3`
  - 当前公开页显示可见性：`Public`
  - 当前公开内容已包含 `POST /api/site/prepare`、`POST /api/site/complete`、`siteUrl`、`entryUrl`、目录列表回退说明
  - 当前公开页已不再显示 `This skill is a draft`
- 备注：
  - 平台自动生成的安装 slug 不是 `okfile`，而是 `okfile-2`
  - 这次通过平台真实后台接口完成 `version + publish`
  - `npx @skills-hub-ai/cli` 当前安装链路存在依赖包 `404`，暂时不适合作为发布入口
  - 如后续版本更新，优先沿用当前技能页或其编辑页，不要重复新建同名条目
  - 本地平台专用文档已同步到 `1.0.3`

### The Skills Directory

- 平台：`theskills.directory`
- 提交日期：`2026-06-05`
- 提交账号：`okfilecom`
- 提交入口：`https://theskills.directory/submit`
- 目标仓库：`https://github.com/okfilecom/okfile`
- 使用文档：`SKILL.theskills.directory.md`
- 当前状态：
  - 已完成 GitHub OAuth 登录，站点右上角可见 `okfilecom`
  - 已进入正式提交页并成功填写标题、摘要、用途、输入输出、Prompt / workflow、完整 `SKILL.md`、平台和分类
  - 提交请求已实际发出到站点后端接口
  - 后端最终返回通用错误：`Submission failed. Please try again.`
- 已确认的信息：
  - 第一次失败是空字段提交，接口返回 `400`，提示 `Title, description and skill content are required.`
  - 修正字段并再次提交后，请求体已完整，但接口仍返回 `500`
  - 当前更像站点服务端问题，不是前端必填校验问题
- 备注：
  - 站点公开页面已明确提供 `submit` 入口，说明该平台确实支持自助提交
  - 目前按你的要求，暂时不再继续向该网站提交
  - 后续可再次重试，或将本次接口失败情况作为证据反馈给平台维护者

## 本地文件状态

- `SKILL.md` 已清理开头异常 BOM，避免部分平台 frontmatter 解析异常
- 当前本地主技能文档与 3 份平台专用文档已统一到 `1.0.3`
- `.publish/skillhub/okfile/SKILL.md` 也已同步到 `1.0.3`
- 平台专用 skill 文档目前仍为：
  - `SKILL.skillhub.club.md`
  - `SKILL.skills-hub.md`
  - `SKILL.theskills.directory.md`

## 后续更新建议

- 每次修改 `SKILL.md` 后，同步检查这 3 份平台专用文档是否需要更新字段或示例。
- 如果后续再次实际提交平台，建议在本文件补充：
  - 提交日期
  - 提交账号
  - 审核状态
  - 上线链接
  - 备注

## 建议补充字段模板

后续可按下面格式追加：

```md
### 平台更新记录

- 平台：
- 提交日期：
- 提交账号：
- 审核状态：
- 上线链接：
- 备注：
```
