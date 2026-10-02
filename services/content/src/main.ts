import { loadConfig, runService } from '@logicpath/service-kit';
import { contentService, env } from './service';

await runService(contentService(loadConfig(env)));
