/**
 * Centralized pipeline configuration.
 *
 * Values here are deliberately conservative defaults intended for the
 * portfolio dry-run. In production they would be sourced from
 * environment variables and validated at startup.
 */

import type { PipelineConfig } from './types';

export const DEFAULT_CONFIG: PipelineConfig = {
  mode: 'dry-run',
  conversionName: 'Predictive Lead Score - Tier 1',
  conversionCurrency: 'USD',
  conversionValueMultiplier: 1.0,
  minimumTier: 'TIER_1_HIGH_INTENT',
};

export function configFromArgs(argv: readonly string[]): PipelineConfig {
  const mode: PipelineConfig['mode'] = argv.includes('--upload') ? 'upload' : 'dry-run';
  return { ...DEFAULT_CONFIG, mode };
}
