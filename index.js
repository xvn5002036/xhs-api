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

        // 1. 修復一：嚴格提取網址，並「強制剃除」黏在結尾的隱形符號與中文
        const urlMatch = rawUrl.match(/https?:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(?:\/[^\s\u4e00-\u9fa5]*)?/);
        let targetUrl = urlMatch ? urlMatch[0] : rawUrl;
        targetUrl = targetUrl.replace(/[^\x20-\x7E]/g, ''); // 移除非 ASCII 字元，確保網址純淨

        // 2. 修復二：攔截小紅書的惡意跳轉 (xhsdiscover://) 防止 Axios 崩潰
        let finalUrl = targetUrl;
        if (targetUrl.includes('xhslink.com')) {
            try {
                const redirectRes = await axios.get(targetUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    maxRedirects: 0, // 禁止自動跳轉
                    validateStatus: status => status >= 200 && status < 400
                });
                const loc = redirectRes.headers.location;
                if (loc) {
                    if (loc.includes('xhsdiscover://')) {
                        const matchId = loc.match(/item\/([a-zA-Z0-9]+)/);
                        if (matchId && matchId[1]) finalUrl = `https://www.xiaohongshu.com/explore/${matchId[1]}`;
                    } else {
                        finalUrl = loc;
                    }
                }
            } catch (e) {
                if (e.response && e.response.headers && e.response.headers.location) {
                    const loc = e.response.headers.location;
                    if (loc.includes('xhsdiscover://')) {
                        const matchId = loc.match(/item\/([a-zA-Z0-9]+)/);
                        if (matchId && matchId[1]) finalUrl = `https://www.xiaohongshu.com/explore/${matchId[1]}`;
                    } else {
                        finalUrl = loc;
                    }
                }
            }
        }

        // 3. 取得最終真實網頁內容
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cookie': 'a1=18d6a8b7c9; webId=1234567890;' // 假 Cookie 防風控
        };
        
        const response = await axios.get(finalUrl, { headers });
        const html = response.data;

        // 4. 解析 JSON
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
        // 將精確錯誤傳回給前端
        res.status(500).json({ error: error.message || '伺服器解析失敗' });
    }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));


