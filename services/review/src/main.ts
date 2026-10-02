import { loadConfig, runService } from '@logicpath/service-kit';
import { env, reviewService } from './service';

await runService(reviewService(loadConfig(env)));
