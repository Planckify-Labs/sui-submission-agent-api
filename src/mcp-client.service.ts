import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

interface StdioMCPClientConfig {
  command: string;
  args: string[];
}

@Injectable()
export class MCPClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MCPClientService.name);
  private client: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  private config: StdioMCPClientConfig;

  constructor(private configService: ConfigService) {
    this.config = {
      command: this.configService.get<string>('MCP_COMMAND', 'node'),
      args: this.configService.get<string>('MCP_ARGS', 'dist/mcp/server.js').split(','),
    };
  }

  async onModuleInit() {
    await this.connect(this.config);
  }

  async connect(config: StdioMCPClientConfig): Promise<void> {
    try {
      this.logger.log(`Connecting to MCP server: ${config.command} ${config.args.join(' ')}`);
      
      const transport = new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args,
      });

      this.client = await createMCPClient({ transport });
      
      this.logger.log('Successfully connected to MCP server');
    } catch (error) {
      this.logger.error('Failed to connect to MCP server', error);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    await this.close();
  }

  async getTools(): Promise<Record<string, any>> {
    if (!this.client) {
      this.logger.warn('MCP client not connected, returning empty tool set');
      return {};
    }

    try {
      this.logger.log('Retrieving tools from MCP server');
      const tools = await this.client.tools();
      this.logger.log(`Retrieved ${Object.keys(tools).length} tools from MCP server`);
      return tools;
    } catch (error) {
      this.logger.error('Failed to retrieve tools from MCP server', error);
      return {};
    }
  }

  private async close(): Promise<void> {
    if (this.client) {
      try {
        this.logger.log('Closing MCP client connection');
        await this.client.close();
        this.logger.log('MCP client connection closed successfully');
      } catch (error) {
        this.logger.error('Error closing MCP client connection', error);
      } finally {
        this.client = null;
      }
    }
  }
}
