"""
데이터 모델 정의 - DATA-STRUCTURE.md 기반
- UserProfile: User 테이블 매핑
- Event: Event 테이블 매핑
"""

from dataclasses import dataclass, field as dataclass_field
from typing import List, Optional
from enum import Enum
from datetime import datetime


class EventCategory(Enum):
    """EventCategory Enum - 크롤링 데이터 카테고리"""
    EXAM = "EXAM"
    CONTEST = "CONTEST"
    ACTIVITY = "ACTIVITY"
    INTERN = "INTERN"
    VOLUNTEER = "VOLUNTEER"
    SCHOLARSHIP = "SCHOLARSHIP"
    SEMINAR = "SEMINAR"


class EventStatus(Enum):
    """EventStatus Enum - 진행 상태"""
    UPCOMING = "UPCOMING"
    ONGOING = "ONGOING"
    CLOSED = "CLOSED"


@dataclass
class UserProfile:
    """User 테이블 매핑"""
    id: Optional[str] = None
    email: Optional[str] = None
    name: str = ""
    university: str = ""             # 학교
    major: str = ""                  # 학과
    grade: Optional[int] = None      # 학년
    interests: List[str] = dataclass_field(default_factory=list)  # 관심사


@dataclass
class Event:
    """Event 테이블 매핑 (크롤링 데이터)"""
    id: Optional[str] = None
    title: str = ""
    description: Optional[str] = None
    category: EventCategory = EventCategory.CONTEST
    status: EventStatus = EventStatus.UPCOMING
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
    deadline: Optional[datetime] = None
    organizer: Optional[str] = None
    location: Optional[str] = None
    field: List[str] = dataclass_field(default_factory=list)          # 분야 태그
    targetAudience: List[str] = dataclass_field(default_factory=list) # 대상
    reward: Optional[str] = None
    url: Optional[str] = None
    imageUrl: Optional[str] = None
    source: str = ""
    sourceId: Optional[str] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
