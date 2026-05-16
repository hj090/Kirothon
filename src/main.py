"""
메인 실행 파일 - 필터링 + AI 가이드라인 생성
prisma/events.json에서 크롤링된 이벤트 데이터를 읽어와 필터링합니다.
"""

from datetime import datetime
from pathlib import Path
from models import UserProfile, Event
from filter_engine import filter_events
from guide_generator import generate_guide
from data_loader import load_from_json


def format_deadline(event: Event) -> str:
    """마감일 포맷팅 (D-day 표시)"""
    if not event.deadline:
        return "미정"
    days_left = (event.deadline - datetime.now()).days
    date_str = event.deadline.strftime("%Y-%m-%d")
    if days_left <= 0:
        return f"{date_str} (마감)"
    return f"{date_str} (D-{days_left})"


def main():
    # 사용자 프로필 설정
    user = UserProfile(
        name="홍길동",
        university="고려대학교",
        major="컴퓨터공학과",
        grade=3,
        interests=["AI", "데이터", "IT/소프트웨어"],
    )

    print(f"{'='*60}")
    print(f"  Smart Calendar - 맞춤 활동 추천")
    print(f"{'='*60}")
    print(f"  이름: {user.name}")
    print(f"  학교: {user.university}")
    print(f"  학과: {user.major}")
    print(f"  학년: {user.grade}학년")
    print(f"  관심사: {', '.join(user.interests)}")
    print(f"{'='*60}\n")

    # prisma/events.json에서 이벤트 데이터 로드
    events_path = Path(__file__).parent / "prisma" / "events.json"
    events = load_from_json(str(events_path))

    if not events:
        print("이벤트 데이터를 불러올 수 없습니다.")
        return

    print(f"총 {len(events)}개 이벤트 로드됨")

    # 필터링 실행 (관련도 25% 이상만)
    results = filter_events(user, events, min_relevance=0.25)

    print(f"→ {len(results)}개 추천\n")

    for i, (event, score) in enumerate(results, 1):
        print(f"[{i}] {event.title}")
        print(f"    카테고리: {event.category.value}")
        print(f"    분야: {', '.join(event.field)}")
        print(f"    관련도: {score:.1%}")
        print(f"    마감일: {format_deadline(event)}")
        if event.organizer:
            print(f"    주최: {event.organizer}")
        if event.reward:
            print(f"    혜택: {event.reward}")
        print()

    if not results:
        print("추천할 활동이 없습니다.")
        return

    # 사용자 선택
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

    selected_event, _ = results[choice_idx - 1]

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
