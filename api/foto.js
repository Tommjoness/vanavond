export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Geen zoekterm' });

  // Maak zoekterm schoon en specifieker
  function maakZoekterm(term) {
    return term
      .replace(/dark moody food photography/gi, '')
      .replace(/food photography/gi, '')
      .replace(/moody|dark|plating|gourmet|restaurant/gi, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  // Voeg "meal" toe voor betere food-match, vermijd generieke stockfotos
  function maakSpecifiekeTerm(term) {
    const schoon = maakZoekterm(term);
    // Voeg "homemade" toe voor huiselijkere resultaten
    return `homemade ${schoon}`;
  }

  async function zoekPexels(zoekterm) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(zoekterm)}&per_page=5&orientation=landscape`;
    const response = await fetch(url, {
      headers: { Authorization: process.env.PEXELS_API_KEY }
    });
    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();
    return data.photos || [];
  }

  // Kies beste foto op basis van landscape ratio
  function kiesBesteFoto(fotos) {
    if (!fotos || fotos.length === 0) return null;
    return fotos
      .filter(f => f.src?.large || f.src?.large2x)
      .sort((a, b) => Math.abs(a.width / a.height - 1.5) - Math.abs(b.width / b.height - 1.5))[0] || fotos[0];
  }

  // Haal sleutelwoorden op uit zoekterm (eerste 2 woorden na cleanup)
  function sleutelwoorden(term) {
    return maakZoekterm(term).split(' ').slice(0, 2).join(' ');
  }

  try {
    let fotos = [];

    // Poging 1: homemade + volledige term
    fotos = await zoekPexels(maakSpecifiekeTerm(q));

    // Poging 2: alleen kernwoorden + "dinner"
    if (fotos.length === 0) {
      fotos = await zoekPexels(sleutelwoorden(q) + ' dinner');
    }

    // Poging 3: eerste woord + "food"
    if (fotos.length === 0) {
      const eersteWoord = maakZoekterm(q).split(' ')[0];
      fotos = await zoekPexels(eersteWoord + ' food bowl');
    }

    if (fotos.length === 0) {
      return res.status(404).json({ error: 'Geen foto gevonden' });
    }

    const foto = kiesBesteFoto(fotos);
    const url = foto?.src?.large2x || foto?.src?.large || foto?.src?.medium;

    if (!url) {
      return res.status(404).json({ error: 'Geen bruikbare foto-url' });
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
