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
  const eiwitten = ['kip','kipfilet','gehakt','ei','eieren','tonijn','zalm','vis','bonen','kikkererwten','tofu','kwark','yoghurt','kaas','mozzarella','feta','linzen','edamame','garnalen'];
  const groenten = ['paprika','tomaat','tomaten','broccoli','courgette','sla','komkommer','spinazie','wortel','ui','prei','champignon','aubergine','bloemkool','sperziebonen','erwten','maïs','ijsbergsla','rucola','andijvie'];
  const bederfelijk = ['kip','kipfilet','gehakt','zalm','vis','tonijn vers','sla','ijsbergsla','rucola','andijvie','spinazie','broccoli','courgette','paprika','tomaat','champignon','garnalen','zuivel','melk','yoghurt','kwark','slagroom','room'];

  const ingLower = ingLijst.map(i => i.toLowerCase());
  const heeftBasis = bases.some(b => ingLower.some(i => i.includes(b)));
  const heeftEiwit = eiwitten.some(e => ingLower.some(i => i.includes(e)));
  const heeftGroente = groenten.some(g => ingLower.some(i => i.includes(g)));
  const heeftBederfelijk = bederfelijk.some(b => ingLower.some(i => i.includes(b)));

  const aantalComponents = [heeftBasis, heeftEiwit, heeftGroente].filter(Boolean).length;
  const beperktVoorraad = aantalComponents <= 1 || (aantalComponents === 2 && ingLijst.length <= 3);

  const apparatuur = profiel?.apparatuur || ['kookplaat'];
  const allergienen = profiel?.allergienen || [];
  const nooitGebruiken = profiel?.nooitGebruiken || '';
  const kookniveau = profiel?.kookniveau || 'gemiddeld';
  const verfijnInstructie = verfijn ? `\nVERFIJNING: ${verfijn}` : '';
  const wilMindaAfwas = verfijn && verfijn.toLowerCase().includes('afwas');

  const boodschappenRegel = boodschappen === 'nee' ? 'Geen ontbrekende hoofdingrediënten toegestaan. Alleen basisvoorraad.' :
    boodschappen === 'een' ? 'Maximaal 1 ontbrekend ingrediënt per recept.' :
    'Meerdere ontbrekende ingrediënten toegestaan maar duidelijk tonen.';

  const maxStappen = moeite === 'bijna niks' ? 4 : moeite === 'normaal' ? 6 : 8;

  const systeemPrompt = `Je bent Vanavond, een betrouwbare Nederlandse kookassistent. Je doel: eerlijke, consistente maaltijdideeën geven die precies passen bij de situatie.

WATERREGEL: Water nooit als ingrediënt. Alleen in bereidingsstappen: "Voeg X ml water toe."
BASISVOORRAAD: Alleen olijfolie/olie, zout, peper mogen worden aangenomen.
BOODSCHAPPENREGEL: ${boodschappenRegel}

ALLERGIEËN (ABSOLUUT, ook niet optioneel of als upgrade):
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
NOOIT GEBRUIKEN: ${nooitGebruiken || 'niets'}

APPARATUUR: ${apparatuur.join(', ')}
STRIKTE REGEL: Stel geen recept voor dat apparatuur gebruikt die niet in de lijst staat.
- Geen oven tenzij "oven" in lijst
- Geen airfryer tenzij "airfryer" in lijst
- Geen kookplaat tenzij "kookplaat" in lijst

AFWASNIVEAU — KRITIEK. Tel exact en wees eerlijk. Het veld "afwasNiveau" MOET kloppen met de stappen.
Telregels (cumulatief):
- Rijst/pasta/noedels/aardappels apart koken = 1 pan
- Vlees/kip/vis apart bakken = +1 pan
- Groente apart koken of bakken = +1 pan
- Saus apart maken = +1 pan
- Alles tegelijk in 1 pan = 1 pan (eenpansgerecht)
- Oven = "Oven + bakplaat" of "Oven + ovenschaal"
- Airfryer = "Airfryer"
- Magnetron = "Magnetron + schaal"
- Salade/wrap koud = "0 pannen"
Voorbeelden:
- Pasta koken + saus apart = 2 pannen
- Rijst + kip + groente elk apart = 3 pannen
- Alles in 1 wok = 1 pan
- Wrap koud vullen = 0 pannen
Als stappen woorden bevatten als "tweede pan", "apart koken", "zet een pot water op" dan is afwas hoger dan 1.

VERSPRODUCT BADGE: Gebruik "versproduct" alleen bij: vlees, vis, kip, verse groente, sla, verse kruiden, zuivel, geopende producten.
NIET bij: droge rijst, pasta, blik, kruidenpotjes, olie, zout, diepvries.
Veld: "versProduct": true/false
Veld: "versProductItems": ["zalm", "broccoli"]

MATCHSCORE (0-100) — realistisch, niet alleen op "alles in huis":
- ingrediënten in huis: max 35pt
- past binnen tijd: max 20pt
- past bij doel (gezond/comfort/protein): max 15pt
- weinig afwas: max 10pt
- gebruikt verse/bederfelijke items: max 10pt
- goede voedingsbalans (eiwit + groente): max 10pt
Verlaag score bij:
- geen groente: -15pt
- geen eiwit: -15pt
- meer pannen dan gebruiker wil bij "bijna niks" of "minder afwas": -10pt
- recept buiten tijd: -20pt
Labels: 90-100=Sterke match, 75-89=Goede match, 60-74=Redelijke match, 40-59=Noodoptie

MOEITE "${moeite}": max ${maxStappen} stappen
${moeite === 'bijna niks' ? '- Max 1 pan, geen snijwerk, zo min mogelijk handelingen' : ''}
${wilMindaAfwas ? '- PRIORITEER recepten met 0-1 pan, vermijd meerdere pannen' : ''}

STAPPEN: altijd vuurstand + minuten + gaarheidcheck. Geen vage termen.
FOOD SAFETY: kip="geen roze meer zichtbaar", gehakt="volledig bruin", vis="valt makkelijk uit elkaar"

HOEVEELHEDEN/persoon: pasta/rijst 75-100g droog, vlees/vis 150-180g, groente 150-250g
EENHEDEN: g, ml, stuks, el (eetlepel), tl (theelepel)

BADGES (alleen tonen als ze echt kloppen):
- "Snelste keuze": echt snelste recept in de set
- "Gezondste keuze": bevat groente, redelijk eiwit, niet extreme kcal
- "Meest vullend": hoog volume, vezels of eiwit
- "Minste afwas": laagste pan-count in de set
- Een recept met 3+ pannen mag NOOIT "Snelste keuze" of "Minste afwas" krijgen

WAAROM DIT SLIM IS: alleen concrete, data-gedreven redenen.
- Gebruik nooit "weinig afwas" als er 2+ pannen zijn
- Gebruik nooit "snel" als totale tijd hoog is
- Gebruik nooit "alles in huis" als er iets ontbreekt
- Gebruik nooit "high protein" als eiwit laag is
- Gebruik altijd concrete getallen: "Bevat 38g eiwit per portie", "Klaar in 20 minuten", "Gebruikt 1 pan"

VARIATIE:
1. hoofd rol "Snelste keuze" isExtra:false — echt snelste
2. hoofd rol "Gezondste keuze" isExtra:false — meeste groente/balans
3. hoofd rol "Meest vullend" isExtra:false — meest bevredigend
4. extra isExtra:true — vegetarisch/budget/restjes
5. extra isExtra:true — high protein/minder afwas/anders
${verfijnInstructie}

VOEDINGSWAARDEN: realistisch. per100g = (perPortie / portieGewicht) * 100. Afronden.
SMAAKUPGRADES: max 3, respecteer allergieën en nooit-gebruiken.
VERVANGINGEN: max 3, logisch, respecteer dieet.
RESTJES: kip/vis max 2 dagen, groente max 3 dagen.

Geef precies 5 suggesties als JSON array. GEEN tekst buiten JSON.

[{
  "naam": "string",
  "rol": "Snelste keuze",
  "isExtra": false,
  "korteBeschrijving": "string",
  "matchScore": 87,
  "matchLabel": "Goede match",
  "matchUitleg": "string",
  "matchRedenen": ["string"],
  "versProduct": false,
  "versProductItems": [],
  "negeerMeldingen": [],
  "inHuis": [{"naam": "string", "hoeveelheid": "string"}],
  "basisvoorraad": [{"naam": "olijfolie", "hoeveelheid": "1 el"}],
  "nogNodig": [],
  "optioneel": [],
  "allesinHuis": true,
  "bereidingstijd": "25 minuten",
  "actieveKooktijd": "15 minuten",
  "afwasNiveau": "2 pannen",
  "apparatuurGebruikt": ["kookplaat"],
  "porties": 2,
  "voeding": {
    "totaalGewicht": 700,
    "portieGewicht": 350,
    "perPortie": {"kcal": 480, "proteinen": 42, "koolhydraten": 22, "vetten": 18},
    "per100g": {"kcal": 137, "proteinen": 12, "koolhydraten": 6.3, "vetten": 5.1}
  },
  "stappen": ["Stap 1 concreet."],
  "smaakUpgrades": ["string"],
  "vervangingen": ["string"],
  "waaromSlim": ["Klaar in 25 minuten", "Gebruikt 2 pannen", "Bevat 42g eiwit per portie"],
  "restjes": {"idee": "string", "bewaren": "string", "invriezen": false},
  "badge": "gezond",
  "extraBadges": []
}]`;

  const gebruikersBericht = `Voorraad: ${ingredienten}
Tijd: ${tijd} min | Personen: ${personen} | Moeite: ${moeite} | Doel: ${doel}
Boodschappen: ${boodschappen || 'paar dingen oké'}
Allergieën: ${allergienen.join(', ') || 'geen'}
Nooit: ${nooitGebruiken || 'niets'}
Kookniveau: ${kookniveau}
Apparatuur: ${apparatuur.join(', ')}
${verfijn ? `Verfijning: ${verfijn}` : ''}`;

  // Beperkte voorraad: aparte prompt
  if (beperktVoorraad && !verfijn) {
    const beperktPrompt = `Je bent Vanavond, een eerlijke Nederlandse kookassistent.
Voorraad: ${ingredienten}
Beoordeel eerlijk. Geef JSON:
{
  "beperktVoorraad": true,
  "uitleg": "eerlijke zin over wat ontbreekt",
  "noodOptie": {
    "naam": "string",
    "matchScore": 42,
    "korteBeschrijving": "string",
    "stappen": ["stap 1", "stap 2"],
    "waarschuwing": "string"
  },
  "extraVoorstellenIngredient": [
    {"ingredient": "ei", "gerecht": "naam", "reden": "reden"},
    {"ingredient": "tomaat", "gerecht": "naam", "reden": "reden"},
    {"ingredient": "diepvriesgroente", "gerecht": "naam", "reden": "reden"}
  ]
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 2000, system: beperktPrompt, messages: [{ role: 'user', content: `Voorraad: ${ingredienten}` }] })
      });
      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      const jsonMatch = data.content[0].text.trim().match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Geen JSON');
      return res.status(200).json({ beperktVoorraad: true, ...JSON.parse(jsonMatch[0]) });
    } catch (err) { /* Fallback naar normale flow */ }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 8000, system: systeemPrompt, messages: [{ role: 'user', content: gebruikersBericht }] })
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

    // Server-side validatie: afwasNiveau corrigeren op basis van stappen
    suggesties.forEach(s => {
      if (!Array.isArray(s.stappen)) return;
      const stappen = s.stappen.join(' ').toLowerCase();

      const heeftOven = ['oven', 'bakplaat', 'ovenschaal', 'verwarm de oven'].some(w => stappen.includes(w));
      const heeftAirfryer = stappen.includes('airfryer');
      const heeftMagnetron = stappen.includes('magnetron');
      const heeftPan = stappen.includes('pan') || stappen.includes('pot') || stappen.includes('wok');

      let panCount = 0;
      if (heeftPan) {
        panCount = 1;
        const extraSignalen = ['tweede pan','aparte pan','andere pan','apart koken','apart bakken','kook de rijst','kook de pasta','kook de noedels','kook de aardappel','in een andere','in een tweede'];
        if (extraSignalen.some(w => stappen.includes(w))) panCount++;
        const derdeSignalen = ['derde pan','nog een pan','ook apart','derde kookmoment'];
        if (derdeSignalen.some(w => stappen.includes(w))) panCount++;
      }

      let gecorrigeerd = s.afwasNiveau;
      if (heeftOven && !s.afwasNiveau.toLowerCase().includes('oven')) {
        gecorrigeerd = stappen.includes('bakplaat') ? 'Oven + bakplaat' : 'Oven + ovenschaal';
      } else if (heeftAirfryer && !s.afwasNiveau.toLowerCase().includes('airfryer')) {
        gecorrigeerd = 'Airfryer';
      } else if (panCount >= 2 && (s.afwasNiveau === '1 pan' || s.afwasNiveau === '1 pan + snijplank')) {
        gecorrigeerd = panCount === 2 ? '2 pannen' : `${panCount} pannen`;
      } else if (!heeftPan && !heeftOven && !heeftAirfryer && !heeftMagnetron) {
        gecorrigeerd = '0 pannen';
      }
      s.afwasNiveau = gecorrigeerd;

      // Corrigeer waaromSlim: verwijder claims die niet kloppen
      if (Array.isArray(s.waaromSlim)) {
        s.waaromSlim = s.waaromSlim.filter(w => {
          const wl = w.toLowerCase();
          if (wl.includes('weinig afwas') && panCount >= 2) return false;
          if (wl.includes('1 pan') && panCount >= 2) return false;
          if (wl.includes('alles in huis') && Array.isArray(s.nogNodig) && s.nogNodig.length > 0) return false;
          if (wl.includes('high protein') && s.voeding?.perPortie?.proteinen < 20) return false;
          return true;
        });
        // Voeg correcte afwas toe als die er niet in staat
        const heeftAfwasBullet = s.waaromSlim.some(w => w.toLowerCase().includes('pan') || w.toLowerCase().includes('afwas'));
        if (!heeftAfwasBullet && gecorrigeerd) {
          s.waaromSlim.push(`Afwas: ${gecorrigeerd}`);
        }
      }

      // Corrigeer matchRedenen
      if (Array.isArray(s.matchRedenen)) {
        s.matchRedenen = s.matchRedenen.filter(r => {
          if (r.toLowerCase().includes('weinig afwas') && panCount >= 2) return false;
          if (r.toLowerCase().includes('1 pan') && panCount >= 2) return false;
          return true;
        });
      }

      // Versproduct badge corrigeren
      const versItems = ['kip','kipfilet','gehakt','zalm','vis','tonijn vers','sla','ijsbergsla','rucola','andijvie','spinazie','broccoli','courgette','paprika','tomaat','champignon','garnalen'];
      const inHuisNamen = Array.isArray(s.inHuis) ? s.inHuis.map(i => (typeof i === 'object' ? i.naam : i).toLowerCase()) : [];
      const gebruikteVersItems = versItems.filter(v => inHuisNamen.some(n => n.includes(v)));
      s.versProduct = gebruikteVersItems.length > 0;
      s.versProductItems = gebruikteVersItems;
    });

    return res.status(200).json({ suggesties });

  } catch (err) {
    console.error('API fout:', err.message);
    return res.status(500).json({ error: err.message || 'Er ging iets mis.' });
  }
}
