import { loadDotEnv } from './lib/env.js';
import { loadServices, ConfigError } from './lib/config.js';

loadDotEnv();

try {
  const { warnings } = loadServices();
  for (const warning of warnings) console.warn(`[pulse] WARN ${warning}`);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`[pulse] configuration error: ${err.message}`);
  } else {
    console.error('[pulse] fatal:', err);
  }
  process.exit(1);
}

const { default: app } = await import('./api/index.js');
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`[pulse] listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
