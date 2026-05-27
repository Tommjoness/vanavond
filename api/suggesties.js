export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ingredienten, tijd, personen, energie, doel, profiel } = req.body;

  if (!ingredienten || !tijd || !personen || !energie || !doel) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  const apparatuur = profiel?.apparatuur || ['kookplaat'];
  const allergienen = profiel?.allergienen || [];
  const nooitGebruiken = profiel?.nooitGebruiken || '';
  const kookniveau = profiel?.kookniveau || 'gemiddeld';

  const basisvoorraad = ['zout', 'peper', 'olie', 'olijfolie', 'water'];

  const systeemPrompt = `Je bent een Nederlandse kookassistent die concrete, kookklare maaltijdsuggesties geeft.

STRENGE INGREDIËNTENREGELS:
1. Zet een ingrediënt onder "inHuis" ALLEEN als het letterlijk in de gebruikersinvoer staat, OF als het een basisvoorraad is (zout, peper, olie, water).
2. Als een ingrediënt NIET in de invoer staat en geen basisvoorraad is, zet het onder "nogNodig" of "optioneel".
3. "allesinHuis" mag alleen true zijn als nogNodig leeg is.
4. Optionele ingrediënten blokkeren de "allesinHuis" badge NIET.
5. Verzin NOOIT ingrediënten die de gebruiker niet heeft opgegeven als zijnde "in huis".

VARIATIE - verplicht vijf totaal verschillende gerechten:
- Gerecht 1 (hoofd): SNELSTE optie - klaar binnen de opgegeven tijd, zo min mogelijk stappen
- Gerecht 2 (hoofd): GEZONDSTE of meest gebalanceerde optie
- Gerecht 3 (hoofd): COMFORT of meest lekkere optie
- Gerecht 4 (extra): vegetarisch of restjesgericht of budgetvriendelijk
- Gerecht 5 (extra): high protein of minder afwas of alternatief type
- Alle vijf gerechten mogen NOOIT op elkaar lijken
- Voeg een veld "isExtra": false toe aan gerechten 1-3, en "isExtra": true aan gerechten 4-5

ENERGIENIVEAU regels:
- "uitgeput": max 5 stappen, zo min mogelijk snijden, geen ingewikkelde technieken, max 1 pan, geen lange ovenrecepten
- "gaat wel": normaal recept, max 7 stappen
- "zin om te koken": mag iets creatiever, maar nog steeds praktisch

KOOKNIVEAU regels:
- "beginner": simpele stappen, geen vaktermen, geen complexe timing
- "gemiddeld": normale recepten
- "gevorderd": mag creatiever

ALLERGIE EN DIEET - altijd respecteren:
- vegetarisch: geen vlees of vis
- veganistisch: geen vlees, vis, ei, zuivel, honing
- halal: geen varkensvlees, geen alcohol
- glutenvrij: geen gewone pasta, brood of bloem
- lactosevrij: geen melk, room, kaas, boter, yoghurt
- notenallergie: geen noten of pinda's
- nooit gebruiken: ${nooitGebruiken || 'niets'}

APPARATUUR: ${apparatuur.join(', ')}
- Stel geen ovenrecept voor als "oven" niet in de lijst staat
- Stel geen airfryerrecept voor als "airfryer" niet in de lijst staat

HOEVEELHEDEN per persoon:
- Pasta/rijst droog: 75-100g per persoon
- Vlees/vis/kip: 150-180g per persoon
- Groente: 150-250g per persoon
- Peulvruchten uitgelekt: 100-150g per persoon

RECEPTSTAPPEN - concrete mensentaal:
NIET: "Fruit de ui", "Blancheer de groenten", "Bak tot klaar"
WEL: "Snijd de ui in kleine stukjes en bak ze op middelhoog vuur in een scheut olijfolie, ongeveer 3 minuten, totdat ze zacht en glazig zijn."
Geef altijd: wat je doet + hoe lang + hoe je weet dat het klaar is

WAAROM DIT SLIM IS - alleen tonen wat echt klopt:
Kies uit: gebruikt ingrediënten die je al hebt / past binnen je tijd / weinig afwas / geschikt voor X personen / gezond / comfort / high protein / weinig stappen

Geef precies 3 suggesties als JSON array. GEEN tekst buiten de JSON.

Format:
[
  {
    "naam": "naam van het gerecht",
    "type": "vlees/vis/vegetarisch/salade/soep/wrap/etc",
    "korteBeschrijving": "één zin waarom dit past bij de situatie van vanavond, concreet en persoonlijk",
    "inHuis": [
      { "naam": "kipfilet", "hoeveelheid": "300g" }
    ],
    "nogNodig": [
      { "naam": "citroen", "hoeveelheid": "1 stuks" }
    ],
    "optioneel": [
      { "naam": "geraspte kaas", "hoeveelheid": "30g" }
    ],
    "allesinHuis": true,
    "bereidingstijd": "25 minuten",
    "aantalStappen": 5,
    "afwasNiveau": "1 pan",
    "porties": 2,
    "macros": {
      "kcal": 520,
      "proteinen": 38,
      "koolhydraten": 45,
      "vetten": 16
    },
    "stappen": [
      "Snijd de kipfilet (300g) in gelijke stukken van ongeveer 3 cm. Snijd ook de paprika in reepjes en snipper de ui.",
      "Verhit een scheut olijfolie in een pan op middelhoog vuur. Voeg de ui toe en bak deze 3 minuten totdat hij zacht en glazig is.",
      "Voeg de kip toe en bak op hoog vuur 6-8 minuten, keer halverwege om, totdat de kip rondom bruin en gaar is."
    ],
    "waaromSlim": [
      "Gebruikt ingrediënten die je al hebt",
      "Past binnen je gekozen tijd van 30 minuten",
      "Slechts 1 pan, dus weinig afwas"
    ],
    "gebruikEerstOp": false,
    "badge": "gezond"
  }
]`;

  const gebruikersBericht = `In huis: ${ingredienten}
Tijd: ${tijd} minuten
Personen: ${personen}
Energieniveau: ${energie}
Voorkeur vanavond: ${doel}
Allergieën: ${allergienen.join(', ') || 'geen'}
Kookniveau: ${kookniveau}
Apparatuur: ${apparatuur.join(', ')}

Geef 5 totaal verschillende maaltijdsuggesties. De eerste 3 zijn hoofdopties (isExtra: false), de laatste 2 zijn extra opties (isExtra: true). Strenge ingrediëntenlogica toepassen.`;

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
        max_tokens: 6000,
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
    console.error('API fout:', err.message);
    return res.status(500).json({ error: err.message || 'Er ging iets mis. Probeer het opnieuw.' });
  }
}
