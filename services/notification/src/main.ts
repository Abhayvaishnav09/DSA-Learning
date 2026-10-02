import { loadConfig, runService } from '@logicpath/service-kit';
import { env, notificationService } from './service';

await runService(notificationService(loadConfig(env)));
