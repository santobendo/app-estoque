export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#F6F5F2',
          card: '#FFFFFF',
          text: '#18161E',
          'text-secondary': '#999999',
          'text-muted': '#666666',
          'text-label': '#AAAAAA',
          border: '#E8E5DE',
          'border-inner': '#F0ECE5',
          'border-dashed': '#DDD8CE',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      height: {
        'screen-minus-4': 'calc(100vh - 1rem)',
      },
      maxHeight: {
        'screen-minus-4': 'calc(100vh - 1rem)',
      },
    },
  },
  plugins: [],
};
