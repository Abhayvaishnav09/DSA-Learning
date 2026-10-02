import { loadConfig, runService } from '@logicpath/service-kit';
import { env, identityService } from './service';

await runService(identityService(loadConfig(env)));
