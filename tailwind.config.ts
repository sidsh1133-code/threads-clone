import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: { colors: {
    ink: '#171717', paper: '#FFFFFF', canvas: '#F7F7F5', line: '#E9E9E7',
    accent: '#7357E8', muted: '#858585'
  }, fontFamily: { sans: ['Arial', 'Helvetica', 'sans-serif'] } } },
  plugins: []
};
export default config;
