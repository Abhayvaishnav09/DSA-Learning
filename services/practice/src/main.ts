import { loadConfig, runService } from '@logicpath/service-kit';
import { env, practiceService } from './service';

await runService(practiceService(loadConfig(env)));
