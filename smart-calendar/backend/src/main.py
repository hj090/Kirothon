"""
메인 실행 파일 - 통합 필터링(규칙+AI) + 가이드라인 생성
"""

from datetime import datetime, timezone
from pathlib import Path
from models import UserProfile, Event, Experience
from filter_engine import filter_events
from guide_generator import generate_guide
from data_loader import load_from_json, load_from_directory
from api_server import current_user


def format_deadline(event: Event) -> str:
    """마감일 포맷팅 (D-day 표시)"""
    if not event.deadline:
        return "미정"
    days_left = (event.deadline - datetime.now(timezone.utc)).days
    date_str = event.deadline.strftime("%Y-%m-%d")
    if days_left <= 0:
        return f"{date_str} (마감)"
    return f"{date_str} (D-{days_left})"


def main():
    # 사용자 프로필 설정
    user = current_user
    """user = UserProfile(
        name="홍길동",
        university="고려대학교",
        major="컴퓨터공학과",
        grade=3,
        interests=["AI", "데이터", "IT/소프트웨어"],
        experiences=[
            Experience(
                title="교내 AI 챗봇 프로젝트",
                category="프로젝트",
                preference="좋음",
                description="GPT API를 활용한 학사 안내 챗봇 개발",
                duration="2025.09 ~ 2025.12",
                skills=["Python", "OpenAI API", "Flask"],
            ),
            Experience(
                title="네이버 부스트캠프 AI Tech",
                category="교육",
                preference="좋음",
                description="AI 엔지니어링 집중 교육 과정 수료",
                duration="2025.06 ~ 2025.08",
                skills=["PyTorch", "NLP", "데이터 분석"],
            ),
            Experience(
                title="스타트업 인턴 (백엔드)",
                category="인턴",
                preference="나쁨",
                description="REST API 설계 및 DB 최적화 업무",
                duration="2025.01 ~ 2025.02",
                skills=["Node.js", "PostgreSQL", "Docker"],
            ),
        ],
    )"""

    print(f"{'='*60}")
    print(f"  Smart Calendar - AI 맞춤 활동 추천")
    print(f"{'='*60}")
    print(f"  이름: {user.name}")
    print(f"  학교: {user.university}")
    print(f"  학과: {user.major}")
    print(f"  학년: {user.grade}학년")
    print(f"  관심사: {', '.join(user.interests)}")
    if user.experiences:
        print(f"  경력: {len(user.experiences)}건")
        for exp in user.experiences:
            pref_icon = "👍" if exp.preference == "좋음" else "👎"
            print(f"    {pref_icon} {exp.title} ({exp.category})")
    print(f"{'='*60}\n")

    # 이벤트 데이터 로드 (크롤링 담당이 export한 JSON 파일들)
    data_dir = Path(__file__).parent.parent / "data"
    events = load_from_directory(str(data_dir))

    # data 디렉토리가 비어있으면 단일 파일 fallback
    if not events:
        events_path = data_dir / "events.json"
        if events_path.exists():
            events = load_from_json(str(events_path))

    if not events:
        print("이벤트 데이터를 불러올 수 없습니다.")
        return

    print(f"총 {len(events)}개 이벤트 로드됨\n")

    # 통합 필터링 (규칙 40% + AI 60%)
    results = filter_events(user, events, min_relevance=0.10, use_ai=True)

    print(f"\n→ {len(results)}개 추천\n")

    for i, (event, score, reason) in enumerate(results, 1):
        print(f"[{i}] {event.title}")
        print(f"    카테고리: {event.category.value}")
        print(f"    분야: {', '.join(event.field)}")
        print(f"    적합도: {score:.1%}")
        if reason:
            print(f"    추천 사유: {reason}")
        print(f"    마감일: {format_deadline(event)}")
        if event.organizer:
            print(f"    주최: {event.organizer}")
        if event.reward:
            print(f"    혜택: {event.reward}")
        print()

    if not results:
        print("추천할 활동이 없습니다.")
        return

    # 사용자 선택 → 가이드라인 생성
    print(f"{'-'*60}")
    choice = input("가이드라인을 받고 싶은 활동 번호를 입력하세요 (0=종료): ")

    try:
        choice_idx = int(choice)
    except ValueError:
        print("잘못된 입력입니다.")
        return

    if choice_idx == 0:
        print("종료합니다.")
        return

    if choice_idx < 1 or choice_idx > len(results):
        print("유효하지 않은 번호입니다.")
        return

    selected_event = results[choice_idx - 1][0]

    print(f"\n{'='*60}")
    print(f"  [{selected_event.title}] 준비 가이드라인 생성 중...")
    print(f"{'='*60}\n")

    try:
        guide = generate_guide(user, selected_event)
        print(guide)
    except ValueError as e:
        print(f"오류: {e}")
    except Exception as e:
        print(f"API 호출 실패: {e}")


if __name__ == "__main__":
    main()
