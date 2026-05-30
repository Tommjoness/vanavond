export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ingredienten, ingredientLijst, tijd, personen, moeite, doel, doelFilters, boodschappen, geenZinIn, profiel, verfijn } = req.body;

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

  // Ingredient intelligence: normaliseer varianten naar basistermen
  function normaliseer(ing) {
    const i = ing.toLowerCase().trim();
    if (/kip|kipdij|kipfilet|kippendij|kipstuk|kipvlees/.test(i)) return 'kip';
    if (/gehakt|rundergehakt|varkensgehakt|gemengd gehakt/.test(i)) return 'gehakt';
    if (/kaas|geraspte kaas|goudse|cheddar|mozzarella|parmezaan|feta|camembert/.test(i)) return 'kaas';
    if (/penne|spaghetti|fusilli|tagliatelle|rigatoni|farfalle|macaroni|linguine|fettuccine/.test(i)) return 'pasta';
    if (/rijst|basmati|jasmine|zilvervliesrijst/.test(i)) return 'rijst';
    if (/ui|rode ui|witte ui|sjalot|lente-ui/.test(i)) return 'ui';
    if (/tomaat|tomaten|kerstomaat|cherry tomaat|pruimtomaat/.test(i)) return 'tomaat';
    if (/paprika|rode paprika|groene paprika|gele paprika/.test(i)) return 'paprika';
    if (/yoghurt|griekse yoghurt|magere yoghurt/.test(i)) return 'yoghurt';
    if (/room|slagroom|kookroom|crème fraîche/.test(i)) return 'room';
    if (/ei|eieren|kippenei/.test(i)) return 'ei';
    if (/zalm|zalmfilet|gerookte zalm/.test(i)) return 'zalm';
    if (/tonijn|tonijn blik|tonijn in water/.test(i)) return 'tonijn';
    if (/champignon|paddestoel|portobello/.test(i)) return 'champignon';
    if (/brood|boterham|volkoren brood|wit brood/.test(i)) return 'brood';
    if (/aardappel|kruimige aardappel|vastkokende aardappel/.test(i)) return 'aardappel';
    return i;
  }

  const ingLijstGenormaliseerd = ingLijst.map(normaliseer);
  const ingNormLower = ingLijstGenormaliseerd;

  const ingLower = ingNormLower;
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
  const actieveFilters = Array.isArray(doelFilters) ? doelFilters : (doel ? [doel] : []);
  const wilMindaAfwas = (verfijn && verfijn.toLowerCase().includes('afwas')) || actieveFilters.includes('minder afwas');
  const geenZinInRegel = Array.isArray(geenZinIn) && geenZinIn.length > 0 ? `\nGEEN ZIN IN (strikt vermijden): ${geenZinIn.join(', ')}` : '';

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
INGREDIËNT INTELLIGENCE — begrijp varianten:
- "geraspte kaas", "parmezaan", "cheddar" = kaas
- "kipdijfilet", "kippendij", "kipstuk" = kip
- "penne", "spaghetti", "fusilli", "tagliatelle" = pasta
- "basmati", "zilvervliesrijst", "jasmijnrijst" = rijst
- "rode ui", "sjalot", "lente-ui" = ui
- "kerstomaat", "pruimtomaat", "cherrytomaat" = tomaat
- "rode paprika", "groene paprika" = paprika
- "Griekse yoghurt", "magere yoghurt" = yoghurt
- "kookroom", "slagroom", "crème fraîche" = room (let op: NIET hetzelfde als yoghurt)
- "zalmfilet", "gerookte zalm" = zalm
- Paprikapoeder ≠ paprika (is een kruid, geen groente)
NOOIT GEBRUIKEN: ${nooitGebruiken || 'niets'}
${geenZinInRegel}

FILTERLOGICA — VASTE DREMPELWAARDEN (altijd toepassen, niet optioneel):
Gekozen filters (combineer als voorkeuren, niet als harde eisen): "${actieveFilters.join(', ')}"
- "gezond": min 120g groente per portie, geen frituur, gebalanceerde macros
- "makkelijk en vullend": warm/vullend, pasta/rijst/aardappel/romige saus of ovengerecht
- "eiwitrijk": minimaal 30g eiwit per portie, duidelijke eiwitbron
- "goedkoop": goedkope supermarktproducten, weinig ingrediënten, geen luxe
- "licht eten": lager in kcal, minder vet, veel groente of lichte bereiding
- "kindvriendelijk": milde smaken, herkenbaar, niet pittig of bitter
- "koolhydraatarm": weinig/geen rijst/pasta/brood/aardappel
- "restjes opmaken": maximaal gebruik bestaande ingrediënten, hoge ingredient-match
- "minder afwas": max 1 pan of 1 ovenschaal, geen meerdere pannen
- "snel klaar": bereidingstijd maximaal 20 minuten
- "veel groente": minimaal 200g groente per portie, duidelijk aanwezig in recept
Als recept NIET voldoet aan drempelwaarden van gekozen doel: verlaag matchScore met 20pt.

FOTOZOEKTERM: Geef een Engelse zoekterm van max 3 woorden voor Pexels.
Gebruik het hoofdingrediënt als eerste woord, dan eventueel een tweede hoofdingrediënt.
Geen "bowl", "dinner", "plate", "food", "homemade" toevoegen — dat doet de fotodienst zelf.
Wees zo specifiek mogelijk op het hoofdingrediënt van het recept.
- Kip + rijst: "chicken rice"
- Gehakt + rijst + mais: "minced beef rice"
- Zalm + pasta: "salmon pasta"
- Tonijn + pasta + tomaat: "tuna pasta tomato"
- Ei + aardappel: "egg potato"
- Groente wrap: "vegetable wrap"
- Kipsoep: "chicken soup"
- Salade + kip: "chicken salad"
NOOIT een ingredient meegeven dat niet in het recept zit.
Veld: "fotoZoekterm": "salmon pasta"
Specifieke regels per gerechtstype:
- Wrap → "tortilla wrap" of "chicken wrap" — nooit "salad", "bowl" of "plate"
- Pasta → "pasta plate" of "spaghetti" — nooit "noodles" of "rice"
- Rijst → "rice dish" of "fried rice" — nooit "pasta"
- Soep → "soup bowl" — nooit "stew plate"
- Omelet → "omelette pan" — nooit "fried egg"
- Salade → "salad bowl" — nooit "wrap" of "sandwich"

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

MATCHSCORE (0-100) — realistisch, eerlijk, geen nep-perfectie:
- ingrediënten in huis: max 35pt
- past binnen tijd: max 20pt
- past bij doel: max 15pt
- weinig afwas: max 10pt
- gebruikt verse/bederfelijke items: max 10pt
- goede voedingsbalans: max 10pt
Verlaag score bij:
- geen groente: -15pt
- geen eiwit: -15pt
- meer pannen bij "bijna niks": -10pt
- recept buiten tijd: -20pt
- niet bij gekozen doel: -20pt
SCOREGRENZEN: Bijna nooit boven 92%. Gebruik realistische spreiding: 65-75=redelijk, 75-85=sterk, 85-92=zeer sterk.
Labels: 85-92="Sterke match", 70-84="Goede match", 60-69="Redelijke match", 40-59="Noodoptie"

NEPPE PRECISIE VERBODEN:
- Schrijf voedingswaarden altijd met "±": "±42g eiwit", "±480 kcal"
- Matchscores nooit als schijnprecisie: 87% is beter dan 87.3%
- Nooit exacte gram-waarden in matchRedenen: gebruik "veel eiwit" of "±40g eiwit"

MATCHUITLEG: Kort en menselijk. Max 1-2 zinnen.
- Niet: "Dit recept voldoet volledig aan je wensen en combineert optimaal..."
- Wel: "Alles in huis, snel klaar en veel eiwit."
- Wel: "Gebruikt 5 van je ingrediënten en klaar in 20 minuten."

SLIMME REDEN (veld "slimmeReden"): Één korte zin onder de titel waarom dit recept past.
Voorbeelden:
- "Gebruikt 6 van je ingrediënten."
- "Minste afwas van alle opties."
- "Klaar terwijl de rijst kookt."
- "Geen extra boodschappen nodig."
Max 8 woorden, geen punt als het kort genoeg is.

MOEITE "${moeite}": max ${maxStappen} stappen
${moeite === 'bijna niks' ? '- Max 1 pan, geen snijwerk, zo min mogelijk handelingen' : ''}
${wilMindaAfwas ? '- PRIORITEER recepten met 0-1 pan, vermijd meerdere pannen' : ''}

VERBODEN COPY (nooit gebruiken, ook niet in matchRedenen of waaromSlim):
- "excellent high protein"
- "goede voedingsbalans"
- "topkeuze voor high protein"
- "optimale maaltijd"
- "perfect gebalanceerd"
- "ideale combinatie"
- "uitstekende keuze"
- "afkruid" (gebruik: "bestrooi met", "werk af met")
- "moeite 'normaal': X concrete stappen" of elke combinatie hiervan
- "breng aan de kook op hoog" (gebruik: "breng aan de kook op hoog vuur" of gewoon "breng aan de kook")
- "luchtfriet" (gebruik: "airfryer")
- "serveer onmiddellijk" (gebruik: "serveer direct")
- "eet onmiddellijk" (gebruik: "eet direct")
- "pantry" (gebruik: "voorraadkast")
- "katerproof"
- "squeeze" (gebruik: "scheutje")
- "incl." (schrijf voluit: "inclusief")
- "airtight container" (gebruik: "afgesloten bakje" of "afgesloten container")
- Engelstalige marketingtermen
- Zinnen die gehaast of telegrafisch klinken
- Zinnen zonder werkwoord

SCHRIJFSTIJL:
- Schrijf rustig, volledig en menselijk. Geen telegramstijl.
- Elke zin heeft een onderwerp en een werkwoord.
- Niet: "Slechts 2 pannen: rijstpan + afwasbak broccoli"
- Wel: "Je hebt maar 2 pannen nodig: één voor de rijst en één voor de broccoli."
- Niet: "48g eiwit per portie = zeer voedzaam"
- Wel: "Dit recept bevat 48g eiwit per portie."

Gebruik in plaats daarvan:
- "Veel eiwitten" of "48g eiwit per portie"
- "Vullende maaltijd"
- "Makkelijk en vullend"
- "Snel en voedzaam"
- "Ideaal na sporten"
- "Weinig afwas: 1 pan"
- "Klaar in 25 minuten"
- "Alles al in huis"

GRAMMATICA EN STIJL — VERPLICHT:
- Volledige zinnen eindigen altijd met een punt.
- Opsommingen met 2 items: gebruik "en" — nooit een komma. Correct: "kipfilet en paprika." Fout: "kipfilet, paprika"
- Opsommingen met 3+ items: komma's tussen items, "en" voor het laatste. Correct: "kip, paprika en rijst."
- Geen dubbele benamingen: nooit "kip, kipfilet" — kies één naam die overeenkomt met de ingrediëntenlijst.
- Correct meervoud: champignon→champignons, tomaat→tomaten, ui→uien, wortel→wortelen, paprika→paprika's, aardappel→aardappelen.
- Ingrediëntnamen in teksten moeten exact overeenkomen met de naam in de ingrediëntenlijst van datzelfde recept.
- Geen zinnen zonder werkwoord.
- Hoofdletters: alleen aan het begin van een zin, niet willekeurig midden in een zin.
- matchUitleg, korteBeschrijving, waaromSlim en restjes.idee zijn volledige zinnen met punt aan het einde.
- matchRedenen zijn korte fragmenten zonder punt (worden als chips getoond).
- VERBODEN als matchReden: "Eenpans(schaal)gerecht", "Normaal moeite niveau", "Ruim binnen tijd", "Sterke voorraadbewegingen", vage of AI-achtige teksten.
- GOED als matchReden: "42g eiwit per portie", "Klaar in 25 minuten", "Alles in huis", "Weinig afwas", "Veel groente", "Past bij je gekozen filters".
- Als filters zijn meegegeven: noem in matchUitleg welke filters goed worden geraakt.

SPELLING — controleer elk woord vóór je het schrijft:
- "geroosterd" niet "geroostedrde"
- "knapperig" niet "knappig" of "knappige"
- "goudbruin" niet "goudbruine" tenzij bijvoeglijk naamwoord
- "voedzaam" niet "voedzame" tenzij bijvoeglijk naamwoord
- "eiwitrijk" niet "eiwitrijke" tenzij bijvoeglijk naamwoord
- Controleer alle adjectieven op correcte uitgang (-e of geen -e)
- Geen dubbele letters die er niet horen: "geroostedrde" → "geroosterde"

TAALREGELS — KRITIEK:
- Schrijf ALLEEN in het Nederlands. Geen Engelse woorden.
- VERBODEN: "minced", "prep", "cook", "medium heat", "serve", "ready", "heat", "add", "stir", "garnish", "topping", "meal prep"
- GOED: "fijngehakt", "voorbereiden", "koken", "middelhoog vuur", "serveren", "klaar", "verhit", "voeg toe", "roer", "werk af met", "bestrooi met"
- FOUT: "Kip uit pan, even rustend." / "Zout en peper afmaken." / "gaar voelt" / "flinke snuf" / "bakken totdat bruin"
CONSISTENTIE TITEL EN INGREDIËNTEN:
- Noem een gerecht NOOIT "noodles" als je macaroni, penne, spaghetti of andere pasta gebruikt.
- Noem een gerecht NOOIT "bowl" als het een gewone pan is.
- De gerechtnaam moet exact overeenkomen met de hoofdingrediënten.
- Pasta is pasta. Noodles zijn rijstnoedels, glasnoedels of eiernoodles.
- Fout: "Kipnoodles met macaroni" → Goed: "Kipmacaroni" of "Kip met pasta"

ZACHTE TAAL: Vermijd "serveer onmiddellijk", "moet", "onmiddellijk". Gebruik liever "lekkerst als je het meteen eet", "je kunt", "bewaar maximaal".
- GOED: "Haal de kip uit de pan en laat kort rusten." / "Breng op smaak met zout en peper." / "vanbinnen niet meer roze" / "bak goudbruin"
- GEEN kookblogtaal: niet "culinair", "smaakexplosie", "perfect gebalanceerd", "heerlijke bite"
- GEEN mechanische opsommingen die klinken als AI-output

SMAAKUPGRADES — max 3, alleen echt nuttige tips:
- Schrijf als concrete, korte zinnen. Niet als kreten.
- FOUT: "Voeg kruiden toe", "Gebruik peper", "Maak het lekkerder"
- GOED: "Een theelepel grove mosterd geeft meer diepte.", "Een scheutje citroensap maakt het direct frisser.", "Rooster de champignons iets langer voor meer smaak."
- Respecteer allergieën en nooit-gebruiken.

VERVANGINGEN — max 3, alleen logische en realistische opties:
- Geef korte, menselijke uitleg: "iets sneller klaar", "meer vezels", "mildere smaak", "goedkoper alternatief"
- FOUT: "Rijst → volkoren pasta (gelijktijdig koken)", "Kip → tofu (proteïnebron)"
- GOED: "Geen rijst? Couscous is 5 minuten sneller klaar.", "Geen kipfilet? Kalkoenfilet werkt prima.", "Geen broccoli? Sperziebonen zijn een goed alternatief."
- Geen technische kookinstructies als vervanging. Geen rare combinaties.

RESTJES — menselijk en praktisch, geen robotische opsomming:
- FOUT: "door rest rijst met yoghurt mengen", "max 2 dagen", "invriezen: geschikt"
- GOED: "Ook lekker als lunch de volgende dag.", "Bewaar afgesloten in de koelkast, tot 2 dagen.", "Kan worden ingevroren."
- Geef een concreet idee wat je ermee kunt (wrap, salade, soep, omelet, bowl)
- Bewaaradvies realistisch: kip/vis max 2 dagen, groente max 3 dagen, pasta/rijst max 2 dagen

STAPPENFORMAT — VERPLICHT:
Elke stap bestaat uit twee velden: "titel" en "uitleg".
De UI toont al een getal in een cirkel. Zet GEEN "1.", "Stap 1:" of nummers in de tekst zelf.

STAP FORMAT:
{"titel": "Rijst koken", "uitleg": "Breng een pan water aan de kook. Voeg de rijst toe en kook 15 tot 18 minuten tot de korrels zacht zijn."}

NIET: {"titel": "1. Rijst koken", "uitleg": "Stap 1: Kook rijst..."}

Tijdplanning in stappen: als dingen parallel kunnen, benoem dat expliciet:
"Terwijl de rijst kookt, verhit je een tweede pan en bak je de kip."

FOOD SAFETY — natuurlijk formuleren:
- Kip: "Bak de kip 6 tot 8 minuten tot deze goudbruin is en vanbinnen niet meer roze."
- Gehakt: "Bak het gehakt rul en volledig gaar, geen roze meer zichtbaar."
- Vis: "Bak de vis 3 tot 4 minuten per kant tot deze makkelijk uit elkaar valt."

HOEVEELHEDEN CONSISTENT: hoeveelheden in stappen moeten optellen tot precies wat in de ingrediëntenlijst staat.
Als ingrediëntenlijst "2 el olie" zegt: gebruik in stappen samen ook exact 2 el, niet meer.

STAPPEN: altijd vuurstand + minuten + gaarheidcheck. Max ${maxStappen} stappen.

HOEVEELHEDEN/persoon: pasta/rijst 75-100g droog, vlees/vis 150-180g, groente 150-250g
EENHEDEN: g, ml, stuks, el (eetlepel), tl (theelepel)

BADGES (alleen tonen als ze echt kloppen):
- "Snelste keuze": echt snelste recept in de set
- "Gezondste keuze": bevat groente, redelijk eiwit, niet extreme kcal
- "Meest vullend": hoog volume, vezels of eiwit
- "Minste afwas": laagste pan-count in de set
- Een recept met 3+ pannen mag NOOIT "Snelste keuze" of "Minste afwas" krijgen

WAAROM DIT PAST: alleen concrete, begrijpelijke redenen.
- Gebruik nooit "weinig afwas" als er 2+ pannen zijn
- Gebruik nooit "snel" als totale tijd hoog is
- Gebruik nooit "alles in huis" als er iets ontbreekt
- Gebruik nooit "eiwitrijk" als eiwit laag is
- Gebruik altijd concrete getallen: "Bevat 38g eiwit per portie", "Klaar in 20 minuten", "Gebruikt 1 pan"

VARIATIE — KRITIEK: De 5 suggesties moeten TOTAAL verschillend zijn van elkaar.
VERBODEN: 2+ suggesties met hetzelfde hoofdingrediënt EN bereiding.
Forceer variatie: kies uit pasta, wrap, rijstgerecht, ovenschotel, salade, bowl, roerbak, soep, couscous, aardappel, traybake, stamppot, noedelgerecht, omelet.
Gerechtstijlen onderling afwisselen. Niet 3x "gebakken X met rijst".

1. hoofd rol "Snelste keuze" isExtra:false — echt snelste, zo min mogelijk stappen
2. hoofd rol "Gezondste keuze" isExtra:false — meeste groente, goede balans
3. hoofd rol "Meest vullend" isExtra:false — meest bevredigend, andere bereidingsstijl
4. extra isExtra:true — vegetarisch OF budget OF restjes, andere keuken/stijl
5. extra isExtra:true — andere bereidingsvorm (bijv. oven/wrap/salade/soep), zeker niet hetzelfde als 1-4
${verfijnInstructie}

KWALITEITSDREMPEL: Geef een suggestie alleen als matchScore >= 60. Liever 3 sterke suggesties dan 5 middelmatige.

INTERNE KWALITEITSCHECK per recept vóór je het opneemt:
✓ Taal volledig Nederlands
✓ Geen dubbele ingrediënten
✓ Apparatuur klopt met stappen
✓ Afwas klopt met stappen (geen "1 pan" als er 2 nodig zijn)
✓ Tijden zijn realistisch
✓ Geen vage of Engelse termen
✓ Hoeveelheden zijn logisch
✓ Stappen zijn praktisch uitvoerbaar
Als een recept hier niet aan voldoet, vervang het door een beter alternatief.


VOEDINGSWAARDEN: realistisch. per100g = (perPortie / portieGewicht) * 100. Afronden.

Geef precies 5 suggesties als JSON array. GEEN tekst buiten JSON.

[{
  "naam": "string",
  "rol": "Snelste keuze",
  "isExtra": false,
  "korteBeschrijving": "string",
  "slimmeReden": "Gebruikt 5 van je ingrediënten",
  "matchScore": 82,
  "matchLabel": "Goede match",
  "matchUitleg": "Alles in huis en snel klaar.",
  "matchRedenen": ["Alle ingrediënten in huis", "Klaar in 25 min"],
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
  "afwasNiveau": "1 pan",
  "apparatuurGebruikt": ["kookplaat"],
  "porties": 2,
  "voeding": {
    "totaalGewicht": 700,
    "portieGewicht": 350,
    "perPortie": {"kcal": 480, "proteinen": 42, "koolhydraten": 22, "vetten": 18},
    "per100g": {"kcal": 137, "proteinen": 12, "koolhydraten": 6.3, "vetten": 5.1}
  },
  "stappen": [{"titel": "Rijst koken", "uitleg": "Breng een pan water aan de kook. Voeg de rijst toe en kook 15 minuten."}],
  "smaakUpgrades": ["string"],
  "vervangingen": ["string"],
  "waaromPast": ["Klaar in 25 minuten", "Gebruikt 2 pannen", "Bevat 42g eiwit per portie"],
  "restjes": {"idee": "string", "bewaren": "string", "invriezen": false},
  "badge": "gezond",
  "extraBadges": [],
  "fotoZoekterm": "chicken rice bowl dark moody food photography"
}]`;

  const gebruikersBericht = `Voorraad: ${ingredienten}
Tijd: ${tijd} min | Personen: ${personen} | Moeite: ${moeite} | Filters: ${actieveFilters.join(', ') || 'maakt niet uit'}
Boodschappen: ${boodschappen || 'paar dingen oké'}
Geen zin in: ${Array.isArray(geenZinIn) && geenZinIn.length > 0 ? geenZinIn.join(', ') : 'niets'}
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

    // ============================================================
    // CENTRALE RECEPT-VALIDATIE PIPELINE
    // ============================================================

    const lijstNaarZin = (items) => {
      if (!items || items.length === 0) return '';
      if (items.length === 1) return items[0];
      if (items.length === 2) return `${items[0]} en ${items[1]}`;
      return `${items.slice(0, -1).join(', ')} en ${items[items.length - 1]}`;
    };

    const metPunt = (s) => {
      if (!s || typeof s !== 'string') return s;
      const t = s.trim();
      return ['.','!','?'].includes(t[t.length-1]) ? t : t + '.';
    };

    const TAALPROBLEMEN = [
      [/snipper de kip/gi, 'snijd de kip in stukjes'],
      [/\bin beten\b/gi, 'in blokjes'],
      [/leg zur zijde/gi, 'leg apart'],
      [/gare kip terug/gi, 'gebakken kip terug'],
      [/spuit yoghurtsaus/gi, 'lepel de yoghurtsaus'],
      [/fijner de knoflook/gi, 'hak de knoflook fijn'],
      [/fijngeraaspte/gi, 'fijngehakte'],
      [/reisbowl/gi, 'rijstbowl'],
      [/geeft meer frisse smaak/gi, 'maakt het gerecht frisser'],
      [/serveer direct\./gi, 'Je kunt het daarna meteen opscheppen.'],
      [/serveer direct/gi, 'schep het op'],
      [/\bnoodles\b/gi, 'pasta'],
      [/sterke voorraadbewegingen/gi, ''],
      [/normaal moeite niveau/gi, ''],
      [/\bsqueeze\b/gi, 'scheutje'],
      [/\bhigh protein\b/gi, 'eiwitrijk'],
      [/airtight container/gi, 'afgesloten bakje'],
      [/luchtfriet/gi, 'airfryer'],
      [/geroostedrde/gi, 'geroosterde'],
      [/\bgiet af\b\.?/gi, 'Als de pasta gaar is, giet je deze af.'],
      [/gare kip terug in/gi, 'gebakken kip terug in'],
      [/\bleg zur zijde\b/gi, 'zet even apart'],
      [/spuit yoghurtsaus/gi, 'verdeel de yoghurtsaus'],
      [/snipper de kip in beten/gi, 'snijd de kip in kleine stukjes'],
      [/fijngeraaspte/gi, 'fijngehakte'],
      [/knappige/gi, 'knapperige'],
      [/eenpans\(schaal\)gerecht/gi, '1 pan'],
    ];

    function normalizeerTekst(tekst) {
      if (!tekst || typeof tekst !== 'string') return tekst;
      let r = tekst.trim();
      TAALPROBLEMEN.forEach(([zoek, verv]) => { r = r.replace(zoek, verv); });
      return r.replace(/\s+/g, ' ').trim();
    }

    function dedupIngredients(items) {
      if (!Array.isArray(items)) return items;
      const namen = items.map(i => (typeof i === 'object' ? i.naam : i).toLowerCase().trim());
      return items.filter((_, idx) =>
        !namen.some((ander, andereIdx) => andereIdx !== idx && ander.includes(namen[idx]) && ander.length > namen[idx].length)
      );
    }

    function verwerkRecept(s) {
      // STAP 1: normaliseer alle tekstvelden
      if (s.naam) s.naam = normalizeerTekst(s.naam);
      if (s.korteBeschrijving) s.korteBeschrijving = metPunt(normalizeerTekst(s.korteBeschrijving));
      if (s.matchUitleg) s.matchUitleg = metPunt(normalizeerTekst(s.matchUitleg));
      if (s.slimmeReden) s.slimmeReden = normalizeerTekst(s.slimmeReden);
      const waarom = s.waaromPast || s.waaromSlim || [];
      if (s.restjes?.idee) s.restjes.idee = metPunt(normalizeerTekst(s.restjes.idee));
      if (s.restjes?.bewaren) s.restjes.bewaren = metPunt(normalizeerTekst(s.restjes.bewaren));
      if (Array.isArray(s.smaakUpgrades)) s.smaakUpgrades = s.smaakUpgrades.map(u => metPunt(normalizeerTekst(u))).filter(Boolean);
      if (Array.isArray(s.stappen)) {
        s.stappen = s.stappen.map(st => {
          if (typeof st === 'object') return { titel: st.titel ? st.titel.replace(/^\d+\.\s*|^Stap \d+:?\s*/i, '').trim() : st.titel, uitleg: metPunt(normalizeerTekst(st.uitleg)) };
          return metPunt(normalizeerTekst(st));
        });
      }

      // STAP 2: dedupliceer ingrediënten
      if (Array.isArray(s.inHuis)) s.inHuis = dedupIngredients(s.inHuis);
      if (Array.isArray(s.nogNodig)) s.nogNodig = dedupIngredients(s.nogNodig);
      if (Array.isArray(s.optioneel)) s.optioneel = dedupIngredients(s.optioneel);

      // STAP 3: tips valideren — verwijder tips over ingrediënten die er niet in zitten
      const alleIng = [...(s.inHuis || []), ...(s.basisvoorraad || []), ...(s.optioneel || [])]
        .map(i => (typeof i === 'object' ? i.naam : i).toLowerCase().trim());
      if (Array.isArray(s.smaakUpgrades)) {
        s.smaakUpgrades = s.smaakUpgrades.filter(tip => {
          const t = tip.toLowerCase();
          const gecontroleerd = ['yoghurt', 'citroen', 'kaas', 'knoflook', 'chilisaus', 'pesto', 'mosterd'];
          return !gecontroleerd.some(ing => t.includes(ing) && !alleIng.some(n => n.includes(ing)));
        });
      }

      // STAP 4: apparatuur en afwas afleiden uit stappen
      if (!Array.isArray(s.stappen)) return s;
      const st = s.stappen.map(x => typeof x === 'object' ? `${x.titel||''} ${x.uitleg||''}` : x).join(' ').toLowerCase();

      const heeftOven = ['oven', 'verwarm de oven'].some(w => st.includes(w));
      const heeftBakplaat = st.includes('bakplaat');
      const heeftOvenschaal = st.includes('ovenschaal');
      const heeftAirfryer = st.includes('airfryer');
      const heeftMagnetron = st.includes('magnetron');
      const heeftKom = ['in een kom', 'mengkom', 'klop de eieren', 'klop het ei'].some(w => st.includes(w));
      const heeftSnijplank = ['snijden', 'hakken', 'in blokjes', 'in plakjes', 'in reepjes', 'in stukjes'].some(w => st.includes(w));
      const heeftPan = ['pan', 'pot', 'wok', 'koekenpan', 'steelpan', 'hapjespan'].some(w => st.includes(w));

      let panCount = 0;
      if (heeftPan) {
        panCount = 1;
        if (['tweede pan', 'aparte pan', 'andere pan', 'apart koken', 'apart bakken', 'kook de rijst', 'kook de pasta', 'kook de aardappel', 'zet een pan op'].some(w => st.includes(w))) panCount++;
        if (['derde pan', 'nog een pan'].some(w => st.includes(w))) panCount++;
      }

      const afwas = [];
      if (panCount === 1) afwas.push('1 pan');
      else if (panCount === 2) afwas.push('2 pannen');
      else if (panCount >= 3) afwas.push(`${panCount} pannen`);
      // Oven zelf is GEEN afwas, alleen wat erin gaat
      if (heeftOven && heeftBakplaat) afwas.push('bakplaat');
      else if (heeftOven && heeftOvenschaal) afwas.push('ovenschaal');
      if (heeftAirfryer && !heeftOven) afwas.push('airfryer');
      if (heeftMagnetron && !heeftPan && !heeftOven) afwas.push('magnetron');
      if (heeftKom) afwas.push('kom');
      if (heeftSnijplank) afwas.push('snijplank');

      s.afwasNiveau = afwas.length > 0 ? afwas.join(' en ') : '0 pannen';
      s.apparatuurGebruikt = [...new Set([
        ...(heeftOven ? ['oven'] : []),
        ...(heeftAirfryer ? ['airfryer'] : []),
        ...(heeftMagnetron ? ['magnetron'] : []),
        ...(panCount > 0 ? ['kookplaat'] : []),
      ])];

      // STAP 5: waaromPast corrigeren
      s.waaromPast = waarom.map(w => metPunt(normalizeerTekst(w))).filter(w => {
        const wl = w.toLowerCase();
        if (wl.includes('weinig afwas') && afwas.length >= 3) return false;
        if (wl.includes('1 pan') && panCount >= 2) return false;
        if (wl.includes('alles in huis') && Array.isArray(s.nogNodig) && s.nogNodig.length > 0) return false;
        return Boolean(w);
      });

      // STAP 6: matchRedenen opschonen
      if (Array.isArray(s.matchRedenen)) {
        const vb = ['eenpans(schaal)', 'normaal moeite', 'ruim binnen tijd', 'sterke voorraad', 'voorraadbewegingen'];
        s.matchRedenen = s.matchRedenen.map(r => normalizeerTekst(r?.trim())).filter(r => r && r.length > 2 && !vb.some(v => r.toLowerCase().includes(v))).slice(0, 3);
      }

      // STAP 7: versProductItems
      const versLijst = ['kipfilet','kipdijfilet','gehakt','zalm','vis','tonijn','sla','ijsbergsla','rucola','andijvie','spinazie','broccoli','courgette','paprika','tomaat','champignon','garnalen','kip'];
      const inHuisNamen = (s.inHuis || []).map(i => (typeof i === 'object' ? i.naam : i).toLowerCase().trim());
      let versItems = [];
      inHuisNamen.forEach(naam => {
        const match = versLijst.find(v => naam.includes(v) || v.includes(naam));
        if (match) versItems.push(naam.length >= match.length ? naam : match);
      });
      versItems = [...new Set(versItems)].filter((item, _, arr) => !arr.some(a => a !== item && a.includes(item) && a.length > item.length));
      s.versProduct = versItems.length > 0;
      s.versProductItems = versItems;

      return s;
    }

    const verwerkteSuggesties = suggesties.map(verwerkRecept).filter(s => !s.matchScore || s.matchScore >= 60);
    return res.status(200).json({ suggesties: verwerkteSuggesties });

  } catch (err) {
    console.error('API fout:', err.message);
    return res.status(500).json({ error: err.message || 'Er ging iets mis.' });
  }
}
