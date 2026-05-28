export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Geen zoekterm' });

  // Verwijder stijltermen en houd alleen ingrediënten/gerechtstype
  function maakZoekterm(term) {
    return term
      .replace(/dark moody food photography/gi, '')
      .replace(/food photography/gi, '')
      .replace(/moody/gi, '')
      .replace(/dark/gi, '')
      .replace(/plating/gi, '')
      .replace(/gourmet/gi, '')
      .replace(/restaurant/gi, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  // Voeg "homemade" toe voor huiselijkere resultaten
  function maakHuiselijkeTerm(term) {
    const schoon = maakZoekterm(term);
    return `homemade ${schoon} dinner`;
  }

  async function zoekPexels(zoekterm) {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(zoekterm)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();
    return data.photos || [];
  }

  // Kies de beste foto op basis van breedte/hoogte verhouding
  function kiesBesteFoto(fotos) {
    if (!fotos || fotos.length === 0) return null;
    // Prefereer landscape foto's met goede verhouding
    const gesorteerd = fotos
      .filter(f => f.src?.large || f.src?.large2x)
      .sort((a, b) => {
        const ratioA = a.width / a.height;
        const ratioB = b.width / b.height;
        // Ideale ratio tussen 1.3 en 1.8 (landscape maar niet te breed)
        const scoreA = Math.abs(ratioA - 1.5);
        const scoreB = Math.abs(ratioB - 1.5);
        return scoreA - scoreB;
      });
    return gesorteerd[0] || fotos[0];
  }

  try {
    let fotos = [];

    // Poging 1: huiselijke term
    const huiselijkeTerm = maakHuiselijkeTerm(q);
    fotos = await zoekPexels(huiselijkeTerm);

    // Poging 2: schone zoekterm zonder stijl
    if (fotos.length === 0) {
      const schoneTerm = maakZoekterm(q);
      fotos = await zoekPexels(schoneTerm);
    }

    // Poging 3: eerste 2 woorden van schone term
    if (fotos.length === 0) {
      const schoneTerm = maakZoekterm(q);
      const korteTerm = schoneTerm.split(' ').slice(0, 2).join(' ');
      fotos = await zoekPexels(korteTerm + ' food');
    }

    // Poging 4: eerste woord + food
    if (fotos.length === 0) {
      const eersteWoord = maakZoekterm(q).split(' ')[0];
      fotos = await zoekPexels(eersteWoord + ' dinner');
    }

    if (fotos.length === 0) {
      return res.status(404).json({ error: 'Geen foto gevonden' });
    }

    const foto = kiesBesteFoto(fotos);
    const url = foto.src?.large2x || foto.src?.large || foto.src?.medium;

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
