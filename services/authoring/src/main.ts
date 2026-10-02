import { loadConfig, runService } from '@logicpath/service-kit';
import { authoringService, env } from './service';

await runService(authoringService(loadConfig(env)));
