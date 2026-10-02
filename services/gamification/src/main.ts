import { loadConfig, runService } from '@logicpath/service-kit';
import { env, gamificationService } from './service';

await runService(gamificationService(loadConfig(env)));
