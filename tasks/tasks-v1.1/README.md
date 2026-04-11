# Takumi Agent Protocol v1.1 — Task Backlog

This folder contains engineering tasks derived from
`agent-api/protocol-updates/protocol_v1.1.md`.

## Filename convention

Same as the parent folder:

```
{NN}_{task_name}_istaken_{true|false}[_isfinish_true].md
```

| State | Filename pattern |
|---|---|
| Not started | `01_foo_istaken_false.md` |
| In progress | `01_foo_istaken_true.md` |
| Finished    | `01_foo_istaken_true_isfinish_true.md` |

## Rollout phases

v1.1 ships in three phases. Phases 1–2 can deploy independently.
**Phase 3 is atomic** — all Phase 3 server and mobile tasks must land in a
single coordinated release.

---

### Phase 1 — Protocol baseline (§1–§10)
*Existing fixes and clarifications. No TakumiPay architecture changes.*

#### Server
| # | File | Title |
|---|---|---|
| 01 | `01_concrete_input_schemas_istaken_false.md` | Concrete `inputSchema` for all mobile tools |
| 02 | `02_wallet_context_refresh_istaken_false.md` | `wallet_context` refresh on existing sessions |
| 03 | `03_session_id_comment_istaken_false.md` | Document server-owned `session_id` + SSE framing example |
| 04 | `04_error_code_enumeration_istaken_false.md` | `ErrorPayload.code` enumeration + `MAX_ITERATIONS` |
| 05 | `05_tool_result_shapes_istaken_false.md` | Canonical `ToolResult.data` shapes + BigInt encoding |

#### Mobile
| # | File | Title |
|---|---|---|
| 06 | `06_retryable_error_button_istaken_false.md` | "Try again" button for retryable SSE errors |
| 07 | `07_session_id_sync_mobile_istaken_false.md` | Sync server-assigned `session_id` from SSE events |
| 08 | `08_chain_id_fallback_mobile_istaken_false.md` | `chain_id` fallback to `wallet_context.chain_id` |

---

### Phase 2 — Token tools (§4)
*Adds `get_wallet_tokens` — unblocks ERC20 symbol resolution.*

| # | File | Title |
|---|---|---|
| 09 | `09_get_wallet_tokens_server_istaken_false.md` | Register `get_wallet_tokens` in `TOOL_REGISTRY` (server) |
| 10 | `10_get_wallet_tokens_mobile_istaken_false.md` | Implement `get_wallet_tokens` executor (mobile) |

---

### Phase 3 — Points & Redemption re-arch (§11–§14) — **ATOMIC**
*Remove server-side TakumiPay MCP tools. Re-add as mobile-executed points tools.*
*Add auth flow (`request_authentication` + `points_authenticated`).*
*Add production safety guards.*

All tasks in this phase must land together. Do not deploy any Phase 3
server task without the matching mobile tasks, or vice versa.

#### Server (ATOMIC)
| # | File | Title |
|---|---|---|
| 11 | `11_remove_server_mcp_takumipay_istaken_false.md` | Remove `executor:server` TakumiPay tools from MCP |
| 12 | `12_points_tool_registry_server_istaken_false.md` | Add 13 points tools + rename `takumipay` → `points` |
| 13 | `13_wallet_context_auth_field_server_istaken_false.md` | `points_authenticated` in `WalletContext` + system prompt |
| 14 | `14_session_logging_audit_server_istaken_false.md` | Audit server logging — session data must never be logged |

#### Mobile (ATOMIC)
| # | File | Title |
|---|---|---|
| 15 | `15_points_read_executors_mobile_istaken_false.md` | 10 points read executor functions |
| 16 | `16_points_write_executors_mobile_istaken_false.md` | `deposit_points` + `execute_redemption` write executors |
| 17 | `17_request_authentication_executor_mobile_istaken_false.md` | `request_authentication` executor + `points_authenticated` context |
| 18 | `18_api_response_sanitization_mobile_istaken_false.md` | `sanitizeApiResponse()` + `classifyPointsError()` utilities |
| 19 | `19_remove_old_takumipay_executors_mobile_istaken_false.md` | Deregister `execute_booking`, `cancel_booking`, `create_purchase` from agent (code kept dormant) |

---

## Source of truth

`agent-api/protocol-updates/protocol_v1.1.md` is the canonical spec.
If anything in these task files disagrees with the protocol doc, the
protocol doc wins. Update the protocol first, then update the task.
