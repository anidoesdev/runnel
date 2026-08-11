import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestOptions,
  INodeExecutionData,
  INodeType,
  NodeOutput,
} from '@n8n-clone/workflow';

interface INameValue {
  name: string;
  value: string;
}

function collectNameValues(entries: INameValue[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries ?? []) {
    if (entry.name) result[entry.name] = String(entry.value);
  }
  return result;
}

function wrapResponse(body: unknown, itemIndex: number): INodeExecutionData[] {
  if (Array.isArray(body)) {
    return body.map((entry) => ({ json: (entry ?? {}) as IDataObject, pairedItem: { item: itemIndex } }));
  }
  if (body !== null && typeof body === 'object') {
    return [{ json: body as IDataObject, pairedItem: { item: itemIndex } }];
  }
  return [{ json: { data: body } as IDataObject, pairedItem: { item: itemIndex } }];
}

/**
 * httpBasicAuth/httpHeaderAuth/httpQueryAuth are special-cased here (see the credential
 * files for why); everything else — including custom credential types a user registers —
 * goes through the generic declarative `httpRequestWithAuthentication` helper.
 */
async function applyAuthenticationAndSend(
  ctx: IExecuteFunctions,
  authentication: string,
  requestOptions: IHttpRequestOptions,
): Promise<unknown> {
  if (authentication === 'none') {
    return ctx.helpers.httpRequest(requestOptions);
  }
  if (authentication === 'httpBasicAuth') {
    const { user, password } = (await ctx.getCredentials('httpBasicAuth')) as { user: string; password: string };
    const authorized: IHttpRequestOptions = {
      ...requestOptions,
      headers: {
        ...requestOptions.headers,
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
      },
    };
    return ctx.helpers.httpRequest(authorized);
  }
  if (authentication === 'httpHeaderAuth') {
    const { name, value } = (await ctx.getCredentials('httpHeaderAuth')) as { name: string; value: string };
    return ctx.helpers.httpRequest({ ...requestOptions, headers: { ...requestOptions.headers, [name]: value } });
  }
  if (authentication === 'httpQueryAuth') {
    const { name, value } = (await ctx.getCredentials('httpQueryAuth')) as { name: string; value: string };
    return ctx.helpers.httpRequest({ ...requestOptions, qs: { ...requestOptions.qs, [name]: value } });
  }
  return ctx.helpers.httpRequestWithAuthentication(authentication, requestOptions);
}

export const httpRequestNode: INodeType = {
  description: {
    displayName: 'HTTP Request',
    name: 'httpRequest',
    icon: 'fa:at',
    group: ['transform'],
    version: 1,
    description: 'Makes an HTTP request and returns the response',
    defaults: { name: 'HTTP Request' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'httpBasicAuth', displayOptions: { show: { authentication: ['httpBasicAuth'] } } },
      { name: 'httpHeaderAuth', displayOptions: { show: { authentication: ['httpHeaderAuth'] } } },
      { name: 'httpQueryAuth', displayOptions: { show: { authentication: ['httpQueryAuth'] } } },
      { name: 'httpBearerAuth', displayOptions: { show: { authentication: ['httpBearerAuth'] } } },
    ],
    properties: [
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
          { name: 'HEAD', value: 'HEAD' },
        ],
      },
      { displayName: 'URL', name: 'url', type: 'string', default: '', required: true },
      {
        displayName: 'Authentication',
        name: 'authentication',
        type: 'options',
        default: 'none',
        options: [
          { name: 'None', value: 'none' },
          { name: 'Basic Auth', value: 'httpBasicAuth' },
          { name: 'Header Auth', value: 'httpHeaderAuth' },
          { name: 'Query Auth', value: 'httpQueryAuth' },
          { name: 'Bearer Token', value: 'httpBearerAuth' },
        ],
      },
      { displayName: 'Send Query Parameters', name: 'sendQuery', type: 'boolean', default: false },
      {
        displayName: 'Query Parameters',
        name: 'queryParameters',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        displayOptions: { show: { sendQuery: [true] } },
        options: [
          { displayName: 'Name', name: 'name', type: 'string', default: '' },
          { displayName: 'Value', name: 'value', type: 'string', default: '' },
        ],
      },
      { displayName: 'Send Headers', name: 'sendHeaders', type: 'boolean', default: false },
      {
        displayName: 'Header Parameters',
        name: 'headerParameters',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        displayOptions: { show: { sendHeaders: [true] } },
        options: [
          { displayName: 'Name', name: 'name', type: 'string', default: '' },
          { displayName: 'Value', name: 'value', type: 'string', default: '' },
        ],
      },
      { displayName: 'Send Body', name: 'sendBody', type: 'boolean', default: false },
      {
        displayName: 'Body (JSON)',
        name: 'jsonBody',
        type: 'json',
        default: '{}',
        displayOptions: { show: { sendBody: [true] } },
      },
      { displayName: 'Timeout (ms)', name: 'timeout', type: 'number', default: 0 },
      { displayName: 'Follow Redirects', name: 'followRedirect', type: 'boolean', default: true },
      { displayName: 'Max Retries', name: 'maxRetries', type: 'number', default: 0 },
      { displayName: 'Retry Delay (ms)', name: 'retryDelayMs', type: 'number', default: 0 },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const output: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const method = this.getNodeParameter('method', i, 'GET') as string;
      const url = this.getNodeParameter('url', i, '') as string;
      const authentication = this.getNodeParameter('authentication', i, 'none') as string;
      const sendQuery = this.getNodeParameter('sendQuery', i, false) as boolean;
      const sendHeaders = this.getNodeParameter('sendHeaders', i, false) as boolean;
      const sendBody = this.getNodeParameter('sendBody', i, false) as boolean;
      const timeout = this.getNodeParameter('timeout', i, 0) as number;
      const followRedirect = this.getNodeParameter('followRedirect', i, true) as boolean;
      const maxRetries = this.getNodeParameter('maxRetries', i, 0) as number;
      const retryDelayMs = this.getNodeParameter('retryDelayMs', i, 0) as number;

      const qs = sendQuery ? collectNameValues(this.getNodeParameter('queryParameters.values', i, []) as INameValue[]) : undefined;
      const headers = sendHeaders
        ? collectNameValues(this.getNodeParameter('headerParameters.values', i, []) as INameValue[])
        : undefined;

      let body: IDataObject | undefined;
      if (sendBody) {
        const raw = this.getNodeParameter('jsonBody', i, '{}');
        body = typeof raw === 'string' ? (JSON.parse(raw) as IDataObject) : (raw as IDataObject);
      }

      const requestOptions: IHttpRequestOptions = {
        url,
        method,
        qs,
        headers,
        body,
        timeout: timeout > 0 ? timeout : undefined,
        followRedirect,
        retry: maxRetries > 0 ? { maxRetries, retryDelayMs } : undefined,
      };

      const responseBody = await applyAuthenticationAndSend(this, authentication, requestOptions);
      output.push(...wrapResponse(responseBody, i));
    }

    return [output];
  },
};
