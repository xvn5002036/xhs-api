const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/xhs', async (req, res) => {
    try {
        const rawUrl = req.query.url;
        if (!rawUrl) return res.status(400).json({ error: '請提供 url 參數' });

        // 嚴格提取網址
        const urlMatch = rawUrl.match(/(https?:\/\/[a-zA-Z0-9\.\-\/_]+)/);
        if (!urlMatch) return res.status(400).json({ error: '找不到有效網址' });
        const targetUrl = urlMatch[0];

        // 【大絕招】偽裝成 Googlebot (Google 搜尋引擎的爬蟲)，多數網站不會封鎖它
        const headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive'
        };
        
        // 取得網頁內容
        const response = await axios.get(targetUrl, { 
            headers,
            maxRedirects: 5,
            timeout: 10000 // 設定 10 秒超時，避免伺服器卡死
        });
        const html = response.data;

        // 尋找隱藏的 JSON
        const stateRegex = /window\.__INITIAL_STATE__\s*=\s*({.*?})<\/script>/;
        const ssrRegex = /window\.__INITIAL_SSR_STATE__\s*=\s*({.*?})<\/script>/;
        const stateMatch = html.match(stateRegex) || html.match(ssrRegex);

        if (!stateMatch) {
            return res.status(403).json({ error: '小紅書的反爬蟲機制擋住了 Render 伺服器的 IP，請稍後再試。' });
        }
        
        const xhsData = JSON.parse(stateMatch[1]);
        const noteMap = xhsData.note?.noteDetailMap || xhsData.note?.note || {};
        const noteId = Object.keys(noteMap)[0];
        const noteData = noteMap[noteId]?.note || noteMap;

        if (!noteData || !noteData.type) throw new Error('找不到筆記內容');

        const result = {
            platform: '小紅書',
            title: noteData.title || noteData.desc || '無標題',
            type: noteData.type,
            images: [],
            videoUrl: null
        };

        if (noteData.imageList && noteData.imageList.length > 0) {
            result.type = 'image';
            result.images = noteData.imageList.map(img => img.traceId ? `https://sns-webpic-qc.xhscdn.com/weather_api/${img.traceId}` : img.urlDefault);
        }

        if (noteData.video?.media?.stream?.h264) {
            result.type = 'video';
            result.videoUrl = noteData.video.media.stream.h264[0].masterUrl;
        }

        res.json(result);

    } catch (error) {
        // 詳細記錄錯誤，回傳給前端顯示
        console.error("API 錯誤:", error.message);
        res.status(500).json({ error: '伺服器被小紅書拒絕連線 (IP 風控)，詳情: ' + error.message });
    }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));


