import { Module } from '@nestjs/common'
import { ConversationService } from './conversation.service'
import { ConversationsController } from './conversations.controller'

@Module({
  controllers: [ConversationsController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class HistoryModule {}
