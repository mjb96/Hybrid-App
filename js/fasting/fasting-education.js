// @ts-check
// ==========================================
// FASTING KNOWLEDGE — js/fasting/fasting-education.js
// Offline-first local content library.
// No network requests. Add new content by extending EDUCATION_CONTENT.
// Structure: { articles, studies, guides, glossary }
// ==========================================

export const EDUCATION_CONTENT = {

  // ── Beginner guides ────────────────────────────────────────────────────────
  articles: [
    {
      id: 'what-is-if',
      category: 'beginner',
      title: 'What is Intermittent Fasting?',
      tagline: 'Understanding the fundamentals of time-restricted eating.',
      readTime: '3 min',
      sections: [
        {
          type: 'paragraph',
          text: 'Intermittent fasting (IF) is an eating pattern that cycles between periods of fasting and eating. Unlike traditional diets, IF focuses on when you eat rather than what you eat. The most common approach is the 16:8 method — fasting for 16 hours and eating within an 8-hour window.',
        },
        {
          type: 'heading',
          text: 'Why It Works',
        },
        {
          type: 'paragraph',
          text: 'During a fast, insulin levels drop significantly. Low insulin signals the body to begin burning stored fat for energy. After roughly 12–16 hours, the body enters a fat-burning state and begins producing ketone bodies — an efficient alternative fuel source.',
        },
        {
          type: 'heading',
          text: 'Common Approaches',
        },
        {
          type: 'list',
          items: [
            '16:8 — Fast 16 hours, eat within 8 hours. Most popular for daily use.',
            '18:6 — A stricter daily fast, often used for accelerated fat adaptation.',
            '20:4 — Extended daily fast, sometimes called the Warrior Diet.',
            '24h — One full-day fast, typically done 1–2 times per week.',
            '5:2 — Eat normally 5 days, restrict to ~500 kcal on 2 days.',
          ],
        },
        {
          type: 'callout',
          text: 'HybridHQ tracks your metabolic phase in real time — from Anabolic through Fat Adaptation, Ketosis, and beyond.',
        },
      ],
    },
    {
      id: 'how-168-works',
      category: 'beginner',
      title: 'How 16:8 Works',
      tagline: 'The most effective entry point into intermittent fasting.',
      readTime: '3 min',
      sections: [
        {
          type: 'paragraph',
          text: 'The 16:8 protocol is the most studied and widely practised form of intermittent fasting. You fast for 16 consecutive hours — typically overnight — and confine all meals to a 8-hour eating window.',
        },
        {
          type: 'heading',
          text: 'A Typical Day',
        },
        {
          type: 'list',
          items: [
            '10:00 PM — Stop eating. Fast begins.',
            '6:00 AM — Wake up. Fast continues. Black coffee, water, and electrolytes are fine.',
            '12:00 PM — Eating window opens. First meal of the day.',
            '8:00 PM — Eating window closes. Fast begins again.',
          ],
        },
        {
          type: 'heading',
          text: 'What Happens Metabolically',
        },
        {
          type: 'list',
          items: [
            '0–4h: Digestion and nutrient absorption. Insulin elevated.',
            '4–12h: Glycogen stores depleting. Fat oxidation rising.',
            '12–16h: Gluconeogenesis active. Ketone production beginning.',
            '16h+: Fat adaptation zone — sustained energy from fat stores.',
          ],
        },
        {
          type: 'callout',
          text: 'Most people find 16:8 sustainable long-term without impacting training performance when protein targets are met in the eating window.',
        },
      ],
    },
    {
      id: 'common-mistakes',
      category: 'beginner',
      title: 'Common Fasting Mistakes',
      tagline: 'What to avoid when starting intermittent fasting.',
      readTime: '4 min',
      sections: [
        {
          type: 'paragraph',
          text: 'Most people who struggle with fasting are making one or more preventable mistakes. Understanding these pitfalls dramatically increases long-term success.',
        },
        {
          type: 'heading',
          text: 'The Most Common Errors',
        },
        {
          type: 'list',
          items: [
            'Breaking the fast with high-sugar foods — spikes insulin and triggers a crash.',
            'Not drinking enough water — thirst is often confused with hunger during fasting.',
            'Ignoring electrolytes — sodium, potassium, and magnesium drop after 16+ hours.',
            'Setting too aggressive a goal too soon — building consistency at 14h beats failing at 20h.',
            'Thinking coffee or tea breaks the fast — they do not. Black coffee and unsweetened tea are fine.',
            'Compensating by overeating in the window — fasting does not create a licence to eat anything.',
            'Fasting heavily on high-volume training days — prioritise nutrition around key sessions.',
          ],
        },
        {
          type: 'heading',
          text: 'The Hybrid Athlete Approach',
        },
        {
          type: 'paragraph',
          text: 'For athletes training for strength and endurance, the eating window should be timed to support recovery. A post-workout meal within 2 hours of lifting or a long run is a reasonable priority.',
        },
        {
          type: 'callout',
          text: 'Start with 13–14 hour fasts and build gradually. Consistency matters more than duration.',
        },
      ],
    },
    {
      id: 'breaking-a-fast',
      category: 'beginner',
      title: 'Breaking a Fast Properly',
      tagline: 'The first meal matters — how to transition out of a fast effectively.',
      readTime: '3 min',
      sections: [
        {
          type: 'paragraph',
          text: 'After an extended fast, the digestive system has been at rest for many hours. Re-introducing food thoughtfully prevents discomfort and maximises nutrient absorption.',
        },
        {
          type: 'heading',
          text: 'General Principles',
        },
        {
          type: 'list',
          items: [
            'Start with something easy to digest — eggs, fish, light salads, or bone broth.',
            'Avoid immediately large, heavy meals — the stomach needs time to re-engage.',
            'Prioritise protein in the first meal to support muscle protein synthesis.',
            'Whole foods with fibre help re-establish gut motility gently.',
            'Avoid high-glycaemic foods as the first meal — a rapid insulin spike after fasting can cause energy dips.',
          ],
        },
        {
          type: 'heading',
          text: 'After Extended Fasts (24h+)',
        },
        {
          type: 'paragraph',
          text: 'After a 24-hour or longer fast, refeeding should be even more gradual. Begin with a small, easily digestible meal (broth, small portion of lean protein, or eggs) before transitioning to a normal meal 30–60 minutes later.',
        },
        {
          type: 'callout',
          text: 'For athletes: post-fast meals are an opportunity to aggressively re-stock muscle glycogen if a training session is planned within the next few hours.',
        },
      ],
    },
    {
      id: 'hydration',
      category: 'beginner',
      title: 'Hydration & Electrolytes During Fasting',
      tagline: 'What to drink — and what to avoid.',
      readTime: '3 min',
      sections: [
        {
          type: 'paragraph',
          text: 'Hydration is critical during a fast. As glycogen is depleted, the kidneys excrete more sodium, leading to a cascading loss of electrolytes. Many symptoms people associate with fasting — headaches, fatigue, dizziness — are actually dehydration.',
        },
        {
          type: 'heading',
          text: 'What You Can Drink (Does Not Break the Fast)',
        },
        {
          type: 'list',
          items: [
            'Water — plain, sparkling, or mineral. Aim for 2–3L during longer fasts.',
            'Black coffee — no cream, sugar, or additives. Mild appetite suppressor.',
            'Plain tea — green, herbal, or black. No milk or sweeteners.',
            'Electrolyte water — sodium, potassium, magnesium with zero sugar.',
          ],
        },
        {
          type: 'heading',
          text: 'What Breaks Your Fast',
        },
        {
          type: 'list',
          items: [
            'Any calories — including small amounts — technically interrupt the fasted state.',
            'Milk, cream, or butter in coffee trigger an insulin response.',
            'Sweetened drinks — diet or otherwise — can trigger cephalic insulin responses in some individuals.',
            'Protein shakes or BCAAs — these are food.',
          ],
        },
        {
          type: 'heading',
          text: 'Electrolyte Protocol for Fasts Over 16 Hours',
        },
        {
          type: 'paragraph',
          text: 'After 16+ hours, consider adding a pinch of sea salt to water or using an unsweetened electrolyte supplement. Target: 1,000–2,000mg sodium, 300–500mg potassium, 100–200mg magnesium for each 24-hour fasting period.',
        },
        {
          type: 'callout',
          text: 'Most fasting "side effects" are electrolyte-related. Stay on top of sodium especially on training days.',
        },
      ],
    },
  ],

  // ── Science summaries ─────────────────────────────────────────────────────
  studies: [
    {
      id: 'if-weight-loss',
      title: 'Intermittent Fasting and Weight Management',
      year: 2019,
      journal: 'New England Journal of Medicine',
      authors: 'de Cabo R, Mattson MP',
      sampleSize: null,
      studyType: 'Review',
      keyFindings: [
        'Intermittent fasting produces metabolic switching between glucose and ketone bodies.',
        'IF improves a wide range of health indicators including blood pressure, resting heart rate, and insulin sensitivity.',
        'Weight loss outcomes with IF are comparable to continuous caloric restriction when protein is controlled.',
        'Fasting triggers adaptive cellular stress responses that improve glucose regulation.',
      ],
      practicalTakeaways: [
        'IF is an evidence-supported approach to weight management, not just a trend.',
        'The metabolic benefits extend beyond weight loss to cardiovascular and metabolic markers.',
        'Combining IF with adequate protein intake preserves lean muscle mass during fat loss.',
      ],
      disclaimer: 'This is a review summarising existing research, not a controlled trial.',
    },
    {
      id: 'if-insulin-sensitivity',
      title: 'Fasting and Insulin Sensitivity',
      year: 2005,
      journal: 'American Journal of Clinical Nutrition',
      authors: 'Heilbronn LK et al.',
      sampleSize: 32,
      studyType: 'Randomised Controlled Trial',
      keyFindings: [
        'Alternate-day fasting significantly improved insulin sensitivity in overweight individuals.',
        'Fasting insulin levels declined 57% in the fasting group vs 14% in caloric restriction controls.',
        'Benefits were observed independent of body weight changes.',
        'Adiponectin (an insulin-sensitising hormone) increased in fasting participants.',
      ],
      practicalTakeaways: [
        'Fasting may improve insulin sensitivity beyond what weight loss alone explains.',
        'Relevant for athletes managing body composition and energy metabolism.',
        'Insulin sensitivity improvements can translate to better glycogen storage efficiency post-workout.',
      ],
      disclaimer: 'Small sample size. Results may vary. Not medical advice.',
    },
    {
      id: 'if-autophagy',
      title: 'Fasting, Autophagy, and Longevity',
      year: 2016,
      journal: 'Cell (Nobel Prize Research)',
      authors: 'Yoshinori Ohsumi',
      sampleSize: null,
      studyType: 'Mechanistic Research',
      keyFindings: [
        'Autophagy is a cellular recycling process — cells break down and reuse damaged components.',
        'Fasting is one of the most potent activators of autophagy in mammals.',
        'Autophagy activation begins after approximately 16–24 hours of fasting.',
        'Dysfunctional autophagy is linked to cancer, neurodegeneration, and accelerated ageing.',
        'This research won the 2016 Nobel Prize in Physiology or Medicine.',
      ],
      practicalTakeaways: [
        'Extended fasts (16h+) may provide cellular benefits beyond fat loss.',
        'Autophagy is a fundamental biological process — not fringe science.',
        'The relevance to healthy ageing and disease prevention is a legitimate research area.',
      ],
      disclaimer: 'Human-specific autophagy benefits are still under active research. Exercise also activates autophagy.',
    },
    {
      id: 'if-athletic-performance',
      title: 'Fasting and Athletic Performance',
      year: 2020,
      journal: 'Nutrients',
      authors: 'Cherif A et al.',
      sampleSize: null,
      studyType: 'Systematic Review',
      keyFindings: [
        'Short-term fasting (16–24h) generally does not impair high-intensity performance when well-hydrated.',
        'Endurance performance at low-to-moderate intensity is maintained or improved during fat adaptation.',
        'Power and strength performance show minor decrements only during the first week of adaptation.',
        'After a 2–3 week adaptation period, most athletes return to baseline performance metrics.',
        'Training fasted can enhance fat oxidation capacity — useful for metabolic flexibility.',
      ],
      practicalTakeaways: [
        'Do not expect performance to drop permanently with IF — adaptation occurs.',
        'Avoid very high-intensity sessions (maximal sprints, heavy 1RMs) in the first 1–2 weeks.',
        'Time eating windows to support priority training sessions.',
        'Protein adequacy is more important than meal timing for muscle retention.',
      ],
      disclaimer: 'Research is ongoing. Individual responses vary significantly based on training history and diet quality.',
    },
    {
      id: 'if-metabolic-health',
      title: 'Intermittent Fasting and Metabolic Health',
      year: 2022,
      journal: 'Annual Review of Nutrition',
      authors: 'Lowe DA et al.',
      sampleSize: 116,
      studyType: 'Randomised Controlled Trial',
      keyFindings: [
        '16:8 time-restricted eating reduced body weight, fat mass, and blood pressure.',
        'Fasting lowered total cholesterol and LDL cholesterol significantly vs control group.',
        'HbA1c (3-month blood sugar marker) improved in participants with elevated baseline levels.',
        'Improvements were sustained at 3-month follow-up with continued practice.',
      ],
      practicalTakeaways: [
        '16:8 IF is a practical intervention for improving several cardiovascular risk markers.',
        'Metabolic benefits are additive to exercise — fasting + training outperformed either alone.',
        'Consistent practice is key — occasional fasting produces fewer measurable benefits.',
      ],
      disclaimer: 'Results from a specific population. Consult a healthcare provider if you have any metabolic conditions.',
    },
  ],

  // ── Practice guides ────────────────────────────────────────────────────────
  guides: [
    {
      id: 'first-week-guide',
      category: 'guide',
      title: 'Your First Week of Fasting',
      tagline: 'A practical step-by-step guide for beginners.',
      readTime: '5 min',
      sections: [
        {
          type: 'paragraph',
          text: 'The first week of fasting is about building the habit and letting your body adapt — not hitting extreme numbers. Most discomfort is temporary and resolves by day 3–5.',
        },
        {
          type: 'heading',
          text: 'Days 1–2: The Foundation',
        },
        {
          type: 'list',
          items: [
            'Target a 13–14 hour fast. This is shorter than your goal but builds the habit.',
            'Stop eating 2–3 hours before sleep. This often gives you 6–8 hours "free" fasting overnight.',
            'Drink 500ml of water immediately upon waking.',
            'Black coffee or tea is allowed and can reduce hunger.',
            'Expect mild hunger pangs around your normal breakfast time — they will pass in 20 minutes.',
          ],
        },
        {
          type: 'heading',
          text: 'Days 3–5: Extension',
        },
        {
          type: 'list',
          items: [
            'Extend to 15–16 hours.',
            'Hunger patterns should be shifting — many people notice reduced appetite by now.',
            'Energy may fluctuate — this is normal during glycogen adaptation.',
            'Continue prioritising electrolytes and water.',
          ],
        },
        {
          type: 'heading',
          text: 'Days 6–7: Establishing the Routine',
        },
        {
          type: 'paragraph',
          text: 'By the end of week one, you should be completing 16-hour fasts without significant difficulty. The key is consistency — the same fasting window every day trains your hunger hormones to adapt to the new schedule.',
        },
        {
          type: 'callout',
          text: 'Skip the scale for the first week. Focus on completing the fasts, not the outcome. The data will follow.',
        },
      ],
    },
    {
      id: 'hybrid-athlete-guide',
      category: 'guide',
      title: 'Fasting for the Hybrid Athlete',
      tagline: 'Balancing fasting with strength training and running.',
      readTime: '5 min',
      sections: [
        {
          type: 'paragraph',
          text: 'Intermittent fasting and hybrid training can coexist well — but require some thought around timing. The key insight is that nutrient timing matters more for high-volume sessions than for easier aerobic work.',
        },
        {
          type: 'heading',
          text: 'Training Fasted: What Works',
        },
        {
          type: 'list',
          items: [
            'Easy aerobic runs (Zone 1–2) — excellent fasted. Enhances fat oxidation.',
            'Moderate strength sessions — manageable fasted once adapted. Performance is usually maintained.',
            'Hypertrophy work — tolerable fasted but ensure large feeding in the eating window post-workout.',
          ],
        },
        {
          type: 'heading',
          text: 'Training Fed: When to Prioritise',
        },
        {
          type: 'list',
          items: [
            'Heavy barbell sessions (1RM attempts, power work) — benefit from carbohydrate availability.',
            'High-intensity interval training — glycolytic demand is high, fasted performance drops more here.',
            'Long runs (90min+) — carry nutrition unless fat-adapted. Begin with shorter fasted aerobic work.',
          ],
        },
        {
          type: 'heading',
          text: 'The Practical Framework',
        },
        {
          type: 'paragraph',
          text: 'Schedule your eating window around your key training session. If you lift at 12pm, open your eating window at 11am. If you run at 7am, fast after and open your window at 11am post-run.',
        },
        {
          type: 'callout',
          text: 'Recovery nutrition is non-negotiable. Protein within 2 hours of your hardest sessions, regardless of fasting status.',
        },
      ],
    },
  ],

  // ── Glossary ───────────────────────────────────────────────────────────────
  glossary: [
    {
      id: 'autophagy',
      term: 'Autophagy',
      definition: 'A cellular self-cleaning process where cells break down and recycle damaged components. Activated by fasting, exercise, and caloric restriction. Named by Nobel laureate Yoshinori Ohsumi.',
    },
    {
      id: 'ketosis',
      term: 'Ketosis',
      definition: 'A metabolic state where the liver produces ketone bodies (acetoacetate, beta-hydroxybutyrate) from fat. Occurs after approximately 16–24 hours of fasting or with a ketogenic diet. Ketones serve as an efficient fuel for the brain and muscles.',
    },
    {
      id: 'gluconeogenesis',
      term: 'Gluconeogenesis',
      definition: 'The liver\'s process of synthesising glucose from non-carbohydrate sources — primarily amino acids, glycerol, and lactate. Active from approximately 12–18 hours of fasting, maintaining blood glucose as glycogen stores deplete.',
    },
    {
      id: 'insulin-sensitivity',
      term: 'Insulin Sensitivity',
      definition: 'A measure of how effectively cells respond to insulin. High insulin sensitivity means cells efficiently absorb glucose. Fasting consistently improves insulin sensitivity, which is relevant for body composition and metabolic health.',
    },
    {
      id: 'metabolic-flexibility',
      term: 'Metabolic Flexibility',
      definition: 'The body\'s ability to efficiently switch between glucose and fat as fuel sources depending on availability and demand. Fasting and aerobic training both enhance metabolic flexibility.',
    },
    {
      id: 'time-restricted-eating',
      term: 'Time-Restricted Eating (TRE)',
      definition: 'A form of intermittent fasting where all food intake is confined to a specific daily window (e.g., 8 hours). Aligns with circadian biology — earlier eating windows (e.g., 8am–4pm) may offer additional metabolic benefits.',
    },
    {
      id: 'omad',
      term: 'OMAD (One Meal a Day)',
      definition: 'An extreme 23:1 fasting protocol where all daily calories are consumed in a single meal. Not generally recommended for athletes with high training volumes due to difficulty meeting caloric and protein needs.',
    },
    {
      id: 'refeeding',
      term: 'Refeeding',
      definition: 'The process of returning to normal eating after an extended fast. Thoughtful refeeding — starting with easily digestible foods and gradually increasing portions — prevents digestive discomfort and blood sugar volatility.',
    },
    {
      id: 'fat-adaptation',
      term: 'Fat Adaptation',
      definition: 'The physiological shift where the body increases its capacity to oxidise fat for fuel. Requires 2–4 weeks of consistent low-carbohydrate eating or intermittent fasting. Results in improved endurance, reduced energy dips, and greater metabolic stability.',
    },
    {
      id: 'acwr',
      term: 'Eating Window',
      definition: 'The defined period during intermittent fasting when eating is permitted. Common windows: 8 hours (16:8), 6 hours (18:6), 4 hours (20:4). The eating window should be timed to support recovery from training where possible.',
    },
  ],
};

export const EDUCATION_CATEGORIES = [
  { id: 'articles', label: 'Beginner Guides', icon: '📖' },
  { id: 'studies',  label: 'Science',         icon: '🔬' },
  { id: 'guides',   label: 'Practice Guides', icon: '🎯' },
  { id: 'glossary', label: 'Glossary',        icon: '📚' },
];
