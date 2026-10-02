import { loadConfig, runService } from '@logicpath/service-kit';
import { env, leaderboardService } from './service';

await runService(leaderboardService(loadConfig(env)));
