// Runs the app in live mode against the local database (npm run db:start first),
// at http://127.0.0.1:10014. The keys are handed to Vite for this run only;
// nothing is written to disk.
import { spawn } from 'node:child_process'
import { localApi } from './local-db'

const api = localApi()
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '10014', '--strictPort'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: api.url, VITE_SUPABASE_ANON_KEY: api.anonKey },
})
vite.on('exit', (code) => process.exit(code ?? 0))
