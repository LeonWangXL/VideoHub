# VideoHub v2.1.0

VideoHub 是一个“油猴统一入口 + 本机 yt-dlp”的多站点视频下载方案。

当前目标平台：

- YouTube
- Bilibili
- X / Twitter
- 小红书
- 抖音

## 为什么仍然采用本机 helper

纯油猴直接抓媒体 URL 在这些平台上都不够稳定。常见问题包括：

- DASH 音视频分离
- 临时签名 URL
- SPA 页面结构变化
- 登录态 / 风控 / Cookie
- HLS / m3u8
- 视频和音频需要 FFmpeg 合并
- 上游接口变化频繁

因此油猴只负责统一 UI，本机 helper 负责调用 yt-dlp。

## 1. 安装依赖

Python 3.10+：

```bash
python -m pip install -U "yt-dlp[default]"
```

另外建议系统安装：

- FFmpeg / ffprobe
- Deno（主要用于当前 YouTube 的 JavaScript challenge 支持）

FFmpeg 是 MP3 提取、字幕转换以及分离音视频合并的关键依赖。

## 2. 启动本地 helper

```bash
python videohub_helper.py
```

正常会看到：

```text
VideoHub Local Helper v2.0.0
监听地址: http://127.0.0.1:18765
```

保持这个终端窗口运行。

## 3. 安装油猴脚本

Tampermonkey：

1. 新建脚本。
2. 删除默认内容。
3. 粘贴 `videohub.user.js` 全部内容。
4. 保存。
5. 刷新支持的网站。

页面右下角应出现：

```text
↓ VideoHub
```

这个按钮在支持域名上始终显示，因此不会再因为某个平台的 SPA 页面识别变化而“完全找不到按钮”。

## 4. 使用

打开具体视频或帖子页面，点击右下角 `VideoHub`。

支持：

- 最佳画质视频
- MP3
- 仅字幕
- 视频同时保存字幕
- 可选“使用浏览器登录态”

默认保存目录：

```text
~/Downloads/VideoHub/
```

每个平台会进入自己的子目录。

## 浏览器登录态

默认关闭。

小红书、抖音、X、Bilibili 的部分内容可能要求登录态或触发平台风控。此时可以在 VideoHub 菜单中勾选：

```text
使用浏览器登录态（仅本机读取）
```

helper 会调用 yt-dlp 的 `--cookies-from-browser`。

浏览器类型在 `config.json` 中配置：

```json
{
  "browser": "chrome",
  "browser_profile": ""
}
```

例如可改成：

- `edge`
- `firefox`
- `brave`
- `chromium`

具体支持范围由当前 yt-dlp 决定。

注意：Cookie 只由本机 yt-dlp 读取，不通过网页发送到远程服务。本脚本不会使用 `document.cookie` 收集登录信息。

## 安全设计

本地 helper：

- 只监听 `127.0.0.1`
- 不提供 CORS
- 每次启动随机生成本地安全令牌
- 创建任务和查询状态都必须携带令牌
- 只允许白名单平台
- 只接受单视频 / 单帖子 URL
- 日志会去掉 URL query，避免小红书 `xsec_token` 等参数直接出现在终端错误信息中

## 平台稳定性

不同平台不能认为是同一稳定等级。

YouTube、Bilibili、X 有明确的 yt-dlp extractor，但平台更新仍可能临时导致失效。

抖音也有 yt-dlp extractor，但风控和接口变化会影响成功率。

小红书是最需要保守预期的平台之一：登录态、验证码、短链接校验和最高画质策略都可能变化。遇到问题优先更新 yt-dlp：

```bash
python -m pip install -U "yt-dlp[default]"
```

如果 stable 刚好落后于平台变化，可尝试 nightly：

```bash
python -m pip install -U --pre "yt-dlp[default]"
```

## 诊断

如果右下角没有按钮：

F12 -> Console 搜索：

```text
VideoHub
```

正常应出现：

```text
[VideoHub] v2.0.0 loaded
[VideoHub] platform=...
[VideoHub] button mounted successfully
```

如果按钮存在但下载失败：

1. 看油猴面板状态。
2. 看 `videohub_helper.py` 终端输出。
3. 更新 yt-dlp。
4. 必要时开启浏览器登录态。
5. 检查 FFmpeg。

## 范围边界

这个版本只处理单视频 / 单帖子下载，不做：

- 整个 UP 主 / 账号批量抓取
- 整个收藏夹批量抓取
- DRM 绕过
- 付费权限绕过
- 验证码绕过

请只下载你有权保存的内容，并遵守内容许可和平台规则。


## v2.1.0 字幕选择与修复

更新后需要重启 Python helper，并将新版 `videohub.user.js` 重新保存到 Tampermonkey，然后刷新视频页面。

1. 打开 VideoHub 面板，点击“加载 / 刷新可用字幕”。解析可能需要几十秒。
2. 勾选一种或多种字幕。列表标注人工、自动生成原文和自动翻译，并显示语言代码。
3. 点击“仅保存字幕”，或勾选“下载视频时同时保存字幕”后下载视频。

人工与自动字幕分别保存，文件名带 `manual` / `auto`，避免同语言互相覆盖。无 FFmpeg 时保留原字幕格式，有 FFmpeg 时转为 SRT。

未加载列表时仍支持原来的快捷下载：优先匹配配置中的语言，同一语言优先人工字幕或原文自动字幕（如 `en-orig`）；若没有匹配语言，尝试一条原文自动字幕。加载列表后必须明确勾选字幕。切换视频或浏览器登录态后需重新加载。

修复内容：逐项下载避免一种字幕失败阻断其他字幕；不再把“没有匹配语言且没有生成文件”报告为成功；字幕下载不再要求存在可下载视频格式；视频成功后字幕解析失败只报告警告。YouTube 429 仍最多重试一次，自动翻译字幕的限流无法保证消除。

本地回归检查：`python -m unittest -v test_subtitles`；脚本语法检查：`node --check videohub.user.js`。


### 本次验证记录

- 11 项回归检查覆盖：精确语言选择、人工/自动来源隔离、原文优先、中文原文回退、429 后继续其他语言、无文件不报成功、视频成功不受字幕异常影响，以及真实 yt-dlp 本地字幕数据的保存和 SRT 转换。
- 对 `https://www.youtube.com/watch?v=Tvmmv93FZgc` 进行了不使用浏览器 Cookie 的真实字幕下载：`zh` 自动字幕成功，SRT 96,970 字节、1,493 条。测试文件保存在项目 `.verification/YouTube/` 下。
- 未验证 Tampermonkey 浏览器中的实际交互，也未对其他平台逐站实测。
