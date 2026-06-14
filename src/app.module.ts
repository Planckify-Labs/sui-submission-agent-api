import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { MCPClientService } from './mcp-client.service'
import { SessionModule } from './session'
import { TranscribeController } from './transcribe.controller'
import { ValkeyModule } from './valkey/valkey.module'
import { PrismaModule } from './prisma/prisma.module'
import { HistoryModule } from './history/history.module'
import { X402CatalogService } from './x402/x402-catalog.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SessionModule,
    ValkeyModule,
    PrismaModule,
    HistoryModule,
  ],
  controllers: [AppController, ChatController, TranscribeController],
  providers: [
    AppService,
    ChatService,
    ApiKeyGuard,
    MCPClientService,
    // Warms the DB-backed x402 resource catalog at boot (Part I §5.2).
    X402CatalogService,
  ],
})
export class AppModule {}
