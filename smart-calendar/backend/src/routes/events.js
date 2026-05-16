const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// 전체 이벤트 조회 (필터링 지원)
router.get('/', async (req, res) => {
  try {
    const { category, status, field, search, startDate, endDate, page = 1, limit = 20 } = req.query;

    const where = {};

    if (category) where.category = category;
    if (status) where.status = status;
    if (field) where.field = { has: field };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { organizer: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) where.startDate.gte = new Date(startDate);
      if (endDate) where.startDate.lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { deadline: 'asc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.event.count({ where }),
    ]);

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('이벤트 조회 실패:', error);
    res.status(500).json({ error: '이벤트 조회에 실패했습니다.' });
  }
});

// 이벤트 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      // guidelines는 AI 담당 팀원이 채우는 테이블이므로 포함만 해서 반환
      include: { guidelines: true },
    });

    if (!event) {
      return res.status(404).json({ error: '이벤트를 찾을 수 없습니다.' });
    }

    res.json(event);
  } catch (error) {
    console.error('이벤트 상세 조회 실패:', error);
    res.status(500).json({ error: '이벤트 조회에 실패했습니다.' });
  }
});

// 캘린더용 이벤트 조회 (월별)
router.get('/calendar/monthly', async (req, res) => {
  try {
    const { year, month } = req.query;
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const events = await prisma.event.findMany({
      where: {
        OR: [
          { startDate: { gte: startOfMonth, lte: endOfMonth } },
          { endDate: { gte: startOfMonth, lte: endOfMonth } },
          { deadline: { gte: startOfMonth, lte: endOfMonth } },
        ],
      },
      orderBy: { startDate: 'asc' },
    });

    res.json(events);
  } catch (error) {
    console.error('캘린더 이벤트 조회 실패:', error);
    res.status(500).json({ error: '캘린더 이벤트 조회에 실패했습니다.' });
  }
});

// 수동 크롤링 트리거
router.post('/crawl', async (req, res) => {
  try {
    const crawlerService = require('../services/crawler');
    await crawlerService.crawlAll();
    res.json({ message: '크롤링이 완료되었습니다.' });
  } catch (error) {
    console.error('크롤링 실패:', error);
    res.status(500).json({ error: '크롤링에 실패했습니다.' });
  }
});

module.exports = router;
