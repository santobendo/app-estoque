export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
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
