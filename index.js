const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. 允許跨域請求
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
});

// 2. 設定首頁：當使用者造訪您的網址時，顯示精美的操作網頁
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. 核心 API：負責解析小紅書網址
app.get('/api/xhs', async (req, res) => {
    try {
        const rawUrl = req.query.url;
        if (!rawUrl) return res.status(400).json({ error: '請提供 url 參數' });

        // 自動過濾文字，精準抓取網址
        const urlMatch = rawUrl.match(/(https?:\/\/[^\s]+)/);
        const targetUrl = urlMatch ? urlMatch[0] : rawUrl;

        // 【強效偽裝】讓小紅書以為我們是真實的電腦瀏覽器
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,zh-CN;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Upgrade-Insecure-Requests': '1'
        };
        
        // 取得網頁原始碼 (允許自動跳轉短網址)
        const response = await axios.get(targetUrl, { 
            headers,
            maxRedirects: 5
        });
        const html = response.data;

        // 尋找隱藏的 JSON 資料 (兼容不同的變數名稱)
        const stateRegex = /window\.__INITIAL_STATE__\s*=\s*({.*?})<\/script>/;
        const ssrStateRegex = /window\.__INITIAL_SSR_STATE__\s*=\s*({.*?})<\/script>/;
        const stateMatch = html.match(stateRegex) || html.match(ssrStateRegex);

        if (!stateMatch) {
            console.error("解析失敗，未找到 JSON。");
            return res.status(403).json({ error: '小紅書安全驗證阻擋了抓取，或網址已失效。請稍後再試。' });
        }
        
        // 解析 JSON
        const xhsData = JSON.parse(stateMatch[1]);
        const noteMap = xhsData.note?.noteDetailMap || xhsData.note?.note || {};
        const noteId = Object.keys(noteMap)[0];
        const noteData = noteMap[noteId]?.note || noteMap;

        if (!noteData || !noteData.type) throw new Error('找不到筆記詳細內容');

        // 整理要回傳的結果
        const result = {
            platform: '小紅書',
            title: noteData.title || noteData.desc || '無標題',
            type: noteData.type,
            images: [],
            videoUrl: null
        };

        // 處理圖片 (無水印)
        if (noteData.imageList && noteData.imageList.length > 0) {
            result.type = 'image';
            result.images = noteData.imageList.map(img => img.traceId ? `https://sns-webpic-qc.xhscdn.com/weather_api/${img.traceId}` : img.urlDefault);
        }

        // 處理影片 (無水印)
        if (noteData.video?.media?.stream?.h264) {
            result.type = 'video';
            result.videoUrl = noteData.video.media.stream.h264[0].masterUrl;
        }

        res.json(result);

    } catch (error) {
        console.error("API 錯誤:", error.message);
        res.status(500).json({ error: '伺服器解析失敗', details: error.message });
    }
});

// 啟動伺服器
app.listen(PORT, () => console.log(`API running on port ${PORT}`));


