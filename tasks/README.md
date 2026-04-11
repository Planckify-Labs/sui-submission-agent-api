# Takumi Agent Protocol — Task Backlog

This folder contains engineering tasks derived from `../AGENT_PROTOCOL.md`.
Each file represents one discrete unit of work from the protocol's
"Implementation Order" (§14).

## Filename convention

```
{NN}_{task_name}_istaken_{true|false}[_isfinish_true].md
```

- `NN` — two-digit sequential task number
- `task_name` — short snake_case label
- `istaken_true` / `istaken_false` — whether an engineer is actively working on it
- `_isfinish_true` — appended as a **postfix** once the task is complete.
  A file without this postfix is not yet finished.

Three possible states:

| State | Filename pattern |
|---|---|
| Not started | `01_tool_registry_istaken_false.md` |
| In progress | `01_tool_registry_istaken_true.md` |
| Finished    | `01_tool_registry_istaken_true_isfinish_true.md` |

## Workflow

1. Browse the tasks, pick one that ends with `istaken_false.md`.
2. Claim it by renaming `istaken_false` → `istaken_true`:
   ```
   git mv 01_tool_registry_istaken_false.md 01_tool_registry_istaken_true.md
   ```
3. Work on the task. Read the referenced sections of `AGENT_PROTOCOL.md` —
   each task file excerpts only the minimum context needed.
4. When the task is complete and merged, append the `_isfinish_true`
   postfix — do NOT flip `istaken` back to `false`:
   ```
   git mv 01_tool_registry_istaken_true.md 01_tool_registry_istaken_true_isfinish_true.md
   ```
   Finished files stay in the folder as a durable record of what shipped.
5. If you abandon a task mid-flight, rename it back to `istaken_false.md`
   (without the `isfinish_true` postfix) so someone else can pick it up.

## Task map

### Server (Agent API)

| # | File | Title |
|---|---|---|
| 01 | `01_tool_registry_istaken_false.md` | Create central `TOOL_REGISTRY` |
| 02 | `02_human_summary_builder_istaken_false.md` | `buildHumanSummary()` for simulate/write tools |
| 03 | `03_session_service_istaken_false.md` | Session store + `awaitMobileResult()` + reconnect buffer |
| 04 | `04_chat_respond_endpoint_istaken_false.md` | `POST /chat/respond` endpoint + SSE reconnect handling |
| 05 | `05_agent_loop_refactor_istaken_false.md` | Refactor `chat.service.ts` into a resumable step-by-step loop |
| 06 | `06_system_prompt_istaken_false.md` | Behavioral constraints + enforced write sequence + wallet context |
| 07 | `07_remove_blockchain_module_istaken_false.md` | Remove `src/blockchain/` (no RPC on server) |
| 08 | `08_remove_internal_blockchain_mcp_istaken_false.md` | Strip blockchain tools from internal MCP, keep TakumiPay |

### Mobile (mobile-app)

| # | File | Title |
|---|---|---|
| 09 | `09_sse_event_handler_istaken_false.md` | SSE event handler + `handleToolPending()` dispatcher |
| 10 | `10_executor_registry_istaken_false.md` | Mobile executor registry for all `executor: "mobile"` tools |
| 11 | `11_permission_grant_store_istaken_false.md` | `PermissionGrantStore` with `resolveGrant()` |
| 12 | `12_resolve_ux_treatment_istaken_false.md` | `resolveUXTreatment()` combining `ApprovalPolicy` + grants |
| 13 | `13_preview_card_component_istaken_false.md` | Preview card with 3s auto-proceed |
| 14 | `14_approval_sheet_component_istaken_false.md` | Approval sheet with grant-duration selector |
| 15 | `15_optimistic_ui_istaken_false.md` | Optimistic pending-tx UI |
| 16 | `16_retry_logic_istaken_false.md` | Retry with exponential backoff for transient failures |
| 17 | `17_settings_screen_istaken_false.md` | Settings screen — view and revoke active grants |

## Source of truth

`../AGENT_PROTOCOL.md` is the canonical spec. These task files are a
projection of it — if anything here disagrees with the protocol doc, the
protocol doc wins. Update the protocol first, then update the task.
