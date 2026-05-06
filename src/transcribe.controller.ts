import {
  BadRequestException,
  Controller,
  HttpException,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiKeyGuard } from './guards/api-key.guard'

const STT_AI_TRANSCRIBE_URL = 'https://api.stt.ai/v1/transcribe'

type TranscribeResponse = {
  text: string
  language?: string
  duration?: number
}

type RawMultipartRequest = {
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

@UseGuards(ApiKeyGuard)
@Controller('chat')
export class TranscribeController {
  private readonly logger = new Logger(TranscribeController.name)

  constructor(private readonly config: ConfigService) {}

  @Post('transcribe')
  async transcribe(
    @Req() req: RawMultipartRequest,
  ): Promise<{ text: string; language?: string; duration?: number }> {
    const sttKey = this.config.get<string>('STT_AI_API_KEY')
    if (!sttKey) {
      throw new HttpException(
        { code: 'stt_not_configured', message: 'STT_AI_API_KEY is not set on the server.' },
        500,
      )
    }

    const rawContentType = req.headers['content-type']
    const contentType = Array.isArray(rawContentType)
      ? rawContentType[0]
      : rawContentType
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      throw new BadRequestException({
        code: 'invalid_content_type',
        message: 'Expected multipart/form-data with a file field.',
      })
    }

    // The raw multipart body is buffered by the per-route content-type
    // parser registered in `main.ts`. We forward it verbatim so stt.ai
    // sees the original boundary and field layout — agent-api never
    // parses or inspects the audio bytes.
    const body = req.body as Buffer | undefined
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException({
        code: 'empty_body',
        message: 'Request body is empty.',
      })
    }

    const upstream = await fetch(STT_AI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sttKey}`,
        'Content-Type': contentType,
      },
      body: body as unknown as BodyInit,
    })

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      this.logger.warn(
        `stt.ai upstream failed status=${upstream.status} bytes=${body.length}`,
      )
      throw new HttpException(
        { code: 'stt_upstream_error', status: upstream.status, detail },
        upstream.status === 429 ? 429 : 502,
      )
    }

    const json = (await upstream.json()) as TranscribeResponse
    if (!json || typeof json.text !== 'string') {
      throw new HttpException(
        { code: 'stt_invalid_response', message: 'Upstream returned no text.' },
        502,
      )
    }

    return { text: json.text, language: json.language, duration: json.duration }
  }
}
