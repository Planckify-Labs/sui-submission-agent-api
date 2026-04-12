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
