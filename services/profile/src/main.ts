import { loadConfig, runService } from '@logicpath/service-kit';
import { env, profileService } from './service';

await runService(profileService(loadConfig(env)));
