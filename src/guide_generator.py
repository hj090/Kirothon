"""
AI 가이드라인 생성기
- 사용자가 선택한 이벤트에 대해 준비 가이드라인을 Hugging Face Inference API로 생성
- Guideline 테이블 형식(steps JSON, tips, timeline)에 맞게 출력
"""

import os
import json
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from models import UserProfile, Event

# .env 파일에서 API 키 자동 로드
load_dotenv(Path(__file__).parent.parent / ".env")


def build_prompt(user: UserProfile, event: Event) -> str:
    """LLM에 전달할 프롬프트 생성"""
    deadline_str = event.deadline.strftime("%Y-%m-%d") if event.deadline else "미정"

    return f"""당신은 대학생 공모전/대외활동 준비를 도와주는 멘토입니다.
아래 사용자 정보와 선택한 활동을 바탕으로, 활동 준비에 대한 실질적인 가이드라인을 작성해주세요.

[사용자 정보]
- 학교: {user.university}
- 학과: {user.major}
- 관심사: {', '.join(user.interests)}

[선택한 활동]
- 활동명: {event.title}
- 유형: {event.category.value}
- 분야: {', '.join(event.field)}
- 마감일: {deadline_str}
- 주최: {event.organizer or '미정'}
- 설명: {event.description or '없음'}
- 상금/혜택: {event.reward or '없음'}

다음 항목을 포함하여 가이드라인을 작성해주세요:
1. 활동 개요 및 핵심 포인트
2. 준비 단계별 로드맵 (타임라인 포함)
3. 사용자의 학과/관심사를 활용한 차별화 전략
4. 필요한 역량 및 추천 학습 자료
5. 주의사항 및 팁

간결하고 실용적으로 한국어로 작성해주세요."""


def generate_guide(
    user: UserProfile,
    event: Event,
    api_key: Optional[str] = None,
    model: str = "meta-llama/Llama-3.1-8B-Instruct",
) -> str:
    """
    Hugging Face Inference API를 호출하여 활동 준비 가이드라인 생성

    Args:
        user: 사용자 프로필
        event: 선택한 이벤트
        api_key: Hugging Face API 토큰 (None이면 환경변수에서 읽음)
        model: 사용할 모델명

    Returns:
        생성된 가이드라인 텍스트
    """
    token = api_key or os.environ.get("HF_TOKEN")
    if not token:
        raise ValueError(
            "API 토큰이 필요합니다. "
            "환경변수 HF_TOKEN을 설정하거나 api_key 파라미터를 전달하세요."
        )

    client = InferenceClient(token=token)

    prompt = build_prompt(user, event)

    response = client.chat_completion(
        model=model,
        messages=[
            {"role": "system", "content": "당신은 대학생 활동 준비를 돕는 전문 멘토입니다. 한국어로 답변하세요."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1500,
        temperature=0.7,
    )

    return response.choices[0].message.content
