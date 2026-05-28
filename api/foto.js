export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Geen zoekterm' });

  function schoonMaken(term) {
    return term
      .replace(/dark moody food photography/gi, '')
      .replace(/food photography/gi, '')
      .replace(/moody|dark|plating|gourmet|restaurant|homemade/gi, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  async function zoekPexels(zoekterm) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(zoekterm)}&per_page=8&orientation=landscape`;
    const response = await fetch(url, {
      headers: { Authorization: process.env.PEXELS_API_KEY }
    });
    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();
    return data.photos || [];
  }

  // Kies beste foto: goede ratio, geen verdachte tags
  function kiesBesteFoto(fotos, zoekterm) {
    if (!fotos || fotos.length === 0) return null;

    // Filter fotos op basis van alt-tekst als die beschikbaar is
    const zoekWoorden = zoekterm.toLowerCase().split(' ');

    const gescoord = fotos
      .filter(f => f.src?.large || f.src?.large2x)
      .map(f => {
        let score = 0;
        // Goede landscape ratio
        const ratio = f.width / f.height;
        if (ratio >= 1.3 && ratio <= 1.8) score += 2;

        // Alt tekst match (als beschikbaar)
        const alt = (f.alt || '').toLowerCase();
        zoekWoorden.forEach(woord => {
          if (alt.includes(woord)) score += 1;
        });

        return { foto: f, score };
      })
      .sort((a, b) => b.score - a.score);

    return gescoord[0]?.foto || fotos[0];
  }

  try {
    const schoon = schoonMaken(q);
    const woorden = schoon.split(' ').filter(w => w.length > 1);
    let fotos = [];

    // Poging 1: eerste 2-3 woorden + "dinner plate"
    const term1 = woorden.slice(0, 3).join(' ') + ' dinner';
    fotos = await zoekPexels(term1);

    // Poging 2: eerste 2 woorden alleen
    if (fotos.length < 2) {
      const term2 = woorden.slice(0, 2).join(' ');
      const extra = await zoekPexels(term2);
      fotos = [...fotos, ...extra];
    }

    // Poging 3: eerste woord + "food"
    if (fotos.length === 0) {
      const term3 = woorden[0] + ' food';
      fotos = await zoekPexels(term3);
    }

    if (fotos.length === 0) {
      return res.status(404).json({ error: 'Geen foto gevonden' });
    }

    const foto = kiesBesteFoto(fotos, schoon);
    const url = foto?.src?.large2x || foto?.src?.large || foto?.src?.medium;

    if (!url) {
      return res.status(404).json({ error: 'Geen bruikbare url' });
    }

    return res.status(200).json({
      url,
      urlSmall: foto.src?.medium || url,
      fotograaf: foto.photographer || '',
      pexelsUrl: foto.url || ''
    });

  } catch (err) {
    console.error('Pexels fout:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
