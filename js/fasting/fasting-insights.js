// @ts-check
// ==========================================
// FASTING INSIGHTS — js/fasting/fasting-insights.js
// Pure functions. Generates ranked text insights from analytics data.
// Follows the same contract as analytics/insights/insight-engine.js
// ==========================================

function _rank(insights) {
  const order = { alert: 0, good: 1, info: 2 };
  return insights.filter(i => i.text).sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
}

export function generateFastingInsights(calcs) {
  const insights = [];
  const { weeklyTrend, monthlyTrend, weekdayAdherence } = calcs;

  // ── Weekly hours trend (compare last two completed weeks, not current partial week)
  const recentWeeks = weeklyTrend.slice(-3, -1).filter(w => w.hours > 0);
  if (recentWeeks.length === 2) {
    const pct = ((recentWeeks[1].hours - recentWeeks[0].hours) / recentWeeks[0].hours) * 100;
    if (Math.abs(pct) >= 10) {
      insights.push({
        text: `Fasting hours ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}% last week vs the week before.`,
        priority: pct > 0 ? 'good' : 'info',
        category: 'fasting',
      });
    }
  }

  // ── Monthly count
  const thisMonth = monthlyTrend[monthlyTrend.length - 1];
  if (thisMonth?.count > 0) {
    insights.push({
      text: `You completed ${thisMonth.count} fast${thisMonth.count !== 1 ? 's' : ''} this month.`,
      priority: 'info',
      category: 'fasting',
    });
  }

  // ── Streak
  if (calcs.currentStreak >= 3) {
    insights.push({
      text: `${calcs.currentStreak}-day fasting streak — keep it going.`,
      priority: 'good',
      category: 'fasting',
    });
  }

  // ── Most common schedule
  if (calcs.mostCommonSchedule) {
    insights.push({
      text: `You are most successful with ${calcs.mostCommonSchedule} fasting schedules.`,
      priority: 'info',
      category: 'fasting',
    });
  }

  // ── Weekday vs weekend gap
  const { weekdayRate, weekendRate, weekdayCount, weekendCount } = weekdayAdherence;
  if (weekdayCount >= 5 && weekendCount === 0) {
    insights.push({
      text: `You've never fasted on a weekend. Extending to weekends could significantly improve your consistency score.`,
      priority: 'alert',
      category: 'fasting',
    });
  } else if (weekdayRate > 10) {
    if (weekendRate < weekdayRate * 0.75) {
      insights.push({
        text: `Weekend adherence (${weekendRate.toFixed(0)}%) is lower than weekday adherence (${weekdayRate.toFixed(0)}%).`,
        priority: 'alert',
        category: 'fasting',
      });
    } else if (weekendRate >= weekdayRate * 0.95) {
      insights.push({
        text: `Strong weekend adherence — consistent fasting across all days.`,
        priority: 'good',
        category: 'fasting',
      });
    }
  }

  // ── Goal completion
  if (calcs.totalFasts >= 3) {
    if (calcs.goalCompletionPct >= 80) {
      insights.push({
        text: `Goal completion rate is ${calcs.goalCompletionPct.toFixed(0)}% — excellent adherence.`,
        priority: 'good',
        category: 'fasting',
      });
    } else if (calcs.goalCompletionPct < 50) {
      insights.push({
        text: `Goal completion at ${calcs.goalCompletionPct.toFixed(0)}%. Consider a shorter goal duration to build consistency.`,
        priority: 'info',
        category: 'fasting',
      });
    }
  }

  // ── 30-day consistency
  if (calcs.consistencyScore >= 70) {
    insights.push({
      text: `30-day fasting consistency is ${calcs.consistencyScore.toFixed(0)}% — strong habit formation.`,
      priority: 'good',
      category: 'fasting',
    });
  } else if (calcs.consistencyScore < 30 && calcs.totalFasts >= 5) {
    insights.push({
      text: `30-day consistency is ${calcs.consistencyScore.toFixed(0)}%. Try scheduling fasting as part of your daily routine.`,
      priority: 'alert',
      category: 'fasting',
    });
  }

  // ── Mood correlation
  if (calcs.recoveryCorrelation.hasData) {
    const effect = calcs.recoveryCorrelation.moodEffect;
    if (effect > 5) {
      insights.push({
        text: `Mood scores average ${effect.toFixed(0)}% higher on fasting days — a positive lifestyle signal.`,
        priority: 'good',
        category: 'fasting',
      });
    } else if (effect < -10) {
      insights.push({
        text: `Mood scores lower on fasting days. Ensure adequate nutrition in your eating window.`,
        priority: 'alert',
        category: 'fasting',
      });
    }
  }

  // ── Body weight
  if (calcs.bwCorrelation.hasData && calcs.bwCorrelation.direction === 'decreasing') {
    insights.push({
      text: `Body weight trends improved during periods of higher fasting adherence.`,
      priority: 'good',
      category: 'fasting',
    });
  }

  // ── Longest fast milestone
  if (calcs.longestFast >= 24) {
    insights.push({
      text: `Longest fast: ${calcs.longestFast.toFixed(1)}h — reached the Ketosis Progression phase.`,
      priority: 'good',
      category: 'fasting',
    });
  }

  // ── Routine stability
  if (calcs.routineStabilityScore !== undefined) {
    if (calcs.routineStabilityScore >= 75) {
      insights.push({
        text: `High routine stability (${calcs.routineStabilityScore.toFixed(0)}%) — your fasting start times are very consistent, which helps entraining your circadian rhythm.`,
        priority: 'good',
        category: 'fasting',
      });
    } else if (calcs.routineStabilityScore < 35 && calcs.totalFasts >= 5) {
      insights.push({
        text: `Routine stability is ${calcs.routineStabilityScore.toFixed(0)}%. Starting fasts at a consistent time each day may strengthen metabolic signalling.`,
        priority: 'info',
        category: 'fasting',
      });
    }
  }

  // ── Weekly momentum
  if (calcs.weeklyMomentum !== undefined && Math.abs(calcs.weeklyMomentum) >= 15) {
    insights.push({
      text: calcs.weeklyMomentum > 0
        ? `Fasting hours up ${calcs.weeklyMomentum.toFixed(0)}% over recent weeks — positive momentum.`
        : `Fasting hours down ${Math.abs(calcs.weeklyMomentum).toFixed(0)}% recently. Consider re-anchoring your fasting routine.`,
      priority: calcs.weeklyMomentum > 0 ? 'good' : 'info',
      category: 'fasting',
    });
  }

  // ── HRV correlation
  if (calcs.hrvCorrelation?.hasData) {
    const { diffPct, direction } = calcs.hrvCorrelation;
    if (direction === 'better' && diffPct >= 5) {
      insights.push({
        text: `HRV averages ${diffPct.toFixed(0)}% higher on fasting days — a positive autonomic recovery signal.`,
        priority: 'good',
        category: 'fasting',
      });
    } else if (direction === 'worse' && diffPct <= -5) {
      insights.push({
        text: `HRV trends lower on fasting days. Monitor whether extended fasts are adding physiological stress.`,
        priority: 'alert',
        category: 'fasting',
      });
    }
  }

  // ── Sleep correlation
  if (calcs.sleepCorrelation?.hasData && !calcs.recoveryCorrelation?.hasData) {
    const { diff, direction } = calcs.sleepCorrelation;
    if (direction === 'better' && diff >= 0.3) {
      insights.push({
        text: `Sleep duration averages ${diff.toFixed(1)}h longer on fasting days — closing your eating window earlier may improve sleep quality.`,
        priority: 'good',
        category: 'fasting',
      });
    }
  }

  // ── Fasting score tier change
  if (calcs.fastingScore !== null && calcs.fastingScore >= 85) {
    insights.push({
      text: `Fasting Score: ${calcs.fastingScore} — Excellent. Maintaining this consistency builds long-term metabolic health.`,
      priority: 'good',
      category: 'fasting',
    });
  }

  return _rank(insights);
}

export function renderFastingInsightsHTML(insights, maxShow = 6) {
  if (!insights?.length) return '';
  const iconMap = { alert: '!', good: '↑', info: 'i' };
  const items = insights.slice(0, maxShow).map(i =>
    `<div class="an-insight an-insight--${i.priority}">
      <div class="an-insight__icon">${iconMap[i.priority] || '·'}</div>
      <span>${i.text}</span>
    </div>`
  ).join('');
  return `<div class="an-insights">
    <div class="an-insights__title">Fasting Insights</div>
    ${items}
  </div>`;
}
