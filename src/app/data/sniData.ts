export interface SniEntry {
  code: string;
  label: string;
}

export const SNI_DATA: SniEntry[] = [
  // A – Jordbruk, skogsbruk och fiske
  { code: 'A01', label: 'Jordbruk och jakt' },
  { code: 'A02', label: 'Skogsbruk' },
  { code: 'A03', label: 'Fiske och vattenbruk' },
  // B – Utvinning av mineral
  { code: 'B05', label: 'Utvinning av stenkol och brunkol' },
  { code: 'B06', label: 'Utvinning av råpetroleum och naturgas' },
  { code: 'B08', label: 'Utvinning av övriga mineral' },
  // C – Tillverkning
  { code: 'C10', label: 'Livsmedelsframställning' },
  { code: 'C11', label: 'Framställning av drycker' },
  { code: 'C13', label: 'Textilvarutillverkning' },
  { code: 'C16', label: 'Trä- och trävarutillverkning' },
  { code: 'C17', label: 'Pappers- och pappersvarutillverkning' },
  { code: 'C18', label: 'Grafisk produktion och reproduktion' },
  { code: 'C20', label: 'Tillverkning av kemikalier och kemiska produkter' },
  { code: 'C21', label: 'Tillverkning av farmaceutiska produkter' },
  { code: 'C22', label: 'Tillverkning av gummi- och plastvaror' },
  { code: 'C24', label: 'Stål- och metallframställning' },
  { code: 'C25', label: 'Tillverkning av metallvaror' },
  { code: 'C26', label: 'Tillverkning av datorer, elektronik och optik' },
  { code: 'C27', label: 'Tillverkning av elapparatur' },
  { code: 'C28', label: 'Tillverkning av övriga maskiner' },
  { code: 'C29', label: 'Tillverkning av motorfordon' },
  { code: 'C30', label: 'Tillverkning av andra transportmedel' },
  { code: 'C33', label: 'Reparation och installation av maskiner' },
  // D – Försörjning av el, gas, värme och kyla
  { code: 'D35', label: 'Försörjning av el, gas, värme och kyla' },
  // E – Vatten, avlopp, avfall
  { code: 'E36', label: 'Vattenförsörjning' },
  { code: 'E37', label: 'Avloppsrening' },
  { code: 'E38', label: 'Avfallsinsamling och avfallsbehandling' },
  { code: 'E39', label: 'Sanering och annan avfallshantering' },
  // F – Byggverksamhet
  { code: 'F41', label: 'Byggande av hus och byggnader' },
  { code: 'F42', label: 'Anläggningsarbeten' },
  { code: 'F43', label: 'Specialiserad bygg- och anläggningsverksamhet' },
  // G – Handel
  { code: 'G45', label: 'Handel med motorfordon' },
  { code: 'G46', label: 'Parti- och provisionshandel' },
  { code: 'G47', label: 'Detaljhandel' },
  // H – Transport och magasinering
  { code: 'H49', label: 'Landtransport och transport i rörsystem' },
  { code: 'H50', label: 'Sjötransport' },
  { code: 'H51', label: 'Lufttransport' },
  { code: 'H52', label: 'Magasinering och stödtjänster till transport' },
  { code: 'H53', label: 'Post- och kurirverksamhet' },
  // I – Hotell och restauranger
  { code: 'I55', label: 'Hotell och liknande boende' },
  { code: 'I56', label: 'Restauranger och catering' },
  // J – Informations- och kommunikationsverksamhet
  { code: 'J58', label: 'Förlagsverksamhet' },
  { code: 'J59', label: 'Film, video, TV och musik' },
  { code: 'J60', label: 'Radio och TV-sändning' },
  { code: 'J61', label: 'Telekommunikation' },
  { code: 'J62', label: 'Dataprogrammering och IT-konsulttjänster' },
  { code: 'J63', label: 'Informationstjänster och databehandling' },
  // K – Finans- och försäkringsverksamhet
  { code: 'K64', label: 'Finansiella tjänster utom försäkring' },
  { code: 'K65', label: 'Försäkring och pensionsfondverksamhet' },
  { code: 'K66', label: 'Stödtjänster till finansiella tjänster' },
  // L – Fastighetsverksamhet
  { code: 'L68', label: 'Fastighetsverksamhet' },
  // M – Professionell, vetenskaplig och teknisk verksamhet
  { code: 'M69', label: 'Juridisk och ekonomisk konsultverksamhet' },
  { code: 'M70', label: 'Verksamhet vid huvudkontor och managementkonsulter' },
  { code: 'M71', label: 'Arkitekt- och teknikkonsultverksamhet' },
  { code: 'M72', label: 'Forskning och utveckling' },
  { code: 'M73', label: 'Reklam och marknadsundersökning' },
  { code: 'M74', label: 'Annan professionell och teknisk verksamhet' },
  { code: 'M75', label: 'Veterinärverksamhet' },
  // N – Uthyrning, fastighetsservice och resetjänster
  { code: 'N77', label: 'Uthyrning och leasing' },
  { code: 'N78', label: 'Arbetsförmedling och bemanning' },
  { code: 'N79', label: 'Resebyråer och researrangörer' },
  { code: 'N80', label: 'Säkerhetsverksamhet' },
  { code: 'N81', label: 'Fastighetsservice och skötsel' },
  { code: 'N82', label: 'Kontorstjänster och övriga stödtjänster' },
  // O – Offentlig förvaltning och försvar
  { code: 'O84', label: 'Offentlig förvaltning och försvar' },
  // P – Utbildning
  { code: 'P85', label: 'Utbildning' },
  // Q – Vård och omsorg
  { code: 'Q86', label: 'Hälso- och sjukvård' },
  { code: 'Q87', label: 'Vård och omsorg med boende' },
  { code: 'Q88', label: 'Öppen socialtjänst' },
  // R – Kultur, nöje och fritid
  { code: 'R90', label: 'Konstnärlig och kulturell verksamhet' },
  { code: 'R91', label: 'Bibliotek, arkiv, museer' },
  { code: 'R92', label: 'Spel och vadhållning' },
  { code: 'R93', label: 'Sport, fritids- och nöjesverksamhet' },
  // S – Annan serviceverksamhet
  { code: 'S94', label: 'Intresseorganisationer och föreningar' },
  { code: 'S95', label: 'Reparation av datorer och personliga artiklar' },
  { code: 'S96', label: 'Annan personlig serviceverksamhet' },
];

export function searchSni(query: string): SniEntry[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return SNI_DATA.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q)
  ).slice(0, 8);
}
