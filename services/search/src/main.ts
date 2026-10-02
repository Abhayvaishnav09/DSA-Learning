import { loadConfig, runService } from '@logicpath/service-kit';
import { env, searchService } from './service';

await runService(searchService(loadConfig(env)));
