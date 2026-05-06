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
  providers: [AppService, ChatService, ApiKeyGuard, MCPClientService],
})
export class AppModule {}
