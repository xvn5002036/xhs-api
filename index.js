const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 允許跨域請求，方便未來如果您想接回網頁前端也能使用
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
});

// 首頁提示
app.get('/', (req, res) => {
    res.json({ message: "API 運作正常！請使用 /api/xhs?url=小紅書連結 進行解析" });
});

// 核心解析路由
app.get('/api/xhs', async (req, res) => {
    try {
        const rawUrl = req.query.url;
        if (!rawUrl) {
            return res.status(400).json({ success: false, error: '請提供 url 參數' });
        }

        // 1. 自動萃取文字中的網址 (處理用戶連同分享文案一起貼上的情況)
        const urlMatch = rawUrl.match(/(https?:\/\/[^\s]+)/);
        const targetUrl = urlMatch ? urlMatch[0] : rawUrl;

        // 2. 偽裝成 iPhone 瀏覽器發送請求，取得小紅書網頁 HTML
        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9'
        };
        
        // 請求真實網頁
        const response = await axios.get(targetUrl, { headers });
        const html = response.data;

        // 3. 抓取小紅書隱藏在 HTML 中的 JSON 資料 (window.__INITIAL_STATE__)
        const stateMatch = html.match(/window\.__INITIAL_STATE__=({.*?})<\/script>/);
        if (!stateMatch) {
            return res.status(404).json({ success: false, error: '找不到筆記內容，可能是網址失效或該筆記已被刪除/隱藏' });
        }
        
        // 將字串解析為物件
        const xhsData = JSON.parse(stateMatch[1]);
        
        // 取得筆記詳細資料
        const noteMap = xhsData.note?.noteDetailMap;
        if (!noteMap) throw new Error('解析 JSON 結構失敗 (找不到 noteDetailMap)');
        
        const noteId = Object.keys(noteMap)[0];
        const noteData = noteMap[noteId]?.note;
        if (!noteData) throw new Error('找不到筆記詳細內容');

        // 4. 整理要回傳給捷徑的乾淨 JSON
        const result = {
            success: true,
            platform: '小紅書',
            title: noteData.title || noteData.desc || '無標題',
            type: noteData.type, // 'normal' (圖片) 或 'video' (影片)
            images: [],
            videoUrl: null
        };

        // 處理圖片 (無浮水印提取)
        if (noteData.imageList && noteData.imageList.length > 0) {
            result.type = 'image';
            result.images = noteData.imageList.map(img => {
                // 有 traceId 就組合成無浮水印網址，沒有就用原本的網址
                return img.traceId ? `https://sns-webpic-qc.xhscdn.com/weather_api/${img.traceId}` : img.urlDefault;
            });
        }

        // 處理影片 (無浮水印提取)
        if (noteData.video?.media?.stream?.h264) {
            result.type = 'video';
            // h264 陣列的第一筆通常是 masterUrl (無浮水印原檔 mp4)
            result.videoUrl = noteData.video.media.stream.h264[0].masterUrl;
        }

        // 成功回傳結果！
        res.json(result);

    } catch (error) {
        console.error('API 解析發生錯誤:', error.message);
        res.status(500).json({ success: false, error: '伺服器解析失敗', details: error.message });
    }
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`🚀 小紅書去浮水印 API 已啟動在 Port ${PORT}`);
});


