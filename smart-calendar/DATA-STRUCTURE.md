# 📊 Smart Calendar - 데이터 구조 인수인계 문서

> 크롤링 담당이 작성한 데이터 구조 명세.
> AI 추천/가이드라인 담당, 프론트엔드 담당이 참고할 문서.

---

## 1. 모듈 책임

```
[크롤링 담당 ✅ 완료]
   ↓ 데이터 공급
[PostgreSQL Event 테이블]
   ↓ API 제공
[AI 추천/가이드라인 담당]   [프론트엔드 담당]
```

크롤링 담당은 **Event 테이블에 데이터를 채우는 것**까지 책임집니다.
이후 User/Recommendation/Guideline 테이블은 AI 담당이 채웁니다.

---

## 2. PostgreSQL 스키마 전체

### 2.1 Event ⭐ (크롤링 담당이 채움)

모든 외부 소스(위비티, 1365 등) 데이터가 이 테이블에 통합됩니다.

| 컬럼 | 타입 | 설명 | 비고 |
|------|------|------|------|
| `id` | UUID | PK | auto |
| `title` | String | 활동 제목 | 필수 |
| `description` | String? | 상세 설명 | |
| `category` | Enum | 카테고리 | 아래 참조 |
| `status` | Enum | 진행 상태 | UPCOMING/ONGOING/CLOSED |
| `startDate` | DateTime | 시작일 | 필수 |
| `endDate` | DateTime? | 종료일 | |
| `deadline` | DateTime? | **지원 마감일** ⭐ | 추천 핵심 |
| `organizer` | String? | 주최기관 | |
| `location` | String? | 장소/지역 | |
| `field` | String[] | **분야 태그** ⭐ | 추천 매칭 키 |
| `targetAudience` | String[] | 대상 (대학생/일반인) | |
| `reward` | String? | 상금/혜택 | |
| `url` | String? | 원본 링크 | |
| `imageUrl` | String? | 이미지 URL | |
| `source` | String | 출처 (wevity/1365 등) | 필수 |
| `sourceId` | String? | 원본 사이트 ID | |
| `createdAt` | DateTime | 생성일시 | auto |
| `updatedAt` | DateTime | 수정일시 | auto |

**제약조건:**
- `UNIQUE(source, sourceId)` - 중복 방지
- `INDEX(category, status)` - 필터링 최적화
- `INDEX(deadline)` - 마감일 정렬 최적화
- `INDEX(field)` - 분야 검색 최적화

### 2.2 EventCategory (Enum)

| 값 | 의미 | 데이터 소스 |
|----|------|-------------|
| `EXAM` | 시험 | 수동/학사 API |
| `CONTEST` | 공모전 | 위비티 ✅ |
| `ACTIVITY` | 대외활동 | 위비티 ✅ |
| `INTERN` | 인턴 | 링커리어 (예정) |
| `VOLUNTEER` | 봉사활동 | 1365 ✅ |
| `SCHOLARSHIP` | 장학금 | 추가 예정 |
| `SEMINAR` | 세미나/강연 | 추가 예정 |

### 2.3 EventStatus (Enum)

| 값 | 의미 |
|----|------|
| `UPCOMING` | 예정 (접수 전/중) |
| `ONGOING` | 진행중 |
| `CLOSED` | 마감 |

---

## 3. 다른 팀원이 사용할 테이블 (스키마는 정의되어 있음)

### 3.1 User (AI 담당이 사용)
```
id, email, name, university, major, grade, interests[]
```

### 3.2 UserEvent (사용자가 선택/저장한 이벤트)
```
id, userId, eventId, isSelected, memo
```

### 3.3 Recommendation (AI 추천 결과)
```
id, userId, eventId, score (0~1), reason
```

### 3.4 Guideline (AI 가이드라인)
```
id, eventId, title, steps (JSON), tips, timeline (JSON)
```

**steps JSON 예시:**
```json
[
  { "order": 1, "title": "공고 분석", "description": "...", "duration": "1시간" }
]
```

---

## 4. 크롤링 담당이 제공하는 API

### 이벤트 조회
```
GET /api/events
  ?category=CONTEST          (선택)
  &status=UPCOMING           (선택)
  &field=IT                  (선택)
  &search=AI                 (선택)
  &startDate=2026-06-01      (선택)
  &endDate=2026-06-30        (선택)
  &page=1&limit=20

응답:
{
  "events": [...],
  "pagination": { "page": 1, "totalPages": 5, "total": 100 }
}
```

### 캘린더용 월별 조회
```
GET /api/events/calendar/monthly?year=2026&month=6
→ 6월 한 달간의 이벤트 배열 반환
```

### 이벤트 상세
```
GET /api/events/:id
→ 단일 이벤트 + guidelines 포함
```

### 수동 크롤링
```
POST /api/events/crawl
→ 즉시 크롤링 실행 (운영자용)
```

---

## 5. 추천 시 활용 가이드 (AI 담당용)

`Event` 테이블에서 추천에 사용하면 좋은 필드:

| 필드 | 추천 활용 방식 |
|------|----------------|
| `field[]` | `User.interests[]`와 교집합 매칭 |
| `category` | 카테고리별 가중치 (인턴은 3~4학년 가산점 등) |
| `deadline` | 마감 임박도 점수 (D-7~D-30 우선) |
| `targetAudience[]` | 대학생 포함 여부 필터 |
| `organizer` | 대기업/공기업 가산점 |
| `reward` | 혜택 텍스트 분석으로 가치 평가 |
| `status` | `CLOSED` 제외 필터링 |

추천 쿼리 예시 (Prisma):
```js
const events = await prisma.event.findMany({
  where: {
    status: { not: 'CLOSED' },
    deadline: { gte: new Date() },
    OR: user.interests.map(i => ({ field: { has: i } })),
  },
  orderBy: { deadline: 'asc' },
  take: 50,
});
```

---

## 6. 크롤링 데이터 소스 현황

| 소스 | URL | 카테고리 | 구현 |
|------|-----|---------|------|
| 위비티 | wevity.com | CONTEST, ACTIVITY | ✅ |
| 1365 자원봉사 | 1365.go.kr | VOLUNTEER | ✅ |
| 링커리어 | linkareer.com | INTERN, ACTIVITY | ✅ |
| 공공데이터 API | data.go.kr | VOLUNTEER (공식) | 🔲 API키 필요 |
| 씽굿 | thinkyou.co.kr | CONTEST | 🔲 추가 가능 |

크롤링 주기: **매일 새벽 2시 자동 실행** (`node-cron` 사용)

---

## 7. 데이터 전달 방식 (팀원 선택)

### 옵션 A: JSON 파일로 받기 (간단, 추천)

```bash
cd backend
npm install
npm run export    # → backend/data/*.json 생성
```

생성되는 파일:
- `data/events.json` — 전체 이벤트
- `data/contests.json` — 공모전
- `data/activities.json` — 대외활동
- `data/interns.json` — 인턴
- `data/volunteers.json` — 봉사활동
- `data/summary.json` — 통계 요약
- `data/schema.json` — 데이터 스키마 명세

샘플은 `data/events.sample.json` 참고.

### 옵션 B: API로 받기 (실시간)

```bash
npm run dev   # 서버 실행 → http://localhost:3001
```
GET `/api/events` 호출해서 JSON 응답 받기.

### 옵션 C: PostgreSQL DB 직접 연결

`DATABASE_URL`로 직접 쿼리. Prisma 스키마는 `backend/prisma/schema.prisma`.

---

## 8. 실행 방법

```bash
# 1. 의존성 설치
cd backend && npm install

# 2. PostgreSQL DB 연결 (.env)
DATABASE_URL="postgresql://user:pass@localhost:5432/smart_calendar"

# 3. 마이그레이션
npx prisma migrate dev --name init

# 4. 시드 (테스트용)
npm run seed

# 5. 실제 크롤링
npm run crawl

# 6. 서버 실행 (API 제공)
npm run dev   →  http://localhost:3001
```

---

## 9. 변경/문의

크롤링 데이터 구조나 새 소스 추가 요청은 크롤링 담당에게 문의.
- 새 카테고리 필요 시 → `schema.prisma`의 `EventCategory` Enum에 추가
- 새 필드 필요 시 → `Event` 모델에 컬럼 추가 후 마이그레이션
