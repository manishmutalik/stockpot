/**
 * The Stockpot Quick look, from the design system (Stitch "Stockpot Quick" DESIGN.md): a teal canvas with white cards,
 * deep slate ink, Manrope for words and JetBrains Mono for figures.
 */
export const colors = {
  canvas: '#EAF4F3',
  card: '#FFFFFF',
  ink: '#2B313D',
  grey: '#5A5A5A',
  primary: '#00797B',
  primaryPressed: '#006365',
  primarySoft: '#7BD5D7',
  inputFill: '#EEF1FF',
  outline: '#BDC9C8',
  green: '#1FA97A',
  greenPressed: '#17875F',
  coral: '#E4536B',
  amber: '#D97706',
  white: '#FFFFFF',
} as const;

export const fonts = {
  regular: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  mono: 'JetBrainsMono_600SemiBold',
} as const;

export const radius = { sm: 4, md: 12, lg: 16, xl: 24, full: 9999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, margin: 16, gutter: 12 } as const;

/** Soft, cloud-like card elevation (as in the design). */
export const cardShadow = {
  shadowColor: '#2B313D',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const toneColor = { coral: colors.coral, amber: colors.amber, green: colors.green } as const;
