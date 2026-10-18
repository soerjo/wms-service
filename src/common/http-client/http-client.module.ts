import { Global, Module } from '@nestjs/common';
import { InterServiceHttpClient } from './http-client.service.js';

@Global()
@Module({
  providers: [InterServiceHttpClient],
  exports: [InterServiceHttpClient],
})
export class InterServiceHttpClientModule {}
