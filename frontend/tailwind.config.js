/** Scan only the HTML entry and JavaScript/JSX source for Tailwind utilities. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
