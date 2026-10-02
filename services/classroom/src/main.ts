import { loadConfig, runService } from '@logicpath/service-kit';
import { env, classroomService } from './service';

await runService(classroomService(loadConfig(env)));
