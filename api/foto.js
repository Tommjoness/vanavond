export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Geen zoekterm' });

  async function zoekPexels(zoekterm) {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(zoekterm)}&per_page=3&orientation=landscape`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();
    return data.photos || [];
  }

  try {
    // Eerste poging: volledige zoekterm
    let fotos = await zoekPexels(q);

    // Tweede poging: kortere zoekterm (eerste 2 woorden)
    if (fotos.length === 0) {
      const korteTerm = q.split(' ').slice(0, 2).join(' ');
      fotos = await zoekPexels(korteTerm);
    }

    // Derde poging: enkel eerste woord
    if (fotos.length === 0) {
      const eersteTerm = q.split(' ')[0];
      fotos = await zoekPexels(eersteTerm + ' food');
    }

    if (fotos.length === 0) {
      return res.status(404).json({ error: 'Geen foto gevonden' });
    }

    const foto = fotos[0];
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
