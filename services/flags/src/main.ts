import { loadConfig, runService } from '@logicpath/service-kit';
import { env, flagsService } from './service';

await runService(flagsService(loadConfig(env)));
