import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin path for the planetPositions Lambda: ad blockers block direct
    // fetches to *.lambda-url.on.aws. Prod uses an Amplify 200 rewrite for this path.
    proxy: {
      '/api/planets': {
        target: 'https://5heebnkttig6r4p25tctawd27i0mvoyr.lambda-url.us-west-2.on.aws',
        changeOrigin: true,
        rewrite: () => '/',
      },
    },
  },
})
