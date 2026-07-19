// Pure origin-aware navigation for analytics leaves. Home cards should behave
// like drill-downs from Home; the same leaf opened from Insights remains inside
// the Insights hierarchy.
export function analyticsBackDestination(context, origin = 'insights', parentContext = null, returnParentContext, returnOrigin) {
  if (context === 'hub') return null;
  if (parentContext) {
    const labels = { 'weekly-volume': 'Weekly Volume', strength: 'Strength', running: 'Running' };
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
  return { action: 'open-analytics', context: 'hub', label: '← Back to Insights' };
}
