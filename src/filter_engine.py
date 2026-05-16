"""
필터링 엔진
- User 프로필(학교, 학과, 관심사)에 맞는 Event를 필터링하고 관련도 점수를 매김
- DATA-STRUCTURE.md 기반
"""

from typing import List, Tuple
from datetime import datetime
from models import UserProfile, Event, EventStatus, EventCategory


# 학과 → 관련 분야 매핑 (확장 가능)
MAJOR_FIELD_MAP = {
    "컴퓨터공학과": ["IT/소프트웨어", "AI", "개발", "데이터", "보안", "웹", "앱"],
    "소프트웨어학과": ["IT/소프트웨어", "AI", "개발", "데이터", "웹", "앱"],
    "전자공학과": ["IT/소프트웨어", "하드웨어", "IoT", "임베디드", "로봇"],
    "경영학과": ["경영", "마케팅", "창업", "기획", "금융", "컨설팅"],
    "경제학과": ["경제", "금융", "데이터", "정책", "컨설팅"],
    "디자인학과": ["디자인", "UX", "UI", "브랜딩", "영상", "그래픽"],
    "시각디자인학과": ["디자인", "UX", "UI", "브랜딩", "그래픽"],
    "산업디자인학과": ["디자인", "UX", "UI", "제품", "3D"],
    "미디어학과": ["미디어", "영상", "콘텐츠", "마케팅", "광고"],
    "광고홍보학과": ["광고", "마케팅", "콘텐츠", "브랜딩", "기획"],
    "국어국문학과": ["글쓰기", "콘텐츠", "편집", "출판"],
    "영어영문학과": ["번역", "글쓰기", "콘텐츠", "국제"],
    "통계학과": ["데이터", "AI", "분석", "금융"],
    "수학과": ["데이터", "AI", "분석", "금융"],
    "건축학과": ["건축", "설계", "도시", "3D"],
    "환경공학과": ["환경", "에너지", "ESG", "정책"],
    "생명공학과": ["바이오", "헬스케어", "연구", "제약"],
    "화학공학과": ["화학", "에너지", "소재", "연구"],
    "기계공학과": ["기계", "로봇", "제조", "3D", "자동차"],
}

# 카테고리별 학년 가산점 (인턴은 3~4학년에 가산)
CATEGORY_GRADE_BONUS = {
    EventCategory.INTERN: [3, 4],
    EventCategory.SCHOLARSHIP: [1, 2, 3, 4],
}


def check_status_filter(event: Event) -> bool:
    """마감된 이벤트 제외"""
    return event.status != EventStatus.CLOSED


def check_deadline_filter(event: Event) -> bool:
    """마감일이 지난 이벤트 제외"""
    if event.deadline is None:
        return True
    return event.deadline >= datetime.now()


def check_target_audience(event: Event) -> bool:
    """대학생 대상 여부 확인 (targetAudience가 비어있으면 통과)"""
    if not event.targetAudience:
        return True
    # "대학생"이 포함되어 있으면 통과
    for target in event.targetAudience:
        if "대학생" in target:
            return True
    return False


def is_eligible(event: Event) -> bool:
    """이벤트 기본 자격 필터링"""
    return (
        check_status_filter(event)
        and check_deadline_filter(event)
        and check_target_audience(event)
    )


def calculate_relevance_score(user: UserProfile, event: Event) -> float:
    """
    관련도 점수 계산 (0.0 ~ 1.0)
    - 관심사 ↔ field 매칭: 최대 0.45
    - 학과 ↔ field 매칭: 최대 0.30
    - 마감 임박도: 최대 0.15
    - 카테고리-학년 보너스: 최대 0.10
    """
    score = 0.0

    # 1. 관심사 매칭 (최대 0.45)
    if user.interests and event.field:
        user_interests_lower = [i.lower() for i in user.interests]
        event_fields_lower = [f.lower() for f in event.field]

        matched = sum(
            1 for interest in user_interests_lower
            if any(interest in ef or ef in interest for ef in event_fields_lower)
        )
        interest_score = min(matched / max(len(user.interests), 1), 1.0)
        score += interest_score * 0.45

    # 2. 학과-분야 매칭 (최대 0.30)
    major_fields = MAJOR_FIELD_MAP.get(user.major, [])
    if major_fields and event.field:
        major_fields_lower = [f.lower() for f in major_fields]
        event_fields_lower = [f.lower() for f in event.field]

        matched = sum(
            1 for mf in major_fields_lower
            if any(mf in ef or ef in mf for ef in event_fields_lower)
        )
        major_score = min(matched / max(len(major_fields), 1), 1.0)
        score += major_score * 0.30

    # 3. 마감 임박도 (최대 0.15) - D-7~D-30 우선
    if event.deadline:
        days_left = (event.deadline - datetime.now()).days
        if 0 <= days_left <= 7:
            score += 0.15
        elif 7 < days_left <= 14:
            score += 0.12
        elif 14 < days_left <= 30:
            score += 0.08
        elif 30 < days_left <= 60:
            score += 0.04

    # 4. 카테고리-학년 보너스 (최대 0.10)
    if user.grade and event.category in CATEGORY_GRADE_BONUS:
        if user.grade in CATEGORY_GRADE_BONUS[event.category]:
            score += 0.10

    return round(min(score, 1.0), 3)


def filter_events(
    user: UserProfile,
    events: List[Event],
    min_relevance: float = 0.25,
) -> List[Tuple[Event, float]]:
    """
    사용자 프로필에 맞는 이벤트 필터링 및 관련도 순 정렬

    Args:
        user: 사용자 프로필
        events: 전체 이벤트 리스트 (크롤링 API 데이터)
        min_relevance: 최소 관련도 점수 (기본 0.25)

    Returns:
        (이벤트, 관련도 점수) 튜플 리스트 (관련도 내림차순 정렬)
    """
    results = []

    for event in events:
        # 1단계: 기본 자격 필터링
        if not is_eligible(event):
            continue

        # 2단계: 관련도 점수 계산
        relevance = calculate_relevance_score(user, event)

        # 3단계: 최소 관련도 필터
        if relevance >= min_relevance:
            results.append((event, relevance))

    # 관련도 내림차순 정렬
    results.sort(key=lambda x: x[1], reverse=True)

    return results
