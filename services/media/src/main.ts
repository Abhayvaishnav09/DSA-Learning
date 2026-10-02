import { loadConfig, runService } from '@logicpath/service-kit';
import { env, mediaService } from './service';

await runService(mediaService(loadConfig(env)));
