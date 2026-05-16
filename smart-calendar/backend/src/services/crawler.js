const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DATA_OUTPUT_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * 크롤링 결과를 JSON 파일로도 저장 (Python AI 모듈에서 참조)
 */
function saveCrawledEventsToJson(events) {
  try {
    if (!fs.existsSync(DATA_OUTPUT_DIR)) {
      fs.mkdirSync(DATA_OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(
      path.join(DATA_OUTPUT_DIR, 'crawled-events.json'),
      JSON.stringify(events, null, 2),
      'utf-8'
    );
    console.log(`[Crawler] 📦 JSON export 완료: ${events.length}건 → data/crawled-events.json`);
  } catch (error) {
    console.error('[Crawler] JSON export 실패:', error.message);
  }
}

/**
 * 모든 소스에서 크롤링 실행
 */
async function crawlAll() {
  console.log('[Crawler] 전체 크롤링 시작...');

  const results = await Promise.allSettled([
    crawlWevityContests(),
    crawlWevityActivities(),
    crawlVolunteer1365(),
    crawlLinkareerInterns(),
    crawlLinkareerActivities(),
  ]);

  const sources = ['위비티-공모전', '위비티-대외활동', '1365봉사', '링커리어-인턴', '링커리어-대외활동'];
  const allCrawledEvents = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`[Crawler] ✅ ${sources[index]}: ${result.value.count}건 수집`);
      allCrawledEvents.push(...(result.value.events || []));
    } else {
      console.error(`[Crawler] ❌ ${sources[index]} 실패:`, result.reason?.message);
    }
  });

  // 크롤링 결과를 JSON 파일로 저장
  saveCrawledEventsToJson(allCrawledEvents);

  return results;
}

/**
 * 위비티 공모전 크롤링
 * URL: https://www.wevity.com/?c=find&s=1&gub=1
 * 분야별 필터: gub=1(전체), gub=2(기획/아이디어)...
 */
async function crawlWevityContests() {
  const baseUrl = 'https://www.wevity.com/?c=find&s=1&gub=1';
  let totalSaved = 0;
  const allEvents = [];

  // 여러 페이지 크롤링 (1~3페이지)
  for (let page = 1; page <= 3; page++) {
    try {
      const url = `${baseUrl}&page=${page}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const events = [];

      // 위비티 테이블 구조 파싱
      $('table tbody tr, .list-item, .contest-list li').each((i, el) => {
        const $el = $(el);
        
        const titleEl = $el.find('td:nth-child(1) a, .tit a, .title a');
        const title = titleEl.text().trim();
        const link = titleEl.attr('href');
        
        const fieldText = $el.find('.sub_txt, .field, td:nth-child(1) .small').text().trim();
        const fields = parseFields(fieldText);
        
        const organizer = $el.find('td:nth-child(2), .org, .host').text().trim();
        
        const statusText = $el.find('td:nth-child(3), .d-day, .status').text().trim();
        const { dday, status } = parseDdayStatus(statusText);

        if (title && title.length > 2) {
          const sourceId = link 
            ? `wevity_${extractIdFromUrl(link)}` 
            : `wevity_contest_p${page}_${i}`;

          events.push({
            title: cleanTitle(title),
            category: 'CONTEST',
            organizer: organizer || null,
            source: 'wevity',
            sourceId,
            startDate: new Date(),
            deadline: dday ? calculateDeadline(dday) : null,
            field: fields.length > 0 ? fields : ['공모전'],
            targetAudience: ['대학생'],
            url: link ? normalizeUrl(link, 'https://www.wevity.com') : null,
            status: status || 'UPCOMING',
          });
        }
      });

      allEvents.push(...events);

      // DB 저장
      for (const event of events) {
        try {
          await prisma.event.upsert({
            where: {
              source_sourceId: { source: event.source, sourceId: event.sourceId },
            },
            update: {
              title: event.title,
              organizer: event.organizer,
              deadline: event.deadline,
              field: event.field,
              status: event.status,
              url: event.url,
              updatedAt: new Date(),
            },
            create: event,
          });
          totalSaved++;
        } catch (e) {
          // 중복 또는 에러 무시
        }
      }

      await delay(1000);
    } catch (error) {
      console.error(`[위비티 공모전] 페이지 ${page} 크롤링 실패:`, error.message);
    }
  }

  return { count: totalSaved, events: allEvents };
}

/**
 * 위비티 대외활동 크롤링
 * URL: https://www.wevity.com/?c=find&s=1&gub=14 (대외활동/서포터즈)
 */
async function crawlWevityActivities() {
  const baseUrl = 'https://www.wevity.com/?c=find&s=1&gub=14';
  let totalSaved = 0;
  const allEvents = [];

  for (let page = 1; page <= 2; page++) {
    try {
      const url = `${baseUrl}&page=${page}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const events = [];

      $('table tbody tr, .list-item, .contest-list li').each((i, el) => {
        const $el = $(el);
        const titleEl = $el.find('td:nth-child(1) a, .tit a, .title a');
        const title = titleEl.text().trim();
        const link = titleEl.attr('href');
        const fieldText = $el.find('.sub_txt, .field').text().trim();
        const fields = parseFields(fieldText);
        const organizer = $el.find('td:nth-child(2), .org').text().trim();
        const statusText = $el.find('td:nth-child(3), .d-day').text().trim();
        const { dday, status } = parseDdayStatus(statusText);

        if (title && title.length > 2) {
          const sourceId = link
            ? `wevity_act_${extractIdFromUrl(link)}`
            : `wevity_activity_p${page}_${i}`;

          events.push({
            title: cleanTitle(title),
            category: 'ACTIVITY',
            organizer: organizer || null,
            source: 'wevity',
            sourceId,
            startDate: new Date(),
            deadline: dday ? calculateDeadline(dday) : null,
            field: fields.length > 0 ? fields : ['대외활동'],
            targetAudience: ['대학생'],
            url: link ? normalizeUrl(link, 'https://www.wevity.com') : null,
            status: status || 'UPCOMING',
          });
        }
      });

      allEvents.push(...events);

      for (const event of events) {
        try {
          await prisma.event.upsert({
            where: {
              source_sourceId: { source: event.source, sourceId: event.sourceId },
            },
            update: {
              title: event.title,
              organizer: event.organizer,
              deadline: event.deadline,
              field: event.field,
              status: event.status,
              updatedAt: new Date(),
            },
            create: event,
          });
          totalSaved++;
        } catch (e) {}
      }

      await delay(1000);
    } catch (error) {
      console.error(`[위비티 대외활동] 페이지 ${page} 크롤링 실패:`, error.message);
    }
  }

  return { count: totalSaved, events: allEvents };
}

/**
 * 1365 자원봉사 포털 크롤링
 * https://www.1365.go.kr/vols/P9210/partcptn/timeCp498.do
 * 
 * 참고: 1365는 공공데이터포털(data.go.kr)에서 API 키를 발급받아 사용하는 것이 안정적.
 * API 없이 HTML 크롤링도 시도.
 */
async function crawlVolunteer1365() {
  let totalSaved = 0;
  const allEvents = [];

  try {
    const response = await axios.get('https://www.1365.go.kr/vols/P9210/partcptn/timeCp498.do', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const events = [];

    $('table tbody tr, .volunteer-list li, .list_wrap li, .srch_list li').each((i, el) => {
      const $el = $(el);
      
      const title = $el.find('.tit, .title, td:nth-child(2) a, .vol_tit').text().trim();
      const organizer = $el.find('.org, .agency, td:nth-child(3), .vol_org').text().trim();
      const period = $el.find('.period, .date, td:nth-child(4), .vol_date').text().trim();
      const location = $el.find('.location, .area, td:nth-child(5), .vol_area').text().trim();
      const link = $el.find('a').attr('href');

      if (title && title.length > 2) {
        const dates = parsePeriod(period);
        events.push({
          title: cleanTitle(title),
          category: 'VOLUNTEER',
          organizer: organizer || null,
          source: '1365',
          sourceId: link ? `1365_${extractIdFromUrl(link)}` : `1365_${i}_${Date.now()}`,
          startDate: dates.start || new Date(),
          endDate: dates.end || null,
          deadline: dates.end || null,
          field: ['봉사활동'],
          targetAudience: ['대학생', '일반인'],
          location: location || null,
          url: link ? normalizeUrl(link, 'https://www.1365.go.kr') : null,
          status: 'UPCOMING',
        });
      }
    });

    allEvents.push(...events);

    for (const event of events) {
      try {
        await prisma.event.upsert({
          where: {
            source_sourceId: { source: event.source, sourceId: event.sourceId },
          },
          update: {
            title: event.title,
            organizer: event.organizer,
            deadline: event.deadline,
            status: event.status,
            updatedAt: new Date(),
          },
          create: event,
        });
        totalSaved++;
      } catch (e) {}
    }
  } catch (error) {
    console.error('[1365] 크롤링 에러:', error.message);
  }

  return { count: totalSaved, events: allEvents };
}

// ============ 유틸리티 함수들 ============

/**
 * D-day 텍스트에서 날짜 및 상태 파싱
 * 예: "D-15접수중", "D-1마감임박", "마감"
 */
function parseDdayStatus(text) {
  if (!text) return { dday: null, status: 'UPCOMING' };

  const ddayMatch = text.match(/D-(\d+)/i);
  const dday = ddayMatch ? parseInt(ddayMatch[1]) : null;

  let status = 'UPCOMING';
  if (text.includes('마감임박')) status = 'UPCOMING';
  else if (text.includes('마감') && !text.includes('임박')) status = 'CLOSED';
  else if (text.includes('접수중')) status = 'ONGOING';
  else if (text.includes('접수예정')) status = 'UPCOMING';

  return { dday, status };
}

/**
 * D-day 숫자로부터 마감일 계산
 */
function calculateDeadline(dday) {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + dday);
  deadline.setHours(23, 59, 59, 0);
  return deadline;
}

/**
 * 분야 텍스트 파싱
 * 예: "분류 : 기획/아이디어, 웹/모바일/IT, 게임/소프트웨어"
 */
function parseFields(text) {
  if (!text) return [];
  
  // "분류 : " 제거
  const cleaned = text.replace(/분류\s*:\s*/g, '').replace(/SPECIAL|IDEA|NEW/gi, '').trim();
  if (!cleaned) return [];

  return cleaned
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && f.length < 20);
}

/**
 * 기간 텍스트에서 시작/종료일 파싱
 * 예: "2025.03.01 ~ 2025.03.31", "2025-03-01~2025-03-31"
 */
function parsePeriod(text) {
  if (!text) return { start: null, end: null };

  const dates = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g);
  if (dates && dates.length >= 2) {
    return {
      start: parseSimpleDate(dates[0]),
      end: parseSimpleDate(dates[1]),
    };
  } else if (dates && dates.length === 1) {
    return { start: parseSimpleDate(dates[0]), end: null };
  }

  return { start: null, end: null };
}

/**
 * 간단한 날짜 문자열 파싱
 */
function parseSimpleDate(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }
  return null;
}

/**
 * URL에서 ID 추출
 */
function extractIdFromUrl(url) {
  if (!url) return String(Date.now());
  
  // ?idx=123 또는 /view/123 패턴
  const idxMatch = url.match(/[?&]idx=(\d+)/);
  if (idxMatch) return idxMatch[1];

  const pathMatch = url.match(/\/(\d+)(?:\?|$|\/)/);
  if (pathMatch) return pathMatch[1];

  // URL 해시로 고유 ID 생성
  return url.replace(/[^a-zA-Z0-9]/g, '').slice(-20) || String(Date.now());
}

/**
 * 상대 URL을 절대 URL로 변환
 */
function normalizeUrl(url, baseUrl) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  return `${baseUrl}/${url}`;
}

/**
 * 제목 정리 (불필요한 공백, 태그 제거)
 */
function cleanTitle(title) {
  return title
    .replace(/\s+/g, ' ')
    .replace(/SPECIAL|IDEA|NEW|신규|마감임박/gi, '')
    .trim();
}

/**
 * 딜레이 유틸리티
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 링커리어 인턴 크롤링
 * URL: https://linkareer.com/list/intern
 * 필터: filterBy_jobTypes=INTERN, filterBy_status=OPEN
 */
async function crawlLinkareerInterns() {
  const baseUrl = 'https://linkareer.com/list/intern';
  let totalSaved = 0;
  const allEvents = [];

  for (let page = 1; page <= 3; page++) {
    try {
      const url = `${baseUrl}?filterBy_activityTypeID=5&filterBy_jobTypes=INTERN&filterBy_status=OPEN&orderBy_direction=DESC&orderBy_field=RECENT&page=${page}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const events = [];

      $('a[href*="/activity/"], .activity-list-card, li.list-item').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href') || $el.find('a').attr('href');
        const title = $el.find('h3, .activity-title, .title').first().text().trim()
          || $el.find('.recruit-title, .name').text().trim();
        const organizer = $el.find('.organization-name, .company-name, .org').first().text().trim();
        const deadlineText = $el.find('.recruit-close, .deadline, .d-day').text().trim();
        const location = $el.find('.location, .work-area, .region').first().text().trim();
        const jobType = $el.find('.job-type, .activity-type, .type').first().text().trim();
        const fieldText = $el.find('.tag-list, .job-tag, .category').text().trim();

        if (title && title.length > 2) {
          const sourceId = href
            ? `linkareer_${extractIdFromUrl(href)}`
            : `linkareer_intern_p${page}_${i}`;

          events.push({
            title: cleanTitle(title),
            category: 'INTERN',
            organizer: organizer || null,
            location: location || null,
            source: 'linkareer',
            sourceId,
            startDate: new Date(),
            deadline: parseLinkareerDeadline(deadlineText),
            field: fieldText ? parseFields(fieldText) : ['인턴'],
            targetAudience: ['대학생', '졸업예정자'],
            reward: jobType || null,
            url: href ? normalizeUrl(href, 'https://linkareer.com') : null,
            status: 'UPCOMING',
          });
        }
      });

      allEvents.push(...events);

      for (const event of events) {
        try {
          await prisma.event.upsert({
            where: {
              source_sourceId: { source: event.source, sourceId: event.sourceId },
            },
            update: {
              title: event.title,
              organizer: event.organizer,
              deadline: event.deadline,
              location: event.location,
              field: event.field,
              status: event.status,
              updatedAt: new Date(),
            },
            create: event,
          });
          totalSaved++;
        } catch (e) {}
      }

      await delay(1500);
    } catch (error) {
      console.error(`[링커리어 인턴] 페이지 ${page} 크롤링 실패:`, error.message);
    }
  }

  return { count: totalSaved, events: allEvents };
}

/**
 * 링커리어 대외활동/공모전 크롤링
 * URL: https://linkareer.com/list/activity
 */
async function crawlLinkareerActivities() {
  const baseUrl = 'https://linkareer.com/list/activity';
  let totalSaved = 0;
  const allEvents = [];

  for (let page = 1; page <= 3; page++) {
    try {
      const url = `${baseUrl}?filterBy_status=OPEN&orderBy_direction=DESC&orderBy_field=RECENT&page=${page}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const events = [];

      $('a[href*="/activity/"], .activity-list-card, li.list-item').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href') || $el.find('a').attr('href');
        const title = $el.find('h3, .activity-title, .title').first().text().trim();
        const organizer = $el.find('.organization-name, .company-name').first().text().trim();
        const deadlineText = $el.find('.recruit-close, .deadline, .d-day').text().trim();
        const activityType = $el.find('.activity-type, .type').first().text().trim();
        const fieldText = $el.find('.tag-list, .category').text().trim();

        if (title && title.length > 2) {
          let category = 'ACTIVITY';
          if (activityType.includes('공모전') || title.includes('공모전')) category = 'CONTEST';
          else if (activityType.includes('봉사')) category = 'VOLUNTEER';
          else if (activityType.includes('교육') || activityType.includes('세미나')) category = 'SEMINAR';

          const sourceId = href
            ? `linkareer_act_${extractIdFromUrl(href)}`
            : `linkareer_act_p${page}_${i}`;

          events.push({
            title: cleanTitle(title),
            category,
            organizer: organizer || null,
            source: 'linkareer',
            sourceId,
            startDate: new Date(),
            deadline: parseLinkareerDeadline(deadlineText),
            field: fieldText ? parseFields(fieldText) : ['대외활동'],
            targetAudience: ['대학생'],
            url: href ? normalizeUrl(href, 'https://linkareer.com') : null,
            status: 'UPCOMING',
          });
        }
      });

      allEvents.push(...events);

      for (const event of events) {
        try {
          await prisma.event.upsert({
            where: {
              source_sourceId: { source: event.source, sourceId: event.sourceId },
            },
            update: {
              title: event.title,
              organizer: event.organizer,
              deadline: event.deadline,
              field: event.field,
              status: event.status,
              updatedAt: new Date(),
            },
            create: event,
          });
          totalSaved++;
        } catch (e) {}
      }

      await delay(1500);
    } catch (error) {
      console.error(`[링커리어 대외활동] 페이지 ${page} 크롤링 실패:`, error.message);
    }
  }

  return { count: totalSaved, events: allEvents };
}

/**
 * 링커리어 마감일 파싱
 * 예: "~ 05.18", "채용 시 마감", "상시채용", "~ 2026.05.18"
 */
function parseLinkareerDeadline(text) {
  if (!text) return null;

  // "채용 시 마감", "상시채용" → null (마감일 없음)
  if (text.includes('채용 시') || text.includes('상시')) return null;

  // "~ 05.18" 또는 "~ 2026.05.18" 패턴
  const fullDate = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (fullDate) {
    return new Date(parseInt(fullDate[1]), parseInt(fullDate[2]) - 1, parseInt(fullDate[3]), 23, 59, 59);
  }

  const monthDay = text.match(/(\d{1,2})[.\-/](\d{1,2})/);
  if (monthDay) {
    const year = new Date().getFullYear();
    const deadline = new Date(year, parseInt(monthDay[1]) - 1, parseInt(monthDay[2]), 23, 59, 59);
    // 만약 마감일이 이미 지났으면 내년으로 설정
    if (deadline < new Date()) {
      deadline.setFullYear(year + 1);
    }
    return deadline;
  }

  return null;
}

module.exports = {
  crawlAll,
  crawlWevityContests,
  crawlWevityActivities,
  crawlVolunteer1365,
  crawlLinkareerInterns,
  crawlLinkareerActivities,
  saveCrawledEventsToJson,
};
