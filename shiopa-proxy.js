const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const { id, type = 'movie', season = '1', episode = '1' } = req.query;
  if (!id) return res.status(400).json({ error: 'id required?id=299536' });

  try {
    // 1. Homepage থেকে latest buildId বের করা
    const homeRes = await fetch('https://shiopa.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const homeHtml = await homeRes.text();
    const buildIdMatch = homeHtml.match(/"buildId":"([^"]+)"/);
    const buildId = buildIdMatch? buildIdMatch[1] : 'dcc50bbdd1f48c8c';

    // 2. Shiopa এর Next.js Data API
    const dataUrl = `https://shiopa.com/_next/data/${buildId}/watch/${type}/${id}${type === 'tv'? `/${season}/${episode}` : ''}.json`;

    const dataRes = await fetch(dataUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://shiopa.com/'
      }
    });

    if (!dataRes.ok) throw new Error('Shiopa data not found');

    const jsonStr = await dataRes.text();

    // 3. ভিতর থেকে /watch/t/ token টা বের করা
    const tokenMatch = jsonStr.match(/\/watch\/t\/[A-Za-z0-9_\-\/]+/);

    if (tokenMatch) {
      const finalUrl = 'https://shiopa.com' + tokenMatch[0].replace(/\\/g, '');
      return res.redirect(finalUrl);
    }

    // Fallback - token না পেলে
    return res.status(404).json({ error: 'token not found', dataUrl });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
