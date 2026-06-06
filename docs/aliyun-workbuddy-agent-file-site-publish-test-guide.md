# 我是怎么测试 WorkBuddy + Agent 的文件与静态网站发布流程的

最近我在整理一条比较完整的 Agent 交付链路，重点不是让 Agent 多会“生成”，而是让它生成完之后，能把结果稳定地交出去。

这里的“交付”主要有两种：

- 生成一个文件，然后给出可访问链接
- 生成一整个静态目录，然后直接发布成网站

我这次没有把重点放在某个产品介绍上，而是把它当成一次标准测试任务来做。目标很简单：验证 WorkBuddy 和 Agent 组合起来后，能不能把“生成结果 -> 上传发布 -> 返回链接 -> 再次更新”这条链路跑顺。

这篇文章主要记录我的测试步骤、观察点、结果和几段实际会用到的代码。

## 一、我这次主要测什么

我把测试拆成了 4 组：

1. 单文件发布能不能稳定返回链接
2. 图片、视频、PDF 这类文件能不能直接预览
3. 静态目录能不能直接发布成网站
4. 同一个站点后续更新时，能不能避免“线上半更新”

如果这 4 件事都成立，那这条发布链路基本就能接进日常的 Agent 工作流里。

## 二、我用的测试思路

这次我尽量不用“手工点点点”的方式来判断，而是把每一步都拆成可以验证的动作：

- Agent 先生成文件或站点目录
- 调用上传准备接口
- 把文件内容上传到返回的地址
- 调用完成接口
- 检查最终返回的公开链接
- 再用浏览器或脚本验证结果是否真的能访问

也就是说，我不是只看接口是否 `200 OK`，而是会继续验证：

- 链接能不能打开
- 预览是不是符合预期
- 静态资源路径有没有丢
- 更新前后入口是不是稳定

## 三、第一组测试：单文件发布

第一组最简单，我先拿几个常见文件做样本：

- `hello.txt`
- `poster.png`
- `report.pdf`
- `demo.mp4`

测试目标不是“能不能上传”，而是“上传完成后能不能马上得到可交付结果”。

我比较关心这几个返回值：

- 文件公开地址
- 下载地址
- 预览或播放地址
- 文件大小和类型有没有记录正确

下面是我测试时最常用的一段流程示意。

```javascript
async function publishFile(file, apiKey) {
  const prepareRes = await fetch('https://www.okfile.com/api/upload/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      apiKey
    })
  });

  const prepare = await prepareRes.json();

  await fetch(prepare.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': String(file.size)
    },
    body: file
  });

  const completeRes = await fetch('https://www.okfile.com/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId: prepare.uploadId,
      id: prepare.id
    })
  });

  return completeRes.json();
}
```

我在这一步主要看 3 个结果：

1. 文本和普通文件是否能返回稳定地址
2. 图片、视频、PDF 是否能直接打开预览页
3. 返回结果能不能直接塞回 WorkBuddy 的任务输出里

如果一个任务执行完，只给我一个“本地文件路径”，那它还不算交付完成。只有当它给出真正能访问的链接，这个结果才适合继续流转给别人。

## 四、第二组测试：用 Agent 自动跑单文件发布

只测接口还不够，我还会专门测一遍 Agent 场景。

做法是让 Agent 执行下面这类步骤：

1. 生成一个测试文件
2. 读取文件元信息
3. 调用发布接口
4. 把返回链接写回最终结果

我会特别检查 Agent 输出是不是这种结构：

```json
{
  "success": true,
  "fileName": "report.pdf",
  "url": "https://...",
  "downloadUrl": "https://...",
  "playUrl": "https://..."
}
```

这样做的意义是，后面的工作流节点不用再猜“文件到底放哪了”，而是直接消费标准结果。

## 五、第三组测试：静态目录发布成网站

文件发布跑通之后，我会开始测第二类场景：整站目录发布。

我这次主要测了两个样本目录：

- 一个带 `index.html` 的标准静态站点
- 一个没有根 `index.html` 的资料目录

这两类都很常见。

第一类更像官网、文档页或展示页；第二类更像报告目录、图片目录或导出的构建产物。

我测试时重点看下面几个点：

- 目录结构上传后是否保留
- `assets/`、`images/`、`scripts/` 这类相对路径是否还能正常访问
- 根目录有 `index.html` 时，访问 `/` 是否直接渲染页面
- 根目录没有 `index.html` 时，访问 `/` 是否显示目录列表

下面是一段我会用来描述站点发布步骤的伪代码：

```javascript
async function publishSite(files, apiKey) {
  const prepare = await fetch('https://www.okfile.com/api/site/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: files.map((item) => ({
        path: item.relativePath,
        size: item.size,
        contentType: item.contentType
      })),
      apiKey
    })
  }).then((r) => r.json());

  for (const item of prepare.files) {
    await fetch(item.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': item.contentType,
        'Content-Length': String(item.size)
      },
      body: files.find((f) => f.relativePath === item.path).blob
    });
  }

  return fetch('https://www.okfile.com/api/site/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId: prepare.siteId,
      token: prepare.token
    })
  }).then((r) => r.json());
}
```

这里真正要测的不是“文件传完没有”，而是“这个目录最后是不是真的成了一个网站”。

## 六、第四组测试：更新已有站点

这是我最看重的一组。

因为很多流程第一次发布其实都不难，真正容易出问题的是第二次、第三次更新。

如果更新方式做得不好，线上会短时间进入一种很难受的状态：

- HTML 已经是新版
- CSS 还是旧版
- 某些图片还没上传完
- 页面打开一半是新的，一半是旧的

所以我测试这块时，会刻意做两轮连续更新：

1. 先发布一个初始版本
2. 再改几处 HTML、CSS 和图片
3. 重新执行更新流程
4. 连续刷新页面，观察是否出现混合状态

我最终希望看到的是：

- 入口地址不变
- 新版本完成前，旧版本继续可访问
- 切换完成后，页面一次性进入新版本

如果这一点成立，站点更新才适合交给 Agent 自动执行。

## 七、我会怎么记录测试结果

为了避免最后只剩一句“测过了，应该没问题”，我会把结果按下面这个表来记：

| 测试项 | 关注点 | 结果 |
| --- | --- | --- |
| 单文件发布 | 是否返回 `url` / `downloadUrl` / `playUrl` | 通过 |
| 图片/PDF/视频预览 | 是否能直接打开 | 通过 |
| 目录发布 | 根目录与相对路径是否保留 | 通过 |
| 无 `index.html` 目录 | 是否展示目录列表 | 通过 |
| 站点更新 | 是否避免半更新状态 | 通过 |
| 结果回填 | Agent 是否返回标准结果结构 | 通过 |

这种记录方式有个好处：后面如果换 Agent、换提示词，或者换上传实现，我可以很快重新回归一遍。

## 八、几个我觉得最值得提前测的细节

这次做下来，我觉得下面几件事特别值得提前验证。

### 1. 文件大小一定要带上

很多上传流程表面能通，但到了真实环境里，没有 `Content-Length` 或大小信息就容易出问题。

尤其是 Agent 自动发请求时，最好明确把大小作为输入或元数据带上。

### 2. 目录路径不要在上传前被改写

静态站点最怕的不是上传失败，而是路径悄悄变了。

一旦 `assets/app.js` 变成别的路径，页面就会出现“主 HTML 正常、资源全部 404”的情况。

### 3. 要同时测“首发”和“更新”

很多实现首发没有问题，但更新时会露出问题。

如果你的目标是让 Agent 长期维护一个固定入口，那更新流程必须单独测。

### 4. 不要只测接口成功，要测页面结果

接口返回成功，只能说明“动作被接受了”；真正的用户结果，还是要靠页面和链接验证。

所以我通常会补两步：

- 程序侧检查返回 JSON
- 浏览器侧打开真实链接

## 九、为什么我最后更愿意把“发布”收进 Agent 工作流

做完这些测试之后，我最大的感受是：很多 Agent 系统真正缺的不是“生成能力”，而是“交付闭环”。

如果发布这一步还是人工去接：

- 人要手动找文件
- 人要手动上传
- 人要手动复制链接
- 人要再把链接贴回任务系统

这条链路很容易断。

但如果测试跑顺之后，把发布动作直接做成标准步骤：

1. Agent 生成内容
2. Agent 判断是单文件还是站点目录
3. Agent 自动执行发布
4. Agent 返回公开链接

那 WorkBuddy 里拿到的就不再是“某个本地路径”，而是“一个已经可交付的结果”。

## 十、附一个开源实现参考

如果你想找一个可运行的参考实现，我这次测试时用到的是这个仓库：

- GitHub: [https://github.com/okfilecom/okfile](https://github.com/okfilecom/okfile)

我更看重它在测试阶段能覆盖这些场景：

- 单文件发布
- 图片、视频、PDF 预览
- 静态目录发布
- 无首页目录列表
- 已有站点继续更新

如果你也在做 WorkBuddy、Agent 或自动化交付相关流程，我很建议把“发布”单独列成一组可回归的测试项，而不是到最后再临时处理。
