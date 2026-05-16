# 📅 Smart Calendar - 데이터 크롤링 모듈

> 본 레포는 **데이터 수집 + PostgreSQL 저장** 담당 모듈입니다.
> AI 추천/가이드라인/프론트엔드는 다른 팀원이 본 데이터를 기반으로 구현합니다.

## 역할 분담

| 모듈 | 담당 | 상태 |
|------|------|------|
| 🕷️ **크롤링 + DB 스키마** | 본인 | ✅ 완료 |
| 🤖 AI 추천/가이드라인 | 팀원 A | 진행 예정 |
| 🎨 프론트엔드 (캘린더 UI) | 팀원 B | 진행 예정 |

## 구조

```
smart-calendar/
├── README.md
├── DATA-STRUCTURE.md          ← 팀원 인수인계 문서
└── backend/
    ├── package.json
    ├── .env / .env.example
    ├── prisma/
    │   ├── schema.prisma      ← PostgreSQL 통합 스키마
    │   └── seed.js            ← 테스트용 시드 데이터
    ├── scripts/
    │   └── run-crawler.js     ← 크롤러 단독 실행
    └── src/
        ├── index.js           ← Express API 서버
        ├── routes/
        │   └── events.js      ← 이벤트 조회 API
        └── services/
            └── crawler.js     ← 위비티/1365 크롤러
```

## 빠른 시작

```bash
cd backend
npm install

# .env 파일에 PostgreSQL 접속 정보 입력
cp .env.example .env

# DB 마이그레이션
npx prisma migrate dev --name init

# 시드 데이터 삽입 (테스트용)
npm run seed

# 크롤러 실행 (실제 데이터 수집)
npm run crawl

# API 서버 실행
npm run dev
```

## 데이터 소스

| 소스 | 카테고리 | 상태 |
|------|---------|------|
| [위비티](https://www.wevity.com) | 공모전, 대외활동 | ✅ |
| [1365 자원봉사](https://www.1365.go.kr) | 봉사활동 | ✅ |
| 링커리어 | 인턴 | 🔲 추가 가능 |
| 공공데이터포털 API | 봉사 (공식) | 🔲 API키 필요 |

## API 엔드포인트 (팀원이 사용)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/events` | 이벤트 목록 (필터링 지원) |
| GET | `/api/events/:id` | 이벤트 상세 |
| GET | `/api/events/calendar/monthly?year=2026&month=6` | 캘린더용 월별 |
| POST | `/api/events/crawl` | 수동 크롤링 |
| GET | `/api/health` | 헬스 체크 |

상세 데이터 구조는 [DATA-STRUCTURE.md](./DATA-STRUCTURE.md) 참조.
