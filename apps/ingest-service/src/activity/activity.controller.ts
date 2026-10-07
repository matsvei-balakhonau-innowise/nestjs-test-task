import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityPublisher } from './activity.publisher';

@ApiTags('activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly publisher: ActivityPublisher) {}

  @Post('smoke')
  @ApiOperation({
    summary: 'Emit a sample activity (Streams + TimeSeries smoke test)',
  })
  async smoke() {
    const event = await this.publisher.emit('status.probe', {
      note: 'smoke test from ingest-service',
    });

    return { accepted: true, event };
  }
}
