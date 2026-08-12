import { Client } from 'pg';
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@n8n-clone/workflow';

interface IPostgresCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/** Runs a SQL query once per input item and emits one output item per returned row. Opens a single connection for the whole execute() call rather than one per item — cheaper, and matches how a real workflow run would want to reuse the connection. */
export const postgresNode: INodeType = {
  description: {
    displayName: 'Postgres',
    name: 'postgres',
    icon: 'fa:database',
    group: ['transform'],
    version: 1,
    description: 'Runs a SQL query against a Postgres database',
    defaults: { name: 'Postgres' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'postgresApi', required: true }],
    properties: [
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        default: '',
        required: true,
        typeOptions: { rows: 4 },
        description: 'Runs once per input item — use an expression like ={{ $json.id }} to parameterize it per item',
      },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const credentials = (await this.getCredentials('postgresApi')) as unknown as IPostgresCredentials;

    const client = new Client({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.user,
      password: credentials.password,
      ssl: credentials.ssl || undefined,
    });
    await client.connect();

    try {
      const output: INodeExecutionData[] = [];
      for (let i = 0; i < items.length; i++) {
        const query = this.getNodeParameter('query', i, '') as string;
        const result = await client.query(query);
        for (const row of result.rows as IDataObject[]) {
          output.push({ json: row, pairedItem: { item: i } });
        }
      }
      return [output];
    } finally {
      await client.end();
    }
  },
};
