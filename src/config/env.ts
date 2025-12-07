// Re-export shared config
import { resolveConfig } from '../shared/config/env.js';

export { parseConfig, resolveConfig, type UnifiedConfig } from '../shared/config/env.js';

export const config = resolveConfig();
