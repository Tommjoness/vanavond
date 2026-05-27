export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ingredienten, tijd, personen, energie, doel, profiel } = req.body;

  if (!ingredienten || !tijd || !personen || !energie || !doel) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  const apparatuur = profiel?.apparatuur || [];
  const allergienen = profiel?.allergienen || [];
  const nooitGebruiken = profiel?.nooitGebruiken || '';
  const kookniveau = profiel?.kookniveau || 'gemiddeld';

  const systeemPrompt = `Je bent een Nederlandse kookassistent die maaltijdsuggesties geeft op basis van wat iemand in huis heeft.

HARDE REGELS — nooit overtreden:
1. Gebruik ALLEEN ingrediënten die de gebruiker heeft opgegeven als "in huis". Verzin nooit ingrediënten.
2. Maak ALTIJD duidelijk onderscheid tussen "in huis" en "nog nodig".
3. Respecteer allergieën en dieetwensen ALTIJD — geen uitzonderingen.
4. Stel geen ovenrecept voor als de gebruiker geen oven heeft.
5. Bij energieniveau "uitgeput": max 20 minuten, max 1 pan, max 5 ingrediënten.
6. Geen alcohol in recepten tenzij expliciet toegestaan.
7. Geen ingewikkelde technieken bij kookniveau "beginner".
8. Prioriteer ingrediënten die "bijna op" zijn.

Beschikbare apparatuur: ${apparatuur.length > 0 ? apparatuur.join(', ') : 'alleen pitten'}
Allergieën/dieet: ${allergienen.length > 0 ? allergienen.join(', ') : 'geen'}
Nooit gebruiken: ${nooitGebruiken || 'niets'}
Kookniveau: ${kookniveau}

Geef precies 3 maaltijdsuggesties terug als JSON array. Geen tekst buiten de JSON.

Format per suggestie:
{
  "naam": "naam van het gerecht",
  "waarom": "één zin waarom dit past bij de situatie van vanavond",
  "inHuis": ["ingrediënt 1", "ingrediënt 2"],
  "nogNodig": ["ingrediënt 1"] of [],
  "bereidingstijd": "20 minuten",
  "afwas": "1 pan",
  "stappen": ["Stap 1", "Stap 2", "Stap 3"],
  "gebruikEerstOp": true of false
}`;

  const gebruikersBericht = `In huis: ${ingredienten}
Tijd: ${tijd} minuten
Personen: ${personen}
Energieniveau: ${energie}
Voorkeur vanavond: ${doel}

Geef 3 passende maaltijdsuggesties als JSON array.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: systeemPrompt,
        messages: [{ role: 'user', content: gebruikersBericht }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`API error: ${response.status} - ${errBody}`);
    }

    const data = await response.json();
    const tekst = data.content[0].text.trim();

    const jsonMatch = tekst.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Geen geldige JSON ontvangen');

    const suggesties = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ suggesties });

  } catch (err) {
    console.error('API fout:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Probeer het opnieuw.' });
  }
}
