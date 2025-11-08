import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ApiKeyGuard } from './guards/api-key.guard'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, ChatController],
  providers: [AppService, ChatService, ApiKeyGuard],
})
export class AppModule {}
