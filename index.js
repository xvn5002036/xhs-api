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

        // 終極嚴格過濾：只抓出單純的網址，完全拋棄換行符號、空格與中文字
        const urlMatch = rawUrl.match(/(https?:\/\/[a-zA-Z0-9\.\-\/_]+)/);
        if (!urlMatch) {
            return res.status(400).json({ error: '無效的網址格式' });
        }
        const targetUrl = urlMatch[1]; // 絕對乾淨的網址

        // 加入手機版 User-Agent 降低被小紅書封鎖的機率
        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9',
            'Cookie': 'a1=18d6a8b7c9; webId=1234567890;'
        };
        
        const response = await axios.get(targetUrl, { headers });
        const html = response.data;

        const stateRegex = /window\.__INITIAL_STATE__\s*=\s*({.*?})<\/script>/;
        const ssrRegex = /window\.__INITIAL_SSR_STATE__\s*=\s*({.*?})<\/script>/;
        const stateMatch = html.match(stateRegex) || html.match(ssrRegex);

        if (!stateMatch) {
            return res.status(403).json({ error: '小紅書安全驗證阻擋了抓取，請稍後再試。' });
        }
        
        const xhsData = JSON.parse(stateMatch[1]);
        const noteMap = xhsData.note?.noteDetailMap || xhsData.note?.note || {};
        const noteId = Object.keys(noteMap)[0];
        const noteData = noteMap[noteId]?.note || noteMap;

        if (!noteData || !noteData.type) throw new Error('找不到筆記詳細內容');

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
        console.error("API 錯誤:", error.message);
        res.status(500).json({ error: error.message || '伺服器解析失敗' });
    }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));


