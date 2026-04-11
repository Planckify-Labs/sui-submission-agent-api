import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  createToolHandlers,
  takumiPayProductTools,
  exchangeRateTools,
  tokenContractTools,
  type ToolResponse,
} from './tools/index';
import { TakumiPayService, TakumiPayServiceError, createTakumiPayService } from '../takumipay';

const OwnerToolInputSchema = z.object({});

const CalculatorToolInputSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
  a: z.number(),
  b: z.number(),
});

const legacyTools: Tool[] = [
  {
    name: 'owner',
    description: 'Returns the owner name of this system',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'calculator',
    description: 'Performs basic arithmetic operations (add, subtract, multiply, divide)',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide'],
          description: 'The arithmetic operation to perform',
        },
        a: {
          type: 'number',
          description: 'The first number',
        },
        b: {
          type: 'number',
          description: 'The second number',
        },
      },
      required: ['operation', 'a', 'b'],
    },
  },
];

function getAvailableTools(options: { takumiPayAvailable: boolean }): Tool[] {
  const tools: Tool[] = [...legacyTools];

  if (options.takumiPayAvailable) {
    tools.push(...takumiPayProductTools);
    tools.push(...exchangeRateTools);
    tools.push(...tokenContractTools);
  }

  return tools;
}

function handleOwnerTool(): { owner: string } {
  return { owner: 'satriaali' };
}

function handleCalculatorTool(input: z.infer<typeof CalculatorToolInputSchema>): { result: number } {
  const { operation, a, b } = input;

  let result: number;
  switch (operation) {
    case 'add':
      result = a + b;
      break;
    case 'subtract':
      result = a - b;
      break;
    case 'multiply':
      result = a * b;
      break;
    case 'divide':
      if (b === 0) {
        throw new Error('Division by zero is not allowed');
      }
      result = a / b;
      break;
  }

  return { result };
}

function initializeTakumiPayService(): TakumiPayService | null {
  try {
    const service = createTakumiPayService();
    console.error('TakumiPay service initialized successfully');
    return service;
  } catch (error) {
    if (error instanceof TakumiPayServiceError) {
      console.error(`Warning: TakumiPay service not initialized - ${error.message}`);
      console.error('TakumiPay product tools will not be available');
    } else {
      throw error;
    }
  }
  return null;
}


async function main() {
  const takumiPayService = initializeTakumiPayService();

  const tools = getAvailableTools({
    takumiPayAvailable: takumiPayService !== null,
  });

  const allHandlers = createToolHandlers({
    takumiPayService,
  });

  const server = new Server(
    {
      name: 'takumi-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'owner': {
          OwnerToolInputSchema.parse(args || {});
          const result = handleOwnerTool();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        }

        case 'calculator': {
          const validatedInput = CalculatorToolInputSchema.parse(args);
          const result = handleCalculatorTool(validatedInput);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        }
      }

      const handler = allHandlers.get(name);
      if (handler) {
        const result: ToolResponse = await handler(args);
        return result;
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                type: 'validation',
                message: 'Input validation failed',
                details: { errors: error.issues },
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type: 'unknown',
              message: error instanceof Error ? error.message : 'Unknown error occurred',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const takumiPayToolCount = takumiPayService
    ? takumiPayProductTools.length + exchangeRateTools.length + tokenContractTools.length
    : 0;

  console.error('MCP Server running on stdio');
  console.error(
    `Loaded ${tools.length} tools (${legacyTools.length} legacy + ${takumiPayToolCount} takumipay)`,
  );

  if (takumiPayService) {
    console.error('TakumiPay product tools are available');
  } else {
    console.error('WARNING: TakumiPay tools NOT available - TAKUMIPAY_API_KEY not configured');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
