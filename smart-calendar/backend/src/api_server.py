"""
Flask API 서버 - 프론트엔드에 추천 결과 및 사용자 데이터 제공
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
from pathlib import Path

from models import UserProfile, Event, Experience
from filter_engine import filter_events
from guide_generator import generate_guide
from data_loader import load_from_directory

app = Flask(__name__)
CORS(app)

# 데이터 디렉토리
DATA_DIR = str(Path(__file__).parent.parent / "data")

# 기본 사용자 프로필 (프론트엔드에서 수정 가능)
current_user = UserProfile(
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
)


@app.route("/api/profile", methods=["GET"])
def get_profile():
    """사용자 프로필 조회"""
    return jsonify({
        "name": current_user.name,
        "university": current_user.university,
        "major": current_user.major,
        "grade": current_user.grade,
        "interests": current_user.interests,
        "experiences": [
            {
                "title": exp.title,
                "category": exp.category,
                "preference": exp.preference,
                "description": exp.description,
                "duration": exp.duration,
                "skills": exp.skills,
            }
            for exp in current_user.experiences
        ],
    })


@app.route("/api/profile", methods=["PUT"])
def update_profile():
    """사용자 프로필 수정"""
    global current_user
    data = request.json

    current_user = UserProfile(
        name=data.get("name", current_user.name),
        university=data.get("university", current_user.university),
        major=data.get("major", current_user.major),
        grade=data.get("grade", current_user.grade),
        interests=data.get("interests", current_user.interests),
        experiences=[
            Experience(
                title=exp.get("title", ""),
                category=exp.get("category", ""),
                preference=exp.get("preference", "좋음"),
                description=exp.get("description", ""),
                duration=exp.get("duration", ""),
                skills=exp.get("skills", []),
            )
            for exp in data.get("experiences", [])
        ],
    )

    return jsonify({"status": "ok", "message": "프로필이 업데이트되었습니다."})


@app.route("/api/recommendations", methods=["GET"])
def get_recommendations():
    """AI 추천 결과 조회"""
    min_relevance = float(request.args.get("min_relevance", 0.05))
    use_ai = request.args.get("use_ai", "false").lower() == "true"

    # 이벤트 데이터 로드
    events = load_from_directory(DATA_DIR)

    if not events:
        return jsonify({"recommendations": [], "total_events": 0})

    # 필터링
    results = filter_events(current_user, events, min_relevance=min_relevance, use_ai=use_ai)

    recommendations = []
    for event, score, reason in results:
        recommendations.append({
            "title": event.title,
            "category": event.category.value,
            "status": event.status.value,
            "field": event.field,
            "score": round(score * 100, 1),
            "reason": reason,
            "deadline": event.deadline.isoformat() if event.deadline else None,
            "dday": (event.deadline - datetime.now(timezone.utc)).days if event.deadline else None,
            "organizer": event.organizer,
            "reward": event.reward,
            "url": event.url,
            "description": event.description,
            "targetAudience": event.targetAudience,
        })

    return jsonify({
        "recommendations": recommendations,
        "total_events": len(events),
        "filtered_count": len(recommendations),
        "user": current_user.name,
    })


@app.route("/api/events", methods=["GET"])
def get_events():
    """전체 이벤트 목록 조회"""
    events = load_from_directory(DATA_DIR)

    category = request.args.get("category")
    if category:
        events = [e for e in events if e.category.value == category]

    event_list = []
    for event in events:
        event_list.append({
            "title": event.title,
            "category": event.category.value,
            "status": event.status.value,
            "field": event.field,
            "deadline": event.deadline.isoformat() if event.deadline else None,
            "organizer": event.organizer,
            "reward": event.reward,
            "url": event.url,
            "description": event.description,
        })

    return jsonify({"events": event_list, "total": len(event_list)})


@app.route("/api/guide", methods=["POST"])
def get_guide():
    """선택한 이벤트에 대한 AI 가이드라인 생성"""
    data = request.json
    event_title = data.get("title", "")

    events = load_from_directory(DATA_DIR)
    selected = next((e for e in events if e.title == event_title), None)

    if not selected:
        return jsonify({"error": "이벤트를 찾을 수 없습니다."}), 404

    try:
        guide = generate_guide(current_user, selected)
        return jsonify({"guide": guide, "event": event_title})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("🚀 Smart Calendar API 서버 시작: http://localhost:5000")
    print("   - 프로필: GET/PUT /api/profile")
    print("   - 추천: GET /api/recommendations")
    print("   - 이벤트: GET /api/events")
    print("   - 가이드: POST /api/guide")
    app.run(host="0.0.0.0", port=5000, debug=True)
