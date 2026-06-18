// ==========================================
// HYBRID BRAIN — BRIEFING (js/brain/briefing.js)
//
// Training status labels and natural-language brief composition.
// Shared by the Hybrid Brain (prescriptive) and Analytics Brain (descriptive).
// ==========================================

// Maps an ACWR reading to a Coros/Garmin-style training status label.
// Thresholds calibrated to Gabbett (2016) and TrainingPeaks literature.
export function trainingStatus({ hasData, acwr } = {}) {
  if (!hasData) return { status: 'Building', tone: 'neutral' };
  if (acwr >= 1.50) return { status: 'Strained',     tone: 'warning'  };
  if (acwr >= 1.30) return { status: 'Overreaching', tone: 'caution'  };
  if (acwr >= 1.00) return { status: 'Productive',   tone: 'progress' };
  if (acwr >= 0.75) return { status: 'Maintaining',  tone: 'neutral'  };
  return                     { status: 'Detraining',  tone: 'warning'  };
}

function fmtNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Composes a natural-language training brief from the supplied context object.
// ctx shape: { dataWeeks, recovery, readiness, energy, focusObservation }
export function composeBriefing(ctx = {}) {
  if (!ctx.dataWeeks || ctx.dataWeeks === 0) {
    return 'Log a few sessions to unlock your personalised training brief.';
  }

  const parts = [];

  if (ctx.recovery?.hasData) {
    const score = ctx.recovery.score;
    if (score >= 80) {
      parts.push(`Recovery is at ${score}%. You're well rested — push intensity today.`);
    } else if (score >= 50) {
      parts.push(`Recovery is at ${score}%. Moderately recovered — stick to planned volume.`);
    } else {
      parts.push(`Recovery is running low at ${score}%. Prioritise sleep and protect rest today.`);
    }
  }

  if (ctx.readiness?.hasData) {
    const acwr = ctx.readiness.acwr;
    if (acwr >= 1.50) {
      parts.push(`ACWR is ${acwr}; load is high — reduce volume and protect recovery.`);
    } else if (acwr >= 1.30) {
      parts.push(`ACWR is ${acwr}; load is high — monitor for fatigue accumulation.`);
    } else {
      parts.push(`ACWR is ${acwr}; current training load is sustainable.`);
    }
  }

  if (ctx.energy?.hasProfile) {
    const { bmr, active, total } = ctx.energy;
    parts.push(
      `Total energy expenditure: ${fmtNum(total)} kcal (base ${fmtNum(bmr)} + active ${fmtNum(active)}).`
    );
  }

  if (ctx.focusObservation) {
    parts.push(ctx.focusObservation);
  }

  return parts.join(' ');
}

// Builds a flat array of telemetry cards for dashboard display.
// Each card: { key, value, nav? }
export function buildTelemetry(ctx = {}) {
  const items = [];

  items.push({
    key:   'readiness',
    value: ctx.readiness?.hasData ? String(ctx.readiness.score) : '—',
  });

  items.push({
    key:   'recovery',
    value: ctx.recovery?.hasData ? String(ctx.recovery.score) : '—',
  });

  if (ctx.energy?.hasProfile) {
    const { bmr, active, total } = ctx.energy;
    items.push({ key: 'base',   value: fmtNum(bmr)   });
    items.push({ key: 'active', value: fmtNum(active) });
    items.push({ key: 'burned', value: fmtNum(total)  });
  } else {
    items.push({ key: 'profile', value: 'Set up energy profile', nav: 'profile' });
  }

  return items;
}
