import type { FeedViewPreferences } from '../providers/PreferencesProvider';

const WIDTH_CLASS_MAP: Record<FeedViewPreferences['widthPreset'], string> = {
  compact: 'max-w-xl',
  default: 'max-w-2xl',
  wide: 'max-w-3xl',
  full: 'max-w-4xl',
};

export function getFeedWidthClass(preset: FeedViewPreferences['widthPreset'] | undefined): string {
  if (!preset) return WIDTH_CLASS_MAP.default;
  return WIDTH_CLASS_MAP[preset] ?? WIDTH_CLASS_MAP.default;
}
