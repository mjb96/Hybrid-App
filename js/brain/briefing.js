// ==========================================
// HYBRID BRAIN — BRIEFING (js/brain/briefing.js)
//
// ACWR → training-status label mapping. Shared by the Hybrid Brain
// (prescriptive) and Analytics Brain (descriptive).
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
