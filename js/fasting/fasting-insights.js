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

  // ── Weekly hours trend
  const recentWeeks = weeklyTrend.slice(-2).filter(w => w.hours > 0);
  if (recentWeeks.length === 2) {
    const pct = ((recentWeeks[1].hours - recentWeeks[0].hours) / recentWeeks[0].hours) * 100;
    if (Math.abs(pct) >= 10) {
      insights.push({
        text: `Fasting hours ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}% this week vs last week.`,
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
  if (calcs.currentStreak >= 4) {
    insights.push({
      text: `Consistency improved for ${calcs.currentStreak} consecutive days.`,
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
  const { weekdayRate, weekendRate } = weekdayAdherence;
  if (weekdayRate > 10 && weekendRate > 0) {
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
      text: `Longest fast: ${calcs.longestFast.toFixed(1)}h — reached the ketosis zone.`,
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
