import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { MCPClientService } from './mcp-client.service'
import { SessionModule } from './session'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SessionModule,
  ],
  controllers: [AppController, ChatController],
  providers: [AppService, ChatService, ApiKeyGuard, MCPClientService],
})
export class AppModule {}
