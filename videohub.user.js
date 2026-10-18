// ==UserScript==
// @name         VideoHub - Multi-site Video Downloader
// @namespace    local.videohub.downloader
// @version      2.1.0
// @description  YouTube / Bilibili / X / 小红书 / 抖音统一下载入口，本地 yt-dlp 执行。
// @author       ChatGPT
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://youtube.com/*
// @match        https://www.bilibili.com/*
// @match        https://m.bilibili.com/*
// @match        https://x.com/*
// @match        https://www.x.com/*
// @match        https://twitter.com/*
// @match        https://www.twitter.com/*
// @match        https://www.xiaohongshu.com/*
// @match        https://xiaohongshu.com/*
// @match        https://www.douyin.com/*
// @match        https://douyin.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '2.1.0';
  const API = 'http://127.0.0.1:18765';
  const ROOT_ID = 'videohub-userscript-v200';

  let localToken = null;
  let lastHref = location.href;

  console.info(`[VideoHub] v${VERSION} loaded`, location.href);

  const PLATFORM_INFO = {
    youtube: { name: 'YouTube', icon: '▶' },
    bilibili: { name: 'Bilibili', icon: '哔' },
    x: { name: 'X', icon: '𝕏' },
    xiaohongshu: { name: '小红书', icon: 'RED' },
    douyin: { name: '抖音', icon: '♪' },
  };

  function detectPlatform() {
    const host = location.hostname.toLowerCase();

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
    if (host === 'bilibili.com' || host.endsWith('.bilibili.com')) return 'bilibili';
    if (host === 'x.com' || host.endsWith('.x.com') ||
        host === 'twitter.com' || host.endsWith('.twitter.com')) return 'x';
    if (host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) return 'xiaohongshu';
    if (host === 'douyin.com' || host.endsWith('.douyin.com')) return 'douyin';

    return null;
  }

  function isLikelySingleItemPage(platform) {
    const path = location.pathname;

    switch (platform) {
      case 'youtube':
        return (
          (path === '/watch' && new URL(location.href).searchParams.has('v')) ||
          /^\/shorts\/[^/]+/.test(path) ||
          /^\/live\/[^/]+/.test(path)
        );

      case 'bilibili':
        return (
          /^\/video\/(?:BV|av)[A-Za-z0-9]+/i.test(path) ||
          /^\/bangumi\/play\//.test(path) ||
          /^\/cheese\/play\//.test(path)
        );

      case 'x':
        return /\/status\/\d+/.test(path);

      case 'xiaohongshu':
        return (
          /^\/explore\/[A-Za-z0-9]+/.test(path) ||
          /^\/discovery\/item\/[A-Za-z0-9]+/.test(path)
        );

      case 'douyin':
        return (
          /^\/video\/\d+/.test(path) ||
          /^\/note\/\d+/.test(path)
        );

      default:
        return false;
    }
  }

  function request(method, path, body = null, needsToken = false) {
    return new Promise((resolve, reject) => {
      const headers = {};

      if (body !== null) {
        headers['Content-Type'] = 'application/json';
      }

      if (needsToken && localToken) {
        headers['X-Local-Token'] = localToken;
      }

      GM_xmlhttpRequest({
        method,
        url: `${API}${path}`,
        headers,
        data: body !== null ? JSON.stringify(body) : undefined,
        timeout: path === '/subtitles' ? 100000 : 8000,

        onload(resp) {
          let data = {};
          try {
            data = JSON.parse(resp.responseText || '{}');
          } catch {
            data = { raw: resp.responseText };
          }

          if (resp.status >= 200 && resp.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || `HTTP ${resp.status}`));
          }
        },

        ontimeout() {
          reject(new Error('连接本地 VideoHub 服务超时'));
        },

        onerror() {
          reject(new Error('无法连接本地 VideoHub 服务'));
        },
      });
    });
  }

  function notify(text) {
    try {
      GM_notification({
        title: 'VideoHub',
        text,
        timeout: 4500,
      });
    } catch {
      console.info('[VideoHub]', text);
    }
  }

  function style(el, rules) {
    Object.assign(el.style, rules);
    return el;
  }

  function makeAction(text, mode) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.dataset.mode = mode;

    style(btn, {
      all: 'initial',
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      borderRadius: '10px',
      color: '#ffffff',
      padding: '11px 10px',
      margin: '2px 0',
      cursor: 'pointer',
      fontSize: '14px',
      lineHeight: '20px',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif',
    });

    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) btn.style.background = 'rgba(255,255,255,.11)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });

    return btn;
  }

  function makeCheckbox(labelText, storageKey, defaultValue) {
    const row = document.createElement('label');
    style(row, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '7px 8px',
      color: '#d8d8d8',
      fontSize: '12px',
      lineHeight: '18px',
      cursor: 'pointer',
      userSelect: 'none',
    });

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(GM_getValue(storageKey, defaultValue));
    style(input, {
      width: '15px',
      height: '15px',
      margin: '0',
      cursor: 'pointer',
    });

    const text = document.createElement('span');
    text.textContent = labelText;

    input.addEventListener('change', () => {
      GM_setValue(storageKey, input.checked);
    });

    row.appendChild(input);
    row.appendChild(text);

    return { row, input };
  }

  function mount() {
    try {
      if (document.getElementById(ROOT_ID)) return;

      const host = document.createElement('div');
      host.id = ROOT_ID;

      style(host, {
        all: 'initial',
        position: 'fixed',
        right: '20px',
        bottom: '24px',
        zIndex: '2147483647',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif',
      });

      const panel = document.createElement('div');
      style(panel, {
        display: 'none',
        position: 'absolute',
        right: '0',
        bottom: '57px',
        width: 'min(360px, calc(100vw - 40px))',
        maxHeight: 'calc(100vh - 110px)',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '11px',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '15px',
        background: 'rgba(24,24,24,.985)',
        boxShadow: '0 14px 42px rgba(0,0,0,.42)',
        color: '#ffffff',
      });

      const title = document.createElement('div');
      title.textContent = 'VideoHub';
      style(title, {
        padding: '3px 7px 1px',
        fontSize: '15px',
        lineHeight: '20px',
        fontWeight: '800',
        color: '#ffffff',
      });

      const platformLine = document.createElement('div');
      style(platformLine, {
        padding: '1px 7px 9px',
        fontSize: '12px',
        lineHeight: '18px',
        color: '#aaaaaa',
      });

      const videoBtn = makeAction('🎬 下载最佳画质视频', 'video');
      const audioBtn = makeAction('🎧 提取 MP3 音频', 'audio');
      const subtitleBtn = makeAction('📝 仅保存字幕', 'subtitle');

      const separator = document.createElement('div');
      style(separator, {
        height: '1px',
        margin: '7px 5px',
        background: 'rgba(255,255,255,.10)',
      });

      const subtitlesOption = makeCheckbox(
        '下载视频时同时保存字幕（若有）',
        'videohub_include_subtitles',
        true
      );

      const cookiesOption = makeCheckbox(
        '使用浏览器登录态（仅本机读取）',
        'videohub_use_cookies',
        false
      );

      const loadSubs = document.createElement('button');
      loadSubs.type = 'button';
      loadSubs.textContent = '加载 / 刷新可用字幕';
      loadSubs.className = 'videohub-subtitle-refresh';
      const subtitleButtonStyles = document.createElement('style');
      subtitleButtonStyles.textContent = `
        #${ROOT_ID} .videohub-subtitle-refresh {
          all: initial;
          display: block;
          box-sizing: border-box;
          width: calc(100% - 14px);
          margin: 10px 7px;
          padding: 9px 12px;
          border: 1px solid #484848;
          border-radius: 9px;
          background: #303030;
          color: #ededed;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          line-height: 20px;
          text-align: center;
          cursor: pointer;
          transition: background 150ms ease, border-color 150ms ease;
        }
        #${ROOT_ID} .videohub-subtitle-refresh:hover:not(:disabled) {
          background: #3b3b3b;
          border-color: #707070;
        }
        #${ROOT_ID} .videohub-subtitle-refresh:active:not(:disabled) {
          background: #252525;
        }
        #${ROOT_ID} .videohub-subtitle-refresh:focus-visible {
          outline: 2px solid #a9c7ff;
          outline-offset: 2px;
        }
        #${ROOT_ID} .videohub-subtitle-refresh:disabled {
          opacity: .48;
          cursor: default;
        }
        @media (prefers-reduced-motion: reduce) {
          #${ROOT_ID} .videohub-subtitle-refresh { transition: none; }
        }
      `;
      host.appendChild(subtitleButtonStyles);
      const subtitleList = document.createElement('div');
      style(subtitleList, { maxHeight: '200px', overflowY: 'auto', padding: '0 7px', fontSize: '12px', lineHeight: '22px' });
      subtitleList.textContent = '未加载时使用默认语言；加载后可多选人工、自动或翻译字幕。';
      let subtitleContext = null;
      let selectedTracks = null;
      let loadingSubtitles = false;
      function contextKey() { return JSON.stringify([location.href, cookiesOption.input.checked]); }
      function resetSubtitles() {
        subtitleContext = null;
        selectedTracks = null;
        subtitleList.textContent = '页面或登录态已变化，请重新加载字幕列表。';
      }
      cookiesOption.input.addEventListener('change', resetSubtitles);
      loadSubs.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = contextKey();
        loadingSubtitles = true;
        loadSubs.disabled = true;
        subtitleList.textContent = '正在解析可用字幕…';
        try {
          if (!await healthCheck()) throw new Error('请先启动本地服务');
          const data = await request('POST', '/subtitles', {
            url: location.href, use_cookies: cookiesOption.input.checked,
          }, true);
          if (key !== contextKey()) return;
          subtitleContext = key;
          selectedTracks = [];
          subtitleList.replaceChildren();
          if (!data.tracks.length) subtitleList.textContent = '当前内容未发现可用字幕。';
          for (const track of data.tracks) {
            const label = document.createElement('label');
            style(label, { display: 'block', cursor: 'pointer' });
            const input = document.createElement('input');
            input.type = 'checkbox';
            const value = { language: track.language, source: track.source };
            const kind = track.source === 'manual' ? '人工' : (track.translated ? '自动翻译' : '自动生成原文');
            label.append(input, document.createTextNode(` ${track.name} · ${track.language} · ${kind}`));
            input.addEventListener('change', () => {
              if (input.checked) selectedTracks.push(value);
              else selectedTracks = selectedTracks.filter(t => t !== value);
            });
            subtitleList.appendChild(label);
          }
          setStatus('请选择一种或多种字幕；自动翻译字幕可能受平台限流。');
        } catch (err) {
          if (key === contextKey()) {
            resetSubtitles();
            subtitleList.textContent = `加载失败：${err.message}，可重试。`;
          }
        } finally {
          loadingSubtitles = false;
          loadSubs.disabled = false;
        }
      });

      const status = document.createElement('div');
      status.textContent = `脚本 v${VERSION} 已加载`;
      style(status, {
        minHeight: '20px',
        margin: '7px 7px 2px',
        color: '#aaaaaa',
        fontSize: '12px',
        lineHeight: '17px',
        wordBreak: 'break-word',
      });

      const main = document.createElement('button');
      main.type = 'button';
      main.textContent = '↓ VideoHub';

      style(main, {
        all: 'initial',
        boxSizing: 'border-box',
        display: 'block',
        border: '2px solid rgba(255,255,255,.95)',
        borderRadius: '999px',
        background: '#e62117',
        color: '#ffffff',
        fontWeight: '800',
        fontSize: '14px',
        lineHeight: '20px',
        padding: '10px 16px',
        cursor: 'pointer',
        boxShadow: '0 6px 22px rgba(0,0,0,.34)',
        fontFamily: 'inherit',
      });

      panel.appendChild(title);
      panel.appendChild(platformLine);
      panel.appendChild(videoBtn);
      panel.appendChild(audioBtn);
      panel.appendChild(subtitleBtn);
      panel.appendChild(separator);
      panel.appendChild(subtitlesOption.row);
      panel.appendChild(cookiesOption.row);
      panel.appendChild(loadSubs);
      panel.appendChild(subtitleList);
      panel.appendChild(status);
      host.appendChild(panel);
      host.appendChild(main);

      (document.body || document.documentElement).appendChild(host);

      const actions = [videoBtn, audioBtn, subtitleBtn];

      function setStatus(text) {
        status.textContent = text;
      }

      function setBusy(busy) {
        loadSubs.disabled = busy;
        for (const input of subtitleList.querySelectorAll('input')) input.disabled = busy;
        for (const btn of actions) {
          btn.disabled = busy;
          btn.style.opacity = busy ? '0.48' : '1';
          btn.style.cursor = busy ? 'default' : 'pointer';
        }
      }

      function refreshPageState() {
        if (subtitleContext && subtitleContext !== contextKey()) resetSubtitles();
        const platform = detectPlatform();
        const info = platform ? PLATFORM_INFO[platform] : null;
        const single = platform ? isLikelySingleItemPage(platform) : false;

        if (!platform) {
          host.style.display = 'none';
          return;
        }

        host.style.display = 'block';
        main.textContent = `${info.icon} ↓ VideoHub`;

        if (single) {
          main.style.opacity = '1';
          platformLine.textContent = `${info.name} · 当前单视频/帖子页面`;
        } else {
          main.style.opacity = '0.72';
          platformLine.textContent = `${info.name} · 请先打开具体视频/帖子`;
        }

        console.info(
          `[VideoHub] platform=${platform}, singleItem=${single}`,
          location.href
        );
      }

      async function healthCheck() {
        try {
          const data = await request('GET', '/health');
          localToken = data.token || null;

          if (!localToken) {
            throw new Error('本地服务未返回安全令牌');
          }

          const ffmpeg = data.ffmpeg ? 'FFmpeg ✓' : 'FFmpeg ✗';
          const version = data.yt_dlp_version || 'unknown';

          setStatus(`本地服务已连接 · yt-dlp ${version} · ${ffmpeg}`);
          return data;
        } catch (err) {
          localToken = null;
          setStatus(`本地服务未连接：${err.message}`);
          return null;
        }
      }

      async function poll(jobId) {
        async function tick() {
          try {
            const data = await request(
              'GET',
              `/status?id=${encodeURIComponent(jobId)}`,
              null,
              true
            );

            if (data.state === 'done') {
              setBusy(false);
              setStatus(`完成：${data.message || '文件已保存'}`);
              notify(`${data.platform_name || '视频'} 下载完成`);
              return;
            }

            if (data.state === 'error') {
              setBusy(false);
              setStatus(`失败：${data.message || '未知错误'}`);
              notify('下载失败，请查看 VideoHub 本地服务终端');
              return;
            }

            const percent = data.percent ? ` · ${data.percent}` : '';
            const speed = data.speed ? ` · ${data.speed}` : '';
            const eta = data.eta ? ` · ETA ${data.eta}` : '';
            const message = data.message || '处理中';

            setStatus(`${message}${percent}${speed}${eta}`);
            setTimeout(tick, 1200);
          } catch (err) {
            setBusy(false);
            setStatus(`状态查询失败：${err.message}`);
          }
        }

        tick();
      }

      main.addEventListener('mouseenter', () => {
        main.style.filter = 'brightness(1.08)';
      });

      main.addEventListener('mouseleave', () => {
        main.style.filter = '';
      });

      main.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const opening = panel.style.display === 'none';
        panel.style.display = opening ? 'block' : 'none';

        if (opening) {
          refreshPageState();
          await healthCheck();
        }
      });

      panel.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      document.addEventListener('click', () => {
        panel.style.display = 'none';
      });

      for (const btn of actions) {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const platform = detectPlatform();

          if (!platform || !isLikelySingleItemPage(platform)) {
            setStatus('当前不是可识别的单视频/帖子页面，请先打开具体内容。');
            return;
          }

          if (loadingSubtitles) { setStatus('请等待字幕列表加载完成。'); return; }
          if (subtitleContext !== contextKey() && subtitleContext !== null) resetSubtitles();
          const needsSubtitles = btn.dataset.mode === 'subtitle' ||
            (btn.dataset.mode === 'video' && subtitlesOption.input.checked);
          if (needsSubtitles && selectedTracks !== null && !selectedTracks.length) {
            setStatus('请至少勾选一种字幕，或关闭视频同时保存字幕选项。');
            return;
          }
          const health = await healthCheck();
          if (!health) return;

          if (btn.dataset.mode === 'audio' && !health.ffmpeg) {
            setStatus('提取 MP3 需要 FFmpeg，请先安装 FFmpeg。');
            return;
          }

          setBusy(true);
          setStatus('正在创建下载任务…');

          try {
            const result = await request(
              'POST',
              '/download',
              {
                url: location.href,
                mode: btn.dataset.mode,
                use_cookies: cookiesOption.input.checked,
                include_subtitles: subtitlesOption.input.checked,
                subtitle_tracks: selectedTracks,
              },
              true
            );

            setStatus(`任务已创建 · ${result.platform_name || platform}`);
            poll(result.job_id);
          } catch (err) {
            setBusy(false);
            setStatus(`创建任务失败：${err.message}`);
          }
        });
      }

      refreshPageState();

      // YouTube 的 SPA 导航事件。
      window.addEventListener('yt-navigate-finish', refreshPageState);
      window.addEventListener('popstate', refreshPageState);

      // 其它站点也大量使用 SPA。URL 轮询作为统一兜底，
      // 避免依赖各个平台随时可能变化的内部事件。
      setInterval(() => {
        if (location.href !== lastHref) {
          lastHref = location.href;
          panel.style.display = 'none';
          refreshPageState();
        }
      }, 700);

      console.info('[VideoHub] button mounted successfully');
    } catch (err) {
      console.error('[VideoHub] mount failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
