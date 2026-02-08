export interface ThemePreset {
  id: string;
  label: string;
  group: 'Night' | 'Day';
}

export const themePresets: ThemePreset[] = [
  { id: 'dark', label: 'Tokyo Night', group: 'Night' },
  { id: 'dracula', label: 'Dracula', group: 'Night' },
  { id: 'ayu', label: 'Ayu', group: 'Night' },
  { id: 'ocean', label: 'Ocean Ink', group: 'Night' },
  { id: 'forest', label: 'Forest Lab', group: 'Night' },
  { id: 'nord', label: 'Nord', group: 'Night' },
  { id: 'gruvbox', label: 'Gruvbox Dark', group: 'Night' },
  { id: 'solarized', label: 'Solarized Dark', group: 'Night' },
  { id: 'light', label: 'Paper', group: 'Day' },
  { id: 'sand', label: 'Sandstone', group: 'Day' },
  { id: 'dawn', label: 'Dawn Mist', group: 'Day' },
  { id: 'glacier', label: 'Glacier', group: 'Day' },
  { id: 'rose', label: 'Rose Studio', group: 'Day' },
];

export const allowedThemes = themePresets.map(theme => theme.id);
