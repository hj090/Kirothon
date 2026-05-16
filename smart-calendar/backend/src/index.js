require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const eventRoutes = require('./routes/events');
const crawlerService = require('./services/crawler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
// 이벤트 데이터 조회 API (크롤링된 데이터를 팀원/프론트엔드에 제공)
app.use('/api/events', eventRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 매일 새벽 2시에 자동 크롤링
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] 자동 크롤링 시작...');
  try {
    await crawlerService.crawlAll();
    console.log('[CRON] 자동 크롤링 완료');
  } catch (error) {
    console.error('[CRON] 자동 크롤링 실패:', error.message);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Smart Calendar 데이터 서버 실행: http://localhost:${PORT}`);
  console.log(`   - 이벤트 조회: GET /api/events`);
  console.log(`   - 수동 크롤링: POST /api/events/crawl`);
});
