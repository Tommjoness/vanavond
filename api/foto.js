export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, backup } = req.query;
  if (!q) return res.status(400).json({ error: 'Geen zoekterm' });

  // Sfeerbwoorden die Pexels juist helpen — NIET verwijderen
  const SFEERWOORDEN = ['rustic', 'plated', 'bowl', 'food photography', 'flatlay', 'traybake', 'sizzling'];

  function schoonMaken(term) {
    return term
      .replace(/dark moody|moody|dark|gourmet|restaurant|homemade/gi, '')
      .replace(/\bnoodles\b/gi, 'pasta')
      .trim().replace(/\s+/g, ' ');
  }

  async function zoekPexels(zoekterm) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(zoekterm)}&per_page=10&orientation=landscape`;
    const response = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();
    return data.photos || [];
  }

  const ONGEWENST = ['fries', 'french fries', 'chips', 'fastfood', 'fast food', 'burger', 'pizza', 'sushi', 'bibimbap', 'fried egg on top', 'candle', 'wine'];

  function kiesBesteFoto(fotos, zoekterm) {
    if (!fotos || fotos.length === 0) return null;
    const woorden = zoekterm.toLowerCase().split(' ').filter(w => w.length > 2);

    const gescoord = fotos
      .filter(f => f.src?.large || f.src?.large2x)
      .map(f => {
        const alt = (f.alt || '').toLowerCase();
        let score = 0;

        if (ONGEWENST.some(o => alt.includes(o))) score -= 10;

        const ratio = f.width / f.height;
        if (ratio >= 1.2 && ratio <= 1.9) score += 2;

        woorden.forEach(w => { if (alt.includes(w)) score += 2; });

        return { foto: f, score };
      })
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score);

    return gescoord[0]?.foto || null;
  }

  function bouwUrl(foto) {
    if (!foto) return null;
    const url = foto.src?.large2x || foto.src?.large || foto.src?.medium;
    if (!url) return null;
    return {
      url,
      urlSmall: foto.src?.medium || url,
      fotograaf: foto.photographer || '',
      pexelsUrl: foto.url || ''
    };
  }

  try {
    const schoon = schoonMaken(q);
    const woorden = schoon.split(' ').filter(w => w.length > 1);
    let resultaat = null;

    // POGING 1: volledige primaire zoekterm (inclusief sfeerbwoord)
    const fotos1 = await zoekPexels(schoon);
    resultaat = kiesBesteFoto(fotos1, schoon);

    // POGING 2: eerste 2 woorden (zonder sfeerbwoord als dat het probleem is)
    if (!resultaat && woorden.length > 2) {
      const term2 = woorden.filter(w => !SFEERWOORDEN.some(s => s.includes(w))).slice(0, 2).join(' ');
      if (term2) {
        const fotos2 = await zoekPexels(term2);
        resultaat = kiesBesteFoto(fotos2, schoon);
      }
    }

    // POGING 3: AI-gegenereerde backup zoekterm (meegegeven als ?backup=...)
    if (!resultaat && backup) {
      const fotos3 = await zoekPexels(schoonMaken(backup));
      resultaat = kiesBesteFoto(fotos3, backup);
    }

    // POGING 4: eerste hoofdwoord + "food photography"
    if (!resultaat && woorden.length > 0) {
      const hoofdwoord = woorden.find(w => !SFEERWOORDEN.some(s => s.includes(w))) || woorden[0];
      const fotos4 = await zoekPexels(hoofdwoord + ' food photography');
      resultaat = kiesBesteFoto(fotos4, hoofdwoord);
    }

    // POGING 5: hardcoded ultieme fallback
    if (!resultaat) {
      const fotos5 = await zoekPexels('cooking');
      resultaat = kiesBesteFoto(fotos5, 'cooking');
    }

    if (!resultaat) {
      return res.status(404).json({ error: 'Geen passende foto gevonden' });
    }

    const uitvoer = bouwUrl(resultaat);
    if (!uitvoer) return res.status(404).json({ error: 'Geen bruikbare url' });

    return res.status(200).json(uitvoer);

  } catch (err) {
    console.error('Pexels fout:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
