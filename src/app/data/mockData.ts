
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export interface Provider {
  id: string;
  name: string;
  type: 'university' | 'private';
  description: string;
  logo?: string;
}

export interface CourseStart {
  id: string;
  startDate: string;
  applicationDeadline: string;
  credits: number;
  durationWeeks: number;
  format: 'online' | 'onsite' | 'hybrid';
  maxParticipants: number;
  availableSpots: number;
  price: number;
  admissionRequirements: string;
  language: string;
  location?: string;
  status: 'open' | 'few_spots' | 'full' | 'upcoming';
}

export interface Instructor {
  name: string;
  title: string;
  bio: string;
  imageUrl?: string;
}

export interface Training {
  id: string;
  title: string;
  description: string;
  courseCode?: string;
  providerId: string;
  categoryId: string;
  format: 'online' | 'onsite' | 'hybrid';
  duration: string;
  credits: number;
  targetAudience: string;
  featured: boolean;
  views: number;
  leads: number;
  imageUrl: string;
  // New fields
  trainingType: 'custom' | 'scheduled' | 'both';
  isPopular?: boolean;
  learningOutcomes?: string[];
  curriculum?: { title: string; topics: string[] }[];
  instructor?: Instructor;
  scheduledStarts?: CourseStart[];
  contactPerson?: {
    name: string;
    title: string;
    email: string;
    phone: string;
    responseTime: string;
  };
  faq?: { question: string; answer: string }[];
}

export interface Lead {
  id: string;
  trainingId?: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  description: string;
  budget?: string;
  timeline: string;
  aiSummary: string;
  aiScore: 'high' | 'medium' | 'low';
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  createdAt: string;
}

export const categories: Category[] = [
  { id: '1', name: 'Ledarskap', slug: 'ledarskap', description: 'Ledarutveckling och chefsutbildning' },
  { id: '2', name: 'AI & Teknik', slug: 'ai-teknik', description: 'Artificiell intelligens och teknikkompetens' },
  { id: '3', name: 'HR & Personal', slug: 'hr-personal', description: 'Personal och HR-utveckling' },
  { id: '4', name: 'Hälsa & Vård', slug: 'halsa-vard', description: 'Utbildning för vård och omsorg' },
  { id: '5', name: 'Offentlig Sektor', slug: 'offentlig-sektor', description: 'Utbildning för myndigheter och kommuner' },
  { id: '6', name: 'Industri & Tillverkning', slug: 'industri', description: 'Industriell kompetens och tillverkning' },
  { id: '7', name: 'Hållbarhet', slug: 'hallbarhet', description: 'Hållbarhet och miljöutbildning' },
  { id: '8', name: 'Digital Transformation', slug: 'digital-transformation', description: 'Digital transformation och innovation' }
];

export const providers: Provider[] = [
  {
    id: '1',
    name: 'Handelshögskolan i Stockholm',
    type: 'university',
    description: 'Ledande nordisk handelshögskola med uppdragsutbildningar inom ledarskap, strategi och HR för chefer och organisationer.'
  },
  {
    id: '2',
    name: 'Karolinska Institutet',
    type: 'university',
    description: 'Ett av världens ledande medicinska universitet, med specialiserade uppdragsutbildningar inom hälsa, vård och medicinsk ledarskap.'
  },
  {
    id: '3',
    name: 'Lunds Universitet',
    type: 'university',
    description: 'Skandinaviens bredaste forskningsuniversitet med uppdragsutbildningar inom hållbarhet, innovation och tvärvetenskapliga ledarprogram.'
  },
  {
    id: '4',
    name: 'Uppsala Universitet',
    type: 'university',
    description: 'Nordens äldsta universitet med starka program inom offentlig förvaltning, HR, ledarskap och samhällsvetenskap.'
  },
  {
    id: '5',
    name: 'Linköpings Universitet',
    type: 'university',
    description: 'Ledande inom AI, maskininlärning och digital transformation med uppdragsutbildningar anpassade för näringsliv och offentlig sektor.'
  },
  {
    id: '6',
    name: 'Luleå Tekniska Universitet',
    type: 'university',
    description: 'Tekniskt profiluniversitet med stark industrikoppling och uppdragsutbildningar inom produktion, teknikledning och innovation.'
  },
  {
    id: '7',
    name: 'KTH Kungliga Tekniska Högskolan',
    type: 'university',
    description: 'Sveriges ledande tekniska universitet med ett brett utbud av digitala uppdragsutbildningar inom beteendevetenskap, psykologi och lärande – helt på distans och flexibelt upplagda för yrkesverksamma.'
  }
];

export const trainings: Training[] = [
  {
    id: '1',
    title: 'Ledarskapsprogram för Chefer',
    courseCode: 'SSE7110',
    description: 'Omfattande ledarutveckling för högre chefer. Lär dig strategiskt tänkande, organisatoriskt ledarskap och förändringshantering. Inkluderar fallstudier, erfarenhetsutbyte och praktiska övningar.',
    providerId: '1',
    categoryId: '1',
    format: 'hybrid',
    duration: '12 veckor',
    credits: 30,
    targetAudience: 'Ledande befattningshavare och C-level chefer med minst 5 års erfarenhet.',
    featured: true,
    views: 456,
    leads: 23,
    imageUrl: 'https://images.unsplash.com/photo-1776039325240-02916820bfeb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'both',
    isPopular: true,
    learningOutcomes: [
      'Utveckla ett strategiskt ledarskap som skapar långsiktig affärsnytta',
      'Leda och driva organisatorisk förändring med hög genomförandeförmåga',
      'Bygga högpresterande team och stärka organisationskulturen',
      'Tillämpa evidensbaserade metoder för beslutsfattande under osäkerhet',
      'Nätverka med chefer från ledande svenska och nordiska organisationer',
      'Erhålla internationellt erkänt certifikat från Handelshögskolan'
    ],
    curriculum: [
      { title: 'Modul 1 – Strategiskt ledarskap', topics: ['Strategiutveckling och affärsmodeller', 'Konkurrensanalys och positionering', 'Strategisk kommunikation'] },
      { title: 'Modul 2 – Organisationsutveckling', topics: ['Förändringshantering och motstånd', 'Kulturbyggande och värderingar', 'Organisationsdesign'] },
      { title: 'Modul 3 – Ledarskap och beteende', topics: ['Psykologisk trygghet', 'Feedback och coaching', 'Konflikthantering'] },
      { title: 'Modul 4 – Finansiellt ledarskap', topics: ['Resultatansvar och budgetering', 'Investeringsbeslut', 'Prestationsmätning'] }
    ],
    instructor: {
      name: 'Prof. Anna Lindqvist',
      title: 'Professor i Organisationsbeteende, SSE',
      bio: 'Anna Lindqvist är professor vid Handelshögskolan med 20 års erfarenhet av ledarskapsforskning och executive education. Hon har arbetat med hundratals chefer från Nordens ledande organisationer.',
    },
    contactPerson: {
      name: 'Erik Palmgren',
      title: 'Uppdragsansvarig, SSE Executive Education',
      email: 'erik.palmgren@hhs.se',
      phone: '+46 8 736 92 00',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    scheduledStarts: [
      {
        id: 's1-1',
        startDate: '2026-09-14',
        applicationDeadline: '2026-08-14',
        credits: 30,
        durationWeeks: 12,
        format: 'hybrid',
        maxParticipants: 30,
        availableSpots: 8,
        price: 89500,
        admissionRequirements: 'Minst 5 års ledarerfarenhet och akademisk examen eller motsvarande',
        language: 'Svenska',
        location: 'SSE Campus, Stockholm',
        status: 'few_spots'
      },
      {
        id: 's1-2',
        startDate: '2027-01-19',
        applicationDeadline: '2026-12-01',
        credits: 30,
        durationWeeks: 12,
        format: 'hybrid',
        maxParticipants: 30,
        availableSpots: 30,
        price: 89500,
        admissionRequirements: 'Minst 5 års ledarerfarenhet och akademisk examen eller motsvarande',
        language: 'Svenska',
        location: 'SSE Campus, Stockholm',
        status: 'upcoming'
      }
    ],
    faq: [
      { question: 'Kan utbildningen anpassas till vår organisations specifika behov?', answer: 'Ja, vi erbjuder skräddarsydda versioner av programmet för organisationer med 10+ deltagare. Kontakta oss för en behovsanalys.' },
      { question: 'Vilka förkunskaper krävs?', answer: 'Du behöver minst 5 års erfarenhet av ledarskap på mellanchefsnivå eller högre. Ingen specifik akademisk bakgrund krävs.' },
      { question: 'Leder programmet till en examen?', answer: 'Kursen ger 30 högskolepoäng och ett intyg från Handelshögskolan i Stockholm som är internationellt erkänt.' },
      { question: 'Hur genomförs undervisningen?', answer: 'Hybridformat med fysiska samlingar i Stockholm varannan vecka samt digital inlärning mellan tillfällena.' }
    ]
  },
  {
    id: '2',
    title: 'AI för Företagsledare',
    courseCode: 'TDEI31',
    description: 'Förstå AI-teknologi och affärstillämpningar. Lär dig implementera AI-strategier, utvärdera AI-projekt och leda digital transformation. Ingen teknisk bakgrund krävs.',
    providerId: '5',
    categoryId: '2',
    format: 'online',
    duration: '6 veckor',
    credits: 15,
    targetAudience: 'Chefer och företagsledare utan teknisk bakgrund som vill förstå och leda AI-transformation.',
    featured: true,
    views: 892,
    leads: 45,
    imageUrl: 'https://images.unsplash.com/photo-1758691736498-422201cc57da?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'scheduled',
    isPopular: true,
    learningOutcomes: [
      'Förstå hur AI och maskininlärning fungerar utan teknisk bakgrund',
      'Identifiera affärsmöjligheter och riskområden med AI i din organisation',
      'Leda AI-implementeringsprojekt från idé till resultat',
      'Utvärdera AI-lösningar och ställa rätt krav på leverantörer',
      'Navigera etiska och regulatoriska aspekter av AI-användning',
      'Bygga en AI-roadmap för din organisation'
    ],
    curriculum: [
      { title: 'Vecka 1–2 – AI-grunder för ledare', topics: ['Vad är AI, ML och generativ AI?', 'Affärscase och ROI-modeller', 'AI-mognad i organisationer'] },
      { title: 'Vecka 3–4 – Strategi och implementation', topics: ['AI-strategi och roadmap', 'Datainfrastruktur och förutsättningar', 'Change management för AI'] },
      { title: 'Vecka 5–6 – Etik, risk och framtid', topics: ['AI-etik och ansvarsfull AI', 'EU AI Act och regulatorisk compliance', 'Framtidsscenarier och trender'] }
    ],
    instructor: {
      name: 'Dr. Marcus Engström',
      title: 'Docent i Datavetenskap & AI, Linköpings Universitet',
      bio: 'Marcus Engström forskar om AI-implementation i organisationer och har undervisat chefer och ledare på alla nivåer i hur AI kan skapa konkret affärsnytta.'
    },
    contactPerson: {
      name: 'Sofia Karlsson',
      title: 'Programkoordinator, LiU Executive',
      email: 'sofia.karlsson@liu.se',
      phone: '+46 13 281 000',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    scheduledStarts: [
      {
        id: 's2-1',
        startDate: '2026-06-08',
        applicationDeadline: '2026-05-20',
        credits: 15,
        durationWeeks: 6,
        format: 'online',
        maxParticipants: 50,
        availableSpots: 4,
        price: 24900,
        admissionRequirements: 'Yrkeserfarenhet på ledningsnivå, ingen teknisk bakgrund krävs',
        language: 'Svenska',
        status: 'few_spots'
      },
      {
        id: 's2-2',
        startDate: '2026-09-07',
        applicationDeadline: '2026-08-17',
        credits: 15,
        durationWeeks: 6,
        format: 'online',
        maxParticipants: 50,
        availableSpots: 50,
        price: 24900,
        admissionRequirements: 'Yrkeserfarenhet på ledningsnivå, ingen teknisk bakgrund krävs',
        language: 'Svenska',
        status: 'open'
      },
      {
        id: 's2-3',
        startDate: '2027-01-12',
        applicationDeadline: '2026-12-08',
        credits: 15,
        durationWeeks: 6,
        format: 'online',
        maxParticipants: 50,
        availableSpots: 50,
        price: 24900,
        admissionRequirements: 'Yrkeserfarenhet på ledningsnivå, ingen teknisk bakgrund krävs',
        language: 'Svenska',
        status: 'upcoming'
      }
    ],
    faq: [
      { question: 'Behöver jag ha teknisk bakgrund?', answer: 'Nej, kursen är designad specifikt för icke-tekniska ledare. Fokus ligger på strategi, ledarskap och affärsnytta.' },
      { question: 'Hur mycket tid tar kursen per vecka?', answer: 'Räkna med 6–8 timmar per vecka för inspelade föreläsningar, läsning och uppgifter. Allt är flexibelt och tillgängligt online 24/7.' },
      { question: 'Finns det live-sessioner?', answer: 'Ja, vi har 2 live Q&A-sessioner per modul via Zoom. Dessa spelas in om du inte kan delta.' }
    ]
  },
  {
    id: '3',
    title: 'Strategisk HR-ledning',
    courseCode: 'SSE7120',
    description: 'Modern HR-praktik för strategisk personalledning. Ämnen inkluderar talangrekrytering, prestationshantering, medarbetarengagemang och organisationskultur.',
    providerId: '1',
    categoryId: '3',
    format: 'hybrid',
    duration: '8 veckor',
    credits: 15,
    targetAudience: 'HR-specialister och chefer',
    featured: false,
    views: 234,
    leads: 12,
    imageUrl: 'https://images.unsplash.com/photo-1573167691330-597fd91bc6c7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Maja Björk',
      title: 'Uppdragsansvarig, SSE Executive Education',
      email: 'maja.bjork@hhs.se',
      phone: '+46 8 736 92 10',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    learningOutcomes: [
      'Designa och implementera strategiska HR-processer',
      'Attrahera och behålla talanger i en konkurrensutsatt marknad',
      'Använda data och analys för bättre HR-beslut',
      'Skapa en stark organisationskultur och medarbetarengagemang',
      'Hantera komplexa arbetsrättsliga frågor'
    ],
    faq: [
      { question: 'Passar programmet för mindre organisationer?', answer: 'Ja, vi anpassar innehåll och scope utifrån er organisationsstorlek och behov.' },
      { question: 'Hur lång tid tar det från offert till start?', answer: 'Normalt 4–8 veckor från behovsanalys till programstart.' }
    ]
  },
  {
    id: '4',
    title: 'Digital Transformation inom Vården',
    courseCode: 'KI7601',
    description: 'Navigera digitala förändringar i vårdorganisationer. Lär dig om hälsoteknik, patientcentrerade digitala tjänster och hantera transformation i reglerade miljöer.',
    providerId: '2',
    categoryId: '4',
    format: 'onsite',
    duration: '4 veckor',
    credits: 7.5,
    targetAudience: 'Vårdchefer och administratörer',
    featured: true,
    views: 567,
    leads: 34,
    imageUrl: 'https://images.unsplash.com/photo-1758691737467-fe12934ddc58?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Dr. Helena Ström',
      title: 'Uppdragsansvarig, KI Uppdragsutbildning',
      email: 'helena.strom@ki.se',
      phone: '+46 8 524 800 00',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    learningOutcomes: [
      'Förstå och leda digitala transformationsprocesser inom vård',
      'Implementera patientcentrerade digitala tjänster',
      'Navigera regulatoriska krav och dataskydd i vårdsektorn',
      'Skapa digital motståndskraft i vårdorganisationer'
    ],
    faq: [
      { question: 'Kan utbildningen genomföras på vår arbetsplats?', answer: 'Ja, vi erbjuder genomförande på er arbetsplats eller vid KI i Solna.' }
    ]
  },
  {
    id: '5',
    title: 'Innovationsledning',
    courseCode: 'MTM270',
    description: 'Driv innovation i din organisation. Lär dig ramverk för innovation, design thinking, agila metoder och hur man bygger en innovationskultur.',
    providerId: '6',
    categoryId: '8',
    format: 'hybrid',
    duration: '10 veckor',
    credits: 22.5,
    targetAudience: 'Innovationschefer och teamledare',
    featured: false,
    views: 345,
    leads: 18,
    imageUrl: 'https://images.unsplash.com/photo-1745847768382-816bfc32e1bb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Johan Nordström',
      title: 'Uppdragskoordinator, LTU',
      email: 'johan.nordstrom@ltu.se',
      phone: '+46 920 491 000',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    learningOutcomes: [
      'Implementera strukturerade innovationsprocesser',
      'Leda design thinking-workshops och kreativa processer',
      'Bygga en hållbar innovationskultur',
      'Mäta och följa upp innovationsresultat'
    ],
    faq: [
      { question: 'Ingår praktiska övningar?', answer: 'Ja, stor del av kursen är handlingsorienterad med verkliga case från er organisation.' }
    ]
  },
  {
    id: '6',
    title: 'Hållbara Affärsstrategier',
    courseCode: 'FKAA10',
    description: 'Integrera hållbarhet i din affärsmodell. Täcker ESG-ramverk, cirkulär ekonomi, hållbara leveranskedjor och rapporteringsstandarder.',
    providerId: '3',
    categoryId: '7',
    format: 'online',
    duration: '6 veckor',
    credits: 15,
    targetAudience: 'Hållbarhetschefer och ledning med ansvar för ESG och hållbarhetsstrategi.',
    featured: false,
    views: 678,
    leads: 29,
    imageUrl: 'https://images.unsplash.com/photo-1653566031486-dc4ead13a35d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'both',
    isPopular: true,
    learningOutcomes: [
      'Integrera hållbarhet som strategisk konkurrensfördel',
      'Implementera ESG-ramverk och rapporteringsstandarder (GRI, CSRD)',
      'Designa hållbara affärsmodeller och värdekedjor',
      'Kommunicera hållbarhetsarbete till investerare och intressenter',
      'Identifiera och hantera hållbarhetsrelaterade affärsrisker'
    ],
    curriculum: [
      { title: 'Del 1 – Hållbarhet som strategi', topics: ['ESG och affärsvärde', 'Cirkulär ekonomi', 'Klimatriskanalys'] },
      { title: 'Del 2 – Ramverk och rapportering', topics: ['GRI-standarder', 'EU Taxonomin', 'CSRD-compliance'] },
      { title: 'Del 3 – Implementation', topics: ['Hållbar supply chain', 'Stakeholder management', 'Kommunikation och transparens'] }
    ],
    instructor: {
      name: 'Prof. Karin Persson',
      title: 'Professor i Hållbar Företagsstrategi, Lunds Universitet',
      bio: 'Karin Persson är en av Sveriges ledande experter på hållbar affärsutveckling och har rådgivit flertalet börsnoterade bolag i deras hållbarhetsomställning.'
    },
    contactPerson: {
      name: 'Anders Holm',
      title: 'Uppdragsansvarig, Lunds Universitets Uppdragsutbildning',
      email: 'anders.holm@lu.se',
      phone: '+46 46 222 00 00',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    scheduledStarts: [
      {
        id: 's6-1',
        startDate: '2026-09-21',
        applicationDeadline: '2026-08-24',
        credits: 15,
        durationWeeks: 6,
        format: 'online',
        maxParticipants: 40,
        availableSpots: 0,
        price: 19900,
        admissionRequirements: 'Yrkeserfarenhet inom hållbarhet, ekonomi eller ledarskap',
        language: 'Svenska',
        status: 'full'
      },
      {
        id: 's6-2',
        startDate: '2027-02-01',
        applicationDeadline: '2027-01-04',
        credits: 15,
        durationWeeks: 6,
        format: 'online',
        maxParticipants: 40,
        availableSpots: 40,
        price: 19900,
        admissionRequirements: 'Yrkeserfarenhet inom hållbarhet, ekonomi eller ledarskap',
        language: 'Svenska',
        status: 'upcoming'
      }
    ],
    faq: [
      { question: 'Är kursen relevant för alla branscher?', answer: 'Ja, hållbarhetsprinciperna är universella men vi arbetar med case från er specifika bransch.' },
      { question: 'Kan vi ta kursen som organisation?', answer: 'Absolut. Vi erbjuder skräddarsydda versioner för organisationer om ni är 8+ deltagare.' }
    ]
  },
  {
    id: '7',
    title: 'Ledarskap i Offentlig Sektor',
    courseCode: '2FE501',
    description: 'Ledarskap i offentliga organisationer. Lär dig om offentlig förvaltning, intressenthantering, policyimplementering och ledarskap i komplexa politiska miljöer.',
    providerId: '4',
    categoryId: '5',
    format: 'onsite',
    duration: '8 veckor',
    credits: 15,
    targetAudience: 'Offentliga chefer och ledare',
    featured: false,
    views: 189,
    leads: 8,
    imageUrl: 'https://images.unsplash.com/photo-1758691737124-05c5bffe46f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Lisa Westerberg',
      title: 'Uppdragsansvarig, Uppsala Universitets Uppdragsutbildning',
      email: 'lisa.westerberg@uu.se',
      phone: '+46 18 471 00 00',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    learningOutcomes: [
      'Leda effektivt inom komplexa politiska och administrativa strukturer',
      'Hantera flera intressenter med motstridiga krav',
      'Implementera policy och förändringar i offentlig sektor',
      'Bygga tillit och legitimitet som offentlig ledare'
    ],
    faq: [
      { question: 'Är programmet erkänt av arbetsgivarverket?', answer: 'Ja, programmet är väl etablerat och genomfört av flera statliga myndigheter och kommuner.' }
    ]
  },
  {
    id: '8',
    title: 'Maskininlärning för Chefer',
    courseCode: 'TDEI32',
    description: 'Praktisk ML-förståelse för företagsledare. Lär dig när ML ska användas, hur man avgränsar projekt, samarbetar med datavetare och mäter ROI.',
    providerId: '5',
    categoryId: '2',
    format: 'online',
    duration: '5 veckor',
    credits: 7.5,
    targetAudience: 'Chefer och beslutsfattare',
    featured: true,
    views: 723,
    leads: 38,
    imageUrl: 'https://images.unsplash.com/photo-1581090698603-a8a626ffdc14?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'both',
    contactPerson: {
      name: 'Sofia Karlsson',
      title: 'Programkoordinator, LiU Executive',
      email: 'sofia.karlsson@liu.se',
      phone: '+46 13 281 000',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    learningOutcomes: [
      'Förstå grundläggande ML-koncept utan matematisk bakgrund',
      'Identifiera rätt problem för ML-lösningar',
      'Samarbeta effektivt med datavetare och ingenjörer',
      'Mäta och kommunicera ROI för ML-projekt'
    ],
    scheduledStarts: [
      {
        id: 's8-1',
        startDate: '2026-08-17',
        applicationDeadline: '2026-07-20',
        credits: 7.5,
        durationWeeks: 5,
        format: 'online',
        maxParticipants: 60,
        availableSpots: 22,
        price: 14900,
        admissionRequirements: 'Chefsbefattning eller strategisk roll, ingen teknisk bakgrund krävs',
        language: 'Svenska',
        status: 'open'
      }
    ],
    faq: [
      { question: 'Skiljer sig kursen från AI för Företagsledare?', answer: 'Ja, denna kurs går djupare på maskininlärning specifikt och är mer tekniskt orienterad (utan att kräva kodkunskaper).' }
    ]
  },
  {
    id: '9',
    title: 'Avancerad Produktionsledning',
    courseCode: 'MTM271',
    description: 'Modern produktionsledning och Industri 4.0. Ämnen inkluderar lean manufacturing, automation, supply chain-optimering och digitala fabrikskoncept.',
    providerId: '6',
    categoryId: '6',
    format: 'hybrid',
    duration: '7 veckor',
    credits: 15,
    targetAudience: 'Produktionschefer och ingenjörer',
    featured: false,
    views: 412,
    leads: 21,
    imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Johan Nordström',
      title: 'Uppdragskoordinator, LTU',
      email: 'johan.nordstrom@ltu.se',
      phone: '+46 920 491 000',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    learningOutcomes: [
      'Implementera Lean och Industri 4.0 i produktionsmiljö',
      'Optimera supply chain och lagerhantering',
      'Leda automation och digitaliseringsinitiativ',
      'Mäta och förbättra produktionseffektivitet (OEE)'
    ],
    faq: [
      { question: 'Kan vi genomföra utbildningen i vår fabrik?', answer: 'Ja, vi erbjuder on-site genomförande och kan integrera era egna produktionscase.' }
    ]
  },
  {
    id: '10',
    title: 'Att Leda Förändringar',
    courseCode: '2FE502',
    description: 'Bemästra organisatorisk förändringshantering. Lär dig förändringsmodeller, intressentengagemang, kommunikationsstrategier och övervinna motstånd.',
    providerId: '4',
    categoryId: '1',
    format: 'hybrid',
    duration: '6 veckor',
    credits: 15,
    targetAudience: 'Chefer som leder förändringsprojekt',
    featured: false,
    views: 534,
    leads: 27,
    imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Lisa Westerberg',
      title: 'Uppdragsansvarig, Uppsala Universitets Uppdragsutbildning',
      email: 'lisa.westerberg@uu.se',
      phone: '+46 18 471 00 00',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    learningOutcomes: [
      'Tillämpa evidensbaserade förändringsmodeller (Kotter, ADKAR)',
      'Skapa engagemang och övervinna motstånd',
      'Kommunicera förändring tydligt och övertygande',
      'Mäta och säkra varaktig förändring'
    ],
    faq: [
      { question: 'Hur skiljer sig detta från ett generellt ledarskapsprogram?', answer: 'Kursen fokuserar specifikt på förändringshantering och är mycket praktisk med verkliga case.' }
    ]
  },
  {
    id: '11',
    title: 'Datadriven HR-analys',
    courseCode: 'SSE7121',
    description: 'Använd data och analys för bättre HR-beslut. Lär dig personalanalys, prediktiva modeller och hur man bygger en evidensbaserad HR-funktion.',
    providerId: '1',
    categoryId: '3',
    format: 'online',
    duration: '4 veckor',
    credits: 7.5,
    targetAudience: 'HR-specialister och analytiker',
    featured: false,
    views: 298,
    leads: 14,
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Maja Björk',
      title: 'Uppdragsansvarig, SSE Executive Education',
      email: 'maja.bjork@hhs.se',
      phone: '+46 8 736 92 10',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    learningOutcomes: [
      'Samla in och analysera HR-data effektivt',
      'Bygga prediktiva modeller för personalplanering',
      'Visualisera och kommunicera HR-insikter till ledningen',
      'Implementera en datadriven HR-funktion'
    ],
    faq: [
      { question: 'Behöver jag kunna koda?', answer: 'Nej, kursen fokuserar på analys och tolkning snarare än programmering.' }
    ]
  },
  {
    id: '12',
    title: 'Strategisk Teknikledning',
    courseCode: 'MTM272',
    description: 'Anpassa teknologi med affärsstrategi. Lär dig IT-styrning, investeringsbeslut, digitala plattformar och ledning av tekniska team.',
    providerId: '6',
    categoryId: '8',
    format: 'hybrid',
    duration: '9 veckor',
    credits: 22.5,
    targetAudience: 'CTO:er, IT-chefer och teknikledare',
    featured: false,
    views: 645,
    leads: 31,
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'custom',
    contactPerson: {
      name: 'Johan Nordström',
      title: 'Uppdragskoordinator, LTU',
      email: 'johan.nordstrom@ltu.se',
      phone: '+46 920 491 000',
      responseTime: 'Svar inom 2 arbetsdagar'
    },
    learningOutcomes: [
      'Anpassa IT-strategi med övergripande affärsstrategi',
      'Fatta välgrundade teknikinvesteringsbeslut',
      'Leda och motivera tekniska team',
      'Styra digitala transformationsprogram'
    ],
    faq: [
      { question: 'Riktar sig programmet till icke-tekniska ledare?', answer: 'Programmet passar både tekniska och icke-tekniska ledare med ansvar för teknologifrågor.' }
    ]
  },
  {
    id: '13',
    title: 'Miljöpsykologi och beteendedesign',
    courseCode: 'LD1002',
    description: 'Vårt klimat förändras. I den här kursen tränar du dig i att förstå, analysera och förändra beteenden som påverkar miljön. Du lär dig använda beteendeinsikter för att skapa verklig förändring – och tar fram en konkret beteendeplan för din verksamhet redan under kursen.',
    providerId: '7',
    categoryId: '7',
    format: 'online',
    duration: '4 veckor',
    credits: 4,
    targetAudience: 'Yrkesverksamma inom hållbarhet, kommunikation, ledarskap eller policy',
    featured: true,
    views: 312,
    leads: 19,
    imageUrl: 'https://images.unsplash.com/photo-1770146247162-82372c506f8e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'scheduled',
    isPopular: true,
    learningOutcomes: [
      'Förstå och tillämpa beteendevetenskapliga modeller för miljöbeteende',
      'Analysera beteendebarriärer och möjliggörare i din organisation',
      'Designa effektiva beteendeinterventioner',
      'Ta fram en konkret beteendeplan för din verksamhet'
    ],
    curriculum: [
      { title: 'Vecka 1 – Beteende och miljö', topics: ['Miljöpsykologins grunder', 'Beteendemodeller', 'Identifiera målbeteenden'] },
      { title: 'Vecka 2 – Analys och insikter', topics: ['Beteendeanalys', 'Hinderbedömning', 'Nudging och design'] },
      { title: 'Vecka 3 – Intervention och design', topics: ['Interventionsdesign', 'Kommunikationsstrategi', 'Mätning och uppföljning'] },
      { title: 'Vecka 4 – Beteendeplan', topics: ['Praktisk tillämpning', 'Presentation av beteendeplan', 'Peer review'] }
    ],
    instructor: {
      name: 'Dr. Ingrid Carlsson',
      title: 'Lektor i Beteendevetenskap, KTH',
      bio: 'Ingrid Carlsson är beteendeforskare med fokus på miljöpsykologi och har utvecklat denna kurs i samarbete med KTH:s klimatforskningscentrum.'
    },
    contactPerson: {
      name: 'Anna Lindberg',
      title: 'Programansvarig, KTH Executive',
      email: 'anna.lindberg@kth.se',
      phone: '+46 8 790 60 00',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    scheduledStarts: [
      {
        id: 's13-1',
        startDate: '2026-09-19',
        applicationDeadline: '2026-08-19',
        credits: 4,
        durationWeeks: 4,
        format: 'online',
        maxParticipants: 30,
        availableSpots: 8,
        price: 12900,
        admissionRequirements: 'Yrkeserfarenhet inom hållbarhet',
        language: 'Svenska',
        status: 'few_spots'
      },
      {
        id: 's13-2',
        startDate: '2027-01-26',
        applicationDeadline: '2026-12-15',
        credits: 4,
        durationWeeks: 4,
        format: 'online',
        maxParticipants: 30,
        availableSpots: 30,
        price: 12900,
        admissionRequirements: 'Yrkeserfarenhet inom hållbarhet',
        language: 'Svenska',
        status: 'upcoming'
      }
    ],
    faq: [
      { question: 'Hur flexibel är kursen?', answer: 'Kursen är helt online och asynkron – du studerar i din egen takt inom kursperioden.' },
      { question: 'Leder kursen till poäng?', answer: 'Ja, kursen ger 4 högskolepoäng från KTH Kungliga Tekniska Högskolan.' }
    ]
  },
  {
    id: '14',
    title: 'Psykologi och kritiskt tänkande',
    courseCode: 'LD1004',
    description: 'Att kunna tolka och analysera nyhetsflöden, rapporter och forskning är avgörande för att fatta långsiktigt riktiga beslut. I den här kursen lär du dig hur kognitiva tankefällor påverkar bedömningar och hur du identifierar strategier för att hantera dem.',
    providerId: '7',
    categoryId: '3',
    format: 'online',
    duration: '2 veckor',
    credits: 2,
    targetAudience: 'Yrkesverksamma, studenter och andra som vill förstå informationsflöden och fatta bättre beslut',
    featured: false,
    views: 278,
    leads: 14,
    imageUrl: 'https://images.unsplash.com/photo-1607428122688-c0912ef0a671?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'scheduled',
    contactPerson: {
      name: 'Anna Lindberg',
      title: 'Programansvarig, KTH Executive',
      email: 'anna.lindberg@kth.se',
      phone: '+46 8 790 60 00',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    learningOutcomes: [
      'Identifiera vanliga kognitiva biaser och tankefällor',
      'Kritiskt granska information, rapporter och forskning',
      'Fatta mer välgrundade beslut under osäkerhet',
      'Kommunicera analytiska slutsatser tydligare'
    ],
    scheduledStarts: [
      {
        id: 's14-1',
        startDate: '2026-06-15',
        applicationDeadline: '2026-06-01',
        credits: 2,
        durationWeeks: 2,
        format: 'online',
        maxParticipants: 100,
        availableSpots: 45,
        price: 5900,
        admissionRequirements: 'Ingen formell behörighet krävs',
        language: 'Svenska',
        status: 'open'
      }
    ],
    faq: [
      { question: 'Kan kursen ingå i ett företagsavtal?', answer: 'Ja, vi erbjuder volymrabatter för organisationer som köper 10+ platser.' }
    ]
  },
  {
    id: '15',
    title: 'Digitala presentationer och video i undervisningen',
    courseCode: 'LD1005',
    description: 'Kursen ger dig förståelse för hur multimedia kan användas som verktyg för att förbättra lärande. Leds av erfarna mediapedagoger och forskare – du får handfasta råd och teoretisk bakgrund kring hur studenter bearbetar och lär sig via multimedialt material.',
    providerId: '7',
    categoryId: '8',
    format: 'online',
    duration: '2 veckor',
    credits: 2,
    targetAudience: 'Lärare och yrkesverksamma som vill skapa engagerande och effektiva multimedieupplevelser',
    featured: false,
    views: 195,
    leads: 9,
    imageUrl: 'https://images.unsplash.com/photo-1758272421523-9b2a777083ef?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'scheduled',
    contactPerson: {
      name: 'Anna Lindberg',
      title: 'Programansvarig, KTH Executive',
      email: 'anna.lindberg@kth.se',
      phone: '+46 8 790 60 00',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    learningOutcomes: [
      'Skapa effektiva digitala presentationer och videor för lärande',
      'Tillämpa multimedieprinciper och kognitiv lärteori',
      'Producera engagerande lärandematerial med enkla verktyg',
      'Utvärdera och förbättra multimedieinnehåll'
    ],
    scheduledStarts: [
      {
        id: 's15-1',
        startDate: '2026-08-10',
        applicationDeadline: '2026-07-27',
        credits: 2,
        durationWeeks: 2,
        format: 'online',
        maxParticipants: 80,
        availableSpots: 55,
        price: 5900,
        admissionRequirements: 'Ingen formell behörighet krävs',
        language: 'Svenska',
        status: 'open'
      }
    ],
    faq: []
  },
  {
    id: '16',
    title: 'Nudging och beslutsfattande',
    courseCode: 'LD1008',
    description: 'Att göra det lätt att välja rätt – går det? I den här kursen lär du dig om vad som påverkar beslutsfattande och hur du kan använda nudging som verktyg för att förbättra både dina egna och andras beslut. Bygger på forskning inom kognitionspsykologi, socialpsykologi och beteendeekonomi.',
    providerId: '7',
    categoryId: '1',
    format: 'online',
    duration: '4 veckor',
    credits: 4,
    targetAudience: 'Yrkesverksamma, studenter och andra som vill förstå och påverka beslutsfattande',
    featured: true,
    views: 489,
    leads: 27,
    imageUrl: 'https://images.unsplash.com/photo-1716840646010-e5622fd6683d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'scheduled',
    isPopular: true,
    learningOutcomes: [
      'Förstå de psykologiska mekanismerna bakom beslutsfattande',
      'Designa och implementera effektiva nudges',
      'Tillämpa beteendeekonomiska insikter i praktiken',
      'Utvärdera och mäta effekten av nudginginterventioner'
    ],
    curriculum: [
      { title: 'Vecka 1–2 – Beslutsfattandets psykologi', topics: ['System 1 och System 2', 'Kognitiva biaser', 'Beslutsarkitektur'] },
      { title: 'Vecka 3–4 – Nudging i praktiken', topics: ['Designa effektiva nudges', 'Etiska överväganden', 'Mätning och uppföljning'] }
    ],
    instructor: {
      name: 'Dr. Ingrid Carlsson',
      title: 'Lektor i Beteendevetenskap, KTH',
      bio: 'Ingrid Carlsson är beteendeforskare med fokus på beslutsfattande och har undervisat kurser i beteendeekonomi vid KTH sedan 2018.'
    },
    contactPerson: {
      name: 'Anna Lindberg',
      title: 'Programansvarig, KTH Executive',
      email: 'anna.lindberg@kth.se',
      phone: '+46 8 790 60 00',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    scheduledStarts: [
      {
        id: 's16-1',
        startDate: '2026-09-19',
        applicationDeadline: '2026-08-19',
        credits: 4,
        durationWeeks: 4,
        format: 'online',
        maxParticipants: 30,
        availableSpots: 8,
        price: 12900,
        admissionRequirements: 'Ingen formell behörighet krävs',
        language: 'Svenska',
        status: 'few_spots'
      },
      {
        id: 's16-2',
        startDate: '2027-02-08',
        applicationDeadline: '2027-01-18',
        credits: 4,
        durationWeeks: 4,
        format: 'online',
        maxParticipants: 30,
        availableSpots: 30,
        price: 12900,
        admissionRequirements: 'Ingen formell behörighet krävs',
        language: 'Svenska',
        status: 'upcoming'
      }
    ],
    faq: [
      { question: 'Är kursen relevant för privat sektor?', answer: 'Ja, nudging används brett inom marknadsföring, HR, produktdesign och policy.' },
      { question: 'Kan jag läsa kursen i kombination med Miljöpsykologi?', answer: 'Absolut – kurserna kompletterar varandra väl och kan läsas parallellt.' }
    ]
  },
  {
    id: '17',
    title: 'Tillämpad beteendevetenskap: Allt om sömn',
    courseCode: 'LD1009',
    description: 'Varför sover vi och hur kan vi sova bättre? I den här kursen undersöker vi sömnens uppbyggnad och funktioner, analyserar påverkansfaktorer från individ- till samhällsnivå och hjälper dig att utveckla konkreta strategier för att förbättra din sömn. Bygger på aktuell forskning inom kognitionspsykologi.',
    providerId: '7',
    categoryId: '4',
    format: 'online',
    duration: '4 veckor',
    credits: 4,
    targetAudience: 'Yrkesverksamma, studenter och andra som vill förstå och hantera hur sömn påverkar oss',
    featured: false,
    views: 341,
    leads: 16,
    imageUrl: 'https://images.unsplash.com/photo-1768064772500-8d4665c0d041?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    trainingType: 'scheduled',
    contactPerson: {
      name: 'Anna Lindberg',
      title: 'Programansvarig, KTH Executive',
      email: 'anna.lindberg@kth.se',
      phone: '+46 8 790 60 00',
      responseTime: 'Svar inom 1 arbetsdag'
    },
    learningOutcomes: [
      'Förstå sömnens fysiologi och psykologi',
      'Identifiera faktorer som påverkar sömnkvalitet',
      'Implementera evidensbaserade strategier för bättre sömn',
      'Hantera sömnproblem i arbetslivet'
    ],
    scheduledStarts: [
      {
        id: 's17-1',
        startDate: '2026-10-05',
        applicationDeadline: '2026-09-14',
        credits: 4,
        durationWeeks: 4,
        format: 'online',
        maxParticipants: 50,
        availableSpots: 38,
        price: 12900,
        admissionRequirements: 'Ingen formell behörighet krävs',
        language: 'Svenska',
        status: 'open'
      }
    ],
    faq: []
  }
];

export const leads: Lead[] = [
  {
    id: '1',
    trainingId: '1',
    companyName: 'TechCorp AB',
    contactName: 'Anna Svensson',
    email: 'anna.svensson@techcorp.se',
    phone: '+46 70 123 4567',
    description: 'Vi behöver utveckla vårt ledningsteam med fokus på strategiskt tänkande och förändringshantering.',
    budget: '500 000 - 1 000 000 kr',
    timeline: 'Q2 2026',
    aiSummary: 'Stort teknikföretag söker omfattande ledarskapsutveckling för ledningsgrupp. Fokus på strategiskt tänkande och förändringshantering. Budget indikerar seriöst intresse. Rimlig tidplan.',
    aiScore: 'high',
    status: 'qualified',
    createdAt: '2026-03-20T10:30:00Z'
  },
  {
    id: '2',
    companyName: 'Healthcare Solutions',
    contactName: 'Lars Andersson',
    email: 'lars.a@healthcare.se',
    phone: '+46 70 234 5678',
    description: 'Söker digital transformationsutbildning för vår ledningsgrupp',
    timeline: 'Snarast',
    aiSummary: 'Vårdorganisation behöver digital transformationsutbildning. Förfrågan något vag men hög brådska. Ingen budget angiven.',
    aiScore: 'medium',
    status: 'contacted',
    createdAt: '2026-03-22T14:15:00Z'
  },
  {
    id: '3',
    trainingId: '2',
    companyName: 'Nordic Manufacturing Ltd',
    contactName: 'Maria Johansson',
    email: 'maria.j@nordicmfg.com',
    phone: '+46 70 345 6789',
    description: 'Vi vill att vår ledningsgrupp ska förstå AI och hur det kan tillämpas inom tillverkning. Cirka 15-20 deltagare.',
    budget: '200 000 - 400 000 kr',
    timeline: 'Hösten 2026',
    aiSummary: 'Tillverkningsföretag vill ha AI-utbildning för ledning (15-20 personer). Tydligt användningsfall, rimlig budget, bra tidplan. Välkvalificerad lead.',
    aiScore: 'high',
    status: 'new',
    createdAt: '2026-03-24T09:45:00Z'
  },
  {
    id: '4',
    companyName: 'Stadsledningskontoret',
    contactName: 'Erik Lundberg',
    email: 'erik.lundberg@stad.se',
    phone: '+46 70 456 7890',
    description: 'Undersöker alternativ för ledarskapsutbildning',
    timeline: 'Osäker',
    aiSummary: 'Förfrågan från offentlig sektor, mycket tidigt skede. Låg detaljnivå och ingen tydlig tidplan. Kan behöva kvalificeras.',
    aiScore: 'low',
    status: 'new',
    createdAt: '2026-03-25T11:20:00Z'
  }
];

// Helper functions
export function getCategoryById(id: string): Category | undefined {
  return categories.find(c => c.id === id);
}

export function getProviderById(id: string): Provider | undefined {
  return providers.find(p => p.id === id);
}

export function getTrainingById(id: string): Training | undefined {
  return trainings.find(t => t.id === id);
}

export function getTrainingsByCategory(categoryId: string): Training[] {
  return trainings.filter(t => t.categoryId === categoryId);
}

export function getFeaturedTrainings(): Training[] {
  return trainings.filter(t => t.featured);
}
