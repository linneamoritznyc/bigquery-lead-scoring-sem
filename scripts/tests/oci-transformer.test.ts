import {
  TransformerError,
  formatOciTimestamp,
  passesTierFilter,
  syntheticGclid,
  transformBatch,
  transformRow,
} from '../src/lib/oci-transformer';
import { escapeCell, rowsToCsv } from '../src/lib/csv-writer';
import type { PipelineConfig, ScoredUserRow } from '../src/types';

const baseConfig: PipelineConfig = {
  mode: 'dry-run',
  conversionName: 'Predictive Lead Score - Tier 1',
  conversionCurrency: 'USD',
  conversionValueMultiplier: 1.0,
  minimumTier: 'TIER_1_HIGH_INTENT',
};

function makeRow(overrides: Partial<ScoredUserRow> = {}): ScoredUserRow {
  return {
    fullVisitorId: '1234567890',
    session_count: 3,
    total_pageviews: 40,
    total_minutes_on_site: 12.5,
    unique_products_viewed: 6,
    product_detail_views: 8,
    add_to_cart_events: 3,
    checkout_initiations: 1,
    raw_score: 95.0,
    propensity_score: 87.5,
    score_decile: 10,
    activation_tier: 'TIER_1_HIGH_INTENT',
    last_visit_unixts: 1493078400,
    ...overrides,
  };
}

describe('oci-transformer', () => {
  test('handles empty input', () => {
    const result = transformBatch([], baseConfig);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  test('formats timestamps in OCI date-time format (UTC)', () => {
    expect(formatOciTimestamp(1493078400)).toBe('2017-04-25 00:00:00+00:00');
    expect(() => formatOciTimestamp(0)).toThrow(TransformerError);
    expect(() => formatOciTimestamp(Number.NaN)).toThrow(TransformerError);
    expect(() => formatOciTimestamp(-100)).toThrow(TransformerError);
  });

  test('escapes special characters in CSV cells', () => {
    expect(escapeCell('plain')).toBe('plain');
    expect(escapeCell('with,comma')).toBe('"with,comma"');
    expect(escapeCell('with"quote')).toBe('"with""quote"');
    expect(escapeCell('with\nnewline')).toBe('"with\nnewline"');

    const csv = rowsToCsv([
      {
        'Google Click ID': 'gclid_with,comma',
        'Conversion Name': 'Lead "Score"',
        'Conversion Time': '2017-04-25 00:00:00+00:00',
        'Conversion Value': '87.50',
        'Conversion Currency': 'USD',
      },
    ]);
    expect(csv).toContain('"gclid_with,comma"');
    expect(csv).toContain('"Lead ""Score"""');
  });

  test('applies tier filtering', () => {
    const rows: ScoredUserRow[] = [
      makeRow({ activation_tier: 'TIER_1_HIGH_INTENT', fullVisitorId: 'a' }),
      makeRow({ activation_tier: 'TIER_2_WARM', fullVisitorId: 'b' }),
      makeRow({ activation_tier: 'TIER_4_LOW_SIGNAL', fullVisitorId: 'c' }),
    ];

    const tier1Only = transformBatch(rows, { ...baseConfig, minimumTier: 'TIER_1_HIGH_INTENT' });
    expect(tier1Only.rows).toHaveLength(1);
    expect(tier1Only.skipped).toBe(2);

    const warmAndAbove = transformBatch(rows, { ...baseConfig, minimumTier: 'TIER_2_WARM' });
    expect(warmAndAbove.rows).toHaveLength(2);
    expect(warmAndAbove.skipped).toBe(1);

    expect(passesTierFilter(rows[0]!, 'TIER_2_WARM')).toBe(true);
    expect(passesTierFilter(rows[2]!, 'TIER_1_HIGH_INTENT')).toBe(false);
  });

  test('throws on malformed input', () => {
    expect(() => transformRow(makeRow({ fullVisitorId: '' }), baseConfig)).toThrow(TransformerError);
    expect(() =>
      transformRow(makeRow({ propensity_score: Number.NaN }), baseConfig),
    ).toThrow(TransformerError);
    expect(() =>
      transformRow(makeRow({ propensity_score: 150 }), baseConfig),
    ).toThrow(TransformerError);
    expect(() =>
      transformRow(makeRow({ last_visit_unixts: -1 }), baseConfig),
    ).toThrow(TransformerError);
  });

  test('produces a well-formed OCI row from a valid input', () => {
    const out = transformRow(makeRow(), baseConfig);
    expect(out['Google Click ID']).toBe(syntheticGclid('1234567890'));
    expect(out['Conversion Name']).toBe('Predictive Lead Score - Tier 1');
    expect(out['Conversion Time']).toBe('2017-04-25 00:00:00+00:00');
    expect(out['Conversion Value']).toBe('87.50');
    expect(out['Conversion Currency']).toBe('USD');
  });

  test('counts failed rows without throwing in batch mode', () => {
    const rows: ScoredUserRow[] = [
      makeRow({ fullVisitorId: 'good' }),
      makeRow({ fullVisitorId: '', activation_tier: 'TIER_1_HIGH_INTENT' }),
    ];
    const result = transformBatch(rows, baseConfig);
    expect(result.rows).toHaveLength(1);
    expect(result.failed).toBe(1);
  });
});
