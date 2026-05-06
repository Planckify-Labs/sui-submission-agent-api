import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { AppModule } from './app.module'

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter({
    // Enable streaming support
    bodyLimit: 1024 * 1024, // 1MB
  })

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  )

  // Buffer raw multipart bodies so /chat/transcribe can forward them
  // verbatim to stt.ai without parsing. The 25MB cap covers ~30min of
  // typical voice-memo audio while keeping a hard ceiling well below
  // stt.ai's own 100MB anonymous-tier limit.
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      'multipart/form-data',
      { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 },
      (_req, body, done) => {
        done(null, body)
      },
    )

  // Enable CORS for streaming
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  })

  const port = process.env.PORT ?? 3000
  await app.listen(port, '0.0.0.0')
  console.log(`Server is running on port ${port}`)
}

bootstrap()
