export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Geen zoekterm' });

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );

    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();

    if (!data.photos || data.photos.length === 0) {
      return res.status(404).json({ error: 'Geen foto gevonden' });
    }

    const foto = data.photos[0];
    return res.status(200).json({
      url: foto.src.large,
      urlSmall: foto.src.medium,
      fotograaf: foto.photographer,
      pexelsUrl: foto.url
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
