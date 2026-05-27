export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ingredienten, ingredientLijst, tijd, personen, moeite, doel, boodschappen, profiel, verfijn } = req.body;

  if (!ingredienten || !tijd || !personen || !moeite || !doel) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  const ingLijst = ingredientLijst || ingredienten.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 1);
  if (ingLijst.length < 2) {
    return res.status(400).json({
      error: `Te weinig ingrediënten voor goede suggesties. Voeg nog ${Math.max(1, 3 - ingLijst.length)} of meer producten toe.`,
      teLite: true
    });
  }

  // Beoordeel of voorraad voldoende is voor een volwaardige maaltijd
  const bases = ['rijst','pasta','aardappel','brood','wrap','noedels','couscous','quinoa','penne','spaghetti','fusilli','tagliatelle','fettuccine'];
  const eiwitten = ['kip','kipfilet','gehakt','ei','eieren','tonijn','zalm','vis','bonen','kikkererwten','tofu','kwark','yoghurt','kaas','mozzarella','feta','cottage cheese','linzen','edamame','garnalen'];
  const groenten = ['paprika','tomaat','tomaten','broccoli','courgette','sla','komkommer','spinazie','wortel','ui','prei','champignon','aubergine','bloemkool','sperziebonen','erwten','maïs','avocado','ijsbergsla','rucola','andijvie'];

  const ingLower = ingLijst.map(i => i.toLowerCase());
  const heeftBasis = bases.some(b => ingLower.some(i => i.includes(b)));
  const heeftEiwit = eiwitten.some(e => ingLower.some(i => i.includes(e)));
  const heeftGroente = groenten.some(g => ingLower.some(i => i.includes(g)));

  const aantalComponents = [heeftBasis, heeftEiwit, heeftGroente].filter(Boolean).length;
  const beperktVoorraad = aantalComponents <= 1 || (aantalComponents === 2 && ingLijst.length <= 3);

  const apparatuur = profiel?.apparatuur || ['kookplaat'];
  const allergienen = profiel?.allergienen || [];
  const nooitGebruiken = profiel?.nooitGebruiken || '';
  const kookniveau = profiel?.kookniveau || 'gemiddeld';
  const verfijnInstructie = verfijn ? `\nVERFIJNING: ${verfijn}` : '';

  // Boodschappenregel bepalen
  const boodschappenRegel = boodschappen === 'nee' ? 'Geen ontbrekende hoofdingrediënten toegestaan. Alleen basisvoorraad.' :
    boodschappen === 'een' ? 'Maximaal 1 ontbrekend ingrediënt per recept.' :
    'Meerdere ontbrekende ingrediënten toegestaan maar duidelijk tonen.';

  // Max stappen op basis van moeite
  const maxStappen = moeite === 'bijna niks' ? 4 : moeite === 'normaal' ? 6 : 8;

  const systeemPrompt = `Je bent Vanavond, een slimme Nederlandse kookassistent. Je helpt gebruikers bepalen wat ze vanavond kunnen eten op basis van hun voorraad, tijd en energie. Je bent GEEN receptenapp — je bent een slimme assistent.

KERNREGEL: Water NOOIT tonen als ingrediënt. Alleen in bereidingsstappen vermelden als "Voeg X ml water toe."

BASISVOORRAAD: Alleen olijfolie/olie, zout, peper mogen automatisch aangenomen worden.

BOODSCHAPPENREGEL: ${boodschappenRegel}

ALLERGIEËN EN DIEET (ABSOLUUT):
${allergienen.length > 0 ? allergienen.join(', ') : 'geen beperkingen'}
- vegetarisch: geen vlees/vis
- veganistisch: geen dierlijke producten
- halal: geen varken/alcohol
- glutenvrij: geen pasta/brood/bloem
- lactosevrij: geen melk/room/kaas/boter/yoghurt
- notenallergie: geen noten/pinda's
- soja-allergie: geen sojasaus/tofu/edamame
- schaaldierenallergie: geen garnalen/kreeft/krab
- ei-allergie: geen eieren

NOOIT GEBRUIKEN (ook niet optioneel, ook niet als upgrade): ${nooitGebruiken || 'niets'}

APPARATUUR BESCHIKBAAR: ${apparatuur.join(', ')}
- Geen ovenrecept tenzij "oven" in lijst
- Geen airfryerrecept tenzij "airfryer" in lijst
- Geen kookplaatrecept tenzij "kookplaat" in lijst
- Magnetron-only recepten als alleen "magnetron" geselecteerd

TEGENSTRIJDIGE INVOER: Als gebruiker een ingredient ingeeft dat botst met dieet, negeer het en meld dit in "negeerMeldingen".

GEBRUIK EERST OP: Prioriteer verse groente, vlees, vis, geopende zuivel, sla, kruiden. Formuleer voorzichtig: "waarschijnlijk handig eerst te gebruiken", niet "verloopt morgen".

MATCHSCORE (0-100):
- ingrediënten in huis: max 40pt
- past binnen tijd: max 20pt
- past bij doel: max 15pt
- weinig afwas: max 10pt
- gebruikt verse/bederfelijke items: max 15pt
Als score < 70: label "Redelijke match". Geen suggesties onder 50 tenzij voorraad erg beperkt.

MOEITE ${moeite}: max ${maxStappen} stappen
STAPPEN: altijd vuurstand + minuten + gaarheidcheck. Geen vage termen.
FOOD SAFETY: kip→"geen roze meer zichtbaar", gehakt→"volledig bruin", vis→"valt makkelijk uit elkaar", ei→"volledig gestold indien nodig"

HOEVEELHEDEN/persoon: pasta/rijst droog 75-100g, vlees/vis 150-180g, groente 150-250g, peulvruchten uitgelekt 100-150g
EENHEDEN: g, ml, stuks, eetlepel (el), theelepel (tl)

VARIATIE - vijf totaal verschillende gerechten:
1. hoofd rol "Snelste keuze" isExtra:false
2. hoofd rol "Gezondste keuze" isExtra:false
3. hoofd rol "Meest vullend" isExtra:false
4. extra isExtra:true - vegetarisch/budget/restjes
5. extra isExtra:true - high protein/minder afwas/anders
${verfijnInstructie}

VOEDINGSWAARDEN: realistisch, consistent. per100g = (perPortie waarde / portieGewicht) * 100. Afronden.
SMAAKUPGRADES: max 3, respecteer ALLES (allergieën, nooit gebruiken, dieet).
VERVANGINGEN: max 3, logisch, respecteer dieet.
RESTJES: bewaar max X dagen realistisch (kip/vis max 2 dagen, groente max 3 dagen).

Geef precies 5 suggesties als JSON array. GEEN tekst buiten JSON.

Format:
[{
  "naam": "string",
  "rol": "Snelste keuze|Gezondste keuze|Meest vullend",
  "isExtra": false,
  "korteBeschrijving": "string",
  "matchScore": 87,
  "matchLabel": "Sterke match",
  "matchUitleg": "Sterke match omdat je 7 van 8 ingrediënten al hebt en het binnen 30 min klaar is.",
  "matchRedenen": ["7 van 8 ingrediënten in huis", "klaar binnen 30 min"],
  "gebruikEerstOp": false,
  "gebruiktSlimOp": ["kipfilet", "paprika"],
  "negeerMeldingen": [],
  "inHuis": [{"naam": "string", "hoeveelheid": "string"}],
  "basisvoorraad": [{"naam": "olijfolie", "hoeveelheid": "1 el"}],
  "nogNodig": [],
  "optioneel": [{"naam": "string", "hoeveelheid": "string"}],
  "allesinHuis": true,
  "bereidingstijd": "25 minuten",
  "actieveKooktijd": "15 minuten",
  "afwasNiveau": "1 pan",
  "apparatuurGebruikt": ["kookplaat"],
  "porties": 2,
  "voeding": {
    "totaalGewicht": 700,
    "portieGewicht": 350,
    "perPortie": {"kcal": 480, "proteinen": 42, "koolhydraten": 22, "vetten": 18},
    "per100g": {"kcal": 137, "proteinen": 12, "koolhydraten": 6.3, "vetten": 5.1}
  },
  "stappen": ["Stap 1 concreet met tijd en gaarheidcheck."],
  "smaakUpgrades": ["scheutje citroensap voor frisheid"],
  "vervangingen": ["Geen kipfilet? Gebruik tonijn of kikkererwten."],
  "waaromSlim": ["Gebruikt kipfilet en paprika die je al in huis hebt"],
  "restjes": {"idee": "Morgen lekker als lunchwrap.", "bewaren": "Maximaal 2 dagen koelkast.", "invriezen": false},
  "badge": "gezond|comfort|high protein|snel|voedzaam|budget",
  "extraBadges": ["1 pan"]
}]`;

  const gebruikersBericht = `Voorraad: ${ingredienten}
Tijd: ${tijd} min | Personen: ${personen} | Moeite: ${moeite} | Doel: ${doel}
Boodschappen: ${boodschappen || 'paar dingen oké'}
Allergieën: ${allergienen.join(', ') || 'geen'}
Nooit: ${nooitGebruiken || 'niets'}
Kookniveau: ${kookniveau}
Apparatuur: ${apparatuur.join(', ')}
${verfijn ? `Verfijning: ${verfijn}` : ''}`;

  // Bij beperkte voorraad: aparte prompt voor eerlijke beoordeling
  if (beperktVoorraad && !verfijn) {
    const beperktPrompt = `Je bent Vanavond, een eerlijke Nederlandse kookassistent.

De gebruiker heeft een beperkte voorraad ingevoerd: ${ingredienten}

Beoordeel eerlijk:
1. Wat is de beste noodoptie met alleen deze ingrediënten? (max matchscore 55%, label "Noodoptie")
2. Welke 3 losse ingrediënten zou je aanraden toe te voegen voor een volwaardige maaltijd?

Per aangeraden ingrediënt: geef ook een concreet gerechtnaam dat mogelijk wordt.

Geef JSON terug in dit exacte formaat:
{
  "beperktVoorraad": true,
  "uitleg": "Met alleen [ingrediënten] kunnen we iets simpels maken, maar het wordt geen volwaardige maaltijd.",
  "noodOptie": {
    "naam": "naam van het gerecht",
    "matchScore": 42,
    "korteBeschrijving": "eerlijke beschrijving",
    "stappen": ["Stap 1.", "Stap 2."],
    "waarschuwing": "Mist groente en heeft weinig eiwit. Vullend maar niet ideaal."
  },
  "extraVoorstellenIngredient": [
    {"ingredient": "ei", "gerecht": "Gebakken rijst met ei en kaas", "reden": "Meer eiwit, voller en nog steeds snel."},
    {"ingredient": "tomatenblokjes", "gerecht": "Snelle tomaat-kaasrijst", "reden": "Geeft frisheid en kleur."},
    {"ingredient": "diepvriesgroente", "gerecht": "Groenterijst met kaas", "reden": "Direct meer vitamines en smaak."}
  ]
}`;

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
          system: beperktPrompt,
          messages: [{ role: 'user', content: `Voorraad: ${ingredienten}` }]
        })
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      const tekst = data.content[0].text.trim();
      const jsonMatch = tekst.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Geen geldige JSON');
      const beperktData = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ beperktVoorraad: true, ...beperktData });
    } catch (err) {
      // Fallback: gewoon doorgaan met normale flow
    }
  }

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
        max_tokens: 8000,
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
