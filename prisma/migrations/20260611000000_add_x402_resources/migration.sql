-- x402 paid-resource catalog (x402-extensibility-spec Part I §5.2).
-- DB-backed source of truth for what the agent can buy; env
-- X402_SECURITY_AUDIT_URL becomes a local-dev seed only.

-- CreateTable
CREATE TABLE "x402_resources" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "purpose" TEXT NOT NULL,
    "use_when" TEXT[],
    "expected_max_usdc" DECIMAL(65,30),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "x402_resources_pkey" PRIMARY KEY ("id")
);
