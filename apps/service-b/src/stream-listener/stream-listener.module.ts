import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StreamListener } from './stream-listener.service';

@Module({
  imports: [AuditModule],
  providers: [StreamListener],
})
export class StreamListenerModule {}
