import { loadConfig, runService } from '@logicpath/service-kit';
import { env, consentService } from './service';

await runService(consentService(loadConfig(env)));
