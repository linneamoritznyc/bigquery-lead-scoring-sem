/**
 * Thin wrapper around @google-cloud/bigquery.
 *
 * In dev / portfolio mode this class returns the bundled mock fixture
 * so the pipeline runs end-to-end without any GCP credentials. In a
 * production deployment, instantiate the BigQuery client lazily with
 * a service account key path or workload identity, then swap the mock
 * branch for a real `query()` call.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScoredUserRow } from '../types';

export interface BigQueryClientOptions {
  /** Project ID; required in upload mode, ignored in dry-run. */
  projectId?: string;
  /** When true the client returns mock fixtures and never opens a network socket. */
  dryRun: boolean;
}

const MOCK_FIXTURE_PATH = path.resolve(__dirname, '..', 'mocks', 'high-intent-users.json');

export class BigQueryClient {
  private readonly options: BigQueryClientOptions;

  constructor(options: BigQueryClientOptions) {
    this.options = options;
  }

  /**
   * Fetch the Tier 1 high-intent audience produced by
   * sql/03_export_for_oci.sql.
   *
   * Returns an array of ScoredUserRow shaped objects ready to flow
   * into the OCI transformer.
   */
  async fetchHighIntentUsers(): Promise<ScoredUserRow[]> {
    if (this.options.dryRun) {
      return this.readMockFixture();
    }
    return this.queryProductionDataset();
  }

  private readMockFixture(): ScoredUserRow[] {
    const raw = fs.readFileSync(MOCK_FIXTURE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ScoredUserRow[];
    if (!Array.isArray(parsed)) {
      throw new Error(`Mock fixture at ${MOCK_FIXTURE_PATH} is not an array`);
    }
    return parsed;
  }

  /**
   * Production path. Intentionally guarded behind a runtime check so
   * the @google-cloud/bigquery peer dependency stays optional and the
   * portfolio build does not require credentials.
   */
  private async queryProductionDataset(): Promise<ScoredUserRow[]> {
    if (!this.options.projectId) {
      throw new Error('projectId is required when dryRun is false');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BigQuery } = require('@google-cloud/bigquery') as typeof import('@google-cloud/bigquery');
    const client = new BigQuery({ projectId: this.options.projectId });
    const sqlPath = path.resolve(__dirname, '..', '..', '..', 'sql', '03_export_for_oci.sql');
    const query = fs.readFileSync(sqlPath, 'utf-8');
    const [rows] = await client.query({ query, useLegacySql: false });
    return rows as ScoredUserRow[];
  }
}
