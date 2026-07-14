// @ts-check
// =============================================================================
// ASK-THE-COACH (js/brain/coach-qa.js)
//
// Pure, DOM-free. A small deterministic Q&A layer that answers the questions an
// athlete actually asks — "should I train today?", "why did my score move?",
// "am I overtraining?", "what's my next PR?" — entirely from the engine numbers
// already computed for Home (readiness model, Hybrid Score + deltaBreakdown,
// overtraining risk, projection). No LLM: every answer is literally true of the
// data, which is exactly what makes a coach trustworthy. C2 of the audit plan.
//
// A guarded LLM phrasing layer over these same facts is the deferred follow-up.
// =============================================================================

export const COACH_INTENTS = ['train-today', 'why-score', 'overtraining', 'projection', 'readiness'];

/** @type {[RegExp, string][]} */
const RULES = [
  [/should i (train|work ?out|lift|run)|train today|rest today|work ?out today/, 'train-today'],
  [/why.*(score|number)|score.*(chang|drop|down|up|mov|lower|higher|fall|rise)/, 'why-score'],
  [/overtrain|too much|deload|burn ?out|over ?reach|recover(ed|ing)? enough|need.*rest/, 'overtraining'],
  [/\bpr\b|personal record|race|faster|predict|projection|when will|goal pace|1rm|estimate/, 'projection'],
  [/readiness|recovered|how.*(recover|fresh|rested)/, 'readiness'],
];

/** Map free text to a coach intent, or 'unknown'. */
export function classifyCoachIntent(text) {
  const s = String(text || '').toLowerCase();
  for (const [re, intent] of RULES) if (re.test(s)) return intent;
  return 'unknown';
}

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

function answerTrainToday(ctx) {
  const { risk, session, model } = ctx;
  if (risk && risk.level === 'high') {
    return `I'd hold back today. Several fatigue signals are stacked — keep it easy or take a full rest, and protect your sleep.`;
  }
  if (session && session.isRest) {
    return `Today's a rest day on your plan. A light walk or some mobility is perfect — let the work sink in.`;
  }
  const ready = model?.ready;
  const r = ready?.hasData ? ready.score : null;
  if (ready?.confidence === 'high' && r != null && r < 55) return `Yes — but keep it easy. Multiple readiness signals are low (${r}), so favour Zone 2 and lighter loads over intensity.`;
  if (ready?.confidence === 'high' && r != null && r >= 85) return `Great day to train — multiple signals say you're primed (readiness ${r}). A good day to push a little.`;
  if (ready?.hasData && ready.confidence !== 'high') return `Train to plan, but keep it flexible. Readiness is a ${ready.confidence}-confidence read from ${ready.inputCount} signal${ready.inputCount === 1 ? '' : 's'} — not enough evidence to push or back off yet.`;
  if (risk && risk.level === 'watch') return `Yes, but hold your planned volume — there are early fatigue signs, so don't add extra work.`;
  return `Yes — you're clear to train. Hit today's session as planned.`;
}

function answerWhyScore(ctx) {
  const { score } = ctx;
  if (!score || score.score == null) return `Your Hybrid Score is still calibrating — log a few more days and I'll explain every move.`;
  if (score.delta == null || !Array.isArray(score.deltaBreakdown) || !score.deltaBreakdown.length) {
    return `Your score is ${score.score}, new for today — from tomorrow I'll show you exactly what moved it.`;
  }
  const movers = score.deltaBreakdown
    .filter(d => Math.round(d.delta) !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
    .map(d => `${sign(Math.round(d.delta))} ${d.label}`);
  if (!movers.length) return `Your score held steady at ${score.score} — nothing moved it much since yesterday.`;
  return `Since yesterday: ${movers.join(' · ')}. Net ${sign(score.delta)} to ${score.score}.`;
}

function answerOvertraining(ctx) {
  const { risk } = ctx;
  if (risk && (risk.level === 'high' || risk.level === 'watch') && risk.advice) return risk.advice;
  return `No — your fatigue signals look clean right now. Train as planned and keep your sleep steady.`;
}

function answerProjection(ctx) {
  const { projection } = ctx;
  if (projection && projection.line) return projection.line;
  return `Keep logging sessions — once I have a bit more data I'll project your next PR and race times.`;
}

function answerReadiness(ctx) {
  const { model } = ctx;
  if (model?.ready?.hasData) {
    const r = model.ready;
    const evidence = (r.evidence || []).map((item) => item.label).join(' + ') || `${r.inputCount} signals`;
    if (r.confidence !== 'high') return `Your readiness estimate is ${r.score}, with ${r.confidence} confidence from ${evidence}. Follow the plan and reassess how you feel; this is not enough evidence to push or back off.`;
    return `Your readiness is ${r.score} — ${r.status}, with high confidence from ${evidence}. ${r.score >= 70 ? 'Good to go.' : 'Ease into it.'}`;
  }
  return `Log a 30-second wellness check-in and I'll read your readiness for you.`;
}

/**
 * Answer a coach question (intent key or free text) from the live context.
 * @param {string} intentOrText
 * @param {{model?:any, score?:any, risk?:any, projection?:any, session?:any}} ctx
 * @returns {{ intent:string, answer:string }}
 */
export function answerCoachQuestion(intentOrText, ctx = {}) {
  const intent = COACH_INTENTS.includes(intentOrText) ? intentOrText : classifyCoachIntent(intentOrText);
  let answer;
  switch (intent) {
    case 'train-today':  answer = answerTrainToday(ctx); break;
    case 'why-score':    answer = answerWhyScore(ctx); break;
    case 'overtraining': answer = answerOvertraining(ctx); break;
    case 'projection':   answer = answerProjection(ctx); break;
    case 'readiness':    answer = answerReadiness(ctx); break;
    default:
      answer = `Ask me whether to train today, why your score moved, or if you're overtraining.`;
  }
  return { intent, answer };
}
