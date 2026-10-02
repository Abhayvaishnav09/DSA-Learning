import { loadConfig, runService } from '@logicpath/service-kit';
import { env, progressService } from './service';

await runService(progressService(loadConfig(env)));
