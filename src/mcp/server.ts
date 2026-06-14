import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createToolHandlers, type ToolResponse } from './tools/index';

/**
 * Bare MCP subprocess template (protocol v1.1 §11).
 *
 * Every off-chain TakumiPay tool that used to live here has been moved
 * to the mobile executor via the `points` registry category. This
 * subprocess now only serves two diagnostic tools (`owner`, `calculator`)
 * so operators can smoke-test the MCP transport without pulling in any
 * domain dependencies.
 */

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

async function main() {
  const tools: Tool[] = [...legacyTools];
  const allHandlers = createToolHandlers();

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

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return Promise.resolve({ tools });
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

  console.error('MCP Server running on stdio');
  console.error(`Loaded ${tools.length} tools (${legacyTools.length} legacy)`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
