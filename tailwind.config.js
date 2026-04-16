/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/views/**/*.ejs',
    './src/**/*.js',
    './public/js/**/*.js',
  ],
  safelist: ['status-draft', 'status-active', 'status-completed', 'status-archived'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          900: '#172554',
        },
        success: '#15803d',
        warning: '#d97706',
        danger: '#dc2626',
      },
      boxShadow: {
        panel: '0 20px 45px rgba(15, 23, 42, 0.10)',
      },
      fontFamily: {
        sans: ['"Manrope"', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
