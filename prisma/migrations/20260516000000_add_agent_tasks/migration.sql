-- Multi-agent architecture: AgentTask + AgentPeerMessage tables.
-- Spec: docs/multi-agent-architecture-spec.md §8.2.

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "owner_agent" TEXT NOT NULL,
    "parent_task_id" TEXT,
    "brief" TEXT NOT NULL,
    "input_json" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "output_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_peer_messages" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "from_agent" TEXT NOT NULL,
    "to_agent" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_peer_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_tasks_conversation_id_idx" ON "agent_tasks"("conversation_id");

-- CreateIndex
CREATE INDEX "agent_peer_messages_task_id_idx" ON "agent_peer_messages"("task_id");

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_peer_messages" ADD CONSTRAINT "agent_peer_messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
