export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Geen zoekterm' });

  function schoonMaken(term) {
    let r = term
      .replace(/dark moody food photography|food photography|moody|dark|plating|gourmet|restaurant|homemade/gi, '')
      .trim().replace(/\s+/g, ' ');
    // Vervang vage termen door specifiekere voor betere Pexels resultaten
    r = r.replace(/\bwrap\b/gi, 'tortilla wrap');
    r = r.replace(/\bnoodles\b/gi, 'pasta');
    r = r.replace(/\bbowl\b/gi, 'dish');
    return r;
  }

  async function zoekPexels(zoekterm) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(zoekterm)}&per_page=10&orientation=landscape`;
    const response = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();
    return data.photos || [];
  }

  // Woorden die NIET in de foto mogen (alt-tekst check)
  const ONGEWENST = ['fries', 'french fries', 'chips', 'fastfood', 'fast food', 'burger', 'pizza', 'sushi', 'ramen', 'bibimbap', 'fried egg on top', 'egg on top', 'candle', 'wine', 'restaurant'];

  function scoreOrFotos(fotos, zoekterm) {
    if (!fotos || fotos.length === 0) return null;
    const zoekWoorden = zoekterm.toLowerCase().split(' ').filter(w => w.length > 2);

    return fotos
      .filter(f => f.src?.large || f.src?.large2x)
      .map(f => {
        const alt = (f.alt || '').toLowerCase();
        let score = 0;

        // Diskwalificeer fotos met ongewenste elementen
        if (ONGEWENST.some(o => alt.includes(o))) {
          score -= 10;
        }

        // Bonus voor goede ratio
        const ratio = f.width / f.height;
        if (ratio >= 1.2 && ratio <= 1.9) score += 2;

        // Bonus voor alt-tekst match
        zoekWoorden.forEach(w => { if (alt.includes(w)) score += 2; });

        return { foto: f, score };
      })
      .filter(item => item.score >= 0) // verwijder diskwalificeerde fotos
      .sort((a, b) => b.score - a.score)[0]?.foto || null;
  }

  try {
    const schoon = schoonMaken(q);
    const woorden = schoon.split(' ').filter(w => w.length > 1);
    let fotos = [];
    let resultaat = null;

    // Poging 1: eerste 2 woorden + "meal"
    const term1 = woorden.slice(0, 2).join(' ') + ' meal';
    fotos = await zoekPexels(term1);
    resultaat = scoreOrFotos(fotos, schoon);

    // Poging 2: alleen eerste woord + "dish"
    if (!resultaat && woorden.length > 0) {
      const term2 = woorden[0] + ' dish';
      fotos = await zoekPexels(term2);
      resultaat = scoreOrFotos(fotos, schoon);
    }

    // Poging 3: eerste woord + "food"
    if (!resultaat && woorden.length > 0) {
      const term3 = woorden[0] + ' food';
      fotos = await zoekPexels(term3);
      resultaat = scoreOrFotos(fotos, schoon);
    }

    if (!resultaat) {
      return res.status(404).json({ error: 'Geen passende foto gevonden' });
    }

    const url = resultaat.src?.large2x || resultaat.src?.large || resultaat.src?.medium;
    if (!url) return res.status(404).json({ error: 'Geen bruikbare url' });

    return res.status(200).json({
      url,
      urlSmall: resultaat.src?.medium || url,
      fotograaf: resultaat.photographer || '',
      pexelsUrl: resultaat.url || ''
    });

  } catch (err) {
    console.error('Pexels fout:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
