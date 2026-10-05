import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditStore } from './audit.store';

@Module({
  controllers: [AuditController],
  providers: [AuditStore],
  exports: [AuditStore],
})
export class AuditModule {}
