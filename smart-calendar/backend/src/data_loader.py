"""
크롤링 API 데이터 로더
- 크롤링 담당의 API(/api/events)에서 데이터를 받아 Event 객체로 변환
"""

import json
from typing import List, Optional
from datetime import datetime
from models import Event, EventCategory, EventStatus


def parse_datetime(value: Optional[str]) -> Optional[datetime]:
    """ISO 형식 날짜 문자열을 datetime으로 변환"""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def parse_event(raw: dict) -> Event:
    """
    크롤링 API 응답의 단일 이벤트를 Event 객체로 변환

    API 응답 형식 (GET /api/events):
    {
        "id": "uuid",
        "title": "2026 AI 해커톤",
        "description": "AI 기반 서비스 개발",
        "category": "CONTEST",
        "status": "UPCOMING",
        "startDate": "2026-06-01T00:00:00Z",
        "endDate": "2026-06-30T00:00:00Z",
        "deadline": "2026-05-25T23:59:59Z",
        "organizer": "과학기술정보통신부",
        "location": "서울",
        "field": ["IT", "AI", "개발"],
        "targetAudience": ["대학생"],
        "reward": "총 상금 1000만원",
        "url": "https://example.com",
        "imageUrl": "https://example.com/img.jpg",
        "source": "wevity",
        "sourceId": "12345"
    }
    """
    # category 파싱
    try:
        category = EventCategory(raw.get("category", "CONTEST"))
    except ValueError:
        category = EventCategory.CONTEST

    # status 파싱
    try:
        status = EventStatus(raw.get("status", "UPCOMING"))
    except ValueError:
        status = EventStatus.UPCOMING

    return Event(
        id=raw.get("id"),
        title=raw.get("title", "제목 없음"),
        description=raw.get("description"),
        category=category,
        status=status,
        startDate=parse_datetime(raw.get("startDate")),
        endDate=parse_datetime(raw.get("endDate")),
        deadline=parse_datetime(raw.get("deadline")),
        organizer=raw.get("organizer"),
        location=raw.get("location"),
        field=raw.get("field", []),
        targetAudience=raw.get("targetAudience", []),
        reward=raw.get("reward"),
        url=raw.get("url"),
        imageUrl=raw.get("imageUrl"),
        source=raw.get("source", ""),
        sourceId=raw.get("sourceId"),
        createdAt=parse_datetime(raw.get("createdAt")),
        updatedAt=parse_datetime(raw.get("updatedAt")),
    )


def load_from_json(file_path: str) -> List[Event]:
    """JSON 파일에서 이벤트 데이터 로드"""
    with open(file_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    # API 응답이 { "events": [...] } 형식인 경우 처리
    if isinstance(raw_data, dict) and "events" in raw_data:
        raw_data = raw_data["events"]

    return [parse_event(item) for item in raw_data]


def load_from_directory(dir_path: str) -> List[Event]:
    """디렉토리 내 모든 JSON 파일에서 이벤트 데이터를 합쳐서 로드 (중복 제거)"""
    import os
    from pathlib import Path

    directory = Path(dir_path)
    if not directory.exists():
        return []

    all_events = []
    seen_ids = set()

    # summary.json, schema.json 등 메타 파일은 제외
    skip_files = {"summary.json", "schema.json"}

    for json_file in sorted(directory.glob("*.json")):
        if json_file.name in skip_files:
            continue
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            if isinstance(raw_data, dict) and "events" in raw_data:
                raw_data = raw_data["events"]

            if not isinstance(raw_data, list):
                continue

            for item in raw_data:
                # source + sourceId 조합으로 중복 제거
                dedup_key = f"{item.get('source', '')}_{item.get('sourceId', '')}"
                if dedup_key not in seen_ids:
                    seen_ids.add(dedup_key)
                    all_events.append(parse_event(item))
        except (json.JSONDecodeError, IOError):
            continue

    return all_events


def load_from_api_response(response_data: dict) -> List[Event]:
    """API 응답 딕셔너리에서 이벤트 데이터 로드"""
    events_raw = response_data.get("events", [])
    return [parse_event(item) for item in events_raw]


def load_from_list(raw_data: List[dict]) -> List[Event]:
    """딕셔너리 리스트에서 이벤트 데이터 로드"""
    return [parse_event(item) for item in raw_data]
