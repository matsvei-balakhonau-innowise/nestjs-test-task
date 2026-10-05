import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityPublisher } from './activity.publisher';

@Module({
  controllers: [ActivityController],
  providers: [ActivityPublisher],
  exports: [ActivityPublisher],
})
export class ActivityModule {}
