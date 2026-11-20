import { useColorScheme } from 'react-native'

const neutral = {
  '000': '#ffffff',
  '050': '#fafbff',
  100: '#f4f6fa',
  200: '#e8ebf1',
  300: '#d8dae5',
  400: '#c1c4d6',
  500: '#8d93b2',
  600: '#696f8c',
  700: '#4d5373',
  800: '#33374d',
  900: '#21253d',
  950: '#181c30'
}

const light = {
  bg: neutral['000'],
  sheet: neutral['050'],
  surface: neutral['000'],
  text: neutral[900],
  muted: neutral[500],
  border: neutral[200],
  accent: '#6849ef',
  accentText: neutral['000'],
  // The spinner's edge dots, and the darker one in the middle.
  dot: neutral[300],
  dotCenter: neutral[400],
  errorBg: '#fdf4f4',
  errorText: '#7d2828',
  online: '#22c55e',
  codeBg: 'rgba(33,37,61,0.07)'
}

const dark = {
  ...light,
  bg: neutral[950],
  sheet: neutral[900],
  surface: neutral[900],
  text: neutral[200],
  border: neutral[800],
  dot: neutral[700],
  dotCenter: neutral[600],
  errorBg: '#3c1010',
  errorText: '#f4b6b6',
  codeBg: 'rgba(232,235,241,0.1)'
}

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light
}
