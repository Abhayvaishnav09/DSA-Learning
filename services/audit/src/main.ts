import { loadConfig, runService } from '@logicpath/service-kit';
import { env, auditService } from './service';

await runService(auditService(loadConfig(env)));
