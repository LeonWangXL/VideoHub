// ==UserScript==
// @name         VideoHub - Multi-site Video Downloader
// @namespace    local.videohub.downloader
// @version      2.3.2
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

  const VERSION = '2.3.2';
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
        timeout: ['/subtitles', '/playlist'].includes(path) ? 100000 : 8000,

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
      // Isolate controls from host-page styles (YouTube also styles buttons and labels).
      const ui = document.createElement('div');
      ui.id = ROOT_ID;
      host.attachShadow({ mode: 'open' }).appendChild(ui);

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
      const subtitleList = document.createElement('div');
      style(subtitleList, { maxHeight: '200px', overflowY: 'auto', padding: '0 7px', fontSize: '12px', lineHeight: '22px' });
      subtitleList.textContent = '未加载时使用默认语言；加载后可多选人工、自动或翻译字幕。';
      let subtitleContext = null;
      let selectedTracks = null;
      let loadingSubtitles = false;
      function contextKey() { return JSON.stringify([location.href, cookiesOption.input.checked]); }
      function resetSubtitles() {
        subtitleContext = null;
        subtitleList.textContent = '页面或登录态已变化，请重新加载字幕列表。';
      }
      cookiesOption.input.addEventListener('change', resetSubtitles);
      loadSubs.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = contextKey();
        loadingSubtitles = true;
        updateSelection();
        loadSubs.disabled = true;
        subtitleList.textContent = '正在解析可用字幕…';
        try {
          if (!await healthCheck()) throw new Error('请先启动本地服务');
          const data = await request('POST', '/subtitles', {
            url: location.href, use_cookies: cookiesOption.input.checked,
          }, true);
          if (key !== contextKey()) return;
          subtitleContext = key;
          subtitleList.replaceChildren();
          const kinds = [ ['manual', false, '原始字幕（作者上传）'], ['auto', false, '自动生成'], ['auto', true, '自动翻译'] ];
          if (!data.tracks.length) subtitleList.textContent = '当前视频未发现可用字幕。';
          for (const [source, translated, name] of kinds) {
            const tracks = data.tracks.filter(t => t.source === source && Boolean(t.translated) === translated);
            if (!tracks.length) continue;
            const row = document.createElement('div');
            row.textContent = `${name}：${tracks.map(t => t.name || t.language).join('、')}`;
            style(row, { padding: '8px', borderBottom: '1px solid #343b48' });
            subtitleList.appendChild(row);
          }
          setStatus('已查询当前视频的字幕；批量任务会逐个核对所选语言和来源。');
        } catch (err) {
          if (key === contextKey()) {
            resetSubtitles();
            subtitleList.textContent = `加载失败：${err.message}，可重试。`;
          }
        } finally {
          loadingSubtitles = false;
          loadSubs.disabled = uiBusy;
          updateSelection();
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
      panel.appendChild(subtitlesOption.row);
      panel.appendChild(cookiesOption.row);
      panel.appendChild(loadSubs);
      panel.appendChild(subtitleList);
      const batchBox = document.createElement('div');
      const loadPlaylist = makeAction('☷ 加载 YouTube 播放列表', 'playlist');
      const batchVideo = makeAction('下载所选视频（按上方字幕选项）', 'video');
      const batchSubs = makeAction('仅下载所选字幕', 'subtitle');
      const batchResults = document.createElement('div');
      style(batchResults, { maxHeight: '180px', overflowY: 'auto', fontSize: '12px', whiteSpace: 'pre-wrap' });
      const retryBatch = makeAction('重试失败或字幕不完整的条目', 'retry');
      retryBatch.hidden = true;
      let lastBatchRequest = null;
      let retryUrls = [];
      const playlistItems = document.createElement('div');
      style(playlistItems, { maxHeight: '180px', overflowY: 'auto', fontSize: '12px' });
      const batchHint = document.createElement('div');
      batchHint.textContent = '字幕使用默认语言；可沿用上方所选语言和来源，各视频可用字幕可能不同。最多 500 项。';
      style(batchHint, { fontSize: '12px', padding: '6px' });
      let playlistContext = null;
      const selectAll = makeCheckbox('全选播放列表', 'videohub_playlist_all', true);
      selectAll.input.addEventListener('change', () => {
        for (const input of playlistItems.querySelectorAll('input')) input.checked = selectAll.input.checked;
        updateSelection();
      });
      batchBox.append(loadPlaylist, batchHint, selectAll.row, playlistItems, batchVideo, batchSubs, batchResults, retryBatch);
      panel.appendChild(batchBox);
      loadPlaylist.addEventListener('click', async () => {
        if (!await healthCheck()) return;
        setBusy(true);
        playlistContext = null;
        playlistItems.replaceChildren();
        search.value = '';
        const key = contextKey();
        setStatus('正在加载播放列表…');
        try {
          const data = await request('POST', '/playlist', { url: location.href,
            use_cookies: cookiesOption.input.checked }, true);
          if (key !== contextKey()) throw new Error('页面或登录态已变化，请重新加载');
          for (const item of data.items) {
            const label = document.createElement('label');
            style(label, { display: 'block', padding: '4px' });
            const input = document.createElement('input');
            input.type = 'checkbox'; input.checked = true; input.value = item.url;
            const itemTitle = document.createElement('span');
            itemTitle.textContent = `${item.index}. ${item.title}`;
            label.title = item.title;
            label.append(input, itemTitle);
            playlistItems.appendChild(label);
          }
          selectAll.input.checked = true;
          playlistContext = key;
          updateSelection();
          setStatus(`${data.title} · ${data.items.length} 项，请勾选后下载`);
        } catch (err) { setStatus(`播放列表加载失败：${err.message}`); }
        finally { setBusy(false); }
      });
      retryBatch.addEventListener('click', async () => {
        if (!lastBatchRequest || !retryUrls.length) return;
        if (!await healthCheck()) return;
        setBusy(true);
        try {
          const result = await request('POST', '/batch', { ...lastBatchRequest, urls: retryUrls }, true);
          retryBatch.hidden = true;
          batchResults.textContent = '';
          poll(result.job_id);
        } catch (err) { setBusy(false); setStatus(`重试失败：${err.message}`); }
      });
      for (const btn of [batchVideo, batchSubs]) {
        btn.addEventListener('click', async () => {
          if (loadingSubtitles) { setStatus('请等待字幕列表加载完成。'); return; }
          if (playlistContext !== contextKey()) { setStatus('请先加载当前播放列表。'); return; }
          const urls = [...playlistItems.querySelectorAll('input:checked')].map(input => input.value);
          if (!urls.length) { setStatus('请至少选择一个视频。'); return; }
          if (subtitleContext && subtitleContext !== contextKey()) resetSubtitles();
          if ((btn.dataset.mode === 'subtitle' || subtitlesOption.input.checked) &&
              selectedTracks !== null && !selectedTracks.length) {
            setStatus('请至少勾选一种字幕。'); return;
          }
          if (!await healthCheck()) return;
          setBusy(true);
          try {
            lastBatchRequest = { urls, mode: btn.dataset.mode,
              use_cookies: cookiesOption.input.checked,
              include_subtitles: subtitlesOption.input.checked,
              subtitle_tracks: selectedTracks === null ? null : selectedTracks.map(track => ({ ...track })) };
            retryBatch.hidden = true;
            batchResults.textContent = '';
            const result = await request('POST', '/batch', lastBatchRequest, true);
            poll(result.job_id);
          } catch (err) { setBusy(false); setStatus(`批量任务创建失败：${err.message}`); }
        });
      }
      panel.appendChild(status);
      ui.appendChild(panel);
      ui.appendChild(main);

      (document.body || document.documentElement).appendChild(host);

      const actions = [videoBtn, audioBtn, subtitleBtn];

      let uiBusy = false;
      let connecting = false;
      let scope = 'single';
      let mode = 'video';
      let primary, scopeSingle, scopeBatch, modeSelect, selectedCount, search, connection, taskProgress;
      let singleSummary, subtitleDetails, subtitleSummary, resultsDetails;
      let subtitlePreferenceSummary = '';
      let subtitlePreferences;

      function updateSelection() {
        if (!primary) return;
        const inputs = [...playlistItems.querySelectorAll('input')];
        const count = inputs.filter(input => input.checked).length;
        selectedCount.textContent = `已选 ${count} / ${inputs.length} 项`;
        selectAll.input.checked = inputs.length > 0 && count === inputs.length;
        selectAll.input.indeterminate = count > 0 && count < inputs.length;
        const names = { video: '视频', audio: '音频', subtitle: '字幕' };
        primary.textContent = uiBusy ? '任务进行中…' : scope === 'batch'
          ? `下载${names[mode]} · ${count} 项` : `下载${names[mode]}`;
        primary.disabled = uiBusy || connecting || loadingSubtitles ||
          ((mode === 'subtitle' || (mode === 'video' && subtitlesOption.input.checked)) && selectedTracks !== null && !selectedTracks.length) || (scope === 'batch'
          ? !count || playlistContext !== contextKey() : !isLikelySingleItemPage(detectPlatform()));
        subtitleDetails.hidden = mode === 'audio' || (mode === 'video' && !subtitlesOption.input.checked);
        subtitlesOption.row.hidden = mode !== 'video';
        subtitleSummary.textContent = selectedTracks === null ? '字幕设置 · 中文 / 自动生成'
          : `字幕设置 · ${subtitlePreferenceSummary || '请选择语言和来源'}`;
        primary.setAttribute('aria-label', scope === 'batch' ? `下载所选 ${count} 项${names[mode]}` : `下载当前${names[mode]}`);
      }

      function setScope(value) {
        scope = value;
        scopeSingle.setAttribute('aria-pressed', String(scope === 'single'));
        scopeBatch.setAttribute('aria-pressed', String(scope === 'batch'));
        singleSummary.hidden = scope !== 'single';
        batchBox.style.display = scope === 'batch' ? 'block' : 'none';
        modeSelect.querySelector('[value="audio"]').disabled = scope === 'batch';
        if (scope === 'batch' && mode === 'audio') { mode = 'video'; modeSelect.value = mode; }
        updateSelection();
      }

      function buildInterface() {
        style(panel, { width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 104px)',
          padding: '0', overflow: 'hidden', background: '#191c22', borderRadius: '18px',
          border: '1px solid #393e48', boxShadow: '0 20px 70px #0009' });
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'VideoHub 下载面板');
        main.setAttribute('aria-expanded', 'false');
        const css = document.createElement('style');
        css.textContent = `
          #${ROOT_ID} { font: 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; color: #edf0f7; color-scheme: dark; }
          #${ROOT_ID} *, #${ROOT_ID} *::before, #${ROOT_ID} *::after { box-sizing: border-box; }
          #${ROOT_ID} [hidden][hidden] { display: none !important; }
          #${ROOT_ID} button, #${ROOT_ID} input, #${ROOT_ID} select { font: inherit; }
          #${ROOT_ID} button { transition: background .15s, border-color .15s; }
          #${ROOT_ID} button:focus-visible, #${ROOT_ID} input:focus-visible, #${ROOT_ID} select:focus-visible, #${ROOT_ID} summary:focus-visible { outline: 2px solid #a5c4ff; outline-offset: 2px; }
          #${ROOT_ID} button:disabled { opacity: .45; cursor: not-allowed; }
          #${ROOT_ID} input[type=checkbox] { accent-color: #89adff; width: 16px; height: 16px; flex-shrink: 0; cursor: pointer; }
          #${ROOT_ID} input[type=search], #${ROOT_ID} select { width: 100%; border: 1px solid #414755; border-radius: 9px; padding: 10px 12px; background: #20242c; color: #edf0f7; min-height: 40px; }
          #${ROOT_ID} .vh-header { padding: 18px 20px 14px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #30353e; flex-shrink: 0; }
          #${ROOT_ID} .vh-body { padding: 16px 20px; overflow-y: auto; overscroll-behavior: contain; min-height: 0; scrollbar-width: thin; }
          #${ROOT_ID} .vh-caption { display: block; font-size: 11px; font-weight: 700; color: #aeb9cc; letter-spacing: .06em; margin: 0 0 9px; }
          #${ROOT_ID} .vh-tabs { display: flex; padding: 4px; gap: 4px; background: #101318; border-radius: 11px; margin-bottom: 14px; }
          #${ROOT_ID} .vh-tabs button { flex: 1; border: 0; border-radius: 8px; padding: 9px; background: transparent; color: #b7c0d1; cursor: pointer; }
          #${ROOT_ID} .vh-tabs button[aria-pressed=true] { background: #343e52; color: #fff; font-weight: 650; }
          #${ROOT_ID} .vh-secondary { background: #2c3341 !important; border: 1px solid #465167 !important; border-radius: 9px !important; padding: 9px 12px !important; text-align: center !important; margin: 8px 0 !important; width: 100% !important; color: #e1eaff !important; cursor: pointer; }
          #${ROOT_ID} .vh-secondary:hover:not(:disabled) { background: #39455a !important; }
          #${ROOT_ID} .vh-playlist { max-height: 216px !important; overflow-y: auto; scrollbar-width: thin; overscroll-behavior: contain; margin-bottom: 14px; border: 1px solid #353c49; border-radius: 10px; background: #14181f; }
          #${ROOT_ID} .vh-playlist:empty { display: none; }
          #${ROOT_ID} .vh-playlist label { display: flex !important; align-items: flex-start; gap: 10px; padding: 11px 12px !important; border-bottom: 1px solid #292f39; cursor: pointer; }
          #${ROOT_ID} .vh-playlist label:last-child { border-bottom: 0; }
          #${ROOT_ID} .vh-playlist label:hover { background: #252e40; }
          #${ROOT_ID} .vh-playlist label:has(input:checked) { background: #202b3e; }
          #${ROOT_ID} .vh-playlist span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 19px; }
          #${ROOT_ID} details { border: 1px solid #353c49; border-radius: 10px; padding: 11px 12px; margin-top: 12px; background: #1e232c; }
          #${ROOT_ID} summary { cursor: pointer; color: #dce6fa; font-weight: 600; }
          #${ROOT_ID} .vh-footer { border-top: 1px solid #343b48; background: #151920; padding: 14px 20px 16px; flex-shrink: 0; }
          #${ROOT_ID} .vh-primary { display: block; width: 100%; border: 1px solid #a4beff; border-radius: 10px; background: #91b1ff; color: #101b32; font-weight: 750; padding: 12px; cursor: pointer; margin: 0 0 12px; }
          #${ROOT_ID} .vh-primary:hover:not(:disabled) { background: #b2c9ff; }
          #${ROOT_ID} progress { display: block; height: 5px; width: 100%; accent-color: #91b1ff; margin-top: 10px; }
          #${ROOT_ID} .vh-result { max-height: 160px !important; overflow: auto; font-size: 12px; overflow-wrap: anywhere; white-space: pre-wrap; color: #bec9dc; }
          @media (max-height: 650px) { #${ROOT_ID} .vh-playlist { max-height: 140px !important; } #${ROOT_ID} .vh-header { padding-top: 12px; padding-bottom: 10px; } }
          @media (prefers-reduced-motion: reduce) { #${ROOT_ID} button { transition: none; } }
        `;
        ui.appendChild(css);
        const header = document.createElement('div'); header.className = 'vh-header';
        const heading = document.createElement('div');
        style(title, { fontSize: '18px', padding: '0', lineHeight: '24px' });
        style(platformLine, { padding: '3px 0 0', color: '#a9b5c9' });
        heading.append(title, platformLine);
        const close = document.createElement('button');
        close.textContent = '×'; close.type = 'button'; close.setAttribute('aria-label', '关闭下载面板');
        style(close, { background: '#292f39', color: '#c5cedf', border: '0', borderRadius: '8px', width: '32px', height: '32px', fontSize: '23px', cursor: 'pointer' });
        close.addEventListener('click', () => { panel.style.display = 'none'; main.setAttribute('aria-expanded', 'false'); main.focus(); });
        header.append(heading, close);
        const body = document.createElement('div'); body.className = 'vh-body';
        const caption = text => { const el = document.createElement('div'); el.className = 'vh-caption'; el.textContent = text; return el; };
        const tabs = document.createElement('div'); tabs.className = 'vh-tabs'; tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '下载范围');
        scopeSingle = document.createElement('button'); scopeSingle.textContent = '当前视频'; scopeSingle.type = 'button';
        scopeBatch = document.createElement('button'); scopeBatch.textContent = '播放列表'; scopeBatch.type = 'button';
        scopeSingle.addEventListener('click', () => setScope('single'));
        scopeBatch.addEventListener('click', () => setScope('batch'));
        tabs.append(scopeSingle, scopeBatch);
        singleSummary = document.createElement('div');
        singleSummary.textContent = '下载当前页面的视频；字幕可单独保存。';
        style(singleSummary, { color: '#b0bdd2', marginBottom: '16px', fontSize: '12px' });
        loadPlaylist.className = 'vh-secondary'; loadPlaylist.textContent = '加载 / 刷新播放列表';
        search = document.createElement('input'); search.type = 'search'; search.placeholder = '搜索视频标题…'; search.setAttribute('aria-label', '搜索播放列表');
        search.addEventListener('input', () => {
          const query = search.value.trim().toLocaleLowerCase();
          for (const label of playlistItems.children) label.hidden = !label.textContent.toLocaleLowerCase().includes(query);
        });
        selectedCount = document.createElement('span');
        style(selectedCount, { color: '#a9bce2', fontSize: '12px', flexShrink: '0' });
        const selectionBar = document.createElement('div'); style(selectionBar, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0' });
        selectAll.row.querySelector('span').textContent = '全选全部';
        style(selectAll.row, { padding: '7px 0', fontSize: '12px' });
        selectionBar.append(selectAll.row, selectedCount);
        playlistItems.className = 'vh-playlist';
        playlistItems.addEventListener('change', updateSelection);
        batchHint.textContent = '所选字幕语言应用到每个视频；缺失或失败会逐项列出。';
        style(batchHint, { padding: '0', color: '#a3b0c6', marginBottom: '12px', fontSize: '12px' });
        const listCaption = caption('选择播放列表条目'); style(listCaption, { marginTop: '16px' });
        batchBox.replaceChildren(listCaption, loadPlaylist, search, selectionBar, playlistItems, batchHint);
        const contentLabel = document.createElement('label'); contentLabel.className = 'vh-caption'; contentLabel.textContent = '02  下载内容';
        modeSelect = document.createElement('select'); modeSelect.setAttribute('aria-label', '下载内容');
        for (const [value, text] of [['video', '视频 · 最佳画质'], ['subtitle', '仅字幕 · 保留所选语言'], ['audio', '音频 · MP3']]) {
          const option = document.createElement('option'); option.value = value; option.textContent = text; modeSelect.appendChild(option);
        }
        contentLabel.appendChild(modeSelect); style(modeSelect, { marginTop: '8px', letterSpacing: 'normal' });
        subtitleDetails = document.createElement('details'); subtitleSummary = document.createElement('summary');
        loadSubs.className = 'vh-secondary'; loadSubs.textContent = '查看当前视频可用字幕';
        subtitleList.className = 'vh-playlist';
        style(subtitleList, { margin: '8px 0 0', padding: '0', lineHeight: '20px', color: '#bfcbe0' });
        subtitlePreferences = document.createElement('div');
        const preferenceMode = document.createElement('select');
        preferenceMode.setAttribute('aria-label', '字幕选择方式');
        for (const [value, text] of [['default', '默认 · 中文 / 自动生成'], ['custom', '自定义 · 选择语言与来源']]) {
          const option = document.createElement('option'); option.value = value; option.textContent = text; preferenceMode.append(option);
        }
        style(preferenceMode, { margin: '10px 0' });
        const choices = document.createElement('div'); choices.hidden = true;
        const languages = [], sources = [];
        const addChoices = (legendText, options, target) => {
          const group = document.createElement('fieldset');
          style(group, { border: '0', padding: '6px 0', margin: '0' });
          const legend = document.createElement('legend'); legend.textContent = legendText;
          style(legend, { fontWeight: '600', fontSize: '12px', color: '#b7c6e0' });
          group.append(legend);
          for (const [value, text, checked] of options) {
            const label = document.createElement('label');
            style(label, { display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', cursor: 'pointer' });
            const input = document.createElement('input'); input.type = 'checkbox'; input.value = value; input.checked = checked;
            label.append(input, document.createTextNode(text)); group.append(label); target.push({ input, text });
          }
          choices.append(group);
        };
        addChoices('语言（可多选）', [['zh-Hans', '中文（简体）', true], ['zh-Hant', '中文（繁体）', false], ['en', '英文', false]], languages);
        addChoices('字幕来源（可多选）', [['manual', '原始字幕 · 作者上传', false], ['auto', '自动生成 · 语音识别原文', true], ['translated', '自动翻译 · 平台翻译', false]], sources);
        const hint = document.createElement('div');
        hint.textContent = '语言与来源组合应用到每个视频；缺失组合按下方设置处理；中文自动字幕也缺失时会报告失败。';
        style(hint, { fontSize: '12px', color: '#a9b8d0', padding: '8px 0' });
        choices.append(hint);
        const fallbackLabel = document.createElement('label');
        fallbackLabel.textContent = '所选语言或来源缺失时';
        style(fallbackLabel, { display: 'block', padding: '10px 0', color: '#b7c6e0', fontSize: '12px' });
        const fallbackSelect = document.createElement('select'); fallbackSelect.setAttribute('aria-label', '所选语言或来源缺失时');
        for (const [value, text] of [['zh-auto', '尝试中文 · 自动生成（默认）'], ['none', '仅报告缺失，不替代']]) {
          const option = document.createElement('option'); option.value = value; option.textContent = text; fallbackSelect.append(option);
        }
        style(fallbackSelect, { marginTop: '8px' });
        fallbackLabel.append(fallbackSelect);
        function syncSubtitlePreferences() {
          choices.hidden = preferenceMode.value !== 'custom';
          if (choices.hidden) { selectedTracks = [{ language: 'zh-Hans', source: 'auto', translated: false, fallback: fallbackSelect.value }]; subtitlePreferenceSummary = '中文 / 自动生成'; }
          else {
            const selectedLanguages = languages.filter(t => t.input.checked);
            const selectedSources = sources.filter(t => t.input.checked);
            selectedTracks = selectedLanguages.flatMap(language => selectedSources.map(source => ({
              language: language.input.value, source: source.input.value === 'manual' ? 'manual' : 'auto',
              translated: source.input.value === 'translated', fallback: fallbackSelect.value,
            })));
            subtitlePreferenceSummary = selectedLanguages.length && selectedSources.length
              ? `${selectedLanguages.map(t => t.text.replace('（简体）', '').replace('（繁体）', '繁体')).join('、')} / ${selectedSources.map(t => t.text.split(' · ')[0]).join('、')}` : '';
          }
          updateSelection();
        }
        subtitlePreferences.append(preferenceMode, choices, fallbackLabel);
        subtitlePreferences.addEventListener('change', syncSubtitlePreferences);
        subtitleDetails.append(subtitleSummary, subtitlePreferences, loadSubs, subtitleList);
        subtitleList.textContent = '可选：查看当前视频提供哪些字幕；播放列表中的视频可能不同。';
        modeSelect.addEventListener('change', () => { mode = modeSelect.value; if (mode === 'subtitle') subtitleDetails.open = true; updateSelection(); });
        const advanced = document.createElement('details');
        const advancedSummary = document.createElement('summary'); advancedSummary.textContent = '登录与高级选项';
        advanced.append(advancedSummary, cookiesOption.row);
        const footer = document.createElement('div'); footer.className = 'vh-footer';
        primary = document.createElement('button'); primary.type = 'button'; primary.className = 'vh-primary';
        primary.addEventListener('click', () => {
          if (uiBusy) return;
          if (scope === 'batch') (mode === 'subtitle' ? batchSubs : batchVideo).click();
          else ({ video: videoBtn, subtitle: subtitleBtn, audio: audioBtn })[mode].click();
        });
        connection = document.createElement('span'); connection.textContent = '未连接';
        style(connection, { fontSize: '11px', color: '#b5c4dd', float: 'right', fontWeight: '400', letterSpacing: 'normal' });
        const taskTitle = caption('03  任务状态'); taskTitle.append(connection);
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        style(status, { margin: '0', color: '#cad4e6', lineHeight: '19px', maxHeight: '76px', overflowY: 'auto' });
        taskProgress = document.createElement('progress'); taskProgress.hidden = true; taskProgress.setAttribute('aria-label', '下载进度');
        resultsDetails = document.createElement('details'); resultsDetails.hidden = true;
        const resultSummary = document.createElement('summary'); resultSummary.textContent = '逐项结果 / 失败重试';
        batchResults.className = 'vh-result'; retryBatch.className = 'vh-secondary';
        resultsDetails.append(resultSummary, batchResults, retryBatch);
        body.append(caption('01  下载范围'), tabs, singleSummary, contentLabel, subtitlesOption.row, subtitleDetails, batchBox, advanced, resultsDetails);
        footer.append(primary, taskTitle, status, taskProgress);
        panel.replaceChildren(header, body, footer);
        // Existing action handlers remain the single path to submitting downloads.
        for (const btn of [videoBtn, audioBtn, subtitleBtn, batchVideo, batchSubs]) btn.hidden = true;
        syncSubtitlePreferences();
        setScope('single');
        panel.addEventListener('change', updateSelection);
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape' && panel.style.display !== 'none') { e.stopPropagation(); close.click(); }
        }, true);
      }

      function setStatus(text) {
        status.textContent = text;
      }

      function setBusy(busy) {
        uiBusy = busy;
        scopeSingle.disabled = busy;
        scopeBatch.disabled = busy;
        modeSelect.disabled = busy;
        taskProgress.hidden = !busy;
        if (busy) taskProgress.removeAttribute('value');
        for (const input of subtitlePreferences.querySelectorAll('input, select')) input.disabled = busy;
        loadSubs.disabled = busy;
        for (const input of batchBox.querySelectorAll('button, input')) input.disabled = busy;
        cookiesOption.input.disabled = busy;
        subtitlesOption.input.disabled = busy;
        for (const input of subtitleList.querySelectorAll('input')) input.disabled = busy;
        for (const btn of actions) {
          btn.disabled = busy;
          btn.style.opacity = busy ? '0.48' : '1';
          btn.style.cursor = busy ? 'default' : 'pointer';
        }
        updateSelection();
      }

      function refreshPageState() {
        if (subtitleContext && subtitleContext !== contextKey()) resetSubtitles();
        const hasPlaylist = detectPlatform() === 'youtube' && new URL(location.href).searchParams.has('list');
        scopeBatch.hidden = !hasPlaylist;
        if (!hasPlaylist || (location.pathname === '/playlist' && scope === 'single')) setScope(hasPlaylist ? 'batch' : 'single');
        if (playlistContext && playlistContext !== contextKey()) {
          playlistContext = null; playlistItems.replaceChildren(); search.value = '';
        }
        updateSelection();
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
          platformLine.textContent = `${info.name} · 下载到本机`;
        } else {
          main.style.opacity = '0.72';
          platformLine.textContent = `${info.name} · ${hasPlaylist ? '播放列表' : '请打开具体视频'}`;
        }

        console.info(
          `[VideoHub] platform=${platform}, singleItem=${single}`,
          location.href
        );
      }

      async function healthCheck() {
        connecting = true; updateSelection();
        try {
          const data = await request('GET', '/health');
          localToken = data.token || null;

          if (!localToken) {
            throw new Error('本地服务未返回安全令牌');
          }

          const ffmpeg = data.ffmpeg ? 'FFmpeg ✓' : 'FFmpeg ✗';
          const version = data.yt_dlp_version || 'unknown';

          if (selectedTracks !== null && (!data.subtitle_selection_types || !data.subtitle_fallback)) {
            setStatus('字幕选择与缺失处理需要新版服务：请结束当前任务后重启本地服务。');
            return null;
          }
          connection.textContent = '● 已连接';
          connection.title = `yt-dlp ${version} · ${ffmpeg}`;
          if (!uiBusy) setStatus('本地服务已连接，选择内容后开始下载。');
          return data;
        } catch (err) {
          localToken = null;
          connection.textContent = '○ 未连接';
          setStatus(`本地服务未连接：${err.message}`);
          return null;
        } finally { connecting = false; updateSelection(); }
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

            if (data.total) {
              taskProgress.max = data.total; taskProgress.value = data.completed || 0;
            } else if (data.percent && /%/.test(data.percent)) {
              taskProgress.max = 100; taskProgress.value = parseFloat(data.percent) || 0;
            }
            if (data.results) {
              resultsDetails.hidden = false;
              batchResults.textContent = data.results.map((r, i) =>
                `${i + 1}. ${r.state === 'done' && !r.warning ? '✓' : '⚠'} ${r.url}\n${r.warning || r.message || ''}`).join('\n');
              retryUrls = data.results.filter(r => r.state !== 'done' || r.warning).map(r => r.url);
              retryBatch.hidden = !['done', 'error'].includes(data.state) || !retryUrls.length;
            }
            if (data.state === 'done') {
              setBusy(false);
              setStatus(`完成：${data.message || '文件已保存'}${data.results ? '\n' + data.results.filter(r => r.warning).map(r => `${r.url}: ${r.warning}`).join('\n') : ''}`);
              notify(`${data.platform_name || '视频'} 下载完成`);
              return;
            }

            if (data.state === 'error') {
              setBusy(false);
              setStatus(`失败：${data.message || '未知错误'}${data.results ? '\n' + data.results.filter(r => r.state !== 'done' || r.warning).map(r => `${r.url}: ${r.warning || r.message}`).join('\n') : ''}`);
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
        panel.style.display = opening ? 'flex' : 'none';
        panel.style.flexDirection = 'column';
        main.setAttribute('aria-expanded', String(opening));

        if (opening) {
          scopeSingle.focus();
          refreshPageState();
          await healthCheck();
        }
      });

      panel.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      document.addEventListener('click', () => {
        main.setAttribute('aria-expanded', 'false');
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

      buildInterface();
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
          main.setAttribute('aria-expanded', 'false');
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
