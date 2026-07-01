/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07100d',
        lacquer: '#11161f',
        gold: '#d9b45f',
        moss: '#173f35',
        indigoNight: '#101a33',
        rice: '#f7f3e8'
      },
      boxShadow: {
        glow: '0 18px 60px rgba(217,180,95,0.16)'
      }
    }
  },
  plugins: []
};
