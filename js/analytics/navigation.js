// Pure origin-aware navigation for analytics leaves. Home cards should behave
// like drill-downs from Home; the same leaf opened from Insights remains inside
// the Insights hierarchy.
export function analyticsBackDestination(context, origin = 'insights') {
  if (context === 'hub') return null;
  if (origin === 'home') {
    return { action: 'switch-tab', target: 'home', label: '← Back to Home' };
  }
  return { action: 'open-analytics', context: 'hub', label: '← Back to Insights' };
}
