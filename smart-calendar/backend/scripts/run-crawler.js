/**
 * 크롤러 독립 실행 스크립트
 * 사용법: node scripts/run-crawler.js [source]
 * 
 * 예시:
 *   node scripts/run-crawler.js          → 전체 크롤링
 *   node scripts/run-crawler.js wevity   → 위비티만
 *   node scripts/run-crawler.js 1365     → 1365만
 */
require('dotenv').config();
const crawler = require('../src/services/crawler');

async function main() {
  const source = process.argv[2];

  console.log('='.repeat(50));
  console.log('🕷️  Smart Calendar 크롤러');
  console.log(`📅 실행 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log('='.repeat(50));

  try {
    if (source === 'wevity') {
      console.log('\n[위비티 공모전 크롤링]');
      const count1 = await crawler.crawlWevityContests();
      console.log(`→ 공모전 ${count1}건 저장`);

      console.log('\n[위비티 대외활동 크롤링]');
      const count2 = await crawler.crawlWevityActivities();
      console.log(`→ 대외활동 ${count2}건 저장`);
    } else if (source === '1365') {
      console.log('\n[1365 봉사활동 크롤링]');
      const count = await crawler.crawlVolunteer1365();
      console.log(`→ 봉사활동 ${count}건 저장`);
    } else {
      console.log('\n[전체 크롤링 시작]');
      await crawler.crawlAll();
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ 크롤링 완료!');
  } catch (error) {
    console.error('\n❌ 크롤링 실패:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
