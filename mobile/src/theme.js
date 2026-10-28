import { useColorScheme } from 'react-native'

const light = {
  bg: '#f4f5f7',
  surface: '#ffffff',
  text: '#1c1e21',
  muted: '#6b7280',
  border: '#e3e5e8',
  accent: '#4f46e5',
  accentText: '#ffffff',
  agentBubble: '#ffffff',
  errorBg: '#fdecec',
  errorText: '#b42318',
  online: '#22c55e',
  danger: '#dc2626',
  codeBg: 'rgba(28,30,33,0.07)'
}

const dark = {
  ...light,
  bg: '#0f1115',
  surface: '#171a21',
  text: '#e6e8eb',
  muted: '#9aa1ac',
  border: '#262a33',
  accent: '#6366f1',
  agentBubble: '#1e222b',
  errorBg: '#3a1d1d',
  errorText: '#ffb4ab',
  codeBg: 'rgba(230,232,235,0.1)'
}

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light
}
