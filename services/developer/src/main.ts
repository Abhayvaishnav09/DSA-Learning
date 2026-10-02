import { loadConfig, runService } from '@logicpath/service-kit';
import { env, developerService } from './service';

await runService(developerService(loadConfig(env)));
