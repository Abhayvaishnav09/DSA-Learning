import { loadConfig, runService } from '@logicpath/service-kit';
import { env, analyticsService } from './service';

await runService(analyticsService(loadConfig(env)));
