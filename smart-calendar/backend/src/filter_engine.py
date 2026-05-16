"""
필터링 엔진 (통합)
- 1차: 규칙 기반 점수 계산 (키워드 매칭, 마감일, 학년 등)
- 2차: AI가 경력/역량 맥락을 분석하여 점수 보정
- 최종 점수 = 규칙 기반(40%) + AI 맥락 분석(60%)
"""

import os
import json
from pathlib import Path
from typing import List, Tuple, Optional
from datetime import datetime, timezone
from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from models import UserProfile, Event, EventStatus, EventCategory

load_dotenv(Path(__file__).parent.parent / ".env")

# 학과 → 관련 분야 매핑
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

CATEGORY_GRADE_BONUS = {
    EventCategory.INTERN: [3, 4],
    EventCategory.SCHOLARSHIP: [1, 2, 3, 4],
}


# ─── 1단계: 기본 자격 필터링 ───

def is_eligible(event: Event) -> bool:
    """마감/상태/대상 기본 필터"""
    if event.status == EventStatus.CLOSED:
        return False
    if event.deadline and event.deadline < datetime.now(timezone.utc):
        return False
    if event.targetAudience:
        if not any("대학생" in t for t in event.targetAudience):
            return False
    return True


# ─── 2단계: 규칙 기반 점수 (0.0 ~ 1.0) ───

def calculate_rule_score(user: UserProfile, event: Event) -> float:
    """키워드 매칭 + 마감 임박도 + 학년 보너스"""
    score = 0.0

    # 관심사 매칭 (최대 0.45)
    if user.interests and event.field:
        user_lower = [i.lower() for i in user.interests]
        event_lower = [f.lower() for f in event.field]
        matched = sum(
            1 for interest in user_lower
            if any(interest in ef or ef in interest for ef in event_lower)
        )
        score += min(matched / max(len(user.interests), 1), 1.0) * 0.45

    # 학과-분야 매칭 (최대 0.30)
    major_fields = MAJOR_FIELD_MAP.get(user.major, [])
    if major_fields and event.field:
        mf_lower = [f.lower() for f in major_fields]
        ef_lower = [f.lower() for f in event.field]
        matched = sum(
            1 for mf in mf_lower
            if any(mf in ef or ef in mf for ef in ef_lower)
        )
        score += min(matched / max(len(major_fields), 1), 1.0) * 0.30

    # 마감 임박도 (최대 0.15)
    if event.deadline:
        days_left = (event.deadline - datetime.now(timezone.utc)).days
        if 0 <= days_left <= 7:
            score += 0.15
        elif days_left <= 14:
            score += 0.12
        elif days_left <= 30:
            score += 0.08
        elif days_left <= 60:
            score += 0.04

    # 카테고리-학년 보너스 (최대 0.10)
    if user.grade and event.category in CATEGORY_GRADE_BONUS:
        if user.grade in CATEGORY_GRADE_BONUS[event.category]:
            score += 0.10

    return round(min(score, 1.0), 3)


# ─── 3단계: AI 맥락 분석 점수 ───

def build_ai_scoring_prompt(user: UserProfile, events: List[Tuple[Event, float]]) -> str:
    """AI에게 경력/역량 맥락 기반 점수를 요청하는 프롬프트"""

    # 경력 텍스트
    if user.experiences:
        exp_lines = []
        for exp in user.experiences:
            pref = "👍 좋았음" if exp.preference == "좋음" else "👎 싫었음"
            line = f"  - {exp.title} ({exp.category}) [{pref}]"
            if exp.skills:
                line += f" | 기술: {', '.join(exp.skills)}"
            if exp.description:
                line += f" | {exp.description}"
            exp_lines.append(line)
        exp_text = "\n".join(exp_lines)
    else:
        exp_text = "  없음"

    # 이벤트 목록
    event_lines = []
    for i, (event, rule_score) in enumerate(events):
        event_lines.append(
            f"[{i}] {event.title} (분야: {', '.join(event.field)}) "
            f"- {event.description or '설명 없음'}"
        )
    events_text = "\n".join(event_lines)

    return f"""사용자의 경력과 역량을 분석하여, 각 활동에 대한 적합도 점수(0~100)를 매겨주세요.

단순 키워드가 아니라 다음을 종합 판단하세요:
- 사용자의 프로젝트/인턴 경험이 활동에 직접 도움이 되는가
- 보유 기술 스택이 활동에서 요구하는 역량과 일치하는가
- 이 활동이 사용자의 커리어 성장에 기여하는가
- 경력 수준 대비 활동 난이도가 적절한가
- 사용자가 "좋았음"으로 표시한 경력과 유사한 활동은 가산점
- 사용자가 "싫었음"으로 표시한 경력과 유사한 활동은 감점 (사용자가 피하고 싶은 유형)

[사용자]
- 학교: {user.university} / 학과: {user.major} / {user.grade}학년
- 관심사: {', '.join(user.interests)}

[경력]
{exp_text}

[활동 목록]
{events_text}

반드시 아래 JSON 형식으로만 응답하세요:
[{{"index":0,"score":85,"reason":"한줄사유"}},{{"index":1,"score":60,"reason":"한줄사유"}}]"""


def get_ai_scores(
    user: UserProfile,
    events: List[Tuple[Event, float]],
    api_key: Optional[str] = None,
    model: str = "meta-llama/Llama-3.1-8B-Instruct",
) -> dict:
    """AI에게 맥락 기반 점수를 받아 {index: (score, reason)} 딕셔너리 반환"""
    token = api_key or os.environ.get("HF_TOKEN")
    if not token:
        return {}

    client = InferenceClient(token=token)
    prompt = build_ai_scoring_prompt(user, events)

    try:
        response = client.chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": "JSON 배열만 출력하세요. 다른 텍스트 없이."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=800,
            temperature=0.3,
        )
        text = response.choices[0].message.content.strip()

        # JSON 추출
        start = text.find("[")
        end = text.rfind("]") + 1
        if start == -1 or end == 0:
            return {}

        data = json.loads(text[start:end])
        result = {}
        for item in data:
            idx = item.get("index", -1)
            score = item.get("score", 0)
            reason = item.get("reason", "")
            if 0 <= idx < len(events):
                result[idx] = (score / 100.0, reason)
        return result

    except Exception:
        return {}


# ─── 통합 필터링 ───

def filter_events(
    user: UserProfile,
    events: List[Event],
    min_relevance: float = 0.50,
    use_ai: bool = True,
) -> List[Tuple[Event, float, str]]:
    """
    통합 필터링: 규칙 기반 + AI 맥락 분석을 종합하여 관련도 계산

    최종 점수 = 규칙 기반(40%) + AI 맥락 분석(60%)
    AI 호출 실패 시 규칙 기반 점수만 사용

    Args:
        user: 사용자 프로필 (경력 포함)
        events: 전체 이벤트 리스트
        min_relevance: 최소 관련도 (기본 0.25)
        use_ai: AI 분석 사용 여부

    Returns:
        (이벤트, 최종 점수, AI 추천 사유) 리스트 (내림차순)
    """
    # 1단계: 기본 자격 필터링
    eligible = [(event, calculate_rule_score(user, event))
                for event in events if is_eligible(event)]

    if not eligible:
        return []

    # 2단계: AI 맥락 점수 (실패 시 빈 딕셔너리)
    ai_scores = {}
    if use_ai and user.experiences:
        print("  AI가 경력/역량을 분석 중...")
        ai_scores = get_ai_scores(user, eligible)

    # 3단계: 종합 점수 계산
    results = []
    for i, (event, rule_score) in enumerate(eligible):
        if i in ai_scores:
            ai_score, reason = ai_scores[i]
            # 규칙(40%) + AI(60%)
            final_score = rule_score * 0.4 + ai_score * 0.6
        else:
            # AI 점수 없으면 규칙 기반만 사용
            final_score = rule_score
            reason = ""

        if final_score >= min_relevance:
            results.append((event, round(final_score, 3), reason))

    # 내림차순 정렬
    results.sort(key=lambda x: x[1], reverse=True)

    return results
