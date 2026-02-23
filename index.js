const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
});

app.get('/api/xhs', async (req, res) => {
    try {
        const rawUrl = req.query.url;
        if (!rawUrl) return res.status(400).json({ error: '請提供 url 參數' });

        const urlMatch = rawUrl.match(/(https?:\/\/[^\s]+)/);
        const targetUrl = urlMatch ? urlMatch[0] : rawUrl;

        // 【升級版偽裝】加入更多真實瀏覽器的特徵
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,zh-CN;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };
        
        const response = await axios.get(targetUrl, { 
            headers,
            maxRedirects: 5 // 允許跳轉
        });
        const html = response.data;

        // 【升級版正則表達式】兼容小紅書不同的資料結構
        const stateRegex = /window\.__INITIAL_STATE__\s*=\s*({.*?})<\/script>/;
        const ssrStateRegex = /window\.__INITIAL_SSR_STATE__\s*=\s*({.*?})<\/script>/;
        const stateMatch = html.match(stateRegex) || html.match(ssrStateRegex);

        if (!stateMatch) {
            // 如果還是被擋，把部分 HTML 印出來以便除錯
            console.error("被小紅書阻擋，回傳的 HTML 片段:", html.substring(0, 200));
            return res.status(403).json({ error: '小紅書安全驗證阻擋了伺服器，請稍後再試。' });
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
        res.status(500).json({ error: '伺服器解析失敗', details: error.message });
    }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));
