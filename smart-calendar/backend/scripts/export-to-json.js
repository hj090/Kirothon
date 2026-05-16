/**
 * 크롤링한 데이터를 JSON 파일로 export
 *
 * 두 가지 모드 지원:
 *   1. crawl  - 직접 크롤링하여 JSON으로 저장 (DB 없이 사용 가능)
 *   2. db     - DB에 저장된 데이터를 JSON으로 export
 *
 * 사용법:
 *   node scripts/export-to-json.js crawl    → 직접 크롤링 후 JSON 저장
 *   node scripts/export-to-json.js db       → DB에서 JSON으로 export
 *   node scripts/export-to-json.js          → crawl 모드 (기본)
 *
 * 결과: data/ 폴더에 JSON 파일 저장
 *   - data/events.json           (전체 이벤트)
 *   - data/contests.json         (공모전)
 *   - data/activities.json       (대외활동)
 *   - data/interns.json          (인턴)
 *   - data/volunteers.json       (봉사활동)
 *   - data/summary.json          (요약 통계)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const OUTPUT_DIR = path.join(__dirname, '..', 'data');

// ============ 메인 ============
async function main() {
  const mode = process.argv[2] || 'crawl';

  console.log('='.repeat(60));
  console.log('📦 Smart Calendar - 데이터 JSON Export');
  console.log(`📅 실행 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log(`🔧 모드: ${mode}`);
  console.log('='.repeat(60));

  // 출력 폴더 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let allEvents = [];

  if (mode === 'db') {
    allEvents = await exportFromDB();
  } else {
    allEvents = await crawlDirect();
  }

  if (allEvents.length === 0) {
    console.log('⚠️  수집된 데이터가 없습니다.');
    return;
  }

  // 카테고리별로 분리하여 저장
  saveJsonFiles(allEvents);

  console.log('\n' + '='.repeat(60));
  console.log(`✅ 총 ${allEvents.length}건의 이벤트 데이터를 JSON으로 저장했습니다.`);
  console.log(`📂 저장 위치: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
}

// ============ 1. 직접 크롤링 모드 ============
async function crawlDirect() {
  const allEvents = [];

  console.log('\n[1/4] 위비티 공모전 크롤링...');
  const contests = await crawlWevity('1', 'CONTEST', 3);
  allEvents.push(...contests);
  console.log(`  → ${contests.length}건`);

  console.log('\n[2/4] 위비티 대외활동 크롤링...');
  const activities = await crawlWevity('14', 'ACTIVITY', 2);
  allEvents.push(...activities);
  console.log(`  → ${activities.length}건`);

  console.log('\n[3/4] 링커리어 인턴 크롤링...');
  const interns = await crawlLinkareer('intern', 'INTERN', 2);
  allEvents.push(...interns);
  console.log(`  → ${interns.length}건`);

  console.log('\n[4/4] 링커리어 대외활동 크롤링...');
  const linkActivities = await crawlLinkareer('activity', 'ACTIVITY', 2);
  allEvents.push(...linkActivities);
  console.log(`  → ${linkActivities.length}건`);

  return allEvents;
}

// ============ 2. DB Export 모드 ============
async function exportFromDB() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    console.log('\n📊 DB에서 데이터 조회 중...');
    const events = await prisma.event.findMany({
      orderBy: { deadline: 'asc' },
    });

    await prisma.$disconnect();
    return events;
  } catch (error) {
    console.error('❌ DB 연결 실패:', error.message);
    console.log('💡 DB 없이 직접 크롤링하려면: node scripts/export-to-json.js crawl');
    return [];
  }
}

// ============ 위비티 크롤러 ============
async function crawlWevity(gub, category, maxPage) {
  const events = [];

  for (let page = 1; page <= maxPage; page++) {
    try {
      const url = `https://www.wevity.com/?c=find&s=1&gub=${gub}&page=${page}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      $('table tbody tr').each((i, el) => {
        const $el = $(el);
        const titleEl = $el.find('td:nth-child(1) a').first();
        const title = cleanTitle(titleEl.text().trim());
        const link = titleEl.attr('href');
        const fieldText = $el.find('.sub_txt, .small').text().trim();
        const organizer = $el.find('td:nth-child(2)').text().trim();
        const statusText = $el.find('td:nth-child(3)').text().trim();
        const { dday, status } = parseDdayStatus(statusText);

        if (title && title.length > 2) {
          events.push({
            title,
            category,
            organizer: organizer || null,
            description: null,
            location: null,
            startDate: new Date().toISOString(),
            endDate: null,
            deadline: dday ? calculateDeadline(dday).toISOString() : null,
            field: parseFields(fieldText).length > 0 ? parseFields(fieldText) : [category === 'CONTEST' ? '공모전' : '대외활동'],
            targetAudience: ['대학생'],
            reward: null,
            url: link ? normalizeUrl(link, 'https://www.wevity.com') : null,
            imageUrl: null,
            source: 'wevity',
            sourceId: `wevity_${category.toLowerCase()}_${extractIdFromUrl(link)}_${page}_${i}`,
            status,
          });
        }
      });

      await delay(1000);
    } catch (error) {
      console.error(`  위비티 페이지 ${page} 실패:`, error.message);
    }
  }

  return dedupe(events);
}

// ============ 링커리어 크롤러 ============
async function crawlLinkareer(type, category, maxPage) {
  const events = [];

  for (let page = 1; page <= maxPage; page++) {
    try {
      const url = type === 'intern'
        ? `https://linkareer.com/list/intern?filterBy_jobTypes=INTERN&filterBy_status=OPEN&orderBy_field=RECENT&page=${page}`
        : `https://linkareer.com/list/activity?filterBy_status=OPEN&orderBy_field=RECENT&page=${page}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      $('a[href*="/activity/"]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = cleanTitle($el.find('h3, .activity-title').first().text().trim());
        const organizer = $el.find('.organization-name, .company-name').first().text().trim();
        const deadlineText = $el.find('.recruit-close, .deadline').text().trim();
        const location = $el.find('.location, .work-area').first().text().trim();
        const fieldText = $el.find('.tag-list, .category').text().trim();

        if (title && title.length > 2) {
          events.push({
            title,
            category,
            organizer: organizer || null,
            description: null,
            location: location || null,
            startDate: new Date().toISOString(),
            endDate: null,
            deadline: parseLinkareerDeadline(deadlineText)?.toISOString() || null,
            field: parseFields(fieldText).length > 0 ? parseFields(fieldText) : [category === 'INTERN' ? '인턴' : '대외활동'],
            targetAudience: ['대학생'],
            reward: null,
            url: href ? normalizeUrl(href, 'https://linkareer.com') : null,
            imageUrl: null,
            source: 'linkareer',
            sourceId: `linkareer_${type}_${extractIdFromUrl(href)}_${page}_${i}`,
            status: 'UPCOMING',
          });
        }
      });

      await delay(1500);
    } catch (error) {
      console.error(`  링커리어 페이지 ${page} 실패:`, error.message);
    }
  }

  return dedupe(events);
}

// ============ JSON 파일 저장 ============
function saveJsonFiles(allEvents) {
  // 카테고리별로 분리
  const byCategory = {
    contests: allEvents.filter((e) => e.category === 'CONTEST'),
    activities: allEvents.filter((e) => e.category === 'ACTIVITY'),
    interns: allEvents.filter((e) => e.category === 'INTERN'),
    volunteers: allEvents.filter((e) => e.category === 'VOLUNTEER'),
    seminars: allEvents.filter((e) => e.category === 'SEMINAR'),
  };

  // 1. 전체 데이터
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'events.json'),
    JSON.stringify(allEvents, null, 2),
    'utf-8'
  );
  console.log(`\n💾 events.json (${allEvents.length}건)`);

  // 2. 카테고리별
  for (const [name, events] of Object.entries(byCategory)) {
    if (events.length > 0) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${name}.json`),
        JSON.stringify(events, null, 2),
        'utf-8'
      );
      console.log(`💾 ${name}.json (${events.length}건)`);
    }
  }

  // 3. 요약 통계
  const summary = {
    exportedAt: new Date().toISOString(),
    totalCount: allEvents.length,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length])
    ),
    bySource: groupBy(allEvents, 'source'),
    schema: {
      description: '각 이벤트 객체의 필드 설명',
      fields: {
        title: '활동 제목 (필수)',
        category: 'CONTEST | ACTIVITY | INTERN | VOLUNTEER | EXAM | SCHOLARSHIP | SEMINAR',
        status: 'UPCOMING | ONGOING | CLOSED',
        startDate: 'ISO 날짜 문자열',
        endDate: 'ISO 날짜 문자열 또는 null',
        deadline: 'ISO 날짜 문자열 또는 null (지원 마감일)',
        organizer: '주최기관 또는 null',
        location: '장소/지역 또는 null',
        field: '분야 태그 배열 (예: ["IT", "마케팅"])',
        targetAudience: '대상 배열 (예: ["대학생"])',
        reward: '상금/혜택 또는 null',
        url: '원본 링크 또는 null',
        source: '데이터 출처 (wevity, 1365, linkareer 등)',
        sourceId: '원본 사이트 ID (중복 방지용)',
      },
    },
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );
  console.log(`💾 summary.json (요약 통계)`);
}

// ============ 유틸리티 ============
function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.source}_${e.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function parseDdayStatus(text) {
  if (!text) return { dday: null, status: 'UPCOMING' };
  const ddayMatch = text.match(/D-(\d+)/i);
  const dday = ddayMatch ? parseInt(ddayMatch[1]) : null;
  let status = 'UPCOMING';
  if (text.includes('마감') && !text.includes('임박')) status = 'CLOSED';
  else if (text.includes('접수중')) status = 'ONGOING';
  return { dday, status };
}

function calculateDeadline(dday) {
  const d = new Date();
  d.setDate(d.getDate() + dday);
  d.setHours(23, 59, 59, 0);
  return d;
}

function parseLinkareerDeadline(text) {
  if (!text) return null;
  if (text.includes('채용 시') || text.includes('상시')) return null;
  const fullDate = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (fullDate) {
    return new Date(parseInt(fullDate[1]), parseInt(fullDate[2]) - 1, parseInt(fullDate[3]), 23, 59, 59);
  }
  const monthDay = text.match(/(\d{1,2})[.\-/](\d{1,2})/);
  if (monthDay) {
    const year = new Date().getFullYear();
    const d = new Date(year, parseInt(monthDay[1]) - 1, parseInt(monthDay[2]), 23, 59, 59);
    if (d < new Date()) d.setFullYear(year + 1);
    return d;
  }
  return null;
}

function parseFields(text) {
  if (!text) return [];
  const cleaned = text.replace(/분류\s*:\s*/g, '').replace(/SPECIAL|IDEA|NEW|외 \d+/gi, '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/[,·]/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && f.length < 20);
}

function extractIdFromUrl(url) {
  if (!url) return String(Date.now());
  const idxMatch = url.match(/[?&]idx=(\d+)/);
  if (idxMatch) return idxMatch[1];
  const pathMatch = url.match(/\/(\d+)(?:\?|$|\/)/);
  if (pathMatch) return pathMatch[1];
  return url.replace(/[^a-zA-Z0-9]/g, '').slice(-15) || String(Date.now());
}

function normalizeUrl(url, baseUrl) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  return `${baseUrl}/${url}`;
}

function cleanTitle(title) {
  return title
    .replace(/\s+/g, ' ')
    .replace(/SPECIAL|IDEA|NEW|신규|마감임박|추천/gi, '')
    .trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 실행
main().catch((error) => {
  console.error('❌ 실행 실패:', error);
  process.exit(1);
});
