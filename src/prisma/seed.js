/**
 * DB 시드 데이터 - 개발/테스트용 샘플 데이터
 * 사용법: npx prisma db seed
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 시드 데이터 삽입 시작...');

  // 샘플 사용자
  const user = await prisma.user.upsert({
    where: { email: 'demo@university.ac.kr' },
    update: {},
    create: {
      email: 'demo@university.ac.kr',
      name: '김대학',
      university: '서울대학교',
      major: '컴퓨터공학',
      grade: 3,
      interests: ['IT/소프트웨어', '스타트업', '디자인'],
    },
  });

  console.log(`✅ 사용자 생성: ${user.name} (${user.id})`);

  // 샘플 이벤트 데이터
  const sampleEvents = [
    {
      title: '[삼성전자] 2026 하계 인턴십 모집',
      description: '삼성전자 DX부문 소프트웨어 직군 하계 인턴십을 모집합니다. 6주간의 실무 프로젝트를 경험할 수 있습니다.',
      category: 'INTERN',
      status: 'ONGOING',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-07-31'),
      deadline: new Date('2026-06-15'),
      organizer: '삼성전자',
      field: ['IT/소프트웨어', '공학'],
      targetAudience: ['대학생', '졸업예정자'],
      reward: '인턴십 수료 시 정규직 전환 기회',
      url: 'https://www.samsung.com/sec/careers',
      source: 'manual',
      sourceId: 'samsung_intern_2026_summer',
    },
    {
      title: '2026 공개SW 개발자대회',
      description: '과학기술정보통신부 주최 공개소프트웨어 개발자대회. 오픈소스 기반 혁신 프로젝트를 공모합니다.',
      category: 'CONTEST',
      status: 'UPCOMING',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-11-30'),
      deadline: new Date('2026-07-15'),
      organizer: '과학기술정보통신부',
      field: ['IT/소프트웨어', '오픈소스'],
      targetAudience: ['대학생', '일반인'],
      reward: '대상 3000만원, 장관상',
      url: 'https://www.oss.kr',
      source: 'manual',
      sourceId: 'oss_contest_2026',
    },
    {
      title: 'Google Developer Student Clubs 3기 모집',
      description: 'Google DSC 리드 및 멤버를 모집합니다. 1년간 Google 기술 기반 프로젝트와 커뮤니티 활동을 진행합니다.',
      category: 'ACTIVITY',
      status: 'UPCOMING',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2027-06-30'),
      deadline: new Date('2026-08-01'),
      organizer: 'Google',
      field: ['IT/소프트웨어', '커뮤니티'],
      targetAudience: ['대학생'],
      reward: 'Google 수료증, 네트워킹, 컨퍼런스 참가',
      source: 'manual',
      sourceId: 'gdsc_2026_3rd',
    },
    {
      title: 'SW 교육 봉사단 모집',
      description: '소외계층 청소년 대상 코딩 교육 봉사활동. 주 1회 2시간, 총 12주 과정.',
      category: 'VOLUNTEER',
      status: 'ONGOING',
      startDate: new Date('2026-05-15'),
      endDate: new Date('2026-08-15'),
      deadline: new Date('2026-06-01'),
      organizer: '한국정보화진흥원',
      location: '서울/경기',
      field: ['교육', 'IT/소프트웨어', '봉사활동'],
      targetAudience: ['대학생'],
      reward: '봉사시간 48시간 인정, 수료증',
      source: '1365',
      sourceId: '1365_sw_edu_2026',
    },
    {
      title: '2026 1학기 기말고사',
      description: '2026학년도 1학기 기말고사 기간',
      category: 'EXAM',
      status: 'UPCOMING',
      startDate: new Date('2026-06-16'),
      endDate: new Date('2026-06-20'),
      deadline: new Date('2026-06-16'),
      organizer: '서울대학교',
      field: ['학사일정'],
      targetAudience: ['대학생'],
      source: 'manual',
      sourceId: 'exam_2026_1_final',
    },
    {
      title: '제4회 문화체육관광 인공지능·데이터 활용 공모전',
      description: '문화체육관광 분야의 공공데이터와 AI를 활용한 서비스/분석 아이디어를 공모합니다.',
      category: 'CONTEST',
      status: 'ONGOING',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-07-30'),
      deadline: new Date('2026-06-26'),
      organizer: '문화체육관광부',
      field: ['IT/소프트웨어', '데이터', 'AI'],
      targetAudience: ['대학생', '일반인'],
      reward: '대상 1000만원',
      url: 'https://www.mcst.go.kr',
      source: 'wevity',
      sourceId: 'wevity_mcst_ai_2026',
    },
  ];

  for (const eventData of sampleEvents) {
    const event = await prisma.event.upsert({
      where: {
        source_sourceId: { source: eventData.source, sourceId: eventData.sourceId },
      },
      update: eventData,
      create: eventData,
    });
    console.log(`✅ 이벤트: ${event.title}`);
  }

  // 사용자-이벤트 연결 (데모)
  const events = await prisma.event.findMany({ take: 3 });
  for (const event of events) {
    await prisma.userEvent.upsert({
      where: {
        userId_eventId: { userId: user.id, eventId: event.id },
      },
      update: {},
      create: {
        userId: user.id,
        eventId: event.id,
        isSelected: true,
      },
    });
  }

  console.log('\n🎉 시드 데이터 삽입 완료!');
}

main()
  .catch((e) => {
    console.error('시드 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
