import { Test, type TestingModule } from '@nestjs/testing'
import { AppController } from './app.controller'
import { AppService } from './app.service'

describe('AppController.health', () => {
  let controller: AppController

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile()
    controller = moduleRef.get(AppController)
  })

  it('returns status: ok and an ISO timestamp', () => {
    const result = controller.health()
    expect(result.status).toBe('ok')
    expect(typeof result.timestamp).toBe('string')
    // ISO 8601 with milliseconds and trailing Z.
    expect(result.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
    // Round-trips through Date without becoming Invalid Date.
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false)
  })

  it('uses the current time (within a few seconds)', () => {
    const before = Date.now()
    const result = controller.health()
    const after = Date.now()
    const ts = Date.parse(result.timestamp)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})
