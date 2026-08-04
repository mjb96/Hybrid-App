// Pure origin-aware navigation for analytics leaves. Home cards should behave
// like drill-downs from Home; the same leaf opened from Progress remains inside
// the Progress hierarchy. The persisted/internal origin value stays `insights`
// while the visible product vocabulary changes.
export function analyticsBackDestination(context, origin = 'insights', parentContext = null, returnParentContext, returnOrigin) {
  if (context === 'hub') return null;
  if (parentContext) {
    const labels = {
      'weekly-volume': 'Volume', 'strength-volume': 'Volume', 'gym-performance': 'Volume',
      strength: 'Strength', strength_pr: 'Strength', running: 'Running', recovery: 'Recovery',
    };
    return {
      action: 'open-analytics', context: parentContext,
      label: `← Back to ${labels[parentContext] || 'Insights'}`, preserveWeek: true,
      ...(returnParentContext ? { parentContext: returnParentContext } : {}),
      ...(returnOrigin ? { origin: returnOrigin } : {}),
    };
  }
  if (origin === 'home') {
    return { action: 'switch-tab', target: 'home', label: '← Back to Home' };
  }
  return { action: 'open-analytics', context: 'hub', label: '← Back to Progress' };
}
