import { defineConfig } from 'vite';
import pluggy from './plugins/pluggy';

export default defineConfig({
  plugins: [pluggy()],
  resolve: { extensions: ['.pluggy', '.ts', '.js'] },
});
