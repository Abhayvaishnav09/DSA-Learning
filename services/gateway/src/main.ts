import { loadConfig } from '@logicpath/service-kit';
import { createGateway, env } from './gateway';

const config = loadConfig(env);
const app = await createGateway(config);
await app.listen({ host: config.HOST, port: config.PORT || 8080 });
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}
