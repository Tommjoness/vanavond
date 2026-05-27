export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ingredienten, tijd, personen, energie, doel, profiel, verfijn } = req.body;

  if (!ingredienten || !tijd || !personen || !energie || !doel) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  // Minimale ingrediëntencheck
  const ingredientLijst = ingredienten.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 1);
  if (ingredientLijst.length < 3) {
    return res.status(400).json({
      error: `Te weinig ingrediënten voor 3 goede suggesties. Voeg nog ${3 - ingredientLijst.length + 1} of meer producten toe, of kies een recept met boodschappen.`,
      teLite: true
    });
  }

  const apparatuur = profiel?.apparatuur || ['kookplaat'];
  const allergienen = profiel?.allergienen || [];
  const nooitGebruiken = profiel?.nooitGebruiken || '';
  const kookniveau = profiel?.kookniveau || 'gemiddeld';
  const verfijnInstructie = verfijn ? `\nVERFIJNING GEVRAAGD: ${verfijn}. Pas alle recepten hierop aan.` : '';

  const systeemPrompt = `Je bent een Nederlandse kookassistent die concrete, kookklare maaltijdsuggesties geeft.

WATERREGEL - ABSOLUUT:
- Water is NOOIT een ingrediënt onder inHuis, basisvoorraad, nogNodig of optioneel.
- Als water nodig is, vermeld het ALLEEN in de bereidingsstap: "Voeg 300 ml water toe."

INGREDIËNTENCATEGORIEËN:
1. "inHuis": alleen ingrediënten die letterlijk in de gebruikersinvoer staan
2. "basisvoorraad": ALLEEN olijfolie/olie, zout, peper
3. "nogNodig": ingrediënten die niet in de invoer staan en geen basisvoorraad zijn (GEEN water)
4. "optioneel": leuke toevoegingen die niet noodzakelijk zijn
- "allesinHuis" is true als nogNodig leeg is

FOOD SAFETY - altijd toepassen waar relevant:
- Kip: voeg toe aan bereiding: "Controleer of de kip volledig gaar is: snijd het dikste stuk open — het mag vanbinnen niet meer roze zijn."
- Gehakt: voeg toe: "Bak het gehakt volledig bruin en gaar, er mag geen roze meer zichtbaar zijn."
- Vis: voeg toe: "De vis is gaar als hij makkelijk uit elkaar valt als je er met een vork in prikt."

VARIATIE - verplicht vijf totaal verschillende gerechten:
- Gerecht 1 (hoofd, rol: "Snelste keuze"): klaar binnen de opgegeven tijd, zo min mogelijk stappen
- Gerecht 2 (hoofd, rol: "Gezondste keuze"): meest gebalanceerd, veel groente/eiwitten
- Gerecht 3 (hoofd, rol: "Meest vullend"): comfort of meest bevredigend
- Gerecht 4 (extra): vegetarisch/restjesgericht/budgetvriendelijk alternatief
- Gerecht 5 (extra): high protein/minder afwas/ander type
- "isExtra": false voor 1-3, "isExtra": true voor 4-5
${verfijnInstructie}

APPARATUUR - strikt:
- Geen ovenrecept als "oven" niet in apparatuur staat
- "afwasNiveau" moet EXACT kloppen:
  * 1 pan: "1 pan"
  * Pasta + saus apart: "2 pannen"
  * Oven: "Oven + bakplaat"
  * Salade: "0 pannen"
  * Airfryer: "Airfryer + 1 kom"

ALLERGIE EN DIEET:
- vegetarisch: geen vlees of vis
- veganistisch: geen vlees, vis, ei, zuivel, honing
- halal: geen varkensvlees, geen alcohol
- glutenvrij: geen gewone pasta, brood of bloem
- lactosevrij: geen melk, room, kaas, boter, yoghurt
- notenallergie: geen noten of pinda's
- nooit gebruiken: ${nooitGebruiken || 'niets'}

ENERGIENIVEAU:
- "uitgeput": max 5 stappen, max 1 pan, geen complexe technieken
- "gaat wel": normaal recept, max 7 stappen
- "zin om te koken": mag creatiever

HOEVEELHEDEN per persoon:
- Pasta/rijst droog: 75-100g — Vlees/vis: 150-180g — Groente: 150-250g — Peulvruchten: 100-150g

STAPPEN - concrete mensentaal, geen vakjargon:
WEL: "Bak de ui 3 minuten op middelhoog vuur totdat hij zacht en glazig is."

VOEDINGSWAARDEN: bereken realistisch totaalgewicht en portiegewicht, geef macro's per portie EN per 100g.

SMAAKUPGRADES - max 3, respecteer allergieën.
VERVANGINGEN - alleen als nuttig, 1-2 per recept.
WAAROM DIT SLIM IS - persoonlijk en specifiek, nooit generiek.

Apparatuur: ${apparatuur.join(', ')}
Allergieën: ${allergienen.join(', ') || 'geen'}
Kookniveau: ${kookniveau}

Geef precies 5 suggesties als JSON array. GEEN tekst buiten de JSON.

Format:
{
  "naam": "string",
  "rol": "Snelste keuze|Gezondste keuze|Meest vullend",
  "type": "string",
  "isExtra": false,
  "korteBeschrijving": "string",
  "inHuis": [{"naam": "string", "hoeveelheid": "string"}],
  "basisvoorraad": [{"naam": "string", "hoeveelheid": "string"}],
  "nogNodig": [],
  "optioneel": [{"naam": "string", "hoeveelheid": "string"}],
  "allesinHuis": true,
  "bereidingstijd": "string",
  "afwasNiveau": "string",
  "porties": 2,
  "voeding": {
    "totaalGewicht": 700,
    "portieGewicht": 350,
    "perPortie": {"kcal": 480, "proteinen": 42, "koolhydraten": 22, "vetten": 18},
    "per100g": {"kcal": 137, "proteinen": 12, "koolhydraten": 6.3, "vetten": 5.1}
  },
  "stappen": ["string"],
  "smaakUpgrades": ["string"],
  "vervangingen": ["string"],
  "waaromSlim": ["string"],
  "gebruikEerstOp": false,
  "badge": "gezond|comfort|high protein|snel|voedzaam",
  "extraBadges": ["1 pan", "Geen oven nodig", "Minste afwas", "Goedkoopste keuze", "Beste restjes voor morgen"],
  "restjes": {
    "idee": "Maak er morgen een wrap van.",
    "bewaren": "Maximaal 2 dagen afgedekt in de koelkast.",
    "invriezen": true
  }
}`;

  const gebruikersBericht = `In huis: ${ingredienten}
Tijd: ${tijd} minuten
Personen: ${personen}
Energieniveau: ${energie}
Voorkeur: ${doel}
Allergieën: ${allergienen.join(', ') || 'geen'}
Kookniveau: ${kookniveau}
Apparatuur: ${apparatuur.join(', ')}
${verfijn ? `Verfijning: ${verfijn}` : ''}

Geef 5 totaal verschillende suggesties. Water NOOIT als ingrediënt.`;

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
    return res.status(500).json({ error: err.message || 'Er ging iets mis.' });
  }
}
